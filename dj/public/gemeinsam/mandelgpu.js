// Das Mandelbrot auf der Grafikkarte, mit Stoerungsrechnung.
//
// Warum ueberhaupt eine zweite Fassung neben der auf dem Hauptprozessor:
//
// Die Rechnung in doppelter Genauigkeit ist bei Zoomtiefe 9 am Ende. Der
// Bildpunktabstand liegt dann bei rund 10^-11, und die Iteration verstaerkt
// jeden Rundungsfehler exponentiell - das Bild zerfaellt in Kloetzchen. Bisher
// wurde deshalb alle achtzig Sekunden an einer neuen Stelle neu angesetzt, und
// genau dieses Neuansetzen zerstoert den Sog, um den es geht.
//
// Die Loesung dafuer heisst Stoerungsrechnung und ist der Grund, warum es
// ueberhaupt Bilder von Zoomfahrten in die Billiardstel gibt:
//
//   Eine einzige Bahn - die des Mittelpunkts - wird in hoher Genauigkeit
//   gerechnet. Fuer jeden Bildpunkt wird dann nicht die Bahn selbst gerechnet,
//   sondern nur ihr *Abstand* zu dieser Bezugsbahn. Aus
//
//       z = Z + d      mit    Z die Bezugsbahn, d der Abstand
//
//   und z' = z^2 + c, Z' = Z^2 + C wird
//
//       d' = 2*Z*d + d^2 + (c - C)
//
//   Darin kommt der Mittelpunkt nur noch als fertig gerechnete Bahn Z vor. Der
//   Abstand d ist winzig, aber er ist *fuer sich* winzig - eine gewoehnliche
//   Gleitkommazahl traegt ihn ohne Weiteres, weil es auf seine relative und
//   nicht auf seine absolute Genauigkeit ankommt. Damit rechnet die
//   Grafikkarte in einfacher Genauigkeit Bilder, fuer die der Hauptprozessor
//   in doppelter Genauigkeit nicht ausreicht.
//
// Dazu kommt der Kniff von Zhuoran gegen die sogenannten Glitches: Wird der
// Abstand einmal groesser als der Punkt selbst, ist die Bezugsbahn fuer diesen
// Punkt unbrauchbar geworden. Dann wird die Bahn einfach neu angesetzt - der
// Punkt wird sein eigener Anfang. Das kostet eine Zeile und erspart die ganze
// Buchfuehrung ueber mehrere Bezugsbahnen.
//
// Die Bezugsbahn selbst wird auf dem Hauptprozessor in Festkommaarithmetik mit
// BigInt gerechnet, 200 Nachkommastellen im Zweiersystem, also rund 60
// Dezimalstellen. Sie haengt nur vom Zielpunkt ab, nicht von der Tiefe - also
// wird sie einmal je Ziel gerechnet und danach nur noch verlaengert.

// --- Festkomma fuer die Bezugsbahn -----------------------------------------

const NACHKOMMA = 200n;
const EINS = 1n << NACHKOMMA;
const TEILER = 2 ** 200;

/** Eine Dezimalzahl als Text in Festkomma. Der Text darf beliebig lang sein. */
function festkommaAusText(text) {
  let s = String(text).trim();
  let minus = false;
  if (s[0] === '-') {
    minus = true;
    s = s.slice(1);
  } else if (s[0] === '+') {
    s = s.slice(1);
  }
  const [ganz, nach = ''] = s.split('.');
  let wert = BigInt(ganz || '0') * EINS;
  if (nach.length) wert += (BigInt(nach) * EINS) / 10n ** BigInt(nach.length);
  return minus ? -wert : wert;
}

const fkMal = (a, b) => (a * b) >> NACHKOMMA;

