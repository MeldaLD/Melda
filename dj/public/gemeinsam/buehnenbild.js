// Die Wand als Teil des Bildes.
//
// Was hier steht, verbindet zwei Welten: die Kalibrierung, die einmal vor Ort
// gemessen wurde, und die Visualisierung, die jeden Abend laeuft. Dazwischen
// liegen zwei Aufgaben.
//
// --- 1. Das Bild gegenbiegen ------------------------------------------------
//
// Der Beamer steht schief, also kommt sein Rechteck als Trapez an der Wand
// an. Damit ein Mandala genau in ein Fenster passt, muss das Bild vorher
// gegenverzerrt werden.
//
// Gemacht wird das *nicht* im Zeichner, sondern mit einer CSS-Matrix an der
// Leinwand. Der Compositor des Browsers verzieht das fertige Bild auf der
// Grafikkarte - das kostet nichts je Bild, und die ganze Visualisierung
// dahinter rechnet weiter in einem glatten Rechteck, ohne von der schiefen
// Wand zu wissen. Waere die Verzerrung im Zeichner, muesste jede einzelne
// Linie durch eine projektive Abbildung, und jedes Mandala haette sie zu
// beruecksichtigen.
//
// --- 2. Die Architektur weiterreichen ---------------------------------------
//
// Die Bereiche - Fenster, Tueren, Kanten, Totzonen - werden in Anteilen der
// Entwurfsflaeche gespeichert. Die Visualisierung fragt sie ab und kann
// damit etwas anfangen:
//
//   Fenster   Inhalt hineinsetzen, oder den Rahmen als Lichtlinie ziehen
//   Tuer      ein Ursprung, aus dem etwas herauswaechst
//   Kante     eine Linie, an der etwas entlanglaeuft
//   Flaeche   gute Projektionsflaeche, hier darf das Grosse hin
//   Totzone   Glas, dunkler Stein, ein Baum davor - hier ist Licht verloren
//
// --- Der Entwurfsraum -------------------------------------------------------
//
// Alles rechnet in "Entwurfskoordinaten": ein Rechteck mit denselben
// Seitenverhaeltnissen wie das Foto, in Anteilen von 0 bis 1. Das ist genau
// das Foto - was dort ueber der Tuer sitzt, sitzt abends ueber der Tuer.

import { homographie, anwenden, umkehren, alsCss, imVieleck } from './homographie.js';

export const SCHLUESSEL = 'djBeamerKalibrierung';

/** Wie eine leere, unverzerrte Buehne aussieht. */
const OHNE = {
  an: false,
  seitenverhaeltnis: 16 / 9,
  bereiche: [],
  css: 'none',
  imBild: () => true,
};

/**
 * Eine gespeicherte Kalibrierung einlesen und in Betriebsform bringen.
 *
 * @param {object|null} roh   was die Einmessseite abgelegt hat
 * @param {number} breite     Breite der Anzeige in Bildpunkten
 * @param {number} hoehe      Hoehe der Anzeige in Bildpunkten
 */
