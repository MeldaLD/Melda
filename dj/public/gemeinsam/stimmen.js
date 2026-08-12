// Synthetisierte Technostimmen fuer die Web Audio API.
//
// Nur Klangerzeugung. Kein Planer, kein Muster, kein Gedaechtnis zwischen zwei
// Aufrufen - der Taktgeber ruft hier hinein und bekommt Geraeusch, sonst
// nichts. Genau diese Trennung macht das Timing pruefbar: Jede Stimme haengt
// ausschliesslich an der uebergebenen Zeit, nie an `currentTime`.
//
// Drei Regeln, die den Rest erklaeren:
//
// 1. Alles wird auf `zeit` geplant (`setValueAtTime`, `…AtTime`). Nichts
//    passiert "jetzt". Der Aufrufer plant bis zu 200 ms im Voraus, und eine
//    einzige `gain.value = …`-Zuweisung wuerde genau dort einen hoerbaren
//    Fehler erzeugen, den kein Nachmessen mehr findet.
// 2. Jede Quelle bekommt ein `stop()` mit fester Endzeit und raeumt sich beim
//    `ended` selbst aus dem Graphen. Ueber einen Abend laufen davon
//    Zehntausende durch; was liegen bleibt, bringt irgendwann das Tablet um.
// 3. Nur Standardknoten. Kein AudioWorklet, kein ScriptProcessor - das hier
//    muss auf iOS Safari laufen.
//
// Pegel: Bei `pegel: 1` zielt jede Stimme auf einen Spitzenwert um 0,6 bis
// 0,75. Nicht auf 1,0 - es kommen andere Stimmen und die laufende Musik dazu,
// und der Kopfraum dafuer muss hier schon eingeplant sein. Nachgemessen wird
// das in `pruefungen/stimmen.mjs`, nicht geschaetzt.
//
// `abfall` bedeutet ueberall dasselbe: die Zeit von der Spitze bis −26 dB
// (5 % der Spitze). Danach faellt die Huellkurve in einem kurzen linearen
// Ausklang auf null, damit nichts knackt. Diese Festlegung ist der Grund,
// warum die Abnahme die gemessene Laenge direkt gegen `abfall` halten kann.

// --- Grundwerte -----------------------------------------------------------

const STIMMEN_RAUSCH_SEKUNDEN = 2; // Laenge des gemeinsamen Rauschpuffers
const STIMMEN_HUELLE_BODEN = 0.05; // −26 dB: hier endet der exponentielle Abfall
const STIMMEN_AUSKLANG_ANTEIL = 0.25; // linearer Rest, als Anteil von `abfall`
const STIMMEN_AUSKLANG_MAX = 0.02; // … aber hoechstens 20 ms
const STIMMEN_NACHLAUF = 0.005; // Sicherheitsabstand vor dem stop()
const STIMMEN_KURVE_PUNKTE = 1024;
const STIMMEN_SAETTIGUNG_HAERTE = 3; // Kniewert der tanh-Kennlinie

// --- Kick (909-artig) -----------------------------------------------------

const STIMMEN_KICK_STARTTON = 120; // Hz, Anfang der Tonhoehenhuellkurve
const STIMMEN_KICK_GRUNDTON = 48; // Hz, Ziel des Sturzes
const STIMMEN_KICK_STURZ = 0.045; // s, Dauer des Sturzes
const STIMMEN_KICK_ANSTIEG = 0.002; // s
const STIMMEN_KICK_ABFALL = 0.34; // s
const STIMMEN_KICK_SPITZE = 0.62; // Zielspitze des Koerpers bei pegel 1
const STIMMEN_KICK_KLICK_DAUER = 0.005; // s
const STIMMEN_KICK_KLICK_HOCHPASS = 1500; // Hz
const STIMMEN_KICK_KLICK_SPITZE = 0.16;

// --- Klatsch --------------------------------------------------------------

