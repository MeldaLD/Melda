// Messen, wie gut eine Audiodatei wirklich ist.
//
// Der Hintergrund: Ein YouTube-Download ist nicht pauschal schlecht. Opus mit
// 130 kbit/s aus einem sauberen Master ist auf einer Party nicht von der
// gekauften Datei zu unterscheiden. Was wirklich weh tut, ist etwas anderes -
// und zwar in dieser Reihenfolge:
//
//   1. Lautheit. Uploads liegen zwischen -6 und -20 LUFS. Zwei Tracks mit
//      14 dB Unterschied hintereinander ist der mit Abstand haesslichste
//      Fehler, den ein DJ machen kann - schlimmer als jedes Codec-Artefakt.
//   2. Zweite Generation. Jemand hat eine 128er-MP3 bei YouTube hochgeladen,
//      YouTube hat sie nochmal durch Opus gejagt. Das hoert man.
//   3. Uebersteuerung. Schon geclippte Dateien verzerren beim Bass-Tausch.
//   4. Mono-Rips und Mitschnitte aus dem Publikum.
//
// Alle vier sind messbar, und drei davon sind reparierbar. Diese Datei misst;
// einlesen.mjs zieht die Konsequenzen.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ausfuehren = promisify(execFile);

// ffmpeg schreibt seine Messwerte nach stderr, nicht nach stdout.
async function ffmpegMessen(argumente) {
  try {
    const { stderr } = await ausfuehren('ffmpeg', ['-hide_banner', '-nostdin', ...argumente], {
      maxBuffer: 32 * 1024 * 1024,
    });
    return stderr;
  } catch (fehler) {
    // Auch bei Rueckgabewert != 0 stehen die Messwerte oft schon in stderr.
    if (fehler.stderr) return fehler.stderr;
    throw fehler;
  }
}

// --- Einzelmessungen ------------------------------------------------------

// Lautheit nach EBU R128. Das ist der Wert, aus dem wir den Angleich rechnen.
export async function lautheit(datei) {
  const ausgabe = await ffmpegMessen(['-i', datei, '-af', 'ebur128=peak=true', '-f', 'null', '-']);

  // Nur den Abschlussblock auswerten. ebur128 schreibt waehrend des Laufs
  // laufend Zwischenstaende, und die erste Zeile meldet immer -70 LUFS - wer
  // die erwischt, misst jeden Track als still.
  const zusammenfassung = ausgabe.slice(ausgabe.lastIndexOf('Summary:'));

  const zahl = (muster) => {
    const treffer = muster.exec(zusammenfassung);
    return treffer ? Number(treffer[1]) : null;
  };

  const lufs = zahl(/I:\s+(-?\d+(?:\.\d+)?)\s+LUFS/);
  return {
    // Integrierte Lautheit ueber den ganzen Track, in LUFS.
    // -70 ist der Anschlag nach unten und heisst: hier war nichts zu messen.
    lufs: lufs !== null && lufs <= -70 ? null : lufs,
    // Wie stark der Track in sich schwankt. Sehr klein = totkomprimiert.
    umfang: zahl(/LRA:\s+(-?\d+(?:\.\d+)?)\s+LU/),
    // Echter Spitzenwert inklusive Zwischenwerten, in dBTP.
    spitze: zahl(/Peak:\s+(-?\d+(?:\.\d+)?)\s+dBFS/),
  };
}

// Wie viel Hoehen fehlen? Das ist der verlaesslichste Hinweis auf eine zweite
// Codier-Generation: jemand hat eine 128er-MP3 bei YouTube hochgeladen, und
// YouTube hat sie nochmal durch Opus geschickt. Das hoert man - das saubere
// Opus-Original aus einem guten Master dagegen nicht.
//
// Gemessen wird nicht der absolute Pegel (der haengt an der Musik), sondern das
// Gefaelle *innerhalb* der Hoehen: 13-14 kHz als Bezug gegen 19-20 kHz. Eine
// natuerliche Aufnahme faellt dort um wenige dB ab, ein Codec-Tiefpass reisst
// dreissig und mehr. Damit ist die Messung unabhaengig davon, ob der Track von
// Haus aus dunkel oder hell abgemischt ist.
const BAENDER = [
  [13000, 14000], // Bezug
  [16000, 17000],
  [18000, 19000],
  [19000, 20000], // hier schlaegt jeder Tiefpass zu
];

