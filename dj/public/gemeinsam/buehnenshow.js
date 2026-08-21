// Die Regie.
//
// Die Gewerke in gewerke.js koennen jedes fuer sich etwas. Was daraus eine
// Show macht, ist die Entscheidung, *was wann laeuft* - und die faellt hier.
//
// --- Warum das der eigentliche Teil ist -------------------------------------
//
// Alles gleichzeitig anzuschalten ist die naheliegende Versuchung und der
// sicherste Weg zu etwas, das nach zwei Minuten langweilt. Die Fachliteratur
// ist an dieser Stelle bemerkenswert einig, und zwar quer durch Genres:
//
//   "The important thing is restraint; an LED bar does not need to display a
//    nonstop rainbow chase."
//
// Ein Hoehepunkt wirkt nur, wenn davor etwas Ruhigeres war. Ein Blinder, der
// dauernd an ist, ist eine Lampe; einer, der zweimal im Set kommt, ist ein
// Ereignis. Die Regie hier ist deshalb vor allem eine Maschine, die Dinge
// *weglaesst*.
//
// --- Wie sie arbeitet -------------------------------------------------------
//
// Drei Ebenen, von langsam nach schnell:
//
//   Bild      Welche Gewerke ueberhaupt laufen duerfen. Wechselt selten -
//             fruehestens nach zwei Phrasen, und nur an Phrasengrenzen.
//   Lage      Was die Musik gerade tut: Ruhe, Groove, Aufbau, Drop, Ausklang.
//             Kommt aus der Analyse und ueberstimmt das Bild bei Bedarf.
//   Akzent    Einzelne Ereignisse mit Sperrzeit: Flamme, CO2, Funken.
//
// --- Der Trick mit dem Loch -------------------------------------------------
//
// Das Wirksamste an einer Lichtshow kostet nichts und ist das Gegenteil von
// Licht: die Sekunde Dunkelheit unmittelbar vor dem Drop. Ein Aufbau, der
// immer heller wird und dann *ausgeht*, macht den Einschlag doppelt so gross.
// Genau das macht `dunkelVorDrop` - und es ist der einzige Effekt hier, der
// aus Nichtstun besteht.
//
// --- Damit es Stunden traegt ------------------------------------------------
//
// Ein Abend hat fuenf Stundenmixe. Die Bilder werden deshalb nicht gewuerfelt,
// sondern *rotiert*: Jedes kommt dran, bevor eines zum zweiten Mal kommt.
// Wuerfeln fuehlt sich kurzfristig abwechslungsreich an und wiederholt sich
// nach dem Gesetz der kleinen Zahlen viel zu oft.

import { lichtToene } from './farben.js';
import { flaechenLesen, winkelAnpassen } from './oberflaeche.js';
import { Flaschenwand, Balkenlicht } from './lager.js';
import { Partylicht } from './partylicht.js';
import { Beams, Blinder, Blitze, Kugel, Flammen, Nebelstoss, Funken } from './gewerke.js';

/*
 * Heisst `grenze` und nicht `kl`: Der Buendler legt alle Module in eine
 * Datei, und gewerke.js hat schon ein `kl`. Er meldet solche Zusammenstoesse
 * beim Bauen - das dritte Mal in diesem Projekt, dass er damit einen Fehler
 * verhindert hat, bevor er entstehen konnte.
 */
const grenze = (x, a, b) => (x < a ? a : x > b ? b : x);

/**
 * Einen Farbton auf das schieben, was eine Flaeche wiedergeben kann.
 *
 * `lichtToene` liefert `hsl(<winkel> <s>% <l>%)`; hier wird nur der Winkel
 * ersetzt. Passt die Form nicht, bleibt der Ton unveraendert - lieber die
 * Anpassung verlieren als die Farbe.
 */
