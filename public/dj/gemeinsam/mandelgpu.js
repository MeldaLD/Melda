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
uniform int   faltArt;       // welche Faltung - siehe falten()
/*
 * Der freie Wert der Faltung: Drall, Ringzahl, Zackentiefe, Schwung.
 *
 * Vorher stand er in jedem Zweig als Zahl - "faltSpirale(p, n, 0.55)". Damit
 * kostete jede weitere Variante einen weiteren Zweig im Schattierer, obwohl
 * sich nur eine Zahl aendert. Als Uniform kostet sie gar nichts: Ein Windrad
 * mit sanftem und eines mit scharfem Drall sind dann zwei Eintraege im
 * Katalog und derselbe Code.
 */
uniform float faltWert;
uniform float fangAnteil;    // wieviel die Bahnfalle zur Farbe beitraegt

/*
 * Reihenentwicklung - wieviele Schritte uebersprungen werden duerfen.
 *
 * reiheN ist die Zahl der Schritte, die *alle* Punkte des Bildes ueberspringen.
 * reiheA bis reiheD sind die vier Koeffizienten der Potenzreihe, schon so
 * skaliert, dass sie mit u = versch/reiheS gerechnet werden koennen; u liegt
 * damit in der Einheitsscheibe.
 *
 * reiheFalle und reiheNah tragen nach, was in den uebersprungenen Schritten
 * fuer Bahnfalle und Innenzeichnung angefallen waere - siehe die Begruendung
 * bei reiheBauen.
 *
 * reiheN = 0 heisst: abgeschaltet, es wird von vorn gerechnet.
 */
uniform int   reiheN;
uniform float reiheS;
uniform vec2  reiheA;
uniform vec2  reiheB;
uniform vec2  reiheC;
uniform vec2  reiheD;
uniform float reiheFalle;
uniform float reiheNah;

out vec4 ergebnis;

