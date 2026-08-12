// Zwei Decks, ein Ausgang. Hier entsteht der Klang des Abends.
//
// Aufbau eines Decks:
//
//   Quelle -> Angleich -> Tief -> Mitte -> Hoch -> Filter -> Regler -> Summe
//                                                        \-> Echo-Weg -> Summe
//
//   Angleich  gleicht die Lautheit an (aus der Messung beim Einlesen)
//   Tief/Mitte/Hoch  der Dreiband-Entzerrer, Tief traegt den Bass-Tausch
//   Filter    Hochpass fuer Aufzuege, im Ruhezustand durchlaessig
//   Regler    die eigentliche Blende
//
// Die Summe laeuft ueber einen Begrenzer. Zwei Tracks gleichzeitig sind
// zusammen lauter als einer - ohne Kopfraum verzerrt genau der Moment, auf den
// alle warten.

import { uebergangWaehlen } from './remix.js';
import {
  beatDauer,
  beatZeit,
  naechstePhrase,
  naechsterTakt,
  tempoVerhaeltnis,
  kontextZeitVonBeat,
  stelleInDatei,
} from './takt.js';

// Wie tief der Bass gekappt wird, wenn ein Deck ihn abgeben muss.
const BASS_AUS = -32;

// --- Uebergaenge als Ablaufplan -------------------------------------------
//
// Jeder Uebergang ist eine Liste von Zielwerten auf einer Beat-Achse. Als
// Daten statt als Code, damit die Buehne mitzeichnen kann, was gerade passiert,
// und damit ein neuer Uebergang ein paar Zeilen ist und keine neue Funktion.

