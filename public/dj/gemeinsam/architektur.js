// Das Haus spielt mit.
//
// Sobald die Wand vermessen ist, ist sie nicht mehr nur Untergrund, sondern
// Mitspieler. Diese Schicht liegt ueber dem Mandala und benutzt, was die
// Einmessung weiss: wo Fenster sind, wo eine Tuer ist, an welchen Kanten
// entlang sich etwas ziehen laesst und wo Licht verloren waere.
//
// --- Die fuenf Griffe -------------------------------------------------------
//
//   Rahmen      Jede Oeffnung bekommt eine Lichtlinie. Sie ist die
//               Grundausstattung und der Grund, warum eine Projektion
//               ueberhaupt als "auf diesem Haus" gelesen wird und nicht als
//               "vor diesem Haus".
//
//   Laeufer     Auf Phrasengrenzen rennt ein heller Punkt einmal um einen
//               Rahmen herum. Ein einzelner Rahmen, nicht alle - sonst ist
//               es Dekoration statt Ereignis.
//
//   Fuellung    Ein Fenster wird zur eigenen kleinen Leinwand: Ringe, die
//               aus dem Spektrum kommen, sauber am Fensterrand abgeschnitten.
//               Aus zehn Metern sieht das aus, als brenne drinnen Licht.
//
//   Austritt    Aus der Tuer kommt etwas heraus und steigt die Fassade
//               hinauf. Das ist der eine Effekt, bei dem die Projektion
//               etwas *tut*, statt nur zu leuchten.
//
//   Welle       Ueber die ganze Fassade laeuft eine Front, die jede Oeffnung
//               anzuendet, waehrend sie vorbeikommt. Beim Drop laufen alle
//               zugleich an.
//
// --- Warum das ueber dem Mandala liegt und nicht darin ----------------------
//
// Das Mandala rechnet auf der Grafikkarte und weiss nichts von Fenstern. Es
// umzubauen hiesse, jede seiner Betriebsarten anzufassen. Diese Schicht
// dagegen ist ein Dutzend Pfade je Bild - sie kostet fast nichts, sie
// funktioniert mit *jeder* Betriebsart darunter, und sie faellt weg, wenn
// nichts eingemessen ist.
//
// --- Und warum alles in Anteilen rechnet ------------------------------------
//
// Die Bereiche kommen als Anteile der Entwurfsflaeche - also des Fotos. Was
// hier gezeichnet wird, wird mit der Leinwandgroesse multipliziert und
// sonst nichts. Damit gilt dieselbe Messung auf jedem Bildschirm und bei
// jeder Beameraufloesung.

/*
 * Auf einen Bereich begrenzen.
 *
 * Heisst hier `zwischen` und nicht `klemm`, obwohl `klemm` im Projekt der
 * uebliche Name ist: Der Buendler legt alle Module in *eine* Datei, und dort
 * koennen nicht zwei Funktionen gleich heissen. Er hat den Konflikt mit
 * schattendj.js beim Bauen gemeldet, bevor er Schaden anrichten konnte.
 */
import { toeneAus, mitAlpha } from './farben.js';
import { fleck, Schwarzschnitt } from './gewerke.js';

const zwischen = (x, a, b) => (x < a ? a : x > b ? b : x);

/*
 * Wie schnell ein angezuendeter Rahmen wieder abklingt, je Sekunde.
 *
 * Heisst RAHMEN_ABKLINGEN und nicht nur ABKLINGEN, weil spektrum.js schon
 * eine Konstante dieses Namens hat und der Buendler beide in dieselbe Datei
 * legt. Er hat es beim Bauen gemeldet.
 *
 * 3,2 heisst: nach einer Drittelsekunde noch ein Drittel, nach einer Sekunde
 * ein Zwanzigstel. Kuerzer und das Haus blinkt; laenger und alles bleibt
 * dauernd an, womit der Unterschied zwischen "an" und "aus" verlorengeht -
 * und damit der ganze Effekt.
 */
const RAHMEN_ABKLINGEN = 3.2;

/*
 * Wie lange eine Welle ueber die Fassade braucht, in Schlaegen.
 *
 * Vier - also ein Takt. Bei 124 Schlaegen je Minute sind das 1,9 Sekunden
 * fuer die ganze Breite. Schneller wirkt es wie ein Blitz und man kann ihm
 * nicht folgen; langsamer verliert es den Bezug zur Musik.
 */
const WELLE_SCHLAEGE = 4;

