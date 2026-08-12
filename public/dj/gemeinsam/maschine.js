// Die Maschine: das Schlagwerk, das aus jedem Material Techno macht.
//
// Der Anlass war eine Feldaufnahme mit Meeresrauschen. Ein Beatmatcher kann
// damit nichts anfangen - es gibt keinen Beat, auf den er matchen koennte, und
// die Tempoerkennung meldete pflichtschuldig 161 BPM. Ein DJ wuerde so ein
// Stueck nicht einmischen. Er wuerde eine Drum Machine daruntersetzen, dem
// Rauschen den Bass wegnehmen und es als Flaeche benutzen.
//
// Genau das ist diese Datei. Sie erzeugt den Takt selbst, statt ihn zu suchen.
//
// Zwei Entscheidungen, die alles Weitere bestimmen:
//
//   1. Die Maschine hat eine *eigene* Uhr. Sie uebernimmt Tempo und Phase beim
//      Start einmal vom laufenden Deck und laeuft dann selbstaendig weiter.
//      Kein Nachregeln pro Bild, kein Zittern. Beide Uhren sind lineare
//      Funktionen der Kontextzeit, also bleiben sie von allein zusammen -
//      und bei rasterlosem Material gibt es ohnehin nichts, worauf man sich
//      einrasten koennte.
//
//   2. Geplant wird im Voraus, nicht im Bild. Die Bildrate schwankt, die
//      Audiouhr nicht. Jeder Aufruf von tick() plant alles, was in den
//      naechsten 250 ms faellig wird, mit absoluten Zeiten. Selbst wenn ein
//      Bild ausfaellt, sitzt der Kick.

import { kick, klatsch, hutZu, hutAuf, becken, rausch, stich } from './stimmen.js';

const SCHRITTE_PRO_TAKT = 16; // Sechzehntel
const TAKTE_PRO_BLOCK = 32; // ein voller Durchlauf des Arrangements
const MASCHINE_VORLAUF = 0.25; // Sekunden im Voraus planen

// Sechzehntel-Swing. 0.5 ist gerade, 0.56 ist der uebliche Wert fuer Techno:
// spuerbar, aber nicht nach Shuffle klingend.
const MASCHINE_SWING = 0.56;

// --- Muster ----------------------------------------------------------------
//
// Jedes Muster sind 16 Schritte mit Anschlagstaerke 0..1. Eine 0 heisst: hier
// passiert nichts.
//
// Der Vierviertel-Kick ist nicht verhandelbar - er ist der Grund, warum das
// Ganze als Techno durchgeht. Alles andere darf sich aendern.

const KICK_GERADE = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
// Ein zusaetzlicher Schlag kurz vor der Eins des naechsten Takts. Klassischer
// Vorwaertsdruck, aber nur in den harten Stufen - sonst stolpert es.
const KICK_SCHUB = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0.8, 0];

// Klatsch auf die Zwei und die Vier. Das ist der Backbeat; ohne ihn faellt der
// Takt auseinander, weil der Vierviertel-Kick allein keine Eins markiert.
const KLATSCH_ZWEI_VIER = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];

// Offene Hihat auf den Achtel-Offbeats - zwischen den Kicks. Der Puls, an dem
// man House und Techno von allem anderen unterscheidet.
const HUT_AUF_OFFBEAT = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];

// Geschlossene Hihats. Die Achtelfassung ist ruhig, die Sechzehntelfassung
// treibt. Wo die offene Hihat sitzt, bleibt die geschlossene weg - sonst
// klingen beide zusammen wie ein Fehler.
const HUT_ZU_ACHTEL = [0.7, 0, 0, 0, 0.7, 0, 0, 0, 0.7, 0, 0, 0, 0.7, 0, 0, 0];
const HUT_ZU_SECHZEHNTEL = [
  0.75, 0.4, 0, 0.45, 0.7, 0.4, 0, 0.45, 0.75, 0.4, 0, 0.45, 0.7, 0.4, 0, 0.5,
];

