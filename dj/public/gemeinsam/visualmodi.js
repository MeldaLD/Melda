// Vier eigenstaendige Visualisierungs-Modi.
//
// Bisher liefen Lava, Iris, Puls und Ausbruch gleichzeitig uebereinander
// (siehe visual.js). Kuenftig laeuft pro Song genau ein Modus - dafuer ist
// diese Datei da. Beat-Ringe, Drop-Ausbruch und Funken bleiben Sache der
// aufrufenden Stelle; jeder Modus hier zeichnet ausschliesslich seinen
// eigenen Effekt.
//
// Die eiserne Regel fuer alle vier: nichts dreht sich, und dieselbe Tonhoehe
// liegt immer an derselben Stelle im Bild. Ein Visualizer, der rotiert,
// verspricht dem Auge ein wiedererkennbares Muster und bricht das Versprechen
// jede Sekunde neu. Darum bildet tonLage() Frequenzen fest und logarithmisch
// auf Positionen ab - Oktaven liegen dadurch immer gleich weit auseinander,
// egal welcher Track laeuft.

export const TAU = Math.PI * 2;

// Nur die unteren 45 Prozent der Bins zaehlen: darueber ist bei Musik so gut
// wie nie etwas los, und wer sie trotzdem einbezieht, verschenkt Aufloesung
// im Bereich, der tatsaechlich Bewegung zeigt.
const NUTZBARER_ANTEIL = 0.45;

function nutzbareBins(anzahl) {
  return Math.max(2, Math.floor(anzahl * NUTZBARER_ANTEIL));
}

// Bin-Index zu Position 0..1, logarithmisch. Feste Zuordnung: Dieselbe
// Tonhoehe liegt immer an derselben Stelle, sonst wandert das Bild und man
// kann nichts wiedererkennen.
function tonLage(bin, anzahl) {
  const nutzbar = nutzbareBins(anzahl);
  const b = Math.min(Math.max(bin, 0), nutzbar - 1);
  return Math.log(b + 1) / Math.log(nutzbar);
}

// Kehrwert von tonLage: aus einer Position 0..1 den Bin-Index, der dort
// liegen wuerde. Gebraucht, wenn ein Modus eine feste Anzahl Elemente
// (Strahlen, Ringpunkte) gleichmaessig ueber die Tonlage verteilt, statt
// selbst Bin fuer Bin durchzugehen - dieselbe feste Abbildung, nur von der
// anderen Seite her aufgerollt.
function binFuerLage(position, anzahl) {
  const nutzbar = nutzbareBins(anzahl);
  const bin = Math.round(Math.pow(nutzbar, position)) - 1;
  return Math.min(Math.max(bin, 0), nutzbar - 1);
}

// --- Modus: Iris ------------------------------------------------------------
//
// Ein Ring in der Mitte, dessen Rand vom Frequenzband verformt wird. Drei
// ineinanderliegende Ringe mit leicht versetzten Frequenzbereichen geben dem
// Bild Tiefe, ohne dass irgendetwas rotiert.

const irisRinge = [
  { skala: 1, versatz: 0 },
  { skala: 0.78, versatz: 6 },
  { skala: 0.58, versatz: -5 },
];
const IRIS_PUNKTE = 128;

function irisZeichnen(stift, lage) {
  const { breite, hoehe, spektrum, takt, wucht, palette: paletteA, paletteB, anteilB } = lage;
  if (!spektrum) return;

  const mx = breite / 2;
  const my = hoehe / 2;
  const grund = Math.min(breite, hoehe) * 0.23;

  // Auf jedem Schlag ein kurzer Stoss nach aussen, der schnell abklingt.
  const schlag = takt ? Math.exp(-takt.imBeat * 7) : 0;
  const radius = grund * (1 + schlag * 0.13 + wucht * 0.1);

  stift.globalCompositeOperation = 'lighter';

  const zeichneRing = (pal, skala, versatz, deckkraft) => {
    stift.beginPath();
    for (let i = 0; i <= IRIS_PUNKTE; i++) {
      const winkel = (i / IRIS_PUNKTE) * TAU;
      // (1 - sin) ist an jedem Punkt gleich fuer winkel und PI - winkel, also
      // spiegelt sich links und rechts von selbst. Unten (winkel = PI/2) wird
      // 0 (Bass), oben (winkel = -PI/2) wird 1 (Hoehen).
      const hoehenAnteil = (1 - Math.sin(winkel)) / 2;
      let bin = binFuerLage(hoehenAnteil, spektrum.length) + versatz;
      bin = Math.min(Math.max(bin, 0), spektrum.length - 1);
      const wert = spektrum[bin] / 255;
      const r = radius * skala * (1 + wert * 0.55);
      const x = mx + Math.cos(winkel) * r;
      const y = my + Math.sin(winkel) * r;
      if (i === 0) stift.moveTo(x, y);
      else stift.lineTo(x, y);
    }
    stift.closePath();
    stift.strokeStyle = pal.hell;
    stift.globalAlpha = deckkraft;
    stift.lineWidth = 2 + wucht * 3;
    stift.stroke();

    // Ein weicher Kern dahinter gibt dem Ring Koerper.
    const verlauf = stift.createRadialGradient(mx, my, 0, mx, my, radius * skala * 1.5);
    verlauf.addColorStop(0, pal.toene[0]);
    verlauf.addColorStop(1, 'transparent');
    stift.globalAlpha = deckkraft * (0.25 + wucht * 0.25);
    stift.fillStyle = verlauf;
    stift.fill();
  };

  for (const ring of irisRinge) {
    if (paletteB && anteilB > 0) {
      // Waehrend eines Uebergangs zwei Ringe an derselben Stelle: die alte
      // Palette verblasst, die neue wird sichtbarer. So liegen beide Tracks
      // erkennbar uebereinander statt hart zu wechseln.
      zeichneRing(paletteA, ring.skala, ring.versatz, 1 - anteilB);
      zeichneRing(paletteB, ring.skala, ring.versatz, anteilB);
    } else {
      zeichneRing(paletteA, ring.skala, ring.versatz, 1);
    }
  }

  stift.globalAlpha = 1;
  stift.globalCompositeOperation = 'source-over';
}

// --- Modus: Tunnel -----------------------------------------------------------
//
// Perspektivische Ringe, die auf den Betrachter zufliegen. Jeder Ring wird
// beim Entstehen einmal vom Spektrum geformt und behaelt diese Form dann bei
// - so fliegt ein Abbild des Klangs auf einen zu, statt sich staendig neu zu
// verformen.

let tunnelRinge = [];
let tunnelLetzterWurf = -1;
const TUNNEL_ECKEN = 48;