const STIMMEN_KLATSCH_MITTE = 1200; // Hz
const STIMMEN_KLATSCH_GUETE = 1.2;
const STIMMEN_KLATSCH_KOERNER = 3;
const STIMMEN_KLATSCH_ABSTAND = 0.009; // s zwischen den Koernern
const STIMMEN_KLATSCH_KORN_ABFALL = 0.008; // s
const STIMMEN_KLATSCH_KORN_ANSTIEG = 0.0006; // s
const STIMMEN_KLATSCH_KORN_STAERKEN = [0.9, 1, 0.82]; // leicht ungleich, das lebt
const STIMMEN_KLATSCH_FAHNE = 0.13; // s
const STIMMEN_KLATSCH_FAHNE_ANTEIL = 0.5; // Hoehe der Fahne, bezogen auf die Spitze
const STIMMEN_KLATSCH_SPITZE = 1.75;

// --- Hi-Hats --------------------------------------------------------------

const STIMMEN_HUT_HOCHPASS = 7000; // Hz, zweistufig = 24 dB pro Oktave
const STIMMEN_HUT_ANSTIEG = 0.0006; // s
const STIMMEN_HUT_ZU_ABFALL = 0.032; // s
const STIMMEN_HUT_AUF_ABFALL = 0.3; // s
const STIMMEN_HUT_SPITZE = 0.45; // nachgemessen: ergibt 0,55 zu / 0,71 auf

// --- Becken ---------------------------------------------------------------

const STIMMEN_BECKEN_HOCHPASS = 5000; // Hz
const STIMMEN_BECKEN_GLANZ = 9000; // Hz, Peaking obendrauf
const STIMMEN_BECKEN_GLANZ_DB = 6;
const STIMMEN_BECKEN_GLANZ_GUETE = 0.8;
const STIMMEN_BECKEN_ANSTIEG = 0.001; // s
const STIMMEN_BECKEN_ABFALL = 1.4; // s
const STIMMEN_BECKEN_SPITZE = 0.2; // nachgemessen: ergibt rund 0,6

// --- Rauschanstieg --------------------------------------------------------

const STIMMEN_SWEEP_TIEF = 400; // Hz
const STIMMEN_SWEEP_HOCH = 8000; // Hz
const STIMMEN_SWEEP_GUETE = 1.4;
const STIMMEN_SWEEP_DAUER = 2; // s
const STIMMEN_SWEEP_ABRISS = 0.04; // s, der Bruch am Ende
const STIMMEN_SWEEP_START_ANTEIL = 0.004; // "fast nichts" am Anfang
const STIMMEN_SWEEP_SPITZE = 0.8; // nachgemessen: ergibt rund 0,7

// --- Stich ----------------------------------------------------------------

const STIMMEN_STICH_HERTZ = 110;
const STIMMEN_STICH_ABFALL = 0.22; // s
const STIMMEN_STICH_OSZILLATOREN = 3;
const STIMMEN_STICH_VERSTIMMUNG = 7; // Cent, aeussere Oszillatoren
const STIMMEN_STICH_ANSTIEG = 0.003; // s
const STIMMEN_STICH_OFFEN = 3000; // Hz, Tiefpass ganz auf
const STIMMEN_STICH_SCHLIESSEN = 0.18; // s
const STIMMEN_STICH_ZU_ANTEIL = 2.2; // Ziel des Tiefpasses als Vielfaches des Grundtons
const STIMMEN_STICH_GUETE = 1.1;
const STIMMEN_STICH_SPITZE = 0.42;

// --- gemeinsame Werkstatt -------------------------------------------------

// Pro AudioContext genau ein Rauschpuffer. Ein eigener Puffer je Stimme waere
// bei zehntausend Stimmen am Abend zehntausend Mal zwei Sekunden Zufall - das
// ist der teuerste denkbare Weg zu demselben Geraeusch.
const STIMMEN_PUFFER_JE_CTX = new WeakMap();

