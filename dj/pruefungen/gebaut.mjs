// Abnahme der *ausgelieferten* Datei.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/gebaut.mjs
//
// Warum eigens dafuer eine Pruefung: Alle anderen Abnahmen laufen gegen die
// Fassung aus einzelnen Modulen unter /buehne. Ausgeliefert wird aber die
// zusammengebaute Einzeldatei - und genau dort ist einmal die Visualisierung
// verschwunden, weil sie in der Modulliste des Bauwerkzeugs fehlte. Der Code
// war richtig, die Abnahme gruen, und auf dem iPad blieb das Bild schwarz.
//
// Diese Pruefung sieht sich an, was wirklich beim Nutzer ankommt, und stellt
// die einzige Frage, die zaehlt: Kommt Ton heraus, und wird etwas gezeichnet?

import { chromium } from 'playwright';

// Standardmaessig gegen die Next-Anwendung unter /dj - das ist woertlich die
// Adresse, die auf dem iPad im Browser steht.
const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
const SEITE = process.env.DJ_SEITE ?? '/dj';
const CHROM = process.env.CHROMIUM_PFAD;

let misslungen = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) misslungen++;
};

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage({ viewport: { width: 1180, height: 820 } });
// Die Buehne sucht beim Start nach einem Server und nach einer Bibliothek.
// Findet sie keinen, meldet der Browser das als Fehler - gemeint ist damit
// aber nur "gibt es hier nicht", und genau darauf ist die Betriebsart-Wahl
// ausgelegt. Nur unerwartete Fehler zaehlen.
const ERWARTET = /\/api\/(zustand|dj\/track)|Failed to load resource/;

const fehler = [];
seite.on('pageerror', (e) => fehler.push(e.message));
seite.on('console', (n) => {
  if (n.type() !== 'error') return;
  const text = n.text();
  if (!ERWARTET.test(text)) fehler.push(text);
});

