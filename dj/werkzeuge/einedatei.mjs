// Baut die Buehne zu einer einzigen HTML-Datei zusammen.
//
//   node werkzeuge/einedatei.mjs
//
// Wozu: Eine Datei laeuft ueberall. Per Doppelklick vom Schreibtisch, als
// Anhang, auf einem iPad ohne Rechner in Reichweite. Kein Server, kein
// Bauwerkzeug, keine Abhaengigkeit - genau die Eigenschaft, die dieses Projekt
// ohnehin durchzieht.
//
// Der Zusammenbau ist bewusst stumpf: Module in Abhaengigkeitsreihenfolge
// aneinanderhaengen, import- und export-Woerter entfernen. Das geht nur, weil
// keine zwei Dateien denselben Namen nach aussen geben - dafuer gibt es unten
// eine Pruefung, damit ein spaeterer Namenskonflikt sofort auffliegt statt
// still das Falsche zu tun.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Reihenfolge ist Abhaengigkeitsreihenfolge, von unten nach oben.
const MODULE = [
  'public/gemeinsam/konfiguration.js',
  'public/gemeinsam/takt.js',
  'public/gemeinsam/zustand.js',
  'public/gemeinsam/auswahl.js',
  'public/gemeinsam/mixer.js',
  'public/gemeinsam/demomusik.js',
  'public/gemeinsam/leitung.js',
  'public/buehne/buehne.js',
];

// Standardziel liegt im Projekt selbst; ein Argument schreibt woandershin -
// zum Beispiel in den public-Ordner einer Next.js-Anwendung, die die Buehne
// unter /dj mit ausliefert.
const ZIEL = process.argv[2] ?? 'public/buehne/allein.html';

const gesehen = new Map();

function entkleiden(quelle, name) {
  const zeilen = quelle.split('\n');
  const behalten = [];
  let inImport = false;

  for (const zeile of zeilen) {
    // Mehrzeilige Importbloecke ueberspringen.
    if (inImport) {
      if (/from\s+['"].*['"];?\s*$/.test(zeile)) inImport = false;
      continue;
    }
    if (/^\s*import\s/.test(zeile)) {
      if (!/from\s+['"].*['"];?\s*$/.test(zeile) && !/^\s*import\s+['"]/.test(zeile)) {
        inImport = true;
      }
      continue;
    }

    // Namenskonflikte finden, bevor sie stillschweigend schaden. Geprueft
    // werden *alle* Deklarationen auf oberster Ebene, nicht nur die
    // exportierten: Genau daran ist dieser Bau beim ersten Versuch
    // gescheitert - zwei Dateien hatten dieselbe Konstante, eine davon nur
    // fuer sich selbst.
    const treffer = /^(?:export\s+)?(?:async\s+)?(function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(zeile);
    if (treffer) {
      const bezeichner = treffer[2];
      if (gesehen.has(bezeichner)) {
        throw new Error(
          `Namenskonflikt: "${bezeichner}" kommt in ${gesehen.get(bezeichner)} und in ${name} vor. ` +
            'In einer Datei koennen nicht beide stehen - einen davon umbenennen.',
        );
      }
      gesehen.set(bezeichner, name);
    }

    behalten.push(zeile.replace(/^(\s*)export\s+(?!\{)/, '$1'));
  }

  return behalten.join('\n');
}

const teile = [];
for (const modul of MODULE) {
  const quelle = await fs.readFile(path.join(WURZEL, modul), 'utf8');
  teile.push(`// ===== ${modul} =====\n${entkleiden(quelle, modul)}`);
}

const html = await fs.readFile(path.join(WURZEL, 'public/buehne/index.html'), 'utf8');
const css = await fs.readFile(path.join(WURZEL, 'public/buehne/buehne.css'), 'utf8');

const fertig = html
  .replace('<link rel="stylesheet" href="/buehne/buehne.css" />', `<style>\n${css}\n</style>`)
  .replace(
    '<script type="module" src="/buehne/buehne.js"></script>',
    `<script type="module">\n${teile.join('\n\n')}\n</script>`,
  )
  // Das Symbol als Datei gibt es hier nicht - inline einbetten.
  .replace(
    '<link rel="icon" href="/favicon.svg" />',
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'7\' fill=\'%230a0a0f\'/%3E%3Ctext x=\'16\' y=\'23\' font-size=\'19\' text-anchor=\'middle\'%3E🎧%3C/text%3E%3C/svg%3E" />',
  );

await fs.writeFile(path.resolve(WURZEL, ZIEL), fertig);

const groesse = (fertig.length / 1024).toFixed(0);
console.log(`${ZIEL} geschrieben – ${groesse} kB, ${MODULE.length} Module, keine Abhaengigkeiten.`);