/*
 * Wie viele Teilchen hoechstens aus einer Tuer unterwegs sind.
 *
 * 90 ist gemessen die Grenze, ab der die Zeichenzeit auffaellt - und
 * gleichzeitig weit mehr, als man auf einer Fassade auseinanderhalten kann.
 * Beides zeigt in dieselbe Richtung.
 */
const TEILCHEN_HOECHSTENS = 90;

export class Architektur {
  /**
   * @param {object} bild  aus buehnenbildBauen
   */
  constructor(bild) {
    this.bild = bild;
    // Je Bereich ein Helligkeitswert, der nachgluehen kann.
    this.licht = new Map();
    // Der Laeufer: welcher Bereich, wie weit herum.
    this.laeufer = null;
    this.wellePhase = -1;
    this.teilchen = [];
    this.letzterBeat = -1;
    this.letztePhrase = -1;
    this.dropHall = 0;
    this.oeffnungen = bild.an
      ? bild.bereiche.filter((b) => b.art === 'fenster' || b.art === 'tuer')
      : [];
    this.kanten = bild.an ? bild.bereiche.filter((b) => b.art === 'kante') : [];
    this.tueren = bild.an ? bild.bereiche.filter((b) => b.art === 'tuer') : [];
    this.tot = bild.an ? bild.bereiche.filter((b) => b.art === 'tot') : [];
    this.kaesten = bild.an ? bild.bereiche.filter((b) => b.art === 'gitterbox' && b.zellen) : [];
    this.balkenB = bild.an ? bild.bereiche.filter((b) => b.art === 'balken') : [];
    /*
     * Das Echo der Gitterkaesten.
     *
     * Die Aufgabe: Die Mandalas sollen nicht *vor* den Kaesten laufen,
     * sondern *durch* sie hindurch - wo ein Mandala hell ist, sollen die
     * Flaschen darunter aufleuchten.
     *
     * Der naheliegende Weg waere, jedem Modus beizubringen, wo die Kaesten
     * stehen. Das waeren zwanzig Aenderungen, zwanzig Gelegenheiten fuer
     * Fehler, und jeder neue Modus muesste wieder daran denken.
     *
     * Der Weg hier ist ein anderer und kostet eine einzige Stelle: Nachdem
     * der Modus gezeichnet hat, wird das fertige Bild *abgetastet*. Was an
     * der Stelle einer Zelle hell ist, laesst die Zelle leuchten - egal
     * welcher Modus es dorthin gemalt hat. Ein neuer Modus reagiert damit
     * automatisch, ohne eine Zeile dafuer.
     *
     * Abgetastet wird nicht die grosse Leinwand, sondern eine winzige Kopie
     * davon: Ein `getImageData` ueber 1920x1080 waere je Bild ein Vielfaches
     * des ganzen Budgets, ueber 64x48 ist es nichts. Die Kopie entsteht mit
     * einem einzigen `drawImage`, das die Grafikkarte macht.
     */
    this.echoBreite = 64;
    this.echoHoehe = 48;
    this.echoLeinwand = null;
    this.echoStift = null;
    this.echoFeld = this.kaesten.map((k) => new Float32Array(k.zellen.mitten.length));
    /*
     * Der Schwarzschnitt - auch fuer die Mandalas.
     *
     * Er sitzt hier und nicht in den einzelnen Modi, aus demselben Grund wie
     * das Flaschenecho: Die Architektur laeuft nach jedem Modus, also
     * bekommt jeder Modus den Schnitt geschenkt, ohne davon zu wissen. Ein
     * Mandala, durch das schwarze Balken wandern, ist auf einer Wand etwas
     * ganz anderes als eines, das gleichmaessig leuchtet.
     */
    this.schnitt = new Schwarzschnitt();

    /*
     * Der Kantenblitz.
     *
     * Was beim Einmessen als Kante oder Balken markiert ist, sind die harten
     * Linien des Raumes: Gesimse, Sockel, Deckenbalken. Ein kurzer heller
     * Schlag genau auf ihnen zeichnet fuer einen Wimpernschlag den *Raum*
     * nach statt eines Bildes - und weil er auf einer echten Kante sitzt,
     * sieht er nicht aus wie Projektion, sondern wie eingebautes Licht.
     *
     * Er hat eine Sperrzeit, und die ist der ganze Punkt. Ein Blitz, der auf
     * jedem Drop kommt, ist nach zehn Minuten Tapete; einer, der zweimal im
     * Track kommt, ist ein Ereignis. Dieselbe Ueberlegung wie bei Flamme und
     * Blinder in der Buehnenshow, nur billiger.
     */
    this.kantenBlitz = 0;
    this.kantenSperre = 0;
    /*
     * Die Oeffnungen nach ihrer Lage von links nach rechts sortieren. Die
     * Welle laeuft danach - und eine Welle, die in der Reihenfolge des
     * Anklickens durch die Fassade springt, ist keine Welle.
     */
    this.vonLinks = [...this.oeffnungen].sort((a, b) => a.mitte[0] - b.mitte[0]);
    /*
     * Die Sternformen einmal bauen und aufheben.
     *
     * Ein Stern mit sieben Zacken sind vierzehn Streckenzuege, und bei
     * neunzig Teilchen waeren das gut tausend je Bild - jedes Mal neu
     * beschrieben, obwohl es immer dieselben vier Formen sind. Als Path2D
     * gebaut und mit einer Transformation gesetzt, bleibt davon ein Fuellen
     * je Teilchen.
     */
    this.sterne = new Map();
    for (let z = 5; z <= 8; z++) {
      const pfad = new Path2D();
      for (let k = 0; k < z * 2; k++) {
        const w = (k / (z * 2)) * Math.PI * 2;
        const rr = k % 2 ? 0.42 : 1;
        const x = Math.cos(w) * rr;
        const y = Math.sin(w) * rr;
        if (k) pfad.lineTo(x, y); else pfad.moveTo(x, y);
      }
      pfad.closePath();
      this.sterne.set(z, pfad);
    }
  }

