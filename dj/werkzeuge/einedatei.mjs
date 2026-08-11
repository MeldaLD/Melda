// Baut die Buehne zu einer einzigen HTML-Datei zusammen.
//
//   node werkzeuge/einedatei.mjs [zieldatei]
//
// Wozu: Eine Datei laeuft ueberall. Als statische Seite auf Vercel, per
// Doppelklick vom Schreibtisch, als Anhang. Kein Server, kein Bauwerkzeug,
// keine Abhaengigkeit - genau die Eigenschaft, die dieses Projekt durchzieht.
//
// Die Reihenfolge der Module wird aus ihren Importen hergeleitet und **nicht**
// von Hand gepflegt. Eine handgeschriebene Liste hat genau einmal gefehlt -
// visual.js stand nicht drin, die gebaute Datei rief eine Klasse auf, die es
// dort nicht gab, und auf dem iPad blieb das Bild schwarz. Solche Fehler soll
// dieses Werkzeug nicht mehr zulassen koennen.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EINSTIEG = 'public/buehne/buehne.js';
const ZIEL = process.argv[2] ?? 'public/buehne/allein.html';

// --- Module in Abhaengigkeitsreihenfolge sammeln --------------------------

const geladen = new Map();
const reihenfolge = [];

async function einlesen(relativ) {
  if (geladen.has(relativ)) return;
  geladen.set(relativ, true);

  const quelle = await fs.readFile(path.join(WURZEL, relativ), 'utf8');

  // Erst alles einlesen, was diese Datei braucht - dann sie selbst. So steht
  // jedes Modul vor dem, das es benutzt.
  for (const treffer of quelle.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const ziel = path.normalize(path.join(path.dirname(relativ), treffer[1]));
    await einlesen(ziel);
  }

  reihenfolge.push({ name: relativ, quelle });
}

await einlesen(EINSTIEG);

// --- Import und Export entfernen ------------------------------------------

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
    // exportierten: Genau daran ist dieser Bau einmal gescheitert - zwei
    // Dateien hatten dieselbe Konstante, eine davon nur fuer sich selbst.
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

const teile = reihenfolge.map(
  ({ name, quelle }) => `// ===== ${name} =====\n${entkleiden(quelle, name)}`,
);

// --- Zusammensetzen -------------------------------------------------------

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

// --- Gegenprobe -----------------------------------------------------------
//
// Billige Absicherung gegen genau den Fehler von vorhin: Wird ein grosses
// Wort mit `new` aufgerufen, muss es auch definiert sein.

// Was der Browser mitbringt und Node nicht kennt - alles Uebrige beantwortet
// globalThis von selbst, statt dass hier eine Liste veraltet.
const IM_BROWSER = new Set([
  'AudioContext', 'webkitAudioContext', 'OfflineAudioContext', 'EventSource',
  'XMLHttpRequest', 'Image', 'Audio', 'FileReader', 'Worker', 'ResizeObserver',
]);

for (const treffer of fertig.matchAll(/new\s+([A-Z][\w$]*)\s*\(/g)) {
  const klasse = treffer[1];
  if (IM_BROWSER.has(klasse) || typeof globalThis[klasse] !== 'undefined') continue;
  if (!gesehen.has(klasse)) {
    throw new Error(
      `"${klasse}" wird mit new aufgerufen, ist aber in keinem eingebundenen Modul definiert. ` +
        `Fehlt ein Import in ${EINSTIEG}?`,
    );
  }
}

await fs.writeFile(path.resolve(WURZEL, ZIEL), fertig);

const groesse = (fertig.length / 1024).toFixed(0);
console.log(
  `${ZIEL} geschrieben – ${groesse} kB, ${reihenfolge.length} Module ` +
    `(${reihenfolge.map((m) => path.basename(m.name)).join(', ')})`,
);
