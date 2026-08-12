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

// --- Modus: Wellen ------------------------------------------------------------
//
// Die Wellenform als Linie, mehrfach uebereinander gestapelt, jede leicht
// zeitversetzt und in einem anderen Ton der Palette. Kein Bezug zu
// Frequenzen hier - die Wellenform liegt im Zeitbereich, also braucht dieser
// Modus tonLage() nicht: die x-Achse ist schon fest (Zeit laeuft immer
// gleich von links nach rechts, egal welcher Track spielt).

const WELLEN_KOPIEN = 5;
const WELLEN_PUNKTE = 360;

// Der Pegel am Ausgang liegt nach Angleich und Begrenzer bei wenigen Prozent
// der Vollaussteuerung. Zeichnet man den Rohwert, ist die Welle ein Strich.
// Darum wird sie auf ihre eigene Spitze bezogen: schnell hoch, langsam
// zurueck - so bleibt eine laute Stelle laut und eine leise Stelle wird
// trotzdem sichtbar, ohne dass das Bild bei jedem Schlag die Groesse wechselt.
let wellenSpitze = 0.1;
const WELLEN_MINDESTSPITZE = 0.02;
const WELLEN_RUECKGANG = 0.6; // Anteil pro Sekunde

function wellenZeichnen(stift, lage) {
  const { breite, hoehe, welle, sekunden, wucht, spannung, zeit, palette: paletteA, paletteB, anteilB } = lage;
  // Ohne Zeitbereichsdaten hat dieser Modus nichts zu zeichnen. Lieber leer
  // als eine Kurve aus NaN, die stumm gar nichts malt und wie ein Ausfall
  // aussieht.
  if (!welle || welle.length < 8) return;

  const n = welle.length;
  const mitteY = hoehe / 2;
  const punkte = Math.min(WELLEN_PUNKTE, breite);

  // Statt jeden x-ten Abtastwert herauszupicken - was aus einem Schlag eine
  // Treppe macht - bekommt jede Spalte den staerksten Ausschlag ihres
  // Abschnitts. Das ist dieselbe Kurve, nur ohne die Spitzen zu verlieren.
  const eimer = Math.max(1, Math.floor(n / punkte));
  const spitzen = new Float32Array(punkte + 1);
  let hoechste = 0;
  for (let i = 0; i <= punkte; i++) {
    const von = Math.min(n - 1, i * eimer);
    let beste = 0;
    for (let j = von; j < Math.min(n, von + eimer); j++) {
      const v = welle[j];
      if (Math.abs(v) > Math.abs(beste)) beste = v;
    }
    spitzen[i] = beste;
    if (Math.abs(beste) > hoechste) hoechste = Math.abs(beste);
  }

  wellenSpitze =
    hoechste > wellenSpitze
      ? hoechste
      : wellenSpitze + (hoechste - wellenSpitze) * Math.min(1, (sekunden ?? 0.016) * WELLEN_RUECKGANG);
  const skala = 1 / Math.max(WELLEN_MINDESTSPITZE, wellenSpitze);

  const amplitude = hoehe * 0.11 * (0.6 + wucht);
  // Bei hoher Spannung ruecken die Kopien zusammen - das Bild zieht sich
  // zusammen, bevor der Drop es auseinanderreisst.
  const abstand = hoehe * 0.075 * (1 - spannung * 0.7);

  stift.globalCompositeOperation = 'lighter';

  for (let k = 0; k < WELLEN_KOPIEN; k++) {
    const y0 = mitteY + (k - (WELLEN_KOPIEN - 1) / 2) * abstand;
    // Leichter Versatz je Kopie, damit sie nicht wie eine einzige dicke Linie
    // wirken, sondern wie mehrere, die sich gerade so verfehlen.
    const versatz = Math.floor(k * (punkte / 11) + zeit * 9);
    // Die aeusseren Kopien schwingen weiter aus als die inneren - das gibt dem
    // Stapel eine Form, statt fuenf gleicher Linien uebereinander.
    const weite = amplitude * (1 + Math.abs(k - (WELLEN_KOPIEN - 1) / 2) * 0.45);

    const nimmB = paletteB && anteilB > 0 && (k % 2 === 0 ? anteilB > 0.35 : anteilB > 0.65);
    const pal = nimmB ? paletteB : paletteA;

    stift.beginPath();
    for (let i = 0; i <= punkte; i++) {
      const x = (i / punkte) * breite;
      const idx = (((i + versatz) % (punkte + 1)) + punkte + 1) % (punkte + 1);
      // Gedeckelt, damit ein einzelner Ausreisser nicht aus dem Bild laeuft.
      const wert = Math.max(-1.4, Math.min(1.4, spitzen[idx] * skala));
      const y = y0 + wert * weite;
      if (i === 0) stift.moveTo(x, y);
      else stift.lineTo(x, y);
    }
    stift.strokeStyle = pal.toene[k % 4];
    stift.globalAlpha = 0.5 + wucht * 0.4;
    stift.lineWidth = 2;
    stift.stroke();
  }

  stift.globalAlpha = 1;
  stift.globalCompositeOperation = 'source-over';
}

// --- Der Vertrag --------------------------------------------------------------

export const MODI = {
  iris: { name: 'Iris', zeichne: irisZeichnen },
  tunnel: { name: 'Tunnel', zeichne: tunnelZeichnen },
  strahlen: { name: 'Strahlen', zeichne: strahlenZeichnen },
  wellen: { name: 'Wellen', zeichne: wellenZeichnen },
};
