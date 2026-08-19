// Ein Lichtpark auf der Fassade.
//
// Kein Mandala, sondern das, was auf einer angestrahlten Fassade wirklich
// passiert: Uplighter werfen Kegel die Wand hinauf, Punktreihen sitzen auf
// den Gesimsen, ein schmaler Strahl wandert, und beim Drop macht der Blinder
// alles weiss.
//
// --- Warum das ein eigener Modus ist und kein Effekt ------------------------
//
// Ein Mandala ist ein Bild *auf* der Wand. Licht ist etwas anderes: Es kommt
// von irgendwo, es hat eine Richtung, es wird schwaecher, je weiter es
// kommt, und es addiert sich. Das laesst sich nicht als Verzierung ueber ein
// Fraktal legen - es braucht eine eigene Betriebsart, in der die Wand nicht
// Leinwand ist, sondern beleuchteter Gegenstand.
//
// --- Wo die Lampen stehen ---------------------------------------------------
//
// Bei einer echten Fassadenbeleuchtung stehen die Uplighter *nicht* unter den
// Fenstern, sondern in den Pfeilern dazwischen - dort ist Mauerwerk, das das
// Licht zurueckwirft, und dort blendet niemanden ein Strahler durch die
// Scheibe.
//
// Genau das laesst sich aus der Einmessung ableiten: Fenster der Reihe nach
// von links nach rechts, und die Lampen in die Luecken. Ist nichts
// eingemessen, stehen sie gleichmaessig verteilt - dann sieht es immer noch
// nach Lichtpark aus, nur eben nicht nach *diesem* Haus.
//
// --- Warum kein Stroboskop --------------------------------------------------
//
// Es waere der naheliegende Partyeffekt und es ist der einzige, der hier
// nicht vorkommt. Die Blitzschwelle (WCAG 2.3.1) erlaubt hoechstens drei
// Blitze je Sekunde, und die Palette dieses Projekts ist ausdruecklich so
// dunkel gehalten, dass ein Blitz gar nicht darstellbar ist - nachgewiesen in
// FARBWIRKUNG.md. Ein Modus, der das aushebelt, waere kein Fortschritt,
// sondern die Ruecknahme einer Zusage. Der Blinder ist deshalb gedeckelt:
// hoechstens zweimal je Sekunde, und nie auf voller Flaeche zugleich.

import { lichtToene, mitAlpha } from './farben.js';

const klammer = (x, a, b) => (x < a ? a : x > b ? b : x);

/*
 * Wie viele Uplighter hoechstens stehen.
 *
 * Zwoelf. Auf den Vorlagen sind es sieben bis neun - so viele, dass jeder
 * Pfeiler einen bekommt, und so wenige, dass man sie einzeln wahrnimmt. Ab
 * etwa fuenfzehn verschmelzen die Kegel zu einer Wand aus Licht, und dann ist
 * es kein Lichtpark mehr, sondern eine Flutlichtanlage.
 */
const LAMPEN_HOECHSTENS = 12;

/*
 * Wie hoch ein Kegel reicht, als Anteil der Bildhoehe.
 *
 * 0,72 - auf den Vorlagen laeuft das Licht bis knapp unter das Dachgesims
 * und verliert sich dort. Bis ganz nach oben waere flaches Anstrahlen, und
 * das nimmt der Fassade genau die Tiefe, um die es geht.
 */
const KEGEL_HOEHE = 0.72;

/*
 * Wie schnell der Blinder hoechstens wiederkommt, in Sekunden.
 *
 * Eine halbe Sekunde, also zwei je Sekunde. Die Blitzschwelle erlaubt drei -
 * der Abstand zur Grenze ist Absicht und nicht Vorsicht: Ein Drop faellt
 * ohnehin nicht oefter als alle paar Takte, und wer den Deckel spuert, hat
 * etwas anderes falsch gemacht.
 */
const BLINDER_SPERRE = 0.5;

/*
 * Wie hell die Kegel hoechstens werden.
 *
 * 0,5 und nicht mehr, und die Zahl ist gemessen: Bei 0,6 kam das hellste Bild
 * eines Laufs mit Drops alle zwei Sekunden auf eine relative Leuchtdichte von
 * 0,099. Die Blitzschwelle liegt bei 0,10 - das waere ein Prozent Abstand
 * gewesen, und ein Prozent Abstand ist bei einer Sicherheitszusage kein
 * Abstand, sondern Glueck. Mit 0,5 sind es 0,081, also gut ein Fuenftel Luft.
 *
 * Wer hier hochdreht, muss `npm run dj:lichtpruefen` erneut laufen lassen.
 */