/**
 * Die Bahn des Mittelpunkts, in hoher Genauigkeit gerechnet und als Paar aus
 * grobem und feinem Anteil abgelegt.
 *
 * Warum zwei Gleitkommazahlen je Wert: Die Grafikkarte kennt nur einfache
 * Genauigkeit, also sieben Stellen. Fuer die Bezugsbahn ist das zu wenig - ihr
 * Fehler geht unvermindert in jeden Bildpunkt ein. Zwei Zahlen, deren zweite
 * den Rest der ersten traegt, ergeben zusammen rund vierzehn Stellen, und der
 * Rest der Rechnung bleibt einfach.
 */
function bahnRechnen(zielX, zielY, schritte) {
  const cr = festkommaAusText(zielX);
  const ci = festkommaAusText(zielY);
  const daten = new Float32Array(schritte * 4);
  const vier = 4n * EINS;
  let zr = 0n;
  let zi = 0n;
  let gelaufen = schritte;
  for (let i = 0; i < schritte; i++) {
    const r = Number(zr) / TEILER;
    const j = Number(zi) / TEILER;
    const rGrob = Math.fround(r);
    const jGrob = Math.fround(j);
    daten[i * 4] = rGrob;
    daten[i * 4 + 1] = Math.fround(r - rGrob);
    daten[i * 4 + 2] = jGrob;
    daten[i * 4 + 3] = Math.fround(j - jGrob);

    const zr2 = fkMal(zr, zr);
    const zi2 = fkMal(zi, zi);
    if (zr2 + zi2 > vier) {
      // Der Zielpunkt liegt ausserhalb der Menge. Fuer unsere Ziele passiert
      // das nicht - sie liegen alle auf dem Rand -, aber ein falsch getippter
      // Zielpunkt soll nicht in einer Bahn aus Unendlichkeiten enden.
      gelaufen = i + 1;
      for (let k = i + 1; k < schritte; k++) {
        daten[k * 4] = daten[i * 4];
        daten[k * 4 + 1] = daten[i * 4 + 1];
        daten[k * 4 + 2] = daten[i * 4 + 2];
        daten[k * 4 + 3] = daten[i * 4 + 3];
      }
      break;
    }
    zi = 2n * fkMal(zr, zi) + ci;
    zr = zr2 - zi2 + cr;
  }
  return { daten, gelaufen };
}

// --- Die Schattierer -------------------------------------------------------

const ECKEN = `#version 300 es
in vec2 platz;
void main() { gl_Position = vec4(platz, 0.0, 1.0); }
`;

const PUNKTE = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D bahn;      // grob und fein, je zwei Werte
uniform sampler2D farben;    // 512 Stufen, aus dem Klang gebaut
uniform vec2  feld;          // Groesse des gerechneten Bildes
uniform float spanne;        // halbe Breite des Ausschnitts
uniform float seite;         // Hoehe zu Breite
uniform float dreh;          // Drehung des Ausschnitts
uniform int   schritte;      // Obergrenze der Iteration
uniform int   bahnBreite;    // Breite der Bahntextur
uniform float versatz;       // Farbverschiebung, 0 bis 1
uniform float dichte;        // wie eng die Farbbaender liegen
uniform float innenHell;     // Helligkeit der Innenflaeche
uniform vec3  mittelFarbe;   // Mittelwert der Farbtabelle
uniform float welle;         // Staerke der Drop-Welle
uniform float welleZeit;     // wie lange sie schon laeuft
uniform float mandala;       // 0 = reines Mandelbrot, 1 = volle Symmetrie
uniform float sterne;        // Zahl der Spiegelachsen
uniform float fangAnteil;    // wieviel die Bahnfalle zur Farbe beitraegt

out vec4 ergebnis;

vec4 bahnHolen(int i) {
  return texelFetch(bahn, ivec2(i % bahnBreite, i / bahnBreite), 0);
}

