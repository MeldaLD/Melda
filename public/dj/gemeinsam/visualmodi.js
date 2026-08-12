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
// Ein unendlicher Zoom in die Mandelbrot-Menge, der im Takt atmet.
//
// Warum ausgerechnet die: Sie ist selbstaehnlich. Egal wie tief man
// hineinfaehrt, es kommt immer wieder neue Struktur - und immer wieder
// dieselbe. Genau diese Mischung aus "es geht immer weiter" und "ich erkenne
// es wieder" ist das, was das Auge nicht loslaesst. Ein Zufallsmuster
// ermuedet, ein wiederkehrendes langweilt; ein Fraktal tut keines von beidem.
//
// Die Mathematik dahinter passt auf drei Zeilen. Fuer jeden Bildpunkt c wird
// z wiederholt durch z = z*z + c ersetzt. Bleibt z klein, gehoert der Punkt
// zur Menge und bleibt dunkel. Entkommt es, faerbt die Anzahl der Schritte
// bis dahin den Punkt.
//
// Zwei Dinge machen aus dieser Rechnung ein Bild, das man ansehen mag:
//
//   Glatte Faerbung. Die reine Schrittzahl ist eine ganze Zahl, und dadurch
//   entstehen harte Farbringe. Der Ausweg ist bekannt: Man rechnet einen
//   Nachkommaanteil dazu, mu = n + 1 - log2(log2|z|). Damit werden aus
//   Ringen Verlaeufe.
//
//   Ein lohnendes Ziel. Ins Zentrum zu zoomen ist langweilig - dort ist
//   alles schwarz. Interessant sind die Raender, und dort ein paar
//   bestimmte Stellen: das Seepferdchental bei -0.745+0.113i, das
//   Elefantental, die dreifache Spirale. Jeder Track bekommt eine davon.

// Die Ziele. Entscheidend ist die Stellenzahl, nicht die Auswahl:
//
// Ein Punkt wie -0.7453+0.1127i beschreibt das Seepferdchental gut genug, um
// es zu finden - aber nur auf vier Nachkommastellen. Zoomt man auf ein
// Millionstel heran, liegt dieser Punkt laengst eindeutig innerhalb oder
// ausserhalb der Menge, und das ganze Bild wird zu einer einzigen Flaeche.
// Nachgemessen: Ab Tiefe 4 war nichts mehr zu sehen.
//
// Fuer einen tiefen Zoom braucht es einen Punkt, der *auf dem Rand* liegt,
// und zwar auf so vielen Stellen, wie man hineinfahren will. Das sind die
// bekannten Zieladressen aus der Fraktalliteratur - jede von ihnen bleibt
// bis in die letzte hier angegebene Stelle Grenzpunkt.
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
    x: -0.749705768080503617,
    y: 0.028016647753687,
    name: 'Elefantental',
  },
];

// Zwei Grenzen treffen hier aufeinander. Rechnerisch reicht doppelte
// Genauigkeit bis etwa Tiefe 13 - darunter liegen benachbarte Bildpunkte
// naeher beieinander als die Zahlen noch unterscheiden koennen, und das Bild
// zerfaellt in Bloecke. Praktisch wird vorher die Rechenzeit zum Problem: Je
// tiefer, desto mehr Schritte braucht der Rand. Bei 8 bleibt beides im
// Rahmen, und der Wechsel zu einem neuen Ziel bringt ohnehin mehr Abwechslung
// als ein endloser Sturz an dieselbe Stelle.
const MANDEL_MAX_TIEFE = 6;
const MANDEL_GRUNDZOOM = 0.13; // Zehnerpotenzen je Sekunde
// Zeitbudget je Bild. Bei 60 Bildern je Sekunde bleiben 16 ms fuer alles;
// 11 davon darf das Fraktal kosten, der Rest ist Lava, Ringe und Schrift.
const MANDEL_BUDGET_MS = 11;
// Grob gemessene Leistung: so viele Punkt-mal-Schritt-Rechnungen je
// Millisekunde. Wird unten laufend nachgefuehrt, das hier ist nur der Start.
let mandelLeistung = 700000;
const MANDEL_RUECKSPRUNG = 7; // wie schnell wieder heraus

