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

const GRUNDLAGE = `#version 300 es
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
/*
 * Innenerkennung an/aus, und wie genau. Beides Uniform - siehe die
 * Begruendung an der Schleife.
 *
 * Die Schranke ist kein frei gewaehlter Wert: Der volle Wert z liegt in der
 * Groessenordnung eins und wird in einfacher Genauigkeit gebildet, also
 * unterscheidbar bis etwa 1e-7. Eine Schranke darunter faende nichts, eine
 * viel groessere hielte Punkte fuer geschlossen, die noch wandern. 1e-12 als
 * Quadrat entspricht 1e-6 im Abstand - eine Zehnerpotenz ueber dem Rauschen.
 */
uniform int   innenPruefen;
uniform float innenEps;
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

/*
 * Der Rechenteil, ausgeloest aus main().
 *
 * Zurueck kommt nicht die Farbe, sondern das, was das Fraktal ueber diesen
 * Punkt weiss: die geglaettete Ausstiegszeit, die Bahnfalle, die groesste
 * Annaeherung an den Ursprung und ob der Punkt ueberhaupt entkommen ist.
 *
 * Die Trennung ist der ganze Zweck: Die Rechnung ist teuer und aendert sich
 * langsam, die Farbe ist billig und aendert sich mit jedem Schlag. Wer beides
 * in einem Zug macht, muss die teure Haelfte so oft wiederholen wie die
 * billige. Getrennt laesst sich die teure seltener machen, ohne dass die
 * Musik im Bild etwas davon merkt - siehe das Schachbrett weiter unten.
 *
 * punktXY ist die Stelle im gerechneten Bild, in Bildpunkten. Frueher stand
 * dort gl_FragCoord.xy; als Parameter kann der Schachbrettdurchgang eine
 * andere Stelle einsetzen als die, an der er gerade zeichnet.
 */
vec4 rechnen(vec2 punktXY) {
  vec2 bild = (punktXY / feld) * 2.0 - 1.0;
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
  /*
   * Innenerkennung: aufhoeren, wenn die Bahn sich wiederholt.
   *
   * Der Anlass ist eine Messung. Bei Tiefe 6 lagen zweiundfuenfzig Prozent
   * der Bildpunkte *innerhalb* der Menge, und die entkommen nie - sie laufen
   * jeden Schritt bis zum Deckel und ergeben am Ende eine flache Farbe.
   * Zusammengerechnet: an solchen Stellen stecken drei Viertel der ganzen
   * Rechenzeit in Punkten, die nichts zeichnen. Auf dem iPad war das die
   * teuerste Zeile der ganzen Tabelle.
   *
   * Ein Punkt im Inneren laeuft in einen anziehenden Zyklus. Trifft die Bahn
   * einen Wert, den sie schon hatte, wiederholt sie sich von da an fuer immer
   * - weiterrechnen aendert nichts mehr. Gemerkt wird nach Brents Verfahren:
   * ein einzelner Wert, in immer groesseren Abstaenden aufgefrischt. Das
   * findet jeden Zyklus, dessen Periode in den Abstand passt, und braucht
   * genau einen Wert Speicher.
   *
   * Billig ist es, weil der volle Wert z ohnehin schon in jedem Schritt
   * gebildet wird - fuer die Austrittspruefung. Dazu kommen eine Subtraktion,
   * ein Skalarprodukt und ein Vergleich.
   *
   * Und es haengt an einem Uniform: Wo nichts im Inneren liegt, ist die
   * Verzweigung fuer alle Punkte gleich und kostet nichts. Die Buehne
   * schaltet sie ein, wenn die Stichprobe genug Innenflaeche meldet.
   *
   * Zur Farbe: Die Innenflaeche wird danach gefaerbt, wie nah die Bahn dem
   * Ursprung gekommen ist. Frueher auszusteigen duerfte das nicht aendern -
   * und tut es nicht, denn zwischen dem Merken und dem Treffer ist der Zyklus
   * mindestens einmal ganz durchlaufen. Was danach kaeme, waeren dieselben
   * Werte noch einmal. Nachgemessen wird es trotzdem, nicht geglaubt.
   */
  vec2 zMerk = vec2(1e20);
  int merkBei = n + 8;

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
    if (innenPruefen == 1) {
      // Erst vergleichen, dann merken - sonst trifft der gerade gemerkte
      // Wert sich selbst und jeder Punkt gaelte als innen.
      vec2 ab = z - zMerk;
      if (dot(ab, ab) < innenEps) break;
      if (n >= merkBei) { zMerk = z; merkBei = n * 2; }
    }
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

  /*
   * Statt einer Farbe kommt hier der Befund heraus. Die geglaettete
   * Ausstiegszeit steckt in x, die Bahnfalle in y, die groesste Annaeherung
   * in z, und w sagt, ob der Punkt entkommen ist.
   */
  float muRaus = raus > 0.0 ? float(n) + 1.0 - log2(log2(sqrt(raus))) : 0.0;
  return vec4(muRaus, kreuz, naechster, raus > 0.0 ? 1.0 : 0.0);
}

/*
 * Aus dem Befund eine Farbe machen.
 *
 * Billig - ein paar Rechenschritte und ein Nachschlagen in der Farbtabelle.
 * Genau deshalb steht das hier getrennt: Dieser Teil laeuft in *jedem* Bild
 * und fuer *jeden* Punkt, auch wenn die Rechnung darueber uebersprungen
 * wurde. Palette, Farbversatz und Drop-Welle bleiben damit vollstaendig
 * lebendig, egal wie selten das Fraktal selbst neu gerechnet wird.
 */
vec3 faerben(vec4 w) {
  float kreuz = w.y;
  float naechster = w.z;
  vec3 farbe;
  if (w.w > 0.5) {
    float mu = w.x;
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
  return farbe;
}
`;