function tonSchieben(ton, flaeche) {
  const m = /^hsl\(\s*([-\d.]+)/.exec(ton);
  if (!m) return ton;
  const neu = winkelAnpassen(Number(m[1]), flaeche);
  return ton.replace(m[1], String(Math.round(neu * 10) / 10));
}

/*
 * Die Bilder.
 *
 * Jedes sagt nur, *welche* Gewerke laufen duerfen und wie stark - nicht, was
 * sie tun. Genau so ist ein Lichtpult aufgebaut, und genau deshalb lassen
 * sich neue Bilder hinzufuegen, ohne ein Gewerk anzufassen.
 *
 * `ruhig` heisst: taugt fuer lange Strecken und fuer den Breakdown.
 * `laut` heisst: braucht Energie, sonst wirkt es aufgesetzt.
 */
export const BILDER = [
  {
    name: 'Wash', ruhig: true,
    wash: 1, beams: 0, kugel: 0, blitze: false, sunstrip: 1, flaschen: 0.25, balken: 0.4,
    hinweis: 'Die Grundstimmung. Laeuft immer, wenn nichts anderes dran ist.',
  },
  {
    name: 'Beams', laut: true,
    wash: 0.35, beams: 1, kugel: 0, blitze: false, sunstrip: 0.5, flaschen: 0.5, balken: 0.8,
    hinweis: 'Strahlen in der Luft, Wash zurueckgenommen - sonst frisst er sie.',
  },
  {
    name: 'Kugel', ruhig: true, allein: true,
    wash: 0, beams: 0, kugel: 1, blitze: false, sunstrip: 0, flaschen: 0, balken: 0,
    hinweis: 'Die Spiegelkugel braucht die Wand fuer sich. Punkte im Grundlicht sind keine Punkte.',
  },
  {
    name: 'Kette', ruhig: true,
    wash: 0.55, beams: 0, kugel: 0, blitze: false, sunstrip: 1.4, flaschen: 0.35, balken: 1,
    hinweis: 'Nur die Lauflichter auf den Gesimsen. Ruhig, aber nicht still.',
  },
  {
    name: 'Halbdunkel', ruhig: true,
    wash: 0.3, beams: 0.35, kugel: 0, blitze: false, sunstrip: 0.3, flaschen: 0.3, balken: 0.3,
    hinweis: 'Alles zurueckgenommen. Der Platz, aus dem ein Aufbau kommen kann.',
  },
  {
    name: 'Vollgas', laut: true,
    wash: 0.8, beams: 1, kugel: 0, blitze: true, sunstrip: 1, flaschen: 1, balken: 1,
    hinweis: 'Alles ausser der Kugel. Hoechstens ein paar Phrasen am Stueck.',
  },
  /*
   * Das Bild fuer den Lagerraum.
   *
   * Die Flaschenwand traegt allein, das Grundlicht geht fast aus. Der Grund
   * steht in lager.js und ist kein Geschmack: Die Gitterkaesten sind die
   * einzige Flaeche im Raum, die Farbe richtig wiedergibt und die Kontrast
   * hat. Wer daneben die orange Holzwand hell faehrt, macht beides kaputt -
   * die Kaesten verschwinden im Streulicht, und die Wand hat trotzdem keine
   * Farbe.
   *
   * Kein `allein: true` wie bei der Kugel: Ein wenig Wash bleibt, damit der
   * Raum nicht verschwindet, sondern die Kaesten *aus* ihm heraustreten.
   */
  {
    name: 'Flaschenwand', ruhig: true, braucht: 'gitterbox',
    wash: 0.12, beams: 0, kugel: 0, blitze: false, sunstrip: 0.2, flaschen: 1, balken: 0.5,
    hinweis: 'Die Gitterkaesten als Anzeigetafel. Farbe gehoert hierher, nicht an die Wand.',
  },
];

/*
 * Wie lange ein Bild mindestens steht, in Phrasen.
 *
 * Zwei. Bei 124 Schlaegen je Minute und 32 Schlaegen je Phrase sind das gut
 * dreissig Sekunden. Kuerzer und die Show wird hektisch, ohne abwechslungs-
 * reicher zu werden - das Auge braucht Zeit, ein Bild ueberhaupt als Bild zu
 * lesen.
 */
const BILD_MINDESTENS = 2;

/*
 * Sperrzeiten der grossen Akzente, in Sekunden.
 *
 * Die Zahlen bilden nach, was die Dinger in Wirklichkeit kosten. Eine Flamme
 * braucht Gas und Genehmigung, also kommt sie selten; Funken sind billiger;
 * CO2 liegt dazwischen. Dass ein Effekt teuer ist, ist genau der Grund,
 * warum er wirkt - wer ihn verschenkt, verschenkt die Wirkung mit.
 */
const SPERREN = { flamme: 95, co2: 55, funken: 40, blinder: 12 };

/*
 * Ein Laufzeitkonto fuer die Blitze, in Sekunden.
 *
 * Die Sperrzeiten oben regeln Ereignisse - etwas zuendet, und danach ist
 * eine Weile Ruhe. Die Blitze sind kein Ereignis, sondern ein Zustand, und
 * fuer Zustaende taugt eine Sperre nicht: Ein Aufbau kann in echter Musik
 * eine Minute dauern, und Blitze, die eine Minute am Stueck laufen, sind
 * kein Akzent mehr, sondern Beleuchtung.
 *
 * Also ein Konto. Es leert sich, solange sie laufen, und fuellt sich
 * langsamer wieder auf - damit sind sie auch bei dauerhafter Nachfrage
 * hoechstens ein knappes Drittel der Zeit an, und nie laenger als acht
 * Sekunden am Stueck.
 */
const BLITZ_HOECHSTENS = 8;
const BLITZ_ERHOLUNG = 0.3;

/*
 * Ein kleiner, saebarer Zufall.
 *
 * Die Regie wuerfelt an zwei Stellen: beim Mischen der Bilderfolge und
 * beim Ueberspringen eines Bildes, das gerade nicht zur Energie passt.
 * Mit `Math.random` ist damit jeder Prueflauf ein anderer - und das ist
 * beim Messen fatal. Der erste Versuch, den Blinder zu deckeln, ergab bei
 * kleinerer Blende ein *helleres* Bild als bei groesserer; die Ursache war
 * nicht der Blinder, sondern eine andere Bilderfolge in jedem Lauf.
 *
 * Auf der Party laeuft er weiter mit `Math.random`, in der Abnahme mit
 * einer Saat. Xorshift32, weil er in fuenf Zeilen passt und fuer die Frage
 * "welches Bild kommt als naechstes" mehr als genug ist.
 *
 * Heisst `saatWuerfel` und nicht `wuerfel`: demomusik.js hat schon einen.
 * Der Buendler hat es beim Bauen gemeldet - das vierte Mal in diesem
 * Projekt, dass er einen Zusammenstoss abgefangen hat, bevor er im Browser
 * zu einem stillen Fehler geworden waere.
 */
function saatWuerfel(saat) {
  if (saat === null || saat === undefined) return Math.random;
  let z = saat | 0 || 0x9e3779b9;
  return () => {
    z ^= z << 13; z ^= z >>> 17; z ^= z << 5;
    return ((z >>> 0) % 1000000) / 1000000;
  };
}

export class Buehnenshow {
  constructor(bild, saat = null) {
    this.zufall = saatWuerfel(saat);
    this.bild = bild;
    this.grund = new Partylicht(bild);
    this.beams = new Beams(bild.an ? Math.min(10, Math.max(6, this.grund.lampen.length + 2)) : 8);
    this.blinder = new Blinder(6);
    this.blitze = new Blitze(11);
    this.kugel = new Kugel(96);
    this.flammen = new Flammen(this._flammenStellen(bild));
    this.co2 = new Nebelstoss([0.1, 0.9]);
    this.funken = new Funken([0.3, 0.7]);
    this.flaschen = new Flaschenwand(bild);
    this.balken = new Balkenlicht(bild);

    /*
     * Was die Flaechen mit dem Licht machen - einmal gelesen, nicht je Bild.
     *
     * Daraus kommt die eine Entscheidung, die in diesem Raum ueber alles
     * andere entscheidet: Die Farbwinkel des Grundlichts werden auf das
     * geschoben, was die Holzwand ueberhaupt wiedergeben kann. Die der
     * Flaschenwand *nicht* - verzinkter Stahl ist neutral und braucht keine
     * Hilfe. Siehe oberflaeche.js.
     */
    this.flaechen = flaechenLesen(bild);

    /*
     * Welche Bilder dieser Raum ueberhaupt hergibt.
     *
     * Ein Bild, das auf Gitterkaesten baut, ist in einem Raum ohne
     * Gitterkaesten kein ruhiges Bild, sondern eine schwarze Wand - sein
     * Grundlicht steht mit Absicht auf 0,12, weil die Kaesten den Rest
     * machen sollen. Die Abnahme hat das nicht gemeldet, sie hat nur
     * gemeldet, dass ein Bild in der Rotation fehlt; erst die Frage,
     * *warum* es fehlt, hat den Fall sichtbar gemacht.
     *
     * Deshalb wird die Liste einmal am Anfang gefiltert und nicht bei jeder
     * Auswahl geprueft: Was der Raum nicht hat, bekommt er auch nicht.
     */
    this.moeglich = BILDER.filter(
      (b) => !b.braucht || (bild?.an && bild.bereiche.some((x) => x.art === b.braucht)),
    );

    // Die Bilderfolge. Rotiert statt gewuerfelt - siehe oben.
    this.reihe = this._reiheMischen();
    this.reiheZeiger = 0;
    this.aktuell = BILDER[0];
    this.seitPhrasen = 0;

    // Ueberblendung zwischen zwei Bildern, damit nichts hart umspringt.
    this.staerke = {};
    for (const b of BILDER) this.staerke[b.name] = b === this.aktuell ? 1 : 0;

    this.letzterBeat = -1;
    this.letztePhrase = -1;
    this.zeit = 0;
    this.sperre = { flamme: 0, co2: 0, funken: 0, blinder: 0 };
    this.dunkel = 0;
    this.dropHall = 0;
    this.blitzKonto = BLITZ_HOECHSTENS;
    /*
     * Beim ersten Phrasenanfang wird nur mitgeschrieben, nicht mitgezaehlt:
     * Die Show faengt irgendwo mitten in einer Phrase an, und wie lange das
     * erste Bild da schon steht, weiss niemand. Ohne das hier waere der
     * allererste Wechsel nach einer statt nach zwei Phrasen gekommen - der
     * einzige hektische Wechsel des ganzen Abends, gleich am Anfang.
     */
    this.phraseGesehen = false;
    this.lage = 'groove';
  }

  /*
   * Wo die Flammen stehen.
   *
   * Vor den Pfeilern, nicht vor den Fenstern - dieselbe Ueberlegung wie bei
   * den Uplightern, nur mit mehr Nachdruck: Eine Flamme vor einer Scheibe
   * waere auch in Wirklichkeit keine gute Idee. Genommen werden die
   * aeusseren und die mittlere Lampenposition.
   */
  _flammenStellen(bild) {
    if (!bild.an) return [0.18, 0.5, 0.82];
    const fenster = bild.bereiche.filter((b) => b.art === 'fenster');
    if (fenster.length < 2) return [0.18, 0.5, 0.82];
    const x = fenster.map((f) => f.mitte[0]).sort((a, b) => a - b);
    const luecken = [];
    for (let i = 1; i < x.length; i++) luecken.push((x[i - 1] + x[i]) / 2);
    if (luecken.length <= 3) return luecken;
    return [luecken[0], luecken[Math.floor(luecken.length / 2)], luecken[luecken.length - 1]];
  }

  _reiheMischen() {
    const r = this.moeglich.map((b) => b.name);
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(this.zufall() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  }

  /**
   * Das naechste Bild aus der Rotation - passend zur Energie.
   *
   * Ein lautes Bild im Breakdown waere genauso falsch wie ein ruhiges im
   * Hoehepunkt. Deshalb wird die Rotation *gefiltert* und nicht ersetzt: Was
   * gerade nicht passt, wird uebersprungen und kommt beim naechsten Mal.
   */
  _naechstesBild(wucht, abbau) {
    const ruhig = abbau > 0.35 || wucht < 0.35;
    for (let versuch = 0; versuch < this.moeglich.length * 2; versuch++) {
      const name = this.reihe[this.reiheZeiger % this.reihe.length];
      this.reiheZeiger++;
      if (this.reiheZeiger >= this.reihe.length * 2) {
        this.reihe = this._reiheMischen();
        this.reiheZeiger = 0;
      }
      const b = this.moeglich.find((x) => x.name === name);
      if (!b || b === this.aktuell) continue;
      if (ruhig && b.laut) continue;
      if (!ruhig && b.ruhig && this.zufall() < 0.6) continue;
      return b;
    }
    return this.moeglich[0] ?? BILDER[0];
  }

  /* --- Der Ablauf ---------------------------------------------------------- */

  fortschreiben(sekunden, takt, wucht, spannung, abbau, drop) {
    this.zeit += sekunden;
    for (const k of Object.keys(this.sperre)) {
      if (this.sperre[k] > 0) this.sperre[k] = Math.max(0, this.sperre[k] - sekunden);
    }
    if (this.dropHall > 0) this.dropHall = Math.max(0, this.dropHall - sekunden * 0.7);

    /*
     * Die Lage. Sie ueberstimmt das Bild - was die Musik gerade tut, ist
     * wichtiger als das, was gerade an der Reihe waere.
     */
    this.lage = drop || this.dropHall > 0.6 ? 'drop'
      : spannung > 0.62 ? 'aufbau'
        : abbau > 0.45 ? 'ruhe'
          : wucht > 0.72 ? 'hoehepunkt' : 'groove';

    /*
     * Das Loch vor dem Drop.
     *
     * Nur die letzte Zaehlzeit eines Aufbaus, und nur wenn der Aufbau weit
     * genug ist. Es ist der billigste und wirksamste Effekt der ganzen Show,
     * und er besteht darin, alles auszuschalten.
     */
    const kurzVorDrop = spannung > 0.86 && !drop;
    this.dunkel += ((kurzVorDrop ? 1 : 0) - this.dunkel) * grenze(sekunden * (kurzVorDrop ? 9 : 5), 0, 1);

    if (takt && takt.nummer !== this.letzterBeat) {
      this.letzterBeat = takt.nummer;

      if (takt.aufPhrase && takt.nummer !== this.letztePhrase) {
        this.letztePhrase = takt.nummer;
        if (!this.phraseGesehen) this.phraseGesehen = true;
        else this.seitPhrasen++;
        if (this.seitPhrasen >= BILD_MINDESTENS) {
          this.aktuell = this._naechstesBild(wucht, abbau);
          this.seitPhrasen = 0;
        }
      }
    }

    if (drop) {
      this.dropHall = 1;
      /*
       * Der Drop feuert *nicht* alles. Ausgewaehlt wird nach Sperrzeit und
       * nach Energie - und selbst dann nie mehr als zwei grosse Akzente
       * zugleich. Drei gleichzeitig sieht man als einen.
       */
      let grosse = 0;
      if (this.sperre.blinder <= 0) {
        this.blinder.zuenden(1);
        this.sperre.blinder = SPERREN.blinder;
      }
      if (wucht > 0.55 && this.sperre.flamme <= 0 && grosse < 2) {
        this.flammen.zuenden();
        this.sperre.flamme = SPERREN.flamme;
        grosse++;
      }
      if (wucht > 0.45 && this.sperre.co2 <= 0 && grosse < 2) {
        this.co2.zuenden();
        this.sperre.co2 = SPERREN.co2;
        grosse++;
      }
      if (this.sperre.funken <= 0 && grosse < 2) {
        this.funken.zuenden(70);
        this.sperre.funken = SPERREN.funken;
        grosse++;
      }
    }

    // Die Bildstaerken nachziehen - zwei Sekunden Blende, damit nichts springt.
    for (const b of BILDER) {
      const ziel = b === this.aktuell ? 1 : 0;
      this.staerke[b.name] += (ziel - this.staerke[b.name]) * grenze(sekunden * 0.9, 0, 1);
    }

    // Die Gewerke selbst.
    const beamKraft = this._mischung('beams');
    this.beams.fortschreiben(sekunden, takt, wucht, grenze(wucht + spannung * 0.5, 0, 1));
    this.blinder.fortschreiben(sekunden);
    this.kugel.fortschreiben(sekunden, 0.16 + wucht * 0.12);
    this.flammen.fortschreiben(sekunden);
    this.co2.fortschreiben(sekunden);
    this.funken.fortschreiben(sekunden);
    /*
     * Die Blitze laufen im Aufbau mit und werden dabei schneller. Das ist
     * das klassische Mittel, um auf einen Drop zuzulaufen - und es ist der
     * einzige Ort, an dem sie ueberhaupt vorkommen.
     *
     * Frueher stand hier `this.aktuell.blitze && wucht > 0.7`, und das war
     * falsch: Damit blitzte es, sobald das Bild "Vollgas" dran war und die
     * Musik Druck hatte - also gut die halbe Zeit, ohne dass irgendetwas
     * passiert waere. Die Abnahme hat 52 Prozent gemessen. Blitze gehoeren
     * an eine *Bewegung* - an den Aufbau oder an das Nachhallen eines Drops
     * -, nicht an einen Energiepegel.
     */
    const blitzWunsch = this.lage === 'aufbau'
      || (this.aktuell.blitze && this.dropHall > 0.25);
    this.blitzKonto = grenze(
      this.blitzKonto + sekunden * (this.blitze.an ? -1 : BLITZ_ERHOLUNG),
      0, BLITZ_HOECHSTENS,
    );
    // Anspringen erst bei halbvollem Konto, weiterlaufen bis es leer ist -
    // sonst flattert die Schwelle und die Blitze stottern im Sekundentakt.
    this.blitze.an = blitzWunsch
      && this.blitzKonto > (this.blitze.an ? 0 : BLITZ_HOECHSTENS * 0.5);
    this.blitze.fortschreiben(sekunden, 3 + spannung * 7 + wucht * 2);
    this.flaschen.fortschreiben(sekunden, takt, wucht, spannung, this.spektrum, drop);
    this.balken.fortschreiben(sekunden, wucht);
    return beamKraft;
  }

  /** Wie stark ein Gewerk gerade laufen darf, ueber alle Bilder gemischt. */
  _mischung(gewerk) {
    let summe = 0;
    for (const b of BILDER) summe += (b[gewerk] ?? 0) * this.staerke[b.name];
    return summe;
  }

  /* --- Zeichnen ------------------------------------------------------------ */

  zeichnen(stift, lage) {
    const {
      breite, hoehe, sekunden = 1 / 60, takt = null, wucht = 0.5,
      spannung = 0, abbau = 0, drop = false, palette = null,
    } = lage;

    // Das Spektrum reicht die Buehne je Bild mit; die Flaschenwand braucht es
    // fuer ihren Pegel, und `fortschreiben` bekommt es nicht als Parameter.
    this.spektrum = lage.spektrum ?? null;
    this.fortschreiben(sekunden, takt, wucht, spannung, abbau, drop);
    const toene = lichtToene(palette);
    /*
     * Zwei Farbsaetze statt einem.
     *
     * `toene` gehen auf die Wand und werden an sie angepasst - auf einer
     * orangen Grobspanplatte ist ein blauer Kegel kein blauer Kegel. `rein`
     * geht auf die Gitterkaesten und bleibt, wie die Palette es meint.
     *
     * Ohne Messung sind beide gleich: `flaechenLesen` liefert dann eine
     * neutrale Flaeche, und die veraendert nichts.
     */
    const rein = toene;
    const wandToene = this.flaechen.grund.traegtFarbe
      ? toene
      : toene.map((t) => tonSchieben(t, this.flaechen.grund));

    /*
     * Der Dunkelfaktor. Alles wird damit multipliziert - so wirkt das Loch
     * vor dem Drop auf die ganze Show und nicht nur auf ein Gewerk.
     */
    const hell = 1 - this.dunkel * 0.93;

    const washKraft = this._mischung('wash') * hell;
    const beamKraft = this._mischung('beams') * hell;
    const kugelKraft = this._mischung('kugel') * hell;
    const strichKraft = this._mischung('sunstrip') * hell;

    stift.save();
    stift.globalCompositeOperation = 'lighter';

    /*
     * Die Kugel zuerst und allein.
     *
     * Laeuft sie stark, wird alles andere heruntergezogen - nicht weil es
     * stoerte, sondern weil ein Punktfeld im Grundlicht schlicht verschwindet.
     * Das ist der eine Fall, in dem ein Gewerk die Buehne beansprucht.
     */
    if (kugelKraft > 0.02) {
      this.kugel.zeichnen(stift, breite, hoehe, toene[2], kugelKraft);
    }
    /*
     * Was uebrig bleibt fuer alles andere - und zwei Gewerke nehmen sich
     * davon etwas weg.
     *
     * Die Kugel, weil ein Punktfeld im Grundlicht kein Punktfeld ist. Der
     * Blinder, weil er auf einer echten Buehne denselben Platz nimmt:
     * Waehrend er feuert, *ist* er das Bild, und alles andere tritt
     * zurueck. Ein Blinder, neben dem der Wash unveraendert weiterlaeuft,
     * sieht nach heller Wand aus statt nach Schlag.
     *
     * Das ist eine Entscheidung ueber die Wirkung, keine ueber die
     * Sicherheit - auch ohne sie bleibt die Show unter der Blitzschwelle.
     * Es war hier zeitweise andersherum aufgeschrieben: Als das hellste
     * Bild bei 0,128 lag, sah es nach der Rettung aus. War es nicht. Die
     * Ursache war, dass der Grundlichtpark seinen *eigenen* Blinder auf
     * denselben Drop gefeuert hat - siehe `blinderAus` in partylicht.js.
     * Diese Zeile hat daran fast nichts geaendert, und dass sie es nicht
     * getan hat, war der Hinweis, der zur wirklichen Ursache gefuehrt hat.
     */
    const rest = (1 - kugelKraft * 0.92) * (1 - this.blinder.staerke * 0.75);

    const flaschenKraft = this._mischung('flaschen') * hell;
    const balkenKraft = this._mischung('balken') * hell;

    if (washKraft * rest > 0.02) {
      this.grund.zeichnen(stift, {
        ...lage,
        // Der Grundlichtpark bekommt seine eigene Staerke ueber die Wucht -
        // so bleibt seine innere Musikbindung erhalten.
        wucht: grenze(wucht * washKraft * rest, 0, 1),
        streifen: strichKraft,
        // Der Blinder gehoert hier der Regie - siehe partylicht.js.
        blinderAus: true,
        // Und die an die Wand angepassten Farbwinkel.
        wandToene,
      });
    }

    if (beamKraft * rest > 0.02) {
      this.beams.zeichnen(stift, breite, hoehe, toene[0], beamKraft * rest * (0.5 + wucht * 0.6));
    }

    /*
     * Die Flaschenwand vor den Blitzen und nach dem Grundlicht: Sie ist ein
     * Objekt im Raum und kein Effekt in der Luft.
     */
    if (flaschenKraft * rest > 0.02) {
      this.flaschen.zeichnen(stift, breite, hoehe, rein[1], flaschenKraft * rest);
    }
    if (balkenKraft * rest > 0.02) {
      this.balken.zeichnen(stift, breite, hoehe, wandToene[3] ?? wandToene[0], balkenKraft * rest);
    }

    this.blitze.zeichnen(stift, breite, hoehe, rest);
    this.co2.zeichnen(stift, breite, hoehe);
    this.flammen.zeichnen(stift, breite, hoehe, this.zeit);
    this.funken.zeichnen(stift, breite, hoehe);
    // Der Blinder ganz zuletzt: Er ueberstrahlt alles, und genau das ist sein Sinn.
    this.blinder.zeichnen(stift, breite, hoehe);

    stift.restore();
  }

  /** Fuer die Abnahme. */
  stand() {
    return {
      bild: this.aktuell.name,
      lage: this.lage,
      dunkel: this.dunkel,
      seitPhrasen: this.seitPhrasen,
      staerke: { ...this.staerke },
      sperre: { ...this.sperre },
      blinder: this.blinder.staerke,
      blitzeAn: this.blitze.an,
      flammen: Math.max(...this.flammen.leben),
      co2: Math.max(...this.co2.leben),
      funken: this.funken.teilchen.length,
      moeglich: this.moeglich.map((b) => b.name),
      flaschenMuster: this.flaschen.muster,
      flaschenKaesten: this.flaschen.kaesten.length,
      wandTraegtFarbe: this.flaechen.grund.traegtFarbe,
      lampen: this.grund.lampen.length,
      flammenStellen: this.flammen.stellen,
    };
  }
}

/*
 * Wie beim Lichtpark: eine Show je Buehnenbild, weil ein Modus zustandslos
 * aufgerufen wird, eine Show aber Gedaechtnis hat.
 */
let show = null;
let showFuer = null;

export function buehnenshowZeichnen(stift, lage) {
  const bild = lage.buehnenbild ?? { an: false, bereiche: [] };
  if (show === null || showFuer !== bild) {
    show = new Buehnenshow(bild);
    showFuer = bild;
  }
  show.zeichnen(stift, lage);
}

export function buehnenshowZuruecksetzen() {
  show = null;
  showFuer = null;
}