// Die Saettigungskennlinie haengt nur an der Mathematik, nicht am Context.
// Deshalb genuegt eine einzige pro Seite - noch sparsamer als "einmal pro
// ctx", und ein WaveShaper darf dieselbe Kurve mehrfach benutzen.
let stimmenKennlinie = null;

/**
 * Der gemeinsame Mono-Rauschpuffer (2 s), pro AudioContext einmal erzeugt.
 */
export function rauschpuffer(ctx) {
  const vorhanden = STIMMEN_PUFFER_JE_CTX.get(ctx);
  if (vorhanden) return vorhanden;

  const laenge = Math.floor(STIMMEN_RAUSCH_SEKUNDEN * ctx.sampleRate);
  const puffer = ctx.createBuffer(1, laenge, ctx.sampleRate);
  const daten = puffer.getChannelData(0);
  for (let i = 0; i < laenge; i++) daten[i] = Math.random() * 2 - 1;

  STIMMEN_PUFFER_JE_CTX.set(ctx, puffer);
  return puffer;
}

// Weiche Saettigung: tanh, auf ±1 normiert. Weil sie normiert ist, hebt sie
// den Spitzenwert nicht an - sie fuellt nur den Bauch auf. Genau darum wird
// der WaveShaper hier *vor* dem Pegelsteller eingehaengt, wo das Signal eine
// Spitze von 1 hat.
function stimmenSaettigungskurve() {
  if (stimmenKennlinie) return stimmenKennlinie;

  const kurve = new Float32Array(STIMMEN_KURVE_PUNKTE);
  const k = STIMMEN_SAETTIGUNG_HAERTE;
  const rand = Math.tanh(k);
  for (let i = 0; i < STIMMEN_KURVE_PUNKTE; i++) {
    const x = (i / (STIMMEN_KURVE_PUNKTE - 1)) * 2 - 1;
    kurve[i] = Math.tanh(k * x) / rand;
  }
  stimmenKennlinie = kurve;
  return kurve;
}

// Eine Rauschquelle aus dem gemeinsamen Puffer, an zufaelliger Stelle
// angesetzt. Der Versatz ist wichtig: Ohne ihn klaenge jede Hi-Hat des Abends
// exakt gleich, weil sie dieselben zweitausend Millisekunden Zufall liest.
function stimmenRauschquelle(ctx, zeit, dauer, schleife = false) {
  const puffer = rauschpuffer(ctx);
  const quelle = ctx.createBufferSource();
  quelle.buffer = puffer;
  quelle.loop = schleife;
  const spielraum = Math.max(0, puffer.duration - (schleife ? 0 : dauer));
  quelle.start(zeit, Math.random() * spielraum);
  return quelle;
}

// Die Standardhuellkurve: linearer Anstieg, exponentieller Abfall bis −26 dB,
// dann linear auf null. Gibt die Zeit zurueck, zu der sie verstummt ist.
//
// Der Anstieg ist linear und nicht exponentiell, weil er bei null beginnen
// soll - `exponentialRampToValueAtTime` kann das nicht, und ein Start bei
// 0,0001 statt bei 0 verschiebt den hoerbaren Einsatz.
function stimmenHuelle(param, zeit, anstieg, abfall, spitze) {
  const ausklang = Math.min(STIMMEN_AUSKLANG_MAX, abfall * STIMMEN_AUSKLANG_ANTEIL);
  param.setValueAtTime(0, zeit);
  param.linearRampToValueAtTime(spitze, zeit + anstieg);
  param.exponentialRampToValueAtTime(spitze * STIMMEN_HUELLE_BODEN, zeit + anstieg + abfall);
  param.linearRampToValueAtTime(0, zeit + anstieg + abfall + ausklang);
  return zeit + anstieg + abfall + ausklang;
}

