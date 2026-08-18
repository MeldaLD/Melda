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

import { uebergangPlanen, BASS_AUS } from './uebergang.js';
import {
  beatDauer,
  beatZeit,
  naechstePhrase,
  naechsterTakt,
  beatBei,
  bpmBei,
  tempoVerhaeltnis,
  kontextZeitVonBeat,
  stelleInDatei,
} from './takt.js';

// Wie tief der Bass gekappt wird, wenn ein Deck ihn abgeben muss. Steht in
// uebergang.js, weil die gerechneten Plaene ihn genauso brauchen.

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

  /*
   * Das tatsaechlich klingende Tempo, inklusive Angleich.
   *
   * Bei einem Mix wird die Tempo-Karte an der Stelle gefragt, die gerade
   * laeuft. Ein Mittelwert ueber eine Stunde waere hier die falsche Zahl:
   * Angeglichen wird an das, was in diesem Moment aus dem Deck kommt.
   */
  effektivBpm() {
    if (!this.track) return null;
    return bpmBei(this.track, this.stelle()) * this.tempo;
  }
}

// --- Der Mixer ------------------------------------------------------------

export class Mixer {
  constructor(ctx) {
    this.ctx = ctx;
    this.wechselZaehler = 0;
    this.laufenderUebergang = null;
    /*
     * Wie lange es dauert, bis ein gezeichnetes Bild zu sehen ist.
     *
     * Die Mischung kennt den Bildschirm nicht - die Buehne setzt den Wert,
     * sobald sie ihn gemessen hat. Bis dahin die uebliche Sechzigstelsekunde:
     * Ein plausibler Startwert ist hier besser als eine Null, denn null hiesse
     * "das Bild erscheint sofort", und das stimmt nirgends.
     */
    this.bildperiode = 1 / 60;
    // Nachstellung von Hand, in Sekunden. Siehe anzeigeVersatz().
    this.versatzHand = 0;

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
    /*
     * Wenig Glaettung, und das ist eine Korrektur.
     *
     * Sie stand auf 0,75. Das ist ein Tiefpass mit 58 ms Zeitkonstante: Von
     * einem Anschlag sind nach einem Bild erst 25 % da, nach 150 ms 90 %. Bei
     * 128 Schlaegen je Minute ist das ein Drittel Schlag - waehrend das
     * Taktraster der Buehne auf Millisekunden genau sitzt. Bild und Ton
     * liefen also gegeneinander, und niemand konnte sagen warum.
     *
     * Mit 0,3 sind es 14 ms, also weniger als ein Bild. Was der Tiefpass an
     * Ruhe geliefert hat, liefert jetzt der Spitzenhalter in spektrum.js:
     * Anstieg sofort, Abfall traege. Flimmern entsteht beim Zurueckfallen,
     * nicht beim Ansteigen - deshalb kostet die Umstellung nichts.
     */
    this.messung.smoothingTimeConstant = 0.3;

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

    this.summe.connect(this.begrenzer).connect(this.ausgang);
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
    const beatSekundeAlt = beatDauer(bpmBei(alt.track, alt.stelle(jetzt))) / alt.tempo;

    /*
     * Angeglichen wird an die Stelle, an der eingestiegen wird - nicht an den
     * Dateianfang. Bei einem Mix stehen dort zwei verschiedene Tempi, und der
     * Anfang ist das falsche davon.
     */
    const neuAbBeat = Math.max(0, neuTrack.einstiegBeat ?? 0);
    const neuBpm = bpmBei(neuTrack, beatZeit(neuTrack, neuAbBeat));
    const tempo = tempoVerhaeltnis(alt.effektivBpm(), neuBpm);
    const energiesprung = (neuTrack.energie ?? 0.5) - (alt.track.energie ?? 0.5);

    /*
     * Der Plan wird aus den beiden Tracks gerechnet, nicht aus einer Liste
     * gezogen: wo der Alte aufhoert zu tragen, wo der Neue wirklich losgeht,
     * und was an genau diesen beiden Stellen klingt. Siehe uebergang.js.
     *
     * artWunsch kommt vom Knopf auf der Buehne und sticht - beim Entwickeln
     * will man eine bestimmte Art hoeren koennen, ohne die Lage passend
     * hinzubiegen.
     */
    const plan = uebergangPlanen(alt.track, neuTrack, {
      zielenergie,
      tempoPasst: tempo.passt,
      jetztBeat: beatBei(alt.track, alt.stelle(jetzt)),
      // Damit nicht eine Stunde lang derselbe Zug kommt.
      letzteArt: this.letzteArt ?? null,
    });
    const art = artWunsch ?? plan.art;
    const schritte = artWunsch ? UEBERGAENGE[artWunsch].schritte : plan.schritte;
    const beats = artWunsch ? UEBERGAENGE[artWunsch].beats : plan.beats;
    const name = artWunsch ? UEBERGAENGE[artWunsch].name : plan.name;

    // Der Uebergang beginnt auf einer Phrasengrenze des laufenden Decks. Das
    // ist der Unterschied zwischen "gemischt" und "uebereinandergelegt".
    // Vorlauf: der Uebergang muss noch vor dem Ende des alten Tracks passen.
    const vorlaufBeats = Math.max(2, Math.ceil(0.3 / beatSekundeAlt));
    const startBeat = beats > 1
      ? naechstePhrase(alt.track, alt.stelle(jetzt), vorlaufBeats)
      : naechsterTakt(alt.track, alt.stelle(jetzt), vorlaufBeats);
    const startZeit = kontextZeitVonBeat(alt, startBeat);

    // Der Neue steigt dort ein, wo der Plan es sagt - bei hoher Energie
    // mitten im Groove statt im Intro.
    const einstiegBeat = artWunsch ? (neuTrack.einstiegBeat ?? 0) : plan.einstiegBeat;
    const einstieg = beatZeit(neuTrack, einstiegBeat);

    neu.starten({
      track: neuTrack,
      puffer,
      zeit: startZeit,
      startInDatei: Math.max(0, einstieg),
      tempo: tempo.verhaeltnis,
      blende: art === 'echo' || art === 'schnitt' ? 1 : 0,
    });

    // Der neue Beat bestimmt ab jetzt das Raster - er laeuft ja schon im
    // Zieltempo. Massgeblich ist das Tempo an der Einstiegsstelle.
    const beatSekunde = beatDauer(bpmBei(neuTrack, einstieg)) / tempo.verhaeltnis;

    // Die Schritte nach Regler gruppieren und je Regler *eine* durchgehende
    // Kurve planen. Das ist der Punkt, an dem eine Blende zur Blende wird:
    // Web Audio rampt immer vom letzten geplanten Ereignis zum naechsten.
    // Wer stattdessen vor jeder Rampe neu ankert, bekommt an jedem Zielpunkt
    // einen Sprung statt einer Bewegung - hoerbar als Klacken, nicht als Mix.
    const gruppen = new Map();
    for (const schritt of schritte) {
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

    const endeZeit = startZeit + beats * beatSekunde;
    alt.stoppen(endeZeit + 0.05);

    this.aktiv = 1 - this.aktiv;
    this.wechselZaehler++;
    this.letzteArt = art;

    this.laufenderUebergang = {
      art,
      name,
      beschreibung: artWunsch ? UEBERGAENGE[artWunsch].beschreibung : plan.begruendung,
      beats,
      einstiegBeat,
      ausstiegBeat: plan.ausstiegBeat,
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

  /*
   * Wieviel die Anzeige der Rechnung vorausliegt - und warum das nicht null ist.
   *
   * ctx.currentTime ist die Zeit im *Rechenwerk*, nicht die im Raum. Der Ton,
   * der gerade berechnet wird, verlaesst den Lautsprecher erst
   * outputLatency spaeter; unter Windows sind das laut Microsoft nominell zehn
   * Millisekunden, gemessen wurden auch zweiundzwanzig. Ein Bild, das nach
   * ctx.currentTime gezeichnet wird, zeigt also die Zukunft.
   *
   * Dagegen steht ein zweiter Versatz in die andere Richtung: Das Bild, das
   * jetzt gezeichnet wird, erscheint erst beim naechsten Bildwechsel auf dem
   * Schirm - eine Bildperiode spaeter.
   *
   * Beide sind aehnlich gross und heben sich fast auf. Genau deshalb war es
   * bisher zufaellig fast richtig, und genau deshalb lohnt es sich, es
   * auszurechnen statt sich darauf zu verlassen: Auf einem Geraet mit
   * traeger Tonausgabe oder hohem Bildtakt heben sie sich eben nicht auf.
   *
   * Wichtig ist, wo das gilt: nur fuer die *Anzeige*. Geplant - wann der
   * naechste Uebergang startet, wann ein Deck einsetzt - wird weiter in
   * Rechenwerkzeit, denn dorthin gehoert eine Planung. Beides zu vermischen
   * waere schlimmer als der Versatz selbst.
   */
  anzeigeVersatz() {
    // Die Ausgabeverzoegerung meldet der Browser selbst. Wo es sie nicht gibt,
    // ist baseLatency die naechstbeste Auskunft, und sonst wird nichts
    // erfunden.
    const aus = Number.isFinite(this.ctx.outputLatency)
      ? this.ctx.outputLatency
      : (this.ctx.baseLatency ?? 0);
    /*
     * Und ein Wert von Hand obendrauf.
     *
     * Zwei Dinge kann der Browser nicht wissen. Erstens, wieviele Bilder das
     * Betriebssystem zwischen Zeichnen und Anzeigen noch einschiebt - das
     * Zusammensetzen des Desktops kostet auf Windows gern ein weiteres Bild.
     * Zweitens, und banaler: Wie weit die Boxen von der Leinwand entfernt
     * stehen. Schall braucht drei Millisekunden je Meter; bei einem Raum von
     * sieben Metern sind das zwanzig Millisekunden, also mehr als alles, was
     * hier sonst gerechnet wird.
     *
     * Dagegen hilft keine Messung im Rechner, sondern nur ein Auge und ein
     * Ohr vor Ort. Positiv heisst: Bild frueher zeigen.
     */
    return this.bildperiode - aus + this.versatzHand;
  }

  // Momentaufnahme fuer die Anzeige.
  zustand() {
    const jetzt = this.ctx.currentTime;
    // Die Stelle, die gleich *zu hoeren* ist, wenn das Bild erscheint.
    const hoerbar = jetzt + this.anzeigeVersatz();
    const uebergang = this.laufenderUebergang;
    return {
      jetzt,
      decks: this.decks.map((deck) => ({
        name: deck.name,
        laeuft: deck.laeuft,
        aktiv: deck === this.laufendesDeck,
        track: deck.track,
        // Nach der hoerbaren Zeit, nicht nach der gerechneten - siehe
        // anzeigeVersatz(). Alles andere in diesem Objekt ist Anzeige, also
        // gilt es dort genauso.
        stelle: deck.stelle(hoerbar),
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

}

function fortschritt(jetzt, uebergang) {
  if (jetzt <= uebergang.startZeit) return 0;
  const spanne = uebergang.endeZeit - uebergang.startZeit;
  return spanne <= 0 ? 1 : Math.min(1, (jetzt - uebergang.startZeit) / spanne);
}