// Der tonale Stich. Synkopiert, damit er nicht auf dem Kick klebt.
const STICH_MUSTER = [0, 0, 0, 0.7, 0, 0, 1, 0, 0, 0, 0, 0.6, 0, 0, 0, 0];
// Eine Molltonleiter in Halbtonschritten ueber dem Grundton. Techno braucht
// keine Akkorde, aber ein wiederkehrendes Motiv macht aus einem Beat ein
// Stueck.
const STICH_MOTIV = [0, 0, 7, 10, 0, 3, 7, 12];

// --- Die Stufen ------------------------------------------------------------
//
// Wie hart es klingt, haengt an der Zielenergie des Abends - derselben Zahl,
// die auch die Uebergaenge steuert. Frueh ein trockener Kick und Achtel-Hats,
// spaeter Saettigung, Sechzehntel und Rumpeln.

const MASCHINE_STUFEN = [
  {
    bis: 0.35,
    name: 'Puls',
    kick: { muster: KICK_GERADE, abfall: 0.3, saettigung: 0, tonhoehe: 50 },
    hutZu: HUT_ZU_ACHTEL,
    hutAufPegel: 0.35,
    klatschPegel: 0.5,
    rumpeln: 0,
    stiche: false,
    duckTiefe: 0.75,
  },
  {
    bis: 0.6,
    name: 'Groove',
    kick: { muster: KICK_GERADE, abfall: 0.34, saettigung: 0.25, tonhoehe: 49 },
    hutZu: HUT_ZU_SECHZEHNTEL,
    hutAufPegel: 0.5,
    klatschPegel: 0.7,
    rumpeln: 0.35,
    stiche: true,
    duckTiefe: 0.6,
  },
  {
    bis: 0.8,
    name: 'Druck',
    kick: { muster: KICK_GERADE, abfall: 0.4, saettigung: 0.55, tonhoehe: 48 },
    hutZu: HUT_ZU_SECHZEHNTEL,
    hutAufPegel: 0.6,
    klatschPegel: 0.8,
    rumpeln: 0.6,
    stiche: true,
    duckTiefe: 0.45,
  },
  {
    bis: 1.01,
    name: 'Brett',
    kick: { muster: KICK_SCHUB, abfall: 0.46, saettigung: 0.85, tonhoehe: 46 },
    hutZu: HUT_ZU_SECHZEHNTEL,
    hutAufPegel: 0.7,
    klatschPegel: 0.9,
    rumpeln: 0.85,
    stiche: true,
    duckTiefe: 0.35,
  },
];

export function stufeFuer(zielenergie) {
  const wert = Math.min(1, Math.max(0, zielenergie ?? 0.5));
  return MASCHINE_STUFEN.find((s) => wert < s.bis) ?? MASCHINE_STUFEN[MASCHINE_STUFEN.length - 1];
}

// --- Das Arrangement -------------------------------------------------------
//
// Zweiunddreissig Takte, dann von vorn. Die Blockgrenzen liegen auf 4, 8 und
// 16 - genau da, wo elektronische Musik ihre Kanten hat.
//
// Der entscheidende Zug steht bei Takt 24: Der Kick geht raus. Das ist im
// Techno der staerkste Effekt ueberhaupt, und er kostet nichts. Vier Takte
// lang hat der Koerper vier Schlaege pro Takt gelernt; nimmt man sie weg,
// entsteht mehr Spannung als jeder Riser sie aufbauen kann. Wenn der Kick
// bei Takt 0 zurueckkommt, springt die Energie eine ganze Stufe hoch, ohne
// dass ein einziges neues Element dazugekommen waere.

/**
 * Was laeuft in Takt `takt` eines Blocks?
 * @param {number} takt 0..31
 * @returns {{kick:boolean, klatsch:boolean, hutZu:boolean, hutAuf:boolean,
 *            rumpeln:boolean, stiche:boolean, aufbau:number, name:string}}
 */