/*
 * Der bisherige Weg: rechnen und faerben in einem Zug, ein Bildpunkt je
 * Bildpunkt. Bleibt die Vorgabe und der Massstab, an dem sich alles andere
 * messen lassen muss.
 */
const PUNKTE = GRUNDLAGE + `
out vec4 ergebnis;
void main() {
  ergebnis = vec4(faerben(rechnen(gl_FragCoord.xy)), 1.0);
}
`;

/* --- Das Schachbrett ------------------------------------------------------
 *
 * Der Trick, mit dem die PS4 Pro ihre vier K gemacht hat, und er passt hier
 * besser als dort.
 *
 * Gerechnet wird nur die Haelfte der Bildpunkte - die schwarzen Felder eines
 * Schachbretts. Im naechsten Bild die weissen. Die jeweils fehlende Haelfte
 * wird aus den vier Nachbarn ergaenzt, und das ist der Punkt: Auf einem
 * Schachbrett sind *alle vier* Nachbarn eines fehlenden Feldes gerechnet.
 * Nicht drei, nicht zwei - vier. Deshalb braucht die Ergaenzung kein
 * Vorbild aus dem letzten Bild, keine Bewegungsvektoren und keine
 * Ausnahmebehandlung fuer neu aufgedeckte Stellen. Sie kann nicht
 * nachziehen, weil sie nichts Altes anfasst.
 *
 * Warum es hier besonders gut passt: Zwischengespeichert wird nicht die
 * *Farbe*, sondern die Ausstiegszeit. Die Farbe entsteht daraus in jedem
 * Bild neu. Palette, Farbversatz, Bahnfalle und die Drop-Welle laufen also
 * ungebremst weiter und sitzen auf dem Schlag - halbiert wird allein die
 * Geometrie, und die aendert sich zwischen zwei Bildern ohnehin kaum.
 *
 * Und der Grund, warum es ueberhaupt etwas spart: Ein "if" ueber die Parität
 * im vollen Bild wuerde *nichts* bringen. Auf einer Grafikkarte laufen
 * benachbarte Punkte in einer Gruppe im Gleichschritt; nehmen die einen den
 * einen Zweig und die anderen den anderen, kostet die Gruppe die Summe
 * beider. Deshalb wird in einen halb so breiten Puffer gezeichnet, in dem
 * jeder Punkt echte Arbeit hat, und die Stelle im vollen Bild erst daraus
 * ausgerechnet.
 */