// Beenden und abhaengen. Das `stop()` ist die Pflicht, das Abhaengen im
// `ended` die Kuer - ohne beides waechst der Graph den ganzen Abend lang.
function stimmenBeenden(quelle, knoten, endzeit) {
  quelle.stop(endzeit + STIMMEN_NACHLAUF);
  quelle.onended = () => {
    quelle.disconnect();
    for (const knoten1 of knoten) knoten1.disconnect();
  };
}

// Kleine Helfer, damit die Stimmen unten lesbar bleiben.
function stimmenFilter(ctx, art, hertz, zeit, guete = null, db = null) {
  const filter = ctx.createBiquadFilter();
  filter.type = art;
  filter.frequency.setValueAtTime(hertz, zeit);
  if (guete !== null) filter.Q.setValueAtTime(guete, zeit);
  if (db !== null) filter.gain.setValueAtTime(db, zeit);
  return filter;
}

function stimmenSteller(ctx, wert, zeit) {
  const knoten = ctx.createGain();
  knoten.gain.setValueAtTime(wert, zeit);
  return knoten;
}

// --- die Stimmen ----------------------------------------------------------

/**
 * Bassdrum, 909-artig: Sinus mit steilem Tonhoehensturz, kurzer Rauschklick
 * obendrauf, wahlweise weich gesaettigt.
 */
export function kick(ctx, ziel, zeit, opt = {}) {
  const {
    pegel = 1,
    abfall = STIMMEN_KICK_ABFALL,
    tonhoehe = STIMMEN_KICK_GRUNDTON,
    klick = 1,
    saettigung = 0,
  } = opt;

  // --- Koerper ---
  const oszillator = ctx.createOscillator();
  oszillator.type = 'sine';
  oszillator.frequency.setValueAtTime(STIMMEN_KICK_STARTTON, zeit);
  oszillator.frequency.exponentialRampToValueAtTime(
    Math.max(20, tonhoehe),
    zeit + STIMMEN_KICK_STURZ,
  );

  // Die Huellkurve laeuft auf Spitze 1, damit die Kennlinie darunter immer
  // dieselbe Aussteuerung sieht. Lautgemacht wird erst ganz am Ende.
  const huelle = ctx.createGain();
  const ende = stimmenHuelle(huelle.gain, zeit, STIMMEN_KICK_ANSTIEG, abfall, 1);

  const anteil = Math.min(1, Math.max(0, saettigung));
  const trocken = stimmenSteller(ctx, 1 - anteil, zeit);
  const geformt = stimmenSteller(ctx, anteil, zeit);
  const former = ctx.createWaveShaper();
  former.curve = stimmenSaettigungskurve();
  // 'none': Ueberabtastung wuerde den Einsatz um ein paar Abtastwerte
  // verschmieren, und Timing ist hier wichtiger als die letzte Oberwelle.
  former.oversample = 'none';

  const aus = stimmenSteller(ctx, STIMMEN_KICK_SPITZE * pegel, zeit);

  oszillator.connect(huelle);
  huelle.connect(trocken).connect(aus);
  huelle.connect(former).connect(geformt).connect(aus);
  aus.connect(ziel);

  oszillator.start(zeit);
  stimmenBeenden(oszillator, [huelle, trocken, geformt, former, aus], ende);

  // --- Anschlag ---
  if (klick > 0) {
    const quelle = stimmenRauschquelle(ctx, zeit, STIMMEN_KICK_KLICK_DAUER * 2);
    const hoch = stimmenFilter(ctx, 'highpass', STIMMEN_KICK_KLICK_HOCHPASS, zeit);
    const steller = ctx.createGain();
    const klickEnde = stimmenHuelle(
      steller.gain,
      zeit,
      0.0004,
      STIMMEN_KICK_KLICK_DAUER,
      STIMMEN_KICK_KLICK_SPITZE * klick * pegel,
    );
    quelle.connect(hoch).connect(steller).connect(ziel);
    stimmenBeenden(quelle, [hoch, steller], klickEnde);
  }
}

