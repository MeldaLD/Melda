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

import {
  gpuBereit, gpuFarben, gpuZeichnen, gpuProbe, gpuProbeVergessen, gpuLeinwand, gpuName,
  reiheAuskunft,
} from './mandelgpu.js';
import { dolceZeichnen, dolceZuruecksetzen } from './dolce.js';
import { nutzbareBins } from './spektrum.js';
import { partylichtZeichnen } from './partylicht.js';
import { buehnenshowZeichnen } from './buehnenshow.js';

export { dolceZuruecksetzen };

/*
 * Die Reihenentwicklung laesst sich abschalten.
 *
 * Sie ueberspringt bei tiefen Zooms einen grossen Teil der Iterationen - und
 * sie ist das einzige Stueck hier, das eine *Naeherung* ist und nicht eine
 * exakte Rechnung. Ein Schalter ist deshalb keine Spielerei: Nur so laesst
 * sich am selben Bild vergleichen, ob sie etwas wegputzt, und wieviel sie
 * ueberhaupt bringt.
 */
let mandelReihe = true;

export function reiheSetzen(an) {
  mandelReihe = an !== false;
}

export function reiheAn() {
  return mandelReihe;
}

export const TAU = Math.PI * 2;

// Nur die unteren 45 Prozent der Bins zaehlen: darueber ist bei Musik so gut
// wie nie etwas los, und wer sie trotzdem einbezieht, verschenkt Aufloesung
// im Bereich, der tatsaechlich Bewegung zeigt. Die Zahl steht in spektrum.js,
// weil die Aufbereitung sie zuerst braucht.

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
/*
 * Die Zielpunkte, als Text statt als Zahl.
 *
 * Eine gewoehnliche Gleitkommazahl in JavaScript traegt siebzehn Stellen. Fuer
 * die Fahrt in die Tiefe braucht die Bezugsbahn mehr - deshalb stehen die
 * Ziele als Zeichenkette da und werden erst in der Festkommarechnung zu
 * Zahlen. Fuer die Notfassung auf dem Hauptprozessor, die ohnehin nur bis
 * Tiefe 9 traegt, reichen die siebzehn Stellen.
 *
 * Alle drei liegen auf dem Rand der Menge (Misiurewicz-Punkte). Das ist keine
 * Geschmacksfrage: Nur dort bleibt die Fahrt beliebig tief interessant. Ein
 * Punkt im Inneren endet in einer schwarzen Flaeche, einer weit draussen in
 * einer einfarbigen.
 */
const MANDEL_ZIELE0 = [
  {
    x: '-0.743643887037158704752191506114774',
    y: '0.131825904205311970493132056385139',
    name: 'Seepferdchental',
    start: 1.1,
  },
  {
    x: '0.360240443437614363236125244449545',
    y: '-0.641313061064803174860375015179302',
    name: 'Spiralarme',
    start: 1.4,
  },
  {
    x: '-1.768610930672608212890774771462666',
    y: '0.001645580646883195878428974839603',
    name: 'Miniatur',
    /*
     * Dieses Ziel liegt auf der Antenne der Menge, dem duennen Stachel entlang
     * der negativen Achse. Dort ist die Umgebung *weit* draussen leer: Bei
     * geringer Tiefe steht eine haarduenne Nadel in einer riesigen glatten
     * Flaeche - genau das war auf dem iPad zu sehen, als das Bild "ganz klein
     * wurde und nicht wiederkam". Die Stelle ist nicht kaputt, sie fangt nur
     * viel weiter innen an, interessant zu werden.
     */
    start: 3.4,
  },
];
// Exportiert, weil der Messstand dieselben Stellen fahren muss wie die
// Buehne. Eine Messung an einer erfundenen Stelle sagt nichts darueber aus,
// was am Abend wirklich gerechnet wird.
export const MANDEL_ZIELE = MANDEL_ZIELE0.map((z) => ({ ...z, zx: Number(z.x), zy: Number(z.y) }));


// Bis hierher traegt doppelte Genauigkeit. Darueber zerfaellt das Bild in
// Bloecke - vorher wird an einer neuen Stelle weitergemacht.
// Rechnerisch traegt sie bis knapp 10,5. Praktisch nicht: Nachgemessen stand
// bei Tiefe 10,3 ein Bild mit 2,6 Helligkeitsstufen Streuung - die Kloetzchen
// waren da, nur alle in derselben Farbe. Mit Abstand zur Grenze bleibt die
// Zeichnung erhalten.
const MANDEL_MAX_TIEFE = 9.3;
/*
 * Auf der Grafikkarte gilt die Grenze der doppelten Genauigkeit nicht mehr -
 * dort rechnet die Stoerungsrechnung. Was bleibt, sind zwei andere Grenzen:
 * Die Zielpunkte sind auf 33 Stellen genau angegeben, und der Abstand zur
 * Bezugsbahn wird in einfacher Genauigkeit gefuehrt, deren Zahlenbereich bei
 * rund 10^-38 endet. Mit Abstand zu beidem sind 26 Zehnerpotenzen sicher - das
 * Dreifache der bisherigen Tiefe, und bei ruhigem Zoom eine gute Viertelstunde
 * ohne jeden Wechsel.
 */
const MANDEL_MAX_TIEFE_GPU = 26;
// Ab hier darf ein Drop den Wechsel uebernehmen, damit er auf einen
// musikalischen Moment faellt statt auf eine Zahl.
const MANDEL_WECHSEL_BEREIT = 7.2;
// Langsamer als vorher. Der Zoom soll ziehen, nicht rasen - und je langsamer
// er laeuft, desto seltener ist die Tiefe am Ende.
const MANDEL_GRUNDZOOM = 0.055; // Zehnerpotenzen je Sekunde
// Zeitbudget je Bild. Bei 60 Bildern je Sekunde bleiben 16 ms fuer alles;
// 12 davon darf das Fraktal kosten, der Rest ist Lava, Ringe und Schrift.
const MANDEL_BUDGET_MS = 12;
// Unter diesen Anteil der vollen Aufloesung geht der Regler nie. Der Wert
// steht hier, weil der Notausgang ihn braucht: "Der Regler steht unten und es
// reicht immer noch nicht" ist die Bedingung zum Umschalten, und die muss sich
// auf denselben Wert beziehen wie die Schranke selbst - sonst ist sie nie
// erfuellt, und es wird nie umgeschaltet.
// Unter diesen Anteil der vollen Aufloesung geht der Regler nie. Frueher lag
// er bei 0,22; das war zu hoch, seit die Schrittzahl das Dreifache erreichen
// kann - der Regler stand dann am Anschlag und das Bild trotzdem ausserhalb
// des Budgets. Mit 0,14 hat er wieder Luft, und darunter faengt die
// Schrittzahl an nachzugeben.
const MANDEL_GUETE_MIN = 0.14;
// Unter diesem Durchsatz ist keine Grafikkarte am Werk. Der Wert steht
// zwischen den beiden Groessenordnungen und wird in der Abnahme nachgemessen.
const MANDEL_DURCHSATZ_MIN = 2.5e5;
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
/*
 * Die drei Bildguete-Stufen.
 *
 *   dichte  Obergrenze fuer die Punktdichte der Leinwand. Ein iPad meldet 2,
 *           also viermal so viele Punkte wie noetig - und zwar fuer jede
 *           Schicht, nicht nur fuers Fraktal. Das ist auf einem Tablet der
 *           groesste einzelne Posten.
 *   fraktal Obergrenze fuer den Regler im Fraktal. Ueber 1 ist Ueberabtastung
 *           (schoener), unter 1 wird kleiner gerechnet und hochgezogen.
 *   lava    Durch wieviel die Lavaschicht kleiner gerechnet wird.
 *   rechen  Breite des Wertespeichers, wenn ohne Grafikkarte gerechnet wird.
 *
 * "Hoch" ist genau das, was vorher fest eingebaut war.
 */
export const GUETESTUFEN = {
  hoch: { name: 'Hoch', dichte: 2, fraktal: 2, lava: 3, rechen: 384, budget: 12 },
  mittel: { name: 'Mittel', dichte: 1, fraktal: 0.9, lava: 4, rechen: 288, budget: 7 },
  niedrig: { name: 'Niedrig', dichte: 0.7, fraktal: 0.5, lava: 5, rechen: 192, budget: 4 },
};

let MANDEL_BREITE = 384;
let MANDEL_HOEHE = 240;
let MANDEL_PUNKTE = MANDEL_BREITE * MANDEL_HOEHE;

/**
 * Nach einem Wechsel der Bildguete alles zuruecksetzen, was von der Groesse
 * abhaengt. Das passiert auf Knopfdruck, also darf es ruhig etwas kosten.
 */
export function gueteZuruecksetzen() {
  /*
   * Auch die Grafikkarte bekommt eine neue Chance.
   *
   * Wer die Guete heruntersetzt, sagt damit: Versuch es noch einmal mit
   * weniger. War die Karte bei voller Aufloesung zu langsam und ist deshalb
   * auf den Hauptprozessor zurueckgefallen, waere es falsch, sie bei
   * niedriger Stufe gar nicht mehr zu fragen - dort ist sie der
   * Notfassung deutlich ueberlegen, weil nur sie die Tiefe traegt.
   */
  mandelAufGpu = null;
  mandelSeitGpu = 0;
  mandelStreuung = 40;
  mandelTotzeit = 0;
  mandelLeinwand = null;
  mandelWerte = null;
  mandelWerteAlt = null;
  mandelSchnappschuss = null;
  mandelGrundierenNoetig = true;
  mandelGuete = 0.45;
  mandelDurchsatz = 4e5;
  mandelBremse = 0.6;
  mandelAbstandMittel = 16.7;
  mandelTaktMs = 16.7;
  mandelTaktRing.fill(0);
  mandelGpuZaeh = 0;
  mandelDauer = 8;
  mandelUeberblendung = 0;
}
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
let mandelTiefeGezeichnet = 1.1;
// Die Drehung. Zoom allein ist ein Sog, Zoom mit Drehung ist ein Strudel - und
// erst der haelt den Blick laenger als ein paar Sekunden fest.
let mandelDrehung = 0;
let mandelDrehTempo = 0;
/*
 * Was beim Drop passiert, ist jedes Mal etwas anderes.
 *
 * Immer dasselbe Kunststueck ist nach dem dritten Mal keines mehr - beim
 * vierten wartet niemand mehr darauf. Deshalb liegen fuenf verschiedene in
 * einem Beutel, und es wird gezogen *ohne* Zuruecklegen: Erst wenn alle fuenf
 * dran waren, wird neu gemischt. Reiner Zufall wuerde dasselbe Kunststueck
 * gelegentlich dreimal hintereinander ziehen, und genau das soll nicht
 * passieren.
 */
/*
 * Zwanzig Kunststuecke fuer den Drop - und keines zweimal gleich.
 *
 * Der Reiz liegt in der Erwartung: Wer weiss, dass gleich ein Drop kommt, aber
 * nicht, *was* dann passiert, schaut hin. Fuenf feste Nummern haben diesen
 * Reiz nach einer halben Stunde aufgebraucht - man kennt sie dann.
 *
 * Also zwei Ebenen Abwechslung. Erstens zwanzig verschiedene Griffe. Zweitens
 * bekommt jeder Griff seine Staerke bei jedem Mal neu ausgewuerfelt, in einer
 * Spanne, die zum Griff passt. Derselbe Wirbel ist damit einmal ein kurzer
 * Ruck und einmal eine lange Drehung.
 *
 * Die Griffe bedienen alle dieselben Hebel, die es ohnehin gibt - es kommt
 * also kein einziger Rechenschritt dazu. Die Zahlenpaare sind Spannen.
 */
const DROP_KUNSTSTUECKE = [
  { name: 'wirbel', drehen: [3, 7] },
  { name: 'gegenwirbel', drehen: [-6, -3] },
  { name: 'welle', welle: [0.8, 1] },
  { name: 'doppelwelle', welle: [0.9, 1], enge: [0.5, 0.9] },
  { name: 'kippen', tonDreh: [90, 170] },
  { name: 'kaltkippen', tonDreh: [-170, -90] },
  { name: 'enge', enge: [0.8, 1] },
  { name: 'weite', enge: [-0.45, -0.25] },
  { name: 'sog', schwung: [16, 26] },
  { name: 'stoss', schwung: [26, 38] },
  { name: 'bluete', mandala: [0.9, 1] },
  { name: 'sternbruch', mandala: [0.8, 1], sterneNeu: true },
  { name: 'ranken', fang: [0.8, 1] },
  { name: 'rankenwirbel', fang: [0.6, 0.9], drehen: [2, 4] },
  { name: 'blitzfarbe', farbe: [0.4, 0.6], tonDreh: [40, 90] },
  { name: 'strudel', drehen: [2, 5], schwung: [12, 20] },
  { name: 'mandalasog', mandala: [0.7, 1], schwung: [14, 22] },
  { name: 'wellenbruch', welle: [0.7, 1], sterneNeu: true, mandala: [0.6, 0.9] },
  { name: 'engwirbel', enge: [0.6, 1], drehen: [-4, -2] },
  { name: 'vollbild', mandala: [0.8, 1], fang: [0.5, 0.8], drehen: [1.5, 3.5], enge: [0.3, 0.6] },
];

/** Ein Wert aus der Spanne - oder null, wenn der Griff diesen Hebel nicht zieht. */
function ausSpanne(spanne) {
  if (!spanne) return 0;
  return spanne[0] + Math.random() * (spanne[1] - spanne[0]);
}

let mandelBeutel = [];
let mandelLetztesKunststueck = '';
// Die Nachwirkungen, alle klingen von selbst ab.
let mandelTonDreh = 0;      // Farbkreis verdreht
let mandelEnge = 0;         // Baender zusammengezogen
let mandelWelle = 0;        // Welle, die durch die Baender laeuft
let mandelWelleZeit = 0;
/*
 * Das Mandala.
 *
 * Es ist nicht dauernd an - das waere nach zehn Minuten Tapete. Es *bildet
 * sich*: Die Symmetrie waechst mit der Spannung, also in den sechzehn Takten
 * vor dem Drop, blueht beim Drop auf und loest sich danach wieder ins freie
 * Fraktal. Damit hat das Bild denselben Spannungsbogen wie das Stueck, und
 * der Zuschauer sieht die Vorbereitung, bevor er sie benennen kann.
 */
let mandelMandala = 0;
let mandelMandalaHalt = 0;
/* --- Der Mandala-Katalog --------------------------------------------------
 *
 * Vorher gab es genau eine Faltung - Spiegelung an n Achsen - und "ein anderes
 * Mandala" hiess: eine andere Zahl von Achsen. Das sind acht Varianten
 * derselben Figur.
 *
 * Jetzt sind es vierzehn Faltungsarten mal ihre Achsenzahlen. Was dabei
 * herauskommt, sind wirklich verschiedene Bilder: eine Rosette hat
 * Spiegelachsen, ein Windrad nicht und dreht sich deshalb sichtbar; eine
 * Wabe fuellt die Flaeche, wo eine Rosette Strahlen hat; die Ringe laufen
 * beim Zoomen ineinander statt vorbeizuziehen.
 *
 * Zum Aufwand, denn danach war gefragt: Die Faltung selbst kostet bei allen
 * praktisch dasselbe - sie laeuft einmal je Bildpunkt, davor liegen Tausende
 * Iterationen. Was den Unterschied macht, ist *wohin* sie greift; die
 * Begruendung steht im Schattierer bei falten(). Deshalb steht hier auch keine
 * geschaetzte Kostenzahl: Der wirkliche Preis haengt am Geraet und an der
 * Stelle der Fahrt, und beides misst die Buehne inzwischen selbst. Was sie
 * misst, steht in der Auswahl neben dem Namen.
 *
 * Geloescht wird nichts. Was zu teuer ist fuer das, was es zeigt, schaltet man
 * ab - und das entscheidet, wer davorsteht, nicht ich.
 */
/*
 * Nachtrag nach der ersten Messung - und sie hat die Annahme umgeworfen, mit
 * der ich angefangen habe.
 *
 * Die Vermutung war, dass sich die Faltungen im Aufwand stark unterscheiden
 * und man die teuren aussortieren muss. Gemessen ueber drei Durchlaeufe in
 * wechselnder Reihenfolge liegen sie zwischen 9 und 22 Millisekunden - Faktor
 * zwei, und der Rest ist Streuung. Was wirklich den Unterschied macht, ist
 * *wo* die Fahrt gerade steht: Nah am Rand der Menge braucht jeder Punkt
 * Tausende Schritte, in der Weite ein paar Dutzend. Dieselbe Rosette kostet an
 * zwei Stellen der Fahrt das Fuenffache.
 *
 * Der erste Durchlauf sah anders aus - 46 ms fuer die erste und 3,5 fuer die
 * letzte - und das war kein Befund, sondern ein Messfehler: Die Fahrt wird
 * waehrend des Durchlaufs immer tiefer, also mass die Liste ihre eigene
 * Reihenfolge.
 *
 * Daraus folgt fuers Aussortieren: Es gibt kaum etwas auszusortieren. Also
 * lieber mehr davon - der freie Wert (faltWert) macht aus einer Faltung
 * mehrere Bilder, ohne einen einzigen Zweig mehr im Schattierer.
 */
