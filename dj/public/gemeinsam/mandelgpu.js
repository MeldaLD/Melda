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
uniform int   bahnLaenge;    // wieviele Punkte der Bahn fertig sind
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

  /*
   * Ein Texturzugriff je Schritt statt zwei.
   *
   * Die Schleife brauchte bisher zwei: den Bahnpunkt m fuer die Rechnung und
   * gleich danach m+1 fuer die Austrittspruefung. Der zweite ist aber genau
   * der, den der naechste Durchlauf als ersten braucht - er wird also
   * mitgenommen statt noch einmal geholt. Nur beim Neuansetzen der Bahn muss
   * einmal zusaetzlich gelesen werden, und das ist selten.
   *
   * Der Texturzugriff ist in dieser Schleife der Engpass, nicht das Rechnen.
   * Die Haelfte davon einzusparen heisst annaehernd doppelt so schnell.
   */
  vec4 Z = bahnHolen(0);
  for (int k = 0; k < schritte; k++) {
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
    /*
     * Die Bahnlaenge ist *nicht* die Schrittzahl.
     *
     * Beides stand frueher in derselben Zahl, und das war falsch: Eine kurze
     * Bahn haette dann auch die Iteration gekappt. Sie muss sie aber nur
     * haeufiger neu ansetzen - das kostet Genauigkeit an wenigen Punkten, aber
     * es rechnet weiter. Getrennt darf die Bahn nachwachsen, waehrend das Bild
     * schon in voller Tiefe laeuft.
     */
    if (r2 < dot(d, d) || m >= bahnLaenge - 1) { d = z; m = 0; Z = bahnHolen(0); }
    else Z = Zn;
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
      'schritte', 'bahnBreite', 'bahnLaenge', 'versatz', 'dichte', 'innenHell', 'mittelFarbe',
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
/*
 * Die Bezugsbahn waechst stueckweise - und blockiert nie ein Bild.
 *
 * Vorher wurde sie bei jeder Vergroesserung von vorn gerechnet, synchron,
 * mitten im Bild: bis zu 16000 Schritte in Festkommaarithmetik plus ein
 * vollstaendiger Texturupload. Ausgeloest wurde das von der Zoomtiefe - und
 * ein Drop schiebt die Tiefe schlagartig vor. Das Haken kam also genau in dem
 * Moment, in dem es am wenigsten passieren darf.
 *
 * Jetzt bleibt der Rechenstand erhalten und die Bahn wird je Bild um einen
 * Happen verlaengert. Zwei Dinge machen das moeglich:
 *
 *   - Die Bahn haengt nur am Zielpunkt, nicht an der Tiefe. Was einmal
 *     gerechnet ist, bleibt gueltig - Fortsetzen ist also billiger als
 *     Neurechnen, und zwar um den ganzen bereits gerechneten Teil.
 *   - Eine noch zu kurze Bahn ist kein Fehler, sondern nur weniger sparsam:
 *     Der Schattierer setzt dann eben oefter neu an. Das Bild ist sofort
 *     richtig, es wird nur waehrend des Nachwachsens etwas teurer.
 */
const BAHN_HOEHE = 16;
const BAHN_MAX = BAHN_BREITE * BAHN_HOEHE;
// Soviele Punkte je Bild. Gemessen kostet ein Punkt rund eine halbe
// Mikrosekunde, ein Happen also unter einer Millisekunde.
const BAHN_HAPPEN = 1400;
// Womit angefangen wird, damit das erste Bild brauchbar ist.
const BAHN_ANFANG = 1200;

let bahnZr = 0n;
let bahnZi = 0n;
let bahnCr = 0n;
let bahnCi = 0n;
let bahnFertig = false;

/** Die Bahn um hoechstens `wieviele` Punkte verlaengern. */
function bahnWachsen(wieviele) {
  const vier = 4n * EINS;
  const bis = Math.min(BAHN_MAX, bahnSchritte + wieviele);
  const von = bahnSchritte;
  for (let i = von; i < bis; i++) {
    const r = Number(bahnZr) / TEILER;
    const j = Number(bahnZi) / TEILER;
    const rGrob = Math.fround(r);
    const jGrob = Math.fround(j);
    bahnDaten[i * 4] = rGrob;
    bahnDaten[i * 4 + 1] = Math.fround(r - rGrob);
    bahnDaten[i * 4 + 2] = jGrob;
    bahnDaten[i * 4 + 3] = Math.fround(j - jGrob);

    const zr2 = fkMal(bahnZr, bahnZr);
    const zi2 = fkMal(bahnZi, bahnZi);
    if (zr2 + zi2 > vier) {
      // Der Zielpunkt liegt ausserhalb der Menge - fuer unsere Ziele kommt das
      // nicht vor, aber ein vertippter soll nicht in Unendlichkeiten enden.
      bahnFertig = true;
      bahnSchritte = i + 1;
      return { von, bis: i + 1 };
    }
    bahnZi = 2n * fkMal(bahnZr, bahnZi) + bahnCi;
    bahnZr = zr2 - zi2 + bahnCr;
  }
  bahnSchritte = bis;
  if (bis >= BAHN_MAX) bahnFertig = true;
  return { von, bis };
}

/** Nur die geaenderten Zeilen der Textur nachladen. */
function bahnHochladen(von, bis) {
  if (bis <= von) return;
  const zeileVon = Math.floor(von / BAHN_BREITE);
  const zeileBis = Math.min(BAHN_HOEHE, Math.ceil(bis / BAHN_BREITE));
  const anzahl = zeileBis - zeileVon;
  if (anzahl <= 0) return;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, bahnTextur);
  gl.texSubImage2D(
    gl.TEXTURE_2D, 0, 0, zeileVon, BAHN_BREITE, anzahl, gl.RGBA, gl.FLOAT,
    bahnDaten.subarray(zeileVon * BAHN_BREITE * 4, zeileBis * BAHN_BREITE * 4),
  );
}

