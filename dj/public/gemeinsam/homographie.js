// Die projektive Abbildung zwischen Beamer, Foto und Wand.
//
// --- Das Problem ------------------------------------------------------------
//
// Ein Beamer steht nie genau senkrecht vor der Wand. Was er als Rechteck
// wirft, kommt dort als Trapez an - und je schraeger er steht, desto
// schiefer. Damit ein Mandala genau in ein Fenster passt, muss das Bild
// *vorher* gegengebogen werden.
//
// --- Warum ein Foto reicht --------------------------------------------------
//
// Der naheliegende Gedanke ist, die Kamera an einen genau vermessenen Ort zu
// stellen. Das ist nicht noetig, und es waere sogar der schwierigere Weg.
//
// Solange die Wand *eben* ist, gibt es zwischen je zwei Ansichten davon eine
// projektive Abbildung mit acht Freiheitsgraden - und vier Punktpaare legen
// sie eindeutig fest. Steht auf einem einzigen Foto sowohl das Testbild des
// Beamers als auch die Fassade, dann steckt darin alles:
//
//   Beamer -> Foto   aus den vier Marken des Testbildes
//   Foto -> Beamer   die Umkehrung davon
//   Fassade          ist schon im Foto, also schon in derselben Rechnung
//
// Wo die Kamera stand, kuerzt sich heraus. Das ist keine Naeherung, sondern
// eine Eigenschaft ebener Flaechen.
//
// --- Und warum das Foto der Entwurfsraum ist --------------------------------
//
// Entzerrt wird nicht auf die *echte* Wand, sondern auf das *Foto*. Das
// klingt nach einem Kompromiss und ist die richtige Wahl: Eine Projektion auf
// eine Fassade sieht nur von einem Ort wirklich richtig aus, und dieser Ort
// soll dort sein, wo die Gaeste stehen. Steht die Kamera dort, dann ist
// "sieht im Foto rechteckig aus" genau das gewuenschte Ergebnis.
//
// Nebenwirkung, und eine sehr angenehme: Das Foto ist damit die Zeichenflaeche.
// Ein Mandala, das im Foto ueber der Tuer sitzt, sitzt an dem Abend ueber der
// Tuer.
//
// --- Was es kostet ----------------------------------------------------------
//
// Nichts je Bild. Die Abbildung wird einmal beim Kalibrieren geloest und
// danach als CSS-Matrix an die Leinwand gehaengt; das Verziehen macht der
// Compositor auf der Grafikkarte. Die Visualisierung rechnet weiter in einem
// glatten Rechteck und weiss von alldem nichts.

/* --- Lineares Gleichungssystem ---------------------------------------------
 *
 * Acht Unbekannte, acht Gleichungen. Geloest mit Gauss und Spaltenpivotisierung
 * - ohne Pivotisierung kippt das Verfahren, sobald eine Zeile mit einer Null
 * an der Diagonalen anfaengt, und das passiert bei achsenparallelen Marken
 * sofort.
 */
function loesen(A, b) {
  const n = b.length;
  const M = A.map((zeile, i) => [...zeile, b[i]]);
  for (let s = 0; s < n; s++) {
    let beste = s;
    for (let z = s + 1; z < n; z++) if (Math.abs(M[z][s]) > Math.abs(M[beste][s])) beste = z;
    if (Math.abs(M[beste][s]) < 1e-12) return null; // entartet
    [M[s], M[beste]] = [M[beste], M[s]];
    for (let z = 0; z < n; z++) {
      if (z === s) continue;
      const f = M[z][s] / M[s][s];
      if (!f) continue;
      for (let k = s; k <= n; k++) M[z][k] -= f * M[s][k];
    }
  }
  /*
   * Nach der Elimination steht in Zeile i nur noch das Diagonalglied und die
   * rechte Seite. Die Loesung ist also M[i][n] / M[i][i] - und weil `zeile`
   * hier schon die Zeile *ist*, heisst das `zeile[n] / zeile[i]`. Ein Index
   * zu viel an dieser Stelle macht aus allem stillschweigend NaN.
   */
  return M.map((zeile, i) => zeile[n] / zeile[i]);
}