// Jede Kurve beginnt bei Beat 0 mit ihrem Ausgangswert. Das ist keine
// Foermelei: Ohne diesen Startpunkt weiss der Browser nicht, von wo aus er
// rampen soll, und macht aus jeder Blende einen Sprung. Haltepunkte
// (derselbe Wert zweimal) formen die Kurve - erst halten, dann bewegen.
export const UEBERGAENGE = {
  blende: {
    name: 'Lange Blende',
    beschreibung: 'Beide grooven, in der Mitte wechselt der Bass das Deck.',
    beats: 32,
    schritte: [
      // Der Neue kommt ueber 16 Beats herein, aber ohne Bass.
      { beat: 0, deck: 'neu', regler: 'blende', wert: 0 },
      { beat: 16, deck: 'neu', regler: 'blende', wert: 1 },
      { beat: 0, deck: 'neu', regler: 'tief', wert: BASS_AUS },
      { beat: 15, deck: 'neu', regler: 'tief', wert: BASS_AUS },
      { beat: 17, deck: 'neu', regler: 'tief', wert: 0 },

      // Der Bass-Tausch: In zwei Beats wechselt das Fundament das Deck. Zwei
      // Bassdrums uebereinander sind Matsch - deshalb gehoert der Bass zu
      // jedem Zeitpunkt genau einem.
      { beat: 0, deck: 'alt', regler: 'tief', wert: 0 },
      { beat: 15, deck: 'alt', regler: 'tief', wert: 0 },
      { beat: 17, deck: 'alt', regler: 'tief', wert: BASS_AUS },

      // Der Alte haelt, bis der Neue steht, und geht dann.
      { beat: 0, deck: 'alt', regler: 'blende', wert: 1 },
      { beat: 20, deck: 'alt', regler: 'blende', wert: 1 },
      { beat: 32, deck: 'alt', regler: 'blende', wert: 0 },
      { beat: 0, deck: 'alt', regler: 'hoch', wert: 0 },
      { beat: 20, deck: 'alt', regler: 'hoch', wert: 0 },
      { beat: 30, deck: 'alt', regler: 'hoch', wert: -12 },
    ],
  },

  aufzug: {
    name: 'Filteraufzug',
    beschreibung: 'Der Alte wird nach oben weggefiltert, der Neue setzt sich drunter.',
    beats: 16,
    schritte: [
      { beat: 0, deck: 'neu', regler: 'blende', wert: 0 },
      { beat: 8, deck: 'neu', regler: 'blende', wert: 1 },
      { beat: 0, deck: 'neu', regler: 'tief', wert: BASS_AUS },
      { beat: 10, deck: 'neu', regler: 'tief', wert: BASS_AUS },
      { beat: 12, deck: 'neu', regler: 'tief', wert: 0 },

      // Dem Alten wird von unten der Boden weggezogen, bis nur noch ein
      // duenner Rest ueber dem Neuen liegt.
      { beat: 0, deck: 'alt', regler: 'filter', wert: 20 },
      { beat: 4, deck: 'alt', regler: 'filter', wert: 120 },
      { beat: 12, deck: 'alt', regler: 'filter', wert: 900 },
      { beat: 15, deck: 'alt', regler: 'filter', wert: 4000 },
      { beat: 0, deck: 'alt', regler: 'tief', wert: 0 },
      { beat: 10, deck: 'alt', regler: 'tief', wert: 0 },
      { beat: 12, deck: 'alt', regler: 'tief', wert: BASS_AUS },
      { beat: 0, deck: 'alt', regler: 'blende', wert: 1 },
      { beat: 12, deck: 'alt', regler: 'blende', wert: 1 },
      { beat: 16, deck: 'alt', regler: 'blende', wert: 0 },
    ],
  },

  echo: {
    name: 'Echo-Schnitt',
    beschreibung: 'Der Alte geht ins Echo und wird weggeschnitten. Klingt nach Absicht.',
    beats: 8,
    schritte: [
      { beat: 0, deck: 'neu', regler: 'blende', wert: 1 },
      { beat: 0, deck: 'neu', regler: 'tief', wert: 0 },

      // Erst den Hall aufmachen, dann die Quelle wegnehmen - der Rest haengt
      // noch ein paar Schlaege in der Luft und loest sich auf.
      { beat: 0, deck: 'alt', regler: 'echo', wert: 0 },
      { beat: 0.5, deck: 'alt', regler: 'echo', wert: 0.6 },
      { beat: 2, deck: 'alt', regler: 'echo', wert: 0.6 },
      { beat: 4, deck: 'alt', regler: 'echo', wert: 0 },
      { beat: 0, deck: 'alt', regler: 'blende', wert: 1 },
      { beat: 1.5, deck: 'alt', regler: 'blende', wert: 1 },
      { beat: 2, deck: 'alt', regler: 'blende', wert: 0 },
    ],
  },

  schnitt: {
    name: 'Harter Schnitt',
    beschreibung: 'Notfall. Auf der Eins umschalten klingt immer noch richtig.',
    beats: 1,
    schritte: [
      { beat: 0, deck: 'neu', regler: 'blende', wert: 1 },
      { beat: 0, deck: 'neu', regler: 'tief', wert: 0 },
      { beat: 0, deck: 'alt', regler: 'blende', wert: 1 },
      // Nicht ganz hart: 30 Millisekunden verhindern das Knacken, hoerbar ist
      // der Unterschied zum Schnitt nicht.
      { beat: 0.05, deck: 'alt', regler: 'blende', wert: 0 },
    ],
  },
};

// Welcher Uebergang passt gerade? Das entscheidet die Regie in remix.js
// anhand der Zielenergie - frueh am Abend lange Blenden, spaeter Schnitte.
export function waehleUebergang({ tempoPasst, energiesprung, zielenergie = 0.5 }) {
  return uebergangWaehlen({ zielenergie, tempoPasst, energiesprung });
}

// --- Ein Deck -------------------------------------------------------------

