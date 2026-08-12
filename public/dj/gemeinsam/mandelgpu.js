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

out vec4 ergebnis;

vec4 bahnHolen(int i) {
  return texelFetch(bahn, ivec2(i % bahnBreite, i / bahnBreite), 0);
}

void main() {
  vec2 bild = (gl_FragCoord.xy / feld) * 2.0 - 1.0;
  bild.y *= seite;
  // Drehung: Zoom und Drehung zusammen ergeben die Spirale, die das Auge
  // festhaelt. Ohne sie faellt der Blick nach ein paar Sekunden ab.
  float sd = sin(dreh);
  float cd = cos(dreh);
  vec2 versch = vec2(bild.x * cd - bild.y * sd, bild.x * sd + bild.y * cd) * spanne;

  vec2 d = vec2(0.0);
  int m = 0;
  int n = 0;
  float naechster = 1e30;
  float raus = 0.0;

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
  const schritte = Math.min(BAHN_BREITE * 8, Math.ceil(gebraucht * 1.6));
  const { daten } = bahnRechnen(ziel.x, ziel.y, schritte);
  bahnBreite = BAHN_BREITE;
  const hoehe = Math.ceil(schritte / BAHN_BREITE);
  const voll = new Float32Array(bahnBreite * hoehe * 4);
  voll.set(daten.subarray(0, Math.min(daten.length, voll.length)));

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, bahnTextur);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, bahnBreite, hoehe, 0, gl.RGBA, gl.FLOAT, voll);
  bahnSchritte = schritte;
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
  const { breite, hoehe, ziel, tiefe, dreh, schritte, versatz, dichte, innenHell, guete } = lage;
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
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  return { leinwand, breite: b, hoehe: h, bahnSchritte };
}
