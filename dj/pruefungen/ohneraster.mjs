// Abnahme des Falls, der den ganzen Umbau ausgeloest hat.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/ohneraster.mjs datei.mp3
//
// Eine echte Aufnahme ohne Beat - Meeresrauschen - wird vermessen und dann auf
// der Buehne gespielt. Drei Fragen:
//
//   1. Erkennt die Vermessung, dass hier kein Raster ist? (Vorher meldete sie
//      161,29 BPM und meinte es ernst.)
//   2. Springt die Maschine von allein an, ohne dass jemand etwas anklickt?
//   3. Kommt danach wirklich Techno heraus - Viervierteltakt im Bass, Offbeat
//      in den Hoehen?
//
// Ohne Datei als Argument wird eine ersatzweise erzeugt: fuenf Sekunden
// gefiltertes Rauschen mit langsamer Modulation. Das ist derselbe Fall,
// nur ohne dass eine 8-MB-Datei im Repository liegen muss.

import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
const CHROM = process.env.CHROMIUM_PFAD;
const DATEI = process.argv[2] ?? null;

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage();
seite.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

try {
  await seite.goto(`${ADRESSE}/`, { waitUntil: 'domcontentloaded' });

  const rohdaten = DATEI ? Array.from(await fs.readFile(DATEI)) : null;
  console.log(
    DATEI
      ? `\nMaterial: ${DATEI} (${(rohdaten.length / 1e6).toFixed(1)} MB)`
      : '\nMaterial: ersatzweise erzeugtes Meeresrauschen',
  );

  // --- 1. Die Vermessung ---------------------------------------------------

  const befund = await seite.evaluate(async (bytes) => {
    const { analysiere } = await import('/gemeinsam/analyse.js');

    let puffer;
    if (bytes) {
      const ctx = new OfflineAudioContext(1, 1, 22050);
      puffer = await ctx.decodeAudioData(new Uint8Array(bytes).buffer);
    } else {
      // Brandungsaehnliches Rauschen: breitbandig, langsam an- und
      // abschwellend, ohne jeden Anschlag.
      const rate = 22050;
      const sekunden = 40;
      const ctx = new OfflineAudioContext(1, rate * sekunden, rate);
      puffer = ctx.createBuffer(1, rate * sekunden, rate);
      const daten = puffer.getChannelData(0);
      let tief = 0;
      for (let i = 0; i < daten.length; i++) {
        const t = i / rate;
        // Zwei ueberlagerte langsame Schwellen, absichtlich nicht im Takt.
        const welle = 0.5 + 0.3 * Math.sin(t * 0.7) + 0.2 * Math.sin(t * 0.23);
        tief = tief * 0.995 + (Math.random() * 2 - 1) * 0.005;
        daten[i] = (Math.random() * 2 - 1) * 0.12 * welle + tief * 2;
      }
    }
    return { ...(await analysiere(puffer)), dauer: puffer.duration };
  }, rohdaten);

  console.log(
    `    gemessen: ${befund.bpm} BPM, Vertrauen ${(befund.bpmVertrauen * 100).toFixed(0)} %, ` +
      `${befund.lufs} LUFS -> Angleich ${befund.angleichDb > 0 ? '+' : ''}${befund.angleichDb} dB, ` +
      `Energie ${(befund.energie * 100).toFixed(0)} %`,
  );

  console.log('\nDie Vermessung gibt zu, dass sie hier nichts findet:');
  pruefe('kein Raster erkannt', befund.ohneRaster === true);
  pruefe('das Vertrauen liegt unter 35 %', befund.bpmVertrauen < 0.35, `${(befund.bpmVertrauen * 100).toFixed(0)} %`);
  pruefe('keine erfundenen Marken', (befund.marken ?? []).length === 0);
  // Leises Material auf Clubpegel zu ziehen holt das Rauschen der Aufnahme mit
  // hoch. Ein DJ liesse so ein Stueck leiser laufen.
  pruefe('der Angleich ist gedeckelt', befund.angleichDb <= 12.001, `${befund.angleichDb} dB`);
  pruefe('die Energie klebt nicht am Anschlag', befund.energie > 0 && befund.energie < 1);

  // --- 2. und 3. Auf der Buehne --------------------------------------------

  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });
  await seite.click('#startDemo');
  await seite.waitForSelector('#konsole:not([hidden])', { timeout: 120000 });
  await seite.waitForTimeout(1500);

  console.log('\nDie Maschine springt von allein an, sobald so ein Track laeuft:');
  const lauf = await seite.evaluate(async () => {
    const welt = window.__dj;
    const deck = welt.mixer.laufendesDeck;

    // Dem laufenden Deck ansagen, dass sein Raster nichts taugt - genau das,
    // was die Bibliothek fuer eine solche Aufnahme liefern wuerde.
    deck.track.ohneRaster = true;
    deck.track.bpmVertrauen = 0;

    // Ein paar Bilder abwarten, damit die Nachfuehrung greift.
    for (let i = 0; i < 20; i++) await new Promise((f) => requestAnimationFrame(f));
    await new Promise((f) => setTimeout(f, 2200)); // die Filterfahrt dauert 1,5 s

    const vorher = {
      laeuft: welt.maschineLaeuft,
      grund: welt.maschineGrund,
      vonHand: welt.maschineVonHand,
      stiche: welt.maschine?.stiche,
      hochpass: welt.mixer.musikHoch.frequency.value,
      maschinenPegel: welt.mixer.maschinenBus.gain.value,
    };

    // Laeuft der Planer wirklich weiter? Nach zwei Sekunden muss die Maschine
    // Takte gezaehlt haben.
    const taktA = welt.maschine?.zustand().takt;
    await new Promise((f) => setTimeout(f, 2200));
    const taktB = welt.maschine?.zustand().takt;

    return { ...vorher, taktA, taktB, zustand: welt.maschine?.zustand() };
  });

  console.log(
    `    Maschine ${lauf.laeuft ? 'laeuft' : 'steht'}, Grund: ${lauf.grund ?? '—'}, ` +
      `Stimmen: ${lauf.zustand?.stimmen.join(' · ') || '—'}`,
  );
  console.log(
    `    Musikhochpass auf ${Math.round(lauf.hochpass)} Hz, Schlagwerkpegel ${lauf.maschinenPegel.toFixed(2)}, ` +
      `Takt ${lauf.taktA} -> ${lauf.taktB}`,
  );

  pruefe('sie ist von allein angesprungen', lauf.laeuft === true);
  pruefe('und zwar nicht, weil jemand geklickt hat', lauf.vonHand === false);
  pruefe('sie steuert auch Toene bei, weil das Material keine hat', lauf.stiche === true);
  pruefe('der Musik wird der Bass weggenommen', lauf.hochpass > 100, `${Math.round(lauf.hochpass)} Hz`);
  pruefe('das Schlagwerk ist aufgedreht', lauf.maschinenPegel > 0.9);
  pruefe('der Planer laeuft weiter', lauf.taktB > lauf.taktA, `Takt ${lauf.taktA} -> ${lauf.taktB}`);

  console.log('\nUnd der Knopf schaltet sie wieder ab:');
  await seite.click('#remixJetzt');
  await seite.waitForTimeout(2200);
  const nachher = await seite.evaluate(() => ({
    laeuft: window.__dj.maschineLaeuft,
    pegel: window.__dj.mixer.maschinenBus.gain.value,
    hochpass: window.__dj.mixer.musikHoch.frequency.value,
    beschriftung: document.getElementById('remixJetzt').textContent.trim(),
  }));
  console.log(
    `    Knopf sagt "${nachher.beschriftung}", Schlagwerkpegel ${nachher.pegel.toFixed(2)}, ` +
      `Hochpass zurueck auf ${Math.round(nachher.hochpass)} Hz`,
  );
  pruefe('sie steht', nachher.laeuft === false);
  pruefe('das Schlagwerk ist ausgeblendet', nachher.pegel < 0.05, `${nachher.pegel.toFixed(3)}`);
  pruefe('die Musik hat ihren Bass zurueck', nachher.hochpass < 60, `${Math.round(nachher.hochpass)} Hz`);
  pruefe('der Knopf bietet wieder das Starten an', /starten/i.test(nachher.beschriftung));
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