function tunnelZeichnen(stift, lage) {
  const { breite, hoehe, sekunden, takt, spannung, wucht, spektrum, palette: paletteA, paletteB, anteilB } = lage;

  // Ein Ring auf jedem Schlag, und ab mittlerer Spannung auch dazwischen.
  // Nur einer pro Takt war zu wenig: Bei 126 BPM lebt ein Ring rund drei
  // Sekunden, also waren nie mehr als zwei gleichzeitig zu sehen - und zwei
  // Ringe sind kein Tunnel, sondern zwei Ringe.
  if (spektrum && takt) {
    const teilung = spannung > 0.4 ? 2 : 1;
    const wurf = Math.floor(takt.beat * teilung);
    if (wurf !== tunnelLetzterWurf) {
      tunnelLetzterWurf = wurf;
      const form = new Array(TUNNEL_ECKEN);
      for (let i = 0; i < TUNNEL_ECKEN; i++) {
        const bin = binFuerLage(i / TUNNEL_ECKEN, spektrum.length);
        form[i] = (spektrum[bin] ?? 0) / 255;
      }
      tunnelRinge.push({ tiefe: 0, form });
      if (tunnelRinge.length > 40) tunnelRinge.shift();
    }
  }

  const mx = breite / 2;
  const my = hoehe / 2;
  const maxRadius = Math.hypot(breite, hoehe) * 0.72;
  // Bei hoher Spannung ziehen die Ringe schneller heran - der Sog vor dem
  // Drop soll man auch hier spueren, nicht nur im Bass.
  const zuwachs = 0.32 + spannung * 1.1;

  for (const ring of tunnelRinge) ring.tiefe += sekunden * zuwachs;
  tunnelRinge = tunnelRinge.filter((r) => r.tiefe < 1);

  stift.globalCompositeOperation = 'lighter';

  const zeichneForm = (ring, pal, alphaMult) => {
    // Ease-in: fern waechst der Ring langsam, nah rast er - wie im echten
    // Tunnelflug, wo Naehe die gefuehlte Geschwindigkeit vervielfacht.
    const fortschritt = ring.tiefe * ring.tiefe;
    const radius = maxRadius * fortschritt;
    // Kommt leise, ist kurz voll da, verschwindet wieder - kein hartes Ein-
    // oder Ausblenden.
    const deckkraft = Math.sin(Math.min(ring.tiefe, 1) * Math.PI);
    if (deckkraft <= 0.001) return;

    stift.beginPath();
    for (let i = 0; i <= ring.form.length; i++) {
      const idx = i % ring.form.length;
      const winkel = (idx / ring.form.length) * TAU;
      const r = radius * (1 + ring.form[idx] * 0.35);
      const x = mx + Math.cos(winkel) * r;
      const y = my + Math.sin(winkel) * r;
      if (i === 0) stift.moveTo(x, y);
      else stift.lineTo(x, y);
    }
    stift.closePath();
    stift.strokeStyle = pal.hell;
    stift.globalAlpha = deckkraft * alphaMult * (0.25 + wucht * 0.4);
    stift.lineWidth = 1.5 + deckkraft * 3;
    stift.stroke();
  };

  for (const ring of tunnelRinge) {
    if (paletteB && anteilB > 0) {
      // Jeder gerade sichtbare Ring wird von beiden Paletten getragen - so
      // sieht man den Uebergang auf der ganzen Tiefe des Tunnels, nicht nur
      // an einer Stelle.
      zeichneForm(ring, paletteA, 1 - anteilB);
      zeichneForm(ring, paletteB, anteilB);
    } else {
      zeichneForm(ring, paletteA, 1);
    }
  }

  stift.globalAlpha = 1;
  stift.globalCompositeOperation = 'source-over';
}

// --- Modus: Strahlen ---------------------------------------------------------
//
// Strahlen vom Mittelpunkt nach aussen, einer je Frequenzbereich, die Laenge
// ist der Pegel. Nachleuchten haelt den Umriss stehen, statt bei jedem Bild
// neu zu flackern.

const STRAHLEN_ANZAHL = 96;
const STRAHLEN_ABKLINGEN = 1.0; // pro Sekunde
let strahlenSpitzen = new Float32Array(STRAHLEN_ANZAHL);

function strahlenZeichnen(stift, lage) {
  const { breite, hoehe, spektrum, sekunden, wucht, palette: paletteA, paletteB, anteilB } = lage;
  if (!spektrum) return;

  const mx = breite / 2;
  const my = hoehe / 2;
  const innen = Math.min(breite, hoehe) * 0.05;
  const aussen = Math.min(breite, hoehe) * 0.47;

  stift.globalCompositeOperation = 'lighter';

  const ziehe = (x0, y0, x1, y1, pal, farbIndex, alpha, linienbreite) => {
    stift.beginPath();
    stift.moveTo(x0, y0);
    stift.lineTo(x1, y1);
    stift.strokeStyle = pal.toene[farbIndex];
    stift.globalAlpha = alpha;
    stift.lineWidth = linienbreite;
    stift.stroke();
  };

  for (let i = 0; i < STRAHLEN_ANZAHL; i++) {
    // Feste Richtung je Frequenzbereich: der Bass zeigt immer zum selben
    // Winkel, egal welcher Track laeuft.
    const bin = binFuerLage(i / (STRAHLEN_ANZAHL - 1), spektrum.length);
    const wert = (spektrum[bin] ?? 0) / 255;
    strahlenSpitzen[i] = Math.max(wert, strahlenSpitzen[i] - sekunden * STRAHLEN_ABKLINGEN);
    const spitze = strahlenSpitzen[i];

    const winkel = (i / STRAHLEN_ANZAHL) * TAU;
    const laenge = innen + (aussen - innen) * spitze;
    const x0 = mx + Math.cos(winkel) * innen;
    const y0 = my + Math.sin(winkel) * innen;
    const x1 = mx + Math.cos(winkel) * laenge;
    const y1 = my + Math.sin(winkel) * laenge;
    const gruppe = Math.floor((i / STRAHLEN_ANZAHL) * 4) % 4;
    const linienbreite = 1.5 + wucht * 1.5;
    const grundAlpha = 0.35 + spitze * 0.65;

    if (paletteB && anteilB > 0) {
      ziehe(x0, y0, x1, y1, paletteA, gruppe, grundAlpha * (1 - anteilB), linienbreite);
      ziehe(x0, y0, x1, y1, paletteB, gruppe, grundAlpha * anteilB, linienbreite);
    } else {
      ziehe(x0, y0, x1, y1, paletteA, gruppe, grundAlpha, linienbreite);
    }
  }

  stift.globalAlpha = 1;
  stift.globalCompositeOperation = 'source-over';
}

// --- Modus: Mandelbrot -------------------------------------------------------
//
// Ein Zoom in die Mandelbrot-Menge, der niemals umkehrt.
//
// Warum ausgerechnet die: Sie ist selbstaehnlich. Egal wie tief man
// hineinfaehrt, es kommt immer wieder neue Struktur - und immer wieder
// dieselbe. Ein Zufallsmuster ermuedet, ein wiederkehrendes langweilt; ein
// Fraktal tut keines von beidem. Genau deshalb laesst es das Auge nicht los.
//
// Die Rechnung passt in drei Zeilen: Fuer jeden Bildpunkt c wird z wiederholt
// durch z*z + c ersetzt. Bleibt z klein, gehoert der Punkt zur Menge und
// bleibt dunkel; entkommt es, faerbt die Zahl der Schritte den Punkt. Der
// Nachkommaanteil mu = n + 1 - log2(log2|z|) macht aus harten Farbringen
// weiche Verlaeufe.
//
// --- Das Problem mit dem Zurueckspringen ------------------------------------
//
// Doppelte Genauigkeit reicht bis etwa Tiefe 13; danach liegen benachbarte
// Bildpunkte naeher beieinander, als Gleitkommazahlen unterscheiden koennen.
// Die erste Fassung fuhr deshalb bis Tiefe 6 hinein und dann *heraus*. Genau
// das zerstoert die Wirkung: Ein Zoom, der umkehrt, ist kein Sog mehr.
//
// Also wird nie zurueckgefahren. Stattdessen zwei Kniffe, wie sie frueher im
// Spielebau ueblich waren, wenn die Rechenleistung nicht reichte:
//
//   Der Schnitt im Blitz. Ist die Genauigkeit am Ende, wird an einer *neuen*
//   Stelle bei geringer Tiefe weitergemacht - aber nur im selben Bild, in dem
//   ein greller Blitz das Bild ueberdeckt. Das Auge sieht den Sprung nicht, es
//   sieht einen Effekt. Am liebsten passiert das auf einem Drop, wo ohnehin
//   alles aufblitzt; dann ist aus der Not ein Teil der Show geworden.
//
//   Die Periodenpruefung. Punkte im Inneren der Menge entkommen nie und
//   kosten deshalb jede einzelne Iteration - sie sind der teuerste Teil des
//   Bildes. Man erkennt sie aber vorzeitig: Wiederholt sich z, ist der Punkt
//   gefangen und man kann abbrechen. Das kostet einen Vergleich je Schritt
//   und spart bei tiefen Zooms ein Vielfaches davon.