/*
 * Durchgang 1: nur rechnen, in den halb breiten Puffer.
 *
 * Aus der Spalte hx und der Zeile py wird die Stelle im vollen Bild:
 *   px = 2*hx + ((py + versatzBrett) mod 2)
 * Damit liegt jede gerechnete Stelle auf einem Feld gleicher Farbe, und der
 * Wechsel von Bild zu Bild ist ein Wechsel von versatzBrett zwischen 0 und 1.
 */
const HALBBILD = GRUNDLAGE + `
uniform int versatzBrett;
out vec4 ergebnis;
void main() {
  int hx = int(gl_FragCoord.x);
  int py = int(gl_FragCoord.y);
  int px = 2 * hx + ((py + versatzBrett) & 1);
  ergebnis = rechnen(vec2(float(px) + 0.5, float(py) + 0.5));
}
`;

/*
 * Durchgang 2: aus dem halben Puffer das ganze Bild.
 *
 * Wer selbst gerechnet wurde, liest seinen eigenen Wert. Wer nicht, mittelt
 * seine vier Nachbarn - aber nur die, die auf derselben Seite stehen: Ein
 * Punkt innerhalb der Menge und einer ausserhalb haben keine gemeinsame
 * Zwischenstufe, und ein Mittel aus beiden waere eine Farbe, die es an
 * dieser Stelle nicht gibt. Also entscheidet die Mehrheit, und gemittelt
 * wird nur innerhalb davon.
 */
const AUFLOESEN = GRUNDLAGE + `
uniform sampler2D halbbild;
uniform int versatzBrett;
out vec4 ergebnis;

vec4 halbHolen(int px, int py) {
  int hx = (px - ((py + versatzBrett) & 1)) >> 1;
  ivec2 gr = textureSize(halbbild, 0);
  return texelFetch(halbbild, ivec2(clamp(hx, 0, gr.x - 1), clamp(py, 0, gr.y - 1)), 0);
}

void main() {
  int px = int(gl_FragCoord.x);
  int py = int(gl_FragCoord.y);
  if (((px + py + versatzBrett) & 1) == 0) {
    // Selbst gerechnet - nichts zu ergaenzen.
    ergebnis = vec4(faerben(halbHolen(px, py)), 1.0);
    return;
  }
  vec4 a = halbHolen(px - 1, py);
  vec4 b = halbHolen(px + 1, py);
  vec4 c = halbHolen(px, py - 1);
  vec4 d = halbHolen(px, py + 1);
  float drin = a.w + b.w + c.w + d.w;
  // Mehrheit: Bei zwei zu zwei zaehlt "entkommen" - eine Flaeche, die
  // faelschlich Farbe bekommt, faellt weniger auf als ein Loch im Muster.
  float seite = drin >= 2.0 ? 1.0 : 0.0;
  vec4 summe = vec4(0.0);
  float zahl = 0.0;
  if (a.w == seite) { summe += a; zahl += 1.0; }
  if (b.w == seite) { summe += b; zahl += 1.0; }
  if (c.w == seite) { summe += c; zahl += 1.0; }
  if (d.w == seite) { summe += d; zahl += 1.0; }
  vec4 w = zahl > 0.0 ? summe / zahl : a;
  w.w = seite;
  ergebnis = vec4(faerben(w), 1.0);
}
`;

// --- Der Zustand -----------------------------------------------------------

let leinwand = null;
let gl = null;
let programm = null;
let orte = null;
// Die beiden Schachbrett-Durchgaenge und ihr Puffer. Alle vier bleiben null,
// wenn die Karte keine Gleitkomma-Ziele kann - dann laeuft der bisherige Weg
// weiter, und niemand merkt etwas.
let programmHalb = null;
let orteHalb = null;
let programmLoesen = null;
let orteLoesen = null;
let brettRahmen = null;
let brettTextur = null;
let brettBreite = 0;
let brettHoehe = 0;
let brettMoeglich = false;
// RGBA32F oder RGBA16F - was die Karte als Ziel wirklich annimmt.
let brettFormat = 0;
// Ob der erste Durchgang nachweislich etwas geschrieben hat.
let brettGeprueft = false;
let brettVersatz = 0;
// Der Mittelwert der Farbtabelle - siehe gpuFarben().
let mittelR = 0.5;
let mittelG = 0.5;
let mittelB = 0.5;
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