vec2 kmal(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

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
/*
 * Vierzehn Faltungen statt einer.
 *
 * Drei Dinge gelten fuer alle, und sie sind der Grund, warum das hier fast
 * nichts kostet:
 *
 *   1. Gefaltet wird *einmal je Bildpunkt*, vor der Iteration. Danach laufen
 *      Tausende Schritte. Ob die Faltung fuenf oder fuenfzig Rechenoperationen
 *      braucht, verschwindet dagegen restlos - keine dieser Arten ist
 *      nennenswert teurer als eine andere.
 *   2. faltArt ist ein Uniform, kein Wert je Bildpunkt. Alle Punkte nehmen
 *      denselben Zweig, und damit gibt es an dieser Verzweigung keine
 *      Divergenz. Auf einer Grafikkarte laufen Punkte in Gruppen im
 *      Gleichschritt; eine Verzweigung, bei der Punkte einer Gruppe
 *      auseinanderlaufen, kostet die Summe beider Wege. Ein Uniform tut das
 *      nicht.
 *   3. Keine Faltung macht den Abstand groesser: |gefaltet| <= |p|. Das ist
 *      keine Kosmetik, sondern Bedingung. Die Reihenentwicklung rechnet mit
 *      u = versch/s und setzt |u| <= 1 voraus; eine Faltung, die den Radius
 *      aufblaest, wuerde sie ausserhalb ihres Gueltigkeitsbereichs auswerten.
 *      Drehungen und Spiegelungen erhalten die Laenge ohnehin; wo der Radius
 *      angefasst wird, bildet er [0,R] auf [0,R] ab.
 *
 * Woher die grossen Unterschiede kommen, die man trotzdem sieht: nicht aus der
 * Faltung, sondern daraus, *wohin* sie greift. Sie legt das ganze Bild in ein
 * Tortenstueck. Zeigt dieses Stueck in eine Gegend nah am Rand der Menge,
 * braucht dort *jeder* Punkt die volle Schrittzahl - und weil die Gruppe im
 * Gleichschritt laeuft, kostet sie so viel wie ihr teuerster Punkt. Zeigt es
 * ins Freie, ist alles nach wenigen Schritten entschieden. Dieselbe Rechnung,
 * zehnfacher Preis, je nach Ausschnitt.
 */

const float PI = 3.14159265;

// Spiegelung an n Achsen - das klassische Kaleidoskop.
vec2 faltSpiegel(vec2 p, float n) {
  float keil = PI / max(1.0, n);
  float w = atan(p.y, p.x);
  w = mod(w + keil, 2.0 * keil) - keil;
  return vec2(cos(abs(w)), sin(abs(w))) * length(p);
}

// Nur Drehung, keine Spiegelung. Ergibt ein Windrad statt einer Rosette -
// die Figur hat dann eine Laufrichtung.
vec2 faltDrehung(vec2 p, float n) {
  float keil = 2.0 * PI / max(1.0, n);
  float w = atan(p.y, p.x);
  w = mod(w, keil);
  return vec2(cos(w), sin(w)) * length(p);
}

// Zweimal spiegeln, mit n und dem Doppelten. Feinere Rosette, weil zwei
// Achsensysteme uebereinanderliegen.
vec2 faltDoppelt(vec2 p, float n) {
  return faltSpiegel(faltSpiegel(p, n), n * 2.0);
}

// Quadratisch: erst in den ersten Quadranten, dann an der Winkelhalbierenden.
// Das ist die Symmetrie einer Fliese, und sie ist die billigste von allen -
// zwei Betraege und ein Tausch, ohne einen einzigen Winkel.
vec2 faltQuadrat(vec2 p) {
  p = abs(p);
  return p.x < p.y ? p.yx : p;
}

// Sechseckig: drei Spiegelachsen im Sechzig-Grad-Abstand. Die Symmetrie der
// Bienenwabe, und die dichteste, die die Ebene ohne Luecken fuellt.
vec2 faltWabe(vec2 p) {
  const vec2 a = vec2(-0.8660254, 0.5);
  const vec2 b = vec2(0.8660254, 0.5);
  p = abs(p);
  p -= 2.0 * min(0.0, dot(p, a)) * a;
  p -= 2.0 * min(0.0, dot(p, b)) * b;
  return p;
}

// Der Winkel wird mit dem Logarithmus des Radius verdreht, bevor gefaltet
// wird - daraus werden Spiralarme statt gerader Strahlen.
vec2 faltSpirale(vec2 p, float n, float drall) {
  float r = length(p);
  float w = atan(p.y, p.x) + drall * log(max(r, 1e-20));
  float keil = PI / max(1.0, n);
  w = mod(w + keil, 2.0 * keil) - keil;
  return vec2(cos(abs(w)), sin(abs(w))) * r;
}

/*
 * Ringe: der Radius wird logarithmisch wiederholt.
 *
 * Im Logarithmus des Radius ist ein Zoom eine Verschiebung. Wer dort
 * wiederholt, bekommt Ringe, die beim Hineinfahren ineinander laufen statt
 * vorbeizuziehen - der Droste-Effekt. Zurueckgebildet wird auf [0,R], damit
 * der Abstand nicht waechst.
 */
vec2 faltRinge(vec2 p, float n, float ringe) {
  vec2 g = faltSpiegel(p, n);
  float r = length(g);
  if (r < 1e-20) return g;
  float hoechst = 2.0;
  float l = log(r / hoechst);
  float breit = 1.0 / max(0.5, ringe);
  float f = mod(l, breit);
  // Spiegeln statt springen, sonst sieht man die Naht als harte Kante.
  f = abs(f - breit * 0.5) * 2.0;
  return g * (exp(l - f) / r * hoechst);
}

// Wie faltSpirale, aber ohne Spiegelung: Das Ergebnis dreht sich sichtbar und
// schraubt sich dabei nach innen. Eine Rosette kann das nicht - sie hat
// Spiegelachsen und steht deshalb immer still, egal wie schnell sie sich dreht.
vec2 faltDrehspirale(vec2 p, float n, float drall) {
  float r = length(p);
  float w = atan(p.y, p.x) + drall * log(max(r, 1e-20));
  float keil = 2.0 * PI / max(1.0, n);
  w = mod(w, keil);
  return vec2(cos(w), sin(w)) * r;
}

// Sterne: der Radius wird entlang des Winkels eingezogen. Die Figur bekommt
// dadurch eine Zackenkontur statt eines runden Randes.
vec2 faltStern(vec2 p, float n, float tiefe) {
  vec2 g = faltSpiegel(p, n);
  float w = atan(g.y, g.x);
  return g * (1.0 - tiefe + tiefe * abs(cos(n * w * 0.5)));
}

// Bluete: der Winkel wird sinusfoermig verzogen, bevor gefaltet wird. Aus
// geraden Kanten werden geschwungene Blaetter.
vec2 faltBluete(vec2 p, float n, float schwung) {
  float r = length(p);
  float w = atan(p.y, p.x);
  w += schwung * sin(w * n);
  float keil = PI / max(1.0, n);
  w = mod(w + keil, 2.0 * keil) - keil;
  return vec2(cos(abs(w)), sin(abs(w))) * r;
}

// Linse: der Radius wird mit einer Potenz umgebogen. Unter eins zieht es die
// Mitte auf und draengt den Rand zusammen - der Blick faellt nach innen.
vec2 faltLinse(vec2 p, float n, float staerke) {
  vec2 g = faltSpiegel(p, n);
  float r = length(g);
  if (r < 1e-20) return g;
  float hoechst = 2.0;
  float t = clamp(r / hoechst, 0.0, 1.0);
  return g * (pow(t, staerke) * hoechst / r);
}

/*
 * Die Weiche.
 *
 * faltArt ist ein Uniform - alle Punkte nehmen denselben Weg, und die
 * Verzweigung kostet nichts. Waere es ein Wert je Bildpunkt, waere genau das
 * hier der teuerste Teil des ganzen Schattierers.
 */
vec2 falten(vec2 p, float n) {
  if (faltArt == 1) return faltDrehung(p, n);
  if (faltArt == 2) return faltDoppelt(p, n);
  if (faltArt == 3) return faltQuadrat(p);
  if (faltArt == 4) return faltWabe(p);
  if (faltArt == 5) return faltSpirale(p, n, faltWert);
  if (faltArt == 6) return faltSpirale(p, n, -faltWert);
  if (faltArt == 7) return faltRinge(p, n, faltWert);
  if (faltArt == 8) return faltRinge(p, n, faltWert);
  if (faltArt == 9) return faltStern(p, n, faltWert);
  if (faltArt == 10) return faltBluete(p, n, faltWert);
  if (faltArt == 11) return faltBluete(p, n, -faltWert);
  if (faltArt == 12) return faltLinse(p, n, faltWert);
  if (faltArt == 13) return faltSpiegel(faltQuadrat(p), n);
  if (faltArt == 14) return faltSpiegel(faltWabe(p), n);
  // Windrad mit Drall: Drehung ohne Spiegelung, aber mit dem Winkelversatz aus
  // dem Logarithmus des Radius. Es dreht sich und schraubt sich zugleich.
  if (faltArt == 15) return faltDrehspirale(p, n, faltWert);
  // Zackenrad: erst der Stern, dann die reine Drehung. Die Zacken bekommen
  // dadurch eine Laufrichtung, die die gespiegelte Fassung nicht hat.
  if (faltArt == 16) return faltDrehung(faltStern(p, n, faltWert), n);
  // Ringe in einer Spirale statt in Kreisen - der Droste-Effekt mit Drall.
  if (faltArt == 17) return faltRinge(faltSpirale(p, n, faltWert), n, 2.2);
  // Bluete in der Linse: geschwungene Blaetter, in die Mitte gezogen.
  if (faltArt == 18) return faltLinse(faltBluete(p, n, faltWert), n, 0.6);
  // Sternringe: Zacken, die sich beim Hineinfahren ineinanderschieben.
  if (faltArt == 19) return faltStern(faltRinge(p, n, faltWert), n, 0.4);
  return faltSpiegel(p, n);
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
   * Der Sprung nach vorn.
   *
   * Statt bei null anzufangen, wird der Abstand nach reiheN Schritten direkt
   * aus der Reihe ausgerechnet - vier komplexe Multiplikationen anstelle von
   * reiheN Iterationen. Die Koeffizienten gelten fuer das ganze Bild und sind
   * auf dem Hauptprozessor entstanden; hier ist nur noch das Einsetzen zu tun.
   */
  if (reiheN > 0) {
    vec2 u = versch / reiheS;
    vec2 u2 = kmal(u, u);
    vec2 u3 = kmal(u2, u);
    vec2 u4 = kmal(u2, u2);
    d = kmal(reiheA, u) + kmal(reiheB, u2) + kmal(reiheC, u3) + kmal(reiheD, u4);
    m = reiheN;
    n = reiheN;
    // Was in den uebersprungenen Schritten fuer Falle und Innenzeichnung
    // angefallen waere. Ohne diese beiden Zahlen saehe das Bild mit
    // Reihenentwicklung anders aus als ohne - und dann liesse sich mit dem
    // Schalter nichts vergleichen.
    naechster = reiheNah;
    kreuz = reiheFalle;
  }
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
  vec4 Z = bahnHolen(m);
  for (int k = n; k < schritte; k++) {
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
      'reiheN', 'reiheS', 'reiheA', 'reiheB', 'reiheC', 'reiheD', 'reiheFalle', 'reiheNah',
      'faltArt', 'faltWert',
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

/* --- Reihenentwicklung ----------------------------------------------------
 *
 * Der eine Gedanke dahinter: Fuer kleine Abstaende ist der Abstand nach n
 * Schritten eine *analytische* Funktion des Startabstands. Man kann ihn also
 * als Potenzreihe schreiben,
 *
 *     d_n = a1*δ + a2*δ² + a3*δ³ + a4*δ⁴,
 *
 * und die Koeffizienten haengen nur von der Bezugsbahn ab - nicht vom
 * einzelnen Bildpunkt. Also einmal je Bild ausrechnen, und danach springt
 * *jeder* Punkt mit vier Multiplikationen ueber n Iterationen hinweg.
 *
 * Die Rekursion folgt aus d' = 2Zd + d² + δ durch Koeffizientenvergleich:
 *
 *     a1' = 2Z a1 + 1
 *     a2' = 2Z a2 + a1²
 *     a3' = 2Z a3 + 2 a1 a2
 *     a4' = 2Z a4 + 2 a1 a3 + a2²
 *
 * Zwei Dinge daran sind nicht offensichtlich.
 *
 * Erstens die Skalierung. Roh gerechnet wachsen die Koeffizienten wie die
 * Ableitung der Iteration, und a4 waere ihre vierte Potenz - bei tiefen Zooms
 * jenseits von 10^38, also ausserhalb dessen, was eine Gleitkommazahl auf der
 * Grafikkarte darstellen kann. Deshalb wird nicht mit δ gerechnet, sondern mit
 * u = δ/s, wobei s der groesste im Bild vorkommende Abstand ist. Damit liegt u
 * in der Einheitsscheibe, und alle vier Koeffizienten bleiben in derselben
 * Groessenordnung wie d selbst, also klein. In der Rekursion aendert sich
 * dadurch nur eine Stelle: aus der 1 bei a1 wird s.
 *
 * Zweitens die Frage, wie weit man springen darf. Eine Faustformel ueber die
 * Groesse des letzten Glieds ist ueblich, aber unzuverlaessig - sie hat den
 * Ruf, bei Miniaturen zu weit zu springen und Zeichnung wegzuputzen. Hier
 * werden stattdessen Probepunkte mitgerechnet: An zwoelf Stellen des Bildes
 * laeuft die *echte* Iteration mit, und verglichen wird Schritt fuer Schritt.
 * Sobald die Reihe an einer dieser Stellen weiter danebenliegt als ein
 * Zwanzigstel Bildpunkt, ist Schluss. Das ist das Verfahren, das in der
 * Literatur zu Recht empfohlen wird: nachrechnen statt schaetzen.
 *
 * Was das Verfahren *nicht* kann: Es springt nur am Anfang der Bahn. Die
 * moderne Antwort darauf heisst bilineare Approximation und springt an jeder
 * Stelle - sie braucht aber eine Tabelle im Speicher der Karte und
 * Koeffizienten, die wieder ueberlaufen. Fuer den Anfang ist die Reihe der
 * bessere Tausch: viel Gewinn, wenig Umbau.
 */

// Vier Glieder. Mehr brauchen mehr Rechnung auf dem Hauptprozessor und
// bringen bei unseren Tiefen wenig; weniger springt spuerbar kuerzer.
const REIHE_GLIEDER = 4;
// So weit darf die Reihe hoechstens springen. Ein Deckel ist noetig, weil die
// Probepunkte sonst bei einem sehr tiefen Zoom Tausende Schritte mitrechnen.
const REIHE_MAX = 8000;
// Wie weit die Reihe danebenliegen darf, in Bildpunkten gemessen. Ein
// Zwanzigstel ist deutlich unter dem, was man sehen koennte.
const REIHE_TOLERANZ_PUNKTE = 0.01;
// Sicherheitsabstand: von der gefundenen Grenze wird ein Zehntel abgezogen.
const REIHE_RUECKHALT = 0.9;

/*
 * Wie oft die Reihe neu gebaut wird.
 *
 * Der Bau ist nicht gratis: Zwoelf Probepunkte laufen ueber Tausende Schritte
 * mit. Nachgemessen kostet das eingelaufen 0,9 bis 3,4 Millisekunden - die
 * ersten Male mehr, weil der Browser den Code erst uebersetzt (gemessen 6,6 ms
 * beim ersten Lauf, 0,3 beim dritten).
 *
 * Bei jedem sechzigsten Bild, also etwa einmal je Sekunde, faellt das unter die
 * vier Prozent verpasster Bilder, auf die der Regler ohnehin zusteuert. Bei
 * jedem zwanzigsten waeren es fuenf Prozent gewesen - dann haette der Bau der
 * Reihe die Bremse zugedreht und ausgerechnet die Aufloesung gekostet, die er
 * einspart.
 *
 * Dass ein alter Wert dazwischen stehenbleibt, macht nichts: Er ist immer zu
 * vorsichtig, nie zu kuehn - siehe die Begruendung beim Umskalieren.
 */
const REIHE_ALLE_BILDER = 60;

let reiheN = 0;
let reiheS = 1;
let reiheZiel = '';
let reiheAlter = 1e9;
let reiheTiefe = -1e9;
let reiheKoeff = new Float32Array(REIHE_GLIEDER * 2);
let reiheFalle = 1e30;
let reiheNah = 1e30;
let reiheStand = '';
let reiheBauMs = 0;
let reiheRunden = 0;

/** Die Reihe fuer den aktuellen Ausschnitt bauen. */
function reiheBauen(spanne, seite, breite, deckel) {
  const begonnen = performance.now();
  reiheN = 0;
  reiheFalle = 1e30;
  reiheNah = 1e30;
  // Der groesste Abstand im Bild: die halbe Diagonale. Das Falten des
  // Mandalas dreht nur den Winkel und aendert die Laenge nicht, die Drehung
  // ebenso - beide koennen hier also ausser Acht bleiben.
  const s = spanne * Math.sqrt(1 + seite * seite);
  reiheS = s;
  if (!bahnDaten || bahnSchritte < 8) return;

  const grenze = Math.min(deckel, REIHE_MAX, bahnSchritte - 2);
  if (grenze < 16) return;

  // Probepunkte: auf dem Rand, wo der Fehler am groessten ist, und ein paar
  // weiter innen. Auf dem Rand ist |u| = 1.
  const proben = [];
  for (let i = 0; i < 8; i++) {
    const w = (i / 8) * 2 * Math.PI;
    proben.push({ ur: Math.cos(w), ui: Math.sin(w) });
  }
  for (let i = 0; i < 4; i++) {
    const w = (i / 4) * 2 * Math.PI + 0.4;
    proben.push({ ur: 0.62 * Math.cos(w), ui: 0.62 * Math.sin(w) });
  }
  /*
   * Die Potenzen von u haengen nur vom Probepunkt ab, nicht vom Schritt - also
   * einmal ausrechnen und nicht in jeder Iteration neu.
   *
   * Das klingt nach einer Kleinigkeit und war der Unterschied zwischen 13 und
   * 2 Millisekunden. Bei zwoelf Probepunkten ueber zweitausend Schritte werden
   * aus "einmal pro Punkt" sonst vierundzwanzigtausend Mal.
   */
  for (const p of proben) {
    p.dr = 0;
    p.di = 0;
    p.raus = false;
    p.u2r = p.ur * p.ur - p.ui * p.ui;
    p.u2i = 2 * p.ur * p.ui;
    p.u3r = p.u2r * p.ur - p.u2i * p.ui;
    p.u3i = p.u2r * p.ui + p.u2i * p.ur;
    p.u4r = p.u2r * p.u2r - p.u2i * p.u2i;
    p.u4i = 2 * p.u2r * p.u2i;
    p.vr = s * p.ur;
    p.vi = s * p.ui;
  }

  /*
   * Die Toleranz waechst mit der Iteration - und das ist keine Grosszuegigkeit,
   * sondern die einzige richtige Frage.
   *
   * Zuerst stand hier ein fester Wert: ein Zwanzigstel des Bildpunktabstands,
   * gemessen ganz am Anfang. Das ist zu streng, und zwar zunehmend. Zwei
   * benachbarte Bildpunkte liegen anfangs Δδ auseinander; nach n Schritten
   * liegen ihre Abstaende |a1(n)| * Δδ auseinander, denn a1 ist genau die
   * Ableitung der Iteration nach dem Startpunkt. Der Bildpunktabstand *waechst
   * also mit*, und mit ihm das, was man an Fehler noch nicht sieht.
   *
   * Gegen den Anfangsabstand zu pruefen hiess, spaete Schritte an einem Massstab
   * zu messen, den sie laengst hinter sich gelassen haben. Nachgemessen kostete
   * das bei Tiefe 8 ein Drittel der Sprungweite, bei Tiefe 15 ein Viertel.
   *
   * a1 steckt skaliert in ã1, also ist |a1| = |ã1| / s.
   */
  const punktAbstand = (2 * spanne) / Math.max(1, breite);

  let a1r = 0, a1i = 0, a2r = 0, a2i = 0, a3r = 0, a3i = 0, a4r = 0, a4i = 0;
  let gut = 0;
  let falle = 1e30;
  let nah = 1e30;
  let falleGut = 1e30;
  let nahGut = 1e30;
  let gelaufen = 0;

  for (let n = 0; n < grenze; n++) {
    gelaufen++;
    const zr = bahnDaten[n * 4] + bahnDaten[n * 4 + 1];
    const zi = bahnDaten[n * 4 + 2] + bahnDaten[n * 4 + 3];
    const zr2 = 2 * zr;
    const zi2 = 2 * zi;

    // Die Koeffizienten einen Schritt weiter. Reihenfolge beachten: a4
    // braucht a1..a3 vom vorigen Schritt.
    const n4r = zr2 * a4r - zi2 * a4i + 2 * (a1r * a3r - a1i * a3i) + (a2r * a2r - a2i * a2i);
    const n4i = zr2 * a4i + zi2 * a4r + 2 * (a1r * a3i + a1i * a3r) + 2 * a2r * a2i;
    const n3r = zr2 * a3r - zi2 * a3i + 2 * (a1r * a2r - a1i * a2i);
    const n3i = zr2 * a3i + zi2 * a3r + 2 * (a1r * a2i + a1i * a2r);
    const n2r = zr2 * a2r - zi2 * a2i + (a1r * a1r - a1i * a1i);
    const n2i = zr2 * a2i + zi2 * a2r + 2 * a1r * a1i;
    const n1r = zr2 * a1r - zi2 * a1i + s;
    const n1i = zr2 * a1i + zi2 * a1r;
    a1r = n1r; a1i = n1i; a2r = n2r; a2i = n2i;
    a3r = n3r; a3i = n3i; a4r = n4r; a4i = n4i;

    // Die Probepunkte einen echten Schritt weiter, mit derselben Rechnung wie
    // im Schattierer.
    // Der naechste Bahnpunkt - einmal gelesen, nicht je Probepunkt.
    const nr = bahnDaten[(n + 1) * 4] + bahnDaten[(n + 1) * 4 + 1];
    const ni = bahnDaten[(n + 1) * 4 + 2] + bahnDaten[(n + 1) * 4 + 3];

    // Verglichen wird im Quadrat: Eine Wurzel je Probepunkt und Schritt waere
    // in dieser Schleife einer der teuersten Einzelposten.
    const toleranz = REIHE_TOLERANZ_PUNKTE * punktAbstand * (Math.hypot(a1r, a1i) / s);
    const toleranz2 = toleranz * toleranz;

    let zuWeit = false;
    let alleRaus = true;
    for (const p of proben) {
      if (p.raus) continue;
      alleRaus = false;
      const dr = p.dr, di = p.di;
      p.dr = zr2 * dr - zi2 * di + (dr * dr - di * di) + p.vr;
      p.di = zr2 * di + zi2 * dr + 2 * dr * di + p.vi;

      const pr = nr + p.dr, pi = ni + p.di;
      const r2 = pr * pr + pi * pi;
      // Entkommen oder neu ansetzen - dort endet die Gueltigkeit ohnehin.
      if (r2 > 65536 || r2 < p.dr * p.dr + p.di * p.di) p.raus = true;

      // Und was die Reihe an dieser Stelle sagt.
      const sr =
        a1r * p.ur - a1i * p.ui + (a2r * p.u2r - a2i * p.u2i) +
        (a3r * p.u3r - a3i * p.u3i) + (a4r * p.u4r - a4i * p.u4i);
      const si =
        a1r * p.ui + a1i * p.ur + (a2r * p.u2i + a2i * p.u2r) +
        (a3r * p.u3i + a3i * p.u3r) + (a4r * p.u4i + a4i * p.u4r);
      const fr = sr - p.dr, fi = si - p.di;
      if (fr * fr + fi * fi > toleranz2) zuWeit = true;
    }

    /*
     * Falle und Innenzeichnung fuer die uebersprungenen Schritte.
     *
     * In diesem Bereich ist der Abstand winzig - das ist ja die Bedingung,
     * unter der die Reihe ueberhaupt gilt. Also ist der Punkt praktisch die
     * Bezugsbahn selbst, und beides ist fuer alle Bildpunkte dieselbe Zahl.
     * Ohne diesen Nachtrag saehe das Bild mit Reihe anders aus als ohne, und
     * der Schalter waere zum Vergleichen unbrauchbar.
     */
    falle = Math.min(falle, Math.min(Math.abs(nr), Math.abs(ni)));
    nah = Math.min(nah, nr * nr + ni * ni);

    if (alleRaus || zuWeit) break;
    gut = n + 1;
    falleGut = falle;
    nahGut = nah;
    reiheKoeff[0] = a1r; reiheKoeff[1] = a1i;
    reiheKoeff[2] = a2r; reiheKoeff[3] = a2i;
    reiheKoeff[4] = a3r; reiheKoeff[5] = a3i;
    reiheKoeff[6] = a4r; reiheKoeff[7] = a4i;
  }

  /*
   * Der Rueckhalt.
   *
   * Die Probepunkte sind zwoelf Stellen von Hunderttausenden. Irgendwo im Bild
   * liegt die Reihe frueher daneben als an jeder von ihnen - deshalb wird von
   * der gefundenen Grenze ein Zehntel abgezogen. Das kostet wenig Sprung und
   * nimmt der Sache die Spitze.
   *
   * Die Koeffizienten muessen dann noch einmal bis zu dieser kleineren Grenze
   * gerechnet werden; das ist billig gegen die Probepunkte.
   */
  const ziel = Math.floor(gut * REIHE_RUECKHALT);
  if (ziel < 24) {
    reiheN = 0;
    reiheStand = gut > 0 ? `nur ${gut} Schritte moeglich - lohnt nicht` : 'keine gueltige Reihe';
    return;
  }
  if (ziel < gut) {
    a1r = 0; a1i = 0; a2r = 0; a2i = 0; a3r = 0; a3i = 0; a4r = 0; a4i = 0;
    falleGut = 1e30;
    nahGut = 1e30;
    for (let n = 0; n < ziel; n++) {
      const zr = bahnDaten[n * 4] + bahnDaten[n * 4 + 1];
      const zi = bahnDaten[n * 4 + 2] + bahnDaten[n * 4 + 3];
      const zr2 = 2 * zr, zi2 = 2 * zi;
      const n4r = zr2 * a4r - zi2 * a4i + 2 * (a1r * a3r - a1i * a3i) + (a2r * a2r - a2i * a2i);
      const n4i = zr2 * a4i + zi2 * a4r + 2 * (a1r * a3i + a1i * a3r) + 2 * a2r * a2i;
      const n3r = zr2 * a3r - zi2 * a3i + 2 * (a1r * a2r - a1i * a2i);
      const n3i = zr2 * a3i + zi2 * a3r + 2 * (a1r * a2i + a1i * a2r);
      const n2r = zr2 * a2r - zi2 * a2i + (a1r * a1r - a1i * a1i);
      const n2i = zr2 * a2i + zi2 * a2r + 2 * a1r * a1i;
      const n1r = zr2 * a1r - zi2 * a1i + s;
      const n1i = zr2 * a1i + zi2 * a1r;
      a1r = n1r; a1i = n1i; a2r = n2r; a2i = n2i;
      a3r = n3r; a3i = n3i; a4r = n4r; a4i = n4i;
      const nr = bahnDaten[(n + 1) * 4] + bahnDaten[(n + 1) * 4 + 1];
      const ni = bahnDaten[(n + 1) * 4 + 2] + bahnDaten[(n + 1) * 4 + 3];
      falleGut = Math.min(falleGut, Math.min(Math.abs(nr), Math.abs(ni)));
      nahGut = Math.min(nahGut, nr * nr + ni * ni);
    }
    reiheKoeff[0] = a1r; reiheKoeff[1] = a1i;
    reiheKoeff[2] = a2r; reiheKoeff[3] = a2i;
    reiheKoeff[4] = a3r; reiheKoeff[5] = a3i;
    reiheKoeff[6] = a4r; reiheKoeff[7] = a4i;
  }

  reiheN = ziel;
  reiheFalle = falleGut;
  reiheNah = nahGut;
  reiheBauMs = performance.now() - begonnen;
  reiheRunden = gelaufen;
  reiheStand = `${ziel} von ${grenze} Schritten uebersprungen`;
}

/** Was die Reihe zuletzt gebracht hat - fuer die Technikanzeige. */
export function reiheAuskunft() {
  return { n: reiheN, stand: reiheStand, glieder: REIHE_GLIEDER, bauMs: reiheBauMs, runden: reiheRunden };
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
  gl.uniform1i(orte.faltArt, lage.faltArt ?? 0);
  gl.uniform1f(orte.faltWert, lage.faltWert ?? 0.5);
  gl.uniform1f(orte.fangAnteil, fangAnteil ?? 0);

  /*
   * Die Reihe wird nicht in jedem Bild neu gebaut.
   *
   * Die zwoelf Probepunkte rechnen bis zu achttausend Schritte mit - das sind
   * hunderttausend Iterationen auf dem Hauptprozessor, in jedem Bild waere das
   * teurer als das, was es einspart.
   *
   * Dazwischen wird nur umskaliert, und das ist exakt: Die Koeffizienten sind
   * mit u = δ/s gerechnet, und ein anderes s heisst schlicht Faktor (s'/s)^k
   * je Glied. Auch die Sprungweite bleibt gueltig, denn wir zoomen immer nur
   * hinein - kleineres s heisst kleinere Abstaende, und die Reihe traegt dann
   * eher weiter als kuerzer. Ein alter Wert ist also zu vorsichtig, nie zu
   * kuehn.
   */
  const spanneJetzt = 1.6 / Math.pow(10, tiefe);
  const seiteJetzt = h / b;
  const reiheAn = lage.reihe !== false;
  if (!reiheAn) {
    reiheN = 0;
    reiheStand = 'abgeschaltet';
    // Merken, dass nichts Gueltiges dasteht. Ohne das lieferte der Schalter
    // beim Wiedereinschalten weiter null Spruenge, bis die zwanzig Bilder um
    // waren - und in der Abnahme sah es aus, als koennte die Reihe gar nichts.
    reiheZiel = '';
  } else if (
    bahnZiel !== reiheZiel ||
    reiheAlter >= REIHE_ALLE_BILDER ||
    // Ein Sprung in der Tiefe - beim Stellenwechsel oder beim Drop. Dann passt
    // die alte Sprungweite nicht mehr zur Lage.
    Math.abs(tiefe - reiheTiefe) > 0.5
  ) {
    reiheBauen(spanneJetzt, seiteJetzt, b, schritte);
    reiheZiel = bahnZiel;
    reiheTiefe = tiefe;
    reiheAlter = 0;
  } else {
    reiheAlter++;
  }

  if (reiheN > 0) {
    const sJetzt = spanneJetzt * Math.sqrt(1 + seiteJetzt * seiteJetzt);
    let faktor = sJetzt / reiheS;
    gl.uniform1i(orte.reiheN, reiheN);
    gl.uniform1f(orte.reiheS, sJetzt);
    for (const [ort, k] of [[orte.reiheA, 0], [orte.reiheB, 1], [orte.reiheC, 2], [orte.reiheD, 3]]) {
      gl.uniform2f(ort, reiheKoeff[k * 2] * faktor, reiheKoeff[k * 2 + 1] * faktor);
      faktor *= sJetzt / reiheS;
    }
    gl.uniform1f(orte.reiheFalle, reiheFalle);
    gl.uniform1f(orte.reiheNah, reiheNah);
  } else {
    gl.uniform1i(orte.reiheN, 0);
    gl.uniform1f(orte.reiheS, 1);
  }

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
  rohGpuMs = ms;
  // Traege glaetten, sonst zappelt die Anzeige unlesbar.
  letzteGpuMs = letzteGpuMs === null ? ms : letzteGpuMs * 0.8 + ms * 0.2;
}

/** Die zuletzt gemessene reine Rechenzeit der Grafikkarte, oder null. */
export function gpuZeitMs() {
  return letzteGpuMs;
}

/*
 * Dasselbe, aber ungeglaettet - fuer den Messstand.
 *
 * Die Anzeige auf der Buehne braucht eine ruhige Zahl, deshalb laeuft
 * letzteGpuMs durch einen Tiefpass. Eine Messreihe braucht das Gegenteil: Wer
 * glaettet, mischt die vorige Messung in die naechste, und bei einem Wechsel
 * von Mandala oder Tiefe stehen dann fuenf Bilder lang beide Werte
 * uebereinander. Genau so entstehen Messreihen, die einen sanften Anstieg
 * zeigen, wo in Wirklichkeit ein Sprung ist.
 *
 * Der Zaehler kommt mit, damit der Aufrufer sieht, ob ueberhaupt eine neue
 * Messung vorliegt - die Uhr misst nicht jedes Bild.
 */
let rohGpuMs = null;
export function gpuZeitRoh() {
  return { ms: rohGpuMs, messungen: uhrGemessen, uhrDa: Boolean(uhrExt) };
}

/*
 * Warten, bis die Karte wirklich fertig ist.
 *
 * Ohne das misst eine Stoppuhr um drawArrays nur, wie lange das Einreihen in
 * die Warteschlange dauert - ein paar Mikrosekunden, voellig unabhaengig
 * davon, wie schwer das Bild war. gl.finish() waere der naheliegende Griff,
 * ist aber in mehreren Browsern ein Vorschlag und keine Zusage.
 *
 * Ein Lesezugriff dagegen kann nicht anders: Der Browser muss das Ergebnis
 * herausgeben, also muss er es vorher fertigrechnen. Ein einziger Bildpunkt
 * reicht dafuer, und der kostet nichts.
 *
 * Das ist der Weg, auf dem der Messstand auch auf dem iPad und dem iPhone
 * zu Zahlen kommt: Safari gibt die Zeitmess-Erweiterung nicht heraus, und
 * ohne sie waere dort sonst gar nichts zu messen.
 */
export function gpuAbwarten() {
  if (!gl) return;
  const punkt = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, punkt);
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