const KEGEL_DECKUNG = 0.5;

/*
 * Farbbilder - was ein Lichtpult "Look" nennt.
 *
 * Ein echter Lichtpark stellt nicht jede Lampe einzeln, sondern schaltet
 * Bilder: alles gleich, geteilt, im Verlauf, im Wechsel. Auf einer Fassade
 * ist das der Unterschied zwischen "bunt" und "gestellt" - und Bilder lassen
 * sich auf die Phrase schalten, einzelne Lampen nicht.
 */
const FARBBILDER = [
  { name: 'einfarbig', farbe: (i, n, p) => p[0] },
  { name: 'wechsel', farbe: (i, n, p) => p[i % 2] },
  { name: 'verlauf', farbe: (i, n, p) => p[Math.floor((i / Math.max(1, n - 1)) * (p.length - 1))] },
  { name: 'mitte', farbe: (i, n, p) => (Math.abs(i - (n - 1) / 2) < n / 5 ? p[3] ?? p[0] : p[1]) },
  { name: 'aussen', farbe: (i, n, p) => (i === 0 || i === n - 1 ? p[3] ?? p[0] : p[0]) },
];

export class Partylicht {
  /**
   * @param {object} bild  aus buehnenbildBauen - darf auch abgeschaltet sein
   */
  constructor(bild) {
    this.bild = bild;
    this.lampen = this._lampenStellen(bild);
    this.reihen = this._reihenStellen(bild);
    this.farbbild = 0;
    this.blinder = 0;
    this.blinderSperre = 0;
    /*
     * Der Blinder laesst sich abgeben.
     *
     * Laeuft der Lichtpark fuer sich, ist er sein eigener Hoehepunkt und
     * braucht ihn. Laeuft er als Grundlicht *innerhalb* der Buehnenshow, hat
     * die einen eigenen - und dann feuern beim selben Drop zwei Blinder
     * uebereinander. Gemessen: 0,125 mittlere Leuchtdichte im hellsten Bild
     * gegen eine Blitzschwelle von 0,10, waehrend jeder der beiden einzeln
     * bei rund 0,076 bleibt.
     *
     * Die Sucherei danach ist lehrreich gewesen. Der Verdacht lag zuerst auf
     * dem Blinder der Show, dann auf dem Grundlicht; gemessen hat sich beides
     * als harmlos erwiesen - der Lichtpark allein kommt ohne Drop auf 0,017.
     * Sichtbar wurde es erst, als der Blinder der Show gedeckelt wurde und
     * das hellste Bild *trotzdem* stehen blieb. Zwei Gewerke, die einzeln
     * jede Grenze halten und zusammen keine: genau der Fall, den eine
     * Abnahme je Bauteil nicht findet.
     */
    this.blinderAus = false;
    this.letzterBeat = -1;
    this.letztePhrase = -1;
    this.kette = 0;
    // Der wandernde Strahl: Ziel und Ist, damit er faehrt statt zu springen.
    this.strahlZiel = 0.5;
    this.strahlIst = 0.5;
    this.helligkeit = 0;
    // Vorgerechnete Leuchtflecken je Farbe - siehe _fleckHolen.
    this.flecken = new Map();
    this.fleckenFuer = null;
  }

