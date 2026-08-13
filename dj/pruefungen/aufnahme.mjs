// Abnahme der lokalen Aufnahmeseite - der Weg, ueber den am Partyabend die
// Bibliothek entsteht.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/aufnahme.mjs
//
// Warum es diese Pruefung gibt: Beim ersten Lauf blieb die Seite *stumm* leer.
// Der Grund war ein relativer Skriptpfad - unter der Kurzadresse /aufnahme,
// also ohne Schraegstrich am Ende, loest ./aufnahme.js auf die Wurzel auf. Die
// Seite kam mit 200 zurueck, sah normal aus und tat nichts. Genau solche
// Fehler faellt am Partyabend niemandem rechtzeitig auf.
//
// Geprueft wird deshalb nicht, ob die Seite laedt, sondern ob am Ende ein
// vollstaendiger Eintrag in der Bibliothek steht.

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
const CHROM = process.env.CHROMIUM_PFAD;
const DJ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MUSIK = path.join(DJ, 'musik');
const BIBLIOTHEK = path.join(DJ, 'bibliothek.json');
const PROBE = 'Pruefstand - Aufnahmeprobe.mp3';

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

// Die vorhandene Bibliothek beiseitelegen - die Seite schreibt sie neu.
let vorher = null;
try {
  vorher = await fs.readFile(BIBLIOTHEK, 'utf8');
} catch {
  // Gibt es noch nicht, auch gut.
}

await fs.mkdir(MUSIK, { recursive: true });
await fs.copyFile(path.join(DJ, 'public', 'probe.mp3'), path.join(MUSIK, PROBE));

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage();
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => {
  if (n.type() === 'error') konsole.push(n.text());
});

try {
  console.log('\nDie Aufnahmeseite findet, was in musik/ liegt:');
  await seite.goto(`${ADRESSE}/aufnahme`, { waitUntil: 'networkidle' });

  const namen = await seite.locator('#liste li .name').allTextContents();
  pruefe('die Probedatei taucht in der Liste auf', namen.includes(PROBE), namen.join(', '));
  pruefe(
    'und der Stand wird angezeigt',
    /\d+ von \d+ vermessen/.test((await seite.locator('#stand').textContent()) ?? ''),
  );

  console.log('\nVermessen und speichern:');
  await seite.locator('#alle').check();
  await seite.locator('#starten').click();
  await seite.waitForFunction(() => !document.getElementById('starten').disabled, {
    timeout: 240000,
  });

  const kasten = seite.locator('#fehler');
  const meldung = (await kasten.isVisible()) ? await kasten.textContent() : '';
  pruefe('kein Fehler auf der Seite', !meldung, meldung ?? '');

  const zustaende = await seite.locator('#liste li .zustand').allTextContents();
  pruefe('die Datei gilt als vermessen', zustaende.includes('vermessen'), zustaende.join(', '));

  const werte = (await seite.locator('#liste li .werte').allTextContents()).join(' | ');
  console.log(`    angezeigt: ${werte}`);
  pruefe('Tempo, Drops und Lautheit stehen da', /BPM/.test(werte) && /LUFS/.test(werte));

  console.log('\nUnd es steht wirklich in der Bibliothek:');
  const geschrieben = JSON.parse(await fs.readFile(BIBLIOTHEK, 'utf8'));
  const eintrag = geschrieben.find((t) => t.datei === PROBE);
  pruefe('der Eintrag ist da', Boolean(eintrag));

  if (eintrag) {
    // Genau die Felder, ohne die die Buehne nicht mischen kann.
    for (const feld of [
      'id',
      'titel',
      'datei',
      'dauer',
      'bpm',
      'raster',
      'einstiegBeat',
      'energie',
      'angleichDb',
      'marken',
      'profil',
      'abschnitte',
    ]) {
      pruefe(`  ${feld} ist gesetzt`, eintrag[feld] !== undefined && eintrag[feld] !== null);
    }

    const karte = eintrag.abschnitte ?? [];
    pruefe('die Tempo-Karte hat mindestens einen Abschnitt', karte.length >= 1);
    pruefe(
      'und ihr erster Abschnitt sagt dasselbe wie bpm/raster',
      karte.length > 0 && Math.abs(karte[0].bpm - eintrag.bpm) < 0.01,
      karte.length > 0 ? `${karte[0].bpm} gegen ${eintrag.bpm}` : '',
    );
    pruefe(
      'jeder Verlaufseintrag bringt seine Beatnummer mit',
      (eintrag.profil ?? []).every((p) => typeof p.t === 'number'),
    );
    console.log(
      `    ${eintrag.bpm} BPM, Raster ${eintrag.raster} s, ${eintrag.profil?.length ?? 0} Takte, ` +
        `${karte.length} Abschnitt(e)`,
    );
  }

  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.join(' | '));
} finally {
  await browser.close();
  await fs.rm(path.join(MUSIK, PROBE), { force: true });
  await fs.rmdir(MUSIK).catch(() => {});
  if (vorher !== null) await fs.writeFile(BIBLIOTHEK, vorher);
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
