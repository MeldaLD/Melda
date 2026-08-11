// Material hereinholen - von YouTube oder aus einer Datei - und dabei so
// aufbereiten, dass der Abend gleichmaessig klingt.
//
//   node einlesen/einlesen.mjs <url-oder-datei> [weitere ...]
//   node einlesen/einlesen.mjs --ordner ~/Downloads/Techno
//
// Was hier passiert, ist die Antwort auf "YouTube klingt schlechter":
//
//   * Jeder Track wird gemessen und bekommt eine Note. Nicht geraten - gemessen.
//   * Die Lautheit wird angeglichen, damit kein Track herausspringt. Das ist
//     der groesste hoerbare Gewinn und wirkt bei gekauften Dateien genauso.
//   * Alles landet im selben Format (FLAC, 44,1 kHz, stereo), damit der Browser
//     am Abend nie ueber einen Codec stolpert.
//   * Gibt es denselben Track schon in besserer Qualitaet, gewinnt der bessere.
//     Kaufst du einen Track spaeter nach, ersetzt er die YouTube-Fassung von
//     selbst.
//   * Was wirklich unbrauchbar ist, kommt gar nicht erst rein.
//
// Braucht yt-dlp und ffmpeg im Pfad. Beides nur hier - der Partyabend selbst
// braucht davon nichts.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beurteilen, ZIEL_LUFS } from './qualitaet.mjs';
import { konfiguration } from '../public/gemeinsam/konfiguration.js';

const ausfuehren = promisify(execFile);
const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MUSIK = path.resolve(WURZEL, konfiguration.musikOrdner);

// Unter dieser Note kommt nichts mehr in die Bibliothek. Alles darueber wird
// aufgenommen und spaeter passend eingesetzt - siehe server/auswahl.js.
const NOTE_MINDESTENS = 0.35;

// --- Hauptlauf ------------------------------------------------------------

const argumente = process.argv.slice(2);
if (argumente.length === 0) {
  console.log(`
  node einlesen/einlesen.mjs <url-oder-datei> [...]
  node einlesen/einlesen.mjs --ordner <pfad>
`);
  process.exit(1);
}

await werkzeugePruefen();
await fs.mkdir(MUSIK, { recursive: true });

const quellen =
  argumente[0] === '--ordner' ? await ordnerLesen(argumente[1]) : argumente;

let aufgenommen = 0;
let abgelehnt = 0;

for (const [nummer, quelle] of quellen.entries()) {
  console.log(`\n[${nummer + 1}/${quellen.length}] ${kuerzen(quelle)}`);
  try {
    const ergebnis = await einlesen(quelle);
    if (ergebnis.aufgenommen) aufgenommen++;
    else abgelehnt++;
  } catch (fehler) {
    abgelehnt++;
    console.log(`  ! ${fehler.message}`);
  }
}

console.log(`\n${aufgenommen} aufgenommen, ${abgelehnt} nicht.\n`);

// --- Ein Stueck -----------------------------------------------------------