// Die Ziele. Entscheidend ist die Stellenzahl, nicht die Auswahl:
//
// Ein Punkt wie -0.7453+0.1127i beschreibt das Seepferdchental gut genug, um
// es zu finden - aber nur auf vier Nachkommastellen. Zoomt man auf ein
// Millionstel heran, liegt dieser Punkt laengst eindeutig innerhalb oder
// ausserhalb der Menge, und das ganze Bild wird zu einer einzigen Flaeche.
// Nachgemessen: Ab Tiefe 4 war nichts mehr zu sehen.
//
// Fuer einen tiefen Zoom braucht es einen Punkt, der *auf dem Rand* liegt,
// und zwar auf so vielen Stellen, wie man hineinfahren will.
const MANDEL_ZIELE = [
  {
    x: -0.743643887037158704752191506114774,
    y: 0.131825904205311970493132056385139,
    name: 'Seepferdchental',
  },
  {
    x: 0.360240443437614363236125244449545,
    y: -0.641313061064803174860375015179302,
    name: 'Spiralarme',
  },
  {
    x: -1.768610930672608212890774771462666,
    y: 0.001645580646883195878428974839603,
    name: 'Miniatur',
  },
  {
    x: -0.235125000000000000000000000000000,
    y: 0.827215000000000000000000000000000,
    name: 'Doppelspirale',
  },
];

// Bis hierher traegt doppelte Genauigkeit. Darueber zerfaellt das Bild in
// Bloecke - vorher wird an einer neuen Stelle weitergemacht.
// Rechnerisch traegt sie bis knapp 10,5. Praktisch nicht: Nachgemessen stand
// bei Tiefe 10,3 ein Bild mit 2,6 Helligkeitsstufen Streuung - die Kloetzchen
// waren da, nur alle in derselben Farbe. Mit Abstand zur Grenze bleibt die
// Zeichnung erhalten.
const MANDEL_MAX_TIEFE = 9.3;
// Ab hier darf ein Drop den Wechsel uebernehmen, damit er auf einen
// musikalischen Moment faellt statt auf eine Zahl.
const MANDEL_WECHSEL_BEREIT = 7.2;
const MANDEL_GRUNDZOOM = 0.115; // Zehnerpotenzen je Sekunde
// Zeitbudget je Bild. Bei 60 Bildern je Sekunde bleiben 16 ms fuer alles;
// 12 davon darf das Fraktal kosten, der Rest ist Lava, Ringe und Schrift.
const MANDEL_BUDGET_MS = 12;
/*
 * Das Bild wird nicht mehr in jedem Bild neu gerechnet.
 *
 * Vorher hing die Aufloesung am Zeitbudget, und weil ein Bildpunkt eine ganze
 * Iterationsschleife kostet, blieben davon 130 bis 250 Punkte Breite uebrig -
 * auf 1280 Punkte hochgezogen ein weicher Brei aus gruenen Flecken. Ein
 * Mandelbrot lebt aber genau von dem, was dabei verlorengeht: von der
 * Feinstruktur am Rand.
 *
 * Der Ausweg ist derselbe, den die Leute frueher genommen haben, als eine
 * Vollbildberechnung je Bild unmoeglich war: Das vorige Bild wird
 * weiterverwendet. Ein Zoom auf einen festen Mittelpunkt ist eine reine
 * Streckung - jeder Punkt des neuen Bildes lag im vorigen schon drin, nur
 * weiter innen. Also wird das vorige Bild gestreckt uebernommen und nur ein
 * Bruchteil der Punkte wirklich neu gerechnet. Nach ein bis zwei Sekunden ist
 * jeder Punkt einmal an der Reihe gewesen, und weil der Zoom in dieser Zeit
 * nur wenige Prozent zulegt, sieht man von der Verzoegerung nichts.
 *
 * Ergebnis: dreimal so viel Aufloesung bei gleichem Zeitbudget.
 */
const MANDEL_BREITE = 384;
const MANDEL_HOEHE = 240;
const MANDEL_PUNKTE = MANDEL_BREITE * MANDEL_HOEHE;
// Die Auffrischung laeuft in 64 Phasen ueber ein 8x8-Muster. Ein Streifenmuster
// waere billiger zu rechnen, aber man saehe die Kante wandern; das gestreute
// Muster verteilt die frischen Punkte gleichmaessig ueber die Flaeche.
const MANDEL_PHASEN = 64;
// Soviele Punkte je Bild duerfen auf dem Rand der Menge zusaetzlich gerechnet
// werden. Der Deckel ist noetig, weil der Rand in tiefen Fahrten die halbe
// Flaeche einnehmen kann - dann waere es keine Zugabe mehr, sondern das ganze
// Bild.
const MANDEL_RANDBUDGET = 3500;

let mandelLeinwand = null;
let mandelStift = null;
let mandelBild = null;
// Der Wertespeicher: je Bildpunkt ein Ausstiegswert. Positiv heisst aussen
// (der geglaettete Iterationswert mu), negativ heisst innen (-1 minus der
// kleinste erreichte Betrag). Aus diesen Werten wird jedes Bild neu eingefaerbt
// - das ist billig und laesst die Farben im Takt wandern, ohne zu rechnen.
let mandelWerte = null;
let mandelWerteAlt = null;
// Welche Phase des Auffrischmusters als naechstes drankommt.
let mandelPhase = 0;
// Wieviele Phasen je Bild - der eigentliche Regler. Bruchteile werden auf
// einem Konto gesammelt, damit auch weniger als eine Phase je Bild geht.
let mandelPhasenProBild = 4;
let mandelPhasenKonto = 0;
let mandelFrischePunkte = 0;
// Nach einem Stellenwechsel ist der Speicher wertlos und wird grob neu
// gefuellt. Das geschieht unter dem Blitz, man sieht es nicht.
let mandelGrundierenNoetig = true;
let mandelTiefeGezeichnet = 0.6;
let mandelTiefe = 0.6;
let mandelSchwung = 0;
let mandelZiel = 0;
let mandelNeuangesetzt = 0;
let mandelFarbe = 0;
let mandelBlitz = 0;
let mandelLetzterBeat = -1;
let mandelDauer = 8;
let mandelLeerlauf = 0;
let mandelFarbtabelle = null;
let mandelFarbtonZuletzt = -1;