/**
 * Klatsch: bandbegrenztes Rauschen in drei dicht aufeinanderfolgenden Koernern
 * und einer Fahne. Die Koerner sind der ganze Punkt - ein einzelner Stoss
 * derselben Laenge klingt nach Rauschen, nicht nach Haenden.
 */
export function klatsch(ctx, ziel, zeit, opt = {}) {
  const {
    pegel = 1,
    koerner = STIMMEN_KLATSCH_KOERNER,
    abstand = STIMMEN_KLATSCH_ABSTAND,
    fahne = STIMMEN_KLATSCH_FAHNE,
    mitte = STIMMEN_KLATSCH_MITTE,
  } = opt;

  const spitze = STIMMEN_KLATSCH_SPITZE * pegel;
  const fahneAb = zeit + koerner * abstand;
  const ausklang = Math.min(STIMMEN_AUSKLANG_MAX, fahne * STIMMEN_AUSKLANG_ANTEIL);
  const ende = fahneAb + fahne + ausklang;

  const quelle = stimmenRauschquelle(ctx, zeit, ende - zeit + STIMMEN_NACHLAUF);
  const band = stimmenFilter(ctx, 'bandpass', mitte, zeit, STIMMEN_KLATSCH_GUETE);
  const steller = ctx.createGain();

  const param = steller.gain;
  param.setValueAtTime(0, zeit);
  for (let i = 0; i < koerner; i++) {
    const an = zeit + i * abstand;
    const hoch =
      spitze * (STIMMEN_KLATSCH_KORN_STAERKEN[i % STIMMEN_KLATSCH_KORN_STAERKEN.length] ?? 1);
    param.setValueAtTime(0, an);
    param.linearRampToValueAtTime(hoch, an + STIMMEN_KLATSCH_KORN_ANSTIEG);
    // Bis auf einen Rest herunter, nicht bis null: der naechste Korn-Einsatz
    // holt ihn ohnehin wieder hoch, und dazwischen soll eine hoerbare Kerbe
    // stehen, kein Loch.
    param.exponentialRampToValueAtTime(
      hoch * STIMMEN_HUELLE_BODEN,
      an + STIMMEN_KLATSCH_KORN_ABFALL,
    );
  }
  param.setValueAtTime(0, fahneAb);
  param.linearRampToValueAtTime(spitze * STIMMEN_KLATSCH_FAHNE_ANTEIL, fahneAb + 0.001);
  param.exponentialRampToValueAtTime(
    spitze * STIMMEN_KLATSCH_FAHNE_ANTEIL * STIMMEN_HUELLE_BODEN,
    fahneAb + fahne,
  );
  param.linearRampToValueAtTime(0, ende);

  quelle.connect(band).connect(steller).connect(ziel);
  stimmenBeenden(quelle, [band, steller], ende);
}

// Hi-Hats und Becken teilen sich denselben Bau: Rauschen, Hochpass, Huelle.
function stimmenRauschschlag(ctx, ziel, zeit, { hochpass, anstieg, abfall, spitze, glanz }) {
  const ausklang = Math.min(STIMMEN_AUSKLANG_MAX, abfall * STIMMEN_AUSKLANG_ANTEIL);
  const ende = zeit + anstieg + abfall + ausklang;

  const quelle = stimmenRauschschlagQuelle(ctx, zeit, ende - zeit);
  // Zwei Hochpaesse hintereinander: 24 dB pro Oktave. Mit nur einem bleibt zu
  // viel Mitte stehen, und die Hi-Hat setzt sich dann mit der Snare in die
  // Quere statt darueber zu sitzen.
  const hoch1 = stimmenFilter(ctx, 'highpass', hochpass, zeit);
  const hoch2 = stimmenFilter(ctx, 'highpass', hochpass, zeit);
  const steller = ctx.createGain();
  stimmenHuelle(steller.gain, zeit, anstieg, abfall, spitze);

  const kette = [hoch1, hoch2, steller];
  let letzter = quelle.connect(hoch1).connect(hoch2);
  if (glanz) {
    const spitzenfilter = stimmenFilter(
      ctx,
      'peaking',
      glanz,
      zeit,
      STIMMEN_BECKEN_GLANZ_GUETE,
      STIMMEN_BECKEN_GLANZ_DB,
    );
    kette.push(spitzenfilter);
    letzter = letzter.connect(spitzenfilter);
  }
  letzter.connect(steller).connect(ziel);
  stimmenBeenden(quelle, kette, ende);
}