class Deck {
  constructor(ctx, summe, echoWeg, name) {
    this.ctx = ctx;
    this.name = name;
    this.track = null;
    this.quelle = null;
    this.startZeit = 0;
    this.startInDatei = 0;
    this.tempo = 1;
    this.laeuft = false;

    this.angleich = ctx.createGain();
    this.tief = ctx.createBiquadFilter();
    this.mitte = ctx.createBiquadFilter();
    this.hoch = ctx.createBiquadFilter();
    this.filter = ctx.createBiquadFilter();
    this.blende = ctx.createGain();
    this.echo = ctx.createGain();

    this.tief.type = 'lowshelf';
    this.tief.frequency.value = 200;
    this.mitte.type = 'peaking';
    this.mitte.frequency.value = 1000;
    this.mitte.Q.value = 0.8;
    this.hoch.type = 'highshelf';
    this.hoch.frequency.value = 4000;

    // Im Ruhezustand durchlaessig: 20 Hz Hochpass hoert man nicht.
    this.filter.type = 'highpass';
    this.filter.frequency.value = 20;
    this.filter.Q.value = 0.8;

    this.blende.gain.value = 0;
    this.echo.gain.value = 0;

    this.angleich
      .connect(this.tief)
      .connect(this.mitte)
      .connect(this.hoch)
      .connect(this.filter)
      .connect(this.blende)
      .connect(summe);
    this.blende.connect(this.echo).connect(echoWeg);
  }

  // Der Regler hinter einem Namen aus dem Ablaufplan.
  parameter(regler) {
    switch (regler) {
      case 'blende':
        return this.blende.gain;
      case 'tief':
        return this.tief.gain;
      case 'mitte':
        return this.mitte.gain;
      case 'hoch':
        return this.hoch.gain;
      case 'filter':
        return this.filter.frequency;
      case 'echo':
        return this.echo.gain;
      default:
        throw new Error(`unbekannter Regler: ${regler}`);
    }
  }

  // Alles auf Anfang, ohne Knacken.
  zuruecksetzen(zeit) {
    for (const [regler, wert] of [
      ['tief', 0],
      ['mitte', 0],
      ['hoch', 0],
      ['filter', 20],
      ['echo', 0],
    ]) {
      const p = this.parameter(regler);
      p.cancelScheduledValues(zeit);
      p.setValueAtTime(wert, zeit);
    }
  }

  starten({ track, puffer, zeit, startInDatei, tempo, blende }) {
    this.stoppen(zeit);

    const quelle = this.ctx.createBufferSource();
    quelle.buffer = puffer;
    quelle.playbackRate.value = tempo;
    quelle.connect(this.angleich);

    // Lautheitsangleich aus der Messung. Ohne den springt der naechste Track
    // um bis zu zwoelf Dezibel - der haesslichste Fehler ueberhaupt.
    const db = track.angleichDb ?? 0;
    this.angleich.gain.cancelScheduledValues(zeit);
    this.angleich.gain.setValueAtTime(10 ** (db / 20), zeit);

    this.zuruecksetzen(zeit);
    this.blende.gain.cancelScheduledValues(zeit);
    this.blende.gain.setValueAtTime(blende, zeit);

    quelle.start(zeit, Math.max(0, startInDatei));

    this.quelle = quelle;
    this.track = track;
    this.geplanterAnker = null;
    this.startZeit = zeit;
    this.startInDatei = startInDatei;
    this.tempo = tempo;
    this.laeuft = true;
  }

  // Eine Verankerung, die erst spaeter gilt. Ein Loop-Roll wiederholt Material,
  // also laufen Musikzeit und Dateizeit auseinander; ab dem Zielbeat stimmt
  // beides wieder, und genau dann wird umgehaengt.
  verankernAb(abZeit, startZeit, startInDatei) {
    this.geplanterAnker = { abZeit, startZeit, startInDatei };
  }

  ankerPruefen() {
    const geplant = this.geplanterAnker;
    if (geplant && this.ctx.currentTime >= geplant.abZeit) {
      this.startZeit = geplant.startZeit;
      this.startInDatei = geplant.startInDatei;
      this.geplanterAnker = null;
    }
  }