  /** Gibt es ueberhaupt etwas zu tun? */
  get taetig() {
    /*
     * Gitterkaesten und Balken gehoeren mit in diese Liste.
     *
     * Sie standen zuerst nicht darin, und die Folge war still und
     * vollstaendig: In einem Raum, der *nur* Gitterkaesten hat und keine
     * Fenster, hielt sich die Architektur fuer arbeitslos und stieg in der
     * ersten Zeile von `zeichnen` aus. Das Flaschenecho lief nie. Die
     * Messung hat null angeregte Zellen gemeldet - kein Fehler, keine
     * Warnung, einfach nichts.
     */
    return this.bild.an && (this.oeffnungen.length > 0 || this.kanten.length > 0
      || this.tot.length > 0 || this.kaesten.length > 0 || this.balkenB.length > 0);
  }

  /**
   * Ein Bild zeichnen.
   *
   * @param {CanvasRenderingContext2D} stift
   * @param {number} breite   Entwurfsleinwand
   * @param {number} hoehe
   * @param {object} lage     sekunden, takt, wucht, spannung, abbau, drop, palette, spektrum
   */
  /**
   * Die fertige Leinwand verkleinern und je Zelle nachsehen, wie hell es
   * dort ist.
   */
  _echoAbtasten(stift, breite, hoehe, sekunden) {
    if (!this.echoLeinwand) {
      this.echoLeinwand = document.createElement('canvas');
      this.echoLeinwand.width = this.echoBreite;
      this.echoLeinwand.height = this.echoHoehe;
      this.echoStift = this.echoLeinwand.getContext('2d', { willReadFrequently: true });
    }
    const B = this.echoBreite;
    const H = this.echoHoehe;
    this.echoStift.clearRect(0, 0, B, H);
    this.echoStift.drawImage(stift.canvas, 0, 0, B, H);
    const d = this.echoStift.getImageData(0, 0, B, H).data;

    for (let k = 0; k < this.kaesten.length; k++) {
      const zellen = this.kaesten[k].zellen;
      const feld = this.echoFeld[k];
      for (let i = 0; i < feld.length; i++) {
        const [u, v] = zellen.mitten[i];
        const x = Math.min(B - 1, Math.max(0, Math.round(u * B)));
        const y = Math.min(H - 1, Math.max(0, Math.round(v * H)));
        const q = (y * B + x) * 4;
        // Grob die Helligkeit; auf Genauigkeit kommt es hier nicht an, es
        // geht um "da ist etwas" gegen "da ist nichts".
        const hell = (d[q] + d[q + 1] + d[q + 2]) / 765;
        /*
         * Anstieg schnell, Abfall langsam. Eine Flasche, die sofort wieder
         * ausgeht, flackert; eine, die nachgluecht, zieht dem Mandala einen
         * Schweif aus echten Flaschen hinterher.
         */
        feld[i] = hell > feld[i]
          ? hell
          : Math.max(hell, feld[i] - sekunden * 2.4);
      }
    }
  }

