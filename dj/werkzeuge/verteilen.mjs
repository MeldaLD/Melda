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

await fs.rm(ZIEL, { recursive: true, force: true });
await fs.cp(path.join(DJ, 'public'), ZIEL, { recursive: true });

// Die Startseite des DJ-Servers zeigt auf /buehne und /p - das sind Adressen,
// die es nur im Serverbetrieb gibt. Unter /dj waere sie irrefuehrend.
await fs.rm(path.join(ZIEL, 'index.html'), { force: true });

const { stdout } = await ausfuehren(
  process.execPath,
  [path.join(DJ, 'werkzeuge', 'einedatei.mjs'), path.join(ZIEL, 'index.html')],
  { cwd: DJ },
);
process.stdout.write(stdout);

const dateien = await zaehlen(ZIEL);
console.log(`public/dj/ enthaelt ${dateien} Dateien – /dj laeuft allein, /dj/gemeinsam/ liegt fuer die Aufnahmeseite bereit.`);

async function zaehlen(ordner) {
  let summe = 0;
  for (const eintrag of await fs.readdir(ordner, { withFileTypes: true })) {
    summe += eintrag.isDirectory() ? await zaehlen(path.join(ordner, eintrag.name)) : 1;
  }
  return summe;
}
