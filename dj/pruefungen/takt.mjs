// Abnahme der Timing-Mathematik. Klingen kann ich hier nichts pruefen, rechnen
// schon - und Rechenfehler sind der Grund, warum Uebergaenge "irgendwie
// schlecht" klingen, ohne dass man den Finger drauflegen kann.

import {
  BEATS_PRO_PHRASE,
  beatZeit,
  beatBei,
  naechstePhrase,
  naechsterTakt,
  tempoVerhaeltnis,
  kontextZeitVonBeat,
  stelleInDatei,
} from '../public/gemeinsam/takt.js';

let fehler = 0;
const pruefe = (name, bedingung, hinweis = '') => {
  console.log(`  ${bedingung ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!bedingung) fehler++;
};
const fast = (a, b, genauigkeit = 1e-9) => Math.abs(a - b) < genauigkeit;

// Ein Track mit 128 BPM, dessen erster Downbeat 0,35 s nach Dateianfang liegt.
const track = { bpm: 128, raster: 0.35 };
const beat = 60 / 128; // 0,46875 s

console.log('\nBeats liegen dort, wo sie sollen:');
pruefe('Beat 0 sitzt auf dem Raster', fast(beatZeit(track, 0), 0.35));
pruefe('Beat 1 einen Schlag spaeter', fast(beatZeit(track, 1), 0.35 + beat));
pruefe('Beat 32 eine Phrase spaeter', fast(beatZeit(track, 32), 0.35 + 32 * beat));
pruefe('Hin- und Rueckrechnung stimmen ueberein', fast(beatBei(track, beatZeit(track, 17)), 17));

console.log('\nPhrasengrenzen - der wichtigste Wert beim Mischen:');
const grenzen = [
  [0, 32],
  [0.35, 32],
  [beatZeit(track, 10), 32],
  [beatZeit(track, 31), 64],
  [beatZeit(track, 32), 64],
  [beatZeit(track, 33), 64],
];
for (const [zeit, erwartet] of grenzen) {
  const gefunden = naechstePhrase(track, zeit);
  console.log(`    bei ${zeit.toFixed(2)} s -> Beat ${gefunden}`);
  pruefe(`Grenze nach ${zeit.toFixed(2)} s ist Beat ${erwartet}`, gefunden === erwartet);
}
pruefe(
  'Grenzen liegen immer auf einem Vielfachen von 32',
  [0, 1, 5, 12, 40, 99].every((s) => naechstePhrase(track, s) % BEATS_PRO_PHRASE === 0),
);
pruefe(
  'die Grenze liegt nie in der Vergangenheit',
  [0, 3.7, 12.1, 40].every((s) => beatZeit(track, naechstePhrase(track, s)) > s),
);
pruefe('mit Vorlauf bleibt genug Zeit zum Vorbereiten', beatZeit(track, naechstePhrase(track, beatZeit(track, 31), 2)) - beatZeit(track, 31) > 0.9);

console.log('\nTaktgrenzen fuer den Notfall:');
pruefe('naechster Takt ist ein Vielfaches von 4', naechsterTakt(track, beatZeit(track, 5)) === 8);
pruefe('und liegt vor der naechsten Phrase', naechsterTakt(track, beatZeit(track, 5)) < naechstePhrase(track, beatZeit(track, 5)));

console.log('\nTempoangleich:');
const nah = tempoVerhaeltnis(128, 126);
console.log(`    128 -> 126 BPM: Faktor ${nah.verhaeltnis.toFixed(4)} (${nah.art})`);
pruefe('126 zu 128 wird angeglichen', nah.passt);
pruefe('und zwar mit dem richtigen Faktor', fast(126 * nah.verhaeltnis, 128, 1e-9));

const weit = tempoVerhaeltnis(128, 150);
console.log(`    128 -> 150 BPM: ${weit.passt ? 'angeglichen' : `abgelehnt (${weit.grund})`}`);
pruefe('150 zu 128 wird nicht gezogen', !weit.passt);
pruefe('und der Faktor bleibt neutral', weit.verhaeltnis === 1);

const haelfte = tempoVerhaeltnis(128, 65);
console.log(`    128 -> 65 BPM: ${haelfte.passt ? `angeglichen als ${haelfte.art}` : 'abgelehnt'}`);
pruefe('halbes Tempo wird erkannt', haelfte.passt && haelfte.art === 'halb');
pruefe('65 laeuft dann auf 64 statt auf 128', fast(65 * haelfte.verhaeltnis * 2, 128, 1e-9));

pruefe('genau an der Toleranzgrenze wird noch gezogen', tempoVerhaeltnis(100, 106, 0.06).passt);
pruefe('knapp darueber nicht mehr', !tempoVerhaeltnis(100, 107, 0.06).passt);

console.log('\nEin laufendes Deck weiss, wo es steht:');
// Deck laeuft seit Kontextsekunde 10, gestartet bei 0,35 s in der Datei,
// leicht schneller (Tempo 1,02).
const deck = { track, startZeit: 10, startInDatei: 0.35, tempo: 1.02 };
pruefe('Beat 0 faellt genau beim Start', fast(kontextZeitVonBeat(deck, 0), 10));
pruefe(
  'Beat 32 faellt um das Tempo verkuerzt spaeter',
  fast(kontextZeitVonBeat(deck, 32), 10 + (32 * beat) / 1.02),
);
pruefe(
  'Stelle in der Datei und Kontextzeit passen zusammen',
  fast(stelleInDatei(deck, kontextZeitVonBeat(deck, 24)), beatZeit(track, 24)),
);
pruefe(
  'schnelleres Tempo heisst frueher am Ziel',
  kontextZeitVonBeat({ ...deck, tempo: 1.06 }, 32) < kontextZeitVonBeat(deck, 32),
);

console.log('\nRaster von null und krumme Tempi:');
for (const bpm of [123.7, 174, 90]) {
  const t = { bpm, raster: 0 };
  pruefe(
    `${bpm} BPM: Phrasengrenzen bleiben sauber`,
    fast(beatZeit(t, naechstePhrase(t, 5)) % ((60 / bpm) * BEATS_PRO_PHRASE), 0, 1e-6),
  );
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Pruefung(en) fehlgeschlagen.\n`);
process.exit(fehler === 0 ? 0 : 1);