export function buehnenbildBauen(roh, breite, hoehe) {
  if (!roh || roh.fassung !== 1 || !Array.isArray(roh.marken) || roh.marken.length !== 4) return { ...OHNE };

  const seiten = roh.fotoSeitenverhaeltnis || 16 / 9;

  /*
   * Die Groesse der Entwurfsleinwand.
   *
   * Sie hat das Seitenverhaeltnis des Fotos und ungefaehr so viele
   * Bildpunkte wie die Anzeige. "Ungefaehr" reicht: Was der Compositor
   * hinterher verzieht, wird ohnehin neu abgetastet, und eine Leinwand, die
   * deutlich groesser waere als das Beamerbild, kostete Rechenzeit fuer
   * Bildpunkte, die niemand sieht.
   */
  const flaeche = breite * hoehe;
  const entwurfBreite = Math.round(Math.sqrt(flaeche * seiten));
  const entwurfHoehe = Math.round(entwurfBreite / seiten);

  /*
   * Die Abbildung, die an die Leinwand kommt: von *Entwurfsbildpunkten* nach
   * *Anzeigebildpunkten*.
   *
   * Sie wird in einem Schritt aus vier Punktpaaren geloest und nicht aus
   * mehreren Teilabbildungen zusammengesetzt. Zusammensetzen waere derselbe
   * Rechenweg mit mehr Gelegenheiten, eine Einheit zu verwechseln.
   *
   *   von:  wo die Marken im Entwurf liegen  = Anteil im Foto mal Entwurfsgroesse
   *   nach: wo die Marken im Beamerbild liegen = Anteil mal Anzeigegroesse
   */
  const von = roh.marken.map(([x, y]) => [x * entwurfBreite, y * entwurfHoehe]);
  const nach = (roh.markenImBeamer ?? [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]])
    .map(([x, y]) => [x * breite, y * hoehe]);
  const H = homographie(von, nach);
  if (!H) return { ...OHNE };

  /*
   * Welcher Teil des Entwurfs wird ueberhaupt vom Beamer erreicht? Das ist
   * das Beamerbild, in den Entwurf zurueckgerechnet. Was ausserhalb liegt,
   * bleibt an der Wand dunkel - die Visualisierung soll dort nichts
   * Wichtiges hinlegen.
   */
  const R = umkehren(H);
  const sichtbar = R
    ? [[0, 0], [breite, 0], [breite, hoehe], [0, hoehe]]
      .map((p) => anwenden(R, p).map((v, i) => v / (i ? entwurfHoehe : entwurfBreite)))
    : [[0, 0], [1, 0], [1, 1], [0, 1]];

  const bereiche = (roh.bereiche ?? []).map((b) => aufbereiten(b, seiten));

  return {
    an: true,
    seitenverhaeltnis: seiten,
    breite: entwurfBreite,
    hoehe: entwurfHoehe,
    css: alsCss(H),
    bereiche,
    sichtbar,
    /** Liegt ein Punkt (in Anteilen) im Beamerbild? */
    imBild: (p) => imVieleck(p, sichtbar),
    /** Alle Bereiche einer Art. */
    art: (art) => bereiche.filter((b) => b.art === art),
    /** Welcher Bereich liegt an dieser Stelle? */
    bei: (p) => bereiche.find((b) => imVieleck(p, b.punkte)) ?? null,
  };
}

/**
 * Einen Bereich um alles ergaenzen, was die Visualisierung sonst je Bild neu
 * ausrechnen muesste.
 *
 * Mitte, Umfang, Hoehe und Breite stehen fest, sobald die Messung steht - sie
 * je Bild neu zu bestimmen waere Arbeit fuer ein Ergebnis, das sich nie
 * aendert.
 */
