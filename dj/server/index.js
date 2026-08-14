// Der Server. Bewusst ohne jede Abhaengigkeit - nur Node selbst.
//
// Das ist keine Sparsamkeit um ihrer selbst willen: Am Partyabend soll niemand
// `npm install` brauchen, kein Paket kann veraltet sein, kein Lockfile kaputt.
// Node installieren, `npm start`, fertig. Statt WebSockets nehmen wir
// Server-Sent Events, die kann der Browser von Haus aus.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { konfiguration } from '../public/gemeinsam/konfiguration.js';
import {
  zustand,
  aktuelleZielenergie,
  wunschEintragen,
  wunschZuruecknehmen,
  wuenscheVon,
  wunschliste,
  alsGespieltVermerken,
  frischeRichtungen,
} from '../public/gemeinsam/zustand.js';
import { naechsterTrack } from '../public/gemeinsam/auswahl.js';
import { lanAdressen } from './adressen.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.join(HIER, '..');
const OEFFENTLICH = path.join(WURZEL, 'public');
const MUSIK = path.resolve(WURZEL, konfiguration.musikOrdner);
const BIBLIOTHEK_DATEI = path.join(WURZEL, 'bibliothek.json');

const AUDIO_ENDUNGEN = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
};

// Die Bibliothek liegt im Speicher; geschrieben wird sie nur von der
// Analyseseite.
let bibliothek = [];

// Offene SSE-Verbindungen (Buehne und alle Handys).
const zuhoerer = new Set();

// --- Start ----------------------------------------------------------------

await bibliothekLaden();

const server = http.createServer((anfrage, antwort) => {
  behandeln(anfrage, antwort).catch((fehler) => {
    console.error('Fehler bei', anfrage.url, fehler);
    if (!antwort.headersSent) jsonAntwort(antwort, 500, { fehler: String(fehler) });
  });
});

// Der Port laesst sich von aussen setzen - praktisch, wenn parallel etwas
// anderes auf 3000 laeuft.
const PORT = Number(process.env.DJ_PORT) || konfiguration.port;

server.listen(PORT, () => {
  const adressen = lanAdressen();
  console.log('');
  console.log(`  ${konfiguration.anlass} - resident-dj laeuft`);
  console.log('');
  console.log(`  Buehne (Monitor)   http://localhost:${PORT}/buehne`);
  console.log(`  Messstand          http://localhost:${PORT}/messstand`);
  console.log('');
  console.log('  Notfall-Abstimmung im lokalen WLAN (normal laeuft das ueber Supabase):');
  for (const adresse of adressen) {
    console.log(`    http://${adresse}:${PORT}/p`);
  }
  if (adressen.length === 0) {
    console.log('    (keine LAN-Adresse gefunden - haengt der Laptop im WLAN?)');
  }
  console.log('');
  console.log(`  ${bibliothek.length} Tracks in der Bibliothek`);
  if (bibliothek.length === 0) {
    console.log(`  -> Musik nach musik/ legen, dann http://localhost:${PORT}/aufnahme oeffnen`);
    console.log('     und "Vermessen" druecken. Danach steht sie hier.');
  }
  console.log('');
});

// --- Weiche ---------------------------------------------------------------