  /**
   * Wo die Uplighter stehen.
   *
   * Aus den Fenstern abgeleitet: sortiert von links nach rechts, und die
   * Lampen in die Luecken *zwischen* ihnen sowie an die beiden Aussenraender.
   * Bei n Fenstern ergibt das n+1 Lampen - genau das Bild einer echten
   * Fassadenbeleuchtung.
   */
  _lampenStellen(bild) {
    let stellen = [];
    const fenster = bild.an ? bild.bereiche.filter((b) => b.art === 'fenster') : [];
    if (fenster.length >= 2) {
      const x = fenster.map((f) => f.mitte[0]).sort((a, b) => a - b);
      const kasten = fenster.map((f) => f.kasten);
      const linksAussen = Math.min(...kasten.map((k) => k.links));
      const rechtsAussen = Math.max(...kasten.map((k) => k.rechts));
      stellen.push(Math.max(0.02, linksAussen - 0.04));
      for (let i = 1; i < x.length; i++) stellen.push((x[i - 1] + x[i]) / 2);
      stellen.push(Math.min(0.98, rechtsAussen + 0.04));
      // Dicht beieinanderliegende zusammenfassen - zwei Lampen auf einem
      // Pfeiler sind eine zu viel.
      stellen = stellen.filter((v, i, a) => i === 0 || v - a[i - 1] > 0.035);
    }
    if (stellen.length < 3 || stellen.length > LAMPEN_HOECHSTENS) {
      // Gleichmaessig verteilt. Ohne Einmessung ist das der ganze Plan, und
      // er sieht immer noch nach Lichtpark aus.
      const n = Math.min(LAMPEN_HOECHSTENS, Math.max(7, stellen.length || 9));
      stellen = Array.from({ length: n }, (_, i) => (i + 0.5) / n);
    }

    /*
     * Der Fusspunkt: die Unterkante des Bildes, oder - wenn ein Gesims
     * eingemessen ist - dessen Oberkante. Auf den Vorlagen sitzen die
     * Strahler genau dort, wo eine waagerechte Flaeche sie tragen kann.
     */
    const kanten = bild.an ? bild.bereiche.filter((b) => b.art === 'kante') : [];
    const tiefste = kanten.length ? Math.max(...kanten.map((k) => k.kasten.oben)) : null;
    const fuss = tiefste !== null ? tiefste : 0.97;

    return stellen.map((x, i) => ({
      x,
      y: fuss,
      nummer: i,
      // Jede Lampe bekommt ihre eigene kleine Abweichung. Ein Lichtpark, in
      // dem alle Kegel exakt gleich stehen, sieht gerechnet aus - echte
      // Strahler stehen nie ganz gleich.
      neigung: (Math.sin(i * 12.9898) * 0.5) * 0.06,
      breite: 0.055 + Math.abs(Math.sin(i * 78.233)) * 0.02,
    }));
  }

  /** Punktreihen auf den Gesimsen. */
  _reihenStellen(bild) {
    if (!bild.an) return [{ y: 0.55, von: 0.08, bis: 0.92, zahl: 14 }];
    const kanten = bild.bereiche.filter((b) => b.art === 'kante');
    if (!kanten.length) return [];
    return kanten.map((k) => ({
      y: (k.kasten.oben + k.kasten.unten) / 2,
      von: k.kasten.links + 0.01,
      bis: k.kasten.rechts - 0.01,
      // Etwa alle sechs Prozent der Breite ein Punkt - so stehen sie auf den
      // Vorlagen, dicht genug fuer eine Kette und weit genug zum Zaehlen.
      zahl: klammer(Math.round((k.kasten.rechts - k.kasten.links) / 0.06), 4, 24),
    }));
  }

  /* --- Rechnen ------------------------------------------------------------- */

  fortschreiben(sekunden, takt, wucht, spannung, abbau, drop) {
    this.helligkeit += (klammer(wucht * 1.25 - abbau * 0.8, 0.12, 1) - this.helligkeit)
      * klammer(sekunden * 3, 0, 1);
    if (this.blinder > 0) this.blinder = Math.max(0, this.blinder - sekunden * 5);
    if (this.blinderSperre > 0) this.blinderSperre = Math.max(0, this.blinderSperre - sekunden);

    // Der Strahl faehrt seinem Ziel nach - Bewegung, kein Springen.
    this.strahlIst += (this.strahlZiel - this.strahlIst) * klammer(sekunden * 3.4, 0, 1);

    if (takt && takt.nummer !== this.letzterBeat) {
      this.letzterBeat = takt.nummer;
      // Die Kette rueckt einen Punkt weiter, bei viel Energie zwei.
      this.kette += wucht > 0.65 ? 2 : 1;
      // Der Strahl sucht sich alle zwei Schlaege eine neue Ecke.
      if (takt.nummer % 2 === 0) this.strahlZiel = 0.1 + Math.random() * 0.8;

      if (takt.aufPhrase && takt.nummer !== this.letztePhrase) {
        this.letztePhrase = takt.nummer;
        // Neues Farbbild auf der Phrase - nie dasselbe zweimal.
        if (FARBBILDER.length > 1) {
          let neu = this.farbbild;
          while (neu === this.farbbild) neu = Math.floor(Math.random() * FARBBILDER.length);
          this.farbbild = neu;
        }
      }
    }

    if (drop && !this.blinderAus && this.blinderSperre <= 0) {
      this.blinder = 1;
      this.blinderSperre = BLINDER_SPERRE;
    }
  }