// Eigener Name, damit der Helfer oben nicht mit `stimmenRauschquelle`
// verwechselt wird - er tut dasselbe, ist aber die Stelle, an der eine
// Hi-Hat spaeter einmal einen anderen Puffer bekommen koennte.
function stimmenRauschschlagQuelle(ctx, zeit, dauer) {
  return stimmenRauschquelle(ctx, zeit, dauer + STIMMEN_NACHLAUF);
}

/** Geschlossene Hi-Hat: sehr kurz. */
export function hutZu(ctx, ziel, zeit, opt = {}) {
  const { pegel = 1, abfall = STIMMEN_HUT_ZU_ABFALL, hochpass = STIMMEN_HUT_HOCHPASS } = opt;
  stimmenRauschschlag(ctx, ziel, zeit, {
    hochpass,
    anstieg: STIMMEN_HUT_ANSTIEG,
    abfall,
    spitze: STIMMEN_HUT_SPITZE * pegel,
    glanz: 0,
  });
}

/** Offene Hi-Hat: dasselbe Band, nur laenger. Gleicher Pegel - der Aufrufer regelt. */
export function hutAuf(ctx, ziel, zeit, opt = {}) {
  const { pegel = 1, abfall = STIMMEN_HUT_AUF_ABFALL, hochpass = STIMMEN_HUT_HOCHPASS } = opt;
  stimmenRauschschlag(ctx, ziel, zeit, {
    hochpass,
    anstieg: STIMMEN_HUT_ANSTIEG,
    abfall,
    spitze: STIMMEN_HUT_SPITZE * pegel,
    glanz: 0,
  });
}

/** Becken: tiefer angesetzter Hochpass, ein Glanz bei 9 kHz, langer Abfall. */
export function becken(ctx, ziel, zeit, opt = {}) {
  const { pegel = 1, abfall = STIMMEN_BECKEN_ABFALL, hochpass = STIMMEN_BECKEN_HOCHPASS } = opt;
  stimmenRauschschlag(ctx, ziel, zeit, {
    hochpass,
    anstieg: STIMMEN_BECKEN_ANSTIEG,
    abfall,
    spitze: STIMMEN_BECKEN_SPITZE * pegel,
    glanz: STIMMEN_BECKEN_GLANZ,
  });
}

/**
 * Der Aufbau-Sweep: Rauschen durch ein wanderndes Band, Lautstaerke waechst
 * mit. Am Ende bricht er ab statt auszuklingen - der Abriss ist die Stelle,
 * an der im Club der Drop sitzt.
 */
