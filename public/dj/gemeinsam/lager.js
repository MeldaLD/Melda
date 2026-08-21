// Der Lagerraum als Buehnenbild.
//
// Dieser Raum ist keine Fassade und soll auch nicht so behandelt werden. Was
// er hat, hat keine Fassade:
//
//   Gitterkaesten voller Flaschen  ein gebautes, regelmaessiges Punktfeld
//   Verzinkter Stahl               die einzige neutrale Flaeche im Raum
//   Grobspanplatte                 warm, orange, farbenblind
//   Deckenbalken                   harte waagerechte Linien ueber Kopf
//
// --- Die Idee ---------------------------------------------------------------
//
// Ein Stapel Gitterkaesten sieht aus wie eine Lautsprecherwand. Das ist kein
// Zufall: gleiche Groesse, gleiches Raster, uebereinandergestapelt. Und
// dahinter stehen hunderte Flaschenboeden in einem regelmaessigen Feld.
//
// Zusammen ist das eine *Anzeigetafel*, die schon da ist. Man muss sie nicht
// bauen, nur ansprechen - Zelle fuer Zelle. Ein Pegel, der auf einer glatten
// Wand eine gezeichnete Balkengrafik waere, ist hier ein Pegel aus echten
// Flaschen, die aufleuchten.
//
// --- Warum das gerade hier funktioniert -------------------------------------
//
// Drei Eigenschaften des Materials, und alle drei helfen:
//
//  1. Verzinkter Stahl wirft *gerichtet* zurueck, nicht diffus wie Putz. Ein
//     kleiner heller Fleck darauf blitzt, wo derselbe Fleck auf der Holzwand
//     nur ein Fleck waere. Kleine harte Lichtpunkte sind hier also stark -
//     und kleine harte Lichtpunkte sind billig.
//
//  2. Der Stahl ist fast neutralgrau. Er ist die einzige Flaeche im Raum, die
//     Farbe ueberhaupt richtig wiedergibt - siehe oberflaeche.js. Also gehoert
//     die Farbe hierher und nicht an die Wand.
//
//  3. Das dunkle Flaschenglas dahinter bleibt schwarz. Es liefert den
//     Kontrast, den die Holzwand nicht hergibt: Ein Punktfeld aus hellen
//     Zellen vor schwarzem Glas ist ein Punktfeld, kein Grauschleier.
//
// Anders gesagt: Die Kaesten koennen alles, was die Wand nicht kann. Die
// Aufteilung ergibt sich daraus von selbst und ist keine Geschmacksfrage.

import { fleck } from './gewerke.js';
import { mitAlpha } from './farben.js';

const zaum = (x, a, b) => (x < a ? a : x > b ? b : x);

/*
 * Wie schnell eine Zelle wieder dunkel wird, je Sekunde.
 *
 * Nicht sofort: Ein Feld, das hart aus- und angeht, flimmert. Ein Feld, das
 * nachgluecht, liest sich als Bewegung. Der Wert ist an einer Pegelanzeige
 * geliehen - die faellt auch traeger, als sie steigt.
 */
const ABFALL = 3.2;

/*
 * Der Glanzkern auf einer hellen Zelle: fast weiss, ganz leicht warm.
 * Konstant, weil verzinkter Stahl keine Farbe hat - was er zurueckwirft, ist
 * die Farbe der Lampe, und die ist hier hell.
 */
const GLANZ = mitAlpha('hsl(45 25% 96%)', 0.9);

/*
 * Die Muster.
 *
 * Jedes schreibt nur *Wunschhelligkeiten* in die Zellen. Wie daraus ein Bild
 * wird - Nachgluehen, Farbe, Groesse -, entscheidet die Wand einmal fuer
 * alle. So kostet ein neues Muster acht Zeilen und kein neues Gewerk.
 */
export const MUSTER = ['pegel', 'lauf', 'welle', 'funkeln', 'atem'];

export class Flaschenwand {
  /**
   * @param {object} bild  das Buehnenbild aus buehnenbild.js
   */
  constructor(bild) {
    this.kaesten = (bild?.an ? bild.bereiche : []).filter(
      (b) => b.art === 'gitterbox' && b.zellen,
    );
    // Je Kasten ein Helligkeitsfeld, so lang wie er Zellen hat.
    this.felder = this.kaesten.map((k) => new Float32Array(k.zellen.mitten.length));
    this.muster = 'pegel';
    this.phase = 0;
    this.zeit = 0;
    this.letzterBeat = -1;
    this.letztePhrase = -1;
    this.wuerfelZustand = 0x2545f491;
  }

  /** Ob es hier ueberhaupt etwas zu tun gibt. */
  get da() {
    return this.kaesten.length > 0;
  }