  /** Und die angeregten Zellen aufleuchten lassen. */
  _echoZeichnen(stift, breite, hoehe, toene, wucht) {
    const ton = toene[1] ?? toene[0];
    const b = fleck(ton);
    for (let k = 0; k < this.kaesten.length; k++) {
      const zellen = this.kaesten[k].zellen;
      const feld = this.echoFeld[k];
      const gr = Math.max(2, Math.min(zellen.zellBreite, zellen.zellHoehe) * hoehe * 0.4);
      for (let i = 0; i < feld.length; i++) {
        const w = feld[i];
        // Erst ab einer gewissen Helligkeit. Unterhalb davon waere es kein
        // Echo, sondern ein Grauschleier ueber dem ganzen Kasten.
        if (w < 0.12) continue;
        const [u, v] = zellen.mitten[i];
        stift.globalAlpha = Math.min(1, (w - 0.12) * 1.6 * (0.5 + wucht * 0.6));
        stift.drawImage(b, u * breite - gr, v * hoehe - gr, gr * 2, gr * 2);
      }
    }
    stift.globalAlpha = 1;
  }

  zeichnen(stift, breite, hoehe, lage) {
    if (!this.taetig) return;
    const {
      sekunden = 1 / 60, takt = null, wucht = 0.5, spannung = 0, abbau = 0,
      drop = false, palette = null,
      /*
       * Die Buehnenshow treibt die Kaesten selbst - dann darf das Echo
       * nicht auch noch hinein, sonst zeichnen zwei Systeme dieselben
       * Zellen.
       */
      eigeneKaesten = false,
    } = lage;
    // Die Palette der Buehne ist ein Objekt, kein Feld - siehe farben.js.
    const toene = toeneAus(palette);

    this._fortschreiben(sekunden, takt, wucht, spannung, abbau, drop);
    /*
     * Bei der Buehnenshow bringt die Regie ihren eigenen Schnitt mit -
     * zwei uebereinander waeren einer zu viel, genau wie beim Blinder.
     */
    this.schnitt.fortschreiben(sekunden, takt, wucht,
      eigeneKaesten ? 0 : 0.3 + wucht * 0.35);

    /*
     * Abgetastet wird *vor* dem eigenen Zeichnen: Gefragt ist, was der Modus
     * hingelegt hat, nicht was die Architektur gleich dazulegt. Sonst wuerde
     * sich das Echo selbst verstaerken und nach zwei Sekunden stehen alle
     * Zellen auf Anschlag.
     */
    /*
     * Nur jedes zweite Bild abtasten - und die Begruendung dafuer ist eine
     * andere, als sie hier zuerst stand.
     *
     * Die Annahme war: Das Verkleinern der grossen Leinwand erzwingt einen
     * Rasterlauf, das ist der teure Teil, halbe Abtastrate halbiert ihn.
     * Gemessen wurde dann 5,10 gegen 5,00 ms - also praktisch nichts. Der
     * Posten von 1,4 ms steckt nicht im Abtasten, sondern im *Zeichnen* der
     * angeregten Zellen; achtzig weiche Flecken sind achtzig weiche Flecken.
     *
     * Es bleibt trotzdem bei jedem zweiten Bild: Dieser Prueflauf hat keine
     * Grafikkarte, und auf einer echten ist das Zurueckholen von Bildpunkten
     * aus dem Grafikspeicher eher teurer als hier, nicht billiger. Die
     * Massnahme kostet nichts und deckt einen Fall ab, den dieser Behaelter
     * nicht messen kann. Sichtbar ist sie nicht, weil die Zellen nachgluehen.
     */
    this.echoTakt = (this.echoTakt ?? 0) + 1;
    if (!eigeneKaesten && this.kaesten.length && this.echoTakt % 2 === 0) {
      this._echoAbtasten(stift, breite, hoehe, sekunden * 2);
    }

    stift.save();
    /*
     * Additiv zeichnen. Auf einer Wand *addiert* sich Licht - der Beamer kann
     * nichts wegnehmen, was schon da ist. "lighter" ist damit nicht bloss ein
     * huebscher Modus, sondern das physikalisch richtige Verhalten, und es
     * sorgt nebenbei dafuer, dass sich ueberlappende Effekte nicht gegenseitig
     * ausstechen.
     */
    stift.globalCompositeOperation = 'lighter';
    if (!eigeneKaesten && this.kaesten.length) {
      this._echoZeichnen(stift, breite, hoehe, toene, wucht);
    }
    this._fuellungen(stift, breite, hoehe, toene, wucht, lage.spektrum);
    this._rahmen(stift, breite, hoehe, toene, wucht);
    this._teilchen(stift, breite, hoehe, toene);
    this._laeufer(stift, breite, hoehe, toene);
    this._kantenBlitz(stift, breite, hoehe, toene);
    stift.restore();

    // Die Totzonen zuletzt und *nicht* additiv: Sie nehmen weg.
    this._totzonen(stift, breite, hoehe);

    /*
     * Und ganz zuletzt der Schwarzschnitt, aus demselben Grund: Er addiert
     * nicht, er loescht. Er nimmt damit auch aus dem Modus darunter Licht
     * heraus, und genau das ist gewollt - ein schwarzer Balken, der die
     * Fensterrahmen durchschneidet, aber nicht das Mandala dahinter, waere
     * kein Balken, sondern ein Zeichenfehler.
     *
     * Diese Zeile stand versehentlich einmal *in* `_totzonen`, und der
     * Fehler war unsichtbar: Diese Methode laeuft nur, wenn es Totzonen
     * gibt. In einem Raum ohne welche wurde der Schnitt nie gezeichnet -
     * kein Fehler, keine Warnung, nur eine Messung, die sich nicht bewegte.
     */
    this.schnitt.zeichnen(stift, breite, hoehe);
  }

