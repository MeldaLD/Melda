// Abnahme fuer die Klangmessung: erkennt sie die Maengel, die sie erkennen soll?
//
//   node pruefungen/klang.mjs
//
// Erzeugt sich die Testfaelle selbst mit ffmpeg, damit die Pruefung ohne
// Musikbibliothek laeuft und ueberall dasselbe Ergebnis liefert.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { beurteilen } from '../einlesen/qualitaet.mjs';

const ausfuehren = promisify(execFile);

let fehler = 0;
const pruefe = (name, bedingung, hinweis = '') => {
  console.log(`  ${bedingung ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!bedingung) fehler++;
};

try {
  await ausfuehren('ffmpeg', ['-version']);
} catch {
  console.error('\n  ffmpeg fehlt – diese Pruefung braucht es.\n');
  process.exit(1);
}

const ordner = await fs.mkdtemp(path.join(os.tmpdir(), 'klangpruefung-'));
const ff = (argumente) => ausfuehren('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argumente], { maxBuffer: 32 * 1024 * 1024 });
const p = (name) => path.join(ordner, name);

try {
  console.log('\nTestfaelle erzeugen …');

  // Sauber: Rauschen mit Energie ueber das ganze Band, echtes Stereo.
  await ff([
    '-f', 'lavfi', '-i', 'anoisesrc=d=60:c=white:r=44100:a=0.25:seed=1',
    '-f', 'lavfi', '-i', 'anoisesrc=d=60:c=white:r=44100:a=0.25:seed=2',
    '-filter_complex', '[0][1]amerge=inputs=2[a]', '-map', '[a]', '-ac', '2',
    '-c:a', 'flac', p('sauber.flac'),
  ]);

  // Zweite Generation: einmal durch eine 96er-MP3 und zurueck. Genau der Fall,
  // den ein YouTube-Reupload einer alten MP3 erzeugt.
  await ff(['-i', p('sauber.flac'), '-c:a', 'libmp3lame', '-b:a', '96k', p('zwischen.mp3')]);
  await ff(['-i', p('zwischen.mp3'), '-c:a', 'flac', '-ac', '2', p('umkodiert.flac')]);

  // Mono-Rip, zu laut, an der Grenze.
  await ff([
    '-i', p('sauber.flac'),
    '-af', 'pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1,volume=12dB,alimiter=limit=1.0',
    '-c:a', 'flac', p('monolaut.flac'),
  ]);

  // Zu kurz zum Auflegen.
  await ff([
    '-f', 'lavfi', '-i', 'anoisesrc=d=20:c=white:r=44100:a=0.2', '-ac', '2',
    '-c:a', 'flac', p('schnipsel.flac'),
  ]);

  console.log('\nSaubere Aufnahme:');
  const sauber = await beurteilen(p('sauber.flac'));
  console.log(`    Note ${sauber.note} · Hoehenabfall ${sauber.abfall} dB · ${sauber.lufs} LUFS`);
  pruefe('wird nicht abgelehnt', !sauber.ablehnen);
  pruefe('kein Hoehenverlust erkannt', sauber.abfall < 12);
  pruefe('Note bleibt hoch', sauber.note >= 0.85);

  console.log('\nZweite Codier-Generation (96k-MP3):');
  const umkodiert = await beurteilen(p('umkodiert.flac'));
  console.log(`    Note ${umkodiert.note} · Hoehenabfall ${umkodiert.abfall} dB`);
  pruefe('Hoehenverlust wird erkannt', umkodiert.abfall > 30);
  pruefe('Note faellt deutlich', umkodiert.note < 0.5);
  pruefe(
    'deutlich schlechter bewertet als die saubere Fassung',
    sauber.note - umkodiert.note > 0.4,
  );

  console.log('\nMono und zu laut:');
  const monolaut = await beurteilen(p('monolaut.flac'));
  console.log(`    Note ${monolaut.note} · ${monolaut.lufs} LUFS · Angleich ${monolaut.angleichDb} dB`);
  pruefe('Mono wird erkannt', monolaut.abzuege.some((a) => a.includes('mono')));
  pruefe('wird leiser gezogen', monolaut.angleichDb < 0);

  console.log('\nLautheitsangleich – der eigentliche Gewinn:');
  const vorher = [sauber.lufs, umkodiert.lufs, monolaut.lufs];
  const nachher = [sauber, umkodiert, monolaut].map((b) => b.lufs + b.angleichDb);
  console.log(`    vorher  ${vorher.map((v) => v.toFixed(1)).join(', ')} LUFS`);
  console.log(`    nachher ${nachher.map((v) => v.toFixed(1)).join(', ')} LUFS`);
  const spanneVorher = Math.max(...vorher) - Math.min(...vorher);
  const spanneNachher = Math.max(...nachher) - Math.min(...nachher);
  console.log(`    Spanne  ${spanneVorher.toFixed(1)} dB  ->  ${spanneNachher.toFixed(1)} dB`);
  pruefe('Ausgangsmaterial geht wirklich auseinander', spanneVorher > 5);
  pruefe('nach dem Angleich liegt alles beieinander', spanneNachher < 0.5);

  console.log('\nUnbrauchbares fliegt raus:');
  const schnipsel = await beurteilen(p('schnipsel.flac'));
  pruefe('zu kurze Datei wird abgelehnt', !!schnipsel.ablehnen, schnipsel.ablehnen ?? '');
} finally {
  await fs.rm(ordner, { recursive: true, force: true });
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Pruefung(en) fehlgeschlagen.\n`);
process.exit(fehler === 0 ? 0 : 1);