export function rausch(ctx, ziel, zeit, opt = {}) {
  const {
    pegel = 1,
    dauer = STIMMEN_SWEEP_DAUER,
    richtung = 'hoch',
    tief = STIMMEN_SWEEP_TIEF,
    hoch = STIMMEN_SWEEP_HOCH,
    guete = STIMMEN_SWEEP_GUETE,
    abriss = STIMMEN_SWEEP_ABRISS,
  } = opt;

  const aufwaerts = richtung !== 'runter';
  const von = aufwaerts ? tief : hoch;
  const bis = aufwaerts ? hoch : tief;
  const ende = zeit + dauer + abriss;
  const spitze = STIMMEN_SWEEP_SPITZE * pegel;

  // Schleife an: `dauer` darf laenger sein als der Rauschpuffer.
  const quelle = stimmenRauschquelle(ctx, zeit, dauer + abriss, true);
  const band = stimmenFilter(ctx, 'bandpass', von, zeit, guete);
  band.frequency.exponentialRampToValueAtTime(bis, zeit + dauer);

  const steller = ctx.createGain();
  // Die Lautstaerke folgt der Richtung. Aufwaerts ist der Aufbau: leise
  // beginnen, bis zum Abriss anwachsen. Abwaerts ist der Einschlag danach -
  // sofort voll da und wegfallend. Ein abwaertsfahrender Sweep, der dabei
  // lauter wird, klaenge wie ein Aufbau, der rueckwaerts laeuft.
  //
  // Exponentiell in beiden Richtungen, weil das Ohr Lautstaerke so hoert: Ein
  // linearer Aufbau steht die erste Haelfte lang scheinbar still und knallt
  // dann.
  if (aufwaerts) {
    steller.gain.setValueAtTime(spitze * STIMMEN_SWEEP_START_ANTEIL, zeit);
    steller.gain.exponentialRampToValueAtTime(spitze, zeit + dauer);
    steller.gain.linearRampToValueAtTime(0, ende);
  } else {
    steller.gain.setValueAtTime(spitze, zeit);
    steller.gain.exponentialRampToValueAtTime(spitze * STIMMEN_SWEEP_START_ANTEIL, zeit + dauer);
    steller.gain.linearRampToValueAtTime(0, ende);
  }

  quelle.connect(band).connect(steller).connect(ziel);
  stimmenBeenden(quelle, [band, steller], ende);
}

/**
 * Stich: kurzer tonaler Akzent aus leicht verstimmten Saegezaehnen hinter
 * einem Tiefpass mit eigener Huellkurve.
 */
export function stich(ctx, ziel, zeit, opt = {}) {
  const {
    pegel = 1,
    hertz = STIMMEN_STICH_HERTZ,
    abfall = STIMMEN_STICH_ABFALL,
    oszillatoren = STIMMEN_STICH_OSZILLATOREN,
    verstimmung = STIMMEN_STICH_VERSTIMMUNG,
    offen = STIMMEN_STICH_OFFEN,
    schliessen = STIMMEN_STICH_SCHLIESSEN,
  } = opt;

  const anzahl = Math.max(1, Math.min(3, Math.round(oszillatoren)));
  const summe = ctx.createGain();
  summe.gain.setValueAtTime(1 / anzahl, zeit);

  const tief = stimmenFilter(ctx, 'lowpass', offen, zeit, STIMMEN_STICH_GUETE);
  // Der Tiefpass schliesst schneller, als die Lautstaerke faellt. Genau das
  // macht aus einem Ton einen Stich: vorne Biss, hinten nur noch Grundton.
  tief.frequency.exponentialRampToValueAtTime(
    Math.max(60, hertz * STIMMEN_STICH_ZU_ANTEIL),
    zeit + schliessen,
  );

  const steller = ctx.createGain();
  const ende = stimmenHuelle(
    steller.gain,
    zeit,
    STIMMEN_STICH_ANSTIEG,
    abfall,
    STIMMEN_STICH_SPITZE * pegel,
  );

  summe.connect(tief).connect(steller).connect(ziel);

  // Cent-Werte um null herum: bei einem Oszillator genau null, sonst
  // symmetrisch verstimmt.
  for (let i = 0; i < anzahl; i++) {
    const oszillator = ctx.createOscillator();
    oszillator.type = 'sawtooth';
    oszillator.frequency.setValueAtTime(hertz, zeit);
    const versatz = anzahl === 1 ? 0 : (i / (anzahl - 1)) * 2 - 1;
    oszillator.detune.setValueAtTime(versatz * verstimmung, zeit);
    oszillator.connect(summe);
    oszillator.start(zeit);
    // Nur der erste haengt die geteilte Kette ab, die anderen sich selbst.
    stimmenBeenden(oszillator, i === 0 ? [summe, tief, steller] : [], ende);
  }
}