function bahnSichern(ziel, gebraucht) {
  if (bahnZiel !== ziel.name) {
    bahnBreite = BAHN_BREITE;
    if (!bahnDaten) bahnDaten = new Float32Array(BAHN_MAX * 4);
    bahnDaten.fill(0);
    bahnCr = festkommaAusText(ziel.x);
    bahnCi = festkommaAusText(ziel.y);
    bahnZr = 0n;
    bahnZi = 0n;
    bahnSchritte = 0;
    bahnFertig = false;
    bahnZiel = ziel.name;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bahnTextur);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA32F, BAHN_BREITE, BAHN_HOEHE, 0, gl.RGBA, gl.FLOAT, bahnDaten,
    );
    const anfang = bahnWachsen(BAHN_ANFANG);
    bahnHochladen(anfang.von, anfang.bis);
    return;
  }
  // Mit Vorlauf wachsen, damit die Bahn der Tiefe voraus ist statt hinterher.
  const wunsch = Math.min(BAHN_MAX, Math.ceil(gebraucht * 1.3));
  if (bahnFertig || bahnSchritte >= wunsch) return;
  const gewachsen = bahnWachsen(BAHN_HAPPEN);
  bahnHochladen(gewachsen.von, gewachsen.bis);
}

/** Die Farbtabelle hochladen. 512 Stufen, drei Kanaele. */
/**
 * Die Leinwand der Grafikkarte selbst - damit sie in die Seite gehaengt werden
 * kann, statt jedes Bild kopiert zu werden.
 */
/*
 * Wer rechnet hier eigentlich?
 *
 * Auf einem fremden Rechner ist das die erste Frage, und sie laesst sich aus
 * der Ferne nicht raten. Der Name der Grafikkarte steht im Treiber; ohne die
 * Erweiterung liefert der Browser nur "WebKit WebGL" und verschweigt ihn.
 */
export function gpuName() {
  if (!gl) return null;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const roh = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return String(roh || '').slice(0, 60);
}

export function gpuLeinwand() {
  return leinwand;
}

/**
 * Alles, was sich ueber diese Grafikkarte herausfinden laesst.
 *
 * Fuer die Nerd-Anzeige: Auf einem fremden Geraet ist die erste Frage, ob
 * ueberhaupt die Grafikkarte rechnet - und die zweite, welche. Beides laesst
 * sich aus der Ferne nicht raten.
 */