  /**
   * Ein Leuchtfleck als vorgerechnetes Bild.
   *
   * Ein Farbverlauf je Punkt und Bild waere bei zwei Dutzend Punkten zwei
   * Dutzend Verlaeufe je Bild - und ein Verlauf ist das Teuerste, was eine
   * Leinwand kennt. Vorgerechnet je Farbe wird daraus ein Zeichnen eines
   * fertigen Bildes, und die Farben wechseln nur auf der Phrase.
   */
  _fleckHolen(farbe) {
    if (this.fleckenFuer !== farbe && !this.flecken.has(farbe)) {
      const gr = 64;
      const c = document.createElement('canvas');
      c.width = gr * 2;
      c.height = gr * 2;
      const s = c.getContext('2d');
      const v = s.createRadialGradient(gr, gr, 0, gr, gr, gr);
      v.addColorStop(0, '#ffffff');
      v.addColorStop(0.18, farbe);
      // Quadratisch abfallend, wie echtes Licht.
      v.addColorStop(0.45, mitAlpha(farbe, 0.4));
      v.addColorStop(1, mitAlpha(farbe, 0));
      s.fillStyle = v;
      s.fillRect(0, 0, gr * 2, gr * 2);
      this.flecken.set(farbe, c);
      // Der Vorrat bleibt klein: Es gibt nur eine Handvoll Palettenfarben,
      // und beim Palettenwechsel wird geleert.
      if (this.flecken.size > 24) this.flecken.clear();
    }
    return this.flecken.get(farbe);
  }

  /* --- Zeichnen ------------------------------------------------------------ */