export const MANDALAS = [
  { id: 'rosette6', name: 'Rosette 6', art: 0, achsen: 6 },
  { id: 'rosette8', name: 'Rosette 8', art: 0, achsen: 8 },
  { id: 'rosette12', name: 'Rosette 12', art: 0, achsen: 12 },
  { id: 'rosette5', name: 'Rosette 5', art: 0, achsen: 5 },
  { id: 'rosette16', name: 'Rosette 16', art: 0, achsen: 16 },
  { id: 'rosette3', name: 'Rosette 3', art: 0, achsen: 3 },
  { id: 'windrad5', name: 'Windrad 5', art: 1, achsen: 5 },
  { id: 'windrad9', name: 'Windrad 9', art: 1, achsen: 9 },
  { id: 'windrad3', name: 'Windrad 3', art: 1, achsen: 3 },
  { id: 'feinrosette6', name: 'Feinrosette 6', art: 2, achsen: 6 },
  { id: 'feinrosette8', name: 'Feinrosette 8', art: 2, achsen: 8 },
  { id: 'feinrosette4', name: 'Feinrosette 4', art: 2, achsen: 4 },
  { id: 'fliese', name: 'Fliese', art: 3, achsen: 4 },
  { id: 'wabe', name: 'Wabe', art: 4, achsen: 6 },
  { id: 'spirale6', name: 'Spirale 6', art: 5, achsen: 6, wert: 0.55 },
  { id: 'spirale8', name: 'Spirale 8', art: 5, achsen: 8, wert: 0.55 },
  { id: 'spiralezart', name: 'Zarte Spirale 6', art: 5, achsen: 6, wert: 0.22 },
  { id: 'spiralescharf', name: 'Scharfe Spirale 8', art: 5, achsen: 8, wert: 1.1 },
  { id: 'gegenspirale', name: 'Gegenspirale 6', art: 6, achsen: 6, wert: 1.3 },
  { id: 'gegenspirale10', name: 'Gegenspirale 10', art: 6, achsen: 10, wert: 0.7 },
  { id: 'droste6', name: 'Droste 6', art: 7, achsen: 6, wert: 2.2 },
  { id: 'droste10', name: 'Droste 10', art: 7, achsen: 10, wert: 2.2 },
  { id: 'drosteweit', name: 'Weite Droste 8', art: 7, achsen: 8, wert: 1.1 },
  { id: 'feinringe', name: 'Feinringe 6', art: 8, achsen: 6, wert: 4.5 },
  { id: 'feinringe12', name: 'Feinringe 12', art: 8, achsen: 12, wert: 6.5 },
  { id: 'stern5', name: 'Stern 5', art: 9, achsen: 5, wert: 0.45 },
  { id: 'stern7', name: 'Stern 7', art: 9, achsen: 7, wert: 0.45 },
  { id: 'stern12', name: 'Stern 12', art: 9, achsen: 12, wert: 0.45 },
  { id: 'sternspitz', name: 'Spitzer Stern 9', art: 9, achsen: 9, wert: 0.78 },
  { id: 'sternstumpf', name: 'Stumpfer Stern 6', art: 9, achsen: 6, wert: 0.2 },
  { id: 'bluete6', name: 'Bluete 6', art: 10, achsen: 6, wert: 0.35 },
  { id: 'bluete9', name: 'Bluete 9', art: 10, achsen: 9, wert: 0.35 },
  { id: 'bluetevoll', name: 'Volle Bluete 5', art: 10, achsen: 5, wert: 0.62 },
  { id: 'kelch6', name: 'Kelch 6', art: 11, achsen: 6, wert: 0.6 },
  { id: 'kelch10', name: 'Kelch 10', art: 11, achsen: 10, wert: 0.4 },
  { id: 'linse6', name: 'Linse 6', art: 12, achsen: 6, wert: 0.55 },
  { id: 'linse10', name: 'Linse 10', art: 12, achsen: 10, wert: 0.55 },
  { id: 'lupe8', name: 'Lupe 8', art: 12, achsen: 8, wert: 0.3 },
  { id: 'trichter6', name: 'Trichter 6', art: 12, achsen: 6, wert: 1.6 },
  { id: 'fliesenstern', name: 'Fliesenstern 8', art: 13, achsen: 8 },
  { id: 'wabenstern', name: 'Wabenstern 6', art: 14, achsen: 6 },
  { id: 'schraube6', name: 'Schraube 6', art: 15, achsen: 6, wert: 0.5 },
  { id: 'schraube9', name: 'Schraube 9', art: 15, achsen: 9, wert: 0.9 },
  { id: 'zackenrad7', name: 'Zackenrad 7', art: 16, achsen: 7, wert: 0.5 },
  { id: 'zackenrad12', name: 'Zackenrad 12', art: 16, achsen: 12, wert: 0.35 },
  { id: 'drallringe6', name: 'Drallringe 6', art: 17, achsen: 6, wert: 0.5 },
  { id: 'drallringe10', name: 'Drallringe 10', art: 17, achsen: 10, wert: 0.9 },
  { id: 'bluetenlinse6', name: 'Bluetenlinse 6', art: 18, achsen: 6, wert: 0.4 },
  { id: 'bluetenlinse9', name: 'Bluetenlinse 9', art: 18, achsen: 9, wert: 0.55 },
  { id: 'sternringe6', name: 'Sternringe 6', art: 19, achsen: 6, wert: 2.2 },
  { id: 'sternringe12', name: 'Sternringe 12', art: 19, achsen: 12, wert: 3.4 },
];

/*
 * Welche davon laufen duerfen.
 *
 * Die Wahl gehoert zum Geraet, nicht zum Track - deshalb liegt sie im Browser
 * und nicht in der Datenbank. Wer auf einem schwachen Rechner die Haelfte
 * abschaltet, will das beim naechsten Start immer noch so haben.
 */
let mandalaAktiv = new Set(MANDALAS.map((m) => m.id));
let mandalaJetzt = MANDALAS[0];
// Was jedes Mandala auf *diesem* Geraet wirklich gekostet hat. Gemessen, nicht
// geschaetzt - die Zahl kommt aus der Uhr in der Grafikkarte.
const mandalaKosten = new Map();

export function mandalasSetzen(ids) {
  const gueltig = MANDALAS.filter((m) => ids.includes(m.id)).map((m) => m.id);
  // Ganz abschalten geht nicht - dann bliebe die Symmetrie einfach aus, und
  // das sieht aus wie ein Fehler. Wer keine will, dreht die Symmetrie herunter.
  mandalaAktiv = new Set(gueltig.length ? gueltig : [MANDALAS[0].id]);
  if (!mandalaAktiv.has(mandalaJetzt.id)) mandalaWechseln();
}

export function mandalasAktive() {
  return [...mandalaAktiv];
}

/** Name, Zustand und gemessener Aufwand - fuer die Auswahl auf der Buehne. */
export function mandalaBericht() {
  return MANDALAS.map((m) => {
    const k = mandalaKosten.get(m.id);
    return {
      ...m,
      an: mandalaAktiv.has(m.id),
      ms: k && k.zahl > 0 ? k.summe / k.zahl : null,
      messungen: k?.zahl ?? 0,
      laeuft: m.id === mandalaJetzt.id,
    };
  });
}

// Wenn eines von aussen festgehalten wird, wechselt nichts mehr. Das ist nur
// fuer den Blick von aussen da - siehe mandalaZwingen().
let mandalaGezwungen = false;

function mandalaWechseln() {
  if (mandalaGezwungen) return;
  const frei = MANDALAS.filter((m) => mandalaAktiv.has(m.id) && m.id !== mandalaJetzt.id);
  const liste = frei.length ? frei : MANDALAS.filter((m) => mandalaAktiv.has(m.id));
  mandalaJetzt = liste[Math.floor(Math.random() * liste.length)] ?? MANDALAS[0];
  mandelSterneZiel = mandalaJetzt.achsen;
}

/**
 * Ein bestimmtes Mandala festhalten - oder mit `null` wieder loslassen.
 *
 * Das braucht am Abend niemand. Es braucht das Werkzeug, das von jedem
 * Mandala ein Bild macht: Ohne Zwang wuerde beim naechsten Drop gewechselt,
 * und aufgenommen waere dann irgendeines. Der Zwang haelt auch die
 * Symmetriestaerke oben, sonst zeigt das Bild eine halb aufgeloeste Figur.
 */
export function mandalaZwingen(id) {
  if (id === null) {
    mandalaGezwungen = false;
    return null;
  }
  const gewaehlt = MANDALAS.find((m) => m.id === id);
  if (!gewaehlt) return null;
  mandalaGezwungen = true;
  mandalaJetzt = gewaehlt;
  mandelSterneZiel = gewaehlt.achsen;
  mandelSterne = gewaehlt.achsen;
  mandelMandalaHalt = 1;
  mandelMandala = 1;
  // Auch die Schwarzblende weg - ein Bild von einem Mandala soll das Mandala
  // zeigen und nicht den Breakdown, in dem es gerade zufaellig steckt.
  mandelLeere = 0;
  mandelLeereZiel = 0;
  mandelFlaute = 0;
  return gewaehlt;
}

/* --- Stille im Bild -------------------------------------------------------
 *
 * Wenn im Stueck nichts los ist, darf auch im Bild nichts los sein. Das ist
 * kein Ausfall, sondern die staerkste Karte, die eine Visualisierung hat: Ein
 * Bild, das nie aufhoert, hat keinen Hoehepunkt mehr. Wer im Breakdown auf
 * Schwarz geht, macht den Drop danach doppelt so gross - und zwar ohne ihn
 * lauter zu machen.
 *
 * Ganz schwarz wird es nie: Ein sehr dunkles Wabern auf dem Schlag bleibt
 * stehen. Es sagt "hier laeuft noch etwas" statt "der Beamer ist aus".
 *
 * Das Zurueckkommen ist der eigentliche Punkt, und dafuer gibt es zwei Wege.
 * Beide enden *genau* auf dem Drop - das koennen wir, weil er in der Analyse
 * steht und nicht erkannt werden muss:
 *
 *   Aufblenden  Das Bild waechst ueber die letzte Phrase zurueck, gefuehrt von
 *               derselben Spannungskurve, die auch den Zoom anzieht. Bei der
 *               Ankunft ist es voll da.
 *   Einschlag   Es bleibt schwarz bis zum letzten Moment und ist auf dem Drop
 *               schlagartig da. Das ist der Hammer - und er sitzt auf dem
 *               Schlag, nicht daneben.
 *
 * Welcher von beiden, entscheidet sich beim Eintritt in den Breakdown und
 * wechselt sich ab. Zweimal derselbe Einschlag hintereinander ist keiner mehr.
 */
// Wie dunkel es im Breakdown hoechstens wird. Nicht ganz null - siehe oben.
const LEERE_TIEF = 0.94;
// Unter dieser Wucht gilt ein Stueck als still, auch ohne Marke. Damit sind
// Intros und ruhige Stellen abgedeckt, die niemand als Breakdown eingetragen
// hat.
const FLAUTE_UNTER = 0.1;
const FLAUTE_AB_SEKUNDEN = 4;

let mandelLeere = 0;
let mandelLeereZiel = 0;
let mandelLeereArt = 'aufblenden';
let mandelImAbbau = false;
let mandelFlaute = 0;
let mandelEinschlag = 0;
let mandelLetztesBild = null;
// Der langsame Atem hinter dem Vorhang, unabhaengig vom Takt.
let mandelWabern = 0;

/**
 * Wie leer das Bild gerade ist - fuer die Abnahme.
 *
 * Von aussen ist das sonst nicht zu sehen: Der Vorhang liegt auf derselben
 * Leinwand wie alles andere, und ein Bild, das gerade schwarz ist, sieht
 * genauso aus wie eines, das kaputt ist. Diese Zahlen trennen die beiden
 * Faelle - und nur mit ihnen laesst sich pruefen, dass das Zurueckkommen
 * wirklich auf dem Drop landet und nicht irgendwann daneben.
 */
export function leereBericht() {
  return {
    leere: mandelLeere,
    ziel: mandelLeereZiel,
    art: mandelLeereArt,
    flaute: mandelFlaute,
    einschlag: mandelEinschlag,
  };
}

/** Die Stille auf Anfang - damit jede Pruefung von derselben Stelle startet. */
export function leereZuruecksetzen() {
  mandelLeere = 0;
  mandelLeereZiel = 0;
  mandelLeereArt = 'aufblenden';
  mandelImAbbau = false;
  mandelFlaute = 0;
  mandelEinschlag = 0;
}

let mandelSterne = 6;
let mandelSterneZiel = 6;
let mandelFang = 0;
let mandelFangHalt = 0;
// Ueberblendung statt Blitz beim Stellenwechsel.
let mandelSchnappschuss = null;
let mandelSchnappStift = null;
let mandelUeberblendung = 0;
let mandelSchnappschussNehmen = false;
// So lange dauert die Ueberblendung in Sekunden.
const MANDEL_UEBERBLEND = 1.5;

/**
 * Ein grober Abdruck des Fraktals - fuer die Abnahme.
 *
 * Von aussen ist an das Bild nicht heranzukommen. Die Fraktalebene ist eine
 * WebGL-Leinwand, und deren Zeichenpuffer ist nach dem Zusammensetzen leer;
 * wer sie von aussen kopiert, bekommt Schwarz. Beim ersten Anlauf sah der
 * Vergleich "sind die sechsundzwanzig Faltungen wirklich verschieden?"
 * deshalb sechsundzwanzigmal dasselbe - naemlich nichts.
 *
 * Der Schnappschuss dagegen wird *innerhalb* des Bildes genommen, im selben
 * Zug wie das Zeichnen, und liegt als gewoehnliche Leinwand vor. Er ist
 * ohnehin da: Die Ueberblendung beim Stellenwechsel braucht ihn.
 */
export function mandelAbdruck(spalten = 48, zeilen = 30) {
  if (!mandelSchnappschuss || !mandelSchnappStift) return null;
  const b = mandelSchnappschuss.width;
  const h = mandelSchnappschuss.height;
  const d = mandelSchnappStift.getImageData(0, 0, b, h).data;
  const aus = new Array(spalten * zeilen).fill(0);
  const zahl = new Array(spalten * zeilen).fill(0);
  for (let y = 0; y < h; y++) {
    const zy = Math.min(zeilen - 1, Math.floor((y / h) * zeilen));
    for (let x = 0; x < b; x++) {
      const zx = Math.min(spalten - 1, Math.floor((x / b) * spalten));
      const i = (y * b + x) * 4;
      aus[zy * spalten + zx] += (d[i] + d[i + 1] + d[i + 2]) / 3;
      zahl[zy * spalten + zx]++;
    }
  }
  return aus.map((s, i) => (zahl[i] ? s / zahl[i] : 0));
}
// Der Regler fuer die Grafikkarte: Anteil der vollen Aufloesung.
/*
 * Vorsichtig anfangen.
 *
 * Der Regler stand beim Start auf 1, also volle Aufloesung. Auf einem
 * Bildschirm mit 1920 Punkten und doppelter Punktdichte sind das 8,3
 * Millionen Bildpunkte, und seit die Schrittzahl aus der Stichprobe kommt,
 * koennen es 15000 Schritte je Punkt sein. Das erste Bild dauerte damit auf
 * einem Spiele-Rechner Sekunden - und der Notausgang schloss daraus, es sei
 * keine Grafikkarte da, und schaltete dauerhaft auf den Hauptprozessor. Von
 * unten kommt der Regler in zwei, drei Bildern nach oben; von oben kam er nie
 * zurueck.
 */
let mandelGuete = 0.45;
/*
 * Der gemessene Durchsatz in Punkt-Schritten je Millisekunde.
 *
 * Das ist die Groesse, die eine Grafikkarte von einem Nachbau in Software
 * unterscheidet - und zwar um Groessenordnungen, nicht um Prozente. Die
 * Bildzeit taugt dafuer nicht: Sie vermengt die Leistung mit der Arbeit, und
 * ein langsames Bild kann ebensogut heissen, dass die Stelle gerade 15000
 * Schritte braucht. Der Durchsatz trennt beides.
 */
let mandelDurchsatz = 4e5;
/*
 * Die Bremse: wieviel von der erlaubten Aufloesung tatsaechlich genutzt wird.
 * Sie folgt allein dem gemessenen Bildabstand und ist damit das einzige Mass,
 * das die asynchrone Grafikkarte nicht ueberlisten kann.
 */
let mandelBremse = 0.6;