/*
 * Kaleidoskop - der ganze Trick hinter dem Mandala.
 *
 * Ein Mandala ist nichts anderes als Radialsymmetrie: dasselbe Motiv, um die
 * Mitte herum gespiegelt und gedreht. Statt das Bild hinterher zu spiegeln,
 * wird die *Abtastkoordinate* gefaltet, bevor gerechnet wird. Jeder Punkt des
 * Bildes holt sich seinen Wert damit aus einem einzigen Tortenstueck, und die
 * Symmetrie entsteht von selbst - ohne einen einzigen zusaetzlichen
 * Rechenschritt in der Iteration.
 *
 * Gefaltet wird der *Abstand zur Bildmitte*, und die Bildmitte ist der
 * Zielpunkt der Zoomfahrt. Das Mandala sitzt also genau im Sog und waechst mit
 * ihm, statt darueber zu kleben.
 */
vec2 falten(vec2 p, float n) {
  float keil = 3.14159265 / max(1.0, n);
  float winkel = atan(p.y, p.x);
  float weite = length(p);
  winkel = mod(winkel + keil, 2.0 * keil) - keil;
  return vec2(cos(abs(winkel)), sin(abs(winkel))) * weite;
}

void main() {
  vec2 bild = (gl_FragCoord.xy / feld) * 2.0 - 1.0;
  bild.y *= seite;
  // Drehung: Zoom und Drehung zusammen ergeben die Spirale, die das Auge
  // festhaelt. Ohne sie faellt der Blick nach ein paar Sekunden ab.
  float sd = sin(dreh);
  float cd = cos(dreh);
  vec2 roh = vec2(bild.x * cd - bild.y * sd, bild.x * sd + bild.y * cd);
  // Zwischen ungefaltet und gefaltet ueberblenden. Beide sind stetig, also
  // waechst die Symmetrie weich aus dem Bild heraus, statt umzuschalten.
  vec2 versch = mix(roh, falten(roh, sterne), mandala) * spanne;

  vec2 d = vec2(0.0);
  int m = 0;
  int n = 0;
  float naechster = 1e30;
  float raus = 0.0;
  /*
   * Bahnfalle (orbit trap).
   *
   * Bisher entschied allein die Ausstiegszeit ueber die Farbe - das gibt die
   * bekannten Hoehenlinien um den Rand. Die Bahnfalle fragt etwas anderes: Wie
   * nah ist die Bahn einem *Gebilde* gekommen? Hier ist das Gebilde ein Kreuz
   * aus den beiden Achsen. Punkte, deren Bahn nah an einer Achse vorbeikommt,
   * bekommen dadurch eine eigene Zeichnung, und im Bild entstehen Blueten,
   * Sterne und Faeden, die in der reinen Ausstiegszeit gar nicht vorkommen.
   * Das ist der Griff, mit dem Fraktalgrafiker ornamentale Bilder machen.
   */
  float kreuz = 1e30;

  for (int k = 0; k < schritte; k++) {
    vec4 Z = bahnHolen(m);
    vec2 grob = vec2(Z.x, Z.z);
    vec2 fein = vec2(Z.y, Z.w);
    // d' = 2*Z*d + d*d + versch, mit Z in zwei Teilen
    vec2 a = vec2(grob.x * d.x - grob.y * d.y, grob.x * d.y + grob.y * d.x);
    vec2 b = vec2(fein.x * d.x - fein.y * d.y, fein.x * d.y + fein.y * d.x);
    vec2 c = vec2(d.x * d.x - d.y * d.y, 2.0 * d.x * d.y);
    d = 2.0 * (a + b) + c + versch;
    m++;
    n++;

    vec4 Zn = bahnHolen(m);
    vec2 z = vec2(Zn.x + Zn.y, Zn.z + Zn.w) + d;
    float r2 = dot(z, z);
    if (r2 < naechster) naechster = r2;
    kreuz = min(kreuz, min(abs(z.x), abs(z.y)));
    if (r2 > 65536.0) { raus = r2; break; }
    // Der Kniff von Zhuoran: Ist der Abstand groesser als der Punkt selbst,
    // taugt die Bezugsbahn hier nicht mehr - dann faengt der Punkt bei sich
    // selbst neu an. Dasselbe am Ende der gerechneten Bahn.
    if (r2 < dot(d, d) || m >= schritte - 1) { d = z; m = 0; }
  }

  vec3 farbe;
  if (raus > 0.0) {
    float mu = float(n) + 1.0 - log2(log2(sqrt(raus)));
    // Die Wurzelkennlinie: Ohne sie liegen die Baender in der Tiefe so dicht,
    // dass das Bild flimmert, und im Flachen so weit, dass es einfarbig wird.
    float p = pow(max(mu, 1.0), 0.45) * dichte;
    // Die Falle mischt sich in die Farbe. Bei fangAnteil 0 bleibt alles beim
    // Alten, darueber legen sich die Bluetenformen ueber die Hoehenlinien.
    p += fangAnteil * 6.0 * pow(clamp(1.0 - kreuz * 3.0, 0.0, 1.0), 2.0);
    // Die Drop-Welle: eine Stauchung, die von innen nach aussen durch die
    // Baender laeuft. Weil sie auf p wirkt und nicht auf die Helligkeit,
    // *bewegt* sie das Bild, statt es nur aufzuhellen.
    p += welle * 0.9 * sin(p * 2.2 - welleZeit * 7.0);
    farbe = texture(farben, vec2(fract(p + versatz), 0.5)).rgb;
    /*
     * Glaetten, wo die Baender feiner werden als ein Bildpunkt.
     *
     * In den fein verzweigten Gegenden aendert sich die Ausstiegszeit von
     * einem Bildpunkt zum naechsten um mehrere Baender. Dann trifft jeder
     * Punkt eine zufaellige Stelle der Farbtabelle, und aus der Zeichnung wird
     * Griess - nachgemessen genau in den Bereichen, die eigentlich am
     * interessantesten sind.
     *
     * fwidth sagt, wieviel Band auf einen Bildpunkt faellt. Faellt mehr als
     * eines darauf, ist das Band nicht darstellbar, und der ehrliche Wert ist
     * sein Mittel - so wie ein Foto feine Streifen zu Grau mittelt, statt sie
     * zu erfinden. Dazwischen wird ueberblendet.
     */
    farbe = mix(farbe, mittelFarbe, clamp(fwidth(p) * 1.7, 0.0, 1.0));
  } else {
    // Die Innenflaeche bleibt Hintergrund, aber nicht leer: Wie nah die Bahn
    // dem Ursprung gekommen ist, unterscheidet die Punkte voneinander.
    float t = clamp(sqrt(naechster) * 1.9, 0.0, 1.0);
    farbe = texture(farben, vec2(t, 0.5)).rgb * innenHell + vec3(0.02, 0.02, 0.03);
  }
  ergebnis = vec4(farbe, 1.0);
}
`;

// --- Der Zustand -----------------------------------------------------------

let leinwand = null;
let gl = null;
let programm = null;
let orte = null;
let bahnTextur = null;
let farbTextur = null;
let bahnBreite = 0;
let bahnSchritte = 0;
let bahnZiel = null;
// Die Bahn bleibt auch auf dem Hauptprozessor liegen - die Stichprobe unten
// rechnet damit.
let bahnDaten = null;
let versucht = false;
let feldBreite = 0;
let feldHoehe = 0;

const BAHN_BREITE = 1024;

function schattiererBauen(quelle, art) {
  const s = gl.createShader(art);
  gl.shaderSource(s, quelle);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const grund = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Schattierer: ${grund}`);
  }
  return s;
}