  stoppen(zeit) {
    this.geplanterAnker = null;
    if (!this.quelle) return;
    try {
      this.quelle.stop(zeit);
    } catch {
      // Schon gestoppt - macht nichts.
    }
    this.quelle = null;
    this.laeuft = false;
  }

  // Wo steht das Deck jetzt in seiner Datei?
  stelle(jetzt = this.ctx.currentTime) {
    if (!this.laeuft) return 0;
    this.ankerPruefen();
    return stelleInDatei(this, jetzt);
  }

  // Das tatsaechlich klingende Tempo, inklusive Angleich.
  effektivBpm() {
    return this.track ? this.track.bpm * this.tempo : null;
  }
}

// --- Der Mixer ------------------------------------------------------------

export class Mixer {
  constructor(ctx) {
    this.ctx = ctx;
    this.wechselZaehler = 0;
    this.laufenderUebergang = null;

    this.summe = ctx.createGain();
    this.begrenzer = ctx.createDynamicsCompressor();
    this.ausgang = ctx.createGain();
    this.messung = ctx.createAnalyser();

    // Kopfraum: die Summe laeuft mit Reserve, der Begrenzer faengt nur die
    // Spitzen ab. Er soll nicht dauernd arbeiten, sondern nur verhindern, dass
    // ein Uebergang in die Verzerrung laeuft.
    this.summe.gain.value = 0.55;
    this.begrenzer.threshold.value = -3;
    this.begrenzer.knee.value = 0;
    this.begrenzer.ratio.value = 20;
    this.begrenzer.attack.value = 0.002;
    this.begrenzer.release.value = 0.15;
    this.ausgang.gain.value = 1;

    this.messung.fftSize = 2048;
    this.messung.smoothingTimeConstant = 0.75;

    // Der Echo-Weg fuer den Echo-Schnitt: eine Verzoegerung mit Rueckfuehrung,
    // die sich von selbst totlaeuft.
    this.echoWeg = ctx.createGain();
    this.verzoegerung = ctx.createDelay(2);
    this.rueckfuehrung = ctx.createGain();
    this.verzoegerung.delayTime.value = 0.35;
    this.rueckfuehrung.gain.value = 0.45;
    this.echoWeg.connect(this.verzoegerung);
    this.verzoegerung.connect(this.rueckfuehrung).connect(this.verzoegerung);
    this.verzoegerung.connect(this.summe);

    // --- Der Weg fuer den Remix -------------------------------------------
    //
    // Zwischen Summe und Begrenzer haengen drei Knoten, die im Normalbetrieb
    // nichts tun und erst gebraucht werden, wenn die Maschine laeuft:
    //
    //   musikHoch   nimmt der Quelle den Bass weg. Der Kick der Maschine soll
    //               den Keller allein haben - dieselbe Regel wie zwischen zwei
    //               Decks, nur eben zwischen Musik und Schlagwerk.
    //   musikTief   fuer Filterfahrten ueber die ganze Musik.
    //   pumpe       der Sidechain. Jeder Kick drueckt die Musik kurz herunter.
    //
    // Die Maschine haengt *hinter* der Pumpe: Sie darf sich nicht selbst
    // ducken, sonst frisst der Kick seinen eigenen Anschlag weg.
    this.musikHoch = ctx.createBiquadFilter();
    this.musikHoch.type = 'highpass';
    this.musikHoch.frequency.value = 20;
    this.musikHoch.Q.value = 0.7071;

    this.musikTief = ctx.createBiquadFilter();
    this.musikTief.type = 'lowpass';
    this.musikTief.frequency.value = 20000;
    this.musikTief.Q.value = 0.7071;

    this.pumpe = ctx.createGain();
    this.pumpe.gain.value = 1;

    this.maschinenBus = ctx.createGain();
    this.maschinenBus.gain.value = 0;

    this.summe
      .connect(this.musikHoch)
      .connect(this.musikTief)
      .connect(this.pumpe)
      .connect(this.begrenzer);
    this.maschinenBus.connect(this.begrenzer);
    this.begrenzer.connect(this.ausgang);
    this.ausgang.connect(this.messung);
    this.ausgang.connect(ctx.destination);

    this.decks = [new Deck(ctx, this.summe, this.echoWeg, 'A'), new Deck(ctx, this.summe, this.echoWeg, 'B')];
    this.aktiv = 0;
  }