  zeichnen(stift, lage) {
    const {
      breite, hoehe, sekunden = 1 / 60, takt = null, wucht = 0.5,
      spannung = 0, abbau = 0, drop = false, spektrum = null,
      palette = null,
      /*
       * Wie stark die Punktreihen laufen duerfen. Die Regie in
       * buehnenshow.js stellt das je Bild ein - im Bild "Kette" sind sie die
       * Hauptsache, im Bild "Beams" waeren sie Unruhe.
       */
      streifen = 1,
      /*
       * Die Buehnenshow setzt das: Sie bringt ihren eigenen Blinder mit,
       * und zwei uebereinander sind einer zu viel. Siehe `blinderAus` im
       * Konstruktor.
       */
      blinderAus = false,
    } = lage;
    this.blinderAus = blinderAus;

    /*
     * Wie viele Lampen wirklich gezeichnet werden, haengt an der Guetestufe.
     *
     * Ein Kegel ist teuer, weil er viel Flaeche bedeckt - und das ist die
     * einzige Stellschraube, die linear wirkt. Auf einer schwachen Maschine
     * bleiben jede zweite oder jede dritte Lampe aus; das Bild wird duenner,
     * aber es bleibt ein Lichtpark. Auf dem Party-Rechner mit Grafikkarte
     * greift die Bremse nie.
     */
    const jede = lage.guetestufe === 'niedrig' ? 3 : lage.guetestufe === 'mittel' ? 2 : 1;

    this.fortschreiben(sekunden, takt, wucht, spannung, abbau, drop);
    // Eigene, helle Farben aus den Farbwinkeln der Palette - siehe farben.js.
    const toene = lichtToene(palette);
    const bild = FARBBILDER[this.farbbild];
    const n = this.lampen.length;

    /*
     * Dunst.
     *
     * Auf jeder der Vorlagen ist er da, und ohne ihn saehen die Kegel aus wie
     * aufgeklebte Dreiecke: Ein Lichtstrahl ist nur zu *sehen*, wenn etwas in
     * der Luft ist, an dem er sich bricht. Ein schwacher Verlauf von unten
     * nach oben ist die billigste ueberzeugende Fassung davon.
     */
    stift.save();
    stift.globalCompositeOperation = 'lighter';
    const dunst = stift.createLinearGradient(0, hoehe, 0, hoehe * 0.15);
    dunst.addColorStop(0, mitAlpha(toene[1], 0.13));
    dunst.addColorStop(1, mitAlpha(toene[1], 0));
    stift.fillStyle = dunst;
    stift.globalAlpha = 0.14 + this.helligkeit * 0.16;
    stift.fillRect(0, 0, breite, hoehe);
    stift.globalAlpha = 1;

    // --- Die Kegel ---
    for (let i = 0; i < n; i++) {
      if (jede > 1 && i % jede !== 0) continue;
      const l = this.lampen[i];
      const farbe = bild.farbe(i, n, toene);
      /*
       * Jede Lampe reagiert auf ihr eigenes Stueck des Spektrums. Damit
       * flackert die Wand nicht gleichmaessig, sondern von links nach rechts
       * verschieden - und man sieht, dass die Musik mehr ist als laut und
       * leise.
       */
      const band = spektrum
        ? spektrum[Math.floor(((i + 0.5) / n) ** 1.6 * (spektrum.length - 1) * 0.42)] / 255
        : wucht;
      const kraft = klammer(this.helligkeit * (0.45 + band * 0.75) + this.blinder * 0.5, 0, 1.3);
      if (kraft < 0.03) continue;

      const fx = l.x * breite;
      const fy = l.y * hoehe;
      const reich = hoehe * KEGEL_HOEHE * (0.55 + kraft * 0.55) * (1 + spannung * 0.15);
      const halb = breite * l.breite * (0.7 + kraft * 0.6);
      const kippen = l.neigung + (i - (n - 1) / 2) * 0.012;

      /*
       * Ein Durchgang je Kegel, nicht zwei.
       *
       * Gemessen: Zwei Durchgaenge kosteten bei 960 mal 540 gut 4,7 ms je
       * Bild, und der Engpass ist nicht die Verlaufsrechnung, sondern die
       * schiere Zahl der gemischten Bildpunkte - ein Kegel bedeckt einen
       * grossen Teil der Leinwand. Ein Versuch, den Kegel als fertiges Bild
       * vorzurechnen, war sogar *langsamer* (5,9 ms): Ein `drawImage` mit
       * Scherung muss genauso jeden Bildpunkt anfassen, nur zusaetzlich mit
       * Abtastung.
       *
       * Die weiche Querkante kommt jetzt aus dem Verlauf selbst plus dem
       * Leuchtfleck an der Duese. Das ist ein Kompromiss, und es ist der
       * richtige: Die Haelfte der Bildpunkte gespart, und aus zehn Metern
       * sieht man den Unterschied nicht.
       */
      const v = stift.createLinearGradient(fx, fy, fx + kippen * reich, fy - reich);
      v.addColorStop(0, farbe);
      v.addColorStop(0.10, mitAlpha(farbe, 0.55));
      v.addColorStop(0.5, mitAlpha(farbe, 0.16));
      v.addColorStop(1, mitAlpha(farbe, 0));
      stift.fillStyle = v;
      stift.globalAlpha = klammer(kraft * KEGEL_DECKUNG, 0, 1);
      stift.beginPath();
      // Schmal an der Duese, weit oben - andersherum als ein Scheinwerfer von
      // der Decke, und genau richtig fuer eine Lampe im Boden.
      stift.moveTo(fx - halb * 0.16, fy);
      stift.lineTo(fx + halb * 0.16, fy);
      stift.lineTo(fx + kippen * reich + halb * 1.25, fy - reich);
      stift.lineTo(fx + kippen * reich - halb * 1.25, fy - reich);
      stift.closePath();
      stift.fill();

      // Die Duese selbst: der hellste Punkt im Bild.
      const fleck = this._fleckHolen(farbe);
      if (fleck) {
        const gr = halb * 1.1;
        stift.globalAlpha = klammer(kraft, 0, 1);
        stift.drawImage(fleck, fx - gr, fy - gr * 0.9, gr * 2, gr * 1.8);
      }
    }
    stift.globalAlpha = 1;

    // --- Die Punktreihen ---
    if (streifen > 0.02) for (const reihe of this.reihen) {
      const y = reihe.y * hoehe;
      for (let k = 0; k < reihe.zahl; k++) {
        const t = reihe.zahl > 1 ? k / (reihe.zahl - 1) : 0.5;
        const x = (reihe.von + (reihe.bis - reihe.von) * t) * breite;
        /*
         * Die Kette: ein Lauflicht. Der Abstand zum wandernden Punkt
         * bestimmt die Helligkeit, und weil er sich auf jedem Schlag um eine
         * Stelle bewegt, laeuft das Licht die Reihe entlang - auf jedem
         * Schlag ein Stueck weiter, nicht gleichmaessig.
         */
        const abstand = Math.abs(((this.kette % reihe.zahl) + reihe.zahl) % reihe.zahl - k);
        const nah = Math.min(abstand, reihe.zahl - abstand);
        const hell = klammer(1 - nah / 3, 0, 1) ** 2;
        const grund = 0.18 + this.helligkeit * 0.2;
        const kraft = klammer(grund + hell * 0.9 + this.blinder * 0.4, 0, 1.2);
        const farbe = bild.farbe(k, reihe.zahl, toene);
        const fleck = this._fleckHolen(farbe);
        if (!fleck) continue;
        const gr = breite * (0.012 + hell * 0.012 + this.helligkeit * 0.004);
        stift.globalAlpha = klammer(kraft * 0.8 * Math.min(1.4, streifen), 0, 1);
        stift.drawImage(fleck, x - gr, y - gr, gr * 2, gr * 2);
      }
    }
    stift.globalAlpha = 1;

    // --- Der wandernde Strahl ---
    if (this.helligkeit > 0.3) {
      /*
       * Einer, nicht zwoelf. Ein wandernder Strahl ist ein Ereignis, das das
       * Auge verfolgt; zwoelf davon sind Unruhe. Er kommt von oben - so
       * haengt ein beweglicher Scheinwerfer, und so unterscheidet er sich
       * sofort von den Kegeln aus dem Boden.
       */
      const oben = { x: this.strahlIst * breite, y: -hoehe * 0.05 };
      const unten = { x: (this.strahlIst * 0.6 + 0.2) * breite, y: hoehe * 0.85 };
      const farbe = toene[3];
      const v = stift.createLinearGradient(oben.x, oben.y, unten.x, unten.y);
      v.addColorStop(0, mitAlpha(farbe, 0.67));
      v.addColorStop(0.7, mitAlpha(farbe, 0.13));
      v.addColorStop(1, mitAlpha(farbe, 0));
      stift.fillStyle = v;
      stift.globalAlpha = klammer((this.helligkeit - 0.3) * 1.1, 0, 1) * 0.7;
      const w = breite * 0.012;
      stift.beginPath();
      stift.moveTo(oben.x - w * 0.4, oben.y);
      stift.lineTo(oben.x + w * 0.4, oben.y);
      stift.lineTo(unten.x + w * 2.2, unten.y);
      stift.lineTo(unten.x - w * 2.2, unten.y);
      stift.closePath();
      stift.fill();
      stift.globalAlpha = 1;
    }

    // --- Der Blinder ---
    if (this.blinder > 0.01) {
      /*
       * Gedeckelt, und zwar zweifach: nie oefter als alle 0,5 Sekunden (die
       * Sperre) und nie auf voller Deckkraft. Die Blitzschwelle erlaubt drei
       * je Sekunde; hier sind es hoechstens zwei, und die Flaeche bleibt ein
       * Verlauf statt eines vollen Weiss.
       */
      const v = stift.createLinearGradient(0, hoehe, 0, 0);
      v.addColorStop(0, toene[3]);
      v.addColorStop(1, mitAlpha(toene[1], 0));
      stift.fillStyle = v;
      stift.globalAlpha = this.blinder * 0.38;
      stift.fillRect(0, 0, breite, hoehe);
      stift.globalAlpha = 1;
    }

    stift.restore();
  }