/**
 * Die projektive Abbildung aus vier Punktpaaren.
 *
 * Gesucht ist H mit  [x' y' w]ᵀ = H · [x y 1]ᵀ  und  (u,v) = (x'/w, y'/w).
 * h33 wird auf 1 gesetzt - eine Homographie ist nur bis auf einen Faktor
 * bestimmt, und diese Normierung ist die uebliche.
 *
 * Je Punktpaar zwei Gleichungen:
 *   u = (h11 x + h12 y + h13) / (h31 x + h32 y + 1)
 *   v = (h21 x + h22 y + h23) / (h31 x + h32 y + 1)
 * ausmultipliziert und nach den acht Unbekannten sortiert.
 *
 * @param {Array<[number,number]>} von  vier Punkte
 * @param {Array<[number,number]>} nach vier Punkte, in derselben Reihenfolge
 * @returns {number[]|null} neun Zahlen zeilenweise, oder null bei entarteter Lage
 */
export function homographie(von, nach) {
  if (von.length !== 4 || nach.length !== 4) throw new Error('Vier Punktpaare, nicht mehr und nicht weniger');
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = von[i];
    const [u, v] = nach[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = loesen(A, b);
  return h ? [...h, 1] : null;
}

/** Einen Punkt durch die Abbildung schicken. */
export function anwenden(H, [x, y]) {
  const w = H[6] * x + H[7] * y + H[8];
  // Ein Punkt auf der Fluchtlinie hat kein Bild. In der Praxis heisst das:
  // Er liegt hinter dem Beamer. Statt Unendlich zurueckzugeben wird geklemmt -
  // ein NaN in der Zeichenkette waere schlimmer als ein weit entfernter Punkt.
  const n = Math.abs(w) < 1e-12 ? (w < 0 ? -1e-12 : 1e-12) : w;
  return [(H[0] * x + H[1] * y + H[2]) / n, (H[3] * x + H[4] * y + H[5]) / n];
}

/** Die Umkehrabbildung. */
export function umkehren(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = [
    A, -(b * i - c * h), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * h - b * g), a * e - b * d,
  ].map((v) => v / det);
  // Wieder auf h33 = 1 normieren, damit die Zahlen vergleichbar bleiben.
  return Math.abs(inv[8]) > 1e-12 ? inv.map((v) => v / inv[8]) : inv;
}

/**
 * Als CSS-Transformation.
 *
 * `matrix3d` nimmt eine 4x4-Matrix spaltenweise. Eine ebene Homographie
 * steckt darin an genau den Stellen, an denen die dritte Zeile und Spalte
 * die Einheitsmatrix bleiben: Aus h31 und h32 wird die perspektivische
 * Verjuengung.
 *
 * Der Grund, das ueberhaupt so zu machen: Der Compositor des Browsers
 * verzieht das Element auf der Grafikkarte, und zwar einmal beim Zeichnen und
 * nicht je Bildpunkt in JavaScript. Die Verzerrung kostet damit *nichts* -
 * und die Visualisierung dahinter rechnet weiter in einem glatten Rechteck,
 * ohne von der schiefen Wand zu wissen.
 *
 * `transform-origin: 0 0` ist Pflicht. Ohne das rechnet der Browser die
 * Matrix um den Mittelpunkt des Elements herum, und die perspektivischen
 * Glieder ergeben dann etwas ganz anderes.
 */