async function einlesen(quelle) {
  const arbeitsordner = await fs.mkdtemp(path.join(os.tmpdir(), 'resident-dj-'));
  try {
    const { datei, metadaten } = quelle.startsWith('http')
      ? await vonYoutube(quelle, arbeitsordner)
      : { datei: quelle, metadaten: ausDateiname(quelle) };

    process.stdout.write('  messen ');
    const befund = await beurteilen(datei);
    console.log(`Note ${befund.note} · ${befund.lufs} LUFS · bis ${befund.obergrenze / 1000} kHz`);

    if (befund.ablehnen) {
      console.log(`  abgelehnt: ${befund.ablehnen}`);
      return { aufgenommen: false };
    }
    if (befund.note < NOTE_MINDESTENS) {
      console.log(`  abgelehnt: Note ${befund.note} zu niedrig (${befund.abzuege.join(', ')})`);
      return { aufgenommen: false };
    }
    if (befund.abzuege.length > 0) {
      console.log(`  Abzuege: ${befund.abzuege.join(', ')}`);
    }

    // Gibt es das schon - und ist das Vorhandene besser?
    const schluessel = kennung(metadaten);
    const vorhanden = await vorhandenerBefund(schluessel);
    if (vorhanden && vorhanden.note >= befund.note) {
      console.log(`  schon da, und zwar besser (Note ${vorhanden.note}) - bleibt`);
      return { aufgenommen: false };
    }
    if (vorhanden) {
      console.log(`  ersetzt die vorhandene Fassung (Note ${vorhanden.note} -> ${befund.note})`);
    }

    process.stdout.write('  umwandeln ');
    const ziel = path.join(MUSIK, `${schluessel}.flac`);
    await vereinheitlichen(datei, ziel);
    console.log('fertig');

    await fs.writeFile(
      path.join(MUSIK, `${schluessel}.json`),
      JSON.stringify(
        {
          id: schluessel,
          datei: path.basename(ziel),
          ...metadaten,
          ...befund,
          zielLufs: ZIEL_LUFS,
          eingelesen: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    console.log(`  -> ${metadaten.interpret} – ${metadaten.titel}`);
    return { aufgenommen: true };
  } finally {
    await fs.rm(arbeitsordner, { recursive: true, force: true });
  }
}

// --- YouTube --------------------------------------------------------------

async function vonYoutube(url, arbeitsordner) {
  process.stdout.write('  laden ');
  await ausfuehren(
    'yt-dlp',
    [
      // Die beste verfuegbare Tonspur, ohne Videoanteil.
      '-f',
      'bestaudio/best',
      '--no-playlist',
      '--no-progress',
      '--extract-audio',
      // FLAC heisst hier nicht "besser als die Quelle", sondern: ab jetzt geht
      // nichts mehr verloren. Jede weitere Umwandlung waere ein zweiter Verlust.
      '--audio-format',
      'flac',
      '--write-info-json',
      '-o',
      path.join(arbeitsordner, 'ton.%(ext)s'),
      url,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  console.log('fertig');

  const dateien = await fs.readdir(arbeitsordner);
  const ton = dateien.find((d) => d.endsWith('.flac'));
  if (!ton) throw new Error('yt-dlp hat keine Tonspur geliefert');

  const infoDatei = dateien.find((d) => d.endsWith('.info.json'));
  const info = infoDatei
    ? JSON.parse(await fs.readFile(path.join(arbeitsordner, infoDatei), 'utf8'))
    : {};

  return { datei: path.join(arbeitsordner, ton), metadaten: ausYoutubeInfo(info) };
}

// YouTube Music liefert saubere Felder mit; normale Videos nur einen Titel, den
// wir aufraeumen muessen.
function ausYoutubeInfo(info) {
  if (info.track && info.artist) {
    return { titel: info.track.trim(), interpret: info.artist.split(',')[0].trim() };
  }
  return ausTitelzeile(info.title ?? 'Unbekannt', info.uploader);
}

const MUELL =
  /\s*[([]\s*(official\s*(music\s*)?(video|audio|visualizer)?|lyrics?( video)?|hq|hd|4k|full|free\s*(dl|download)|out now|premiere|extended( mix)?|original mix|radio edit|audio|visualizer|remastered?( \d{4})?)\s*[)\]]/gi;

function ausTitelzeile(zeile, hochlader) {
  let sauber = zeile.replace(MUELL, '').replace(/\s{2,}/g, ' ').trim();

  // "Interpret - Titel" ist die mit Abstand haeufigste Form.
  const teile = sauber.split(/\s+[-–—]\s+/);
  if (teile.length >= 2) {
    return { interpret: teile[0].trim(), titel: teile.slice(1).join(' - ').trim() };
  }
  return { interpret: (hochlader ?? 'Unbekannt').replace(/\s*-\s*Topic$/, '').trim(), titel: sauber };
}

function ausDateiname(pfad) {
  return ausTitelzeile(path.basename(pfad, path.extname(pfad)));
}

// --- Vereinheitlichen -----------------------------------------------------

// Ein Format fuer alles. Die Lautheit wird *nicht* eingerechnet, sondern nur
// gemessen und mitgeschrieben: Beim Abspielen laesst sie sich sauber ueber
// einen Verstaerkungsregler anlegen, ohne dass hier schon etwas anschlaegt.
async function vereinheitlichen(quelle, ziel) {
  await ausfuehren(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostdin',
      '-y',
      '-i',
      quelle,
      '-map',
      'a:0',
      '-ac',
      '2',
      '-ar',
      '44100',
      '-sample_fmt',
      's16',
      '-c:a',
      'flac',
      '-compression_level',
      '5',
      ziel,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
}

// --- Kleinkram ------------------------------------------------------------

// Stabile Kennung aus Interpret und Titel. Sie ist gleichzeitig der Dateiname
// und der Schluessel, an dem der Abgleich mit einer besseren Fassung haengt.
function kennung({ interpret, titel }) {
  return `${interpret} - ${titel}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

async function vorhandenerBefund(schluessel) {
  try {
    return JSON.parse(await fs.readFile(path.join(MUSIK, `${schluessel}.json`), 'utf8'));
  } catch {
    return null;
  }
}

async function ordnerLesen(ordner) {
  const endungen = ['.mp3', '.m4a', '.wav', '.flac', '.aiff', '.aif', '.ogg', '.opus'];
  const eintraege = await fs.readdir(ordner, { withFileTypes: true });
  return eintraege
    .filter((e) => e.isFile() && endungen.includes(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(ordner, e.name));
}

async function werkzeugePruefen() {
  for (const werkzeug of ['ffmpeg', 'ffprobe', 'yt-dlp']) {
    try {
      await ausfuehren(werkzeug, ['-version']);
    } catch {
      console.error(`\n  ${werkzeug} fehlt. Installieren:\n`);
      console.error('    macOS   brew install ffmpeg yt-dlp');
      console.error('    Linux   sudo apt install ffmpeg && pipx install yt-dlp');
      console.error('    Windows winget install ffmpeg yt-dlp\n');
      process.exit(1);
    }
  }
}

function kuerzen(text) {
  return text.length > 70 ? `${text.slice(0, 67)}…` : text;
}
