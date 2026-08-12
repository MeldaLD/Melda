// Eine Hoerprobe rendern: echte Datei rein, fertiger Remix als WAV raus.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/werkzeuge/hoerprobe.mjs datei.mp3 [sekunden]
//
// Alle Abnahmen messen Zahlen. Zahlen sagen, ob der Kick auf dem Raster sitzt
// und ob die Pumpe duckt - aber nicht, ob es gut klingt. Das entscheidet ein
// Ohr, und dafuer braucht es eine Datei zum Anhoeren.
//
// Gerendert wird mit demselben Code, der auch auf der Buehne laeuft: dieselbe
// Vermessung, dieselbe Signalkette (Hochpass, Pumpe, Begrenzer), dieselbe
// Maschine mit demselben Arrangement. Nur eben offline und schneller als in
// Echtzeit.
//
// Der Ausschnitt beginnt bewusst bei Takt 12 des Arrangements: Dort steht der
// Groove, und rund zwanzig Takte spaeter kommt der Kick-Drop. In neunzig
// Sekunden hoert man damit alles, worauf es ankommt.

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3200';
const CHROM = process.env.CHROMIUM_PFAD;
const DATEI = process.argv[2];
const SEKUNDEN = Number(process.argv[3] ?? 90);
const ZIEL = process.env.DJ_HOERPROBE ?? path.join(process.cwd(), 'hoerprobe.wav');
const ENERGIE = Number(process.env.DJ_ENERGIE ?? 0.7);

if (!DATEI) {
  console.error('Bitte eine Audiodatei angeben.');
  process.exit(1);
}

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage();
seite.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

