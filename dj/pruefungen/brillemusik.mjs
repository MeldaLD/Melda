// Abnahme: Musik einlesen und das Video darauf schneiden.
//
//   npm run musikpruefen            (startet den Server selbst)
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/brillemusik.mjs
//
// --- Zwei Faelle, und beide muessen halten -----------------------------------
//
// **Mit sicherem Raster.** Geprueft wird an `vortanz/00-durchlauf.mp3` - der
// Referenzmusik, die dieses Projekt selbst erzeugt, mit bekannten 124 BPM.
// Die Zusage lautet dann: Die Bildwechsel sitzen auf den Schlaegen. Das ist
// mehr als "das Tempo stimmt". Eine feste Zahl laeuft ueber die Laenge
// auseinander - bei 123,6 statt 124 BPM sind das nach dreissig Sekunden schon
// ein Sechstel Schlag. Geprueft wird deshalb der *ganze Schnittplan*, gegen
// das bekannte Tempo und nicht gegen die eigene Messung.
//
// **Ohne sicheres Raster.** Dafuer wird hier eine Klickspur erzeugt: Ihr Tempo
// erkennt die Analyse auf ein Zehntel genau, ihr Vertrauen bleibt trotzdem
// unter der Schwelle - blanke Klicks mit Stille dazwischen sehen nicht aus wie
// Musik. Genau dieser Fall hat einen Fehler aufgedeckt: Die erste Fassung hat
// "kein sicheres Raster" und "kein Ton im Video" in einem Zug entschieden, und
// die hochgeladene Musik fehlte stillschweigend in der fertigen Datei. Es sind
// zwei Fragen - *woher kommen die Schnittzeiten* und *kommt der Ton mit* -,
// und die zweite haengt nur daran, ob ueberhaupt Musik da ist.
//
// --- Was hier *nicht* geprueft wird ------------------------------------------
//
// Wie genau der Schnitt in der fertigen Datei sitzt. Das haengt an der Bildrate
// der Aufnahme und nicht am Schnittplan: Ein Schnitt kann nur auf einer
// Bildgrenze liegen. Von Hand nachgemessen (ffmpeg, Bildunterschiede gegen die
// Anschlaege im Ton derselben Datei) lagen die Schnitte 18 bis 55 ms neben dem
// Schlag, bei einem Bildabstand von 88 ms in dieser Umgebung - also innerhalb
// eines Bildes. Auf einem Rechner mit Grafikkarte sind es 33 ms.
//
// Zwei Messfehler auf dem Weg dahin, beide meine, beide lehrreich:
//
//   1. Der erste Versuch hat die Bilder mit `-r 60` neu abgetastet. Damit
//      erfindet ffmpeg Zwischenbilder und verschiebt die Zeitstempel - die
//      "Abweichung" war meine eigene Umrechnung.
//   2. Der zweite lief mit eingeschaltetem langsamen Zoom. Dann aendert sich
//      *jedes* Bild ein wenig, und ein Verfahren, das Schnitte an
//      Bildunterschieden erkennt, findet die falschen Stellen. Es meldete
//      225 ms Versatz, wo 55 ms waren.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROM = process.env.CHROMIUM_PFAD;
const HIER = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DJ_PORT) || 3221;

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

/** Die Referenzmusik des Projekts und das Tempo, mit dem sie erzeugt wurde. */
const REFERENZ = path.join(HIER, '..', 'vortanz', '00-durchlauf.mp3');
const REFERENZ_BPM = 124;

/*
 * Wie weit ein Schnitt vom Schlag abweichen darf - ueber die ganze Laenge.
 *
 * Fuenf Millisekunden auf ueber eine Minute. Das ist strenger als jedes Auge
 * und jedes Ohr, und es ist absichtlich so: Hier soll auffallen, wenn jemand
 * wieder mit einer festen BPM-Zahl statt mit dem gemessenen Raster rechnet.
 * Der Fehler waere am ersten Schnitt unsichtbar und wuechse mit der Laenge.
 */