/**
 * Einmal aufbauen. Gibt false zurueck, wenn die Grafikkarte nicht mitspielt -
 * dann rechnet der Hauptprozessor weiter, und niemand merkt etwas ausser dass
 * die Fahrt frueher an einer neuen Stelle ansetzt.
 */
export function gpuBereit() {
  if (versucht) return gl !== null;
  versucht = true;
  try {
    leinwand = document.createElement('canvas');
    gl = leinwand.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('kein WebGL2');

    programm = gl.createProgram();
    gl.attachShader(programm, schattiererBauen(ECKEN, gl.VERTEX_SHADER));
    gl.attachShader(programm, schattiererBauen(PUNKTE, gl.FRAGMENT_SHADER));
    gl.linkProgram(programm);
    if (!gl.getProgramParameter(programm, gl.LINK_STATUS)) {
      throw new Error(`Verbinden: ${gl.getProgramInfoLog(programm)}`);
    }
    gl.useProgram(programm);

    // Zwei Dreiecke, die das ganze Bild ausfuellen.
    const puffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, puffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const platz = gl.getAttribLocation(programm, 'platz');
    gl.enableVertexAttribArray(platz);
    gl.vertexAttribPointer(platz, 2, gl.FLOAT, false, 0, 0);

    orte = {};
    for (const name of [
      'bahn', 'farben', 'feld', 'spanne', 'seite', 'dreh',
      'schritte', 'bahnBreite', 'versatz', 'dichte', 'innenHell', 'mittelFarbe',
      'welle', 'welleZeit', 'mandala', 'sterne', 'fangAnteil',
    ]) {
      orte[name] = gl.getUniformLocation(programm, name);
    }

    bahnTextur = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bahnTextur);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(orte.bahn, 0);

    farbTextur = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, farbTextur);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(orte.farben, 1);
    return true;
  } catch (fehler) {
    if (typeof console !== 'undefined') {
      console.warn('Mandelbrot auf der Grafikkarte nicht moeglich:', fehler.message);
    }
    gl = null;
    return false;
  }
}