  get laufendesDeck() {
    return this.decks[this.aktiv];
  }

  get freiesDeck() {
    return this.decks[1 - this.aktiv];
  }

  // Der allererste Track: einfach einblenden, es gibt ja nichts zu mischen.
  ersterTrack(track, puffer, einblendSekunden = 2) {
    const jetzt = this.ctx.currentTime + 0.1;
    const deck = this.laufendesDeck;

    // Der erste Track darf von vorne laufen - ein Intro, das langsam aufgeht,
    // ist als Einstieg in den Abend genau richtig. Nur beim *Mischen* ist ein
    // Intro unbrauchbar, weil es keinen Beat zum Anlegen hat.
    deck.starten({
      track,
      puffer,
      zeit: jetzt,
      startInDatei: 0,
      tempo: 1,
      blende: 0,
    });
    deck.blende.gain.linearRampToValueAtTime(1, jetzt + einblendSekunden);
    return { deck: deck.name, track };
  }

  // Uebergang planen und einplanen. Gibt zurueck, was passieren wird - die
  // Buehne zeigt das an, bevor man es hoert.
  uebergang(neuTrack, puffer, artWunsch = null, zielenergie = 0.5) {
    const alt = this.laufendesDeck;
    const neu = this.freiesDeck;
    if (!alt.laeuft) return this.ersterTrack(neuTrack, puffer);

    const jetzt = this.ctx.currentTime;
    const beatSekundeAlt = beatDauer(alt.track.bpm) / alt.tempo;

    const tempo = tempoVerhaeltnis(alt.effektivBpm(), neuTrack.bpm);
    const energiesprung = (neuTrack.energie ?? 0.5) - (alt.track.energie ?? 0.5);
    const art =
      artWunsch ??
      waehleUebergang({ tempoPasst: tempo.passt, energiesprung, zielenergie });
    const plan = UEBERGAENGE[art];

    // Der Uebergang beginnt auf einer Phrasengrenze des laufenden Decks. Das
    // ist der Unterschied zwischen "gemischt" und "uebereinandergelegt".
    // Vorlauf: der Uebergang muss noch vor dem Ende des alten Tracks passen.
    const vorlaufBeats = Math.max(2, Math.ceil(0.3 / beatSekundeAlt));
    const startBeat = plan.beats > 1
      ? naechstePhrase(alt.track, alt.stelle(jetzt), vorlaufBeats)
      : naechsterTakt(alt.track, alt.stelle(jetzt), vorlaufBeats);
    const startZeit = kontextZeitVonBeat(alt, startBeat);

    // Der Neue steigt an seinem ersten brauchbaren Downbeat ein.
    const einstieg = beatZeit(neuTrack, neuTrack.einstiegBeat ?? 0);

    neu.starten({
      track: neuTrack,
      puffer,
      zeit: startZeit,
      startInDatei: Math.max(0, einstieg),
      tempo: tempo.verhaeltnis,
      blende: art === 'echo' || art === 'schnitt' ? 1 : 0,
    });

    // Der neue Beat bestimmt ab jetzt das Raster - er laeuft ja schon im
    // Zieltempo.
    const beatSekunde = beatDauer(neuTrack.bpm) / tempo.verhaeltnis;

    // Die Schritte nach Regler gruppieren und je Regler *eine* durchgehende
    // Kurve planen. Das ist der Punkt, an dem eine Blende zur Blende wird:
    // Web Audio rampt immer vom letzten geplanten Ereignis zum naechsten.
    // Wer stattdessen vor jeder Rampe neu ankert, bekommt an jedem Zielpunkt
    // einen Sprung statt einer Bewegung - hoerbar als Klacken, nicht als Mix.
    const gruppen = new Map();
    for (const schritt of plan.schritte) {
      const schluessel = `${schritt.deck}:${schritt.regler}`;
      if (!gruppen.has(schluessel)) gruppen.set(schluessel, []);
      gruppen.get(schluessel).push(schritt);
    }

    for (const [schluessel, schritte] of gruppen) {
      const [welches, regler] = schluessel.split(':');
      const deck = welches === 'alt' ? alt : neu;
      const param = deck.parameter(regler);
      schritte.sort((a, b) => a.beat - b.beat);

      param.cancelScheduledValues(startZeit);
      // Der Wert bei Beat 0 ist der Startpunkt der Kurve. Jeder Ablaufplan
      // nennt ihn ausdruecklich, damit hier nichts geraten werden muss.
      const start = schritte[0].beat === 0 ? schritte[0].wert : param.value;
      param.setValueAtTime(start, startZeit);

      for (const schritt of schritte) {
        if (schritt.beat === 0) continue;
        param.linearRampToValueAtTime(schritt.wert, startZeit + schritt.beat * beatSekunde);
      }
    }

    const endeZeit = startZeit + plan.beats * beatSekunde;
    alt.stoppen(endeZeit + 0.05);

    this.aktiv = 1 - this.aktiv;
    this.wechselZaehler++;

    this.laufenderUebergang = {
      art,
      name: plan.name,
      beschreibung: plan.beschreibung,
      beats: plan.beats,
      startZeit,
      endeZeit,
      vonTrack: alt.track,
      nachTrack: neuTrack,
      tempo,
      energiesprung,
      grund: tempo.passt ? null : tempo.grund,
    };
    return this.laufenderUebergang;
  }