  /*
   * Ein eigener Zufall statt Math.random.
   *
   * Ein Funkeln, das je Bild neu wuerfelt, flackert unruhig; eines, das je
   * Zelle *immer denselben* Wert liefert, steht still. Gebraucht wird etwas
   * dazwischen: reproduzierbar je Zelle und Schritt, aber ohne Muster.
   */
  _streu(i, schritt) {
    let z = (i * 2654435761 + schritt * 40503 + this.wuerfelZustand) >>> 0;
    z ^= z << 13; z >>>= 0;
    z ^= z >>> 17;
    z ^= z << 5; z >>>= 0;
    return (z % 100000) / 100000;
  }

  musterWaehlen(name) {
    if (MUSTER.includes(name)) this.muster = name;
  }

  fortschreiben(sekunden, takt, wucht, spannung, spektrum, drop) {
    this.zeit += sekunden;
    if (!this.da) return;

    // Auf der Phrase das Muster wechseln - dieselbe Regel wie bei der Regie.
    if (takt && takt.aufPhrase && takt.nummer !== this.letztePhrase) {
      this.letztePhrase = takt.nummer;
      const i = MUSTER.indexOf(this.muster);
      this.muster = MUSTER[(i + 1 + Math.floor(this._streu(i, takt.nummer) * 2)) % MUSTER.length];
    }
    const neuerBeat = takt && takt.nummer !== this.letzterBeat;
    if (neuerBeat) this.letzterBeat = takt.nummer;

    this.phase += sekunden * (1.2 + wucht * 2.4);

    for (let k = 0; k < this.kaesten.length; k++) {
      const kasten = this.kaesten[k];
      const feld = this.felder[k];
      const { spalten, reihen } = kasten.zellen;

      // Erst abklingen lassen, dann das Muster daraufschreiben.
      for (let i = 0; i < feld.length; i++) {
        feld[i] = Math.max(0, feld[i] - sekunden * ABFALL);
      }

      const setzen = (i, wert) => { if (wert > feld[i]) feld[i] = zaum(wert, 0, 1); };

      if (drop) {
        // Beim Drop leuchtet die ganze Wand einmal auf. Das ist der eine
        // Moment, in dem das Feld nicht Muster, sondern Flaeche ist.
        for (let i = 0; i < feld.length; i++) setzen(i, 1);
        continue;
      }

      if (this.muster === 'pegel') {
        /*
         * Ein Pegel je Spalte, aus dem Spektrum.
         *
         * Von unten nach oben gefuellt, weil jede Pegelanzeige der Welt das
         * so macht und das Auge es sofort liest. Die Spalten decken das
         * Spektrum von links (Bass) nach rechts (Hoehen) ab.
         */
        for (let x = 0; x < spalten; x++) {
          const anteil = spalten > 1 ? x / (spalten - 1) : 0;
          const wert = spektrum ? pegelAus(spektrum, anteil) : 0.4 + wucht * 0.4;
          const hoch = wert * reihen;
          for (let y = 0; y < reihen; y++) {
            // Reihe 0 ist oben, also von unten zaehlen.
            const vonUnten = reihen - 1 - y;
            if (vonUnten < hoch) {
              const rand = hoch - vonUnten;
              setzen(y * spalten + x, zaum(rand, 0.25, 1));
            }
          }
        }
      } else if (this.muster === 'lauf') {
        // Eine Spalte wandert. Auf jedem Schlag einen Schritt weiter, damit
        // sie zur Musik laeuft und nicht daneben.
        const schritt = Math.floor(this.phase * 2) % spalten;
        for (let y = 0; y < reihen; y++) {
          setzen(y * spalten + schritt, 1);
          setzen(y * spalten + ((schritt + spalten - 1) % spalten), 0.45);
        }
      } else if (this.muster === 'welle') {
        // Eine Diagonale laeuft durch das Feld.
        const w = this.phase * 0.8 + k * 0.4;
        for (let y = 0; y < reihen; y++) {
          for (let x = 0; x < spalten; x++) {
            const d = (x / Math.max(1, spalten - 1)) + (y / Math.max(1, reihen - 1)) * 0.6;
            const s = Math.sin((d - w) * Math.PI * 2);
            if (s > 0.55) setzen(y * spalten + x, (s - 0.55) / 0.45);
          }
        }
      } else if (this.muster === 'funkeln') {
        /*
         * Einzelne Zellen blitzen auf. Das Muster, das den verzinkten Stahl
         * am besten ausnutzt - und das billigste von allen.
         */
        const schritt = Math.floor(this.phase * 6);
        const wieviele = Math.max(2, Math.round(feld.length * (0.04 + wucht * 0.08)));
        for (let n = 0; n < wieviele; n++) {
          const i = Math.floor(this._streu(n, schritt) * feld.length);
          setzen(i, 0.7 + this._streu(n, schritt + 7) * 0.3);
        }
      } else {
        // atem: das ganze Feld hebt und senkt sich, langsam.
        const s = 0.5 + 0.5 * Math.sin(this.phase * 0.55);
        const grund = 0.18 + s * (0.3 + spannung * 0.4);
        for (let i = 0; i < feld.length; i++) setzen(i, grund);
      }
    }
  }

