// Abnahme des Loeschens in der Aufnahmeseite.
//
//   ADMIN_PASSWORT=pruef ADMIN_SESSION_SECRET=pruefgeheimnis \
//     npx next start -p 3302 &
//   DJ_ADRESSE=http://localhost:3302 node dj/pruefungen/loeschen.mjs
//
// Warum eigens dafuer eine Pruefung: Loeschen ist der einzige Weg in dieser
// Anwendung, auf dem Daten unwiederbringlich verschwinden. Ein Fehler hier
// faellt nicht durch schlechten Klang auf, sondern dadurch, dass die
// Bibliothek am Partyabend leer ist.
//
// Geprueft wird die Bedienseite, nicht die Datenbank: Die Antworten des
// Servers werden abgefangen und ersetzt. Damit laeuft die Pruefung ohne
// Supabase, und sie prueft genau das, was ich geaendert habe - ob die
// Sicherheitsfrage wirklich zwei Klicks verlangt, ob die richtige Anfrage
// rausgeht und ob die Anzahl mitgeschickt wird.

import { chromium } from 'playwright';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3302';
const PASSWORT = process.env.ADMIN_PASSWORT ?? 'pruef';
const CHROM = process.env.CHROMIUM_PFAD;

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

const browser = await chromium.launch({ ...(CHROM ? { executablePath: CHROM } : {}) });
const seite = await browser.newPage();
seite.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

// Die erfundene Bibliothek, gegen die geprueft wird.
let bestand = [
  { id: 'a-eins', titel: 'Eins', interpret: 'A', bpm: 128, ohneRaster: false },
  { id: 'b-zwei', titel: 'Zwei', interpret: 'B', bpm: 124, ohneRaster: false },
  { id: 'c-drei', titel: 'Drei', interpret: 'C', bpm: 161, ohneRaster: true },
];
const anfragen = [];

try {
  await seite.route('**/api/dj/track', async (weg) => {
    const art = weg.request().method();
    if (art === 'GET') {
      await weg.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tracks: bestand }),
      });
      return;
    }
    if (art === 'DELETE') {
      const rumpf = JSON.parse(weg.request().postData() ?? '{}');
      anfragen.push(rumpf);
      const vorher = bestand.length;
      if (rumpf.alle) bestand = [];
      else bestand = bestand.filter((t) => t.id !== rumpf.id);
      await weg.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ geloescht: vorher - bestand.length, dateien: vorher - bestand.length }),
      });
      return;
    }
    await weg.continue();
  });

  // --- Anmelden ------------------------------------------------------------
  await seite.goto(`${ADRESSE}/admin/login`, { waitUntil: 'domcontentloaded' });
  await seite.fill('input[type="password"]', PASSWORT);
  await seite.click('button[type="submit"]');
  await seite.waitForURL(/\/admin(?!\/login)/, { timeout: 30000 });

  await seite.goto(`${ADRESSE}/admin/dj`, { waitUntil: 'domcontentloaded' });
  await seite.waitForSelector('text=In der Bibliothek', { timeout: 30000 });

  console.log('\nDie Bibliothek wird angezeigt:');
  const zeilen = await seite.locator('li:has-text("–")').count();
  const kopf = await seite.locator('h2:has-text("In der Bibliothek")').textContent();
  console.log(`    "${kopf.trim()}", ${zeilen} Zeilen`);
  pruefe('alle drei Tracks stehen da', /3 Tracks/.test(kopf));
  pruefe(
    'der Track ohne Raster ist als solcher zu sehen',
    (await seite.locator('text=kein Raster').count()) === 1,
  );

  // --- Ein einzelner Track -------------------------------------------------
  console.log('\nEin einzelner Track laesst sich loeschen:');
  await seite.locator('li', { hasText: 'B – Zwei' }).getByRole('button', { name: 'Löschen' }).click();
  await seite.waitForTimeout(700);
  console.log(`    gesendet: ${JSON.stringify(anfragen.at(-1))}`);
  pruefe('die Anfrage nennt genau diesen Track', anfragen.at(-1)?.id === 'b-zwei');
  pruefe('und loescht nicht alles', anfragen.at(-1)?.alle !== true);
  const kopfDanach = await seite.locator('h2:has-text("In der Bibliothek")').textContent();
  pruefe('die Liste wird nachgeladen', /2 Tracks/.test(kopfDanach), kopfDanach.trim());
  pruefe(
    'und es gibt eine Rueckmeldung',
    (await seite.locator('text=gelöscht').count()) > 0,
  );

  // --- Alle, aber nicht mit einem Klick ------------------------------------
  console.log('\nAlles zu loeschen verlangt zwei Klicks:');
  const vorherZahl = anfragen.length;
  await seite.getByRole('button', { name: 'Alle löschen' }).click();
  await seite.waitForTimeout(400);
  pruefe('der erste Klick loescht noch nichts', anfragen.length === vorherZahl);
  pruefe(
    'sondern fragt nach',
    (await seite.locator('text=lässt sich nicht rückgängig machen').count()) > 0,
  );

  console.log('    Abbrechen muss auch gehen:');
  await seite.getByRole('button', { name: 'Abbrechen' }).click();
  await seite.waitForTimeout(300);
  pruefe('nach dem Abbrechen ist die Frage weg', (await seite.locator('text=lässt sich nicht rückgängig machen').count()) === 0);
  pruefe('und immer noch nichts geloescht', anfragen.length === vorherZahl);

  console.log('    Und dann wirklich:');
  await seite.getByRole('button', { name: 'Alle löschen' }).click();
  await seite.waitForTimeout(300);
  await seite.getByRole('button', { name: /Ja, alle 2 löschen/ }).click();
  await seite.waitForTimeout(900);

  const letzte = anfragen.at(-1);
  console.log(`    gesendet: ${JSON.stringify(letzte)}`);
  pruefe('jetzt geht die Anfrage raus', anfragen.length === vorherZahl + 1);
  pruefe('sie loescht alles', letzte?.alle === true);
  // Der Schutz gegen die Anfrage von gestern: Der Server vergleicht die Zahl
  // mit dem, was wirklich da ist, und bricht bei Abweichung ab.
  pruefe('und nennt die Anzahl, die auf dem Schirm stand', letzte?.anzahl === 2, `anzahl=${letzte?.anzahl}`);
  pruefe(
    'danach ist die Bibliothek leer',
    (await seite.locator('text=Noch leer').count()) > 0,
  );
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