/*
 * Wieviel Farbe im Bild steht, haengt nicht an der Palette, sondern daran,
 * wieviel von ihr ein Bild ueberhaupt benutzt.
 *
 * Der Ausstiegswert mu waechst mit der Tiefe: In der Naehe der Menge liegen
 * alle Punkte eines Ausschnitts bei sehr aehnlichen Werten. Mit einer festen
 * Umrechnung (mu mal sieben) deckt so ein Bild dann nur ein paar Prozent der
 * Tabelle ab - nachgemessen fiel der Kontrast dabei auf 6 Helligkeitsstufen,
 * das Bild sah aus wie eine einfarbige Flaeche mit Schlieren.
 *
 * Deshalb wird die Tabelle ueber das gespannt, was wirklich im Bild steht:
 * kleinster und groesster Ausstiegswert des *vorigen* Bildes geben den
 * Bereich vor. Ein Bild Verzoegerung sieht man bei sechzig Bildern je Sekunde
 * nicht, und es kostet keinen zweiten Durchlauf. Genau so haben frueher die
 * Demoprogrammierer ihre Paletten gefuehrt.
 */

const MANDEL_FARBZYKLEN = 2.6; // so oft laeuft die Tabelle ueber ein Bild

/*
 * Nicht der Wertebereich entscheidet ueber den Kontrast, sondern die
 * Verteilung.
 *
 * Erster Versuch war eine Streckung ueber kleinsten und groessten Wert des
 * vorigen Bildes. Das half oft und versagte genau dort, wo es darauf ankam:
 * Nachgemessen hatte ein Bild eine Wertespanne von 563 und benutzte alle 512
 * Farbstufen - und sah trotzdem fast einfarbig aus. Der Grund ist, dass ein
 * paar wenige Punkte tief am Rand die Spanne aufspannen, waehrend die grosse
 * Mehrheit dicht beieinander liegt. Kleinster und groesster Wert sagen ueber
 * die Mehrheit nichts.
 *
 * Also wird nicht der Bereich gestreckt, sondern die Verteilung
 * gleichgemacht: Waehrend des Einfaerbens entsteht ein Histogramm, daraus die
 * Summenkurve, und im naechsten Bild bestimmt nicht mehr der Wert die Farbe,
 * sondern sein Rang. Jede Farbstufe bekommt dann gleich viele Punkte, ganz
 * gleich wie schief die Verteilung ist. Das ist die uebliche Loesung fuer
 * dieses Bild und der Grund, warum tiefe Zoomfahrten ueberhaupt Zeichnung
 * behalten.
 */
const MANDEL_FAECHER = 256;
const mandelHistogramm = new Uint32Array(MANDEL_FAECHER);
const mandelKurve = new Float32Array(MANDEL_FAECHER + 1);
const mandelInnenHistogramm = new Uint32Array(MANDEL_FAECHER);
const mandelInnenKurve = new Float32Array(MANDEL_FAECHER + 1);
for (let i = 0; i <= MANDEL_FAECHER; i++) {
  mandelKurve[i] = i / MANDEL_FAECHER;
  mandelInnenKurve[i] = i / MANDEL_FAECHER;
}

/** Aus einem Histogramm die geglaettete Summenkurve fuer das naechste Bild. */
function mandelKurveBauen(histogramm, kurve) {
  let summe = 0;
  for (let i = 0; i < MANDEL_FAECHER; i++) summe += histogramm[i];
  if (summe === 0) return;
  const eins = 1 / summe;
  let laufend = 0;
  kurve[0] += (0 - kurve[0]) * 0.25;
  for (let i = 0; i < MANDEL_FAECHER; i++) {
    laufend += histogramm[i] * eins;
    // Traege nachgefuehrt: Ein Sprung in der Kurve waere ein Farbsprung im
    // ganzen Bild. So wandern die Farben mit dem Zoom, statt zu zucken.
    kurve[i + 1] += (laufend - kurve[i + 1]) * 0.25;
  }
}
let mandelMuTief = 0;
let mandelMuSpanne = 60;
let mandelInnenTief = 0;
let mandelInnenSpanne = 0.5;

/*
 * Wieviele der 512 Farbstufen ein Bild ueberhaupt benutzt.
 *
 * Die Tiefengrenze allein reicht als Schutz gegen ein totes Bild nicht: Eine
 * Bucht der Menge ist in jeder Tiefe moeglich, und wie weit die doppelte
 * Genauigkeit an einer bestimmten Stelle traegt, weiss man vorher nicht. Also
 * wird nicht geraten, sondern gezaehlt - ein Bit je Farbstufe, ein ODER je
 * Bildpunkt. Das kostet nichts und sagt genau das, was zaehlt: Steht da noch
 * eine Zeichnung oder nur noch eine Flaeche?
 */
const mandelBelegt = new Uint32Array(16);
let mandelVielfalt = 512;
let mandelKanten = 0;
// Unter so viel Unterschied zum Nachbarn ist das Bild keine Zeichnung mehr,
// sondern eine Flaeche. Der Wert stammt aus der Messung, nicht aus dem Gefuehl:
// Im Betrieb liegt der Nachbarunterschied im Mittel bei 16 Farbstufen und faellt
// in ruhigen Bildern bis auf 2. Die Schwelle liegt bewusst am unteren Rand -
// ein ueberfluessiger Stellenwechsel waere schlimmer als ein ruhiges Bild.
const MANDEL_KANTEN_MIN = 3;

// Eine Farbtabelle aus dem Grundton der Palette. Nicht pro Bild neu - das
// waere die teuerste Zeile im ganzen Modus.
function mandelTabelleBauen(grundton) {
  const n = 512;
  const tabelle = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // Eng um den Grundton herum. Ein weiter Bereich wird bunt statt stimmig -
    // mit +-55 Grad standen Orange und Gruen nebeneinander im selben Bild.
    const ton = (grundton + Math.sin(t * Math.PI * 6) * 26 + t * 18) % 360;
    // Helligkeit schwingt, damit Baender aus Licht und Dunkel entstehen. Der
    // Deckel liegt bewusst tief: Das Bild ist Hintergrund, und darueber steht
    // Schrift.
    const helligkeit = 4 + 34 * (0.5 - 0.5 * Math.cos(t * Math.PI * 6)) + t * 12;
    const [r, g, b] = hslZuRgb(ton, 64, Math.min(52, helligkeit));
    tabelle[i * 3] = r;
    tabelle[i * 3 + 1] = g;
    tabelle[i * 3 + 2] = b;
  }
  return tabelle;
}

