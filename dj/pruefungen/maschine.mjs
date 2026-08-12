// Abnahme der Maschine - des Schlagwerks, das aus jedem Material Techno macht.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/maschine.mjs
//
// Zwei Teile, und der zweite ist der eigentliche Nachweis:
//
//   1. Das Arrangement als reine Rechnung. Kommt der Kick-Drop wirklich? Wird
//      es ueber den Abend haerter?
//   2. Die Maschine im Browser, mit gerendertem Ton. Sitzen die Kicks auf dem
//      Raster? Duckt die Pumpe die Musik? Und: Kommt am Ende etwas heraus,
//      das die Kennzeichen von Techno hat - gleichmaessiger Viervierteltakt
//      im Bass, Offbeats in den Hoehen, und ein Loch da, wo der Kick
//      herausgenommen wird?
//
// Punkt 2 laeuft ueber einen OfflineAudioContext. Damit ist das Ergebnis
// exakt reproduzierbar und schneller als Echtzeit - und man kann tatsaechlich
// nachzaehlen, statt es sich anzuhoeren und zu glauben.

import { chromium } from 'playwright';
import { arrangementFuer, stufeFuer } from '../public/gemeinsam/maschine.js';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
const CHROM = process.env.CHROMIUM_PFAD;

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

// --- 1. Das Arrangement als Rechnung ---------------------------------------

console.log('\nDas Arrangement ueber 32 Takte:');
const bloecke = [];
for (let takt = 0; takt < 32; takt++) bloecke.push({ takt, ...arrangementFuer(takt) });
let letzterName = null;
for (const b of bloecke) {
  if (b.name !== letzterName) {
    const bis = bloecke.filter((x) => x.name === b.name).at(-1).takt;
    console.log(
      `    Takt ${String(b.takt).padStart(2)}–${String(bis).padStart(2)}  ${b.name.padEnd(11)} ` +
        `${[b.kick && 'Kick', b.klatsch && 'Klatsch', b.hutAuf && 'Offen', b.rumpeln && 'Rumpeln'].filter(Boolean).join(' ')}`,
    );
    letzterName = b.name;
  }
}

const mitKick = bloecke.filter((b) => b.kick).length;
pruefe('der Kick laeuft die meiste Zeit', mitKick >= 16 && mitKick <= 24, `${mitKick} von 32 Takten`);
pruefe(
  'es gibt einen Kick-Drop vor dem Blockende',
  bloecke.slice(24).every((b) => !b.kick),
  'Takt 24 bis 31 ohne Kick',
);
pruefe('nach dem Drop kommt der Kick zurueck', bloecke[0].kick === false && bloecke[4].kick === true);
pruefe(
  'waehrend des Drops laeuft ein Aufbau hoch',
  bloecke[24].aufbau === 0 && bloecke[31].aufbau > 0.8,
  `${bloecke[24].aufbau.toFixed(2)} -> ${bloecke[31].aufbau.toFixed(2)}`,
);
pruefe('die Hihats laufen durchgehend', bloecke.every((b) => b.hutZu));

console.log('\nDie Stufen werden mit der Energie haerter:');
for (const e of [0.2, 0.5, 0.7, 0.95]) {
  const s = stufeFuer(e);
  console.log(
    `    ${(e * 100).toFixed(0).padStart(3)} %  ${s.name.padEnd(7)} ` +
      `Saettigung ${s.kick.saettigung.toFixed(2)}, Rumpeln ${s.rumpeln.toFixed(2)}, ` +
      `Duck auf ${(s.duckTiefe * 100).toFixed(0)} %`,
  );
}
pruefe('frueh ist der Kick trocken', stufeFuer(0.2).kick.saettigung === 0);
pruefe('spaet ist er gesaettigt', stufeFuer(0.95).kick.saettigung > 0.7);
pruefe('das Rumpeln waechst', stufeFuer(0.95).rumpeln > stufeFuer(0.5).rumpeln);
pruefe('spaet wird tiefer geduckt', stufeFuer(0.95).duckTiefe < stufeFuer(0.2).duckTiefe);

// --- 2. Der gerenderte Ton -------------------------------------------------

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage();
seite.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