const SCHNITT_TOLERANZ = 0.005;

/** Das Tempo der erzeugten Klickspur. Krumm, damit gerundete Werte auffallen. */
const TEMPO = 123.5;
/** Wie lang die Klickspur ist. Lang genug, dass sich ein Versatz aufsummiert. */
const SEKUNDEN = 60;

/**
 * Eine Klickspur als WAV-Datei.
 *
 * Jeder Schlag ist ein kurzer abklingender Sinus - genau das, was eine
 * Anschlagserkennung sehen soll. Dazwischen Stille; der Rest der Analyse
 * (Lautheit, Abschnitte) darf damit machen, was er will, geprueft wird das
 * Raster.
 */
async function klickspurSchreiben(weg) {
  const RATE = 44100;
  const n = RATE * SEKUNDEN;
  const werte = new Int16Array(n);
  const abstand = 60 / TEMPO;
  for (let schlag = 0; schlag * abstand < SEKUNDEN; schlag++) {
    const von = Math.round(schlag * abstand * RATE);
    // Die Eins eines Taktes lauter, damit auch Takt und Phrase erkennbar sind.
    const laut = schlag % 4 === 0 ? 0.9 : 0.45;
    for (let i = 0; i < RATE * 0.06 && von + i < n; i++) {
      const h = Math.exp(-i / (RATE * 0.012));
      werte[von + i] = Math.round(Math.sin((2 * Math.PI * 1400 * i) / RATE) * h * laut * 32000);
    }
  }
  const kopf = Buffer.alloc(44);
  kopf.write('RIFF', 0);
  kopf.writeUInt32LE(36 + werte.length * 2, 4);
  kopf.write('WAVE', 8);
  kopf.write('fmt ', 12);
  kopf.writeUInt32LE(16, 16);
  kopf.writeUInt16LE(1, 20);
  kopf.writeUInt16LE(1, 22);
  kopf.writeUInt32LE(RATE, 24);
  kopf.writeUInt32LE(RATE * 2, 28);
  kopf.writeUInt16LE(2, 32);
  kopf.writeUInt16LE(16, 34);
  kopf.write('data', 36);
  kopf.writeUInt32LE(werte.length * 2, 40);
  await fs.writeFile(weg, Buffer.concat([kopf, Buffer.from(werte.buffer)]));
}

const probenOrdner = path.join(HIER, '..', 'public', 'brille', 'proben');
let fotos = [];
try {
  fotos = (await fs.readdir(probenOrdner))
    .filter((d) => d.endsWith('.jpg'))
    .map((d) => path.join(probenOrdner, d));
} catch { /* kein Ordner */ }
if (!fotos.length) {
  console.log('\nKeine Probefotos unter public/brille/proben/ - uebersprungen.');
  process.exit(0);
}
// Mindestens vier Bilder, damit es mehrere Schnitte gibt. Notfalls dasselbe
// Foto mehrfach - geprueft wird der Schnittplan, nicht der Bildinhalt.
while (fotos.length < 4) fotos.push(fotos[0]);

const arbeit = await fs.mkdtemp(path.join(os.tmpdir(), 'brillemusik-'));
const klick = path.join(arbeit, 'klick.wav');
await klickspurSchreiben(klick);