try {
  console.log(`\nGebaute Datei ${SEITE}:`);
  await seite.goto(`${ADRESSE}${SEITE}`, { waitUntil: 'networkidle' });

  await seite.click('#startDemo');
  await seite.waitForSelector('#konsole:not([hidden])', { timeout: 120000 });
  await seite.waitForTimeout(4000);

  const pegel = await seite.evaluate(
    () => parseFloat(document.getElementById('pegelBalken').style.width) || 0,
  );
  console.log(`    Ausgangspegel ${pegel.toFixed(1)} %`);
  pruefe('es kommt Ton heraus', pegel > 0);

  // Wird wirklich gezeichnet? Nicht "gibt es eine Leinwand", sondern: Sind
  // Bildpunkte gesetzt, die nicht schwarz sind.
  const bild = await seite.evaluate(() => {
    const leinwand = document.getElementById('visual');
    if (!leinwand) return { fehlt: true };
    const stift = leinwand.getContext('2d');
    const daten = stift.getImageData(0, 0, leinwand.width, leinwand.height).data;

    let hell = 0;
    let summe = 0;
    // Jeden hundertsten Bildpunkt abtasten, das reicht voellig.
    for (let i = 0; i < daten.length; i += 400) {
      const wert = daten[i] + daten[i + 1] + daten[i + 2];
      summe += wert;
      if (wert > 30) hell++;
    }
    const proben = Math.ceil(daten.length / 400);
    return {
      breite: leinwand.width,
      hoehe: leinwand.height,
      anteilHell: hell / proben,
      schnitt: summe / proben,
    };
  });

  if (bild.fehlt) {
    pruefe('die Leinwand ist da', false, 'kein Element #visual');
  } else {
    console.log(
      `    Leinwand ${bild.breite}x${bild.hoehe}, ${(bild.anteilHell * 100).toFixed(1)} % der Punkte nicht schwarz`,
    );
    pruefe('die Leinwand hat eine Groesse', bild.breite > 100 && bild.hoehe > 100);
    pruefe('es wird tatsaechlich etwas gezeichnet', bild.anteilHell > 0.02);
  }

  // Bewegt sich das Bild auch? Ein eingefrorenes Standbild waere kein Fehler,
  // den der Blick auf einen Screenshot findet.
  const bewegung = await seite.evaluate(async () => {
    const leinwand = document.getElementById('visual');
    const stift = leinwand.getContext('2d');
    const nimm = () => stift.getImageData(0, 0, leinwand.width, leinwand.height).data;
    const a = nimm();
    await new Promise((f) => setTimeout(f, 700));
    const b = nimm();
    let anders = 0;
    for (let i = 0; i < a.length; i += 400) if (Math.abs(a[i] - b[i]) > 6) anders++;
    return anders / Math.ceil(a.length / 400);
  });
  console.log(`    ${(bewegung * 100).toFixed(1)} % der Punkte haben sich in 0,7 s geaendert`);
  pruefe('das Bild bewegt sich', bewegung > 0.01);

  // Der Remix-Knopf, und zwar hier in der ausgelieferten Einzeldatei.
  //
  // Die Abnahme unter /buehne prueft ihn schon - aber genau dort lag der
  // Fehler, der einmal durchgerutscht ist: Der Code war richtig, die Abnahme
  // gruen, und in der zusammengebauten Datei fehlte das Modul. Ein Knopf, der
  // nur in der Modulfassung funktioniert, nuetzt am Partyabend nichts.
  const remix = await seite.evaluate(async () => {
    const knopf = document.getElementById('remixJetzt');
    if (!knopf) return { fehlt: true };

    knopf.click();
    await new Promise((f) => setTimeout(f, 2500));

    const welt = window.__dj;
    const vorher = welt.maschine?.zustand().takt;
    await new Promise((f) => setTimeout(f, 2200));
    const nachher = welt.maschine?.zustand().takt;

    return {
      laeuft: welt.maschineLaeuft,
      beschriftung: knopf.textContent.trim(),
      zeileSichtbar: !document.getElementById('maschineZeile').hidden,
      stimmen: welt.maschine?.zustand().stimmen ?? [],
      hochpass: welt.mixer.musikHoch.frequency.value,
      maschinenPegel: welt.mixer.maschinenBus.gain.value,
      vorher,
      nachher,
    };
  });

  if (remix.fehlt) {
    pruefe('der Remix-Knopf ist da', false, 'kein Element #remixJetzt');
  } else {
    console.log(
      `    Remix: Knopf sagt "${remix.beschriftung}", Takt ${remix.vorher} -> ${remix.nachher}, ` +
        `Stimmen ${remix.stimmen.join(' · ') || '—'}`,
    );
    console.log(
      `    Musikhochpass ${Math.round(remix.hochpass)} Hz, Schlagwerkpegel ${remix.maschinenPegel.toFixed(2)}`,
    );
    pruefe('der Knopf wirft das Schlagwerk an', remix.laeuft === true);
    pruefe('der Planer laeuft', remix.nachher > remix.vorher, `Takt ${remix.vorher} -> ${remix.nachher}`);
    pruefe('die Anzeige klappt auf', remix.zeileSichtbar === true);
    pruefe('das Schlagwerk ist hoerbar', remix.maschinenPegel > 0.9);
    pruefe('der Musik ist der Bass genommen', remix.hochpass > 100, `${Math.round(remix.hochpass)} Hz`);
  }

  console.log(fehler.length ? `\nKonsolenfehler:\n  ${fehler.slice(0, 5).join('\n  ')}` : '\nKeine Konsolenfehler.');
  if (fehler.length) misslungen++;
} finally {
  await browser.close();
}

console.log(misslungen === 0 ? '\nAlles gruen.\n' : `\n${misslungen} Abweichung(en).\n`);
process.exit(misslungen === 0 ? 0 : 1);