  /* --- Der innere Stand ---------------------------------------------------- */

  /*
   * Sperrzeit des Kantenblitzes, in Sekunden.
   *
   * Neun Sekunden sind bei 124 Schlaegen je Minute knapp fuenf Takte - lang
   * genug, dass zwei Blitze nie zur Folge werden, kurz genug, dass ein
   * Aufbau mit mehreren Drops nicht nur einen einzigen abbekommt.
   */
  static get KANTEN_SPERRE() { return 9; }

  _fortschreiben(sekunden, takt, wucht, spannung, abbau, drop) {
    const abfall = Math.exp(-RAHMEN_ABKLINGEN * sekunden);
    for (const [k, v] of this.licht) this.licht.set(k, v * abfall);
    if (this.dropHall > 0) this.dropHall = Math.max(0, this.dropHall - sekunden * 0.8);

    const beat = takt ? takt.beat ?? takt.nummer : null;

    /*
     * Die Welle laeuft in Schlaegen und nicht in Sekunden - derselbe Grund
     * wie ueberall sonst in diesem Projekt: Ein Tempowechsel im Mix soll sie
     * mitnehmen, nicht abhaengen.
     */
    if (this.wellePhase >= 0 && beat !== null) {
      this.wellePhase += (sekunden / (60 / (takt.bpm ?? 124))) / WELLE_SCHLAEGE;
      if (this.wellePhase > 1.2) this.wellePhase = -1;
      else this._welleAnzuenden();
    }

    if (takt && takt.nummer !== this.letzterBeat) {
      this.letzterBeat = takt.nummer;
      /*
       * Auf jedem Schlag glimmen alle Rahmen kurz auf - aber schwach, und
       * gestaffelt nach Takt. Der Unterschied zum Klopfen des Schatten-DJs:
       * Hier ist es *Licht* und keine Bewegung, und Licht auf einer Fassade
       * darf im Takt pulsieren, ohne dass es wie ein Metronom wirkt. Bewegung
       * darf das nicht.
       */
      const staerke = (takt.aufEins ? 0.5 : 0.22) * zwischen(wucht * 1.4, 0, 1);
      for (const b of this.oeffnungen) this._anzuenden(b, staerke);
      for (const b of this.kanten) this._anzuenden(b, staerke * 0.7);

      // Auf Phrasengrenzen: ein Laeufer und eine Welle.
      if (takt.aufPhrase && takt.nummer !== this.letztePhrase) {
        this.letztePhrase = takt.nummer;
        if (wucht > 0.3 && abbau < 0.3) {
          this.wellePhase = 0;
          const ziel = this.oeffnungen[Math.floor(Math.random() * this.oeffnungen.length)];
          if (ziel) this.laeufer = { bereich: ziel, wo: 0, tempo: 1 / WELLE_SCHLAEGE };
        }
      }
    }

    // Der Blitz klingt schnell ab - er ist ein Schlag, kein Licht.
    if (this.kantenBlitz > 0) this.kantenBlitz = Math.max(0, this.kantenBlitz - sekunden * 4.5);
    if (this.kantenSperre > 0) this.kantenSperre = Math.max(0, this.kantenSperre - sekunden);

    if (drop) {
      this.dropHall = 1;
      /*
       * Der Drop zuendet die Kanten - aber nur, wenn die Sperre abgelaufen
       * ist. Und nur, wenn wirklich Energie da ist: Ein Drop im Ausklang
       * ist kein Moment fuer den staerksten Akzent, den dieses Modul hat.
       */
      if (this.kantenSperre <= 0 && wucht > 0.5
        && (this.kanten.length > 0 || this.balkenB.length > 0)) {
        this.kantenBlitz = 1;
        this.kantenSperre = Architektur.KANTEN_SPERRE;
      }
      // Beim Drop alles auf einmal - das ist der eine Moment, in dem die ganze
      // Fassade brennen darf.
      for (const b of this.bild.bereiche) this._anzuenden(b, 1.4);
      this.wellePhase = 0;
      for (const t of this.tueren) this._ausstossen(t, 26);
    }

    // Der Laeufer.
    if (this.laeufer) {
      const proSekunde = takt ? this.laeufer.tempo / (60 / (takt.bpm ?? 124)) : this.laeufer.tempo * 2;
      this.laeufer.wo += proSekunde * sekunden;
      if (this.laeufer.wo >= 1) this.laeufer = null;
    }

    // Aus den Tueren steigt dauernd etwas auf, je energischer desto mehr.
    const rate = zwischen(wucht * 1.6 - abbau - 0.15, 0, 1) * 14;
    for (const t of this.tueren) {
      if (Math.random() < rate * sekunden) this._ausstossen(t, 1);
    }
    this._teilchenSchieben(sekunden, spannung);
  }