function hslZuRgb(h, s, l) {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = L - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** An eine neue Stelle springen. Nur aufrufen, wenn ein Blitz das deckt. */
function mandelNeuAnsetzen() {
  mandelZiel = (mandelZiel + 1) % MANDEL_ZIELE.length;
  mandelTiefe = 0.6;
  mandelNeuangesetzt++;
  mandelBlitz = 1;
  // An der neuen Stelle gilt der alte Wertebereich nicht mehr. Nachgefuehrt
  // wuerde er sich zwar einpendeln, aber die ersten Bilder waeren daneben -
  // und die stehen direkt hinter dem Blitz, wo man wieder hinsieht.
  mandelMuTief = 0;
  mandelMuSpanne = 60;
  mandelInnenTief = 0;
  mandelInnenSpanne = 0.5;
  // Der Wertespeicher zeigt jetzt auf die falsche Stelle im Bild.
  mandelGrundierenNoetig = true;
  mandelPhase = 0;
}

/*
 * Die Iterationsschleife fuer einen einzelnen Punkt.
 *
 * Rueckgabe ist der Wert, wie er im Speicher steht: positiv der geglaettete
 * Iterationswert mu (aussen), negativ -1 minus der kleinste erreichte Betrag
 * (innen). Ein Wert, zwei Bedeutungen - so passt das ganze Bild in einen
 * einzigen Float32Array, und das Einfaerben braucht nur ein Vorzeichen zu
 * pruefen.
 */
function mandelBahn(cr, ci, schritte) {
  let zr = 0;
  let zi = 0;
  let zr2 = 0;
  let zi2 = 0;
  let n = 0;
  // Periodenpruefung: Punkte im Inneren entkommen nie und kosten sonst jede
  // Iteration. Wiederholt sich z, ist der Punkt gefangen. Der Bezugswert wird
  // in immer groesseren Abstaenden erneuert - so findet die Pruefung auch
  // lange Perioden, ohne staendig zu vergleichen.
  let bezugR = 0;
  let bezugI = 0;
  let seit = 0;
  let grenze = 8;
  let gefangen = false;
  // Wie nah kommt die Bahn dem Ursprung? Bei gefangenen Punkten ist das ein
  // Mass fuer die Lage im Inneren - daraus werden weiche Hoehenlinien.
  let kleinster = 1e9;

  while (n < schritte && zr2 + zi2 < 65536) {
    zi = 2 * zr * zi + ci;
    zr = zr2 - zi2 + cr;
    zr2 = zr * zr;
    zi2 = zi * zi;
    n++;
    if (zr2 + zi2 < kleinster) kleinster = zr2 + zi2;

    if (Math.abs(zr - bezugR) < 1e-13 && Math.abs(zi - bezugI) < 1e-13) {
      gefangen = true;
      break;
    }
    if (++seit >= grenze) {
      seit = 0;
      grenze += grenze;
      bezugR = zr;
      bezugI = zi;
    }
  }

  if (gefangen || n >= schritte) return -1 - Math.sqrt(kleinster);
  return n + 1 - Math.log(Math.log(Math.sqrt(zr2 + zi2))) / Math.LN2;
}

/*
 * Ein Streumuster fuer die Auffrischung: 8x8 Felder, jede Zahl genau einmal.
 *
 * Warum kein einfaches "jede achte Zeile": Eine Zeile faellt als Zeile auf.
 * Beim geordneten Streumuster (nach Bayer) liegen die frischen Punkte eines
 * Durchgangs so weit wie moeglich auseinander - der Blick findet kein Muster,
 * und das Bild wird gleichmaessig schaerfer statt streifenweise.
 */
const MANDEL_MUSTER = (() => {
  const n = 8;
  const feld = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let wert = 0;
      let bit = 0;
      let xx = x ^ y;
      let yy = y;
      for (let s = n >> 1; s > 0; s >>= 1) {
        wert |= ((yy & s) ? 1 : 0) << bit++;
        wert |= ((xx & s) ? 1 : 0) << bit++;
      }
      feld[y * n + x] = wert;
    }
  }
  return feld;
})();

/**
 * Eine Phase des Streumusters neu rechnen. Gibt zurueck, wieviele Punkte das
 * waren - die Zahl geht in die Abnahme.
 */
function mandelAuffrischen(phase, linksC, obenC, schrittX, schrittY, schritte) {
  const werte = mandelWerte;
  let gerechnet = 0;
  for (let py = 0; py < MANDEL_HOEHE; py++) {
    const ci = obenC + py * schrittY;
    const zeile = (py & 7) * 8;
    const reihe = py * MANDEL_BREITE;
    for (let px = 0; px < MANDEL_BREITE; px++) {
      if (MANDEL_MUSTER[zeile + (px & 7)] !== phase) continue;
      werte[reihe + px] = mandelBahn(linksC + px * schrittX, ci, schritte);
      gerechnet++;
    }
  }
  return gerechnet;
}

/**
 * Das vorige Bild auf die neue Tiefe strecken.
 *
 * Ein Zoom auf einen festen Mittelpunkt ist eine reine Streckung um die Mitte,
 * und weil hineingezoomt wird, liegt jeder Punkt des neuen Bildes im alten
 * bereits drin. Es gibt also keinen Rand nachzurechnen - nur nachzuschaerfen,
 * und das erledigt die Auffrischung.
 */
function mandelStrecken(faktor, linksC, obenC, schrittX, schrittY, schritte) {
  if (!(faktor > 1.0000001)) return;
  const alt = mandelWerte;
  const neu = mandelWerteAlt;
  const mx = MANDEL_BREITE / 2;
  const my = MANDEL_HOEHE / 2;
  const eins = 1 / faktor;
  /*
   * Zwischen den Nachbarn wird gemischt, nicht der naechste genommen.
   *
   * Der naechste Nachbar war der erste Versuch und sah schrecklich aus: Ein
   * Punkt, der sechzehn Bilder lang nicht neu gerechnet wird, wird sechzehnmal
   * hintereinander umkopiert, und jedes Mal wird auf ein ganzes Feld gerundet.
   * Diese Rundungen addieren sich zu einem Zufallsweg von ein bis zwei Feldern
   * - am Rand des Fraktals, wo zwei benachbarte Punkte voellig verschiedene
   * Werte haben, wird daraus Rauschen. Nachgemessen: ein Teppich aus
   * flimmernden Kloetzchen statt eines Fraktals.
   *
   * Beim Mischen gibt es keine Rundung, also auch keinen Zufallsweg. Was
   * bleibt, ist eine leichte Unschaerfe in den Bereichen, die gerade nicht
   * dran waren - und die sieht wie die Bewegungsunschaerfe eines schnellen
   * Zooms aus, also nach Absicht.
   *
   * Innen und aussen werden nie miteinander verrechnet: Die beiden Werte
   * bedeuten Verschiedenes und liegen auf verschiedenen Seiten der Null. Wo
   * die vier Nachbarn sich nicht einig sind, liegt der Punkt genau auf dem
   * Rand der Menge - und dort wird nicht geschaetzt, sondern gerechnet. Das
   * ist wenig Arbeit (der Rand ist duenn) und trifft genau die Stellen, auf
   * die man schaut. Erst wenn das Randbudget aufgebraucht ist, gilt
   * ersatzweise der naechste Nachbar.
   */
  let randbudget = MANDEL_RANDBUDGET;
  let gerechnet = 0;
  const breite = MANDEL_BREITE;
  const hoehe = MANDEL_HOEHE;
  for (let py = 0; py < hoehe; py++) {
    const fy = my + (py + 0.5 - my) * eins - 0.5;
    let y0 = Math.floor(fy);
    const ty = fy - y0;
    if (y0 < 0) y0 = 0;
    else if (y0 > hoehe - 1) y0 = hoehe - 1;
    let y1 = y0 + 1;
    if (y1 > hoehe - 1) y1 = hoehe - 1;
    const oben = y0 * breite;
    const unten = y1 * breite;
    const ziel = py * breite;
    for (let px = 0; px < breite; px++) {
      const fx = mx + (px + 0.5 - mx) * eins - 0.5;
      let x0 = Math.floor(fx);
      const tx = fx - x0;
      if (x0 < 0) x0 = 0;
      else if (x0 > breite - 1) x0 = breite - 1;
      let x1 = x0 + 1;
      if (x1 > breite - 1) x1 = breite - 1;

      const lo = alt[oben + x0];
      const ro = alt[oben + x1];
      const lu = alt[unten + x0];
      const ru = alt[unten + x1];
      const aussen = lo > 0;
      if (aussen === ro > 0 && aussen === lu > 0 && aussen === ru > 0) {
        const o = lo + (ro - lo) * tx;
        const u = lu + (ru - lu) * tx;
        neu[ziel + px] = o + (u - o) * ty;
      } else if (randbudget > 0) {
        randbudget--;
        gerechnet++;
        neu[ziel + px] = mandelBahn(linksC + px * schrittX, obenC + py * schrittY, schritte);
      } else {
        neu[ziel + px] = tx < 0.5 ? (ty < 0.5 ? lo : lu) : ty < 0.5 ? ro : ru;
      }
    }
  }
  mandelWerte = neu;
  mandelWerteAlt = alt;
  return gerechnet;
}

