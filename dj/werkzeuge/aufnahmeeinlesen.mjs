// Eine echte Aufnahme einlesen und alles darueber sagen, was zu sagen ist.
//
//   npm run dj:aufnahme dj/aufnahmen/01-grundgroove
//   npm run dj:aufnahme dj/aufnahmen/01-grundgroove/datei.bvh
//
// Dieses Werkzeug ist die Stelle, an der der Pruefstand aufhoert und die
// Wirklichkeit anfaengt. Alles, was `pruefungen/bewegung.mjs` gegen den
// synthetischen Taenzer misst, ist dort gruen - aber acht Annahmen ueber
// *echte* Dateien konnte bisher niemand pruefen. Sie stehen als R1 bis R8 in
// BEWEGUNGSPLAN.md, und dieses Werkzeug arbeitet sie ab, soweit sich das
// automatisch machen laesst.
//
// Es aendert nichts und schreibt nichts, solange man es nicht darum bittet.
// Ein Werkzeug, das beim ersten Blick auf eine unbekannte Datei gleich Dateien
// erzeugt, macht die Fehlersuche schwerer statt leichter.

import fs from 'node:fs/promises';
import path from 'node:path';
import { bvhLesen, vorwaerts, gelenkeZuordnen, GESUCHT } from './bvh.mjs';
import { einlesen, umrechnen, glaetten, KNOCHEN, PROBEN_JE_SCHLAG } from './bewegung.mjs';

const ziel = process.argv[2];
if (!ziel) {
  console.error('Aufruf: npm run dj:aufnahme <ordner-oder-bvh-datei> [-- --schreiben]');
  process.exit(2);
}
const schreiben = process.argv.includes('--schreiben');
const bpm = Number(process.argv.find((a) => a.startsWith('--bpm='))?.slice(6) ?? 124);
const spiegelWunsch = process.argv.includes('--spiegeln') ? true
  : process.argv.includes('--nicht-spiegeln') ? false : null;

/* --- Die Datei finden ------------------------------------------------------
 *
 * Im ZIP von DeepMotion liegen zwei BVH-Dateien, und eine davon hat eine
 * eingeschobene T-Pose bei Sekunde null. Die ist fuer die Knochenlaengen
 * nuetzlich und fuer die Zeitachse Gift: Bild 0 waere dann keine echte
 * Bewegung, und der erste Tipper saesse ein Bild daneben. Sie wird deshalb
 * hier ausdruecklich uebergangen - und nicht dem Zufall der Sortierung
 * ueberlassen.
 */
async function bvhFinden(ort) {
  const stat = await fs.stat(ort);
  if (stat.isFile()) return ort;
  const dateien = (await fs.readdir(ort)).filter((d) => d.toLowerCase().endsWith('.bvh'));
  if (!dateien.length) throw new Error(`Keine .bvh in ${ort}`);
  const ohneT = dateien.filter((d) => !/tpose/i.test(d));
  if (!ohneT.length) {
    console.log('  ! Nur eine Fassung mit T-Pose gefunden. Die hat bei Sekunde 0 eine');
    console.log('    eingeschobene Pose - die Zeitachse kann dadurch um ein Bild verschoben sein.');
    return path.join(ort, dateien[0]);
  }
  if (dateien.length > ohneT.length) console.log('  · T-Pose-Fassung uebergangen, wie vorgesehen.');
  return path.join(ort, ohneT[0]);
}

const datei = await bvhFinden(ziel);
const text = await fs.readFile(datei, 'utf8');
console.log(`\n=== ${path.relative(process.cwd(), datei)} · ${(text.length / 1024).toFixed(0)} kB ===`);

/* --- R1: Wie heissen die Gelenke? ----------------------------------------- */

const skelett = bvhLesen(text);
const zu = gelenkeZuordnen(skelett);
console.log(`\nSkelett: ${skelett.gelenke.length} Knoten, ${skelett.bilder.length} Bilder, ` +
  `${(skelett.bilder.length * skelett.bildDauer).toFixed(2)} s bei ${(1 / skelett.bildDauer).toFixed(1)} Bildern/s`);
console.log(`Drehreihenfolge der Wurzel: ${skelett.gelenke[0].kanaele.join(' ')}`);

console.log('\nR1 · Gelenkzuordnung:');
const fehlend = [];
for (const wunsch of Object.keys(GESUCHT)) {
  if (zu[wunsch] === undefined) { fehlend.push(wunsch); console.log(`  FEHLT ${wunsch}`); }
  else console.log(`  ${wunsch.padEnd(11)} ${skelett.gelenke[zu[wunsch]].name}`);
}
if (fehlend.length) {
  console.log('\n  Nicht gefunden. Alle Knochennamen der Datei:');
  console.log('  ' + skelett.gelenke.filter((g) => !g.spitze).map((g) => g.name).join(', '));
  console.log('\n  Behebung: die Namen in GESUCHT in werkzeuge/bvh.mjs ergaenzen.');
  process.exit(1);
}

/* --- Die Knochenlaengen, aus dem Ruhezustand ------------------------------ */