export function arrangementFuer(takt) {
  const t = ((takt % TAKTE_PRO_BLOCK) + TAKTE_PRO_BLOCK) % TAKTE_PRO_BLOCK;

  // Takt 24 bis 31: der Kick ist draussen und ein Rauschen faehrt hoch.
  // aufbau laeuft von 0 auf 1 und steuert Rauschen, Filter und Hall.
  if (t >= 24) {
    return {
      kick: false,
      klatsch: t >= 28,
      hutZu: true,
      hutAuf: true,
      rumpeln: false,
      stiche: t < 28,
      aufbau: (t - 24) / 8,
      name: 'Sog',
    };
  }
  if (t >= 16) {
    return { kick: true, klatsch: true, hutZu: true, hutAuf: true, rumpeln: true, stiche: true, aufbau: 0, name: 'Hoehepunkt' };
  }
  if (t >= 8) {
    return { kick: true, klatsch: true, hutZu: true, hutAuf: true, rumpeln: true, stiche: false, aufbau: 0, name: 'Groove' };
  }
  if (t >= 4) {
    return { kick: true, klatsch: false, hutZu: true, hutAuf: true, rumpeln: false, stiche: false, aufbau: 0, name: 'Kick rein' };
  }
  return { kick: false, klatsch: false, hutZu: true, hutAuf: false, rumpeln: false, stiche: false, aufbau: 0, name: 'Einzug' };
}

// --- Die Maschine ----------------------------------------------------------

