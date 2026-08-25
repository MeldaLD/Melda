// Bringt den DJ dorthin, wo Next.js ihn ausliefert.
//
//   node dj/werkzeuge/verteilen.mjs
//
// Zwei Dinge passieren:
//
//   1. dj/public/ wird nach public/dj/ kopiert. Damit sind die einzelnen
//      Module unter /dj/gemeinsam/... erreichbar - die Aufnahmeseite im
//      Adminbereich braucht genau das, um die Analyse zu laden.
//   2. Darueber wird die Einzeldatei gebaut, die unter /dj laeuft.
//
// Reihenfolge ist wichtig: Der Bau muss zuletzt kommen, sonst ueberschreibt
// die Kopie die fertige Datei mit der Fassung, die noch Module nachlaedt.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ausfuehren = promisify(execFile);
const HIER = path.dirname(fileURLToPath(import.meta.url));
const DJ = path.join(HIER, '..');
const PROJEKT = path.join(DJ, '..');
const ZIEL = path.join(PROJEKT, 'public', 'dj');

/*
 * Was nicht mit ausgeliefert wird.
 *
 * `brille/proben/` enthaelt ein Beispielfoto mit einer erkennbaren Person.
 * Es ist zum Entwickeln und Pruefen da und wird von der Seite selbst nicht
 * gebraucht - auf einer oeffentlich erreichbaren Adresse hat es nichts zu
 * suchen. Der Unterschied zwischen "liegt im Arbeitsordner" und "steht im
 * Netz" ist genau diese Zeile.
 */
const NICHT_AUSLIEFERN = ['brille/proben'];

await fs.rm(ZIEL, { recursive: true, force: true });
await fs.cp(path.join(DJ, 'public'), ZIEL, { recursive: true });
for (const weg of NICHT_AUSLIEFERN) {
  await fs.rm(path.join(ZIEL, ...weg.split('/')), { recursive: true, force: true });
}

// Die Startseite des DJ-Servers zeigt auf /buehne und /p - das sind Adressen,
// die es nur im Serverbetrieb gibt. Unter /dj waere sie irrefuehrend.
await fs.rm(path.join(ZIEL, 'index.html'), { force: true });

const { stdout } = await ausfuehren(
  process.execPath,
  [path.join(DJ, 'werkzeuge', 'einedatei.mjs'), path.join(ZIEL, 'index.html')],
  { cwd: DJ },
);
process.stdout.write(stdout);

/*
 * Nachpruefen, dass der Messstand mitgekommen ist.
 *
 * Er ist die einzige Seite, die *neben* der Einzeldatei stehen bleibt und
 * ihre Module aus /dj/gemeinsam/ nachlaedt. Faellt sie einmal aus der
 * Verteilung, merkt das niemand: Die Buehne laeuft weiter, und der Link
 * dorthin fuehrt ins Leere - genau dann, wenn jemand auf einem fremden
 * Geraet wissen will, was es schafft.
 */
for (const noetig of ['messstand/index.html', 'messstand/messstand.js', 'messstand/messstand.css']) {
  try {
    await fs.access(path.join(ZIEL, noetig));
  } catch {
    console.error(`FEHLT in public/dj/: ${noetig}`);
    process.exit(1);
  }
}

const dateien = await zaehlen(ZIEL);
console.log(
  `public/dj/ enthaelt ${dateien} Dateien – /dj laeuft allein, /dj/gemeinsam/ liegt fuer die ` +
    'Aufnahmeseite bereit, /dj/messstand/index.html ist der Messstand.',
);

async function zaehlen(ordner) {
  let summe = 0;
  for (const eintrag of await fs.readdir(ordner, { withFileTypes: true })) {
    summe += eintrag.isDirectory() ? await zaehlen(path.join(ordner, eintrag.name)) : 1;
  }
  return summe;
}
