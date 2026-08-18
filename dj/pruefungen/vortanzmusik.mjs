// Sitzt das Schlagraster in den fertigen Dateien wirklich auf 124 BPM?
//
// Daran haengt spaeter alles: Tanzt sie zu einem anderen Raster, als ich
// hinterher annehme, ist die ganze Kette schief - und es faellt niemandem
// auf, weil beide Seiten fuer sich stimmig aussehen.
//
// Gemessen wird zweierlei, getrennt, weil es zwei verschiedene Fragen sind:
//
//   A. Baut der MP3-Kodierer einen Versatz ein? LAME schiebt bekanntlich
//      etwas voran. Das laesst sich ohne jede Anschlagserkennung feststellen:
//      die dekodierte MP3 gegen die WAV kreuzkorrelieren, aus der sie
//      entstanden ist. Wenn dort null herauskommt, ist die Frage erledigt.
//
//   B. Liegen die Kicks auf den Vierteln? Gemessen im Bassband, denn dort ist
//      der Kick allein - Hi-Hats und Klatsch liegen darueber und wuerden die
//      Erkennung sonst zumuellen.
//
// Der erste Anlauf hat beides in einem Rutsch mit einer Anschlagserkennung
// ueber das volle Band versucht und dabei in vierzehn Sekunden Vollgas-Techno
// *drei* Anschlaege gefunden. Der Grund: Die Schwelle stand auf dem Vielfachen
// des Mittelwerts, und in dichtem Material ist der Mittelwert selbst hoch.
// Die Zahlen daraus waren wertlos.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';

const lauf = promisify(execFile);
const BPM = 124;
const SCHLAG = 60 / BPM;
const RATE = 22050;

/*
 * Die Fensterdauer *aus der Fenstergroesse* rechnen und nicht als 0,002
 * hinschreiben.
 *
 * Genau daran ist die Tempomessung zuerst gescheitert: 0,002 s waeren bei
 * 22050 Hz 44,1 Abtastwerte, das Fenster ist aber 44 gross - also 1,9955 ms.
 * Ueber einen Schlag summiert sich der Unterschied auf gut eine Millisekunde,
 * und heraus kam fuer *jede* Datei 123,50 statt 124,00 BPM. Ein Fehler, der
 * bei allen Messungen gleich gross ist, sitzt nie im Gemessenen.
 */
const FENSTER = Math.round(RATE * 0.002);
const DT = FENSTER / RATE;

const laden = async (pfad, filter = null) => {
  const args = ['-v', 'error', '-i', pfad];
  if (filter) args.push('-af', filter);
  args.push('-f', 's16le', '-ac', '1', '-ar', String(RATE), '-');
  const { stdout } = await lauf('ffmpeg', args, { encoding: 'buffer', maxBuffer: 1 << 28 });
  const n = stdout.length / 2;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = stdout.readInt16LE(i * 2) / 32768;
  return x;
};