async function behandeln(anfrage, antwort) {
  const url = new URL(anfrage.url, `http://${anfrage.headers.host}`);
  const weg = decodeURIComponent(url.pathname);

  // Kurzadressen: die tippt man am Abend von Hand ein.
  if (weg === '/') return datei(antwort, path.join(OEFFENTLICH, 'index.html'));
  if (weg === '/buehne') return datei(antwort, path.join(OEFFENTLICH, 'buehne/index.html'));
  if (weg === '/p' || weg === '/telefon') {
    return datei(antwort, path.join(OEFFENTLICH, 'telefon/index.html'));
  }
  // Die Bibliothek fuellen, ohne Vercel und ohne Supabase - siehe
  // public/aufnahme/aufnahme.js.
  if (weg === '/aufnahme') return datei(antwort, path.join(OEFFENTLICH, 'aufnahme/index.html'));
  /*
   * Der Messstand - mit Schraegstrich am Ende, und der ist kein Schoenheitsfehler.
   *
   * Die Seite laedt ihr Beiwerk relativ, weil sie unter zwei Adressen laufen
   * muss: hier und als /dj/messstand/index.html in der gebauten Fassung. Ohne
   * den Schraegstrich waere "/messstand" fuer den Browser eine Datei, und
   * "messstand.css" daneben landete bei "/messstand.css" - vierhundertvier.
   * Deshalb umgeleitet statt ausgeliefert.
   */
  if (weg === '/messstand') {
    antwort.writeHead(302, { Location: '/messstand/' });
    return antwort.end();
  }
  if (weg === '/messstand/') {
    return datei(antwort, path.join(OEFFENTLICH, 'messstand/index.html'));
  }
  // Ein Notenkopf als Symbol im Browsertab. Inline, damit keine Datei fehlen kann.
  if (weg === '/favicon.ico' || weg === '/favicon.svg') {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="7" fill="#0a0a0f"/>' +
      '<text x="16" y="23" font-size="19" text-anchor="middle">🎧</text></svg>';
    antwort.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=86400' });
    return antwort.end(svg);
  }

  if (weg.startsWith('/api/')) return api(anfrage, antwort, url, weg);
  if (weg.startsWith('/musik/')) return musikAusliefern(anfrage, antwort, weg.slice(7));

  // Alles andere sind statische Dateien aus public/.
  const ziel = path.join(OEFFENTLICH, weg);
  if (!ziel.startsWith(OEFFENTLICH)) return jsonAntwort(antwort, 403, { fehler: 'verboten' });
  return datei(antwort, ziel);
}

async function api(anfrage, antwort, url, weg) {
  // --- Lesen --------------------------------------------------------------
  if (weg === '/api/dateien' && anfrage.method === 'GET') {
    return jsonAntwort(antwort, 200, { dateien: await musikdateienSuchen() });
  }

  if (weg === '/api/bibliothek' && anfrage.method === 'GET') {
    return jsonAntwort(antwort, 200, { tracks: bibliothek });
  }

  if (weg === '/api/zustand' && anfrage.method === 'GET') {
    return jsonAntwort(antwort, 200, zustandsbild());
  }

  if (weg === '/api/strom') return stromOeffnen(anfrage, antwort);

  // --- Schreiben ----------------------------------------------------------
  if (weg === '/api/bibliothek' && anfrage.method === 'PUT') {
    const koerper = await koerperLesen(anfrage);
    bibliothek = koerper.tracks ?? [];
    await fsp.writeFile(BIBLIOTHEK_DATEI, JSON.stringify(bibliothek, null, 2));
    console.log(`Bibliothek gespeichert: ${bibliothek.length} Tracks`);
    verteilen();
    return jsonAntwort(antwort, 200, { anzahl: bibliothek.length });
  }

  // Die Buehne meldet, was sie gerade angefangen hat.
  if (weg === '/api/laeuft' && anfrage.method === 'POST') {
    const koerper = await koerperLesen(anfrage);
    zustand.laeuft = { ...koerper.track, begonnen: Date.now() };
    if (koerper.track?.id) alsGespieltVermerken(koerper.track.id);
    zustand.alsNaechstes = koerper.alsNaechstes ?? null;
    verteilen();
    return jsonAntwort(antwort, 200, { ok: true });
  }

  // Die Buehne fragt: was soll ich als naechstes vorbereiten?
  if (weg === '/api/naechster' && anfrage.method === 'GET') {
    const bpm = Number(url.searchParams.get('bpm')) || null;
    const wahl = naechsterTrack(bibliothek, bpm);
    if (!wahl) return jsonAntwort(antwort, 404, { fehler: 'Bibliothek ist leer' });
    zustand.alsNaechstes = wahl.track;
    verteilen();
    return jsonAntwort(antwort, 200, wahl);
  }

  if (weg === '/api/wunsch' && anfrage.method === 'POST') {
    const { trackId, geraetId, zuruecknehmen } = await koerperLesen(anfrage);
    if (!trackId || !geraetId) return jsonAntwort(antwort, 400, { fehler: 'unvollstaendig' });

    if (zuruecknehmen) {
      wunschZuruecknehmen(trackId, geraetId);
    } else {
      const grenze = konfiguration.abstimmung.wuenscheProGeraet;
      if (wuenscheVon(geraetId) >= grenze) {
        return jsonAntwort(antwort, 429, {
          fehler: `Du hast schon ${grenze} Wuensche offen. Erst mal abwarten.`,
        });
      }
      wunschEintragen(trackId, geraetId);
    }
    verteilen();
    return jsonAntwort(antwort, 200, { wuensche: wunschlisteMitTiteln() });
  }

  if (weg === '/api/richtung' && anfrage.method === 'POST') {
    const { geraetId, richtung } = await koerperLesen(anfrage);
    if (!geraetId || !['chilliger', 'haerter'].includes(richtung)) {
      return jsonAntwort(antwort, 400, { fehler: 'unbekannte Richtung' });
    }
    zustand.richtungen = zustand.richtungen.filter((r) => r.geraetId !== geraetId);
    zustand.richtungen.push({ geraetId, richtung, zeit: Date.now() });
    verteilen();
    return jsonAntwort(antwort, 200, { ziel: aktuelleZielenergie() });
  }

  // Notbremse fuer den Gastgeber: Energie von Hand setzen, null = Automatik.
  if (weg === '/api/hand' && anfrage.method === 'POST') {
    const { energie } = await koerperLesen(anfrage);
    zustand.handEnergie = energie === null ? null : Math.min(1, Math.max(0, Number(energie)));
    verteilen();
    return jsonAntwort(antwort, 200, { handEnergie: zustand.handEnergie });
  }

  return jsonAntwort(antwort, 404, { fehler: 'unbekannter Endpunkt' });
}