/** Die Bezugsbahn fuer ein Ziel bereitstellen oder verlaengern. */
function bahnSichern(ziel, gebraucht) {
  if (bahnZiel === ziel.name && bahnSchritte >= gebraucht) return;
  // Mit Vorlauf rechnen, damit nicht bei jedem tieferen Bild neu gerechnet
  // werden muss - die Bahn kostet Millisekunden, nicht Mikrosekunden.
  const schritte = Math.min(BAHN_BREITE * 16, Math.ceil(gebraucht * 1.6));
  const { daten } = bahnRechnen(ziel.x, ziel.y, schritte);
  bahnBreite = BAHN_BREITE;
  const hoehe = Math.ceil(schritte / BAHN_BREITE);
  const voll = new Float32Array(bahnBreite * hoehe * 4);
  voll.set(daten.subarray(0, Math.min(daten.length, voll.length)));

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, bahnTextur);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, bahnBreite, hoehe, 0, gl.RGBA, gl.FLOAT, voll);
  bahnSchritte = schritte;
  bahnDaten = voll;
  bahnZiel = ziel.name;
}

/** Die Farbtabelle hochladen. 512 Stufen, drei Kanaele. */
export function gpuFarben(tabelle) {
  if (!gl) return;
  const n = tabelle.length / 3;
  const bild = new Uint8Array(n * 4);
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    bild[i * 4] = tabelle[i * 3];
    bild[i * 4 + 1] = tabelle[i * 3 + 1];
    bild[i * 4 + 2] = tabelle[i * 3 + 2];
    bild[i * 4 + 3] = 255;
    sr += tabelle[i * 3];
    sg += tabelle[i * 3 + 1];
    sb += tabelle[i * 3 + 2];
  }
  gl.useProgram(programm);
  gl.uniform3f(orte.mittelFarbe, sr / n / 255, sg / n / 255, sb / n / 255);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, farbTextur);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bild);
}

/**
 * Ein Bild rechnen. Gibt die Leinwand zurueck, auf der es steht - gezeichnet
 * wird es vom Aufrufer, damit Ueberblendung und Schleier fuer beide Wege an
 * derselben Stelle stehen.
 */
