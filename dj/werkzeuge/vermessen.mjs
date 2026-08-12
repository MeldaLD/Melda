// Eine echte Audiodatei durch dieselbe Vermessung schicken, die auch die
// Aufnahmeseite benutzt - und zwar im Browser, damit es wirklich derselbe
// Code ist und nicht eine Nachbildung davon.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/werkzeuge/vermessen.mjs datei.mp3
//
// Gedacht fuer die Frage "warum sagt er bei diesem Stueck Unsinn?". Gibt
// alles aus, was analysiere() findet, nicht nur das Tempo.

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3200';
const CHROM = process.env.CHROMIUM_PFAD;
const dateien = process.argv.slice(2);

if (dateien.length === 0) {
  console.error('Bitte mindestens eine Audiodatei angeben.');
  process.exit(1);
}

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage();
seite.on('console', (m) => {
  if (m.type() === 'error') console.log(`[browser] ${m.text()}`);
});

try {
  await seite.goto(`${ADRESSE}/`, { waitUntil: 'domcontentloaded' });

  for (const datei of dateien) {
    const rohdaten = await fs.readFile(datei);
    console.log(`\n=== ${path.basename(datei)} (${(rohdaten.length / 1e6).toFixed(1)} MB) ===`);

    const befund = await seite.evaluate(async (bytes) => {
      const { analysiere } = await import('/gemeinsam/analyse.js');
      const roh = new Uint8Array(bytes).buffer;

      // Wie auf der Aufnahmeseite: mit halber Abtastrate dekodieren, sonst
      // sprengt ein Fuenfminueter auf dem iPad den Speicher.
      const ctx = new OfflineAudioContext(1, 1, 22050);
      const puffer = await ctx.decodeAudioData(roh);
      const begonnen = performance.now();
      const ergebnis = await analysiere(puffer);
      return { ...ergebnis, rechenzeit: Math.round(performance.now() - begonnen) };
    }, Array.from(rohdaten));

    const { marken, raster, ...rest } = befund;
    for (const [name, wert] of Object.entries(rest)) {
      console.log(`  ${name.padEnd(16)} ${typeof wert === 'number' ? Number(wert.toFixed(4)) : JSON.stringify(wert)}`);
    }
    console.log(`  ${'raster'.padEnd(16)} ${raster?.toFixed(4)} s`);
    console.log(`  ${'marken'.padEnd(16)} ${marken?.map((m) => `${m.name}@${m.beat}`).join(', ') || 'keine'}`);
  }
} finally {
  await browser.close();
}