export function gpuAuskunft() {
  if (!gl) return { da: false };
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const zahl = (name) => {
    try {
      return gl.getParameter(gl[name]);
    } catch {
      return null;
    }
  };
  return {
    da: true,
    // Was der Treiber ueber sich sagt. Ohne die Erweiterung nennt der Browser
    // nur "WebKit WebGL" - Safari gibt sie aus Datenschutzgruenden nicht heraus.
    hersteller: debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) || '') : null,
    karte: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) || '') : null,
    herstellerRoh: String(gl.getParameter(gl.VENDOR) || ''),
    karteRoh: String(gl.getParameter(gl.RENDERER) || ''),
    fassung: String(gl.getParameter(gl.VERSION) || ''),
    schattierer: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || ''),
    grenzen: {
      textur: zahl('MAX_TEXTURE_SIZE'),
      zeichenpuffer: zahl('MAX_RENDERBUFFER_SIZE'),
      texturenJeSchritt: zahl('MAX_TEXTURE_IMAGE_UNITS'),
      gleitkommaTextur: Boolean(gl.getExtension('EXT_color_buffer_float')),
      // Genau die beiden, an denen unser Fraktal haengt: Die Bezugsbahn liegt
      // in einer RGBA32F-Textur, und ohne lineares Filtern darauf muesste der
      // Schattierer selbst interpolieren.
      gleitkommaGlatt: Boolean(gl.getExtension('OES_texture_float_linear')),
    },
    zeitmessung: Boolean(uhrExt),
    gpuMs: letzteGpuMs,
    messungen: uhrGemessen,
  };
}

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
  /*
   * Die Rechenflaeche wird nur in Spruengen umgestellt, nicht stufenlos.
   *
   * leinwand.width zu setzen ist kein Zuweisen einer Zahl: Der Browser legt
   * den Zeichenpuffer neu an und loescht ihn. Das kostet, und der Regler
   * darueber bewegt sich in jedem Bild ein wenig - stufenlos nachgezogen
   * hiesse das eine Neuanlage je Bild, dauerhaft.
   *
   * Deshalb die tote Zone: Erst wenn die gewuenschte Breite um mehr als sechs
   * Prozent von der stehenden abweicht, wird wirklich umgestellt. Sechs
   * Prozent Flaechenunterschied sieht niemand; eine Neuanlage je Bild schon.
   */
  const bWunsch = Math.max(64, Math.round(breite * guete));
  const hWunsch = Math.max(48, Math.round(hoehe * guete));
  const abweichung =
    feldBreite > 0 && feldHoehe > 0
      ? Math.max(
          Math.abs(bWunsch - feldBreite) / feldBreite,
          Math.abs(hWunsch - feldHoehe) / feldHoehe,
        )
      : 1;
  if (abweichung > 0.06) {
    leinwand.width = bWunsch;
    leinwand.height = hWunsch;
    feldBreite = bWunsch;
    feldHoehe = hWunsch;
  }
  const b = feldBreite;
  const h = feldHoehe;

  const vorBahn = performance.now();
  bahnSichern(ziel, schritte);
  const bahnMs = performance.now() - vorBahn;

  gl.useProgram(programm);
  gl.viewport(0, 0, b, h);
  gl.uniform2f(orte.feld, b, h);
  gl.uniform1f(orte.spanne, 1.6 / Math.pow(10, tiefe));
  gl.uniform1f(orte.seite, h / b);
  gl.uniform1f(orte.dreh, dreh);
  gl.uniform1i(orte.schritte, schritte);
  gl.uniform1i(orte.bahnBreite, bahnBreite);
  gl.uniform1i(orte.bahnLaenge, Math.max(2, bahnSchritte));
  gl.uniform1f(orte.versatz, versatz);
  gl.uniform1f(orte.dichte, dichte);
  gl.uniform1f(orte.innenHell, innenHell);
  gl.uniform1f(orte.welle, welle ?? 0);
  gl.uniform1f(orte.welleZeit, welleZeit ?? 0);
  gl.uniform1f(orte.mandala, mandala ?? 0);
  gl.uniform1f(orte.sterne, sterne ?? 6);
  gl.uniform1f(orte.fangAnteil, fangAnteil ?? 0);
  uhrStarten();
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  uhrStoppen();

  return { leinwand, breite: b, hoehe: h, bahnSchritte, bahnMs, gpuMs: letzteGpuMs };
}