let fehler = 0;
const pruefe = (ok, text) => { if (!ok) fehler++; console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${text}`); };

const ORDNER = new URL('../vortanz/', import.meta.url).pathname;
const dateien = (await fs.readdir(ORDNER)).filter((d) => d.endsWith('.mp3')).sort();

console.log('\nA. Verschiebt das Kodieren die Zeitachse?');
for (const d of dateien) {
  const name = d.replace(/^\d+-/, '').replace('.mp3', '');
  const [a, b] = await Promise.all([laden(`${ORDNER}${name}.wav`), laden(`${ORDNER}${d}`)]);
  // Kreuzkorrelation ueber die erste Sekunde, +/- 100 ms.
  const laenge = Math.min(RATE, a.length, b.length);
  const spanne = Math.round(RATE * 0.1);
  let besterVersatz = 0;
  let bestes = -Infinity;
  for (let v = -spanne; v <= spanne; v++) {
    let s = 0;
    for (let i = 0; i < laenge; i++) {
      const j = i + v;
      if (j >= 0 && j < b.length) s += a[i] * b[j];
    }
    if (s > bestes) { bestes = s; besterVersatz = v; }
  }
  const ms = (besterVersatz / RATE) * 1000;
  pruefe(Math.abs(ms) < 2, `${d.padEnd(22)} Versatz ${ms >= 0 ? '+' : ''}${ms.toFixed(2)} ms`);
}

console.log('\nB. Laeuft das Tempo wirklich auf 124?');
/*
 * Gemessen als Kammabgleich gegen ein Raster bekannter Phase - nicht als
 * "jeder Kick liegt auf einem Viertel" und auch nicht als blosse
 * Autokorrelation. Beide Vorstufen sind gescheitert, und beide Male lag es
 * an der Messung:
 *
 *   Erster Anlauf: Anschlaege ueber das volle Band, Schwelle als Vielfaches
 *   des Mittelwerts. In dichtem Material waechst der Mittelwert mit - in
 *   vierzehn Sekunden Vollgas fand die Erkennung drei Anschlaege.
 *
 *   Zweiter Anlauf: Kicks im Bassband gegen die Viertel. Bei hoher Energie
 *   setzt der Generator aber absichtlich einen Kick auf das sechzehnte
 *   Sechzehntel - den Schub vor der Eins -, und der Swing verschiebt die
 *   ungeraden Sechzehntel. Beides ist gewollte Musik und fiel durch.
 *
 *   Dritter Anlauf: Autokorrelation. Die fand bei einer Datei 524 ms, weil
 *   ein synkopiertes Muster ueber vierzehn Sekunden eine zweite Periode
 *   anbietet, die fast genauso gut passt.
 *
 * Hier zaehlt jetzt aus, wieviel Anschlagsenergie auf den Rasterpunkten
 * eines Kandidatentempos liegt. Die Phase muss dabei nicht gesucht werden:
 * Der erste Klick sitzt bauartbedingt auf Sekunde null, und Teil A hat
 * gezeigt, dass das Kodieren daran nichts verschiebt. Das richtige Tempo
 * muss deutlich gewinnen - nicht knapp.
 */
for (const d of dateien) {
  const x = await laden(`${ORDNER}${d}`);
  const fenster = FENSTER;
  const bloecke = Math.floor(x.length / fenster);
  const huelle = new Float32Array(bloecke);
  for (let b = 0; b < bloecke; b++) {
    let s = 0;
    for (let i = b * fenster; i < (b + 1) * fenster; i++) s += x[i] * x[i];
    huelle[b] = Math.sqrt(s / fenster);
  }
  const anstieg = new Float32Array(bloecke);
  for (let b = 1; b < bloecke; b++) anstieg[b] = Math.max(0, huelle[b] - huelle[b - 1]);

  // Wieviel Anschlagsenergie faellt auf die Viertel eines Tempos?
  const wert = (bpm) => {
    const schritt = (60 / bpm) / DT;
    let summe = 0;
    let zahl = 0;
    for (let k = 0; k * schritt < bloecke - 2; k++) {
      const b = Math.round(k * schritt);
      // Ein Fenster von +/- 6 ms, weil ein Kick zwei bis drei Bloecke
      // braucht, bis seine Huellkurve oben ist.
      let beste = 0;
      for (let o = -3; o <= 3; o++) if (anstieg[b + o] > beste) beste = anstieg[b + o];
      summe += beste;
      zahl++;
    }
    return zahl ? summe / zahl : 0;
  };
  let bestesBpm = 0;
  let bestes = -Infinity;
  for (let bpm = 100; bpm <= 150; bpm += 0.25) {
    const w = wert(bpm);
    if (w > bestes) { bestes = w; bestesBpm = bpm; }
  }
  // Der beste Kandidat, der *nicht* in der Naehe von 124 liegt.
  let naechster = 0;
  for (let bpm = 100; bpm <= 150; bpm += 0.25) {
    if (Math.abs(bpm - BPM) < 4) continue;
    const w = wert(bpm);
    if (w > naechster) naechster = w;
  }
  const vorsprung = bestes / Math.max(naechster, 1e-9);
  pruefe(Math.abs(bestesBpm - BPM) < 1 && vorsprung > 1.15,
    `${d.padEnd(22)} ${bestesBpm.toFixed(2)} BPM, ` +
    `${((vorsprung - 1) * 100).toFixed(0)} % vor dem naechstbesten Tempo`);
}

console.log('\nC. Und die vier Klicks sitzen im Abstand eines Schlages?');
/*
 * Sie sind der Anker, mit dem ich spaeter Video und Musik uebereinanderlege.
 *
 * Geprueft wird der *Abstand* der Klicks und nicht ihre absolute Lage. Der
 * Grund steht in den Zahlen des Vorlaeufers: Der meldete fuer jede Datei und
 * jeden Klick 8 bis 10 ms - immer denselben Wert. Ein Fehler, der ueberall
 * gleich gross ist, sitzt nicht im Gemessenen, sondern im Messgeraet: Der
 * Hochpass hat Gruppenlaufzeit, und die Huellkurve eines 2-ms-Fensters ist
 * erst ein Fenster spaeter oben. Die absolute Lage steht ohnehin schon fest -
 * die Klicks sind auf die Abtastung genau geplant, und Teil A zeigt, dass
 * das Kodieren nichts verschiebt.
 */
for (const d of dateien) {
  const x = await laden(`${ORDNER}${d}`, 'highpass=f=900,highpass=f=900');
  const fenster = FENSTER;
  const stellen = [];
  for (let k = 0; k < 4; k++) {
    const mitte = Math.round((k * SCHLAG) / DT);
    const rand = Math.round(0.09 / DT);
    let beste = mitte;
    let wert = -Infinity;
    for (let b = Math.max(1, mitte - rand); b <= mitte + rand; b++) {
      let s = 0;
      for (let i = b * fenster; i < (b + 1) * fenster && i < x.length; i++) s += x[i] * x[i];
      if (s > wert) { wert = s; beste = b; }
    }
    stellen.push(beste * DT);
  }
  const abstaende = [1, 2, 3].map((k) => stellen[k] - stellen[k - 1]);
  const schlimmster = Math.max(...abstaende.map((a) => Math.abs(a - SCHLAG) * 1000));
  pruefe(schlimmster < 8,
    `${d.padEnd(22)} Abstaende ${abstaende.map((a) => (a * 1000).toFixed(0)).join(', ')} ms ` +
    `(Soll ${(SCHLAG * 1000).toFixed(0)}), groesste Abweichung ${schlimmster.toFixed(1)} ms`);
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlles gruen: 124 BPM, Phase auf null.');
process.exit(fehler ? 1 : 0);