export class Maschine {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} ziel        wohin das Schlagwerk geht (hinter der Pumpe)
   * @param {(zeit:number, tiefe:number, dauer:number)=>void} beiKick
   *        wird fuer jeden geplanten Kick gerufen, damit die Musik ducken kann
   */
  constructor(ctx, ziel, beiKick = () => {}) {
    this.ctx = ctx;
    this.beiKick = beiKick;

    this.laeuft = false;
    this.bpm = 130;
    this.ankerZeit = 0; // Kontextzeit von Schritt 0
    this.naechsterSchritt = 0;
    this.zielenergie = 0.5;
    this.stiche = false;

    // Ein eigener Bus, damit sich das ganze Schlagwerk in einem Zug ein- und
    // ausblenden laesst.
    //
    // 0,68 und nicht 1. Der Grund liegt auf der Zwei und der Vier: Dort faellt
    // der Klatsch mit dem Kick zusammen, und beide zusammen mit der Hi-Hat
    // standen nachgemessen bei 1,10 - ueber Vollaussteuerung.
    //
    // Nachgemessen wurde auch, was *nicht* daran schuld ist: Ohne Rumpeln
    // bleibt die Spitze gleich, ohne Stiche ebenfalls. Es ist wirklich nur
    // das Zusammentreffen der drei lautesten Stimmen auf demselben Schritt.
    //
    // Der Begrenzer im Mixer wuerde das auffangen, aber dann arbeitet er auf
    // jeder Zwei und jeder Vier - und dann atmet der ganze Abend im Backbeat.
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.68;

    // Der Rumpelweg. Kick -> langer Hall -> Verzerrung -> Tiefpass. Uebrig
    // bleibt eine Basswolke, die zwischen den Schlaegen weiterrollt. Das ist
    // der Klang, den moderner Techno unter dem Kick hat, und er entsteht nicht
    // aus einem Sample, sondern genau so.
    this.rumpelEingang = ctx.createGain();
    this.rumpelEingang.gain.value = 0;
    this.rumpelHall = ctx.createConvolver();
    this.rumpelHall.buffer = hallfahne(ctx, 2.6);
    this.rumpelForm = ctx.createWaveShaper();
    this.rumpelForm.curve = saettigungsKurve(3.5);
    this.rumpelTief = ctx.createBiquadFilter();
    this.rumpelTief.type = 'lowpass';
    this.rumpelTief.frequency.value = 150;
    this.rumpelTief.Q.value = 0.7071;
    this.rumpelPegel = ctx.createGain();
    this.rumpelPegel.gain.value = 0.9;

    this.rumpelEingang
      .connect(this.rumpelHall)
      .connect(this.rumpelForm)
      .connect(this.rumpelTief)
      .connect(this.rumpelPegel)
      .connect(this.bus);

    this.bus.connect(ziel);

    // Nur fuer die Anzeige und die Abnahme: was zuletzt geplant wurde.
    this.letzteEreignisse = [];
    this.geplanteKicks = [];
  }

  get schrittDauer() {
    return 60 / this.bpm / (SCHRITTE_PRO_TAKT / 4);
  }

  get stufe() {
    return stufeFuer(this.zielenergie);
  }

  /**
   * Uhr stellen und loslaufen.
   * @param {number} bpm
   * @param {number} ersterSchlag Kontextzeit eines Schlags, auf dem die Eins
   *        sitzen soll. Muss nicht in der Zukunft liegen - es wird vorwaerts
   *        gerechnet, bis der naechste Schritt hinter der Gegenwart liegt.
   */
  starten(bpm, ersterSchlag) {
    this.bpm = bpm;
    this.ankerZeit = ersterSchlag;
    this.laeuft = true;
    this.geplanteKicks = [];

    // Auf den naechsten Taktanfang ab jetzt vorspulen. Mitten in einem Takt
    // einzusteigen hoert sich nach Unfall an.
    const jetzt = this.ctx.currentTime;
    const proTakt = this.schrittDauer * SCHRITTE_PRO_TAKT;
    const takteVoraus = Math.max(0, Math.ceil((jetzt + 0.05 - this.ankerZeit) / proTakt));
    this.naechsterSchritt = takteVoraus * SCHRITTE_PRO_TAKT;
  }

  stoppen() {
    this.laeuft = false;
    this.geplanteKicks = [];
  }

  zeitFuerSchritt(schritt) {
    const roh = this.ankerZeit + schritt * this.schrittDauer;
    // Swing: die ungeraden Sechzehntel kommen etwas spaeter. Nur sie - die
    // geraden bleiben, wo sie sind, sonst waere es kein Swing, sondern ein
    // langsameres Tempo.
    const imTakt = ((schritt % SCHRITTE_PRO_TAKT) + SCHRITTE_PRO_TAKT) % SCHRITTE_PRO_TAKT;
    const versatz = imTakt % 2 === 1 ? (MASCHINE_SWING - 0.5) * 2 * this.schrittDauer : 0;
    return roh + versatz;
  }

  /** Auf welchem Takt des Arrangements steht die Maschine gerade? */
  taktJetzt() {
    const vergangen = this.ctx.currentTime - this.ankerZeit;
    return Math.floor(vergangen / (this.schrittDauer * SCHRITTE_PRO_TAKT));
  }

  /**
   * Alles planen, was in den naechsten MASCHINE_VORLAUF Sekunden faellig ist.
   * Jeden Bildaufbau einmal rufen. Mehrfaches Rufen schadet nicht - geplant
   * wird nur, was noch nicht geplant war.
   */
  tick() {
    if (!this.laeuft) return;
    const grenze = this.ctx.currentTime + MASCHINE_VORLAUF;

    // Deckel gegen eine Endlosschleife: Stand der Rechner still (Tabwechsel),
    // liegen tausende Schritte in der Vergangenheit. Die werden nicht
    // nachgeholt, sondern uebersprungen.
    let sicherung = 0;
    while (this.zeitFuerSchritt(this.naechsterSchritt) < grenze && sicherung++ < 256) {
      const zeit = this.zeitFuerSchritt(this.naechsterSchritt);
      if (zeit > this.ctx.currentTime - 0.05) this.schrittSpielen(this.naechsterSchritt, zeit);
      this.naechsterSchritt++;
    }

    // Abgelaufene Kicks aus der Liste werfen.
    const alt = this.ctx.currentTime - 1;
    this.geplanteKicks = this.geplanteKicks.filter((k) => k > alt);
  }

  schrittSpielen(schritt, zeit) {
    const stufe = this.stufe;
    const imTakt = ((schritt % SCHRITTE_PRO_TAKT) + SCHRITTE_PRO_TAKT) % SCHRITTE_PRO_TAKT;
    const takt = Math.floor(schritt / SCHRITTE_PRO_TAKT);
    const plan = arrangementFuer(takt);
    const ctx = this.ctx;
    const ziel = this.bus;

    // --- Kick, und mit ihm das Ducken der Musik ---------------------------
    const kickStaerke = stufe.kick.muster[imTakt];
    if (plan.kick && kickStaerke > 0) {
      kick(ctx, ziel, zeit, {
        pegel: kickStaerke,
        abfall: stufe.kick.abfall,
        tonhoehe: stufe.kick.tonhoehe,
        saettigung: stufe.kick.saettigung,
      });
      if (plan.rumpeln && stufe.rumpeln > 0) {
        // Der Rumpelweg bekommt denselben Kick, nur ohne Klick - der Hall
        // soll den Bass verlaengern, nicht den Anschlag verschmieren.
        kick(ctx, this.rumpelEingang, zeit, {
          pegel: kickStaerke * stufe.rumpeln,
          abfall: stufe.kick.abfall,
          tonhoehe: stufe.kick.tonhoehe,
          klick: 0,
          saettigung: 0,
        });
        this.rumpelEingang.gain.setValueAtTime(1, zeit);
      }
      // Die Musik wird geduckt. Etwas frueher als der Kick selbst: Der
      // Ohreindruck haengt am Einsetzen, und ein Sidechain, der erst mit dem
      // Kick beginnt, laesst den Anschlag durch.
      this.beiKick(zeit - 0.004, stufe.duckTiefe, this.schrittDauer * 2.4);
      this.geplanteKicks.push(zeit);
    }

    // --- Klatsch ----------------------------------------------------------
    if (plan.klatsch && KLATSCH_ZWEI_VIER[imTakt] > 0) {
      klatsch(ctx, ziel, zeit, { pegel: KLATSCH_ZWEI_VIER[imTakt] * stufe.klatschPegel });
    }

    // --- Hihats -----------------------------------------------------------
    const offen = HUT_AUF_OFFBEAT[imTakt] > 0;
    if (plan.hutAuf && offen) {
      hutAuf(ctx, ziel, zeit, { pegel: stufe.hutAufPegel, abfall: this.schrittDauer * 2.2 });
    }
    if (plan.hutZu && !offen) {
      const staerke = stufe.hutZu[imTakt];
      if (staerke > 0) hutZu(ctx, ziel, zeit, { pegel: staerke * 0.5 });
    }

    // --- Fuellsel am Taktende ---------------------------------------------
    // Alle acht Takte ein Sechzehntel-Wirbel auf den letzten Schlag, alle
    // sechzehn ein laengerer. Ohne so etwas klingt ein Muster nach zwei
    // Minuten wie eine Schleife, weil es eine ist.
    const taktImBlock = ((takt % TAKTE_PRO_BLOCK) + TAKTE_PRO_BLOCK) % TAKTE_PRO_BLOCK;
    const wirbelTakt = taktImBlock % 8 === 7;
    if (wirbelTakt && imTakt >= 12 && plan.hutZu) {
      hutZu(ctx, ziel, zeit, { pegel: 0.25 + ((imTakt - 12) / 3) * 0.4, abfall: 0.028 });
    }
    if (taktImBlock % 16 === 15 && imTakt >= 8 && plan.klatsch) {
      // Klatschwirbel vor dem Blockwechsel, dichter werdend.
      const dichte = imTakt >= 12 ? 1 : 2;
      if ((imTakt - 8) % dichte === 0) {
        klatsch(ctx, ziel, zeit, { pegel: 0.3 + ((imTakt - 8) / 7) * 0.5 });
      }
    }

    // --- Becken auf den Blockanfang ---------------------------------------
    if (taktImBlock === 0 && imTakt === 0) {
      becken(ctx, ziel, zeit, { pegel: 0.42, abfall: 1.8 });
    }

    // --- Der Sog: Rauschen faehrt hoch ------------------------------------
    // Nur einmal je Takt anstossen, sonst ueberlagern sich acht Sweeps.
    if (plan.aufbau > 0 && imTakt === 0) {
      const proTakt = this.schrittDauer * SCHRITTE_PRO_TAKT;
      rausch(ctx, ziel, zeit, {
        pegel: 0.1 + plan.aufbau * 0.32,
        dauer: proTakt,
        richtung: 'hoch',
      });
    }
    // Und der Schlag, mit dem der Kick zurueckkommt.
    if (taktImBlock === 0 && imTakt === 0) {
      rausch(ctx, ziel, zeit, { pegel: 0.3, dauer: 0.9, richtung: 'runter' });
    }

    // --- Stiche -----------------------------------------------------------
    if (this.stiche && plan.stiche && stufe.stiche && STICH_MUSTER[imTakt] > 0) {
      const halbton = STICH_MOTIV[(takt * 3 + imTakt) % STICH_MOTIV.length];
      stich(ctx, ziel, zeit, {
        pegel: STICH_MUSTER[imTakt] * 0.3,
        hertz: 110 * Math.pow(2, halbton / 12),
        abfall: this.schrittDauer * 1.6,
      });
    }

    if (imTakt === 0) {
      this.letzteEreignisse = [plan.name, stufe.name];
    }
  }

  /** Momentaufnahme fuer Anzeige und Abnahme. */
  zustand() {
    const takt = this.taktJetzt();
    const plan = arrangementFuer(takt);
    return {
      laeuft: this.laeuft,
      bpm: Number(this.bpm.toFixed(2)),
      takt,
      taktImBlock: ((takt % TAKTE_PRO_BLOCK) + TAKTE_PRO_BLOCK) % TAKTE_PRO_BLOCK,
      abschnitt: plan.name,
      stufe: this.stufe.name,
      aufbau: plan.aufbau,
      stimmen: [
        plan.kick && 'Kick',
        plan.klatsch && 'Klatsch',
        plan.hutZu && 'Hut',
        plan.hutAuf && 'Offen',
        plan.rumpeln && this.stufe.rumpeln > 0 && 'Rumpeln',
        this.stiche && plan.stiche && this.stufe.stiche && 'Stiche',
      ].filter(Boolean),
    };
  }
}