  _anzuenden(b, wieviel) {
    this.licht.set(b, Math.min(1.6, (this.licht.get(b) ?? 0) + wieviel));
  }

  _welleAnzuenden() {
    /*
     * Die Front laeuft von links nach rechts durch die Fassade und zuendet
     * jede Oeffnung an, waehrend sie vorbeikommt. Verglichen wird die
     * *Mitte* jedes Bereichs mit der Frontposition - und die Front ist
     * bewusst weich, sonst springt sie von Fenster zu Fenster statt zu
     * fliessen.
     */
    const front = this.wellePhase;
    for (const b of this.vonLinks) {
      const d = Math.abs(b.mitte[0] - front);
      if (d < 0.16) this._anzuenden(b, (1 - d / 0.16) * 0.1);
    }
  }

  _ausstossen(tuer, wieviele) {
    for (let i = 0; i < wieviele && this.teilchen.length < TEILCHEN_HOECHSTENS; i++) {
      // Am unteren Rand der Tuer starten, ueber die Breite verteilt.
      const t = Math.random();
      const x = tuer.kasten.links + tuer.kasten.breite * t;
      const y = tuer.kasten.unten - tuer.kasten.hoehe * 0.1 * Math.random();
      this.teilchen.push({
        x, y,
        vx: (Math.random() - 0.5) * 0.05,
        vy: -0.04 - Math.random() * 0.08,
        alter: 0,
        leben: 2.4 + Math.random() * 2.4,
        gross: 0.004 + Math.random() * 0.010,
        dreh: Math.random() * Math.PI * 2,
        drehTempo: (Math.random() - 0.5) * 2.4,
        zacken: 5 + Math.floor(Math.random() * 4),
      });
    }
  }

  _teilchenSchieben(sekunden, spannung) {
    const uebrig = [];
    for (const p of this.teilchen) {
      p.alter += sekunden;
      if (p.alter >= p.leben) continue;
      // Auftrieb, der mit der Spannung zunimmt - vor dem Drop zieht es hoch.
      p.vy -= sekunden * (0.012 + spannung * 0.05);
      p.x += p.vx * sekunden;
      p.y += p.vy * sekunden;
      p.dreh += p.drehTempo * sekunden;
      // Wer den Beamer verlaesst, ist weg - dort waere er ohnehin unsichtbar.
      if (p.y < -0.05 || p.x < -0.05 || p.x > 1.05) continue;
      uebrig.push(p);
    }
    this.teilchen = uebrig;
  }

  /* --- Zeichnen ------------------------------------------------------------ */