let mandelLeinwand = null;
let mandelStift = null;
let mandelBild = null;
let mandelBreite = 0;
let mandelHoehe = 0;
let mandelTiefe = 0.35;
let mandelSchwung = 0;
let mandelZiel = 0;
let mandelFarbe = 0;
let mandelZurueck = false;
let mandelLetzterBeat = -1;
let mandelDauer = 8; // gemessene Rechenzeit je Bild, in Millisekunden
let mandelFarbtabelle = null;
let mandelFarbtonZuletzt = -1;

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
    // Schrift. Ein Fraktal, das man bewundert und auf dem man nichts liest,
    // hat seine Aufgabe nur halb erfuellt.
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

function mandelbrotZeichnen(stift, lage) {
  const { breite, hoehe, sekunden, takt, spannung, wucht, drop, palette: paletteA, paletteB, anteilB } = lage;

  // --- Die Fahrt ---------------------------------------------------------

  // Auf jedem Schlag ein Stoss nach vorn. Das ist der ganze Trick: Der Zoom
  // laeuft gleichmaessig, aber er *atmet* im Takt, und das Auge liest das als
  // Bewegung zur Musik statt als Bildschirmschoner.
  if (takt && takt.nummer !== mandelLetzterBeat) {
    mandelLetzterBeat = takt.nummer;
    mandelSchwung += 0.22 + wucht * 0.5 + (takt.aufEins ? 0.25 : 0);
  }
  mandelSchwung *= Math.pow(0.06, sekunden); // klingt in etwa einer Sekunde ab

  // Ein Drop kehrt die Fahrt um: erst schiesst das Bild heraus, dann geht es
  // an einer neuen Stelle wieder hinein. Damit hat der staerkste Moment der
  // Musik auch im Bild seinen staerksten Moment.
  if (drop) mandelZurueck = true;
  if (mandelTiefe > MANDEL_MAX_TIEFE) mandelZurueck = true;

  if (mandelZurueck) {
    mandelTiefe -= MANDEL_RUECKSPRUNG * sekunden;
    if (mandelTiefe <= 0.35) {
      mandelTiefe = 0.35;
      mandelZurueck = false;
      mandelZiel = (mandelZiel + 1) % MANDEL_ZIELE.length;
    }
  } else {
    // Bei hoher Spannung schneller - der Sog vor dem Drop auch im Bild.
    const tempo = MANDEL_GRUNDZOOM * (1 + spannung * 1.6) + mandelSchwung * 0.5;
    mandelTiefe += tempo * sekunden;
  }

  mandelFarbe += sekunden * (0.05 + wucht * 0.35 + spannung * 0.2);

  // --- Die Leinwand ------------------------------------------------------

  // Klein rechnen, gross zeichnen. Ein Bildpunkt kostet hier eine ganze
  // Schleife; in voller Aufloesung waeren das Millionen je Bild. Der
  // Weichzeichner beim Hochskalieren schadet nicht - er hilft sogar, das
  // Ergebnis wirkt weicher und weniger nach Rechnerei.
  //
  // Aufloesung und Schrittzahl duerfen aber nicht unabhaengig voneinander
  // wachsen. Genau das war der Fehler: Mit der Tiefe stiegen die Schritte, die
  // Aufloesung regelte getrennt nach, und bei Tiefe 6,5 stand ein Bild bei
  // 49 ms - also zwanzig Bildern je Sekunde. Beides zusammen bildet die
  // Rechenlast, also wird auch beides zusammen budgetiert: Erst steht fest,
  // wie viele Schritte die Tiefe braucht, dann bekommt die Aufloesung, was vom
  // Zeitbudget uebrig ist.
  const schritte = Math.min(
    900,
    Math.round(200 + mandelTiefe * 110 + wucht * 90 + spannung * 60),
  );
  const punkteBudget = Math.max(6000, (MANDEL_BUDGET_MS * mandelLeistung) / schritte);
  const wunschBreite = Math.max(
    110,
    Math.min(340, Math.round(Math.sqrt((punkteBudget * breite) / Math.max(1, hoehe)))),
  );
  if (!mandelLeinwand || Math.abs(wunschBreite - mandelBreite) > 16 || mandelHoehe === 0) {
    mandelBreite = wunschBreite;
    mandelHoehe = Math.max(70, Math.round((wunschBreite * hoehe) / Math.max(1, breite)));
    mandelLeinwand = document.createElement('canvas');
    mandelLeinwand.width = mandelBreite;
    mandelLeinwand.height = mandelHoehe;
    mandelStift = mandelLeinwand.getContext('2d');
    mandelBild = mandelStift.createImageData(mandelBreite, mandelHoehe);
  }

  const grundton = paletteB && anteilB > 0.5 ? paletteB.grundton : paletteA.grundton;
  if (grundton !== mandelFarbtonZuletzt || !mandelFarbtabelle) {
    mandelFarbtabelle = mandelTabelleBauen(grundton);
    mandelFarbtonZuletzt = grundton;
  }

  // --- Die Rechnung ------------------------------------------------------

  const begonnen = performance.now();
  const zielPunkt = MANDEL_ZIELE[mandelZiel];
  const spanne = 1.6 / Math.pow(10, mandelTiefe);
  const seitenverhaeltnis = mandelHoehe / mandelBreite;

  const daten = mandelBild.data;
  const tabelle = mandelFarbtabelle;
  const farbversatz = mandelFarbe * 512;

  for (let py = 0; py < mandelHoehe; py++) {
    const ci = zielPunkt.y + ((py / mandelHoehe) * 2 - 1) * spanne * seitenverhaeltnis;
    for (let px = 0; px < mandelBreite; px++) {
      const cr = zielPunkt.x + ((px / mandelBreite) * 2 - 1) * spanne;

      let zr = 0;
      let zi = 0;
      let zr2 = 0;
      let zi2 = 0;
      let n = 0;
      // Abbruch bei Betrag 256 statt 2: Fuer die glatte Faerbung braucht es
      // eine grosse Fluchtschwelle, sonst bleibt ein Rest Bandenbildung.
      while (n < schritte && zr2 + zi2 < 65536) {
        zi = 2 * zr * zi + ci;
        zr = zr2 - zi2 + cr;
        zr2 = zr * zr;
        zi2 = zi * zi;
        n++;
      }

      const k = (py * mandelBreite + px) * 4;
      if (n >= schritte) {
        // Im Inneren: fast schwarz, aber nicht ganz - ein Hauch der Palette,
        // damit die Flaeche nicht wie ein Loch wirkt.
        daten[k] = tabelle[0] >> 3;
        daten[k + 1] = tabelle[1] >> 3;
        daten[k + 2] = tabelle[2] >> 3;
        daten[k + 3] = 255;
      } else {
        // Glatte Faerbung: der Nachkommaanteil macht aus Ringen Verlaeufe.
        const betrag = Math.sqrt(zr2 + zi2);
        const mu = n + 1 - Math.log(Math.log(betrag)) / Math.LN2;
        let index = Math.floor(mu * 7 + farbversatz) % 512;
        if (index < 0) index += 512;
        const t = index * 3;
        daten[k] = tabelle[t];
        daten[k + 1] = tabelle[t + 1];
        daten[k + 2] = tabelle[t + 2];
        daten[k + 3] = 255;
      }
    }
  }

  // Fuer die Abnahme sichtbar machen, was die Fahrt gerade tut.
  if (typeof window !== 'undefined') {
    window.__mandel = {
      tiefe: mandelTiefe,
      ziel: MANDEL_ZIELE[mandelZiel].name,
      zurueck: mandelZurueck,
      schritte,
      breite: mandelBreite,
      dauerMs: mandelDauer,
    };
  }

  mandelStift.putImageData(mandelBild, 0, 0);
  const gebraucht = Math.max(0.2, performance.now() - begonnen);
  mandelDauer = mandelDauer * 0.8 + gebraucht * 0.2;
  // Was hat der Rechner tatsaechlich geschafft? Daraus folgt das naechste
  // Budget - auf einem Tablet anders als auf einem Rechner mit Grafikkarte.
  const geschafft = (mandelBreite * mandelHoehe * schritte) / gebraucht;
  mandelLeistung = mandelLeistung * 0.9 + geschafft * 0.1;

  // --- Aufs Bild --------------------------------------------------------

  stift.save();
  stift.imageSmoothingEnabled = true;
  stift.imageSmoothingQuality = 'high';
  // Beim Rueckwaertsflug kurz heller: der Moment, in dem der Drop faellt.
  stift.globalAlpha = mandelZurueck ? 1 : 0.92 + wucht * 0.08;
  stift.drawImage(mandelLeinwand, 0, 0, breite, hoehe);

  // Oben und unten abdunkeln. Dort stehen Titel, Uhr und Pegel, und ein
  // Fraktal in voller Pracht direkt dahinter macht beides unlesbar.
  stift.globalAlpha = 1;
  stift.globalCompositeOperation = 'source-over';
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