let server = null;
if (!process.env.DJ_ADRESSE) {
  server = spawn(process.execPath, [path.join(HIER, '..', 'server', 'index.js')], {
    env: { ...process.env, DJ_PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let versuch = 0; versuch < 60; versuch++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/brille/`)).ok) break;
    } catch { /* noch nicht da */ }
    await new Promise((f) => setTimeout(f, 250));
  }
}
const ADRESSE = process.env.DJ_ADRESSE ?? `http://localhost:${PORT}`;

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'],
});

/**
 * Einen Durchgang fahren: Bilder laden, Musik laden, Video aufnehmen.
 *
 * Jeder Fall bekommt eine frische Seite. Zustand aus dem vorigen Durchgang
 * mitzuschleppen waere hier besonders tueckisch, weil genau das geprueft wird,
 * was beim Laden der Musik eingestellt wird.
 */
async function durchgang(musikWeg) {
  const seite = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const konsole = [];
  seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
  seite.on('console', (n) => {
    if (n.type() === 'error' && !/XNNPACK|TensorFlow/.test(n.text())) konsole.push(n.text());
  });
  try {
    await seite.goto(`${ADRESSE}/brille/`, { waitUntil: 'networkidle' });
    await seite.setInputFiles('#dateien', fotos);
    await seite.waitForFunction(
      () => /Bilder ·/.test(document.getElementById('ladeStand').textContent),
      null, { timeout: 120000 },
    );
    const t0 = Date.now();
    await seite.setInputFiles('#musik', musikWeg);
    await seite.waitForFunction(
      () => /BPM|geht nicht/.test(document.getElementById('musikStand').textContent),
      null, { timeout: 300000 },
    );
    const stand = await seite.textContent('#musikStand');
    const sekunden = (Date.now() - t0) / 1000;

    await seite.click('#rendern');
    await seite.waitForFunction(
      () => /fertig|leer|kein WebM/.test(document.getElementById('videoStand').textContent),
      null, { timeout: 300000 },
    );
    const ergebnis = await seite.textContent('#ergebnis');
    // Der *wirklich benutzte* Schnittplan, nicht eine Nachrechnung davon.
    const plan = await seite.evaluate(() => {
      const d = window.brille?.drehbuch;
      return d ? { zeiten: d.zeiten, dauer: d.dauer, musikStart: d.musikStart } : null;
    });
    const bpmAus = await seite.$eval('#bpm', (e) => e.disabled);
    const jeBildAus = await seite.$eval('#jeBild', (e) => e.disabled);
    const passung = await seite.textContent('#passung');
    return { stand, sekunden, ergebnis, plan, bpmAus, jeBildAus, passung, konsole };
  } finally {
    await seite.close();
  }
}

try {
  /* --- Fall 1: echte Musik mit sicherem Raster --------------------------- */
  console.log('\n=== Referenzmusik (vortanz/00-durchlauf.mp3, erzeugt mit 124 BPM)');
  const a = await durchgang(REFERENZ);
  console.log(`  ${a.stand}`);
  console.log(`  vermessen in ${a.sekunden.toFixed(1)} s`);
  console.log(`  ${a.passung}`);
  console.log(`  ${a.ergebnis}\n`);

  const gemessen = Number(/([\d.]+) BPM/.exec(a.stand)?.[1] ?? NaN);
  pruefe(`Tempo erkannt (${REFERENZ_BPM} BPM erzeugt)`,
    Math.abs(gemessen - REFERENZ_BPM) < 1, `${gemessen} BPM`);
  pruefe('Takt als sicher gemeldet', /Takt sicher/.test(a.stand), a.stand);
  pruefe('die Regler von Hand sind stillgelegt', a.bpmAus && !a.jeBildAus,
    `bpm=${a.bpmAus} jeBild=${a.jeBildAus}`);

  /*
   * Der Kern. Geprueft wird gegen das Tempo, mit dem die Datei *erzeugt*
   * wurde - eine Wahrheit von aussen. Und geprueft wird der letzte Schnitt
   * genauso wie der erste: Ein Fehler aus einer festen BPM-Zahl waere am
   * Anfang unsichtbar und wuechse mit der Laenge.
   */
  if (!a.plan) {
    pruefe('Schnittplan lesbar', false, 'window.brille.drehbuch fehlt');
  } else {
    const schlag = 60 / REFERENZ_BPM;
    const abstaende = [];
    for (let k = 1; k < a.plan.zeiten.length; k++) {
      abstaende.push(a.plan.zeiten[k] - a.plan.zeiten[k - 1]);
    }
    const mittel = abstaende.reduce((x, y) => x + y, 0) / abstaende.length;
    const schlaegeJeBild = Math.round(mittel / schlag);
    let groesster = 0;
    for (let k = 0; k < a.plan.zeiten.length; k++) {
      groesster = Math.max(groesster, Math.abs(a.plan.zeiten[k] - k * schlaegeJeBild * schlag));
    }
    console.log(`  Plan: ${a.plan.zeiten.length - 1} Bilder, ${schlaegeJeBild} Schläge je Bild, `
      + `${a.plan.dauer.toFixed(3)} s`);
    pruefe('die Schnitte liegen auf einem ganzen Vielfachen des Schlags',
      Math.abs(mittel / schlag - schlaegeJeBild) < 0.02,
      `${(mittel / schlag).toFixed(3)} Schläge je Bild`);
    pruefe(`auch der letzte Schnitt sitzt (unter ${SCHNITT_TOLERANZ * 1000} ms Abweichung)`,
      groesster < SCHNITT_TOLERANZ,
      `groesste Abweichung ${(groesster * 1000).toFixed(1)} ms über ${a.plan.dauer.toFixed(1)} s`);
    pruefe('der Ton ist angeschlossen', a.plan.musikStart !== null,
      `musikStart=${a.plan.musikStart}`);
  }
  pruefe('das Video ist aufgenommen', /herunterladen/.test(a.ergebnis), a.ergebnis);
  pruefe('mit Ton in derselben Datei', /mit Ton/.test(a.ergebnis), a.ergebnis);
  pruefe('keine Fehler in der Konsole', a.konsole.length === 0, a.konsole.slice(0, 3).join(' | '));

  /* --- Fall 2: Klickspur, Raster unsicher -------------------------------- */
  console.log(`\n=== Klickspur (${TEMPO} BPM, absichtlich schwer zu vertrauen)`);
  const b = await durchgang(klick);
  console.log(`  ${b.stand}`);
  console.log(`  ${b.passung}`);
  console.log(`  ${b.ergebnis}\n`);

  const ohneRaster = /kein sicherer Takt/.test(b.stand);
  console.log(`  (Raster ${ohneRaster ? 'nicht' : ''} als sicher gemeldet)`);
  /*
   * Die Zusage, um die es hier geht, gilt in *beiden* Faellen - deshalb steht
   * sie nicht unter einer Bedingung: Wer Musik hochlaedt, bekommt sie ins
   * Video. Ob die Schnitte auf Schlaegen sitzen oder gleichmaessig laufen,
   * ist eine andere Frage.
   */
  pruefe('auch hier ist der Ton angeschlossen', b.plan?.musikStart !== null,
    `musikStart=${b.plan?.musikStart}`);
  pruefe('auch hier liegt der Ton in der Datei', /mit Ton/.test(b.ergebnis), b.ergebnis);
  if (ohneRaster) {
    pruefe('bei unsicherem Raster sind die Regler von Hand wieder frei',
      !b.bpmAus && b.jeBildAus, `bpm=${b.bpmAus} jeBild=${b.jeBildAus}`);
    const ab = [];
    for (let k = 1; k < b.plan.zeiten.length; k++) ab.push(b.plan.zeiten[k] - b.plan.zeiten[k - 1]);
    const spanne = Math.max(...ab) - Math.min(...ab);
    pruefe('und die Schnitte laufen gleichmäßig', spanne < 1e-9,
      `Spanne ${(spanne * 1000).toFixed(3)} ms`);
  }
  pruefe('keine Fehler in der Konsole', b.konsole.length === 0, b.konsole.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server?.kill();
  await fs.rm(arbeit, { recursive: true, force: true });
}

console.log(fehler ? `\n${fehler} Punkt(e) offen.` : '\nAlles in Ordnung.');
process.exit(fehler ? 1 : 0);