export async function hoehenabfall(datei, dauer) {
  // Zwanzig Sekunden aus der Mitte reichen und sind bei 250 Tracks der
  // Unterschied zwischen Minuten und Stunden.
  const start = Math.max(0, Math.floor((dauer ?? 180) / 2) - 10);

  // Steile Flanken durch dreifache Filter - ein einzelner Biquad leckt so
  // stark, dass die Kante verschmiert und jeder Track voll aussieht.
  const band = ([tief, hoch]) =>
    [
      `highpass=f=${tief}:poles=2`,
      `highpass=f=${tief}:poles=2`,
      `highpass=f=${tief}:poles=2`,
      `lowpass=f=${hoch}:poles=2`,
      `lowpass=f=${hoch}:poles=2`,
      `lowpass=f=${hoch}:poles=2`,
      'volumedetect',
    ].join(',');

  const zweige = BAENDER.map((b, i) => `[${String.fromCharCode(97 + i)}]${band(b)}[o${i}]`);
  const graph = `[0:a]asplit=${BAENDER.length}${BAENDER.map((_, i) => `[${String.fromCharCode(97 + i)}]`).join('')};${zweige.join(';')}`;

  const ziele = BAENDER.flatMap((_, i) => ['-map', `[o${i}]`, '-f', 'null', '-']);
  const ausgabe = await ffmpegMessen([
    '-ss',
    String(start),
    '-t',
    '20',
    '-i',
    datei,
    '-filter_complex',
    graph,
    ...ziele,
  ]);

  // ffmpeg gibt die Bloecke nicht in Kettenreihenfolge aus. Die laufende Nummer
  // im Filternamen steigt aber mit der Kette, also danach sortieren.
  const treffer = [...ausgabe.matchAll(/Parsed_volumedetect_(\d+) @ [^\]]+\] mean_volume:\s+(-?\d+(?:\.\d+)?)/g)];
  const pegel = treffer
    .map((t) => ({ stelle: Number(t[1]), wert: Number(t[2]) }))
    .sort((a, b) => a.stelle - b.stelle)
    .map((e) => e.wert);

  if (pegel.length < BAENDER.length) return { abfall: null, obergrenze: null, pegel };

  const bezug = pegel[0];
  const abfall = Number((bezug - pegel[pegel.length - 1]).toFixed(1));

  // Zur Anzeige: das oberste Band, in dem noch etwas los ist.
  let obergrenze = BAENDER[0][0];
  for (let i = BAENDER.length - 1; i >= 0; i--) {
    if (bezug - pegel[i] < 20) {
      obergrenze = BAENDER[i][1];
      break;
    }
  }

  return { abfall, obergrenze, pegel };
}

// Uebersteuerung und Mono-Rips.
export async function form(datei, dauer) {
  const start = Math.max(0, Math.floor((dauer ?? 180) / 2) - 30);
  const ausschnitt = ['-ss', String(start), '-t', '60', '-i', datei];

  const stats = await ffmpegMessen([...ausschnitt, '-af', 'astats=metadata=1', '-f', 'null', '-']);

  // Wie viele Abtastwerte liegen exakt auf dem Maximum? Viele davon heisst:
  // die Datei war schon vor uns uebersteuert.
  const spitzenZaehler = [...stats.matchAll(/Peak count:\s+(\d+)/g)].map((t) => Number(t[1]));
  const flachheit = [...stats.matchAll(/Flat factor:\s+(\d+(?:\.\d+)?)/g)].map((t) => Number(t[1]));

  // Das Seitensignal (L-R). Ist es praktisch still, ist die Datei mono.
  const seite = await ffmpegMessen([
    ...ausschnitt,
    '-af',
    'aformat=channel_layouts=stereo,pan=mono|c0=0.5*c0-0.5*c1,volumedetect',
    '-f',
    'null',
    '-',
  ]);
  const seitenTreffer = /mean_volume:\s+(-?\d+(?:\.\d+)?) dB/.exec(seite);

  return {
    spitzenZaehler: Math.max(0, ...spitzenZaehler),
    flachheit: Math.max(0, ...flachheit),
    seitenpegel: seitenTreffer ? Number(seitenTreffer[1]) : -100,
  };
}