/*
 * Die Bremse nachfuehren: an *verpassten Bildern*, nicht an einem Mittelwert.
 *
 * Hier steckte ein Fehler, der das Bild auf dem iPad ueber die Zeit zu Brei
 * gemacht hat, und er ist an zwei Zahlen aus der Anzeige abzulesen gewesen:
 * "16,7 ms" neben "Takt 16,0 ms".
 *
 * Der Vergleich lautete: Ist der mittlere Abstand kleiner als Takt mal 1,02,
 * also kleiner als 16,3 ms? Dann darf die Aufloesung steigen. Dieser Fall kann
 * auf einem Bildschirm, der im Takt laeuft, *nie* eintreten. Der Bildabstand
 * ist nach unten durch den Bildschirm begrenzt - unter 16,7 ms geht nichts.
 * Die Schaetzung des Taktes kommt dagegen aus dem unteren Fuenftel und liegt
 * damit bauartbedingt *unter* der wahren Periode. Da wurde ein Mittelwert
 * gegen ein unteres Fuenftel derselben Verteilung gehalten - der Mittelwert
 * ist zwangslaeufig groesser, und die Bedingung ist zwangslaeufig falsch.
 *
 * Damit war die Bremse eine Ratsche. Jeder Ruckler - ein Drop, ein
 * Stellenwechsel, ein Tiefensprung - drehte sie zu, und nichts drehte sie je
 * wieder auf. Nach einer Viertelstunde stand sie unten. Genau das war zu
 * sehen: fluessige sechzig Bilder, aber Pixelbrei.
 *
 * Der Vergleich zwischen zwei Statistiken derselben Groesse faellt jetzt weg.
 * Gezaehlt wird das eindeutige Ereignis: Ein Bild, das laenger als anderthalb
 * Perioden gebraucht hat, ist ein verpasstes Bild. Jedes verpasste dreht zu,
 * jedes puenktliche dreht ein bisschen auf.
 *
 * Die beiden Faktoren sind kein Gefuehl, sie legen den Arbeitspunkt fest. Im
 * Gleichgewicht muss gelten
 *
 *     (1 - p) * ln(1,0015) + p * ln(0,9646) = 0,
 *
 * und das ergibt p = 0,04. Der Regler pendelt sich also dort ein, wo etwa vier
 * von hundert Bildern verpasst werden: nah genug am Anschlag, dass die
 * Aufloesung stimmt, weit genug davon weg, dass man das Ruckeln nicht sieht.
 * Wer den Arbeitspunkt verschieben will, aendert das Verhaeltnis der beiden
 * Faktoren, nicht ihre Groesse - die bestimmt nur, wie schnell er dort ankommt.
 *
 * Ausgelagert und ausgefuehrt, damit die Abnahme das nachrechnen kann: Der
 * Fehler war von aussen nicht zu sehen - das Bild lief ja fluessig.
 */
export function bremseNachfuehren(bremse, abstandMs, taktMs) {
  const verpasst = abstandMs > taktMs * 1.5;
  return Math.min(1, Math.max(0.05, bremse * (verpasst ? 0.9646 : 1.0015)));
}

let mandelAbstandMittel = 16.7;
/*
 * Zwei Perioden, und sie auseinanderzuhalten ist keine Pedanterie.
 *
 * mandelTaktMs ist die Periode, auf die der Regler *hinarbeitet* - der
 * gemessene Takt, nach oben gezogen vom Bildziel. Das ist die richtige Zahl
 * fuer jede Rechnung im Regler.
 *
 * mandelSchirmTaktMs ist, was der Bildschirm wirklich liefert. Die beiden
 * sind auf einem 145-Hz-Monitor mit Ziel 60 nicht dasselbe: 16,7 gegen 6,9.
 * Die Technikanzeige hat lange die erste Zahl gezeigt und "ein Bildschirm,
 * der 60 hergibt" dazu geschrieben - auf dem Partyrechner also 60 statt 145
 * behauptet, aus reiner Namensverwechslung. Wer daraus schliesst, sein
 * Monitor laufe langsamer als er tut, sucht am falschen Ende.
 */
let mandelTaktMs = 16.7;
let mandelSchirmTaktMs = 16.7;

/* --- Das Bildziel ---------------------------------------------------------
 *
 * Wieviele Bilder je Sekunde ueberhaupt angestrebt werden. Das klingt nach
 * einer Feineinstellung und ist in Wirklichkeit die Stellschraube mit dem
 * groessten Hebel auf die Bildqualitaet.
 *
 * Bisher zielte der Regler immer auf den vollen Bildtakt des Bildschirms. Auf
 * einem gewoehnlichen Monitor ist das richtig. Auf dem Partyrechner mit
 * hundertfuenfundvierzig Hertz heisst es: Der Regler dreht die Aufloesung so
 * lange herunter, bis das Fraktal in 6,9 Millisekunden passt - und verschenkt
 * dafuer mehr als die Haelfte der Bildschaerfe an eine Bildrate, die niemand
 * von sechzig unterscheiden kann. Eine Radeon RX 9070 XT wurde so zu einem
 * Geraet, das angeblich nur die niedrigste Stufe schafft.
 *
 * Null heisst "voller Bildtakt" - fuer den, der es wirklich will.
 *
 * Umgekehrt ist dreissig eine ernsthafte Wahl: Eine Zoomfahrt bei dreissig
 * Bildern mit doppelter Schaerfe sieht besser aus als eine bei sechzig mit
 * halber. Was von beidem stimmt, entscheidet nicht die Zahl, sondern das Auge
 * dessen, der davorsteht - deshalb ist es eine Einstellung und keine Konstante.
 */
let mandelBildziel = 60;
export function bildzielSetzen(bilder) {
  const z = Number(bilder);
  mandelBildziel = Number.isFinite(z) && z > 0 ? Math.min(240, Math.max(20, z)) : 0;
}
export function bildziel() {
  return mandelBildziel;
}
const mandelTaktRing = new Float32Array(64);
let mandelTaktZeiger = 0;
let mandelAufGpu = null;
// Zaehlt aufeinanderfolgende zu langsame Bilder auf der Grafikkarte.
let mandelGpuZaeh = 0;
/*
 * Den Rueckzug auf den Hauptprozessor abstellen.
 *
 * Nur fuer Werkzeuge und Pruefungen. Auf einem Rechner ohne Grafikkarte
 * springt in der Pruefumgebung ein Nachbau in Software ein (SwiftShader). Der
 * ist langsam genug, dass der Notausgang zuschlaegt - und dann zeichnet die
 * Ersatzfassung auf dem Hauptprozessor, die nur die eine, alte Faltung kennt.
 * Ein Bild davon zeigt nicht das Mandala, nach dem gefragt war, sondern immer
 * dieselbe Rosette.
 *
 * Am Abend darf das niemals an sein: Der Rueckzug ist genau die Versicherung
 * dagegen, dass eine schwache Karte das Bild stehenbleiben laesst.
 */
let mandelGpuZwang = false;
export function gpuZwingen(an) {
  mandelGpuZwang = !!an;
  if (an) {
    mandelAufGpu = null;
    mandelGpuZaeh = 0;
  }
}

/**
 * Das Schachbrett ein- oder ausschalten - halb so viele gerechnete Punkte je
 * Bild, ergaenzt aus den vier Nachbarn. Die Farbe entsteht weiter in jedem
 * Bild neu, Palette und Drop-Welle bleiben also unberuehrt.
 */
export function schachbrettSetzen(an) {
  mandelSchachbrett = !!an;
}
export function schachbrett() {
  return mandelSchachbrett;
}
/*
 * Der Wachdienst gegen das tote Bild.
 *
 * Der Fehler, den er verhindert: Die Fahrt zoomte irgendwann in ein
 * unendliches Schwarz und kam nicht wieder heraus. Die Ursache ist die
 * Schrittzahl. Je tiefer die Fahrt, desto laenger braucht ein Punkt am Rand,
 * bis er entkommt; reicht die Obergrenze nicht mehr, gilt *jeder* Punkt als
 * innen liegend, und die ganze Flaeche bekommt dieselbe Farbe. Der bisherige
 * Schutz sass in der Fassung auf dem Hauptprozessor und pruefte den
 * Wertespeicher - die Fassung auf der Grafikkarte kommt dort nie vorbei und
 * hatte also gar keinen.
 *
 * Der neue Wachdienst schaut deshalb auf das *gezeigte* Bild, nicht auf
 * Zwischenwerte: die Streuung der Helligkeit im kleinen Schnappschuss, den es
 * fuer die Ueberblendung ohnehin gibt. Das gilt fuer beide Fassungen und ist
 * genau die Frage, die zaehlt - steht da noch eine Zeichnung?
 *
 * Fuer die Fassung auf dem Hauptprozessor ist die Helligkeitsstreuung immer
 * noch das Mass - dort gibt es keine Bezugsbahn, mit der sich eine Stichprobe
 * rechnen liesse, und die Tiefe bleibt so gering, dass die Schrittzahl nie
 * knapp wird. Auf der Grafikkarte zaehlt stattdessen die Stichprobe.
 */
let mandelStreuung = 40;
/*
 * Ob die Streuung auf dem Weg ueber die Grafikkarte ueberhaupt gerechnet wird.
 *
 * Am Abend nie: Sie wird dort von niemandem gelesen, und sie zu holen kostet
 * einen Rueckgriff auf das fertige Bild - siehe die Begruendung in
 * mandelUeberlagern(). Die Werkzeuge, die ein Bild beurteilen wollen, schalten
 * sie ein und nehmen den Preis in Kauf.
 */
let mandelStreuungMessen = false;
export function streuungMessen(an) {
  mandelStreuungMessen = !!an;
}

/** Die Streuung aus dem Schnappschuss - der teure Teil, bewusst benannt. */
function mandelStreuungRechnen() {
  const feld = mandelSchnappStift.getImageData(60, 60, 360, 180).data;
  let summe = 0;
  let summeQuadrat = 0;
  let proben = 0;
  for (let i = 0; i < feld.length; i += 32) {
    const w = (feld[i] + feld[i + 1] + feld[i + 2]) / 3;
    summe += w;
    summeQuadrat += w * w;
    proben++;
  }
  const mittel = summe / proben;
  mandelStreuung = Math.sqrt(Math.max(0, summeQuadrat / proben - mittel * mittel));
}
let mandelTotzeit = 0;
let mandelWacheZaehler = 0;
/*
 * Seit wann laeuft die aktuelle Stelle?
 *
 * Der Wachdienst braucht zwei Fristen, und beide verhindern denselben Fehler:
 * dass er sich selbst im Kreis jagt. Auf dem iPad war genau das zu sehen - die
 * Fahrt landete auf einer Stelle, die bei geringer Tiefe von Natur aus leer
 * aussieht, der Wachdienst hielt das fuer ein totes Bild, zog weiter, landete
 * wieder flach an, und so fort. Von aussen sieht das aus, als bliebe das
 * Mandelbrot fuer immer winzig.
 *
 *   Schonzeit    Nach einem Wechsel wird ein paar Sekunden nicht geurteilt.
 *                Die neue Stelle darf erst einmal ankommen.
 *   Sperrfrist   Zwischen zwei Wechseln liegen mindestens zwanzig Sekunden.
 *                Damit kann aus dem Wachdienst nie eine Schleife werden, ganz
 *                gleich wie er sich irrt.
 */
let mandelSeitWechsel = 99;
// Ergebnis der letzten Stichprobe und wann sie zuletzt lief.
let mandelSeitProbe = 99;
let mandelInnen = 0;
let mandelSchritteNoetig = 0;
// Die Schrittzahl des zuletzt gezeichneten Bildes - die Stichprobe misst mit ihr.
let mandelSchritteJetzt = 800;
let mandelSpreizung = 1;
let mandelEntkommene = 0;
let mandelProbeMs = 0;
// Wie lange die Grafikkarte schon laeuft, seit sie zuletzt gewaehlt wurde.
let mandelSeitGpu = 0;
/*
 * Seit wann laeuft die Notfassung? Der Rueckzug ist widerruflich.
 *
 * Er war endgueltig, und das hat auf einem Spiele-Rechner den ganzen Abend
 * gekostet: ein Fehlurteil in den ersten Sekunden, und danach lief die
 * Notfassung auf einer Maschine, die das Hundertfache geschafft haette. Alle
 * anderthalb Minuten wird die Karte deshalb noch einmal gefragt. Faellt das
 * Urteil wieder gegen sie, kostet das ein paar Bilder - und wenn es beim
 * ersten Mal falsch war, ist es nach neunzig Sekunden geheilt.
 */
let mandelSeitAufgabe = 1e9;
/*
 * Die Leinwand der Grafikkarte haengt selbst in der Seite - sie wird nicht
 * mehr kopiert.
 *
 * Bisher wurde jedes Bild vom Grafikspeicher in die 2D-Leinwand uebertragen,
 * in voller Bildschirmgroesse. Das ist auf jedem Geraet Arbeit und auf einem
 * Tablet eine der teuersten Zeilen ueberhaupt - und sie ist vollstaendig
 * entbehrlich: Der Browser setzt die Seite ohnehin aus Ebenen zusammen. Liegt
 * die Leinwand als eigene Ebene darin, uebernimmt er das Vergroessern beim
 * Zusammensetzen, und das kostet nichts extra.
 *
 * Die Lava faellt gleich mit weg. Sie lag unter dem Fraktal, das mit 92 bis
 * 100 Prozent Deckung darueber gezeichnet wurde - zu sehen war sie also
 * ohnehin kaum, gerechnet wurde sie trotzdem.
 */
let mandelEbeneDrin = false;

function mandelEbeneSichern(sichtbar) {
  const leinwand = gpuLeinwand();
  if (!leinwand) return;
  if (!mandelEbeneDrin) {
    leinwand.id = 'fraktal';
    Object.assign(leinwand.style, {
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      zIndex: '0',
      // Die kleine Rechenleinwand wird auf Bildschirmgroesse gezogen. Genau
      // wie vorher beim Kopieren, nur macht es jetzt der Browser nebenbei.
      imageRendering: 'auto',
      pointerEvents: 'none',
    });
    const ziel = document.getElementById('visual');
    if (ziel) {
      // Die 2D-Leinwand darueber, das Fraktal darunter.
      ziel.style.zIndex = '1';
      ziel.parentNode.insertBefore(leinwand, ziel);
      mandelEbeneDrin = true;
    }
  }
  leinwand.style.visibility = sichtbar ? 'visible' : 'hidden';
}
const MANDEL_SCHONZEIT = 5;
/*
 * Die Sperrfrist war zwanzig Sekunden lang, weil das Mass unzuverlaessig war
 * und eine Schleife drohte. Mit der Spreizung ist das Mass verlaesslich, also
 * darf die Frist kurz sein - sonst steht ein erkanntermassen totes Bild noch
 * eine Viertelminute da.
 */
const MANDEL_SPERRFRIST = 6;
/*
 * Unter dieser Spreizung der Ausstiegszeiten ist keine Zeichnung mehr da.
 *
 * Der Wert kommt aus der Messung, und er ist nach der Umstellung auf den Ring
 * neu bestimmt worden: Ein toter Ausschnitt ("Miniatur" ab Tiefe 6) liest
 * exakt 0,000 - dort entkommen zwar Punkte, aber alle nach derselben Zahl von
 * Schritten. Der niedrigste Wert auf einer gesunden Fahrt lag bei 0,037. Die
 * alte Schwelle von 0,06 lag *ueber* diesem Wert und haette gesunde Stellen
 * abgeraeumt - genau der Fehler, der schon einmal eine gute Szene abgebrochen
 * hat. 0,02 liegt zwischen beiden.
 */
const MANDEL_SPREIZUNG_MIN = 0.02;
// Unter dieser Streuung der Helligkeit ist das Bild eine Flaeche.
const MANDEL_STREUUNG_MIN = 4;
let mandelPunkte = 0;
/*
 * Das Schachbrett - halb so viele Punkte je Bild.
 *
 * Aus bleibt die Vorgabe, bis auf dem Zielgeraet gemessen ist, dass es dort
 * mehr bringt als es kostet. Der Schalter steht in der Buehne unter "Technik"
 * und im Messstand; die Abnahme setzt ihn ueber schachbrettZwingen().
 */
let mandelSchachbrett = false;
// Anfangstiefe des ersten Ziels - siehe start in MANDEL_ZIELE.
let mandelTiefe = 1.1;
let mandelSchwung = 0;
let mandelZiel = 0;
let mandelNeuangesetzt = 0;
let mandelFarbe = 0;
let mandelFarbSprung = 0;

let mandelLetzterBeat = -1;
/*
 * Die Phrasengrenze - alle zweiunddreissig Schlaege.
 *
 * Sie ist die groesste Einheit, die man im Techno noch *fuehlt*: Auf ihr
 * liegen die Wechsel, dort steigt jedes Element ein und aus. Bisher stand im
 * Bild an dieser Stelle nichts, obwohl das Raster sie kennt. Ein leiser
 * Akzent genuegt - kein Drop, sondern ein Aufatmen: eine Andeutung von
 * Symmetrie, ein kleiner Farbschub. Wer eine Weile hinsieht, lernt das
 * Raster, ohne es zu bemerken, und liest den naechsten Wechsel dann voraus.
 */