try {
  await seite.goto(`${ADRESSE}/`, { waitUntil: 'domcontentloaded' });

  const BPM = 130;
  const befund = await seite.evaluate(async (bpm) => {
    const { Maschine } = await import('/gemeinsam/maschine.js');

    const RATE = 44100;
    const TAKTE = 40; // etwas mehr als ein voller Block
    const proTakt = (60 / bpm) * 4;
    const sekunden = TAKTE * proTakt + 2;

    const ctx = new OfflineAudioContext(1, Math.ceil(RATE * sekunden), RATE);

    // Als "Musik" ein Dauerton mit Rauschen: laut genug, um das Ducken
    // sichtbar zu machen, und ohne eigenen Rhythmus, damit alles Gemessene
    // wirklich von der Maschine kommt.
    const musik = ctx.createGain();
    musik.gain.value = 0.25;
    const traeger = ctx.createOscillator();
    traeger.type = 'sawtooth';
    traeger.frequency.value = 220;
    traeger.connect(musik);
    traeger.start(0);
    traeger.stop(sekunden);

    // Die Pumpe wie im Mixer: die Musik geht durch, das Schlagwerk daneben.
    const pumpe = ctx.createGain();
    pumpe.gain.value = 1;
    musik.connect(pumpe).connect(ctx.destination);

    const schlagwerk = ctx.createGain();
    schlagwerk.gain.value = 1;
    schlagwerk.connect(ctx.destination);

    const geduckt = [];
    const maschine = new Maschine(ctx, schlagwerk, (zeit, tiefe, dauer) => {
      geduckt.push(zeit);
      const g = pumpe.gain;
      g.setValueAtTime(1, zeit);
      g.linearRampToValueAtTime(tiefe, zeit + 0.006);
      g.exponentialRampToValueAtTime(1, zeit + Math.max(0.03, dauer));
    });
    maschine.zielenergie = 0.7;
    maschine.stiche = true;

    // Im Offline-Context laeuft currentTime nicht mit, solange nicht
    // gerendert wird. Also die Uhr direkt setzen und alle Schritte auf
    // einmal einplanen, statt tick() zu benutzen.
    maschine.bpm = bpm;
    maschine.ankerZeit = 0;
    maschine.laeuft = true;
    const schritteGesamt = TAKTE * 16;
    for (let s = 0; s < schritteGesamt; s++) {
      maschine.schrittSpielen(s, maschine.zeitFuerSchritt(s));
    }

    // Nur das Schlagwerk, ohne Musik - fuer alles, was den Ton der Maschine
    // selbst betrifft.
    const nurSchlagwerk = new OfflineAudioContext(1, Math.ceil(RATE * sekunden), RATE);
    const nurBus = nurSchlagwerk.createGain();
    nurBus.connect(nurSchlagwerk.destination);
    const m2 = new Maschine(nurSchlagwerk, nurBus, () => {});
    m2.zielenergie = 0.7;
    m2.stiche = true;
    m2.bpm = bpm;
    m2.ankerZeit = 0;
    m2.laeuft = true;
    for (let s = 0; s < schritteGesamt; s++) m2.schrittSpielen(s, m2.zeitFuerSchritt(s));

    // Ein dritter Durchgang eigens fuer die Frage "sitzen die Kicks?".
    //
    // In der Stufe "Druck" laeuft das Rumpeln mit: eine lange Basswolke, die
    // zwischen den Schlaegen weiterrollt. Genau dafuer ist sie da - aber ein
    // Anschlagsucher im Tiefband findet darin Huegel, die keine Kicks sind,
    // und misst dann Unsinn. Die Stufe "Puls" hat kein Rumpeln und ist eine
    // ganz normale Betriebsart des Abends, also wird das Timing dort gemessen.
    const nurKicks = new OfflineAudioContext(1, Math.ceil(RATE * sekunden), RATE);
    const kickBus = nurKicks.createGain();
    kickBus.connect(nurKicks.destination);
    const m3 = new Maschine(nurKicks, kickBus, () => {});
    m3.zielenergie = 0.2; // Stufe "Puls": kein Rumpeln
    m3.stiche = false;
    m3.bpm = bpm;
    m3.ankerZeit = 0;
    m3.laeuft = true;
    for (let s = 0; s < schritteGesamt; s++) m3.schrittSpielen(s, m3.zeitFuerSchritt(s));

    // Und ein vierter nur fuer die Pumpe: die Musik allein durch den
    // Sidechain, das Schlagwerk ins Leere. So misst man wirklich das Ducken
    // und nicht die Summe aus Ducken und Kick.
    const nurPumpe = new OfflineAudioContext(1, Math.ceil(RATE * sekunden), RATE);
    const pTraeger = nurPumpe.createOscillator();
    pTraeger.type = 'sine';
    pTraeger.frequency.value = 440;
    const pMusik = nurPumpe.createGain();
    pMusik.gain.value = 0.5;
    const pPumpe = nurPumpe.createGain();
    pPumpe.gain.value = 1;
    pTraeger.connect(pMusik).connect(pPumpe).connect(nurPumpe.destination);
    pTraeger.start(0);
    pTraeger.stop(sekunden);
    const pLeer = nurPumpe.createGain();
    pLeer.gain.value = 0; // das Schlagwerk selbst soll hier nicht klingen
    pLeer.connect(nurPumpe.destination);
    const pKicks = [];
    const m4 = new Maschine(nurPumpe, pLeer, (zeit, tiefe, dauer) => {
      pKicks.push(zeit);
      const g = pPumpe.gain;
      g.setValueAtTime(1, zeit);
      g.linearRampToValueAtTime(tiefe, zeit + 0.006);
      g.exponentialRampToValueAtTime(1, zeit + Math.max(0.03, dauer));
    });
    m4.zielenergie = 0.7;
    m4.bpm = bpm;
    m4.ankerZeit = 0;
    m4.laeuft = true;
    for (let s = 0; s < schritteGesamt; s++) m4.schrittSpielen(s, m4.zeitFuerSchritt(s));

    const [gemischt, allein, kickNur, pumpeNur] = await Promise.all([
      ctx.startRendering(),
      nurSchlagwerk.startRendering(),
      nurKicks.startRendering(),
      nurPumpe.startRendering(),
    ]);

    const daten = allein.getChannelData(0);
    const gesamt = gemischt.getChannelData(0);

    // Effektivwert je Takt, damit sich der Kick-Drop nachweisen laesst.
    const proTaktRms = [];
    for (let t = 0; t < TAKTE; t++) {
      const von = Math.floor(t * proTakt * RATE);
      const bis = Math.min(daten.length, Math.floor((t + 1) * proTakt * RATE));
      let s = 0;
      for (let i = von; i < bis; i++) s += daten[i] * daten[i];
      proTaktRms.push(Math.sqrt(s / Math.max(1, bis - von)));
    }

    // Wo liegen die Anschlaege im Bass? Der Kick ist das einzige, was unter
    // 150 Hz nennenswert Energie hat, also ist das eine saubere Spur.
    const bassCtx = new OfflineAudioContext(1, kickNur.length, RATE);
    const q = bassCtx.createBufferSource();
    q.buffer = kickNur;
    const tp1 = bassCtx.createBiquadFilter();
    const tp2 = bassCtx.createBiquadFilter();
    tp1.type = tp2.type = 'lowpass';
    tp1.frequency.value = tp2.frequency.value = 150;
    q.connect(tp1).connect(tp2).connect(bassCtx.destination);
    q.start();
    const bass = (await bassCtx.startRendering()).getChannelData(0);

    // Anschlaege im Bass finden: Huellkurve, dann lokale Maxima ueber einer
    // Schwelle, mit Sperrzeit gegen Doppelzaehlung.
    const fenster = Math.round(RATE * 0.005);
    const huelle = [];
    for (let i = 0; i + fenster < bass.length; i += fenster) {
      let s = 0;
      for (let j = i; j < i + fenster; j++) s += bass[j] * bass[j];
      huelle.push(Math.sqrt(s / fenster));
    }
    let hoechste = 0;
    for (const w of huelle) if (w > hoechste) hoechste = w;
    const schlaege = [];
    let sperre = -1;
    for (let i = 1; i < huelle.length - 1; i++) {
      if (
        huelle[i] > hoechste * 0.3 &&
        huelle[i] >= huelle[i - 1] &&
        huelle[i] > huelle[i + 1] &&
        i > sperre
      ) {
        schlaege.push((i * fenster) / RATE);
        sperre = i + Math.round(0.12 / 0.005);
      }
    }

    // Wie weit sitzt jeder Schlag neben dem naechsten Viertelraster?
    //
    // Achtung, die Zahl allein taeuscht: Gemessen wird an einer Bassspur, die
    // durch zwei Tiefpaesse bei 150 Hz gelaufen ist, und die haben selbst eine
    // Laufzeit. Dazu kommt, dass die Huellkurve eines Kicks ihren Hoechstwert
    // nicht im Anschlag hat, sondern ein paar Millisekunden danach. Beides
    // zusammen verschiebt *alle* Schlaege um denselben Betrag nach hinten.
    //
    // Ein gleichmaessiger Versatz ist aber kein Timingfehler - er faellt beim
    // Hoeren gar nicht auf, weil er jeden Schlag gleich trifft. Was auffiele,
    // waere Zittern. Deshalb wird unten der *Abstand zwischen* aufeinander
    // folgenden Schlaegen geprueft: Der ist gegen jede feste Laufzeit immun.
    const beat = 60 / bpm;
    const abweichungen = schlaege.map((t) => {
      const rest = t % beat;
      return Math.min(rest, beat - rest) * 1000;
    });

    // Abstaende zwischen benachbarten Schlaegen, sofern sie zusammengehoeren
    // (ueber den Kick-Drop hinweg klafft eine Luecke von acht Takten).
    const abstaende = [];
    for (let i = 1; i < schlaege.length; i++) {
      const d = schlaege[i] - schlaege[i - 1];
      if (d < beat * 1.5) abstaende.push(d * 1000);
    }
    const abstandMittel = abstaende.reduce((a, b) => a + b, 0) / Math.max(1, abstaende.length);
    const abstandStreuung = Math.sqrt(
      abstaende.reduce((a, b) => a + (b - abstandMittel) ** 2, 0) / Math.max(1, abstaende.length),
    );

    // Hoehen: liegt dort wirklich der Offbeat? Gemessen wird die Energie auf
    // den Achtel-Offbeats gegen die auf den Vierteln.
    const hochCtx = new OfflineAudioContext(1, allein.length, RATE);
    const q2 = hochCtx.createBufferSource();
    q2.buffer = allein;
    const hp = hochCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    q2.connect(hp).connect(hochCtx.destination);
    q2.start();
    const hoehen = (await hochCtx.startRendering()).getChannelData(0);

    const energieBei = (feld, zeit, breite = 0.03) => {
      const von = Math.max(0, Math.floor((zeit - breite / 4) * RATE));
      const bis = Math.min(feld.length, Math.floor((zeit + breite) * RATE));
      let s = 0;
      for (let i = von; i < bis; i++) s += feld[i] * feld[i];
      return Math.sqrt(s / Math.max(1, bis - von));
    };

    let aufViertel = 0;
    let aufOffbeat = 0;
    let zahl = 0;
    // Nur die Takte mit vollem Groove betrachten (8 bis 23).
    for (let t = 8; t < 24; t++) {
      for (let v = 0; v < 4; v++) {
        const grund = t * proTakt + v * beat;
        aufViertel += energieBei(hoehen, grund);
        aufOffbeat += energieBei(hoehen, grund + beat / 2);
        zahl++;
      }
    }
    aufViertel /= zahl;
    aufOffbeat /= zahl;

    // Duckt die Pumpe? Gemessen am eigenen Durchgang, in dem nur die Musik
    // klingt. Am Mischsignal waere die Frage nicht zu beantworten - der Kick
    // liegt genau dort, wo geduckt wird, und ein Filter trennt die beiden
    // nicht sauber genug.
    const musikPur = pumpeNur.getChannelData(0);
    let vorKick = 0;
    let nachKick = 0;
    let duckZahl = 0;
    for (const zeit of pKicks) {
      if (zeit < 9 * proTakt || zeit > 23 * proTakt) continue;
      // Kurz vor dem Kick ist die vorige Senke laengst wieder oben:
      // 277 ms Rueckkehr gegen 461 ms Schlagabstand bei 130 BPM.
      vorKick += energieBei(musikPur, zeit - 0.05, 0.025);
      nachKick += energieBei(musikPur, zeit + 0.012, 0.02);
      duckZahl++;
    }

    let spitzeMaschine = 0;
    for (const w of allein.getChannelData(0)) {
      const b = Math.abs(w);
      if (Number.isFinite(b) && b > spitzeMaschine) spitzeMaschine = b;
    }

    let spitzeGesamt = 0;
    let kaputt = 0;
    for (const w of gesamt) {
      if (!Number.isFinite(w)) { kaputt++; continue; }
      const b = Math.abs(w);
      if (b > spitzeGesamt) spitzeGesamt = b;
    }

    return {
      proTaktRms,
      schlaege: schlaege.length,
      abweichungMittel: abweichungen.reduce((a, b) => a + b, 0) / Math.max(1, abweichungen.length),
      abweichungMax: Math.max(...abweichungen, 0),
      abstandMittel,
      abstandStreuung,
      abstandSoll: beat * 1000,
      aufViertel,
      aufOffbeat,
      vorKick: vorKick / Math.max(1, duckZahl),
      nachKick: nachKick / Math.max(1, duckZahl),
      duckZahl,
      spitzeGesamt,
      spitzeMaschine,
      kaputt,
      proTakt,
    };
  }, BPM);

  console.log('\nDie Kicks sitzen auf dem Raster:');
  console.log(
    `    ${befund.schlaege} Bassanschlaege gefunden, im Mittel ` +
      `${befund.abweichungMittel.toFixed(2)} ms hinter dem Viertel (schlimmster ${befund.abweichungMax.toFixed(1)} ms)`,
  );
  console.log(
    `    Abstand von Schlag zu Schlag: ${befund.abstandMittel.toFixed(2)} ms ` +
      `(soll ${befund.abstandSoll.toFixed(2)}), Streuung ${befund.abstandStreuung.toFixed(2)} ms`,
  );
  pruefe('es wird ueberhaupt geschlagen', befund.schlaege > 60, `${befund.schlaege} Anschlaege`);
  // Das eigentliche Mass. Der Abstand zwischen zwei Schlaegen enthaelt keine
  // Filterlaufzeit mehr - die kuerzt sich heraus, weil sie beide gleich trifft.
  pruefe(
    'der Schlagabstand trifft das Tempo auf 1 ms',
    Math.abs(befund.abstandMittel - befund.abstandSoll) < 1,
    `${(befund.abstandMittel - befund.abstandSoll).toFixed(2)} ms daneben`,
  );
  pruefe(
    'und zittert nicht',
    befund.abstandStreuung < 2,
    `Streuung ${befund.abstandStreuung.toFixed(2)} ms`,
  );
  // Der gemeinsame Versatz darf trotzdem nicht beliebig gross werden: Waere er
  // es, laege der Fehler nicht mehr am Messfilter.
  pruefe(
    'der gemeinsame Versatz bleibt klein',
    befund.abweichungMax < 20,
    `${befund.abweichungMax.toFixed(1)} ms`,
  );

  console.log('\nDer Offbeat liegt in den Hoehen – das Kennzeichen von House und Techno:');
  console.log(
    `    Hoehenenergie auf dem Viertel ${befund.aufViertel.toFixed(4)}, ` +
      `auf dem Offbeat ${befund.aufOffbeat.toFixed(4)}`,
  );
  pruefe(
    'auf dem Offbeat steht mehr als auf dem Viertel',
    befund.aufOffbeat > befund.aufViertel * 1.3,
    `Faktor ${(befund.aufOffbeat / Math.max(1e-9, befund.aufViertel)).toFixed(2)}`,
  );

  console.log('\nDer Kick-Drop ist im Signal zu sehen:');
  const mittelGroove = befund.proTaktRms.slice(16, 24).reduce((a, b) => a + b, 0) / 8;
  const mittelSog = befund.proTaktRms.slice(24, 31).reduce((a, b) => a + b, 0) / 7;
  console.log(`    Hoehepunkt (Takt 16–23) ${mittelGroove.toFixed(4)}`);
  console.log(`    Sog        (Takt 24–30) ${mittelSog.toFixed(4)}`);
  pruefe('waehrend des Sogs faellt der Pegel', mittelSog < mittelGroove * 0.85);
  pruefe(
    'und danach kommt er zurueck',
    befund.proTaktRms[36] > mittelSog * 1.15,
    `Takt 36: ${befund.proTaktRms[36].toFixed(4)}`,
  );

  console.log('\nDie Pumpe duckt die Musik:');
  console.log(
    `    Musikpegel vor dem Kick ${befund.vorKick.toFixed(4)}, unmittelbar danach ${befund.nachKick.toFixed(4)} ` +
      `(${befund.duckZahl} Kicks gemessen)`,
  );
  pruefe('es wird ueberhaupt geduckt', befund.duckZahl > 40, `${befund.duckZahl} Kicks`);
  pruefe(
    'nach dem Kick ist die Musik hoerbar leiser',
    befund.nachKick < befund.vorKick * 0.8,
    `auf ${((befund.nachKick / Math.max(1e-9, befund.vorKick)) * 100).toFixed(0)} %`,
  );

  console.log('\nAussteuerung:');
  console.log(
    `    Maschine allein ${befund.spitzeMaschine.toFixed(3)}, ` +
      `mit Musik ${befund.spitzeGesamt.toFixed(3)}, ${befund.kaputt} unbrauchbare Abtastwerte`,
  );
  pruefe('nichts ist kaputt', befund.kaputt === 0);
  // Die Maschine allein muss unter eins bleiben. Im Mixer haengt hinter ihr
  // noch der Begrenzer, aber der soll Spitzen abfangen und nicht dauernd
  // arbeiten - sonst atmet der ganze Abend mit dem Kick.
  pruefe(
    'die Maschine allein bleibt unter Vollaussteuerung',
    befund.spitzeMaschine < 0.95,
    `${befund.spitzeMaschine.toFixed(3)}`,
  );
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