  /**
   * @param {number} kraft  0 bis 1, wie stark die Wand insgesamt laeuft
   */
  zeichnen(stift, breite, hoehe, ton, kraft) {
    if (!this.da || kraft < 0.02) return;
    const b = fleck(ton);
    /*
     * Die Farbe des Glanzkerns steht fest und wird einmal je Bild gesetzt,
     * nicht einmal je Zelle.
     *
     * Vorher stand `mitAlpha(...)` in der Zellschleife - bei 322 Zellen also
     * 322 Farbstrings, die je Bild neu zerlegt und zusammengesetzt wurden.
     * Die Abnahme hat es als Kostenposten gemeldet: 6,95 ms gegen 6,27 ms
     * beim vollen Lichtpark, obwohl die Flaschenwand das Grundlicht fast
     * ausfaehrt und eigentlich billiger sein muesste.
     */
    stift.fillStyle = GLANZ;
    for (let k = 0; k < this.kaesten.length; k++) {
      const kasten = this.kaesten[k];
      const feld = this.felder[k];
      const { mitten, zellBreite, zellHoehe } = kasten.zellen;
      /*
       * Die Groesse eines Lichtflecks: etwas kleiner als eine Zelle. Groesser
       * waere bequemer zu treffen, aber dann verschwimmen die Zellen
       * ineinander - und genau ihre Trennung ist der Effekt.
       */
      const gr = Math.max(2, Math.min(zellBreite, zellHoehe) * hoehe * 0.42);
      for (let i = 0; i < feld.length; i++) {
        const w = feld[i];
        if (w < 0.03) continue;
        const [u, v] = mitten[i];
        const x = u * breite;
        const y = v * hoehe;
        stift.globalAlpha = zaum(w * kraft * 0.85, 0, 1);
        stift.drawImage(b, x - gr, y - gr, gr * 2, gr * 2);
        /*
         * Und der harte Kern. Verzinkter Stahl wirft gerichtet zurueck, also
         * gibt es auf einer hellen Zelle einen kleinen, fast weissen Punkt -
         * das ist der Unterschied zwischen "leuchtet" und "blitzt".
         */
        if (w > 0.55) {
          stift.globalAlpha = zaum((w - 0.55) / 0.45 * kraft, 0, 1);
          stift.beginPath();
          stift.arc(x, y, Math.max(1, gr * 0.22), 0, Math.PI * 2);
          stift.fill();
        }
      }
    }
    stift.globalAlpha = 1;
  }
}

/** Ein Pegelwert aus dem Spektrum, `anteil` von 0 (Bass) bis 1 (Hoehen). */
function pegelAus(spektrum, anteil) {
  /*
   * Logarithmisch ueber die Baender, nicht linear: Die untere Haelfte eines
   * Spektrums enthaelt fast die ganze Musik, und eine lineare Aufteilung
   * gaebe zehn Spalten Bass und eine Spalte Rest.
   */
  const n = spektrum.length;
  const von = Math.floor((n * 0.5) ** anteil);
  const bis = Math.min(n, Math.max(von + 1, Math.floor((n * 0.5) ** Math.min(1, anteil + 0.12))));
  let summe = 0;
  for (let i = von; i < bis; i++) summe += spektrum[i];
  return zaum(summe / (bis - von) / 200, 0, 1);
}

/*
 * Die Deckenbalken.
 *
 * Vier oder fuenf harte waagerechte Linien ueber Kopf, und sie sind das
 * einzige im Raum, was von sich aus Richtung hat. Ein Licht, das sie der
 * Reihe nach nimmt, zieht den Blick nach hinten - dorthin, wo die Kaesten
 * stehen.
 */
export class Balkenlicht {
  constructor(bild) {
    this.balken = (bild?.an ? bild.bereiche : []).filter((b) => b.art === 'balken');
    this.phase = 0;
  }

  get da() {
    return this.balken.length > 0;
  }

  fortschreiben(sekunden, wucht) {
    this.phase += sekunden * (0.25 + wucht * 0.5);
  }

  zeichnen(stift, breite, hoehe, ton, kraft) {
    if (!this.da || kraft < 0.02) return;
    stift.save();
    stift.lineCap = 'round';
    for (let i = 0; i < this.balken.length; i++) {
      const b = this.balken[i];
      // Die Balken der Reihe nach, nicht alle zugleich.
      const eigen = (this.phase - i * 0.22) % 1;
      const an = eigen > 0 && eigen < 0.5 ? Math.sin(eigen * Math.PI * 2) : 0;
      if (an <= 0.02) continue;
      const a = b.aufDemRand ? b.aufDemRand(0) : b.punkte[0];
      const c = b.aufDemRand ? b.aufDemRand(0.5) : b.punkte[1];
      stift.globalAlpha = zaum(an * kraft * 0.55, 0, 1);
      stift.strokeStyle = ton;
      stift.lineWidth = Math.max(1.5, hoehe * 0.006);
      stift.beginPath();
      stift.moveTo(a[0] * breite, a[1] * hoehe);
      stift.lineTo(c[0] * breite, c[1] * hoehe);
      stift.stroke();
    }
    stift.restore();
    stift.globalAlpha = 1;
  }
}
