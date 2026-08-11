// Abnahme fuer den DJ-Kopf: tut die Auswahl, was sie soll?
//
// Kein Testframework - `node pruefungen/auswahl.mjs` und die Ausgabe lesen.
// Bei allem Klanglichen ist ohnehin der Mensch mit Kopfhoerern die Abnahme;
// hier geht es nur um das, was sich in Zahlen pruefen laesst.

import { zielenergie } from '../public/gemeinsam/konfiguration.js';
import { naechsterTrack, benoetigteEnergie } from '../public/gemeinsam/auswahl.js';
import { zustand, wunschEintragen, aktuelleZielenergie } from '../public/gemeinsam/zustand.js';

let fehler = 0;
const pruefe = (name, bedingung, hinweis = '') => {
  console.log(`  ${bedingung ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!bedingung) fehler++;
};

// Eine Testbibliothek mit gleichmaessig verteilter Energie.
const bibliothek = Array.from({ length: 40 }, (_, i) => ({
  id: `t${i}`,
  titel: `Track ${i}`,
  interpret: 'Test',
  bpm: 120 + (i % 12),
  energie: i / 39,
}));

const zuruecksetzen = (ziel) => {
  zustand.handEnergie = ziel;
  zustand.gespielt = [];
  zustand.wuensche.clear();
  zustand.richtungen = [];
  zustand.seitLetztemWunsch = 0;
};

// --- 1. Energiekurve ------------------------------------------------------

console.log('\nEnergiekurve steigt zum Abend hin und faellt danach:');
const kurve = ['20:00', '22:00', '24:00', '25:30', '27:00'].map((zeit) => {
  const [h, m] = zeit.split(':').map(Number);
  return { zeit, wert: zielenergie(h * 60 + m) };
});
for (const punkt of kurve) console.log(`    ${punkt.zeit}  ${punkt.wert.toFixed(2)}`);
pruefe('steigt bis zum Hoehepunkt', kurve[0].wert < kurve[1].wert && kurve[1].wert < kurve[3].wert);
pruefe('faellt danach wieder', kurve[4].wert < kurve[3].wert);

// --- 2. Die Auswahl folgt der Zielenergie ---------------------------------

console.log('\nAuswahl trifft die Zielenergie:');
for (const ziel of [0.15, 0.5, 0.9]) {
  zuruecksetzen(ziel);
  const energien = [];
  for (let n = 0; n < 5; n++) {
    const wahl = naechsterTrack(bibliothek, 128);
    energien.push(wahl.track.energie);
    zustand.gespielt.push(wahl.track.id);
  }
  const schnitt = energien.reduce((a, b) => a + b, 0) / energien.length;
  console.log(`    Ziel ${ziel.toFixed(2)} -> Schnitt ${schnitt.toFixed(2)}`);
  pruefe(`Ziel ${ziel} wird auf 0.2 genau getroffen`, Math.abs(schnitt - ziel) < 0.2);
}

// --- 3. Nichts wiederholt sich zu frueh -----------------------------------

console.log('\nKeine Wiederholung, solange die Bibliothek reicht:');
zuruecksetzen(0.5);
const gespielt = [];
for (let n = 0; n < 25; n++) {
  const wahl = naechsterTrack(bibliothek, 128);
  gespielt.push(wahl.track.id);
  zustand.gespielt.push(wahl.track.id);
}
pruefe('25 Tracks ohne Doppelung', new Set(gespielt).size === 25);

// --- 4. Die Wunsch-Sperre haelt -------------------------------------------

console.log('\nHoechstens jeder dritte Track ist ein Gaestewunsch:');
zuruecksetzen(0.5);
for (let i = 0; i < 20; i++) wunschEintragen(`t${i}`, `geraet${i}`);
const gruende = [];
for (let n = 0; n < 12; n++) {
  const wahl = naechsterTrack(bibliothek, 128);
  gruende.push(wahl.grund);
  zustand.gespielt.push(wahl.track.id);
}
console.log(`    ${gruende.map((g) => (g === 'wunsch' ? 'W' : '.')).join('')}`);
const wunschAnteil = gruende.filter((g) => g === 'wunsch').length / gruende.length;
pruefe('Wunschanteil bleibt bei hoechstens einem Drittel', wunschAnteil <= 1 / 3 + 0.01);
pruefe('Wuensche kommen ueberhaupt dran', wunschAnteil > 0);

// --- 5. Die Gaeste verbiegen die Kurve, uebernehmen sie aber nicht --------

console.log('\nStimmen verschieben die Zielenergie begrenzt:');
zustand.handEnergie = null;
zustand.richtungen = [];
const ohne = aktuelleZielenergie();
for (let i = 0; i < 30; i++) {
  zustand.richtungen.push({ geraetId: `g${i}`, richtung: 'haerter', zeit: Date.now() });
}
const mit = aktuelleZielenergie();
console.log(`    ohne Stimmen ${ohne.toFixed(2)}  ->  30x haerter ${mit.toFixed(2)}`);
pruefe('Stimmen wirken', mit > ohne || ohne >= 1);
pruefe('aber hoechstens um 0.15', mit - ohne <= 0.1501);

// --- 6. Es kommt immer etwas zurueck --------------------------------------

console.log('\nStille ist unmoeglich:');
zuruecksetzen(0.5);
// Alles schon gespielt: die Sperre muss fallen, statt nichts zu liefern.
zustand.gespielt = bibliothek.map((t) => t.id);
pruefe('auch bei komplett gesperrter Bibliothek kommt ein Track', !!naechsterTrack(bibliothek, 128)?.track);
pruefe('leere Bibliothek liefert sauber null', naechsterTrack([], 128) === null);

// --- 7. Schwaechere Aufnahmen laufen nur im lauten Raum -------------------

console.log('\nKlangqualitaet steuert, wann ein Track laufen darf:');
for (const note of [0.9, 0.7, 0.5, 0.35]) {
  console.log(`    Note ${note.toFixed(2)} -> ab Zielenergie ${benoetigteEnergie(note).toFixed(2)}`);
}
pruefe('einwandfreie Aufnahmen laufen immer', benoetigteEnergie(0.9) === 0);
pruefe('schwache Aufnahmen brauchen einen lauten Raum', benoetigteEnergie(0.35) > 0.7);
pruefe('unvermessene Tracks werden nicht ausgesperrt', benoetigteEnergie(undefined) < 0.2);

// Halb gute, halb dumpfe Bibliothek.
const gemischt = Array.from({ length: 40 }, (_, i) => ({
  id: `m${i}`,
  titel: `Track ${i}`,
  interpret: 'Test',
  bpm: 126,
  energie: 0.5,
  note: i % 2 === 0 ? 0.95 : 0.4,
}));

zuruecksetzen(0.2);
const frueh = [];
for (let n = 0; n < 10; n++) {
  const wahl = naechsterTrack(gemischt, 126);
  frueh.push(wahl.track.note);
  zustand.gespielt.push(wahl.track.id);
}
pruefe('frueh am Abend laeuft nur einwandfreies Material', frueh.every((n) => n === 0.95));

// Solange einwandfreies Material da ist, wird es auch bevorzugt - das ist
// gewollt. Das schwaechere kommt erst, wenn das gute aufgebraucht ist. Also
// mehr Tracks ziehen, als es gute gibt (20).
zuruecksetzen(0.9);
const spaet = [];
for (let n = 0; n < 30; n++) {
  const wahl = naechsterTrack(gemischt, 126);
  spaet.push(wahl.track.note);
  zustand.gespielt.push(wahl.track.id);
}
pruefe('spaet springt das schwaechere Material ein', spaet.some((n) => n === 0.4));
pruefe('und zwar erst hinten heraus', spaet.slice(0, 15).every((n) => n === 0.95));

// Frueh am Abend passiert das nicht: da wird lieber wiederholt als gedumpft.
zuruecksetzen(0.2);
const frueh30 = [];
for (let n = 0; n < 30; n++) {
  const wahl = naechsterTrack(gemischt, 126);
  frueh30.push(wahl.track.note);
  zustand.gespielt.push(wahl.track.id);
}
pruefe('frueh bleibt es auch dann sauber, wenn das gute knapp wird', frueh30.every((n) => n === 0.95));

// Ein dumpfer Wunsch wird nicht abgelehnt, sondern vertagt.
zuruecksetzen(0.2);
wunschEintragen('m1', 'geraetX'); // Note 0.4
const frueherWunsch = [];
for (let n = 0; n < 6; n++) {
  const wahl = naechsterTrack(gemischt, 126);
  frueherWunsch.push(wahl.track.id);
  zustand.gespielt.push(wahl.track.id);
}
pruefe('dumpfer Wunsch laeuft frueh noch nicht', !frueherWunsch.includes('m1'));

zustand.handEnergie = 0.9;
zustand.gespielt = [];
zustand.seitLetztemWunsch = 99;
pruefe('derselbe Wunsch kommt spaeter dran', naechsterTrack(gemischt, 126).track.id === 'm1');

// Und auch wenn alles dumpf ist, bleibt es nicht still.
zuruecksetzen(0.1);
const nurDumpf = gemischt.map((t) => ({ ...t, note: 0.4 }));
pruefe('nur schwaches Material heisst trotzdem Musik', !!naechsterTrack(nurDumpf, 126)?.track);

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Pruefung(en) fehlgeschlagen.\n`);
process.exit(fehler === 0 ? 0 : 1);