try {
  await seite.goto(`${ADRESSE}/`, { waitUntil: 'domcontentloaded' });
  const rohdaten = Array.from(await fs.readFile(DATEI));

  console.log(`\nQuelle: ${path.basename(DATEI)}`);
  const ergebnis = await seite.evaluate(
    async ({ bytes, sekunden, energie }) => {
      const { analysiere } = await import('/gemeinsam/analyse.js');
      const { Maschine, arrangementFuer } = await import('/gemeinsam/maschine.js');

      const RATE = 44100;

      // 1. Vermessen - genau wie beim Hochladen.
      const messCtx = new OfflineAudioContext(1, 1, 22050);
      const messPuffer = await messCtx.decodeAudioData(new Uint8Array(bytes).slice().buffer);
      const befund = await analysiere(messPuffer);

      // 2. In voller Rate dekodieren, das ist die Fassung, die klingt.
      const vollCtx = new OfflineAudioContext(1, 1, RATE);
      const musikPuffer = await vollCtx.decodeAudioData(new Uint8Array(bytes).slice().buffer);

      // 3. Tempo waehlen. Traegt das Raster, uebernimmt die Maschine es;
      //    sonst setzt sie ihr eigenes.
      const traegt = !befund.ohneRaster;
      const bpm = traegt ? befund.bpm : 128;
      const proTakt = (60 / bpm) * 4;

      // Bei Takt 12 einsteigen: Groove steht, Kick-Drop kommt in Sichtweite.
      const startTakt = 12;
      const takte = Math.ceil(sekunden / proTakt);

      const ctx = new OfflineAudioContext(2, Math.ceil(RATE * sekunden), RATE);

      // --- Die Signalkette, wie im Mixer ---------------------------------
      const quelle = ctx.createBufferSource();
      quelle.buffer = musikPuffer;
      const angleich = ctx.createGain();
      angleich.gain.value = Math.pow(10, (befund.angleichDb ?? 0) / 20);

      const summe = ctx.createGain();
      summe.gain.value = 0.55;

      const musikHoch = ctx.createBiquadFilter();
      musikHoch.type = 'highpass';
      musikHoch.frequency.value = 165; // die Maschine bekommt den Keller
      musikHoch.Q.value = 0.7071;

      const pumpe = ctx.createGain();
      pumpe.gain.value = 1;

      const begrenzer = ctx.createDynamicsCompressor();
      begrenzer.threshold.value = -3;
      begrenzer.knee.value = 0;
      begrenzer.ratio.value = 20;
      begrenzer.attack.value = 0.002;
      begrenzer.release.value = 0.15;

      quelle.connect(angleich).connect(summe).connect(musikHoch).connect(pumpe).connect(begrenzer);
      begrenzer.connect(ctx.destination);

      const maschinenBus = ctx.createGain();
      maschinenBus.gain.value = 1;
      maschinenBus.connect(begrenzer);

      // Die Quelle laeuft ab einer Stelle, an der schon Musik ist.
      const abInDatei = traegt ? (befund.raster ?? 0) + startTakt * proTakt : 20;
      quelle.start(0, Math.min(abInDatei, Math.max(0, musikPuffer.duration - sekunden - 1)));
      quelle.stop(sekunden);

      // --- Die Maschine ----------------------------------------------------
      let duckZahl = 0;
      const maschine = new Maschine(ctx, maschinenBus, (zeit, tiefe, dauer) => {
        if (zeit < 0 || zeit > sekunden) return;
        duckZahl++;
        const g = pumpe.gain;
        g.setValueAtTime(1, zeit);
        g.linearRampToValueAtTime(tiefe, zeit + 0.006);
        g.exponentialRampToValueAtTime(1, zeit + Math.max(0.03, dauer));
      });
      maschine.zielenergie = energie;
      // Toene nur, wenn das Material selbst keine mitbringt - sonst laege der
      // Stich womoeglich in einer fremden Tonart.
      maschine.stiche = !traegt;
      maschine.bpm = bpm;
      // Anker so setzen, dass Schritt 0 des Renderings Takt `startTakt` ist.
      maschine.ankerZeit = -startTakt * proTakt;
      maschine.laeuft = true;

      const abschnitte = [];
      const vonSchritt = startTakt * 16;
      for (let s = vonSchritt; s < vonSchritt + takte * 16; s++) {
        const zeit = maschine.zeitFuerSchritt(s);
        if (zeit < -0.5 || zeit > sekunden) continue;
        maschine.schrittSpielen(s, zeit);
        if (s % 16 === 0) {
          abschnitte.push({
            sekunde: Math.round(zeit),
            takt: Math.floor(s / 16),
            name: arrangementFuer(Math.floor(s / 16)).name,
          });
        }
      }

      const fertig = await ctx.startRendering();

      // --- Als WAV ausgeben -------------------------------------------------
      const kanaele = [fertig.getChannelData(0), fertig.getChannelData(1)];
      const laenge = fertig.length;
      const bytesGesamt = 44 + laenge * 2 * 2;
      const puffer = new ArrayBuffer(bytesGesamt);
      const sicht = new DataView(puffer);
      const text = (versatz, zeichen) => {
        for (let i = 0; i < zeichen.length; i++) sicht.setUint8(versatz + i, zeichen.charCodeAt(i));
      };
      text(0, 'RIFF');
      sicht.setUint32(4, bytesGesamt - 8, true);
      text(8, 'WAVE');
      text(12, 'fmt ');
      sicht.setUint32(16, 16, true);
      sicht.setUint16(20, 1, true); // PCM
      sicht.setUint16(22, 2, true); // Stereo
      sicht.setUint32(24, RATE, true);
      sicht.setUint32(28, RATE * 2 * 2, true);
      sicht.setUint16(32, 4, true);
      sicht.setUint16(34, 16, true);
      text(36, 'data');
      sicht.setUint32(40, laenge * 2 * 2, true);

      let versatz = 44;
      let spitze = 0;
      for (let i = 0; i < laenge; i++) {
        for (let k = 0; k < 2; k++) {
          const wert = Math.max(-1, Math.min(1, kanaele[k][i]));
          if (Math.abs(wert) > spitze) spitze = Math.abs(wert);
          sicht.setInt16(versatz, wert < 0 ? wert * 0x8000 : wert * 0x7fff, true);
          versatz += 2;
        }
      }

      return {
        befund,
        bpm,
        traegt,
        duckZahl,
        spitze,
        abschnitte,
        wav: Array.from(new Uint8Array(puffer)),
      };
    },
    { bytes: rohdaten, sekunden: SEKUNDEN, energie: ENERGIE },
  );

  const b = ergebnis.befund;
  console.log(
    `  Vermessung: ${b.ohneRaster ? 'kein Raster' : `${b.bpm} BPM`}, ` +
      `Vertrauen ${(b.bpmVertrauen * 100).toFixed(0)} %, ${b.lufs} LUFS -> ` +
      `${b.angleichDb > 0 ? '+' : ''}${b.angleichDb} dB`,
  );
  console.log(
    `  Remix: ${ergebnis.bpm} BPM (${ergebnis.traegt ? 'Tempo des Tracks' : 'eigenes Tempo'}), ` +
      `Stufe fuer ${(ENERGIE * 100).toFixed(0)} % Energie, ${ergebnis.duckZahl} Sidechain-Senken`,
  );
  console.log(`  Spitze ${ergebnis.spitze.toFixed(3)}`);
  console.log('  Ablauf:');
  let vorher = null;
  for (const a of ergebnis.abschnitte) {
    if (a.name !== vorher) {
      console.log(`    ${String(a.sekunde).padStart(3)} s  Takt ${String(a.takt).padStart(2)}  ${a.name}`);
      vorher = a.name;
    }
  }

  await fs.writeFile(ZIEL, Buffer.from(ergebnis.wav));
  const groesse = (await fs.stat(ZIEL)).size;
  console.log(`\n  ${ZIEL} geschrieben – ${(groesse / 1e6).toFixed(1)} MB, ${SEKUNDEN} s\n`);
} finally {
  await browser.close();
}