// --- Hilfsmittel -----------------------------------------------------------

// Eine kurze Hallfahne als Rauschen mit abfallender Huellkurve. Kein echter
// Raum, aber fuer den Rumpelweg geht es nicht um Raum, sondern nur darum, den
// Kick zeitlich auszuschmieren, bevor er durch Verzerrung und Tiefpass geht.
const hallfahnen = new WeakMap();

function hallfahne(ctx, sekunden) {
  const vorhanden = hallfahnen.get(ctx);
  if (vorhanden) return vorhanden;

  const laenge = Math.floor(ctx.sampleRate * sekunden);
  const puffer = ctx.createBuffer(2, laenge, ctx.sampleRate);
  for (let k = 0; k < 2; k++) {
    const daten = puffer.getChannelData(k);
    for (let i = 0; i < laenge; i++) {
      const rest = 1 - i / laenge;
      daten[i] = (Math.random() * 2 - 1) * Math.pow(rest, 2.5);
    }
  }
  hallfahnen.set(ctx, puffer);
  return puffer;
}

// tanh-artige Kennlinie. Bei kleinem Pegel fast gerade, bei grossem flach -
// das ist der Unterschied zwischen Saettigung und Uebersteuerung.
const kurven = new Map();

function saettigungsKurve(staerke) {
  const schluessel = staerke.toFixed(2);
  const fertig = kurven.get(schluessel);
  if (fertig) return fertig;

  const n = 2048;
  const kurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    kurve[i] = Math.tanh(x * staerke) / Math.tanh(staerke);
  }
  kurven.set(schluessel, kurve);
  return kurve;
}