/**
 * Nach einem Stellenwechsel den ganzen Speicher grob fuellen.
 *
 * Jeden Punkt zu rechnen waere hier ein Ruckler von deutlich ueber 50 ms. Also
 * wird nur jeder vierte in beiden Richtungen gerechnet und sein Wert in den
 * 4x4-Block geschrieben - ein Sechzehntel der Arbeit. Die Auffrischung holt
 * die Feinheit in den naechsten Bildern nach, und das alles geschieht unter
 * dem Blitz, der den Stellenwechsel deckt.
 */
function mandelGrundieren(linksC, obenC, schrittX, schrittY, schritte) {
  const werte = mandelWerte;
  const grob = Math.min(schritte, 260);
  for (let py = 0; py < MANDEL_HOEHE; py += 4) {
    const ci = obenC + py * schrittY;
    for (let px = 0; px < MANDEL_BREITE; px += 4) {
      const wert = mandelBahn(linksC + px * schrittX, ci, grob);
      const bisY = Math.min(py + 4, MANDEL_HOEHE);
      const bisX = Math.min(px + 4, MANDEL_BREITE);
      for (let y = py; y < bisY; y++) {
        const reihe = y * MANDEL_BREITE;
        for (let x = px; x < bisX; x++) werte[reihe + x] = wert;
      }
    }
  }
}