const stellen = skelett.bilder.map((b) => vorwaerts(skelett, b));
const laenge = (a, b) => {
  let s = 0;
  for (const w of stellen) s += Math.hypot(...w[zu[b]].p.map((v, k) => v - w[zu[a]].p[k]));
  return s / stellen.length;
};
console.log('\nKnochenlaengen der aufgenommenen Person:');
const masse = {};
for (const [name, von, nach] of KNOCHEN) {
  masse[name] = laenge(von, nach);
  console.log(`  ${name.padEnd(11)} ${masse[name].toFixed(1)}`);
}
const schulterBreite = laenge('schulterL', 'schulterR');
console.log(`  ${'schultern'.padEnd(11)} ${schulterBreite.toFixed(1)}`);
/*
 * Ein Streuungsmass je Knochen. Ein Knochen, dessen Laenge im Lauf der
 * Aufnahme schwankt, ist ein Loeser, der sich nicht sicher war - und ein
 * frueher Hinweis auf einen schlechten Solve (R8).
 */
console.log('\nR8 · Wie fest sitzen die Knochen? (schwankende Laenge = unsicherer Solve)');
let schlimmsteStreuung = 0;
for (const [name, von, nach] of KNOCHEN) {
  const l = stellen.map((w) => Math.hypot(...w[zu[nach]].p.map((v, k) => v - w[zu[von]].p[k])));
  const m = l.reduce((a, b) => a + b, 0) / l.length;
  const s = Math.sqrt(l.reduce((a, b) => a + (b - m) ** 2, 0) / l.length);
  const anteil = (s / m) * 100;
  schlimmsteStreuung = Math.max(schlimmsteStreuung, anteil);
  console.log(`  ${name.padEnd(11)} ${anteil.toFixed(2)} % Streuung${anteil > 3 ? '   <-- auffaellig' : ''}`);
}

/* --- R3: Vorn oder hinten? ------------------------------------------------ */

const spur = glaetten(umrechnen(skelett, zu, { spiegeln: spiegelWunsch }), skelett.bildDauer);
console.log(`\nR3 · Spiegelung: ${spur.spiegeln ? 'ja' : 'nein'}` +
  `${spiegelWunsch === null ? ' (aus den Daten abgeleitet)' : ' (von Hand vorgegeben)'}`);
console.log('     Zum Umkehren: --spiegeln bzw. --nicht-spiegeln.');
console.log('     Sicher sagen kann das nur ein Blick aufs Standbild: Was rechts');
console.log('     passiert, muss auch rechts erscheinen.');

/* --- R2 und das Raster ---------------------------------------------------- */

let ergebnis;
try {
  ergebnis = einlesen(text, { bpm, spiegeln: spiegelWunsch });
} catch (e) {
  console.log(`\nR2 · Einlesen fehlgeschlagen: ${e.message}`);
  process.exit(1);
}
const m = ergebnis.messwerte;
console.log('\nR2 · Der Einzaehltakt:');
console.log(`  erster Tipper      ${(m.tipperZeit * 1000).toFixed(0)} ms, mit der ${m.tipperHand === 'rechts' ? 'rechten' : 'linken'} Hand`);
console.log(`  Streuung der vier  ${(m.tipperStreuung * 1000).toFixed(1)} ms`);
console.log(`  gemessenes Tempo   ${m.gemessenBpm.toFixed(2)} BPM (${(m.tempoAbweichung * 100).toFixed(1)} % neben ${bpm})`);
console.log(`  benutztes Tempo    ${m.bpm.toFixed(2)} BPM${m.tempoAusMessung ? '  <-- aus der Messung, das Video laeuft falsch' : ''}`);
/*
 * Die Streuung der vier Tipper um ihre Ausgleichsgerade ist das beste
 * Warnsignal, das es hier gibt: Vier echte Tipper liegen auf wenigen
 * Millisekunden. Liegen sie es nicht, war das, was gefunden wurde, kein
 * Einzaehltakt - und dann stimmt das ganze Raster nicht.
 */
if (m.tipperStreuung > 0.05) {
  console.log('\n  ! Die vier Tipper liegen nicht auf einer Geraden. Das waren wahrscheinlich');
  console.log('    keine vier Tipper. Rueckfall: den Anfang von Hand vorgeben, oder ueber');
  console.log('    den Ton des Originalvideos gehen.');
}

console.log('\nDie Schleife:');
console.log(`  ab Schlag          ${m.abSchlag}`);
console.log(`  Naht vor/nach      ${m.nahtGrad.toFixed(2)} Grad -> geschlossen`);
console.log(`  Proben             ${ergebnis.wurzel.length} (${PROBEN_JE_SCHLAG} je Schlag)`);
console.log(`  Groesse            ${ergebnis.gepackt.richtungen.length + ergebnis.gepackt.wurzel.length * 2} Byte`);

/* --- R5: Wie viel Tiefe steckt drin? -------------------------------------- */