  // Wie lange laeuft der aktuelle Track noch? Danach richtet sich, wann der
  // naechste vorbereitet werden muss.
  restSekunden() {
    const deck = this.laufendesDeck;
    if (!deck.laeuft || !deck.quelle?.buffer) return Infinity;
    const uebrig = deck.quelle.buffer.duration - deck.stelle();
    return uebrig / deck.tempo;
  }

  // Momentaufnahme fuer die Anzeige.
  zustand() {
    const jetzt = this.ctx.currentTime;
    const uebergang = this.laufenderUebergang;
    return {
      jetzt,
      decks: this.decks.map((deck) => ({
        name: deck.name,
        laeuft: deck.laeuft,
        aktiv: deck === this.laufendesDeck,
        track: deck.track,
        stelle: deck.stelle(jetzt),
        dauer: deck.quelle?.buffer?.duration ?? 0,
        tempo: deck.tempo,
        bpm: deck.effektivBpm(),
        blende: deck.blende.gain.value,
        tief: deck.tief.gain.value,
        filter: deck.filter.frequency.value,
      })),
      uebergang:
        uebergang && jetzt <= uebergang.endeZeit + 0.5
          ? {
              ...uebergang,
              fortschritt: fortschritt(jetzt, uebergang),
              // Ein Uebergang wartet auf die naechste Phrasengrenze - das
              // koennen fuenfzehn Sekunden sein. Ohne Anzeige wirkt der Knopf
              // kaputt, dabei tut er genau das Richtige.
              startetIn: Math.max(0, uebergang.startZeit - jetzt),
            }
          : null,
      pegel: this.pegel(),
    };
  }

  // Ausgangspegel als Effektivwert. Der Wachhund haengt daran: Bleibt der
  // laenger bei null, obwohl etwas laufen sollte, stimmt etwas nicht.
  pegel() {
    const daten = new Float32Array(this.messung.fftSize);
    this.messung.getFloatTimeDomainData(daten);
    let summe = 0;
    for (const wert of daten) summe += wert * wert;
    return Math.sqrt(summe / daten.length);
  }

  // Spektrum fuer die Buehne.
  spektrum(ziel) {
    this.messung.getByteFrequencyData(ziel);
    return ziel;
  }