export function gpuZeichnen(lage) {
  const { breite, hoehe, ziel, tiefe, dreh, schritte, versatz, dichte, innenHell, guete, welle, welleZeit, mandala, sterne, fangAnteil } = lage;
  const b = Math.max(64, Math.round(breite * guete));
  const h = Math.max(48, Math.round(hoehe * guete));
  if (b !== feldBreite || h !== feldHoehe) {
    leinwand.width = b;
    leinwand.height = h;
    feldBreite = b;
    feldHoehe = h;
  }

  bahnSichern(ziel, schritte);

  gl.useProgram(programm);
  gl.viewport(0, 0, b, h);
  gl.uniform2f(orte.feld, b, h);
  gl.uniform1f(orte.spanne, 1.6 / Math.pow(10, tiefe));
  gl.uniform1f(orte.seite, h / b);
  gl.uniform1f(orte.dreh, dreh);
  gl.uniform1i(orte.schritte, Math.min(bahnSchritte - 1, schritte));
  gl.uniform1i(orte.bahnBreite, bahnBreite);
  gl.uniform1f(orte.versatz, versatz);
  gl.uniform1f(orte.dichte, dichte);
  gl.uniform1f(orte.innenHell, innenHell);
  gl.uniform1f(orte.welle, welle ?? 0);
  gl.uniform1f(orte.welleZeit, welleZeit ?? 0);
  gl.uniform1f(orte.mandala, mandala ?? 0);
  gl.uniform1f(orte.sterne, sterne ?? 6);
  gl.uniform1f(orte.fangAnteil, fangAnteil ?? 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  return { leinwand, breite: b, hoehe: h, bahnSchritte };
}

/**
 * Eine Stichprobe auf dem Hauptprozessor - die Diagnose fuer die Fahrt.
 *
 * Warum das noetig ist: Bisher wurde am Bild abgelesen, ob noch etwas
 * darauf zu sehen ist, naemlich an der Streuung der Helligkeit. Dieses Mass
 * ist zweimal falsch, und zwar in beide Richtungen. Eine schoene tiefe Szene
 * hat zu Recht grosse dunkle Flaechen und wenig Streuung - sie wurde
 * abgebrochen, obwohl sie gut war. Ein entartetes Bild dagegen hat weiche
 * Baender und genug Streuung - es blieb stehen, obwohl nichts mehr da war.
 *
 * Das echte Kennzeichen ist ein anderes: Wenn die Schrittzahl nicht mehr
 * reicht, entkommt kein Punkt mehr, und *jeder* gilt als innen liegend.
 * Genau das laesst sich zaehlen, statt es aus Farben zu erraten.
 *
 * Gerechnet wird auf wenigen hundert Punkten und mit derselben
 * Stoerungsrechnung wie im Schattierer, nur in doppelter statt einfacher
 * Genauigkeit und mit einer sehr grosszuegigen Obergrenze. Das kostet ein
 * paar Millisekunden und laeuft deshalb nur alle paar Sekunden - dafuer
 * liefert es zwei Antworten, die keine Schaetzung sind:
 *
 *   innenAnteil     Wieviel des Bildes wirklich in der Menge liegt.
 *   schritteNoetig  Wieviele Schritte die Punkte tatsaechlich brauchen. Damit
 *                   laesst sich die Obergrenze *fuehren*, statt sie zu raten -
 *                   und die Ursache des schwarzen Bildes verschwindet, statt
 *                   nachtraeglich behandelt zu werden.
 */
export function gpuProbe(tiefe, dreh, deckel = 16000) {
  if (!bahnDaten || !bahnSchritte) return null;
  const spanne = 1.6 / Math.pow(10, tiefe);
  const sd = Math.sin(dreh);
  const cd = Math.cos(dreh);
  // Wenige Punkte, dafuer oft genug. 77 Stueck kosten im schlimmsten Fall
  // rund zwanzig Millisekunden - ein ausgelassenes Bild alle drei Sekunden.
  const breit = 11;
  const hoch = 7;
  let innen = 0;
  let hoechstes = 0;
  const gesehen = [];

  for (let py = 0; py < hoch; py++) {
    // Der Rand des Bildes zaehlt mit, nicht nur die Mitte.
    const by = ((py + 0.5) / hoch) * 2 - 1;
    for (let px = 0; px < breit; px++) {
      const bx = ((px + 0.5) / breit) * 2 - 1;
      const vx = (bx * cd - by * 0.625 * sd) * spanne;
      const vy = (bx * sd + by * 0.625 * cd) * spanne;

      let dx = 0;
      let dy = 0;
      let m = 0;
      let n = 0;
      let entkommen = 0;
      while (n < deckel) {
        const gx = bahnDaten[m * 4] + bahnDaten[m * 4 + 1];
        const gy = bahnDaten[m * 4 + 2] + bahnDaten[m * 4 + 3];
        const ax = gx * dx - gy * dy;
        const ay = gx * dy + gy * dx;
        const cx2 = dx * dx - dy * dy;
        const cy2 = 2 * dx * dy;
        dx = 2 * ax + cx2 + vx;
        dy = 2 * ay + cy2 + vy;
        m++;
        n++;
        const nx = bahnDaten[m * 4] + bahnDaten[m * 4 + 1] + dx;
        const ny = bahnDaten[m * 4 + 2] + bahnDaten[m * 4 + 3] + dy;
        const r2 = nx * nx + ny * ny;
        if (r2 > 65536) { entkommen = n; break; }
        if (r2 < dx * dx + dy * dy || m >= bahnSchritte - 1) { dx = nx; dy = ny; m = 0; }
      }
      if (entkommen) {
        gesehen.push(entkommen);
        if (entkommen > hoechstes) hoechstes = entkommen;
      } else {
        innen++;
      }
    }
  }

  gesehen.sort((a, b) => a - b);
  // Nicht der hoechste Wert, sondern das obere Zwanzigstel: Ein einzelner
  // Punkt, der zufaellig genau auf dem Rand sitzt, braucht beliebig viele
  // Schritte und wuerde die Obergrenze in die Hoehe treiben, ohne dass man
  // von ihm etwas saehe.
  const rand = gesehen.length ? gesehen[Math.floor(gesehen.length * 0.95)] : 0;

  /*
   * Wie weit die Ausstiegszeiten auseinanderliegen - das Mass fuer "steht hier
   * ueberhaupt Zeichnung".
   *
   * Der Innenanteil allein reicht nicht. Er faengt den Fall, dass das Bild in
   * der Menge versinkt, aber nicht den umgekehrten: ein Ausschnitt weit
   * draussen, wo alle Punkte nach fast derselben Zahl von Schritten
   * entkommen. Dann steht ein glattes Feld mit ein paar breiten Ringen da -
   * genau das Bild, das auf dem iPad haengenblieb, und der Innenanteil war
   * dabei null.
   *
   * Verglichen wird das obere mit dem unteren Zehntel, bezogen auf die Mitte.
   * Ein Ausschnitt am Rand der Menge streut um ein Vielfaches; ein glattes
   * Feld liegt bei wenigen Prozent.
   */
  let spreizung = 0;
  if (gesehen.length >= 8) {
    const unten = gesehen[Math.floor(gesehen.length * 0.1)];
    const oben = gesehen[Math.floor(gesehen.length * 0.9)];
    const mitte = gesehen[Math.floor(gesehen.length * 0.5)];
    spreizung = (oben - unten) / Math.max(1, mitte);
  }

  return {
    innenAnteil: innen / (breit * hoch),
    schritteNoetig: rand,
    spreizung,
    hoechstes,
    punkte: breit * hoch,
  };
}