let kuerzeste = 1;
for (const [name] of KNOCHEN) {
  for (const v of ergebnis.richtungen[name]) kuerzeste = Math.min(kuerzeste, Math.hypot(v[0], v[1]));
}
console.log(`\nR5 · Verkuerzung: bis ${((1 - kuerzeste) * 100).toFixed(1)} % ` +
  `(kuerzeste Bildlaenge ${kuerzeste.toFixed(3)})`);
if (kuerzeste > 0.97) {
  console.log('  ! Fast keine Tiefe. Entweder stand die Kamera sehr weit weg, oder der');
  console.log('    Loeser hat alles in eine Ebene gelegt.');
}

/* --- R4: Wo landen die Haende? -------------------------------------------- */

/*
 * Die offene Frage aus dem Plan, und die einzige, die sich nur an echten
 * Daten beantworten laesst.
 *
 * Die Zeichnung hat andere Proportionen als die aufgenommene Person. Weil die
 * Laengen aus der Zeichnung kommen, bleibt das Skelett zwar stimmig - aber die
 * Hand landet woanders, als sie in der Aufnahme war. Gemessen wird deshalb das
 * Verhaeltnis: Wie weit reicht die Hand von der Schulter, bezogen auf die
 * Rumpflaenge? Steht dieselbe Zahl fuer die Zeichnung daneben, sieht man
 * sofort, ob und wie weit nachgezogen werden muss.
 */
const RIG = JSON.parse((await fs.readFile(new URL('../public/gemeinsam/schattenumriss.js', import.meta.url), 'utf8'))
  .match(/export const MARKEN = (\{.*?\});/s)[1]);
/*
 * Verglichen werden *anatomische* Laengen, auf beiden Seiten dieselbe Groesse.
 *
 * Der erste Anlauf stellte die groesste tatsaechlich vorkommende Reichweite
 * der Aufnahme neben die volle Armlaenge der Zeichnung und meldete 48 Prozent
 * Unterschied. Das war Unsinn: In der Aufnahme ist der Arm gebeugt und in die
 * Tiefe verkuerzt, er *erreicht* seine volle Laenge nie. Verglichen werden
 * muss Oberarm plus Unterarm gegen Oberarm plus Unterarm.
 *
 * Die Zeichnung laeuft von y = 0 (Scheitel) bis y = 1 (Huefte); die
 * Rumpflaenge Huefte-Hals ist also 1 - halsY.
 */
const zRumpf = 1 - RIG.halsY;
const zArm = RIG.arme[0];
const zOber = Math.hypot(zArm.ellbogen[0] - zArm.schulter[0], zArm.ellbogen[1] - zArm.schulter[1]);
const zUnter = Math.hypot(zArm.hand[0] - zArm.ellbogen[0], zArm.hand[1] - zArm.ellbogen[1]);

const aufnahmeVerhaeltnis = (masse.oberarmR + masse.unterarmR) / m.rumpfLaenge;
const zeichnungVerhaeltnis = (zOber + zUnter) / zRumpf;
const unterschied = ((aufnahmeVerhaeltnis - zeichnungVerhaeltnis) / zeichnungVerhaeltnis) * 100;

console.log('\nR4 · Passen die Proportionen? (Oberarm + Unterarm, bezogen auf den Rumpf)');
console.log(`  Aufnahme    ${aufnahmeVerhaeltnis.toFixed(3)}  (${masse.oberarmR.toFixed(1)} + ${masse.unterarmR.toFixed(1)} auf ${m.rumpfLaenge.toFixed(1)})`);
console.log(`  Zeichnung   ${zeichnungVerhaeltnis.toFixed(3)}  (${zOber.toFixed(3)} + ${zUnter.toFixed(3)} auf ${zRumpf.toFixed(3)})`);
/*
 * Und was das konkret heisst. Die Figur ist auf einer 640 Punkte hohen
 * Leinwand rund 230 Bildpunkte hoch (FIGUR_ZU_BILD = 0,36) - damit laesst
 * sich der Unterschied in etwas uebersetzen, das man sich vorstellen kann.
 */
const fehlPunkte = Math.abs(unterschied / 100) * (zOber + zUnter) * 230;
console.log(`  Unterschied ${unterschied > 0 ? '+' : ''}${unterschied.toFixed(1)} % – die gezeichnete Hand reicht ` +
  `${unterschied > 0 ? 'weniger' : 'weiter'} weit, um rund ${fehlPunkte.toFixed(0)} Bildpunkte ` +
  `bei 230 Punkten Figurenhoehe`);
console.log(`  ${Math.abs(unterschied) > 15 ? '! Das ist genug, um die Haende neben den Plattentellern landen zu lassen.' : '(unter 15 % – unkritisch, kein Nachziehen noetig)'}`);

if (schreiben) {
  const aus = path.join(path.dirname(datei), 'schleife.json');
  await fs.writeFile(aus, JSON.stringify({ gepackt: ergebnis.gepackt, messwerte: m }, null, 1));
  console.log(`\n${path.relative(process.cwd(), aus)} geschrieben.`);
} else {
  console.log('\n(Nichts geschrieben. Mit "-- --schreiben" wird die Schleife abgelegt.)');
}