/*
 * Ein Programm bauen. Der Platz wird fest auf 0 gebunden, damit alle
 * Programme denselben Eckenpuffer benutzen koennen, ohne ihn umzustellen.
 */
function programmBauen(quelle) {
  const p = gl.createProgram();
  gl.attachShader(p, schattiererBauen(ECKEN, gl.VERTEX_SHADER));
  gl.attachShader(p, schattiererBauen(quelle, gl.FRAGMENT_SHADER));
  gl.bindAttribLocation(p, 0, 'platz');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`Verbinden: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

// Alle Uniforms, die es geben kann. Ein Programm, das eines davon nicht
// benutzt, liefert null - das schadet nicht, gl.uniform* mit null ist ein
// erlaubtes Nichtstun.
const UNIFORMS = [
  'bahn', 'farben', 'feld', 'spanne', 'seite', 'dreh',
  'schritte', 'bahnBreite', 'bahnLaenge', 'versatz', 'dichte', 'innenHell', 'mittelFarbe',
  'welle', 'welleZeit', 'mandala', 'sterne', 'fangAnteil',
  'reiheN', 'reiheS', 'reiheA', 'reiheB', 'reiheC', 'reiheD', 'reiheFalle', 'reiheNah',
  'faltArt', 'faltWert', 'innenPruefen', 'innenEps',
  'versatzBrett', 'halbbild',
];

function orteHolen(p) {
  const o = {};
  for (const name of UNIFORMS) o[name] = gl.getUniformLocation(p, name);
  return o;
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

    programm = programmBauen(PUNKTE);
    gl.useProgram(programm);

    // Zwei Dreiecke, die das ganze Bild ausfuellen.
    const puffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, puffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    // Der Platz ist in allen drei Programmen auf 0 gebunden (siehe
    // programmBauen), also gilt dieselbe Einstellung fuer alle.
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    orte = orteHolen(programm);

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

    /*
     * Ob das Schachbrett moeglich waere, wird hier nur *gefragt* - gebaut
     * wird es erst, wenn es jemand einschaltet. Siehe brettBereit().
     */
    brettMoeglich = !!gl.getExtension('EXT_color_buffer_float');
    return true;
  } catch (fehler) {
    if (typeof console !== 'undefined') {
      console.warn('Mandelbrot auf der Grafikkarte nicht moeglich:', fehler.message);
    }
    gl = null;
    return false;
  }
}

/*
 * Die beiden Schachbrett-Programme - erst beim ersten Einschalten gebaut.
 *
 * Das war ein Fehler mit Ansage, und er ist auf einem iPhone aufgeschlagen:
 * Zuerst wurden alle drei Programme beim Start uebersetzt. Jedes davon
 * enthaelt die volle Iterationsschleife, und ein Uebersetzer baut daraus
 * jeweils ein eigenes Maschinenprogramm - dreimal derselbe schwere Klotz,
 * zwei davon fuer eine Einstellung, die ausgeschaltet ist. Auf dem Telefon
 * hat die Seite das mit "wiederholt ein Problem aufgetreten" quittiert, also
 * mit dem Speicher.
 *
 * Jetzt kostet ein ausgeschaltetes Schachbrett genau nichts: einen
 * getExtension-Aufruf beim Start und eine Abfrage je Bild. Gebaut wird beim
 * ersten Einschalten, und wenn dabei etwas schiefgeht, bleibt es aus - der
 * bisherige Weg laeuft weiter, statt dass die Seite stirbt.
 */
function brettBereit() {
  if (!brettMoeglich) return false;
  if (programmLoesen) return true;
  try {
    programmHalb = programmBauen(HALBBILD);
    orteHalb = orteHolen(programmHalb);
    gl.useProgram(programmHalb);
    gl.uniform1i(orteHalb.bahn, 0);

    const geloest = programmBauen(AUFLOESEN);
    orteLoesen = orteHolen(geloest);
    gl.useProgram(geloest);
    gl.uniform1i(orteLoesen.bahn, 0);
    gl.uniform1i(orteLoesen.farben, 1);
    gl.uniform1i(orteLoesen.halbbild, 2);

    brettRahmen = gl.createFramebuffer();
    brettTextur = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, brettTextur);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    /*
     * Kann die Karte in dieses Format ueberhaupt *hineinzeichnen*?
     *
     * Das war der Fehler, und er ist auf dem iPad aufgeschlagen: Das ganze
     * Bild wurde eine flache Farbflaeche, vom Mandala war nichts mehr zu
     * sehen. Genau so sieht es aus, wenn der halbe Puffer leer bleibt - der
     * Aufloesedurchgang liest dann ueberall Nullen, haelt jeden Punkt fuer
     * einen Innenpunkt und faerbt ihn mit der ersten Farbe der Palette.
     *
     * Der Grund: EXT_color_buffer_float *vorhanden* heisst nicht RGBA32F
     * *bezeichenbar*. Die Erweiterung meldet sich auf Geraeten, auf denen der
     * Rahmenpuffer mit einem 32-Bit-Gleitkommaziel unvollstaendig bleibt -
     * und ein unvollstaendiger Rahmenpuffer zeichnet still gar nichts. Ich
     * habe die Erweiterung abgefragt und den Rahmenpuffer nicht.
     *
     * Also wird gefragt, und zwar mit einer Ausweichstufe: RGBA16F traegt
     * unsere Zahlen auch. Die Ausstiegszeit geht bis rund zwoelftausend und
     * passt damit bequem in ein halbes Gleitkomma; die Schrittweite dort ist
     * acht, was nach der Wurzelkennlinie einen Farbschritt von drei
     * Zehntausendstel eines Bandes ergibt - unsichtbar.
     */
    let format = null;
    for (const versuch of [gl.RGBA32F, gl.RGBA16F]) {
      gl.texImage2D(gl.TEXTURE_2D, 0, versuch, 8, 8, 0, gl.RGBA, gl.FLOAT, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, brettRahmen);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, brettTextur, 0);
      const stand = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (stand === gl.FRAMEBUFFER_COMPLETE) { format = versuch; break; }
    }
    if (format === null) {
      throw new Error('kein Gleitkomma-Rahmenpuffer - Schachbrett nicht moeglich');
    }
    brettFormat = format;
    // Zuletzt, damit ein Abbruch mittendrin nicht als "fertig" gilt.
    programmLoesen = geloest;
    gl.useProgram(programm);
    return true;
  } catch (fehler) {
    if (typeof console !== 'undefined') {
      console.warn('Schachbrett nicht moeglich:', fehler.message);
    }
    brettMoeglich = false;
    programmHalb = null;
    programmLoesen = null;
    brettGeprueft = false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(programm);
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
  /*
   * Der Mittelwert wird gemerkt statt nur gesetzt.
   *
   * Seit es drei Programme gibt, kann eine Zahl nicht mehr einmal irgendwo
   * hineingeschrieben werden und dann fuer alle gelten. Also liegt sie hier
   * und wird bei jedem Bild in das Programm geschrieben, das gerade dran ist.
   */
  mittelR = sr / n / 255;
  mittelG = sg / n / 255;
  mittelB = sb / n / 255;
  gl.useProgram(programm);
  gl.uniform3f(orte.mittelFarbe, mittelR, mittelG, mittelB);
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

  /*
   * Die Werte fuer *ein* Programm setzen.
   *
   * Bis zum Schachbrett gab es nur eines, und die Zuweisungen standen frei im
   * Ablauf. Jetzt sind es bis zu drei, und Uniforms gehoeren in WebGL zum
   * Programm, nicht zum Zusammenhang - dieselbe Zahl muss also in jedes
   * einzeln geschrieben werden. Als Funktion steht sie einmal da; jede
   * andere Loesung waere dieselbe Liste zweimal, und die eine wuerde
   * irgendwann von der anderen abweichen.
   *
   * Was ein Programm nicht benutzt, hat keinen Ort - gl.uniform* mit null ist
   * ein erlaubtes Nichtstun. Deshalb bekommt jedes Programm dieselbe volle
   * Liste, und der Uebersetzer entscheidet, was davon ankommt.
   */
  const grundSetzen = (o) => {
    gl.uniform2f(o.feld, b, h);
    gl.uniform1f(o.spanne, 1.6 / Math.pow(10, tiefe));
    gl.uniform1f(o.seite, h / b);
    gl.uniform1f(o.dreh, dreh);
    gl.uniform1i(o.schritte, schritte);
    gl.uniform1i(o.bahnBreite, bahnBreite);
    gl.uniform1i(o.bahnLaenge, Math.max(2, bahnSchritte));
    gl.uniform1f(o.versatz, versatz);
    gl.uniform1f(o.dichte, dichte);
    gl.uniform1f(o.innenHell, innenHell);
    gl.uniform1f(o.welle, welle ?? 0);
    gl.uniform1f(o.welleZeit, welleZeit ?? 0);
    gl.uniform1f(o.mandala, mandala ?? 0);
    gl.uniform1f(o.sterne, sterne ?? 6);
    gl.uniform1i(o.faltArt, lage.faltArt ?? 0);
    gl.uniform1f(o.faltWert, lage.faltWert ?? 0.5);
    gl.uniform1i(o.innenPruefen, lage.innenPruefen ? 1 : 0);
    gl.uniform1f(o.innenEps, lage.innenEps ?? 1e-12);
    gl.uniform1f(o.fangAnteil, fangAnteil ?? 0);
    gl.uniform3f(o.mittelFarbe, mittelR, mittelG, mittelB);
  };
  gl.useProgram(programm);
  gl.viewport(0, 0, b, h);
  grundSetzen(orte);

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

  const reiheSetzen = (o) => {
    if (reiheN > 0) {
      const sJetzt = spanneJetzt * Math.sqrt(1 + seiteJetzt * seiteJetzt);
      let faktor = sJetzt / reiheS;
      gl.uniform1i(o.reiheN, reiheN);
      gl.uniform1f(o.reiheS, sJetzt);
      for (const [ort, k] of [[o.reiheA, 0], [o.reiheB, 1], [o.reiheC, 2], [o.reiheD, 3]]) {
        gl.uniform2f(ort, reiheKoeff[k * 2] * faktor, reiheKoeff[k * 2 + 1] * faktor);
        faktor *= sJetzt / reiheS;
      }
      gl.uniform1f(o.reiheFalle, reiheFalle);
      gl.uniform1f(o.reiheNah, reiheNah);
    } else {
      gl.uniform1i(o.reiheN, 0);
      gl.uniform1f(o.reiheS, 1);
    }
  };
  reiheSetzen(orte);

  /*
   * Und jetzt zeichnen - auf einem von zwei Wegen.
   *
   * Der bisherige: ein Durchgang, jeder Bildpunkt rechnet und faerbt sich
   * selbst.
   *
   * Das Schachbrett: zwei Durchgaenge. Der erste rechnet die halbe Anzahl
   * Punkte in einen halb so breiten Gleitkommapuffer, der zweite macht daraus
   * das ganze Bild. Der zweite ist billig - ein paar Texturzugriffe und die
   * Farbtabelle -, der erste kostet die Haelfte von vorher.
   *
   * Der Wechsel der Parität steht *vor* dem Zeichnen und nicht danach: So
   * gehoert die Zahl, die im Puffer steht, sichtbar zu dem Bild, das gerade
   * entsteht, und nicht zum vorigen.
   */
  const brettAn = lage.schachbrett === true && brettBereit();
  if (!brettAn) {
    uhrStarten();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    uhrStoppen();
    return { leinwand, breite: b, hoehe: h, bahnSchritte, bahnMs, gpuMs: letzteGpuMs, brett: false, punkte: b * h };
  }

  const hb = Math.ceil(b / 2);
  if (brettBreite !== hb || brettHoehe !== h) {
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, brettTextur);
    gl.texImage2D(gl.TEXTURE_2D, 0, brettFormat, hb, h, 0, gl.RGBA, gl.FLOAT, null);
    brettBreite = hb;
    brettHoehe = h;
  }
  brettVersatz = brettVersatz ^ 1;

  uhrStarten();
  // Durchgang 1: die halbe Anzahl Punkte, nur rechnen.
  gl.useProgram(programmHalb);
  grundSetzen(orteHalb);
  reiheSetzen(orteHalb);
  gl.uniform1i(orteHalb.versatzBrett, brettVersatz);
  gl.bindFramebuffer(gl.FRAMEBUFFER, brettRahmen);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, brettTextur, 0);
  gl.viewport(0, 0, hb, h);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  /*
   * Einmal nachsehen, ob wirklich etwas herausgekommen ist.
   *
   * Ein vollstaendiger Rahmenpuffer ist noch kein Beweis - es gibt Treiber,
   * die ihn melden und trotzdem nichts schreiben. Der Preis fuer die
   * Gewissheit ist *ein* Rueckgriff auf die Karte, einmal beim Einschalten;
   * jedes Bild waere hier verboten (siehe pruefungen/wabern.mjs: ein
   * Rueckgriff je sechstes Bild hat die Fahrt sichtbar zerrissen).
   *
   * Als leer gilt ein Feld, in dem sechzehn Punkte in allen vier Kanaelen
   * exakt null sind. Das kann ein echtes Bild nicht liefern: Die groesste
   * Annaeherung an den Ursprung ist auch bei Innenpunkten groesser als null,
   * und entkommene Punkte tragen ihre Ausstiegszeit.
   */
  if (!brettGeprueft) {
    brettGeprueft = true;
    const proben = new Float32Array(4 * 16);
    const px = Math.max(0, Math.floor(hb / 2) - 2);
    const py = Math.max(0, Math.floor(h / 2) - 2);
    gl.readPixels(px, py, 4, 4, gl.RGBA, gl.FLOAT, proben);
    if (proben.every((x) => x === 0)) {
      if (typeof console !== 'undefined') {
        console.warn(
          'Schachbrett: der halbe Puffer bleibt leer - diese Karte kann nicht ' +
            'in ein Gleitkommaziel zeichnen. Es bleibt beim bisherigen Weg.',
        );
      }
      brettMoeglich = false;
      programmHalb = null;
      programmLoesen = null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(programm);
      gl.viewport(0, 0, b, h);
      // Dieses eine Bild noch auf dem bisherigen Weg, damit nichts blinkt.
      grundSetzen(orte);
      reiheSetzen(orte);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      uhrStoppen();
      return { leinwand, breite: b, hoehe: h, bahnSchritte, bahnMs, gpuMs: letzteGpuMs, brett: false, punkte: b * h };
    }
  }

  // Durchgang 2: daraus das ganze Bild.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(programmLoesen);
  grundSetzen(orteLoesen);
  gl.uniform1i(orteLoesen.versatzBrett, brettVersatz);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, brettTextur);
  gl.viewport(0, 0, b, h);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  uhrStoppen();

  gl.useProgram(programm);
  return { leinwand, breite: b, hoehe: h, bahnSchritte, bahnMs, gpuMs: letzteGpuMs, brett: true, punkte: hb * h };
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
/*
 * Traegt die Karte unsere Bezugsbahn ohne Genauigkeitsverlust?
 *
 * Die Bahn liegt in einer RGBA32F-Textur, und zwar als hoher und niedriger
 * Anteil je Koordinate - genau dieser Kunstgriff traegt die ganze Tiefe. Gaebe
 * ein Treiber die Textur in geringerer Genauigkeit heraus, waere der niedrige
 * Anteil weg und mit ihm alles unterhalb der siebten Stelle. Das Bild saehe
 * nicht kaputt aus, sondern nur bei tiefen Fahrten flach - der unangenehmste
 * Fehler von allen, weil niemand ihn dem Bild ansieht.
 *
 * Anlass ist ein Widerspruch: Eine Quelle behauptet, AMDs "Surface Format
 * Optimization" ersetze Gleitkommaformate durch groebere und muesse deshalb
 * aus; eine andere sagt, das betreffe nur alte DirectX-Programme und habe auf
 * ausdruecklich angelegte RGBA32F-Texturen null Wirkung. Beide ohne Beleg.
 *
 * Statt mich fuer eine Seite zu entscheiden, wird es nachgesehen: bekannte
 * Zahlen hineinschreiben, herauslesen, vergleichen. Was dabei herauskommt,
 * gilt fuer diesen Rechner mit diesen Treibereinstellungen - und das ist die
 * einzige Auskunft, die zaehlt.
 *
 * Geprueft werden Zahlen, wie sie wirklich vorkommen: ein Wert um eins und
 * ein winziger daneben. Genau deren Summe ist der Kunstgriff.
 */
export function gpuGenauigkeit() {
  if (!gl) return null;
  const proben = new Float32Array([
    1.2345678, 1.1e-7, -0.98765432, -2.2e-8,
    123.456789, 3.3e-6, 1e-30, 1e30,
  ]);
  /*
   * Ohne diese Erweiterung laesst sich eine Gleitkommatextur zwar beschreiben,
   * aber nicht als Rahmen auslesen - und dann gibt es nichts zu vergleichen.
   * Sie anzufordern schaltet sie ein; fehlt sie, sagt das Ergebnis "nicht
   * messbar" statt etwas zu behaupten.
   */
  if (!gl.getExtension('EXT_color_buffer_float')) {
    return { messbar: false, grund: 'EXT_color_buffer_float fehlt' };
  }
  const textur = gl.createTexture();
  const rahmen = gl.createFramebuffer();
  try {
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, textur);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 2, 1, 0, gl.RGBA, gl.FLOAT, proben);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rahmen);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textur, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      return { messbar: false, grund: 'Rahmen nicht lesbar' };
    }
    const zurueck = new Float32Array(8);
    gl.readPixels(0, 0, 2, 1, gl.RGBA, gl.FLOAT, zurueck);

    let schlimmster = 0;
    for (let i = 0; i < proben.length; i++) {
      const soll = proben[i];
      const ist = zurueck[i];
      const nenner = Math.max(Math.abs(soll), 1e-30);
      schlimmster = Math.max(schlimmster, Math.abs(ist - soll) / nenner);
    }
    return {
      messbar: true,
      // Einfache Genauigkeit loest rund 1e-7 relativ auf. Bleibt der Fehler
      // darunter, ist nichts verlorengegangen; wird er deutlich groesser, hat
      // jemand das Format ersetzt.
      abweichung: schlimmster,
      voll: schlimmster < 1e-6,
      proben: [...proben],
      zurueck: [...zurueck],
    };
  } catch (fehler) {
    return { messbar: false, grund: fehler.message };
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(rahmen);
    gl.deleteTexture(textur);
    gl.activeTexture(gl.TEXTURE0);
  }
}

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

  /*
   * Die mittlere Schrittzahl der *entkommenen* Punkte.
   *
   * schritteNoetig ist das obere Zehntel: Es beantwortet "wie hoch muss die
   * Grenze stehen, damit die Zeichnung stimmt". Das ist die richtige Frage
   * fuer die Grenze und die falsche fuer den Aufwand. Nachgemessen brauchte
   * eine Stelle eine Grenze von 12467 Schritten, waehrend die allermeisten
   * Punkte nach ein paar hundert entkamen - wer mit der Grenze rechnet,
   * ueberschaetzt die Arbeit dort um ein Vielfaches.
   *
   * Die Punkte *innerhalb* der Menge sind hier bewusst nicht eingerechnet,
   * und das ist eine Korrektur: Zuerst zaehlten sie mit dem Deckel dieser
   * Stichprobe mit - fuenfzehntausend -, waehrend die Zeichnung nur
   * siebenhundert rechnet. Herausgekommen ist "mittlere Schrittzahl 4773 bei
   * einem Deckel von 700", also eine Unmoeglichkeit, die ich fast als Befund
   * genommen haette.
   *
   * Wieviel ein Innenpunkt kostet, weiss nur der Aufrufer - er kennt die
   * Grenze, mit der wirklich gezeichnet wird. Deshalb kommen hier beide
   * Zahlen einzeln heraus und werden dort zusammengesetzt.
   */
  let summeEntkommen = 0;
  for (const w of gesehen) summeEntkommen += w;

  return {
    innenAnteil: innen / probeWerte.length,
    schritteNoetig: rand,
    schritteMittelEntkommen: gesehen.length ? summeEntkommen / gesehen.length : 0,
    spreizung,
    // Wieviele Punkte ueberhaupt entkommen sind. Unter einer Handvoll sagt die
    // Spreizung nichts - dann ist sie nicht null, sondern unbekannt.
    entkommene: gesehen.length,
    hoechstes,
    punkte: probeWerte.length,
    frisch: gemessen,
  };
}