  /** Fuer die Abnahme. */
  stand() {
    return {
      lampen: this.lampen.length,
      lampenX: this.lampen.map((l) => Number(l.x.toFixed(4))),
      reihen: this.reihen.length,
      farbbild: FARBBILDER[this.farbbild].name,
      blinder: this.blinder,
      helligkeit: this.helligkeit,
      kette: this.kette,
      strahl: this.strahlIst,
    };
  }
}

/*
 * Der Modus haelt einen Lichtpark, und zwar genau einen je Buehnenbild.
 *
 * Die Modi der Buehne sind Funktionen ohne Zustand - ein Lichtpark hat aber
 * welchen: laufende Ketten, ein wanderndes Ziel, ein abklingender Blinder.
 * Er wird deshalb hier gehalten und nur dann neu gebaut, wenn sich die
 * Einmessung geaendert hat.
 */
let park = null;
let parkFuer = null;

export function partylichtZeichnen(stift, lage) {
  const bild = lage.buehnenbild ?? { an: false, bereiche: [] };
  if (park === null || parkFuer !== bild) {
    park = new Partylicht(bild);
    parkFuer = bild;
  }
  park.zeichnen(stift, lage);
}

/** Fuer die Abnahme: den Park zuruecksetzen. */
export function partylichtZuruecksetzen() {
  park = null;
  parkFuer = null;
}