function mandelbrotZeichnen(stift, lage) {
  const { breite, hoehe, sekunden, takt, spannung, wucht, drop, palette: paletteA, paletteB, anteilB } = lage;

  // --- Die Fahrt ---------------------------------------------------------

  // Auf jedem Schlag ein Stoss nach vorn. Das ist der ganze Trick: Der Zoom
  // laeuft gleichmaessig, aber er *atmet* im Takt, und das Auge liest das als
  // Bewegung zur Musik statt als Bildschirmschoner.
  if (takt && takt.nummer !== mandelLetzterBeat) {
    mandelLetzterBeat = takt.nummer;
    mandelSchwung += 0.3 + wucht * 0.6 + (takt.aufEins ? 0.4 : 0);
    // Auch die Farben zucken mit - ein Puls, der durch das ganze Bild geht.
    mandelFarbe += 0.012 + wucht * 0.02;
  }
  mandelSchwung *= Math.pow(0.08, sekunden);
  mandelBlitz *= Math.pow(0.055, sekunden); // haelt rund eine halbe Sekunde

  /*
   * Der Drop.
   *
   * Vorher kehrte er nur die Fahrt um, und das war zugleich zu wenig und das
   * Falsche. Jetzt passiert alles auf einmal, was das Bild hergibt: ein
   * Blitz, ein Schub, der das Fraktal sekundenlang nach vorn reisst, und ein
   * Sprung in der Farbe. Wir wissen aus der Analyse auf den Beat genau, wann
   * er kommt - dann darf man ihn auch sehen.
   */
  if (drop) {
    mandelBlitz = 0.9;
    mandelSchwung += 9;
    mandelFarbe += 0.3;
    // Ist die Genauigkeit ohnehin bald am Ende, ist das hier der schoenste
    // Moment zum Wechseln: Der Blitz deckt den Sprung vollstaendig.
    if (mandelTiefe > MANDEL_WECHSEL_BEREIT) mandelNeuAnsetzen();
  }

  // Vor dem Drop zieht es an. Die Spannung kommt aus der Analyse und steigt,
  // je naeher der Drop rueckt.
  const tempo = MANDEL_GRUNDZOOM * (1 + spannung * 2.2) + mandelSchwung * 0.55;
  mandelTiefe += tempo * sekunden;

  // Die Genauigkeit ist am Ende - jetzt hilft kein Warten mehr auf einen
  // Drop. Der Blitz deckt es trotzdem.
  if (mandelTiefe > MANDEL_MAX_TIEFE) mandelNeuAnsetzen();

  mandelFarbe += sekunden * (0.05 + wucht * 0.35 + spannung * 0.3);

  // --- Speicher und Regler -----------------------------------------------
  //
  // Leinwand, Bildspeicher und Wertespeicher werden *einmal* angelegt.
  //
  // Vorher wurde bei jeder Aufloesungsaenderung ein neues Canvas samt
  // ImageData erzeugt. Weil der Regler die Aufloesung staendig leicht
  // nachzog, passierte das dauernd - und jede dieser Neuanlagen war ein
  // Ausreisser von ueber 40 ms mitten im laufenden Bild.
  if (!mandelLeinwand) {
    mandelLeinwand = document.createElement('canvas');
    mandelLeinwand.width = MANDEL_BREITE;
    mandelLeinwand.height = MANDEL_HOEHE;
    mandelStift = mandelLeinwand.getContext('2d');
    mandelBild = mandelStift.createImageData(MANDEL_BREITE, MANDEL_HOEHE);
    mandelWerte = new Float32Array(MANDEL_PUNKTE).fill(-1);
    mandelWerteAlt = new Float32Array(MANDEL_PUNKTE).fill(-1);
  }

  /*
   * Die Schrittzahl waechst mit der Tiefe - je naeher am Rand, desto laenger
   * braucht ein Punkt, um sich zu entscheiden. Die Obergrenze deckelt den
   * schlimmsten Fall: An manchen Stellen laeuft fast jeder Punkt bis zum
   * Anschlag, und die Rechenzeit schwankt mit dem Bildinhalt um das
   * Fuenffache. Sichtbar kostet der Deckel wenig, seit die Innenflaeche ihre
   * eigene Zeichnung hat - ein Punkt, der die Grenze erreicht, wird nicht
   * schwarz, sondern bekommt eine Hoehenlinie.
   *
   * Der Blitz erhoeht die Schrittzahl bewusst *nicht*: Im Bild eines
   * Stellenwechsels wird ohnehin grundiert, das ist teuer genug.
   */
  const schritte = Math.round(
    Math.min(760, 200 + mandelTiefe * 84 + wucht * 90 + spannung * 70),
  );

  /*
   * Der Regler haengt an der *gemessenen* Zeit, nicht an einem Kostenmodell
   * aus Punkten mal Schritten.
   *
   * Das Modell hatte einen Denkfehler: Mit der Periodenpruefung kostet ein
   * Punkt im Inneren viel weniger als einer am Rand, und wie viele davon im
   * Bild sind, weiss man vorher nicht. Ein Bild mit viel Innenflaeche lief
   * schnell, das Modell schloss auf einen schnellen Rechner, gab mehr frei -
   * und das naechste Bild lag am Rand und brauchte 62 ms.
   *
   * Geregelt wird jetzt nicht mehr die Aufloesung, sondern wieviel vom Bild
   * je Bild aufgefrischt wird. Das ist der bessere Knopf: Zu wenig Zeit macht
   * das Bild nicht grob, sondern nur ein wenig aelter.
   */
  const nachregeln = Math.min(1.12, Math.max(0.78, Math.sqrt(MANDEL_BUDGET_MS / Math.max(1, mandelDauer))));
  mandelPhasenProBild = Math.min(16, Math.max(0.6, mandelPhasenProBild * nachregeln));

  const grundton = paletteB && anteilB > 0.5 ? paletteB.grundton : paletteA.grundton;
  if (grundton !== mandelFarbtonZuletzt || !mandelFarbtabelle) {
    mandelFarbtabelle = mandelTabelleBauen(grundton);
    mandelFarbtonZuletzt = grundton;
  }

  // --- Die Rechnung ------------------------------------------------------

  const begonnen = performance.now();
  const zielPunkt = MANDEL_ZIELE[mandelZiel];
  const spanne = 1.6 / Math.pow(10, mandelTiefe);
  const seitenverhaeltnis = MANDEL_HOEHE / MANDEL_BREITE;
  const schrittX = (2 * spanne) / MANDEL_BREITE;
  const schrittY = (2 * spanne * seitenverhaeltnis) / MANDEL_HOEHE;
  const linksC = zielPunkt.x - spanne + schrittX * 0.5;
  const obenC = zielPunkt.y - spanne * seitenverhaeltnis + schrittY * 0.5;

  if (mandelGrundierenNoetig) {
    mandelGrundieren(linksC, obenC, schrittX, schrittY, schritte);
    mandelGrundierenNoetig = false;
    mandelTiefeGezeichnet = mandelTiefe;
    mandelFrischePunkte = MANDEL_PUNKTE >> 4;
  } else {
    // 1. Das vorige Bild auf die neue Tiefe strecken.
    const amRand = mandelStrecken(
      Math.pow(10, mandelTiefe - mandelTiefeGezeichnet),
      linksC, obenC, schrittX, schrittY, schritte,
    );
    mandelTiefeGezeichnet = mandelTiefe;
    // 2. Einen Teil der Punkte wirklich neu rechnen.
    mandelPhasenKonto += mandelPhasenProBild;
    let phasen = Math.floor(mandelPhasenKonto);
    mandelPhasenKonto -= phasen;
    if (phasen > MANDEL_PHASEN) phasen = MANDEL_PHASEN;
    mandelFrischePunkte = amRand;
    for (let i = 0; i < phasen; i++) {
      mandelFrischePunkte += mandelAuffrischen(
        mandelPhase, linksC, obenC, schrittX, schrittY, schritte,
      );
      mandelPhase = (mandelPhase + 1) % MANDEL_PHASEN;
    }
  }

  // --- Das Einfaerben ------------------------------------------------------
  //
  // Ein eigener Durchlauf ueber alle Punkte, jedes Bild. Er kostet wenig - je
  // Punkt ein Tabellenzugriff - und er ist der Grund, warum die Farben im
  // Takt wandern koennen, ohne dass ein einziger Punkt neu gerechnet wird.
  // Nebenbei faellt hier alles an, was ueber das Bild als Ganzes gesagt werden
  // muss: Wertebereich, Innenanteil und wieviele Farbstufen benutzt sind.

  const daten = mandelBild.data;
  const tabelle = mandelFarbtabelle;
  const farbversatz = mandelFarbe * 512;
  // Die Faecherbreite folgt dem Wertebereich des vorigen Bildes; welche Farbe
  // ein Fach bekommt, entscheidet dann die Summenkurve.
  const muFaktor = MANDEL_FAECHER / mandelMuSpanne;
  const innenFaktor = MANDEL_FAECHER / mandelInnenSpanne;
  const bogen = MANDEL_FARBZYKLEN * 512;
  const werte = mandelWerte;
  let innen = 0;
  let muTiefst = Infinity;
  let muHoechst = -Infinity;
  let innenTiefst = Infinity;
  let innenHoechst = -Infinity;
  // Wie stark sich benachbarte Punkte unterscheiden. Das ist das ehrlichste
  // Mass dafuer, ob ueberhaupt eine Zeichnung im Bild steht - die Zahl der
  // benutzten Farbstufen ist es nicht, seit die Verteilung gleichgemacht wird.
  let kantenSumme = 0;
  let vorigerIndex = 0;
  mandelBelegt.fill(0);
  mandelHistogramm.fill(0);
  mandelInnenHistogramm.fill(0);

  for (let i = 0, k = 0; i < MANDEL_PUNKTE; i++, k += 4) {
    const wert = werte[i];
    let index;
    if (wert > 0) {
      const mu = wert;
      if (mu < muTiefst) muTiefst = mu;
      if (mu > muHoechst) muHoechst = mu;
      let fach = (mu - mandelMuTief) * muFaktor;
      fach = fach < 0 ? 0 : fach > 255.999 ? 255.999 : fach;
      const f0 = fach | 0;
      mandelHistogramm[f0]++;
      const rang = mandelKurve[f0] + (mandelKurve[f0 + 1] - mandelKurve[f0]) * (fach - f0);
      index = Math.floor(rang * bogen + farbversatz) % 512;
      if (index < 0) index += 512;
      mandelBelegt[index >> 5] |= 1 << (index & 31);
      const t = index * 3;
      daten[k] = tabelle[t];
      daten[k + 1] = tabelle[t + 1];
      daten[k + 2] = tabelle[t + 2];
      daten[k + 3] = 255;
    } else {
      innen++;
      /*
       * Das Innere war einmal schwarz, und das war ein Fehler: Faehrt die
       * Fahrt durch eine grosse Bucht der Menge, stand minutenlang ein fast
       * leeres Bild da - nachgemessen bis auf 0,2 Prozent nicht schwarze
       * Punkte herunter. Der kleinste Betrag, den die Bahn erreicht hat,
       * unterscheidet die Punkte im Inneren voneinander und gibt auch der
       * Innenflaeche eine Zeichnung.
       */
      const naehe = -wert - 1;
      if (naehe < innenTiefst) innenTiefst = naehe;
      if (naehe > innenHoechst) innenHoechst = naehe;
      let fach = (naehe - mandelInnenTief) * innenFaktor;
      fach = fach < 0 ? 0 : fach > 255.999 ? 255.999 : fach;
      const f0 = fach | 0;
      mandelInnenHistogramm[f0]++;
      const rang =
        mandelInnenKurve[f0] + (mandelInnenKurve[f0 + 1] - mandelInnenKurve[f0]) * (fach - f0);
      const stufe = Math.floor(rang * 380);
      index = stufe;
      mandelBelegt[stufe >> 5] |= 1 << (stufe & 31);
      const i2 = stufe * 3;
      // Haelfte statt Viertel: Mit einem Viertel war die Innenflaeche zwar
      // nicht mehr schwarz, aber immer noch fast einfarbig - nachgemessen
      // 2,5 Helligkeitsstufen Streuung in einem Bild, das ganz aus Innerem
      // bestand. Dunkel genug fuer Hintergrund bleibt es auch so.
      daten[k] = 6 + (tabelle[i2] >> 1);
      daten[k + 1] = 6 + (tabelle[i2 + 1] >> 1);
      daten[k + 2] = 8 + (tabelle[i2 + 2] >> 1);
      daten[k + 3] = 255;
    }
    // Abstand zum linken Nachbarn, ueber den Ring gemessen.
    let d = index - vorigerIndex;
    if (d < 0) d = -d;
    kantenSumme += d > 256 ? 512 - d : d;
    vorigerIndex = index;
  }

  mandelKanten = kantenSumme / MANDEL_PUNKTE;
  mandelKurveBauen(mandelHistogramm, mandelKurve);
  mandelKurveBauen(mandelInnenHistogramm, mandelInnenKurve);

  /*
   * Den Wertebereich fuer das naechste Bild nachfuehren - traege, damit die
   * Farben beim Zoomen wandern statt zu zappeln, und mit einer Untergrenze:
   * Bei einem Bild, in dem wirklich alles gleich ist, wuerde eine Spanne von
   * fast null das Rauschen bis zur Unkenntlichkeit aufblasen.
   */
  if (muHoechst > muTiefst) {
    mandelMuTief += (muTiefst - mandelMuTief) * 0.18;
    mandelMuSpanne += (Math.max(4, muHoechst - muTiefst) - mandelMuSpanne) * 0.18;
  }
  if (innenHoechst > innenTiefst) {
    mandelInnenTief += (innenTiefst - mandelInnenTief) * 0.18;
    mandelInnenSpanne += (Math.max(0.02, innenHoechst - innenTiefst) - mandelInnenSpanne) * 0.18;
  }

  // Bits zaehlen (Kernighan: jeder Durchlauf loescht das unterste gesetzte).
  mandelVielfalt = 0;
  for (let w = 0; w < 16; w++) {
    let v = mandelBelegt[w];
    while (v) {
      v &= v - 1;
      mandelVielfalt++;
    }
  }

  /*
   * Ist fast alles Innenflaeche oder benutzt das Bild kaum noch Farbstufen,
   * steht da keine Zeichnung mehr. Das passiert, wenn die Fahrt in eine grosse
   * Bucht der Menge geraet oder wenn die Genauigkeit an einer Stelle frueher
   * endet als erwartet - kein Fehler, nur eine tote Stelle. Statt dort zu
   * verharren, wird weitergezogen, gedeckt vom selben Blitz wie beim
   * Genauigkeitsende.
   *
   * Eine halbe Sekunde Geduld war zu lang: Nachgemessen stand kurz vor so
   * einem Wechsel ein Bild mit 2,6 Helligkeitsstufen Streuung.
   */
  const innenAnteil = innen / MANDEL_PUNKTE;
  if (innenAnteil > 0.8 || mandelKanten < MANDEL_KANTEN_MIN) mandelLeerlauf += sekunden;
  else mandelLeerlauf = 0;
  if (mandelLeerlauf > 0.22) {
    mandelLeerlauf = 0;
    mandelNeuAnsetzen();
  }
  // Fuer die Abnahme sichtbar machen, was die Fahrt gerade tut.
  if (typeof window !== 'undefined') {
    window.__mandel = {
      tiefe: mandelTiefe,
      ziel: zielPunkt.name,
      zielNummer: mandelZiel,
      neuangesetzt: mandelNeuangesetzt,
      blitz: mandelBlitz,
      schritte,
      breite: MANDEL_BREITE,
      frischePunkte: mandelFrischePunkte,
      phasenProBild: mandelPhasenProBild,
      innenAnteil,
      muSpanne: mandelMuSpanne,
      vielfalt: mandelVielfalt,
      kanten: mandelKanten,
      dauerMs: mandelDauer,
      schwung: mandelSchwung,
    };
  }

  // Nur den genutzten Ausschnitt uebertragen.
  mandelStift.putImageData(mandelBild, 0, 0);
  const gebraucht = Math.max(0.2, performance.now() - begonnen);
  // Ungleich geglaettet: Ein langsames Bild schlaegt sofort durch, damit die
  // Aufloesung im naechsten Bild faellt. Ein schnelles wird nur langsam
  // geglaubt - sonst wird nach jedem billigen Bild zu viel freigegeben und
  // das uebernaechste ruckelt.
  mandelDauer =
    gebraucht > mandelDauer
      ? mandelDauer * 0.4 + gebraucht * 0.6
      : mandelDauer * 0.88 + gebraucht * 0.12;

  // --- Aufs Bild --------------------------------------------------------

  stift.save();
  stift.imageSmoothingEnabled = true;
  stift.imageSmoothingQuality = 'high';
  stift.globalAlpha = 0.92 + wucht * 0.08;
  stift.drawImage(mandelLeinwand, 0, 0, MANDEL_BREITE, MANDEL_HOEHE, 0, 0, breite, hoehe);

  // Der Blitz. Er hat zwei Aufgaben: Beim Drop ist er der Knall, und beim
  // Stellenwechsel deckt er den Sprung. Von der Mitte nach aussen, damit er
  // wie ein Aufreissen wirkt und nicht wie ein Weissbild.
  if (mandelBlitz > 0.01) {
    const mx = breite / 2;
    const my = hoehe / 2;
    const strahl = stift.createRadialGradient(mx, my, 0, mx, my, Math.hypot(breite, hoehe) * 0.6);
    strahl.addColorStop(0, `rgba(255,255,255,${(mandelBlitz * 0.95).toFixed(3)})`);
    strahl.addColorStop(0.45, `rgba(255,255,255,${(mandelBlitz * 0.55).toFixed(3)})`);
    strahl.addColorStop(1, `rgba(255,255,255,0)`);
    stift.globalCompositeOperation = 'lighter';
    stift.globalAlpha = 1;
    stift.fillStyle = strahl;
    stift.fillRect(0, 0, breite, hoehe);
    stift.globalCompositeOperation = 'source-over';
  }

  // Oben und unten abdunkeln. Dort stehen Titel, Uhr und Pegel, und ein
  // Fraktal in voller Pracht direkt dahinter macht beides unlesbar.
  stift.globalAlpha = 1;
  const schleier = stift.createLinearGradient(0, 0, 0, hoehe);
  schleier.addColorStop(0, 'rgba(0,0,0,0.62)');
  schleier.addColorStop(0.16, 'rgba(0,0,0,0.06)');
  schleier.addColorStop(0.66, 'rgba(0,0,0,0.06)');
  schleier.addColorStop(1, 'rgba(0,0,0,0.72)');
  stift.fillStyle = schleier;
  stift.fillRect(0, 0, breite, hoehe);
  stift.restore();
}

// --- Der Vertrag --------------------------------------------------------------

export const MODI = {
  iris: { name: 'Iris', zeichne: irisZeichnen },
  tunnel: { name: 'Tunnel', zeichne: tunnelZeichnen },
  strahlen: { name: 'Strahlen', zeichne: strahlenZeichnen },
  mandelbrot: { name: 'Mandelbrot', zeichne: mandelbrotZeichnen },
};