  _rahmen(stift, breite, hoehe, toene, wucht) {
    const grund = 0.10 + wucht * 0.12;
    for (const b of [...this.oeffnungen, ...this.kanten]) {
      const l = zwischen(grund + (this.licht.get(b) ?? 0), 0, 1);
      if (l < 0.02) continue;
      /*
       * Die Strichbreite waechst mit der Helligkeit. Ohne das saehe ein
       * angezuendeter Rahmen nur heller aus; mit ihr wirkt er, als wuerde
       * das Licht ueberquellen - und genau das macht auf einer Wand den
       * Unterschied zwischen "eine Linie" und "es brennt".
       */
      stift.strokeStyle = toene[3];
      stift.globalAlpha = l * 0.85;
      stift.lineWidth = Math.max(1, (0.0012 + l * 0.0035) * breite);
      stift.lineJoin = 'round';
      stift.beginPath();
      b.punkte.forEach(([x, y], i) => (i ? stift.lineTo(x * breite, y * hoehe) : stift.moveTo(x * breite, y * hoehe)));
      if (b.art !== 'kante') stift.closePath();
      stift.stroke();

      // Ein zweiter, breiter und schwacher Zug darunter: der Hof um die Linie.
      stift.strokeStyle = toene[1];
      stift.globalAlpha = l * 0.28;
      stift.lineWidth = Math.max(2, (0.004 + l * 0.012) * breite);
      stift.stroke();
    }
    stift.globalAlpha = 1;
  }

  _fuellungen(stift, breite, hoehe, toene, wucht, spektrum) {
    for (const b of this.oeffnungen) {
      const l = this.licht.get(b) ?? 0;
      if (l < 0.05 && this.dropHall < 0.1) continue;
      stift.save();
      // Am Fensterrand abschneiden - das ist der ganze Trick. Was ausserhalb
      // laege, machte aus der Oeffnung wieder eine Flaeche.
      stift.beginPath();
      b.punkte.forEach(([x, y], i) => (i ? stift.lineTo(x * breite, y * hoehe) : stift.moveTo(x * breite, y * hoehe)));
      stift.closePath();
      stift.clip();

      const mx = b.mitte[0] * breite;
      const my = b.mitte[1] * hoehe;
      const r = Math.max(b.kasten.breite * breite, b.kasten.hoehe * hoehe) * 0.75;

      /*
       * Ringe aus dem Spektrum. Die inneren kommen vom Bass, die aeusseren
       * von den Hoehen - wer davorsteht, sieht die Musik im Fenster stehen.
       */
      const ringe = 5;
      for (let k = ringe - 1; k >= 0; k--) {
        const anteil = (k + 1) / ringe;
        const bin = spektrum ? spektrum[Math.floor(anteil * anteil * (spektrum.length - 1) * 0.4)] / 255 : wucht;
        const gr = r * anteil * (0.65 + bin * 0.5);
        stift.fillStyle = toene[k % toene.length];
        stift.globalAlpha = zwischen(l * 0.5 + this.dropHall * 0.35, 0, 1) * (0.16 + bin * 0.3) / (k * 0.5 + 1);
        stift.beginPath();
        stift.arc(mx, my, gr, 0, Math.PI * 2);
        stift.fill();
      }
      stift.restore();
    }
    stift.globalAlpha = 1;
  }

  _teilchen(stift, breite, hoehe, toene) {
    for (const p of this.teilchen) {
      const u = p.alter / p.leben;
      // Aufblenden, lange stehen, ausblenden - ein Teilchen, das sofort da
      // ist, sieht aus wie ein Fehler im Bild.
      const sicht = Math.min(1, u * 6) * (1 - u * u);
      if (sicht <= 0.01) continue;
      const gr = p.gross * breite * (0.6 + u * 0.8);
      stift.save();
      stift.translate(p.x * breite, p.y * hoehe);
      stift.rotate(p.dreh);
      stift.globalAlpha = sicht * 0.85;
      stift.fillStyle = toene[p.zacken % toene.length];
      /*
       * Ein kleiner Stern und kein Kreis. Ein Kreis auf einer Fassade sieht
       * aus wie ein Fleck; eine Form mit Zacken liest das Auge als Bluete
       * oder Funke - und genau das soll aus der Tuer kommen.
       *
       * Die Form ist vorgebaut und wird nur skaliert. Sie je Teilchen neu zu
       * beschreiben waeren bei neunzig Teilchen gut tausend Streckenzuege je
       * Bild fuer vier immer gleiche Formen.
       */
      stift.scale(gr, gr);
      stift.fill(this.sterne.get(p.zacken) ?? this.sterne.get(5));
      stift.restore();
    }
    stift.globalAlpha = 1;
  }