export function alsCss(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  const m = [
    a, d, 0, g,
    b, e, 0, h,
    0, 0, 1, 0,
    c, f, 0, i,
  ];
  /*
   * Volle Genauigkeit, keine festen Nachkommastellen.
   *
   * Zuerst stand hier toFixed(9). Das klingt grosszuegig und ist es fuer die
   * grossen Glieder auch - aber die perspektivischen h31 und h32 sind bei
   * einer Leinwand von tausend Bildpunkten in der Groessenordnung 1e-7, und
   * neun feste Nachkommastellen lassen davon zwei uebrig. Gemessen kam die
   * CSS-Matrix damit auf 1,5 Tausendstel Bildpunkte anders heraus als die
   * Rechnung. Das ist physikalisch belanglos und trotzdem der falsche Weg:
   * Eine Zahl abzuschneiden, um eine Zeichenkette zu kuerzen, spart hier
   * nichts.
   */
  return `matrix3d(${m.map((v) => (Math.abs(v) < 1e-14 ? 0 : v)).join(',')})`;
}

/**
 * Liegt ein Punkt in einem Vieleck?
 *
 * Strahlverfahren. Gebraucht wird das an zwei Stellen: um zu pruefen, ob eine
 * Stelle der Wand ueberhaupt vom Beamer erreicht wird, und um Totzonen
 * auszusparen.
 */
export function imVieleck([x, y], punkte) {
  let drin = false;
  for (let i = 0, j = punkte.length - 1; i < punkte.length; j = i++) {
    const [xi, yi] = punkte[i];
    const [xj, yj] = punkte[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) drin = !drin;
  }
  return drin;
}

/**
 * Wie gut passt eine Abbildung zu ihren eigenen Punktpaaren?
 *
 * Bei genau vier Paaren ist der Fehler rechnerisch null - die Abbildung geht
 * durch alle vier hindurch. Das macht die Zahl aber nicht wertlos: Ist sie
 * *nicht* null, ist etwas mit der Rechnung faul, und das faellt sonst erst
 * an der Wand auf.
 *
 * Bei mehr als vier Paaren wird es eine echte Aussage. Deshalb steht die
 * Funktion hier und nicht in der Abnahme.
 */
export function passfehler(H, von, nach) {
  let schlimmster = 0;
  for (let i = 0; i < von.length; i++) {
    const [u, v] = anwenden(H, von[i]);
    schlimmster = Math.max(schlimmster, Math.hypot(u - nach[i][0], v - nach[i][1]));
  }
  return schlimmster;
}

/**
 * Ist ein Viereck brauchbar - oder hat jemand die Marken vertauscht?
 *
 * Geprueft wird die Konvexitaet ueber das Vorzeichen der Kreuzprodukte an den
 * vier Ecken. Sind sie nicht alle gleich, ist das Viereck ueberschlagen, und
 * die Abbildung daraus klappt das Bild an einer Achse um. Das sieht an der
 * Wand aus wie ein Fehler im Zeichner und ist in Wahrheit ein
 * Bedienungsfehler beim Anklicken - deshalb wird es hier abgefangen und
 * nicht dort gesucht.
 */
export function viereckPruefen(punkte) {
  if (punkte.length !== 4) return 'Es braucht genau vier Ecken';
  let positiv = 0;
  let negativ = 0;
  for (let i = 0; i < 4; i++) {
    const a = punkte[i];
    const b = punkte[(i + 1) % 4];
    const c = punkte[(i + 2) % 4];
    const kreuz = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (kreuz > 0) positiv++;
    else if (kreuz < 0) negativ++;
  }
  if (positiv && negativ) return 'Die Ecken sind ueberschlagen – Reihenfolge oben links, oben rechts, unten rechts, unten links';
  // Flaeche ueber die Schnuersenkelformel: ein sehr flaches Viereck heisst,
  // dass zwei Marken fast aufeinanderliegen.
  let flaeche = 0;
  for (let i = 0, j = 3; i < 4; j = i++) {
    flaeche += (punkte[j][0] + punkte[i][0]) * (punkte[j][1] - punkte[i][1]);
  }
  if (Math.abs(flaeche / 2) < 1e-6) return 'Die vier Ecken liegen fast auf einer Linie';
  return null;
}