// --- Zustandsbild fuer die Clients ----------------------------------------

function zustandsbild() {
  return {
    anlass: konfiguration.anlass,
    laeuft: zustand.laeuft,
    alsNaechstes: zustand.alsNaechstes,
    zielenergie: aktuelleZielenergie(),
    handbetrieb: zustand.handEnergie !== null,
    wuensche: wunschlisteMitTiteln(),
    richtungen: zaehleRichtungen(),
    bibliotheksgroesse: bibliothek.length,
  };
}

function wunschlisteMitTiteln() {
  const nachId = new Map(bibliothek.map((t) => [t.id, t]));
  return wunschliste()
    .slice(0, 12)
    .map((eintrag) => {
      const track = nachId.get(eintrag.id);
      return {
        id: eintrag.id,
        stimmen: eintrag.stimmen,
        titel: track?.titel ?? eintrag.id,
        interpret: track?.interpret ?? '',
      };
    });
}

function zaehleRichtungen() {
  const jeGeraet = new Map();
  for (const r of frischeRichtungen()) jeGeraet.set(r.geraetId, r.richtung);
  let chilliger = 0;
  let haerter = 0;
  for (const richtung of jeGeraet.values()) {
    if (richtung === 'haerter') haerter++;
    else chilliger++;
  }
  return { chilliger, haerter };
}

// --- Server-Sent Events ---------------------------------------------------

function stromOeffnen(anfrage, antwort) {
  antwort.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  antwort.write('retry: 2000\n\n');
  senden(antwort, zustandsbild());
  zuhoerer.add(antwort);
  anfrage.on('close', () => zuhoerer.delete(antwort));
}

function senden(antwort, daten) {
  antwort.write(`data: ${JSON.stringify(daten)}\n\n`);
}

function verteilen() {
  const bild = zustandsbild();
  for (const antwort of zuhoerer) {
    try {
      senden(antwort, bild);
    } catch {
      zuhoerer.delete(antwort);
    }
  }
}

// Handys schlafen ein und WLAN-Router kappen stille Verbindungen. Ein Herzschlag
// haelt die Leitung offen.
setInterval(() => {
  for (const antwort of zuhoerer) {
    try {
      antwort.write(': herzschlag\n\n');
    } catch {
      zuhoerer.delete(antwort);
    }
  }
}, 15_000);