let mandelPhasenPuls = 0;
let mandelLetztePhrase = -1;
/*
 * Der Schwerpunkt des Spektrums - wo im Frequenzband die Energie sitzt.
 *
 * Der Pegel sagt, *wie laut* es ist; der Schwerpunkt sagt, *wie es klingt*.
 * Eine dumpfe Bassflaeche und ein schneidendes Lead koennen gleich laut sein
 * und sehen bisher gleich aus. Der Schwerpunkt trennt sie - und weil er eine
 * eigene, vom Pegel unabhaengige Groesse ist, darf er auch einen eigenen
 * Kanal im Bild bekommen: den Farbton, der zum Gegenton hin wandert, wenn es
 * hell klingt.
 */
let mandelKlangfarbe = 0.35;
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
/*
 * Die Farbtabelle - und damit die Stelle, an der die Musik ins Bild kommt.
 *
 * Ein Mandelbrot faerbt sich nach der Ausstiegszeit. Punkte mit gleicher
 * Ausstiegszeit liegen auf geschlossenen Kurven um den Rand der Menge herum -
 * das sind die Baender, die man als Ringe sieht. Die Tabelle sagt, welche
 * Farbe das wievielte Band bekommt.
 *
 * Daraus folgt der Trick: Legt man das Frequenzspektrum auf die Tabelle, wird
 * aus den Baendern ein Spektrumanzeiger, der sich um das Fraktal herumlegt.
 * Der Bass sitzt in den inneren Baendern dicht am Rand, die Hoehen in den
 * aeusseren. Es ist nicht "das Bild wird heller, wenn es laut ist", sondern
 * jede Frequenz hat ihren eigenen Ort im Bild - wie bei einem Oszilloskop,
 * nur dass nicht die Schwingung selbst, sondern ihr Inhalt dasteht.
 *
 * Die Frequenzachse ist logarithmisch geteilt. Linear waere sie fuer Musik
 * falsch: Die untere Oktave belegt dann ein Prozent der Tabelle, obwohl im
 * Techno dort das halbe Stueck stattfindet.
 */
/*
 * Die Farbtabelle in zwei Schritten - weil der teure Teil sich nicht aendert.
 *
 * Sie wurde in *jedem* Bild komplett neu gebaut: 512 Eintraege, jeder mit drei
 * Potenzberechnungen fuer die Gammakorrektur und einer weiteren fuer die
 * logarithmische Frequenzachse. Gut zweitausend teure Aufrufe je Bild, und das
 * bei sechzig Bildern in der Sekunde - auf einem Tablet ein spuerbarer Posten.
 *
 * Dabei aendert sich der teure Teil fast nie. Farbton, Gegenton und die Zahl
 * der Baender bleiben ueber einen ganzen Track gleich; nur die Helligkeit
 * zappelt mit dem Spektrum. Also werden zwei Tabellen vorgerechnet - eine
 * dunkle und eine helle - und je Bild nur noch zwischen ihnen gemischt. Das
 * ist eine Multiplikation je Kanal statt einer Wurzel, und das Ergebnis ist
 * dasselbe: Beide Enden sind korrekt in Oklab gerechnet, und dazwischen liegt
 * die Helligkeit ohnehin fast auf einer Geraden.
 */
let mandelGrundTabelle = null;
let mandelHellTabelle = null;
let mandelBandZuordnung = null;
let mandelTabellenSchluessel = '';

/*
 * Die Toene werden auf zwei Grad gerundet, bevor sie in den Schluessel gehen.
 *
 * Ohne das Runden war die ganze Vorberechnung wertlos: Seit der
 * Klangschwerpunkt den Farbton stetig verschiebt, aendert er sich in jedem
 * Bild um Bruchteile eines Grades - der Schluessel passte also nie, und die
 * teuren Tabellen wurden neu gebaut, seit es zwei sind sogar doppelt so oft
 * wie vorher. Nachgemessen stieg die Bildzeit dadurch von 12 auf 17,8 ms.
 *
 * Zwei Grad sind im Bild nicht zu unterscheiden - die Palette umspannt
 * ohnehin nur siebzig -, aber sie machen aus "nie" ein "fast immer".
 */
const TON_RASTER = 2;

function mandelTabellenSichern(grundtonRoh, akzentRoh, baenderZahl, baender) {
  const grundton = Math.round(grundtonRoh / TON_RASTER) * TON_RASTER;
  const akzent = Math.round(akzentRoh / TON_RASTER) * TON_RASTER;
  const schluessel = `${grundton}|${akzent}|${baenderZahl}|${baender}`;
  if (schluessel === mandelTabellenSchluessel) return;
  mandelTabellenSchluessel = schluessel;
  const n = 512;
  mandelGrundTabelle = new Uint8Array(n * 3);
  mandelHellTabelle = new Uint8Array(n * 3);
  mandelBandZuordnung = new Uint16Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / n;
    let bogen = ((akzent - grundton + 540) % 360) - 180;
    /*
     * Der Bogen wird begrenzt. Ein Gegenton fast gegenueber sieht auf dem
     * Papier reizvoll aus, aber der *Weg* dorthin fuehrt durch alles, was
     * dazwischen liegt - bei Blau nach Gold quer durch Gruen und Oliv, also
     * genau durch das Tief der Vorliebenkurve.
     */
    if (bogen > 70) bogen = 70;
    else if (bogen < -70) bogen = -70;
    // Der Gegenton ist eine schmale Spitze, keine zweite Haelfte.
    const naehe = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
    const ton = (grundton + bogen * naehe * naehe * naehe + 360) % 360;

    // Zyklische Kennlinie: Die Tabelle wird im Kreis gelesen, eine Naht waere
    // eine harte Kante im Bild.
    const grund = 0.1 + 0.34 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2 * baenderZahl));
    const hell = Math.min(0.72, grund + 0.3);
    const buntGrund = 0.055 + 0.085 * Math.min(1, grund * 2.2);
    const buntHell = 0.055 + 0.085 * Math.min(1, hell * 2.2);

    const [r1, g1, b1] = oklabZuRgb(Math.min(0.72, grund), buntGrund, ton);
    const [r2, g2, b2] = oklabZuRgb(hell, buntHell, ton);
    mandelGrundTabelle[i * 3] = r1;
    mandelGrundTabelle[i * 3 + 1] = g1;
    mandelGrundTabelle[i * 3 + 2] = b1;
    mandelHellTabelle[i * 3] = r2;
    mandelHellTabelle[i * 3 + 1] = g2;
    mandelHellTabelle[i * 3 + 2] = b2;

    /*
     * Logarithmische Frequenzachse: die unteren Oktaven bekommen den Platz,
     * den sie im Stueck auch haben. Haengt nur an der Bandzahl, also einmal.
     *
     * Abgebildet wird auf die *nutzbaren* Bins, nicht auf alle. Vorher lief
     * die Achse bis Bin 1023, wo seit je nichts steht: Die oberen elf Prozent
     * der Tabelle waren dauerhaft schwarz, und das sind die aeussersten Ringe
     * des Bildes.
     */
    mandelBandZuordnung[i] = baender
      ? Math.min(baender - 1, Math.round((Math.pow(baender, t) - 1) * (baender / (baender - 1))))
      : 0;
  }
}

function mandelTabelleBauen(grundton, akzent, spektrum, glanz, baenderZahl = 3) {
  const baender = spektrum ? nutzbareBins(spektrum.length) : 0;
  mandelTabellenSichern(grundton, akzent, baenderZahl, baender);
  const n = 512;
  if (!mandelFarbtabelle) mandelFarbtabelle = new Uint8Array(n * 3);
  const aus = mandelFarbtabelle;
  const dunkel = mandelGrundTabelle;
  const licht = mandelHellTabelle;

  for (let i = 0; i < n; i++) {
    let mischung = 0;
    if (baender) {
      const pegel = spektrum[mandelBandZuordnung[i]] / 255;
      mischung = Math.min(1, pegel * pegel * glanz);
    }
    const k = i * 3;
    aus[k] = dunkel[k] + (licht[k] - dunkel[k]) * mischung;
    aus[k + 1] = dunkel[k + 1] + (licht[k + 1] - dunkel[k + 1]) * mischung;
    aus[k + 2] = dunkel[k + 2] + (licht[k + 2] - dunkel[k + 2]) * mischung;
  }
  return aus;
}

/*
 * Oklab statt HSL.
 *
 * HSL ist eine Rechenbequemlichkeit, keine Beschreibung des Sehens. Zwei
 * Farben mit derselben "Helligkeit" sind darin verschieden hell: Ein
 * gesaettigtes Blau bei 50 Prozent wirkt deutlich dunkler als ein Gelb bei 50
 * Prozent. Fuer eine Farbtabelle, die als *Verlauf* gelesen wird, ist das ein
 * echter Mangel - die Baender wirken ungleich breit, und an den Uebergaengen
 * entstehen Kanten, die keine sind.
 *
 * Oklab ist so gebaut, dass gleiche Zahlenschritte gleichen wahrgenommenen
 * Schritten entsprechen. Damit werden die Baender gleichmaessig, der Verlauf
 * glatt, und die Helligkeit laesst sich unabhaengig vom Farbton fuehren -
 * was hier wichtig ist, weil ueber dem Bild Schrift steht.
 */
export function oklabZuRgb(L, C, tonGrad) {
  const h = (tonGrad * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const rl = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gl = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  const gamma = (v) => {
    const x = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(x * 255)));
  };
  return [gamma(rl), gamma(gl), gamma(bl)];
}