/*
 * Wie lange rechnet die Grafikkarte wirklich an einem Bild?
 *
 * Eine Stoppuhr um drawArrays beantwortet das nicht - der Befehl kehrt zurueck,
 * sobald er in der Warteschlange steht, nicht wenn die Karte fertig ist. Genau
 * daran ist hier schon einmal ein Regler gescheitert.
 *
 * EXT_disjoint_timer_query_webgl2 fragt die Karte selbst: Sie stempelt den
 * Anfang und das Ende der Arbeit und liefert die Dauer in Nanosekunden. Das
 * Ergebnis steht ein paar Bilder spaeter bereit, deshalb wird es abgeholt statt
 * abgewartet - eine Abfrage laeuft, die vorige wird eingesammelt.
 *
 * Nicht jeder Browser gibt die Erweiterung heraus: Sie erlaubt sehr genaue
 * Zeitmessung, und daraus lassen sich Seitenkanaele bauen. Safari hat sie
 * bisher nicht. Fehlt sie, bleibt gpuMs null - und die Anzeige sagt das, statt
 * eine Zahl zu erfinden.
 */
let uhrExt = null;
let uhrFrage = null;
// Abfrage abgeschickt, Ergebnis noch nicht abgeholt. Eine neue darf erst
// starten, wenn die vorige eingesammelt ist - sonst verwirft WebGL sie.
let uhrOffen = false;
let uhrLaeuft = false;
let letzteGpuMs = null;
let uhrGemessen = 0;

function uhrStarten() {
  if (uhrExt === null) {
    uhrExt = gl.getExtension('EXT_disjoint_timer_query_webgl2') ?? false;
  }
  if (!uhrExt) return;
  if (uhrOffen) uhrAbholen();
  // Steht das Ergebnis noch aus, wird dieses Bild eben nicht gemessen. Die
  // Karte laeuft der Abfrage naturgemaess hinterher; jedes zweite oder dritte
  // Bild zu messen reicht fuer eine Anzeige vollkommen.
  if (uhrOffen) return;
  if (!uhrFrage) uhrFrage = gl.createQuery();
  gl.beginQuery(uhrExt.TIME_ELAPSED_EXT, uhrFrage);
  uhrLaeuft = true;
}

function uhrStoppen() {
  if (!uhrLaeuft) return;
  gl.endQuery(uhrExt.TIME_ELAPSED_EXT);
  uhrLaeuft = false;
  uhrOffen = true;
}

function uhrAbholen() {
  if (!uhrOffen) return;
  // Ein "disjoint" heisst: Die Karte hat zwischendurch etwas anderes gerechnet
  // oder ihren Takt geaendert. Dann ist die Messung wertlos.
  if (gl.getParameter(uhrExt.GPU_DISJOINT_EXT)) {
    uhrOffen = false;
    return;
  }
  if (!gl.getQueryParameter(uhrFrage, gl.QUERY_RESULT_AVAILABLE)) return;
  const ms = Number(gl.getQueryParameter(uhrFrage, gl.QUERY_RESULT)) / 1e6;
  uhrOffen = false;
  uhrGemessen++;
  // Traege glaetten, sonst zappelt die Anzeige unlesbar.
  letzteGpuMs = letzteGpuMs === null ? ms : letzteGpuMs * 0.8 + ms * 0.2;
}