export async function eckdaten(datei) {
  const { stdout } = await ausfuehren('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration,bit_rate:stream=codec_name,channels,sample_rate',
    '-of',
    'json',
    datei,
  ]);
  const daten = JSON.parse(stdout);
  const spur = daten.streams?.[0] ?? {};
  return {
    dauer: Number(daten.format?.duration ?? 0),
    bitrate: Number(daten.format?.bit_rate ?? 0),
    codec: spur.codec_name ?? 'unbekannt',
    kanaele: Number(spur.channels ?? 0),
    abtastrate: Number(spur.sample_rate ?? 0),
  };
}

// --- Zusammenfuehren ------------------------------------------------------

// Eine Note von 0 bis 1 und - wichtiger - eine Entscheidung, was damit passiert.
export async function beurteilen(datei) {
  const daten = await eckdaten(datei);
  const [pegel, hoehen, gestalt] = await Promise.all([
    lautheit(datei),
    hoehenabfall(datei, daten.dauer),
    form(datei, daten.dauer),
  ]);

  const abzuege = [];
  let note = 1;

  // 1. Hoehenabfall. Der wichtigste Einzelwert fuer "zweite Generation".
  // Die Schwellen sind an echtem Material geeicht: eine unangetastete Datei
  // liegt bei wenigen dB, eine einmal durch 96k-MP3 gedrehte bei ueber 40.
  const abfall = hoehen.abfall;
  if (abfall === null) {
    abzuege.push('Hoehen nicht messbar');
  } else if (abfall < 12) {
    // sauber - kein Abzug
  } else if (abfall < 22) {
    note -= 0.15;
    abzuege.push(`Hoehen fallen um ${abfall} dB ab`);
  } else if (abfall < 35) {
    note -= 0.4;
    abzuege.push(`Hoehen fallen um ${abfall} dB ab - vermutlich aus einer MP3`);
  } else {
    note -= 0.6;
    abzuege.push(`Hoehen fallen um ${abfall} dB ab - stark umkodiert`);
  }

  // 2. Uebersteuerung. Zwei Wege: harte Clippings in den Abtastwerten, oder
  // ein echter Spitzenwert ueber 0 dB - dann hat schon das Mastering gedrueckt
  // und beim Bass-Tausch wird daraus hoerbare Verzerrung.
  if (gestalt.flachheit > 10) {
    note -= 0.25;
    abzuege.push('uebersteuert');
  } else if (gestalt.spitzenZaehler > 5000) {
    note -= 0.1;
    abzuege.push('haeufig am Anschlag');
  }
  if (pegel.spitze !== null && pegel.spitze > 1) {
    note -= 0.1;
    abzuege.push(`Spitze ${pegel.spitze} dBTP ueber Null`);
  }

  // 3. Mono.
  if (gestalt.seitenpegel < -60) {
    note -= 0.3;
    abzuege.push('mono');
  }

  // 4. Totkomprimiert. Unter 3 LU passiert dynamisch nichts mehr.
  if (pegel.umfang !== null && pegel.umfang < 3) {
    note -= 0.1;
    abzuege.push(`kaum Dynamik (${pegel.umfang} LU)`);
  }

  note = Math.max(0, Math.min(1, note));

  return {
    note: Number(note.toFixed(2)),
    abzuege,
    abfall,
    obergrenze: hoehen.obergrenze,
    lufs: pegel.lufs,
    umfang: pegel.umfang,
    spitze: pegel.spitze,
    ...daten,
    // Der Grund, warum wir das alles messen: der Angleich.
    angleichDb: pegel.lufs === null ? 0 : Number((ZIEL_LUFS - pegel.lufs).toFixed(2)),
    ablehnen: ablehnungsgrund(daten, gestalt),
  };
}

// Auf welche Lautheit alles gezogen wird. -9 LUFS ist Clubniveau und laesst
// genug Luft, damit zwei Tracks im Uebergang nicht in die Begrenzung laufen.
export const ZIEL_LUFS = -9;

// Nur was wirklich unbrauchbar ist, fliegt raus. Alles andere wird gemessen
// und spaeter passend eingesetzt.
function ablehnungsgrund(daten, gestalt) {
  if (daten.dauer < 45) return 'kuerzer als 45 Sekunden';
  if (daten.dauer > 20 * 60) return 'laenger als 20 Minuten (Mix oder Endlosschleife?)';
  if (daten.kanaele === 0) return 'keine Audiospur gefunden';
  if (gestalt.seitenpegel < -90 && gestalt.flachheit > 15) return 'mono und uebersteuert';
  return null;
}