  // Die Wellenform im Zeitbereich - der Modus "Wellen" zeichnet sie direkt.
  //
  // Bewusst die Float-Fassung und nicht getByteTimeDomainData: Der Pegel am
  // Ausgang liegt nach Angleich und Begrenzer bei wenigen Prozent der
  // Vollaussteuerung. Die Bytefassung hat dort nur noch eine Handvoll Stufen
  // uebrig, und die Zeichnung wird zur Treppe, sobald man sie hochskaliert.
  // @param {Float32Array} ziel  Laenge messung.fftSize
  wellenform(ziel) {
    this.messung.getFloatTimeDomainData(ziel);
    return ziel;
  }

  // --- Regler fuer den Remix ----------------------------------------------

  /**
   * Die Musik einmal ducken - der Sidechain.
   *
   * Von allen Produktionskniffen im Techno ist das der wirksamste: Der Kick
   * drueckt alles andere kurz herunter und laesst es wieder hoch. Dadurch
   * bekommt der Kick Platz, ohne lauter zu werden, und das Ganze atmet im
   * Takt. Ohne ihn stehen Schlagwerk und Musik nur uebereinander.
   *
   * Wird im Voraus geplant und *niemals* mit cancelScheduledValues
   * aufgeraeumt: Der Taktgeber plant 250 ms voraus, ein Abbruch wuerde die
   * schon eingetragene naechste Kurve mitloeschen.
   *
   * @param {number} zeit   Kontextzeit des Kicks
   * @param {number} tiefe  worauf heruntergedrueckt wird, 0..1
   * @param {number} dauer  wie lange die Rueckkehr auf 1 braucht
   */
  ducken(zeit, tiefe, dauer) {
    const g = this.pumpe.gain;
    const ab = Math.min(0.99, Math.max(0.02, tiefe));
    // Kein Sprung, sondern ein sehr kurzer Sturz: Ein harter Sprung im
    // Verstaerkungsfaktor knackt hoerbar, weil die Wellenform an der Stelle
    // eine Kante bekommt.
    g.setValueAtTime(1, zeit);
    g.linearRampToValueAtTime(ab, zeit + 0.006);
    // Exponentiell zurueck - so hoert man das Nachgeben, nicht das Ende.
    g.exponentialRampToValueAtTime(1, zeit + Math.max(0.03, dauer));
  }

  /**
   * Der Musik den Bass wegnehmen, damit der Kick den Keller allein hat.
   * Dieselbe Regel wie zwischen zwei Decks, nur zwischen Musik und Maschine.
   */
  musikHochpass(zeit, hertz, sekunden = 0.5) {
    const p = this.musikHoch.frequency;
    p.setValueAtTime(p.value, zeit);
    p.exponentialRampToValueAtTime(Math.max(20, hertz), zeit + Math.max(0.01, sekunden));
  }

  /** Filterfahrt ueber die ganze Musik - fuer Aufbauten. */
  musikTiefpass(zeit, hertz, sekunden = 0.5) {
    const p = this.musikTief.frequency;
    p.setValueAtTime(p.value, zeit);
    p.exponentialRampToValueAtTime(
      Math.min(20000, Math.max(120, hertz)),
      zeit + Math.max(0.01, sekunden),
    );
  }

  /** Das Schlagwerk als Ganzes ein- oder ausblenden. */
  maschinenPegel(zeit, wert, sekunden = 1) {
    const p = this.maschinenBus.gain;
    p.setValueAtTime(p.value, zeit);
    p.linearRampToValueAtTime(Math.max(0, wert), zeit + Math.max(0.01, sekunden));
  }
}

function fortschritt(jetzt, uebergang) {
  if (jetzt <= uebergang.startZeit) return 0;
  const spanne = uebergang.endeZeit - uebergang.startZeit;
  return spanne <= 0 ? 1 : Math.min(1, (jetzt - uebergang.startZeit) / spanne);
}