/** Die zuletzt gemessene reine Rechenzeit der Grafikkarte, oder null. */
export function gpuZeitMs() {
  return letzteGpuMs;
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
/*
 * Die Stichprobe hat ein festes Arbeitsbudget.
 *
 * Ihre Kosten hingen bisher am Bildinhalt, und zwar falsch herum: Punkte im
 * Inneren entkommen nie und laufen bis zur Obergrenze, Punkte draussen sind
 * nach ein paar Dutzend Schritten fertig. Nachgemessen 6,3 ms bei zwei
 * Prozent Innenanteil und 13,9 ms bei zweiundsechzig - und weil bei einem
 * dunklen Bild zusaetzlich haeufiger nachgesehen wurde, traf die teuerste
 * Messung genau auf den unguenstigsten Moment. Auf einem Tablet wurde daraus
 * ein deutliches Haken, und zwar immer dann, wenn "ploetzlich neuer Inhalt
 * entsteht" - also genau dann, wenn der Wachdienst anspringt.
 *
 * Jetzt bekommt sie ein Budget an Schritten, das sie nicht ueberziehen darf.
 * Reicht es nicht fuer alle Punkte, werden eben weniger gemessen - und beim
 * naechsten Mal die anderen, reihum. Ueber ein paar Aufrufe ist die Flaeche
 * genauso abgedeckt, aber kein einzelner Aufruf kostet mehr als das Budget.
 */
let probeStart = 0;
/*
 * Die letzten Messwerte, ueber Aufrufe hinweg.
 *
 * Mit dem Arbeitsbudget schafft ein einzelner Aufruf nur noch eine Handvoll
 * Punkte - zu wenige fuer eine Aussage ueber die Verteilung. Da die Punkte
 * aber reihum drankommen, ergaenzen sich die Aufrufe: Ein Ring der letzten
 * achtzig Messungen deckt die Flaeche ab und ist nach ein paar Sekunden
 * vollstaendig. Beim Stellenwechsel wird er geleert, sonst spraeche die alte
 * Stelle in die neue hinein.
 */
const PROBE_RING = 80;
let probeWerte = [];

export function gpuProbeVergessen() {
  probeWerte = [];
  probeStart = 0;
}

export function gpuProbe(tiefe, dreh, deckel = 9000, arbeitsbudget = 20000) {
  if (!bahnDaten || !bahnSchritte) return null;
  const spanne = 1.6 / Math.pow(10, tiefe);
  const sd = Math.sin(dreh);
  const cd = Math.cos(dreh);
  // Wenige Punkte, dafuer oft genug. 77 Stueck kosten im schlimmsten Fall
  // rund zwanzig Millisekunden - ein ausgelassenes Bild alle drei Sekunden.
  const breit = 9;
  const hoch = 5;
  let innen = 0;
  let hoechstes = 0;
  let gemessen = 0;
  const gesehen = [];
  let uebrig = arbeitsbudget;
  const anzahl = breit * hoch;

  for (let k = 0; k < anzahl; k++) {
    // Reihum, damit ueber mehrere Aufrufe die ganze Flaeche drankommt.
    const nr = (probeStart + k) % anzahl;
    const py = Math.floor(nr / breit);
    const px = nr % breit;
    const grenze = Math.min(deckel, uebrig);
    if (grenze < 120) break;
    {
      const by = ((py + 0.5) / hoch) * 2 - 1;
      const bx = ((px + 0.5) / breit) * 2 - 1;
      const vx = (bx * cd - by * 0.625 * sd) * spanne;
      const vy = (bx * sd + by * 0.625 * cd) * spanne;

      let dx = 0;
      let dy = 0;
      let m = 0;
      let n = 0;
      let entkommen = 0;
      while (n < grenze) {
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
      uebrig -= n;
      gemessen++;
      probeStart = (nr + 1) % anzahl;
      probeWerte.push(entkommen);
      if (probeWerte.length > PROBE_RING) probeWerte.shift();
    }
  }
  if (!gemessen || !probeWerte.length) return null;

  // Ausgewertet wird der Ring, nicht nur dieser Aufruf.
  for (const w of probeWerte) {
    if (w) {
      gesehen.push(w);
      if (w > hoechstes) hoechstes = w;
    } else {
      innen++;
    }
  }

  gesehen.sort((a, b) => a - b);
  // Nicht der hoechste Wert, sondern das obere Zwanzigstel: Ein einzelner
  // Punkt, der zufaellig genau auf dem Rand sitzt, braucht beliebig viele
  // Schritte und wuerde die Obergrenze in die Hoehe treiben, ohne dass man
  // von ihm etwas saehe.
  // Das obere Zehntel statt des oberen Zwanzigstels: Der Unterschied sind
  // wenige Randpunkte, die Ersparnis an Schritten ist erheblich.
  const rand = gesehen.length ? gesehen[Math.floor(gesehen.length * 0.9)] : 0;

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
  let spreizung = -1; // -1 heisst: nicht beurteilbar
  if (gesehen.length >= 15) {
    const unten = gesehen[Math.floor(gesehen.length * 0.1)];
    const oben = gesehen[Math.floor(gesehen.length * 0.9)];
    const mitte = gesehen[Math.floor(gesehen.length * 0.5)];
    spreizung = (oben - unten) / Math.max(1, mitte);
  }

  return {
    innenAnteil: innen / probeWerte.length,
    schritteNoetig: rand,
    spreizung,
    // Wieviele Punkte ueberhaupt entkommen sind. Unter einer Handvoll sagt die
    // Spreizung nichts - dann ist sie nicht null, sondern unbekannt.
    entkommene: gesehen.length,
    hoechstes,
    punkte: probeWerte.length,
    frisch: gemessen,
  };
}