/** An eine neue Stelle springen. Nur aufrufen, wenn ein Blitz das deckt. */
function mandelNeuAnsetzen() {
  mandelZiel = (mandelZiel + 1) % MANDEL_ZIELE.length;
  // Jede Stelle hat ihre eigene Anfangstiefe - siehe die Begruendung bei
  // "Miniatur". Eine feste Zahl fuer alle war falsch.
  mandelTiefe = MANDEL_ZIELE[mandelZiel].start ?? 1;
  mandelSeitWechsel = 0;
  // Der neuen Stelle wird zunaechst Gesundheit unterstellt, bis die erste
  // Stichprobe dort gelaufen ist.
  mandelSpreizung = 1;
  mandelInnen = 0;
  mandelSeitProbe = 9;
  // Die alte Stelle darf nicht in die neue hineinsprechen.
  gpuProbeVergessen();
  mandelNeuangesetzt++;
  /*
   * Frueher blitzte hier das Bild weiss auf, um den Sprung zu decken. Das war
   * die falsche Loesung fuer das richtige Problem: Ein Blitz *betont* den
   * Sprung, statt ihn zu verbergen - man sieht nicht mehr, was springt, aber
   * man sieht sehr genau, *dass* etwas springt.
   *
   * Jetzt wird ueberblendet: Das letzte Bild der alten Stelle bleibt stehen
   * und wird ueber anderthalb Sekunden durchsichtig. Beide Bilder sind
   * Zoomfahrten in dieselbe Richtung, also passt die Bewegung zusammen, und es
   * gibt keinen Moment, in dem etwas anderes im Bild steht als ein Fraktal.
   */
  mandelUeberblendung = 1;
  mandelSchnappschussNehmen = true;
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
  mandelTotzeit = 0;
  mandelStreuung = 40;
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

/*
 * Dieselbe Faltung wie im Schattierer, fuer die Fassung auf dem
 * Hauptprozessor.
 *
 * Sie darf hier stehen, ohne die Streckung zu stoeren: Das Falten aendert nur
 * den Winkel und laesst den Abstand zur Mitte unberuehrt - es vertauscht also
 * mit dem Zoom. Ein gefalteter Punkt, der spaeter gestreckt wird, ist
 * derselbe wie ein gestreckter, der gefaltet wird.
 */
let mandelFaltStaerke = 0;
let mandelFaltAchsen = 6;

function faltenCpu(dx, dy) {
  if (mandelFaltStaerke <= 0.001) return null;
  const keil = Math.PI / Math.max(1, mandelFaltAchsen);
  const weite = Math.hypot(dx, dy);
  let winkel = Math.atan2(dy, dx);
  winkel = ((winkel + keil) % (2 * keil) + 2 * keil) % (2 * keil) - keil;
  winkel = Math.abs(winkel);
  const fx = Math.cos(winkel) * weite;
  const fy = Math.sin(winkel) * weite;
  const t = mandelFaltStaerke;
  return [dx + (fx - dx) * t, dy + (fy - dy) * t];
}

/**
 * Eine Phase des Streumusters neu rechnen. Gibt zurueck, wieviele Punkte das
 * waren - die Zahl geht in die Abnahme.
 */
function mandelAuffrischen(phase, linksC, obenC, schrittX, schrittY, schritte) {
  const werte = mandelWerte;
  let gerechnet = 0;
  const mx = (MANDEL_BREITE - 1) / 2;
  const my = (MANDEL_HOEHE - 1) / 2;
  const mitteX = linksC + mx * schrittX;
  const mitteY = obenC + my * schrittY;
  for (let py = 0; py < MANDEL_HOEHE; py++) {
    const ci = obenC + py * schrittY;
    const zeile = (py & 7) * 8;
    const reihe = py * MANDEL_BREITE;
    for (let px = 0; px < MANDEL_BREITE; px++) {
      if (MANDEL_MUSTER[zeile + (px & 7)] !== phase) continue;
      const gefaltet = faltenCpu((px - mx) * schrittX, (py - my) * schrittY);
      werte[reihe + px] = gefaltet
        ? mandelBahn(mitteX + gefaltet[0], mitteY + gefaltet[1], schritte)
        : mandelBahn(linksC + px * schrittX, ci, schritte);
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
  const gx = (MANDEL_BREITE - 1) / 2;
  const gy = (MANDEL_HOEHE - 1) / 2;
  const gMitteX = linksC + gx * schrittX;
  const gMitteY = obenC + gy * schrittY;
  for (let py = 0; py < MANDEL_HOEHE; py += 4) {
    const ci = obenC + py * schrittY;
    for (let px = 0; px < MANDEL_BREITE; px += 6) {
      const gf = faltenCpu((px - gx) * schrittX, (py - gy) * schrittY);
      const wert = gf
        ? mandelBahn(gMitteX + gf[0], gMitteY + gf[1], grob)
        : mandelBahn(linksC + px * schrittX, ci, grob);
      const bisY = Math.min(py + 6, MANDEL_HOEHE);
      const bisX = Math.min(px + 6, MANDEL_BREITE);
      for (let y = py; y < bisY; y++) {
        const reihe = y * MANDEL_BREITE;
        for (let x = px; x < bisX; x++) werte[reihe + x] = wert;
      }
    }
  }
}

/*
 * Wie aus Musik ein Bild wird.
 *
 * Der Anspruch ist nicht "es zuckt, wenn es laut ist". Das kann jeder
 * Pegelbalken, und nach zwei Minuten sieht man weg. Was hier gebaut ist, folgt
 * dem Grundsatz, nach dem Klang-Bild-Zuordnungen ueberhaupt funktionieren:
 * Voneinander unabhaengige Groessen der Musik muessen auf voneinander
 * unabhaengige Groessen des Bildes gehen. Sonst laufen alle Anzeigen im
 * Gleichtakt, und aus fuenf Aussagen wird eine.
 *
 * Fuenf Groessen, fuenf Wege:
 *
 *   Takt          -> Farbwanderung.  Genau ein Durchlauf der Farbtabelle je
 *                    Takt, nicht ungefaehr: Die Phase kommt aus dem Raster der
 *                    Analyse, nicht aus einem erkannten Anschlag. Damit
 *                    marschieren die Farbbaender exakt im Tempo des Stuecks.
 *   Kick / Bass   -> Vorstoss des Zooms. Ein Stoss je Schlag, gewichtet nach
 *                    dem Pegel im untersten Band.
 *   Spektrum      -> Helligkeit der einzelnen Baender (siehe Farbtabelle).
 *   Spannung      -> Drehung *und* Banddichte. Je naeher der Drop, desto
 *                    schneller der Strudel und desto enger die Ringe. Beides
 *                    zieht sich sichtbar zusammen - das ist die Vorbereitung,
 *                    die ein Zuschauer spuert, bevor er sie benennen kann.
 *   Drop          -> Ein Ruck in Drehung, Zoom und Farbe zugleich.
 *
 * Der Takt ist dabei der wichtigste Kanal, und zwar wegen der Genauigkeit:
 * Was auf wenige Hundertstelsekunden mit der Musik zusammenfaellt, liest das
 * Auge als "dazu gehoerig". Was um eine Zehntelsekunde daneben liegt, liest es
 * als zwei Dinge, die zufaellig gleichzeitig passieren. Deshalb kommt die
 * Phase aus dem Raster und nicht aus einer Erkennung im Signal.
 */
// Fuer die Abnahme: den Stellenwechsel von aussen ausloesen. Er kommt im
// Betrieb nur alle paar Minuten vor, und eine Pruefung, die darauf wartet,
// prueft ihn nie.
if (typeof window !== 'undefined') window.__mandelNeuAnsetzen = () => mandelNeuAnsetzen();

function mandelbrotZeichnen(stift, lage) {
  const {
    breite, hoehe, sekunden, takt, spektrum, spannung, wucht, drop,
    palette: paletteA, paletteB, anteilB, abbau = 0, dropInSicht = true,
  } = lage;

  // --- Die Fahrt ---------------------------------------------------------

  if (takt && takt.nummer !== mandelLetzterBeat) {
    mandelLetzterBeat = takt.nummer;
    mandelSchwung += 0.3 + wucht * 0.6 + (takt.aufEins ? 0.4 : 0);
  }

  // Die Phrasengrenze: einmal je zweiunddreissig Schlaege, und nur einmal.
  if (takt) {
    const phrase = Math.floor(takt.beat / 32);
    if (phrase !== mandelLetztePhrase) {
      if (mandelLetztePhrase >= 0) {
        mandelPhasenPuls = 1;
        mandelSchwung += 1.6;
        mandelFarbSprung += 0.06;
      }
      mandelLetztePhrase = phrase;
    }
  }
  mandelPhasenPuls *= Math.pow(0.13, sekunden);

  /*
   * Der Klangschwerpunkt, traege nachgefuehrt. Traege deshalb, weil er von
   * Bild zu Bild springt - was man sehen soll, ist der Charakter einer
   * Passage, nicht das Zappeln einzelner Anschlaege.
   */
  if (spektrum && spektrum.length) {
    let summe = 0;
    let gewicht = 0;
    for (let i = 0; i < spektrum.length; i++) {
      summe += spektrum[i] * i;
      gewicht += spektrum[i];
    }
    const roh = gewicht > 0 ? summe / gewicht / spektrum.length : 0.35;
    mandelKlangfarbe += (roh - mandelKlangfarbe) * Math.min(1, sekunden * 1.1);
  }
  mandelSchwung *= Math.pow(0.08, sekunden);

  if (drop) {
    // Der gemeinsame Teil - den bekommt jeder Drop.
    mandelSchwung += 12;
    mandelDrehTempo += 1.6;
    mandelFarbSprung += 0.3;

    if (!mandelBeutel.length) {
      mandelBeutel = DROP_KUNSTSTUECKE.slice();
      // Mischen, und dabei verhindern, dass der neue Beutel mit demselben
      // Kunststueck anfaengt, mit dem der alte aufgehoert hat.
      for (let i = mandelBeutel.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mandelBeutel[i], mandelBeutel[j]] = [mandelBeutel[j], mandelBeutel[i]];
      }
      if (mandelBeutel[mandelBeutel.length - 1]?.name === mandelLetztesKunststueck) {
        [mandelBeutel[0], mandelBeutel[mandelBeutel.length - 1]] =
          [mandelBeutel[mandelBeutel.length - 1], mandelBeutel[0]];
      }
    }
    const griff = mandelBeutel.pop();
    mandelLetztesKunststueck = griff.name;
    // Jeder Hebel wird nur gezogen, wenn der Griff ihn nennt - und dann mit
    // einer Staerke, die jedes Mal neu ausgewuerfelt wird.
    mandelSchwung += ausSpanne(griff.schwung);
    mandelDrehTempo += ausSpanne(griff.drehen);
    mandelFarbSprung += ausSpanne(griff.farbe);
    mandelTonDreh += ausSpanne(griff.tonDreh);
    mandelEnge = Math.max(-0.45, mandelEnge + ausSpanne(griff.enge));
    if (griff.welle) {
      mandelWelle = ausSpanne(griff.welle);
      mandelWelleZeit = 0;
    }
    if (griff.mandala) mandelMandalaHalt = Math.max(mandelMandalaHalt, ausSpanne(griff.mandala));
    if (griff.fang) mandelFangHalt = Math.max(mandelFangHalt, ausSpanne(griff.fang));
    // Ein anderes Mandala - andere Faltung, andere Ordnung. Nie dasselbe wie
    // eben, sonst sieht man den Wechsel nicht.
    if (griff.sterneNeu) mandalaWechseln();
  }

  // Alle Nachwirkungen klingen ab - unterschiedlich schnell, damit sie sich
  // nicht wie ein einziger Effekt anfuehlen.
  /*
   * Die Symmetrie folgt der Spannung, und der Drop kann sie festhalten. Der
   * Uebergang laeuft traege - eine Symmetrie, die zappelt, ist keine.
   */
  mandelMandalaHalt *= Math.pow(0.55, sekunden);
  // Festgehalten heisst festgehalten: kein Abklingen, sonst zeigt das
  // Werkzeug eine halb aufgeloeste Figur statt des Mandalas.
  if (mandalaGezwungen) mandelMandalaHalt = 1;
  mandelFangHalt *= Math.pow(0.4, sekunden);
  const mandalaZiel =
    Math.min(1, Math.max(spannung * 0.9, mandelMandalaHalt, mandelPhasenPuls * 0.3)) *
    (1 - abbau * 0.8);
  mandelMandala += (mandalaZiel - mandelMandala) * Math.min(1, sekunden * 1.6);
  // Die Achsenzahl wandert weich, damit aus sechs nicht ruckartig zwoelf wird.
  mandelSterne += (mandelSterneZiel - mandelSterne) * Math.min(1, sekunden * 2.2);
  const fangZiel = Math.min(1, Math.max(spannung * 0.35, mandelFangHalt));
  mandelFang += (fangZiel - mandelFang) * Math.min(1, sekunden * 1.2);

  /*
   * Aendert sich die Faltung, ist der ganze Wertespeicher veraltet: Er
   * enthaelt dann Punkte von zwei verschiedenen Symmetrien nebeneinander, und
   * das sieht nicht nach halbem Mandala aus, sondern nach Bruch. Also wird bei
   * merklicher Aenderung neu grundiert - das kostet ein Sechzehntel Bild und
   * laesst die Symmetrie sofort stimmen. (Auf der Grafikkarte stellt sich die
   * Frage nicht, dort wird ohnehin jedes Bild ganz gerechnet.)
   */
  if (Math.abs(mandelMandala - mandelFaltStaerke) > 0.04 ||
      Math.abs(mandelSterne - mandelFaltAchsen) > 0.15) {
    mandelGrundierenNoetig = true;
  }
  mandelFaltStaerke = mandelMandala;
  mandelFaltAchsen = mandelSterne;

  /*
   * Wie leer das Bild sein darf - siehe die Begruendung bei LEERE_TIEF.
   *
   * Zwei Quellen: die eingetragene Breakdown-Marke, und eine gemessene Flaute
   * fuer alles, was niemand eingetragen hat. Die Marke ist die bessere, weil
   * sie weiss, was danach kommt; die Flaute faengt den Rest.
   */
  mandelFlaute = wucht < FLAUTE_UNTER ? mandelFlaute + sekunden : 0;
  const flauteAnteil = Math.min(1, Math.max(0, (mandelFlaute - FLAUTE_AB_SEKUNDEN) / 3));

  const imAbbau = abbau > 0.35;
  if (imAbbau && !mandelImAbbau) {
    // Beim Eintritt entscheiden - und abwechseln, damit der Einschlag einer
    // bleibt.
    /*
     * Der Einschlag nur, wenn ueberhaupt ein Drop kommt.
     *
     * Er besteht daraus, dass es schwarz bleibt *und dann* schlagartig da
     * ist. Ohne den zweiten Teil ist er kein Einschlag, sondern ein Bild, das
     * ausgegangen ist - und in einem Stundenmix kommt genau das vor: Die
     * Analyse setzt eine Breakdown-Marke, findet danach aber minutenlang
     * keinen Drop mehr. Dann wird aufgeblendet, denn das Aufblenden braucht
     * kein Versprechen; es kommt von selbst zurueck, wenn der Abbau abklingt.
     */
    mandelLeereArt =
      mandelLeereArt === 'einschlag' || !dropInSicht ? 'aufblenden' : 'einschlag';
  }
  mandelImAbbau = imAbbau;

  /*
   * Die Spannung fuehrt das Zurueckkommen. Sie steht sechzehn Takte vor dem
   * Drop bei null und auf dem Drop bei eins - eine fertige Blendkurve, die
   * nichts erraten muss.
   */
  const zurueck = Math.min(1, Math.max(0, (spannung - 0.2) / 0.75));
  const weich = zurueck * zurueck * (3 - 2 * zurueck);
  // Auch waehrend des Breakdowns nachgeprueft, nicht nur beim Eintritt: Wenn
  // das Deck wechselt oder der Mix in einen Abschnitt ohne Marken laeuft,
  // verschwindet der Drop, auf den gewartet wurde. Dann blendet das Bild auf,
  // statt auf etwas zu warten, das nicht mehr kommt.
  const haerte = mandelLeereArt === 'einschlag' && dropInSicht;
  const ausMarke = abbau * LEERE_TIEF * (haerte ? 1 : 1 - weich);
  const ausFlaute = flauteAnteil * LEERE_TIEF * (1 - weich);
  mandelLeereZiel = Math.max(ausMarke, ausFlaute);
  // Wer ein Mandala festhaelt, will es sehen. Siehe mandalaZwingen().
  if (mandalaGezwungen) mandelLeereZiel = 0;

  if (drop) {
    // Der Hammer sitzt auf dem Schlag. Was jetzt noch dunkel war, ist weg.
    mandelEinschlag = mandelLeere > 0.35 ? 1 : 0;
    mandelLeere = 0;
    mandelLeereZiel = 0;
    mandelFlaute = 0;
  }
  mandelEinschlag = Math.max(0, mandelEinschlag - sekunden * 2.2);
  mandelWabern += sekunden * 0.9;
  // Hinein langsam, heraus schneller: Dunkelwerden darf man merken,
  // Zurueckkommen soll ziehen.
  const leereTempo = mandelLeereZiel > mandelLeere ? 0.9 : 2.6;
  mandelLeere += (mandelLeereZiel - mandelLeere) * Math.min(1, sekunden * leereTempo);

  mandelTonDreh *= Math.pow(0.32, sekunden);
  mandelEnge *= Math.pow(0.2, sekunden);
  mandelWelle *= Math.pow(0.12, sekunden);
  mandelWelleZeit += sekunden;

  /*
   * Vor dem Drop zieht es an. Die Spannung kommt aus der Analyse und steigt,
   * je naeher der Drop rueckt.
   *
   * Der Schlagstoss geht bewusst nur mit einem kleinen Faktor ein. Mit 0,55
   * bestimmte er die Fahrt: nachgemessen 0,33 Zehnerpotenzen je Sekunde statt
   * der vorgesehenen 0,055 - der Grundzoom war nur noch Beiwerk, und die Tiefe
   * war nach anderthalb Minuten am Ende. Ein Puls soll das Tempo *atmen*
   * lassen, nicht setzen. Mit 0,07 hebt ein Schlag das Tempo kurz um gut die
   * Haelfte an, im Mittel aber nur um ein Drittel des Grundwerts.
   */
  /*
   * Der Breakdown bremst. Er ist die Gegenbewegung zur Spannung: Dort zieht
   * es an, hier laesst es los. Ohne ihn treibt das Bild in der Atempause
   * genauso weiter wie vorher, und das laeuft gegen die Musik.
   */
  const tempo =
    MANDEL_GRUNDZOOM * (1 + spannung * 2.2) * (1 - abbau * 0.72) + mandelSchwung * 0.07;
  /*
   * Die Fahrt rechnet mit einem gedeckelten Zeitschritt.
   *
   * Ein einzelnes langes Bild - ein Aussetzer der Speicherbereinigung, eine
   * andere App, was auch immer - darf die Fahrt nicht nach vorn reissen. Genau
   * das war beim Wabern auf dem iPad der sichtbare Teil: Nicht der Aussetzer
   * selbst faellt auf (ein fehlendes Bild sieht niemand), sondern dass das
   * naechste Bild den doppelten Zoomschritt macht.
   *
   * Gedeckelt wird auf das Doppelte der gemessenen Bildschirmperiode. Auf
   * einem Geraet, das ehrlich mit dreissig Bildern laeuft, ist das wirkungslos
   * - dort sind dreiunddreissig Millisekunden der Normalfall und kein
   * Aussetzer. Auf einem, das mit hundertzwanzig laeuft, greift es frueher.
   * Der Deckel richtet sich also nach dem Geraet und nicht nach einer Zahl,
   * die ich hier hinschreibe.
   *
   * Was dabei verlorengeht, ist ein Stueckchen Fahrt - nicht mehr als die
   * Dauer des Aussetzers. Die Fahrt kommt einen Wimpernschlag spaeter an, und
   * das sieht niemand. Den Sprung sieht man.
   */
  const schrittDeckel = Math.max(0.02, (mandelTaktMs * 2) / 1000);
  const fahrtSekunden = Math.min(sekunden, schrittDeckel);
  mandelTiefe += tempo * fahrtSekunden;

  // Die Drehung: eine ruhige Grundbewegung, die mit der Spannung anzieht, plus
  // der Ruck vom Drop, der wieder ausklingt.
  mandelDrehTempo *= Math.pow(0.25, sekunden);
  // Auch die Drehung mit dem gedeckelten Schritt: Sie und der Zoom bilden
  // zusammen die Spirale. Rueckte nur eines von beiden nach einem Aussetzer
  // weiter, geriete die Spirale aus dem Tritt - das faellt mehr auf als der
  // Aussetzer.
  mandelDrehung +=
    (0.035 + spannung * 0.22 + mandelDrehTempo) * (1 - abbau * 0.6) * fahrtSekunden;

  /*
   * Die Farbwanderung haengt am Raster, nicht an der Uhr.
   *
   * takt.beat ist die fortlaufende Schlagnummer mit Nachkommastelle. Durch
   * acht geteilt ergibt das genau einen Durchlauf der Farbtabelle je zwei
   * Takte - eine Bewegung, die nicht nur ungefaehr zum Tempo passt, sondern
   * mit ihm identisch ist, und die sich an jeder Taktgrenze im selben Zustand
   * wiederfindet. Ohne Raster laeuft eine ruhige Grundbewegung weiter, damit
   * im Leerlauf nicht das Bild einfriert.
   *
   * Ein Durchlauf je *Takt* war der erste Versuch und zu schnell: Bei 126
   * Schlaegen wanderte die ganze Tabelle in unter zwei Sekunden durch, das
   * Bild flirrte dauernd, und der Drop ging darin unter - nachgemessen
   * aenderte sich das Bild im Leerlauf schon um 33 Helligkeitsstufen je
   * Messschritt, beim Drop um 37. Wer immer schreit, kann nicht lauter
   * werden.
   */
  if (takt) {
    mandelFarbe = mandelFarbSprung - takt.beat / 8;
  } else {
    mandelFarbe -= sekunden * 0.12;
  }

  /*
   * Steht eine Flaeche statt einer Zeichnung da, wird zuerst mehr gerechnet
   * und erst danach weitergezogen. Waehrend einer Ueberblendung wird nicht
   * geurteilt - da liegen zwei Bilder uebereinander, und das Mass gilt nicht.
   */
  /*
   * Der Wachdienst - jetzt an der Stichprobe, nicht mehr an der Helligkeit.
   *
   * Das alte Mass war die Streuung der Helligkeit, und es hat sich in *beide*
   * Richtungen geirrt: Eine schoene tiefe Szene hat zu Recht grosse dunkle
   * Flaechen und wenig Streuung - sie wurde abgebrochen, obwohl sie gut war.
   * Ein entartetes Bild hat weiche Baender und genug Streuung - es blieb
   * stehen, obwohl nichts mehr da war. Beides ist auf dem iPad genau so
   * passiert.
   *
   * Der Anteil, der wirklich in der Menge liegt, irrt sich in keine der beiden
   * Richtungen. Und weil die Schrittzahl jetzt aus derselben Stichprobe
   * gefuehrt wird, ist der haeufigste Grund fuer einen hohen Anteil - zu wenig
   * Schritte - schon vorher behoben. Was hier noch ankommt, ist eine Stelle,
   * die wirklich in der Menge versinkt.
   */
  mandelSeitWechsel += sekunden;
  /*
   * Tot ist ein Bild auf *zwei* Arten, und die letzte Fassung kannte nur eine.
   *
   * Sie fragte nur nach dem Anteil, der in der Menge liegt. Das faengt den
   * Fall, dass die Fahrt in der Menge versinkt - aber nicht den umgekehrten,
   * und genau der ist auf dem iPad aufgetreten: ein Ausschnitt weit draussen,
   * wo alle Punkte nach fast derselben Zahl von Schritten entkommen. Da steht
   * ein glattes Feld mit ein paar Ringen, und der Innenanteil ist dabei null -
   * der Wachdienst hat es also nie gesehen und ist nie eingeschritten.
   */
  /*
   * Tot ist ein Bild auf zwei Arten - aber "ganz innen" heisst zweierlei.
   *
   * Seit die Stichprobe mit *der* Schrittzahl misst, die auch gezeichnet wird,
   * sieht ein gesunder tiefer Ausschnitt bei knapper Grenze genauso "ganz
   * innen" aus wie ein wirklich toter. Der Unterschied ist, ob mehr Schritte
   * helfen wuerden. Also wird zuerst erhoeht - das tut die Rueckkopplung bei
   * der Schrittzahl - und erst wenn die Grenze am Budget anschlaegt und es
   * *immer noch* keine Zeichnung gibt, gilt die Stelle als tot.
   *
   * Und die Spreizung urteilt nur, wenn genug Punkte entkommen sind. Sonst ist
   * sie nicht null, sondern unbekannt - das ist ein Unterschied, den die
   * vorige Fassung verwischt hat.
   */
  const grenzeAmAnschlag = mandelSchritteNoetig >= mandelSchritteJetzt * 0.95;
  const versunken = mandelAufGpu
    ? (mandelInnen > 0.94 && grenzeAmAnschlag) ||
      (mandelSpreizung >= 0 && mandelSpreizung < MANDEL_SPREIZUNG_MIN)
    : mandelStreuung < MANDEL_STREUUNG_MIN;
  if (mandelUeberblendung > 0 || mandelSeitWechsel < MANDEL_SCHONZEIT) mandelTotzeit = 0;
  else if (versunken) mandelTotzeit += sekunden;
  else mandelTotzeit = Math.max(0, mandelTotzeit - sekunden * 2);
  if (mandelTotzeit > 1.2 && mandelSeitWechsel > MANDEL_SPERRFRIST) {
    mandelTotzeit = 0;
    mandelNeuAnsetzen();
  }

  // Die Genauigkeit ist am Ende. Auf der Grafikkarte passiert das selten
  // genug, dass eine ruhige Ueberblendung reicht; ohne sie waere hier ein
  // Sprung.
  if (mandelTiefe > (mandelAufGpu ? MANDEL_MAX_TIEFE_GPU : MANDEL_MAX_TIEFE)) {
    mandelNeuAnsetzen();
  }

  // --- Die Farbtabelle, fuer beide Wege dieselbe --------------------------

  /*
   * Die Palette wandert waehrend der Ueberblendung mit - sie springt nicht.
   *
   * Vorher wurde bei fuenfzig Prozent umgeschaltet: Bis dahin die Farben des
   * alten Stuecks, danach die des neuen, in einem Bild. Damit war der
   * Songwechsel im Bild entweder unsichtbar oder ein Ruck - obwohl er das
   * groesste musikalische Ereignis des Abends nach dem Drop ist. Jetzt
   * wandert der Farbton ueber den ganzen Uebergang, auf dem kuerzeren Bogen,
   * und man *sieht* den Wechsel kommen.
   */
  const bogenAB = (a, b2) => a + (((b2 - a + 540) % 360) - 180) * (anteilB ?? 0);
  const grundtonRoh = paletteB
    ? bogenAB(paletteA.grundton, paletteB.grundton)
    : paletteA.grundton;
  // Jedes Bild neu: Sie traegt jetzt das Spektrum, und das aendert sich mit
  // jedem Bild. 512 Stufen kosten weniger als ein Zehntel einer Millisekunde.
  const akzentRoh = paletteB ? bogenAB(paletteA.akzent, paletteB.akzent) : paletteA.akzent;
  /*
   * Klingt es hell, rueckt der Grundton ein Stueck zum Gegenton - klingt es
   * dumpf, faellt er zurueck. Der Ausschlag ist klein gehalten: Es soll wie
   * eine Temperatur wirken, die sich mit der Passage aendert, nicht wie ein
   * Farbwechsel. Der Schwerpunkt liegt bei Techno meist zwischen 0,1 und 0,5;
   * die Mitte bei 0,3 gilt als neutral.
   */
  const waerme = Math.max(-1, Math.min(1, (mandelKlangfarbe - 0.3) * 4));
  const zumAkzent = (((akzentRoh - grundtonRoh + 540) % 360) - 180) * 0.22 * waerme;
  const grundton = grundtonRoh + zumAkzent;
  const akzent = akzentRoh + zumAkzent * 0.4;
  mandelFarbtabelle = mandelTabelleBauen(
    grundton + mandelTonDreh,
    akzent + mandelTonDreh,
    spektrum,
    0.6 + wucht * 0.6,
    Math.round(
      ((paletteA.baender ?? 3) * (1 - (anteilB ?? 0)) +
        ((paletteB?.baender ?? paletteA.baender ?? 3) * (anteilB ?? 0))),
    ),
  );
  mandelFarbtonZuletzt = grundton;

  const stufe = GUETESTUFEN[lage.guetestufe] ?? GUETESTUFEN.hoch;
  const versatzJetzt = mandelFarbe - Math.floor(mandelFarbe);
  // Enger werdende Ringe, je naeher der Drop. Das ist die zweite Haelfte der
  // Vorbereitung - die erste ist die Drehung.
  // Im Breakdown gehen die Ringe auf - das Gegenstueck zum Zusammenziehen
  // vor dem Drop. Das Auge liest Weite als Entspannung.
  const dichte = (0.85 + spannung * 0.85) * (1 + mandelEnge * 1.6) * (1 - abbau * 0.42);

  // --- Der schnelle Weg: Grafikkarte --------------------------------------

  if (mandelAufGpu === false) {
    mandelSeitAufgabe += sekunden;
    if (mandelSeitAufgabe > 90) {
      mandelAufGpu = null;
      mandelSeitGpu = 0;
      mandelGuete = 0.45;
      mandelDurchsatz = 4e5;
      mandelGpuZaeh = 0;
    }
  }
  if (mandelAufGpu === null) mandelAufGpu = gpuBereit();
  if (mandelAufGpu) {
    mandelSeitGpu += sekunden;
    const begonnenGpu = performance.now();
    const zielGpu = MANDEL_ZIELE[mandelZiel];
    /*
     * Die Schrittzahl waechst mit der Tiefe. Anders als beim Hauptprozessor
     * gibt es hier keine Obergrenze aus Genauigkeitsgruenden - nur eine aus
     * Zeitgruenden, und die regelt der Guetefaktor mit.
     */
    /*
     * Alle zwei Sekunden nachsehen, was die Stelle wirklich braucht.
     *
     * Die Obergrenze aus einer Formel in der Tiefe zu schaetzen war der Fehler
     * hinter dem schwarzen Bild: Wieviele Schritte noetig sind, haengt nicht
     * an der Tiefe allein, sondern daran, wo man ist - zwischen zwei Stellen
     * derselben Tiefe liegt leicht der Faktor zehn. Jetzt wird gezaehlt statt
     * geschaetzt, mit einer sehr grosszuegigen Obergrenze auf ein paar hundert
     * Punkten. Die Ursache verschwindet damit, statt behandelt zu werden.
     */
    mandelSeitProbe += sekunden;
    /*
     * Nicht mitten im Drop nachsehen.
     *
     * Die Stichprobe rechnet auf dem Hauptprozessor und kostet ein paar
     * Millisekunden - auf einem Tablet mehr. Faellt sie in den Moment, in dem
     * der Zoom vorschiesst, addiert sie sich zu der Spitze, die der Drop
     * ohnehin macht, und genau dann darf nichts haken. Sie wartet deshalb, bis
     * der Schub abgeklungen ist; ein, zwei Sekunden spaeter ist ihr Ergebnis
     * genauso gueltig.
     */
    const imSchub = mandelSchwung > 1.5;
    /*
     * Immer derselbe Abstand. Frueher wurde bei knappem Befund *haeufiger*
     * nachgesehen - das war genau falsch herum, denn ein knapper Befund heisst
     * dunkles Bild, und dort ist die Stichprobe am teuersten.
     */
    if (!imSchub && mandelSeitProbe > 3) {
      mandelSeitProbe = 0;
      const begonnenProbe = performance.now();
      /*
       * Gemessen wird mit *der* Schrittzahl, die auch gezeichnet wird. Vorher
       * lief die Stichprobe bis 9000, waehrend das Bild bei 800 abbrach - sie
       * beantwortete also eine Frage, die auf dem Schirm gar nicht gestellt
       * wurde, und bezahlte den Unterschied in Rechenzeit.
       */
      const probe = gpuProbe(mandelTiefe, mandelDrehung, mandelSchritteJetzt);
      mandelProbeMs = performance.now() - begonnenProbe;
      if (probe) {
        mandelInnen = probe.innenAnteil;
        /*
         * Die Schrittzahl folgt jetzt einer Rueckkopplung statt einer teuren
         * Vorausmessung: Bleiben viele Punkte bis zum Anschlag gefangen, war
         * die Grenze zu niedrig und wird angehoben; entkommen fast alle frueh,
         * darf sie sinken. Das kostet nichts extra und pendelt sich in ein
         * paar Sekunden ein.
         */
        const zuKnapp = probe.innenAnteil > 0.25;
        mandelSchritteNoetig = zuKnapp
          ? Math.min(15000, Math.max(probe.schritteNoetig, mandelSchritteJetzt * 1.6))
          : Math.max(400, Math.min(mandelSchritteNoetig, probe.schritteNoetig * 1.1));
        mandelSpreizung = probe.spreizung;
        mandelEntkommene = probe.entkommene;
      }
    }

    // Ein Drittel Reserve auf das, was die Stichprobe gesehen hat - und ein
    // Boden, damit ein Bild, das fast ganz innen liegt, trotzdem genug
    // Schritte bekommt, um wieder herauszufinden.
    /*
     * Die Schrittzahl - und diesmal mit einer harten Obergrenze aus dem
     * Zeitbudget.
     *
     * Bisher bestimmte allein die Stichprobe, wieviele Schritte noetig sind,
     * und der Aufloesungsregler musste das ausbaden. Das geht nur bis zu
     * seiner Untergrenze; darunter kann er nicht, und dann laeuft das Bild aus
     * dem Budget. Genau das hat die Fahrt auf dem iPad zaeh gemacht, seit die
     * Stichprobe bis zu 15000 Schritte fordern darf - das Dreifache des
     * frueheren Deckels.
     *
     * Also wird jetzt *beides* gegeneinander abgewogen. Reicht die kleinste
     * zumutbare Aufloesung nicht aus, um die geforderten Schritte im Budget
     * zu rechnen, gibt die Schrittzahl nach. Das kostet Zeichnung an den
     * feinsten Stellen - ein paar Randpunkte gelten dann als innen liegend -,
     * aber es kostet keine Bilder. Ein etwas weicheres Fraktal sieht besser
     * aus als ein ruckelndes.
     */
    const flaecheGpu = Math.max(1, breite * hoehe);
    /*
     * Das Budget waechst mit dem Bildziel.
     *
     * stufe.budget ist in Millisekunden angegeben und wurde bei sechzig
     * Bildern je Sekunde eingestellt. Wer dreissig will, hat je Bild doppelt
     * so lange Zeit - und wenn das Budget davon nichts wuesste, waere die
     * Einstellung wirkungslos: Der Regler haette weiterhin nur zwoelf
     * Millisekunden zu vergeben und die gewonnene Zeit laege brach.
     */
    const zielFaktor = Math.max(0.5, Math.min(3, mandelTaktMs / 16.7));
    const arbeitBudget = mandelDurchsatz * stufe.budget * zielFaktor;
    const punkteUnten = flaecheGpu * MANDEL_GUETE_MIN * MANDEL_GUETE_MIN;
    const schritteBezahlbar = arbeitBudget / punkteUnten;
    /*
     * Steht die Bremse am Anschlag und es reicht immer noch nicht, muss auch
     * die Schrittzahl nachgeben - weniger Aufloesung hilft dann nichts mehr.
     *
     * Der Uebergang laeuft weich. Vorher sprang der Deckel bei einem festen
     * Punkt von 15000 auf 900, und mit ihm sprang die Zeichnung: Ganze
     * Strukturen erschienen und verschwanden von einem Bild zum naechsten.
     * Ein Deckel, der mit der Bremse gleitet, tut dasselbe, ohne dass man es
     * sieht.
     */
    const schritteDeckel = 900 + 14100 * Math.min(1, Math.max(0, (mandelBremse - 0.08) / 0.12));
    const schritteGpu = Math.round(
      Math.min(
        schritteDeckel,
        Math.max(400, schritteBezahlbar),
        Math.max(700, mandelSchritteNoetig * 1.2, 400 + mandelTiefe * 110),
      ),
    );
    gpuFarben(mandelFarbtabelle);
    /*
     * Ist das Bild ohnehin verdeckt, wird es nicht gerechnet.
     *
     * Das ist der schoene Nebeneffekt der Stille: Im Breakdown liegt ein
     * schwarzer Vorhang darueber, und was dahinter passiert, sieht niemand.
     * Die Grafikkarte macht dann Pause - genau in dem Moment, in dem der
     * Regler sich sonst muehsam erholen muesste. Der Zustand laeuft weiter,
     * damit die Fahrt beim Zurueckkommen dort steht, wo sie hingehoert.
     */
    if (mandelLeere > 0.985 && mandelLetztesBild) {
      mandelUeberlagern(
        stift, breite, hoehe, sekunden,
        mandelLetztesBild.leinwand, mandelLetztesBild.breite, mandelLetztesBild.hoehe,
      );
      leereZeichnen(stift, breite, hoehe, takt, paletteA);
      return;
    }
    // Wie breit der gezeigte Ausschnitt in der Zahlenebene ist. Dieselbe
    // Rechnung wie im Zeichner; hier gebraucht fuer die Innenerkennung.
    const spanneJetzt = 1.6 / Math.pow(10, mandelTiefe);
    const bild = gpuZeichnen({
      breite, hoehe,
      ziel: zielGpu,
      tiefe: mandelTiefe,
      dreh: mandelDrehung,
      schritte: schritteGpu,
      versatz: versatzJetzt,
      dichte,
      innenHell: 0.4 + wucht * 0.35,
      welle: mandelWelle,
      welleZeit: mandelWelleZeit,
      mandala: mandelMandala,
      sterne: mandelSterne,
      faltArt: mandalaJetzt.art,
      faltWert: mandalaJetzt.wert ?? 0.5,
      schachbrett: mandelSchachbrett,
      /*
       * Innenerkennung - nur wo sie erlaubt *und* noetig ist.
       *
       * Erlaubt: Sie sucht Wiederholungen im vollen Wert z = Bezugsbahn plus
       * Abstand. In einfacher Genauigkeit ist z auf etwa ein Zehnmillionstel
       * genau; ist der Abstand kleiner als das, verschwindet er in der Summe,
       * und *alle* Bildpunkte haben bitgenau dieselbe Bahn wie die Bezugsbahn.
       * Gefunden wird dann deren Periode statt der des Punktes. Nachgemessen
       * bei Tiefe 16: neunundneunzig Komma neun Prozent des Bildes falsch, und
       * zwar bei jeder Schwelle bis hinunter zu 1e-24 - ein Beleg dafuer, dass
       * die Werte nicht ungefaehr, sondern exakt gleich waren.
       *
       * Die Spanne ist der Abstand, um den es geht. Bei 1e-6 lag der
       * Bildunterschied bei 0,09 Prozent und der Gewinn bei 4,4-fach; eine
       * Zehnerpotenz tiefer waren es 0,63 Prozent Fehler bei 1,17-fach. Der
       * Schnitt liegt also dort, wo er liegt, und nicht, wo er huebsch waere.
       *
       * Noetig: Ohne Innenflaeche gibt es nichts zu sparen. Die Stichprobe
       * misst den Anteil ohnehin.
       */
      innenPruefen: spanneJetzt >= 1e-6 && mandelInnen >= 0.15,
      fangAnteil: mandelFang,
      guete: Math.min(mandelGuete, stufe.fraktal),
      reihe: mandelReihe,
    });
    /*
     * Wieviele Punkte wirklich gerechnet wurden.
     *
     * Frueher war das immer Breite mal Hoehe. Mit dem Schachbrett ist es die
     * Haelfte, und der Unterschied gehoert in die Zahl: Aus mandelPunkte
     * ergibt sich der Durchsatz, aus dem Durchsatz das Budget, und aus dem
     * Budget die Aufloesung. Stuende hier weiter die volle Zahl, waere die
     * Ersparnis sofort wieder verrechnet - der Regler haette geglaubt, die
     * Karte sei doppelt so schnell geworden, und die Aufloesung
     * hochgedreht, bis es wieder ruckelt.
     */
    mandelPunkte = bild.punkte ?? bild.breite * bild.hoehe;
    mandelLetztesBild = bild;

    // Was dieses Mandala auf *diesem* Geraet gekostet hat. Nur echte
    // Messungen zaehlen - ohne die Uhr in der Karte bleibt die Zahl leer.
    if (typeof bild.gpuMs === 'number' && bild.gpuMs > 0) {
      const k = mandalaKosten.get(mandalaJetzt.id) ?? { summe: 0, zahl: 0 };
      k.summe += bild.gpuMs;
      k.zahl++;
      mandalaKosten.set(mandalaJetzt.id, k);
    }

    if (typeof window !== 'undefined') {
      window.__mandel = {
        tiefe: mandelTiefe,
        ziel: zielGpu.name,
        zielNummer: mandelZiel,
        neuangesetzt: mandelNeuangesetzt,
        blitz: mandelUeberblendung,
        ueberblendung: mandelUeberblendung,
        schritte: schritteGpu,
        breite: bild.breite,
        hoehe: bild.hoehe,
        // Was das Schachbrett angeht: ob es lief und wieviele Punkte wirklich
        // gerechnet wurden. Beides braucht die Abnahme, um "halbiert" nicht
        // glauben zu muessen.
        brett: bild.brett === true,
        punkte: mandelPunkte,
        guete: Math.min(mandelGuete, stufe.fraktal),
        durchsatz: mandelDurchsatz,
        bremse: mandelBremse,
        abstandMittel: mandelAbstandMittel,
        taktMs: mandelTaktMs,
        schirmTaktMs: mandelSchirmTaktMs,
        // Nicht abstandMs: das wird erst weiter unten berechnet, und ein Zugriff
        // davor wirft in jedem Bild.
        abstandMs: sekunden * 1000,
        schritteBezahlbar: Math.round(schritteBezahlbar),
        dreh: mandelDrehung,
        dichte,
        versatz: versatzJetzt,
        kunststueck: mandelLetztesKunststueck,
        mandala: mandelMandala,
        sterne: mandelSterne,
        fang: mandelFang,
        aufGpu: true,
        karte: gpuName(),
        reihe: reiheAuskunft(),
        dauerMs: mandelDauer,
        schwung: mandelSchwung,
        // Wie viel Struktur im Bild steckt. Dieselbe Zahl, an der die Wache
        // ein totes Bild erkennt - und die einzige, an der sich von aussen
        // ablesen laesst, ob gerade wirklich etwas zu sehen ist.
        streuung: mandelStreuung,
      };
    }

    mandelEbeneSichern(true);
    // Auf die 2D-Leinwand kommt nur noch, was ueber dem Fraktal liegt: die
    // Ueberblendung beim Stellenwechsel und der Schleier fuer die Schrift.
    mandelUeberlagern(stift, breite, hoehe, sekunden, bild.leinwand, bild.breite, bild.hoehe);
    leereZeichnen(stift, breite, hoehe, takt, paletteA);

    const gebrauchtGpu = Math.max(0.2, performance.now() - begonnenGpu - bild.bahnMs);
    // Punkt-Schritte je Millisekunde. Die Bahnrechnung zaehlt nicht mit - sie
    // laeuft auf dem Hauptprozessor und sagt ueber die Grafikkarte nichts.
    const geleistet = mandelPunkte * schritteGpu;
    mandelDurchsatz = mandelDurchsatz * 0.7 + (geleistet / gebrauchtGpu) * 0.3;
    mandelDauer =
      gebrauchtGpu > mandelDauer
        ? mandelDauer * 0.4 + gebrauchtGpu * 0.6
        : mandelDauer * 0.88 + gebrauchtGpu * 0.12;
    // Derselbe Regler wie beim Hauptprozessor, nur an einem anderen Knopf: Hier
    // ist es die Aufloesung, mit der gerechnet wird. Auf einer richtigen
    // Grafikkarte steht er bei 1 und ruehrt sich nicht; auf einer Notloesung
    // in Software faellt er, und das Bild wird weicher statt ruckelig.
    /*
     * Nach unten darf der Regler viel weiter greifen als nach oben.
     *
     * Mit einer Schranke von 0,86 nach unten brauchte er bei einem Bild von
     * einer Sekunde rund zwanzig Bilder, bis er unten ankam - zwanzig Bilder,
     * die alle eine Sekunde dauerten. Nach oben bleibt er vorsichtig, damit er
     * nicht ueberschwingt; nach unten muss er springen koennen.
     */
    /*
     * Geregelt wird am *tatsaechlichen Bildabstand*, nicht an einer Stoppuhr
     * um den Zeichenbefehl.
     *
     * Das war der Denkfehler hinter der ganzen Zaehigkeit: WebGL ist
     * asynchron. drawArrays gibt zurueck, sobald der Befehl in der
     * Warteschlange steht - nicht, wenn die Grafikkarte fertig ist. Eine
     * Stoppuhr darum misst also die Abgabe, nicht die Arbeit. Der gemessene
     * "Durchsatz" war dadurch massiv zu hoch, der Regler gab immer mehr
     * Aufloesung frei, und die Rechnung kam als niedrige Bildrate zurueck -
     * nachgemessen auf dem iPad 26 ms je Bild bei einem Budget von 4.
     *
     * Der Abstand zwischen zwei Bildern luegt nicht. Er enthaelt alles: die
     * Grafikkarte, die Lava, die Schrift, das Uebertragen. Und er ist genau
     * das, was der Gast sieht.
     */
    const abstandMs = Math.min(200, sekunden * 1000);
    /*
     * Der geglaettete Abstand ist nur noch eine Anzeige, kein Stellsignal.
     *
     * Er hat einmal den Regler getrieben, und das war der Fehler - siehe
     * unten. Zum Ablesen taugt er weiterhin: Der rohe Abstand ist an den
     * Bildschirm gekoppelt und deshalb gestuft, er betraegt eine Periode oder
     * zwei und springt zwischen beidem hin und her. Ungeglaettet waere die
     * Zahl auf der Buehne nicht lesbar.
     */
    mandelAbstandMittel = mandelAbstandMittel * 0.875 + abstandMs * 0.125;

    /*
     * Das Ziel ist der Takt *dieses* Bildschirms, nicht sechzig Bilder.
     *
     * Hier steckte ein Fehler, der ausgerechnet gute Rechner bestraft. Der
     * Regler zielte fest auf 16,7 ms. Auf einem Bildschirm mit 144 Hz kommt
     * der Bildtakt aber alle 6,9 ms - der Regler sah "viel zu schnell" und
     * drehte die Aufloesung hoch, bis ein Bild 16,7 ms brauchte. Damit wird
     * jede zweite Aktualisierung verpasst, und zwar unregelmaessig: Das ist
     * genau das Ruckeln, das auf einem Spiele-Rechner gemeldet wurde.
     *
     * Erfragen laesst sich der Takt nicht, also wird er geschaetzt - aber
     * nicht aus dem kleinsten je gesehenen Abstand. Dieser erste Versuch war
     * falsch, und ein iPhone 14 Pro Max hat es gezeigt: Das Geraet hat
     * ProMotion, also eine Bildwiederholrate, die *das Geraet selbst*
     * zwischen 10 und 120 Hz verschiebt. Angezeigt wurden 14,4 ms. Diese Zahl
     * ist keine Periode irgendeines Bildschirms - sie liegt zwischen 8,3 und
     * 16,7 und entsteht als Mischung: ein Teil der Bilder kommt im
     * 120-Hz-Takt, der groessere Teil nicht. Das Minimum greift sich davon
     * die schnellsten heraus und behauptet, so laufe das Geraet. Auf einem
     * Bildschirm mit fester Rate waere das noch verzeihlich, auf einem mit
     * gleitender Rate ist es schlicht die falsche Frage.
     *
     * Gefragt wird deshalb nach dem unteren Fuenftel von vierundsechzig
     * Messungen. Das ist eine Aussage, die haelt: Ein Ziel von 8,3 ms kommt
     * nur zustande, wenn wenigstens jedes fuenfte Bild wirklich so schnell
     * ankommt - dann laeuft der Bildschirm auch tatsaechlich mit 120 Hz, und
     * es ist richtig, darauf hinzuarbeiten. Ein einzelner kurzer Abstand
     * dagegen zieht nichts mehr mit.
     *
     * Die beiden Klammern sind nur Notbremsen, keine Ziele: Nach unten 4 ms,
     * weil darunter kein Bildschirm laeuft (240 Hz sind 4,2). Nach oben
     * 16,8 ms, damit ein Rechner, der nie mehr als dreissig Bilder schafft,
     * daraus nicht schliesst, dreissig seien das Ziel - sonst hoert der
     * Regler auf zu bremsen. Ein echtes 8,3-ms-Geraet geht durch beide
     * Klammern unveraendert hindurch.
     */
    mandelTaktRing[mandelTaktZeiger] = abstandMs;
    mandelTaktZeiger = (mandelTaktZeiger + 1) % mandelTaktRing.length;
    if (mandelTaktZeiger % 20 === 0) {
      const sortiert = Array.from(mandelTaktRing).filter((x) => x > 0).sort((a, b) => a - b);
      if (sortiert.length >= 16) {
        const fuenftel = sortiert[Math.floor(sortiert.length * 0.2)];
        const gemessen = Math.min(16.8, Math.max(4, fuenftel));
        /*
         * Ohne den Deckel von 16,8: Der ist eine Notbremse fuer den Regler
         * ("dreissig sind nicht das Ziel") und hat in einer Auskunftszahl
         * nichts zu suchen. Was hier steht, ist das untere Fuenftel der
         * Bildabstaende - auf einem Geraet, das den Bildschirm nicht
         * ausfaehrt, also eher die eigene Rate als die des Bildschirms. Es
         * ist die beste Zahl, die der Browser hergibt; eine echte Auskunft
         * ueber die Bildwiederholrate gibt es im Web nicht.
         */
        mandelSchirmTaktMs = Math.max(4, fuenftel);
        /*
         * Und jetzt das Bildziel darueber. Es hebt den Takt an, es senkt ihn
         * nie: Wer sechzig will, bekommt auf einem 145-Hz-Bildschirm 16,7 ms
         * statt 6,9 - und damit die Aufloesung, die dazwischen liegt. Auf
         * einem 60-Hz-Bildschirm aendert es nichts, weil dort schon 16,7
         * gemessen wird.
         */
        mandelTaktMs =
          mandelBildziel > 0 ? Math.max(gemessen, 1000 / mandelBildziel) : gemessen;
      }
    }
    mandelBremse = bremseNachfuehren(mandelBremse, abstandMs, mandelTaktMs);

    /*
     * Die alte Vorhersage aus dem Durchsatz bleibt als *Obergrenze* stehen -
     * sie verhindert, dass beim Start oder nach einem Stellenwechsel ein
     * unbezahlbares Bild abgeschickt wird, bevor der Bildabstand ueberhaupt
     * etwas sagen kann. Was zaehlt, ist der kleinere der beiden Werte.
     *
     * Der bisherige Regler verglich nur die letzte Bildzeit mit dem Budget.
     * Das reicht, solange die Arbeit je Bildpunkt gleich bleibt - tut sie aber
     * nicht mehr, seit die Schrittzahl aus der Stichprobe kommt und zwischen
     * 700 und 15000 springt. Steigt sie um das Zwanzigfache, braucht der alte
     * Regler ein Dutzend Bilder, um hinterherzukommen, und die sind alle zu
     * langsam.
     *
     * Aus gemessenem Durchsatz und bekannter Schrittzahl laesst sich die
     * Aufloesung dagegen direkt ausrechnen, bevor das Bild gerechnet wird.
     * Das Kostenmodell ist diesmal zulaessig, weil es sich am Ergebnis
     * kalibriert: Vorhergesagt und gemessen wird dieselbe Groesse.
     */
    mandelSchritteJetzt = schritteGpu;
    const bezahlbar = arbeitBudget / Math.max(1, schritteGpu);
    const gueteWunsch = Math.sqrt(bezahlbar / flaecheGpu);
    // Traege nach oben, zuegig nach unten - ein zu grosses Bild kostet sofort,
    // ein zu kleines nur Schaerfe.
    const regelGpu = gueteWunsch > mandelGuete ? 1.08 : 0.7;
    /*
     * Die Obergrenze liegt bei 2, nicht bei 1.
     *
     * Ueber der Bildschirmaufloesung zu rechnen und beim Zeichnen zu
     * verkleinern ist Ueberabtastung: vier gerechnete Punkte je gezeigtem.
     * Genau das braucht ein Fraktal, dessen Baender in der Tiefe feiner werden
     * als ein Bildpunkt. Auf einer richtigen Grafikkarte steht der Regler
     * deshalb oben und rechnet vierfach; wo die Kraft fehlt, faellt er unter 1
     * und das Bild wird weicher statt ruckelig.
     */
    /*
     * Das Bildziel hebt auch die Obergrenze - sonst ist es wirkungslos.
     *
     * Auf dem iPad zeigte sich das sofort: Guete "Mittel" deckelt bei 0,9,
     * und das Geraet erreicht 0,9 schon bei sechzig Bildern. Wer dann auf
     * dreissig stellt, bekommt die doppelte Zeit je Bild geschenkt und kann
     * sie nicht ausgeben - das Bild wird nur ruckeliger, nicht schaerfer. Das
     * waere eine Einstellung, die ausschliesslich schadet.
     *
     * Doppelte Zeit heisst Wurzel zwei mal so viel Kantenlaenge, also die
     * doppelte Punktzahl. Genau das ist der Tausch, den die Einstellung
     * verspricht: weniger Bilder, dafuer schaerfere.
     */
    const zielSchaerfe = Math.max(1, Math.min(2, Math.sqrt(mandelTaktMs / 16.7)));
    const obergrenze = stufe.fraktal * zielSchaerfe;
    mandelGuete = Math.min(
      obergrenze,
      obergrenze * mandelBremse,
      Math.max(MANDEL_GUETE_MIN, Math.min(gueteWunsch, mandelGuete * regelGpu)),
    );

    /*
     * Der Notausgang.
     *
     * Steht der Regler unten und das Bild braucht trotzdem noch ein
     * Vielfaches seines Budgets, dann ist da keine Grafikkarte, sondern ein
     * Nachbau in Software - so laeuft es zum Beispiel in der Abnahme, wo
     * gemessene 900 ms je Bild herauskamen. In dem Fall ist die Fassung auf
     * dem Hauptprozessor die bessere: weniger Tiefe, aber fluessig. Nach
     * zwanzig aufeinanderfolgenden zu langsamen Bildern wird umgeschaltet und
     * nicht mehr zurueck - ein Hin und Her waere schlimmer als beide Fassungen
     * einzeln.
     */
    /*
     * Der Notausgang haengt am Durchsatz, nicht an der Bildzeit.
     *
     * "Ein Bild ueber 250 ms" war das falsche Kennzeichen. Es trifft auch
     * einen Spiele-Rechner, sobald die Stelle viele Schritte braucht oder die
     * Aufloesung noch zu hoch steht - und weil der Rueckzug endgueltig war,
     * lief danach die Notfassung auf einer Maschine, die das Hundertfache
     * geschafft haette. Genau das ist passiert.
     *
     * Der Durchsatz trennt sauber: Eine Grafikkarte schafft Millionen
     * Punkt-Schritte je Millisekunde, ein Nachbau in Software einige
     * zehntausend. Dazwischen liegen Groessenordnungen, keine Prozente.
     */
    if (mandelDurchsatz < MANDEL_DURCHSATZ_MIN && mandelSeitGpu > 2) mandelGpuZaeh++;
    else mandelGpuZaeh = 0;
    if (mandelGpuZaeh > 8 && !mandelGpuZwang) {
      mandelAufGpu = false;
      mandelSeitAufgabe = 0;
      mandelTiefe = Math.min(mandelTiefe, MANDEL_MAX_TIEFE - 0.5);
      mandelGrundierenNoetig = true;
      mandelDauer = 8;
      if (typeof console !== 'undefined') {
        console.warn('Mandelbrot: Grafikkarte zu langsam, zurueck auf den Hauptprozessor.');
      }
    }
    return;
  }

  // --- Speicher und Regler -----------------------------------------------
  //
  // Leinwand, Bildspeicher und Wertespeicher werden *einmal* angelegt.
  //
  // Vorher wurde bei jeder Aufloesungsaenderung ein neues Canvas samt
  // ImageData erzeugt. Weil der Regler die Aufloesung staendig leicht
  // nachzog, passierte das dauernd - und jede dieser Neuanlagen war ein
  // Ausreisser von ueber 40 ms mitten im laufenden Bild.
  if (!mandelLeinwand) {
    MANDEL_BREITE = stufe.rechen;
    MANDEL_HOEHE = Math.round((stufe.rechen * 5) / 8);
    MANDEL_PUNKTE = MANDEL_BREITE * MANDEL_HOEHE;
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
  // Auch hier das Bildziel einrechnen, aus demselben Grund wie auf dem Weg
  // ueber die Grafikkarte: Wer dreissig Bilder will, hat je Bild doppelt so
  // viel Zeit, und die soll auch ankommen.
  const zielBudget = stufe.budget * Math.max(0.5, Math.min(3, mandelTaktMs / 16.7));
  const nachregeln = Math.min(1.12, Math.max(0.78, Math.sqrt(zielBudget / Math.max(1, mandelDauer))));
  mandelPhasenProBild = Math.min(16, Math.max(0.6, mandelPhasenProBild * nachregeln));


  // --- Die Rechnung ------------------------------------------------------

  const begonnen = performance.now();
  const zielPunkt = MANDEL_ZIELE[mandelZiel];
  const spanne = 1.6 / Math.pow(10, mandelTiefe);
  const seitenverhaeltnis = MANDEL_HOEHE / MANDEL_BREITE;
  const schrittX = (2 * spanne) / MANDEL_BREITE;
  const schrittY = (2 * spanne * seitenverhaeltnis) / MANDEL_HOEHE;
  const linksC = zielPunkt.zx - spanne + schrittX * 0.5;
  const obenC = zielPunkt.zy - spanne * seitenverhaeltnis + schrittY * 0.5;

  {
    /*
     * Ein zu grosser Sprung laesst sich nicht mehr strecken.
     *
     * Die Streckung holt jeden Punkt aus dem vorigen Bild. Das geht, solange
     * der Zoom je Bild nur wenige Prozent zulegt. Nach einem Drop schiesst er
     * um ein Vielfaches vor - dann liegt der ganze sichtbare Ausschnitt in
     * ein paar Punkten des alten Bildes, und was herauskommt, ist kein Zoom
     * mehr, sondern Schmier. Nachgemessen stand danach eine harte Naht mitten
     * im Bild. Ab dem Anderthalbfachen wird deshalb lieber neu grundiert.
     */
    if (Math.pow(10, mandelTiefe - mandelTiefeGezeichnet) > 1.5) {
      mandelGrundierenNoetig = true;
    }
  }

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
      blitz: mandelUeberblendung,
      ueberblendung: mandelUeberblendung,
      schritte,
      breite: MANDEL_BREITE,
      frischePunkte: mandelFrischePunkte,
      phasenProBild: mandelPhasenProBild,
      innenAnteil,
      // Auf dem Hauptprozessor wird nicht gedreht - die Streckung des
      // Wertespeichers setzt einen reinen Zoom voraus. Hier steht deshalb
      // nichts und nicht etwa eine Null, die eine Drehung vortaeuschte.
      dreh: null,
      // Damit die Technikanzeige den Fall "rechnet, aber auf dem
      // Hauptprozessor" von "laeuft gar nicht" unterscheiden kann.
      aufGpu: false,
      guete: 1,
      bremse: 1,
      durchsatz: mandelDurchsatz,
      abstandMs: sekunden * 1000,
      taktMs: mandelTaktMs,
      schirmTaktMs: mandelSchirmTaktMs,
      mandala: mandelMandala,
      sterne: mandelSterne,
      fang: mandelFang,
      streuung: mandelStreuung,
      kunststueck: mandelLetztesKunststueck,
      versatz: mandelFarbe - Math.floor(mandelFarbe),
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

  // Ohne Grafikkarte gibt es keine eigene Ebene - dann wie bisher uebertragen.
  mandelEbeneSichern(false);
  mandelAufsBild(stift, mandelLeinwand, MANDEL_BREITE, MANDEL_HOEHE, breite, hoehe, wucht, sekunden);
}

/*
 * Das fertige Fraktal auf den Bildschirm bringen - fuer beide Wege dieselbe
 * Stelle, damit Ueberblendung und Schleier nicht zweimal dastehen und
 * auseinanderlaufen.
 */
/*
 * Was ueber dem Fraktal liegt, wenn es als eigene Ebene laeuft: die
 * Ueberblendung beim Stellenwechsel und der Schleier fuer die Schrift. Das
 * Fraktal selbst wird nicht angefasst - es steht schon da.
 */
/*
 * Der Vorhang, und was darauf noch zu sehen ist.
 *
 * Ganz schwarz waere falsch: Ein Bild, das vollstaendig verschwindet, sieht
 * nicht nach Absicht aus, sondern nach Ausfall - und im Raum fragt der Erste
 * nach zehn Sekunden, ob der Beamer noch geht. Also bleibt ein sehr dunkles
 * Wabern stehen, das auf dem Schlag atmet. Es reicht, um zu sagen: hier laeuft
 * noch etwas, es ist nur gerade still.
 *
 * Und beim Einschlag ein kurzes helles Aufreissen - das ist der einzige
 * Moment, in dem hier etwas blitzt, und er sitzt auf dem Drop.
 */
function leereZeichnen(stift, breite, hoehe, takt, palette) {
  if (mandelLeere <= 0.002 && mandelEinschlag <= 0.002) return;

  stift.save();
  stift.fillStyle = `rgba(0,0,0,${mandelLeere})`;
  stift.fillRect(0, 0, breite, hoehe);

  if (mandelLeere > 0.05) {
    // Das Wabern: ein sehr weiter, sehr dunkler Schein, der auf dem Schlag
    // aufgeht und dazwischen zurueckfaellt.
    /*
     * Der Puls wird abgesichert, und das ist keine Vorsicht auf Vorrat.
     *
     * createRadialGradient wirft, wenn der Radius keine Zahl ist, und der
     * Wurf faellt aus dem ganzen Bild heraus - jedes Bild, nicht nur eines.
     * Ein einziges fehlendes Feld im Taktobjekt reicht dafuer; genau das ist
     * beim Schreiben dieser Pruefung passiert, weil dort "phase" stand und
     * hier "imBeat" gelesen wird. Auf der Buehne haette dasselbe geheissen:
     * Bild weg, bis jemand neu laedt.
     */
    const roh = Number(takt?.imBeat);
    const puls = Number.isFinite(roh) ? Math.exp(-roh * 4.5) : 0.3;
    const atem = 0.5 + 0.5 * Math.sin(mandelWabern);
    const r = Math.min(breite, hoehe) * (0.22 + puls * 0.16 + atem * 0.05);
    const [rr, gg, bb] = oklabZuRgb(0.55, 0.11, palette?.grundton ?? 250);
    const schein = stift.createRadialGradient(breite / 2, hoehe / 2, 0, breite / 2, hoehe / 2, r);
    schein.addColorStop(0, `rgba(${rr},${gg},${bb},${mandelLeere * (0.055 + puls * 0.085)})`);
    schein.addColorStop(1, 'rgba(0,0,0,0)');
    stift.globalCompositeOperation = 'lighter';
    stift.fillStyle = schein;
    stift.fillRect(0, 0, breite, hoehe);
  }

  if (mandelEinschlag > 0.002) {
    stift.globalCompositeOperation = 'lighter';
    stift.fillStyle = `rgba(255,255,255,${mandelEinschlag * mandelEinschlag * 0.34})`;
    stift.fillRect(0, 0, breite, hoehe);
  }
  stift.restore();
}

function mandelUeberlagern(stift, breite, hoehe, sekunden, quelle, qb, qh) {
  stift.save();
  stift.imageSmoothingEnabled = true;
  if (mandelUeberblendung > 0 && mandelSchnappschuss) {
    stift.globalAlpha = mandelUeberblendung;
    stift.drawImage(
      mandelSchnappschuss, 0, 0, mandelSchnappschuss.width, mandelSchnappschuss.height,
      0, 0, breite, hoehe,
    );
    mandelUeberblendung = Math.max(0, mandelUeberblendung - sekunden / MANDEL_UEBERBLEND);
  } else {
    if (!mandelSchnappschuss) {
      mandelSchnappschuss = document.createElement('canvas');
      mandelSchnappschuss.width = 480;
      mandelSchnappschuss.height = 300;
      mandelSchnappStift = mandelSchnappschuss.getContext('2d');
    }
    /*
     * Hier stand ein Rueckgriff auf das fertige Bild - jedes Bild eine Kopie
     * der Grafikleinwand in eine 2D-Leinwand, jedes sechste zusaetzlich ein
     * getImageData ueber 64800 Punkte. Beides ist weg, und beides war ein
     * Fehler.
     *
     * Gefunden hat es eine Bildschirmaufnahme vom iPad: Das Bild wurde "in
     * regelmaessigen Abstaenden auseinandergetrieben", und zwar nicht zum
     * Beat. Nachgemessen an der Aufnahme lagen die Spitzen bei 0,100 s,
     * 0,200 s, 0,300 s - exakt zehn Hertz. Bei sechzig Bildern je Sekunde ist
     * das jedes sechste Bild, und im ganzen Zeichner gab es genau einen
     * Vorgang mit dieser Periode: diesen hier.
     *
     * Warum er weh tut: Ein Apple-Grafikchip rechnet kachelweise und
     * verzoegert. Wer das fertige Bild zurueckliest, zwingt ihn, die ganze
     * Kachelpipeline vorher leerzulaufen. Das kostet - und wenn das Bild
     * ohnehin knapp im Takt liegt, reisst es genau dieses eine Bild ueber die
     * Zeit. Das naechste bekommt dann einen doppelt so grossen Zeitschritt,
     * und weil die Fahrt mit "Tiefe plus Tempo mal Zeitschritt" rechnet,
     * springt der Zoom. Zehnmal je Sekunde ein Sprung - das ist das Wabern.
     *
     * Und der eigentliche Skandal: Auf dem Weg ueber die Grafikkarte wurde das
     * Ergebnis nie benutzt. Der Wachdienst urteilt dort seit der Umstellung
     * nach mandelInnen und mandelSpreizung, beide aus der Stichprobe auf dem
     * Hauptprozessor, die die Bezugsbahn nachrechnet statt Bildpunkte zu
     * lesen. mandelStreuung wird nur noch von der Notfassung gebraucht.
     * Gerechnet und weggeworfen, zehnmal je Sekunde.
     *
     * Der Schnappschuss selbst bleibt - die Ueberblendung beim Stellenwechsel
     * braucht ihn -, aber er wird nur noch geholt, wenn er gebraucht wird.
     */
    /*
     * Die Kopie bleibt, der Rueckgriff geht.
     *
     * Der Schnappschuss muss in jedem Bild frisch sein: Beim Stellenwechsel
     * wird das *vorige* Bild ueberblendet, und wer ihn nur gelegentlich holt,
     * blendet ein Bild von vor einer Zehntelsekunde ein oder - noch schlimmer,
     * wenn er ihn erst beim Wechsel holt - das neue gegen sich selbst.
     *
     * Dass die Kopie bezahlbar ist, sagt dieselbe Messung, die den Rueckgriff
     * ueberfuehrt hat: Waere sie der teure Teil, waere *jedes* Bild gleich
     * langsam und es gaebe gar kein Zehn-Hertz-Muster. Es gibt eines, also
     * liegt es an dem, was nur jedes sechste Bild passiert.
     */
    mandelSchnappStift.drawImage(quelle, 0, 0, qb, qh, 0, 0, 480, 300);
    mandelSchnappschussNehmen = false;
    if (mandelStreuungMessen && ++mandelWacheZaehler % 6 === 0) mandelStreuungRechnen();
  }
  mandelSchleier(stift, breite, hoehe);
  stift.restore();
}

/** Oben und unten abdunkeln, damit die Schrift lesbar bleibt. */
function mandelSchleier(stift, breite, hoehe) {
  stift.globalAlpha = 1;
  const schleier = stift.createLinearGradient(0, 0, 0, hoehe);
  schleier.addColorStop(0, 'rgba(0,0,0,0.62)');
  schleier.addColorStop(0.16, 'rgba(0,0,0,0.06)');
  schleier.addColorStop(0.66, 'rgba(0,0,0,0.06)');
  schleier.addColorStop(1, 'rgba(0,0,0,0.72)');
  stift.fillStyle = schleier;
  stift.fillRect(0, 0, breite, hoehe);
}

function mandelAufsBild(stift, quelle, qb, qh, breite, hoehe, wucht, sekunden) {
  stift.save();
  stift.imageSmoothingEnabled = true;
  stift.imageSmoothingQuality = 'high';
  const deckung = 0.92 + wucht * 0.08;
  stift.globalAlpha = deckung;
  stift.drawImage(quelle, 0, 0, qb, qh, 0, 0, breite, hoehe);

  /*
   * Die Ueberblendung beim Stellenwechsel.
   *
   * Das alte Bild liegt noch im Schnappschuss und wird darueber gelegt, mit
   * abnehmender Deckung. Beide Bilder sind Zoomfahrten in dieselbe Richtung,
   * also passt die Bewegung zusammen; was man sieht, ist ein Durchgleiten,
   * kein Schnitt. Der Schnappschuss ist absichtlich klein - waehrend der
   * Ueberblendung verschwindet er ohnehin, da faellt keine Schaerfe auf, und
   * so kostet er in jedem Bild nur eine winzige Kopie.
   */
  if (mandelUeberblendung > 0 && mandelSchnappschuss) {
    stift.globalAlpha = mandelUeberblendung * deckung;
    stift.drawImage(
      mandelSchnappschuss, 0, 0, mandelSchnappschuss.width, mandelSchnappschuss.height,
      0, 0, breite, hoehe,
    );
    mandelUeberblendung = Math.max(0, mandelUeberblendung - sekunden / MANDEL_UEBERBLEND);
  } else {
    // Auffrischen, solange nicht ueberblendet wird - dann liegt beim naechsten
    // Wechsel immer das unmittelbar vorige Bild bereit.
    if (!mandelSchnappschuss) {
      mandelSchnappschuss = document.createElement('canvas');
      mandelSchnappschuss.width = 480;
      mandelSchnappschuss.height = 300;
      mandelSchnappStift = mandelSchnappschuss.getContext('2d');
    }
    mandelSchnappStift.drawImage(quelle, 0, 0, qb, qh, 0, 0, 480, 300);
    mandelSchnappschussNehmen = false;

    /*
     * Jedes sechste Bild in den Schnappschuss hineinsehen.
     *
     * Hier - und nur hier - ist das in Ordnung: Die Notfassung rechnet ohnehin
     * auf dem Hauptprozessor, die Quelle ist eine gewoehnliche 2D-Leinwand,
     * und es gibt keine Grafikpipeline, die davon leerlaufen muesste. Und
     * gebraucht wird der Wert auch: Der Wachdienst urteilt auf diesem Weg nach
     * mandelStreuung, weil es hier keine Bezugsbahn zum Nachrechnen gibt.
     *
     * Auf dem Weg ueber die Grafikkarte war beides anders - dort kostete es
     * und wurde nie gelesen. Siehe mandelUeberlagern().
     */
    if (++mandelWacheZaehler % 6 === 0) mandelStreuungRechnen();
  }

  // Oben und unten abdunkeln. Dort stehen Titel, Uhr und Pegel, und ein
  // Fraktal in voller Pracht direkt dahinter macht beides unlesbar.
  mandelSchleier(stift, breite, hoehe);
  stift.restore();
}

// --- Der Vertrag --------------------------------------------------------------

/*
 * Der Lichtpark liegt in einem eigenen Modul.
 *
 * Er ist als einziger Modus kein Bild *auf* der Wand, sondern Licht *an* der
 * Wand - mit Lampen, Richtungen und Abfall. Das ist genug Eigenleben fuer
 * eine eigene Datei.
 */
export const MODI = {
  /*
   * Der Lichtpark. Uplighter-Kegel von unten, Punktreihen auf den Gesimsen,
   * ein wandernder Strahl, Blinder beim Drop - und alles an den Stellen, die
   * die Beamer-Einmessung kennt.
   *
   * Kein Schmuck: Ringe und Funken der Grundschicht kaemen aus der Mitte des
   * Bildes und haetten mit einer Lampe am Boden nichts zu tun.
   */
  licht: { name: 'Lichtpark', zeichne: partylichtZeichnen, schmuck: false },
  /*
   * Die grosse Fassung: dieselben Lampen, dazu Beams, Spiegelkugel, Flammen,
   * Publikumsblinder, kleinflaechige Blitze, CO2 und Funken - und darueber
   * eine Regie, die entscheidet, was wann laeuft.
   *
   * Der Lichtpark daneben bleibt bestehen. Er ist die ruhige Fassung fuer
   * eine Stelle, an der eine ganze Show zu viel waere.
   */
  show: { name: 'Buehnenshow', zeichne: buehnenshowZeichnen, schmuck: false, eigeneKaesten: true },
  iris: { name: 'Iris', zeichne: irisZeichnen, schmuck: true },
  tunnel: { name: 'Tunnel', zeichne: tunnelZeichnen, schmuck: true },
  strahlen: { name: 'Strahlen', zeichne: strahlenZeichnen, schmuck: true },
  /*
   * Das Mandelbrot bekommt keinen Schmuck.
   *
   * Ringe auf jedem Schlag, Funken beim Drop und der Spannungsbogen in der
   * Mitte sind fuer die drei anderen Modi gebaut, die von Bewegung leben. Ueber
   * einer Zoomfahrt sind sie Stoerung: Das Auge folgt dem Sog nach innen, und
   * jeder Ring, der von der Mitte nach aussen laeuft, zieht es wieder heraus.
   * Genau die hypnotische Wirkung, um die es hier geht, wird davon zerstoert.
   */
  mandelbrot: {
    name: 'Mandelbrot',
    zeichne: mandelbrotZeichnen,
    schmuck: false,
    // Das Fraktal liegt als eigene Ebene unter der Leinwand. Die Lava darunter
    // waere unsichtbar und wird deshalb gar nicht erst gerechnet.
    eigeneEbene: true,
  },
  /*
   * Das versteckte Bild - siehe dolce.js.
   *
   * "geheim" heisst: Es steht nicht in der Auswahl auf der Buehne und kommt
   * auch nicht von selbst dran. Wer weiss, wie man es aufruft, ruft es auf.
   *
   * Auch hier kein Schmuck: Ringe und Funken der Grundschicht wuerden ueber
   * gezeichneten Szenen wie ein zweites, fremdes Bild liegen.
   */
  dolce: {
    name: 'La Dolce Trenta',
    zeichne: dolceZeichnen,
    schmuck: false,
    geheim: true,
  },
};