  _laeufer(stift, breite, hoehe, toene) {
    if (!this.laeufer) return;
    const b = this.laeufer.bereich;
    /*
     * Der Laeufer ist kein Punkt, sondern ein kurzer Schweif: acht Marken
     * hintereinander auf dem Rand, nach hinten schwaecher. Ein einzelner
     * Punkt waere bei sechzig Bildern je Sekunde und einem Takt Umlaufzeit
     * schlicht nicht zu sehen.
     */
    for (let k = 0; k < 8; k++) {
      const t = this.laeufer.wo - k * 0.02;
      if (t < 0) break;
      const [x, y] = b.aufDemRand(t);
      stift.fillStyle = toene[3];
      stift.globalAlpha = (1 - k / 8) ** 2;
      stift.beginPath();
      stift.arc(x * breite, y * hoehe, (0.004 - k * 0.0003) * breite, 0, Math.PI * 2);
      stift.fill();
    }
    stift.globalAlpha = 1;
  }

  _totzonen(stift, breite, hoehe) {
    if (!this.tot.length) return;
    /*
     * Schwarz und undurchsichtig. Eine Totzone ist Glas, dunkler Stein oder
     * ein Baum davor - dort geht das Licht des Beamers ohnehin verloren. Es
     * bewusst wegzunehmen ist besser, als es verschwinden zu *lassen*: Die
     * Kante wird sauber, und das Auge liest die Aussparung als Absicht.
     */
    stift.save();
    stift.fillStyle = '#000';
    for (const b of this.tot) {
      stift.beginPath();
      b.punkte.forEach(([x, y], i) => (i ? stift.lineTo(x * breite, y * hoehe) : stift.moveTo(x * breite, y * hoehe)));
      stift.closePath();
      stift.fill();
    }
    stift.restore();
  }

  /**
   * Die markierten Kanten und Balken kurz weiss aufreissen.
   *
   * Hell und *hart*: keine weichen Flecken, sondern eine Linie mit einem
   * Kern. Eine echte Kante wirft ein hartes Licht, und genau daran erkennt
   * das Auge, dass da etwas Gebautes ist und nicht etwas Gemaltes.
   */
  _kantenBlitz(stift, breite, hoehe, toene) {
    if (this.kantenBlitz < 0.02) return;
    const w = this.kantenBlitz;
    const linien = [...this.kanten, ...this.balkenB];
    if (!linien.length) return;
    stift.lineCap = 'round';
    for (const b of linien) {
      // Die Mittellinie des Bereichs: Anfang und Mitte des Umfangs sind bei
      // einem langen, schmalen Viereck genau die beiden Enden.
      const a = b.aufDemRand ? b.aufDemRand(0) : b.punkte[0];
      const c = b.aufDemRand ? b.aufDemRand(0.5) : b.punkte[2];
      // Erst ein breiter, schwacher Schein - das ist der Hof.
      stift.strokeStyle = toene[1] ?? toene[0];
      stift.globalAlpha = zwischen(w * 0.4, 0, 1);
      stift.lineWidth = Math.max(2, hoehe * 0.02 * w);
      stift.beginPath();
      stift.moveTo(a[0] * breite, a[1] * hoehe);
      stift.lineTo(c[0] * breite, c[1] * hoehe);
      stift.stroke();
      // Und darauf der harte Kern.
      stift.strokeStyle = 'hsl(210 25% 96%)';
      stift.globalAlpha = zwischen(w * 0.95, 0, 1);
      stift.lineWidth = Math.max(1, hoehe * 0.0035);
      stift.stroke();
    }
    stift.globalAlpha = 1;
  }

  /** Fuer die Abnahme: der innere Stand, ohne dass etwas gezeichnet werden muss. */
  stand() {
    return {
      taetig: this.taetig,
      oeffnungen: this.oeffnungen.length,
      teilchen: this.teilchen.length,
      wellePhase: this.wellePhase,
      laeufer: this.laeufer ? { name: this.laeufer.bereich.name, wo: this.laeufer.wo } : null,
      dropHall: this.dropHall,
      kantenBlitz: this.kantenBlitz,
      kantenSperre: this.kantenSperre,
      licht: Object.fromEntries([...this.licht].map(([b, v]) => [b.name, v])),
    };
  }
}