// Die Zielenergie wandert mit der Uhr, auch wenn niemand etwas tut. Einmal pro
// Minute nachschieben, damit die Anzeigen nicht einfrieren.
setInterval(verteilen, 60_000);

// --- Dateien --------------------------------------------------------------

async function musikdateienSuchen(ordner = MUSIK, praefix = '') {
  let gefunden = [];
  let eintraege;
  try {
    eintraege = await fsp.readdir(ordner, { withFileTypes: true });
  } catch {
    return gefunden;
  }

  for (const eintrag of eintraege) {
    if (eintrag.name.startsWith('.')) continue;
    const relativ = praefix ? `${praefix}/${eintrag.name}` : eintrag.name;
    if (eintrag.isDirectory()) {
      gefunden = gefunden.concat(
        await musikdateienSuchen(path.join(ordner, eintrag.name), relativ),
      );
    } else if (AUDIO_ENDUNGEN.has(path.extname(eintrag.name).toLowerCase())) {
      gefunden.push(relativ);
    }
  }
  return gefunden;
}

// Audio mit Range-Unterstuetzung. Ohne die kann der Browser nicht springen und
// manche Formate spielen gar nicht erst ab.
function musikAusliefern(anfrage, antwort, relativerWeg) {
  const ziel = path.join(MUSIK, relativerWeg);
  if (!ziel.startsWith(MUSIK)) return jsonAntwort(antwort, 403, { fehler: 'verboten' });

  let info;
  try {
    info = fs.statSync(ziel);
  } catch {
    return jsonAntwort(antwort, 404, { fehler: 'Datei nicht gefunden' });
  }

  const typ = MIME[path.extname(ziel).toLowerCase()] ?? 'application/octet-stream';
  const bereich = anfrage.headers.range;

  if (bereich) {
    const treffer = /bytes=(\d*)-(\d*)/.exec(bereich);
    const von = treffer[1] ? Number(treffer[1]) : 0;
    const bis = treffer[2] ? Number(treffer[2]) : info.size - 1;
    if (von >= info.size) {
      antwort.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
      return antwort.end();
    }
    antwort.writeHead(206, {
      'Content-Type': typ,
      'Content-Range': `bytes ${von}-${bis}/${info.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': bis - von + 1,
    });
    return fs.createReadStream(ziel, { start: von, end: bis }).pipe(antwort);
  }

  antwort.writeHead(200, {
    'Content-Type': typ,
    'Content-Length': info.size,
    'Accept-Ranges': 'bytes',
  });
  return fs.createReadStream(ziel).pipe(antwort);
}

function datei(antwort, ziel) {
  fs.readFile(ziel, (fehler, inhalt) => {
    if (fehler) return jsonAntwort(antwort, 404, { fehler: 'nicht gefunden' });
    antwort.writeHead(200, {
      'Content-Type': MIME[path.extname(ziel).toLowerCase()] ?? 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    antwort.end(inhalt);
  });
}

async function bibliothekLaden() {
  try {
    bibliothek = JSON.parse(await fsp.readFile(BIBLIOTHEK_DATEI, 'utf8'));
  } catch {
    bibliothek = [];
  }
}

// --- Kleinkram ------------------------------------------------------------

function jsonAntwort(antwort, status, daten) {
  const koerper = JSON.stringify(daten);
  antwort.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(koerper),
  });
  antwort.end(koerper);
}

function koerperLesen(anfrage) {
  return new Promise((aufloesen, ablehnen) => {
    let roh = '';
    anfrage.on('data', (stueck) => {
      roh += stueck;
      // Die Analyseseite schickt die komplette Bibliothek - das darf gross sein,
      // aber nicht unbegrenzt.
      if (roh.length > 20_000_000) ablehnen(new Error('Koerper zu gross'));
    });
    anfrage.on('end', () => {
      try {
        aufloesen(roh ? JSON.parse(roh) : {});
      } catch (fehler) {
        ablehnen(fehler);
      }
    });
    anfrage.on('error', ablehnen);
  });
}