function aufbereiten(b, seiten) {
  const p = b.punkte;
  let mx = 0;
  let my = 0;
  for (const [x, y] of p) { mx += x; my += y; }
  mx /= p.length;
  my /= p.length;

  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  const links = Math.min(...xs);
  const rechts = Math.max(...xs);
  const oben = Math.min(...ys);
  const unten = Math.max(...ys);

  /*
   * Der Umfang wird in *Seitenverhaeltnis-treuen* Einheiten gemessen: Ein
   * Foto ist breiter als hoch, und in reinen Anteilen waere eine waagerechte
   * Strecke sonst kuerzer als eine gleich lange senkrechte. Fuer eine
   * Lichtlinie, die mit gleichmaessiger Geschwindigkeit an einem
   * Fensterrahmen entlanglaeuft, macht das den Unterschied zwischen "laeuft"
   * und "ruckelt an den Ecken".
   */
  let umfang = 0;
  const abschnitte = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const c = p[(i + 1) % p.length];
    const l = Math.hypot((c[0] - a[0]) * seiten, c[1] - a[1]);
    abschnitte.push(l);
    umfang += l;
  }

  /*
   * Die Abbildung vom Einheitsquadrat auf das Viereck.
   *
   * Damit laesst sich jeder Punkt eines Bereiches ueber zwei Zahlen von 0 bis
   * 1 ansprechen - und zwar *perspektivisch richtig*. Ein Gitterkasten, der
   * schraeg im Bild steht, hat oben schmalere Zellen als unten; wer da linear
   * teilt, trifft die unteren Reihen nicht mehr.
   *
   * Es ist dieselbe Rechnung wie fuer die ganze Wand, nur eine Stufe kleiner,
   * und sie benutzt denselben geprueften Loeser. Bei Bereichen, die keine
   * vier Ecken haben, gibt es sie nicht - dann bleibt `punktAuf` null, und
   * wer sie braucht, muss vorher fragen.
   */
  let aufsViereck = null;
  if (p.length === 4) aufsViereck = homographie([[0, 0], [1, 0], [1, 1], [0, 1]], p);
  const punktAuf = aufsViereck ? (u, v) => anwenden(aufsViereck, [u, v]) : null;

  /*
   * Die Zellen eines Gitterkastens.
   *
   * Sie werden hier einmal ausgerechnet und nicht je Bild: Ein Kasten mit
   * zwoelf mal acht Faechern hat 96 Zellen, und die stehen fest, sobald die
   * Messung steht.
   */
  let zellen = null;
  if (b.art === 'gitterbox' && punktAuf) {
    const sp = Math.max(1, Math.round(b.spalten ?? 10));
    const re = Math.max(1, Math.round(b.reihen ?? 6));
    zellen = { spalten: sp, reihen: re, mitten: [] };
    for (let j = 0; j < re; j++) {
      for (let i = 0; i < sp; i++) {
        zellen.mitten.push(punktAuf((i + 0.5) / sp, (j + 0.5) / re));
      }
    }
    // Wie gross eine Zelle ungefaehr ist - fuer die Groesse der Lichtflecken.
    const a = punktAuf(0, 0.5);
    const c = punktAuf(1, 0.5);
    zellen.zellBreite = Math.hypot((c[0] - a[0]) * seiten, c[1] - a[1]) / sp;
    const o = punktAuf(0.5, 0);
    const u = punktAuf(0.5, 1);
    zellen.zellHoehe = Math.hypot((u[0] - o[0]) * seiten, u[1] - o[1]) / re;
  }

  return {
    ...b,
    mitte: [mx, my],
    kasten: { links, rechts, oben, unten, breite: rechts - links, hoehe: unten - oben },
    umfang,
    abschnitte,
    punktAuf,
    zellen,
    /**
     * Ein Punkt auf dem Rand, bei Anteil t des Umfangs.
     *
     * Damit laeuft eine Lichtlinie den Rahmen entlang, und zwar mit
     * gleichmaessiger Geschwindigkeit - nicht mit gleich vielen Punkten je
     * Kante, was an kurzen Kanten schnell und an langen langsam waere.
     */
    aufDemRand(t) {
      let rest = ((t % 1) + 1) % 1 * umfang;
      for (let i = 0; i < p.length; i++) {
        if (rest <= abschnitte[i] || i === p.length - 1) {
          const a = p[i];
          const c = p[(i + 1) % p.length];
          const f = abschnitte[i] > 1e-9 ? rest / abschnitte[i] : 0;
          return [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f];
        }
        rest -= abschnitte[i];
      }
      return p[0];
    },
    drin: (q) => imVieleck(q, p),
  };
}

/** Die gespeicherte Messung dieses Geraets. */
export function buehnenbildLaden(breite, hoehe) {
  let roh = null;
  try { roh = JSON.parse(localStorage.getItem(SCHLUESSEL) ?? 'null'); } catch { roh = null; }
  return buehnenbildBauen(roh, breite, hoehe);
}

/**
 * Die Verzerrung an eine Leinwand haengen.
 *
 * `transform-origin: 0 0` ist Pflicht: Ohne das rechnet der Browser die
 * Matrix um den Mittelpunkt des Elements, und die perspektivischen Glieder
 * ergeben dann etwas ganz anderes. Das ist der Fehler, den man an dieser
 * Stelle einmal macht.
 */
export function verzerrungAnlegen(element, bild) {
  if (!bild.an) {
    element.style.transform = '';
    element.style.transformOrigin = '';
    element.style.width = '';
    element.style.height = '';
    element.style.left = '';
    element.style.top = '';
    element.style.right = '';
    element.style.bottom = '';
    return;
  }
  element.style.transformOrigin = '0 0';
  /*
   * `right` und `bottom` muessen ausdruecklich zurueckgenommen werden.
   *
   * Die Leinwand steht im Stilblatt auf `inset: 0`, also alle vier Seiten am
   * Rand. Zusammen mit einer festen Breite widerspricht sich das, und der
   * Browser loest den Widerspruch nach eigenen Regeln auf - was hier hiesse,
   * dass die Groesse nicht die ist, mit der die Matrix gerechnet wurde.
   */
  element.style.left = '0';
  element.style.top = '0';
  element.style.right = 'auto';
  element.style.bottom = 'auto';
  element.style.width = `${bild.breite}px`;
  element.style.height = `${bild.hoehe}px`;
  element.style.transform = bild.css;
}
