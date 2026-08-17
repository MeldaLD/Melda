// Der Schatten-DJ.
//
// Unten im Bild steht das Gegenlicht-Bild eines DJs hinter seinem Pult. Er
// bewegt sich zur Musik, und zwar nicht zu *irgendeiner* Musik, sondern zu
// der, die gerade laeuft: Er nickt auf den Schlag, zieht beim Aufbau den Arm
// hoch, reisst beim Drop beide hoch, nimmt im Breakdown den Kopfhoerer ans
// Ohr und legt beim Uebergang die Hand an den Regler.
//
// Warum das mehr ist als Zierrat: Ein Fraktal, das den ganzen Bildschirm
// fuellt, sieht aus wie ein Bildschirmschoner. Steht eine Silhouette davor,
// sieht dasselbe Fraktal aus wie eine *Projektion in einem Raum* - und der
// Raum hat einen DJ. Das ist ein alter Buehnentrick und kostet fast nichts.
//
// --- Warum es billig ist ---------------------------------------------------
//
// Alles hier sind ein paar Dutzend Pfadbefehle auf der 2D-Ebene, die ohnehin
// jedes Bild neu gezeichnet wird. Keine Bilder, keine Schrift, kein
// Rueckgriff auf das fertige Bild, keine neue Ebene. Gemessen liegt es unter
// einer Zehntelmillisekunde - gegen ein Fraktal, das zwischen 2 und 300 ms
// braucht, ist das nicht messbar.
//
// Zwei Entscheidungen halten es dort:
//
//   1. Vorwaerts rechnen statt suchen. Die Arme werden ueber eine
//      Zweigelenk-Umkehrkinematik gestellt - das ist ein Kosinussatz, keine
//      Iteration. Zwei Wurzeln und ein Arkuskosinus je Arm.
//   2. Farbverlaeufe werden gemerkt. createLinearGradient legt ein Objekt an;
//      je Bild eines anzulegen, waere in sechs Stunden eine Million Objekte
//      fuer nichts.
//
// --- Warum die Bewegung stimmt ---------------------------------------------
//
// Der Kopf nickt nicht auf einer Sinuskurve. Eine Sinuskurve ist symmetrisch,
// ein Nicken nicht: Es faellt schnell auf den Schlag und kommt langsam
// zurueck. Deshalb sitzt hinter dem Kopf eine gedaempfte Feder, die bei jedem
// Schlag einen Stoss bekommt. Das ergibt von selbst die richtige Asymmetrie -
// und es haelt auch dann, wenn ein Bild ausfaellt oder das Tempo wechselt,
// weil die Feder in Sekunden rechnet und nicht in Bildern.

/* --- Zustand ---------------------------------------------------------------
 *
 * Alles, was sich weich bewegen soll, hat hier einen Ist-Wert. Die Ziele
 * ergeben sich in jedem Bild neu aus der Musik; die Ist-Werte laufen ihnen
 * hinterher. Ohne diese Trennung wuerde die Figur bei jedem Zustandswechsel
 * springen, und ein springender Schatten sieht nach Fehler aus, nicht nach
 * Tanz.
 */
let an = true;

// Die Feder hinter dem Nicken: Auslenkung und Geschwindigkeit.
let nickX = 0;
let nickV = 0;
let schattenLetzterBeat = -1;

// Wohin die Haende gerade zeigen, in Bildpunkten. Erst beim ersten Bild
// gesetzt - vorher gibt es keine Bildgroesse.
let handL = null;
let handR = null;

// Traege Groessen: Oberkoerperneigung, seitliches Wiegen, Kopfdrehung.
let neigung = 0;
let wiegen = 0;
let wiegePhase = 0;
let kopfDreh = 0;
// Wie weit der Kopf zuletzt gewandert ist, in Bildpunkten - fuer die Abnahme.
let letzterNickPx = 0;
// Wo der Kopf zuletzt stand - die Abnahme misst daran, ob die Hand ans Ohr
// kommt, und darf die Zahl nicht selbst nachrechnen muessen.
let letzterKopf = null;

/*
 * Der Nachhall des Drops.
 *
 * `drop` steht nur in *einem* Bild auf wahr - eine Pose daran zu haengen
 * hiesse, dass die Arme fuer eine Sechzigstelsekunde hochgehen und niemand es
 * sieht. Also wird der Augenblick hier festgehalten und klingt ueber rund
 * zwei Sekunden ab: lang genug, dass man es sieht, kurz genug, dass die Figur
 * nicht minutenlang mit erhobenen Armen dasteht.
 */
let dropHalt = 0;

// Der Zeigefinger ins Publikum - ein Zufallsereignis, das nur auf
// Phrasengrenzen ausgeloest wird und dann eine Weile haelt.
let zeigenHalt = 0;
let letztePhrase = -1;

// Gemerkte Farbverlaeufe. Schluessel ist die Bildgroesse plus die Farbe;
// aendert sich nichts, wird nichts neu gebaut.
let verlaufSchluessel = '';
let randVerlauf = null;

/** An- oder abschalten. */
export function schattenSetzen(wert) {
  an = !!wert;
}
export function schattenAn() {
  return an;
}

/**
 * Zuruecksetzen - fuer die Abnahme und fuer den Moduswechsel. Ohne das traegt
 * die Figur eine Pose aus dem vorigen Stueck in das naechste.
 */
export function schattenZuruecksetzen() {
  nickX = 0;
  nickV = 0;
  schattenLetzterBeat = -1;
  handL = null;
  handR = null;
  neigung = 0;
  wiegen = 0;
  wiegePhase = 0;
  kopfDreh = 0;
  letzterNickPx = 0;
  letzterKopf = null;
  zeigenHalt = 0;
  letztePhrase = -1;
  dropHalt = 0;
}

/* --- Die Feder hinter dem Nicken -------------------------------------------
 *
 * Kritisch gedaempft waere D = 2*sqrt(K) = 27,6 - dann kaeme der Kopf ohne
 * Nachschwingen zurueck, und das saehe nach Mechanik aus. Mit 15 liegt es
 * deutlich darunter: Der Kopf schwingt einmal nach, und genau das liest das
 * Auge als Koerper.
 */
const FEDER_K = 190;
const FEDER_D = 15;
const EIGENFREQUENZ = Math.sqrt(FEDER_K);

/* --- Werkzeug -------------------------------------------------------------- */

const klemm = (x, a, b) => (x < a ? a : x > b ? b : x);

/** Nachziehen mit einer Zeitkonstanten, bildratenunabhaengig. */
const folgen = (ist, ziel, tempo, sekunden) =>
  ist + (ziel - ist) * klemm(sekunden * tempo, 0, 1);

/*
 * Zweigelenk-Umkehrkinematik in der Ebene.
 *
 * Gegeben Schulter, Ziel und zwei Gliedlaengen - gesucht der Ellenbogen. Das
 * ist der Kosinussatz und sonst nichts. Die Angabe `beugung` sagt, zu welcher
 * Seite das Gelenk knickt; ohne sie gaebe es zwei gleich gueltige Loesungen,
 * und die Figur wuerde zwischen ihnen umklappen.
 *
 * Warum ueberhaupt Umkehrkinematik und nicht einfach Winkel: Weil die Haende
 * an *Dingen* liegen sollen - am Plattenteller, am Regler, am Ohr. Mit
 * Winkeln muesste jede Pose fuer jede Bildgroesse neu gestimmt werden; mit
 * einem Ziel in Bildpunkten stimmt sie ueberall.
 */
function ellbogen(sx, sy, zx, zy, l1, l2, beugung) {
  let dx = zx - sx;
  let dy = zy - sy;
  let d = Math.hypot(dx, dy);
  // Ausserhalb der Reichweite wird das Ziel herangezogen statt der Arm
  // gestreckt - sonst zittert die Hand am Anschlag.
  const hoechst = (l1 + l2) * 0.995;
  const kleinst = Math.abs(l1 - l2) * 1.02 + 1e-3;
  if (d > hoechst) {
    const f = hoechst / d;
    dx *= f; dy *= f; d = hoechst;
  } else if (d < kleinst) {
    const f = kleinst / Math.max(d, 1e-6);
    dx *= f; dy *= f; d = kleinst;
  }
  const richtung = Math.atan2(dy, dx);
  const kos = klemm((d * d + l1 * l1 - l2 * l2) / (2 * d * l1), -1, 1);
  const winkel = richtung + beugung * Math.acos(kos);
  return {
    ex: sx + Math.cos(winkel) * l1,
    ey: sy + Math.sin(winkel) * l1,
    hx: sx + dx,
    hy: sy + dy,
  };
}

/* --- Die Figur -------------------------------------------------------------
 *
 * Alle Masse haengen an einer einzigen Einheit: der Hoehe des Pultes. Damit
 * stimmt die Figur auf einem Telefon quer genauso wie auf einer Leinwand, und
 * es gibt keine Stelle, an der eine Zahl in Bildpunkten steht und bei anderer
 * Groesse nicht mehr passt.
 */
function masse(breite, hoehe) {
  /*
   * Gerechnet wird vom *Kopf* aus, nicht vom Pult.
   *
   * Der erste Anlauf ging vom Pult aus, und das Ergebnis sah aus wie ein
   * Lutscher hinter einem Tisch: Der Kopf war zu klein, der Hals zu lang, die
   * Schultern zu schmal. Eine Silhouette hat keine Gesichtszuege und keine
   * Falten - sie wird allein an den Verhaeltnissen erkannt, und das
   * wichtigste davon ist Kopf zu Schultern. Wer die falsch waehlt, bekommt
   * kein stilisiertes Bild, sondern ein falsches.
   *
   * Die Verhaeltnisse hier sind die eines Menschen von vorn:
   *   Kopfbreite         0,78 Kopfhoehen
   *   Schulterbreite     1,9 Kopfhoehen (also gut zweieinhalb Kopfbreiten)
   *   Hals               0,18 Kopfhoehen - kurz; ein langer Hals wirkt sofort
   *                      wie eine Puppe
   *   Oberarm            1,0, Unterarm 0,95 Kopfhoehen
   */
  const pultH = Math.max(34, hoehe * 0.13);
  const pultOben = hoehe - pultH;
  const kopfH = pultH * 0.85;
  const mitte = breite * 0.5;

  /*
   * Wie hoch die Figur ueber dem Pult steht.
   *
   * Zuerst standen hier 0,55 Kopfhoehen, und der DJ sah aus, als sei er im
   * Pult versunken - nur Kopf und Schulteransatz ragten heraus. Bei einem
   * echten Pult liegt die Kante etwa auf Hueft- bis Brusthoehe, der ganze
   * Oberkoerper ist zu sehen. 1,35 Kopfhoehen sind der Brustkorb; damit
   * nimmt die ganze Figur gut vierzig Prozent der Bildhoehe ein, und das ist
   * die Grenze, ab der sie dem Fraktal den Platz nimmt.
   */
  const schulterY = pultOben - kopfH * 1.35;
  const kopfY = schulterY - kopfH * 0.68;

  return {
    e: kopfH,
    mitte,
    pultOben,
    pultH,
    // Das Pult darf die Figur nicht erschlagen: gut die halbe Breite, und
    // hoechstens sieben Kopfhoehen.
    pultB: Math.min(breite * 0.56, kopfH * 7),
    kopfH,
    kopfB: kopfH * 0.78,
    kopfY,
    schulterY,
    schulterB: kopfH * 1.15,
    // Die Hueftbreite entscheidet ueber die Form des Oberkoerpers. Schmaler
    // als die Schultern - sonst wird die Figur ein Kegel.
    hueftB: kopfH * 0.95,
    oberarm: kopfH * 1.0,
    unterarm: kopfH * 0.95,
    armDick: kopfH * 0.30,
    // Die Teller ragen mit ihrer oberen Haelfte ueber die Pultkante.
    tellerX: kopfH * 2.15,
    tellerR: kopfH * 0.66,
    reglerB: kopfH * 1.35,
  };
}

/*
 * Wohin die Haende sollen - die eigentliche Choreografie.
 *
 * Fuenf Haltungen, und jede hat einen Grund in der Musik. Sie schliessen sich
 * nicht aus: Was herauskommt, ist eine Mischung, gewichtet nach dem, was die
 * Analyse gerade meldet. Deshalb gibt es keinen sichtbaren Umschaltpunkt.
 */
function handZiele(m, lage) {
  const { spannung, abbau, dropHalt, anteilB, wucht } = lage;

  // Grundhaltung: linke Hand am linken Teller, rechte am Regler. Das ist die
  // Haltung, in der ein DJ die meiste Zeit wirklich steht.
  /*
   * Grundhaltung: beide Haende auf den Tellern.
   *
   * Zuerst lag die rechte am Mischer, dicht neben dem Koerper - und
   * verschwand dort hinter dem Oberkoerper. Von einem Arm, den man nicht
   * sieht, hat die Silhouette nichts. Beide Haende aussen spreizen die Arme
   * und geben der Figur ihre Kontur.
   */
  let lx = m.mitte - m.tellerX;
  let ly = m.pultOben - m.kopfH * 0.42;
  let rx = m.mitte + m.tellerX;
  let ry = m.pultOben - m.kopfH * 0.42;

  /*
   * Uebergang: die rechte Hand wandert mit dem Regler.
   *
   * Das ist die ehrlichste Bewegung der ganzen Figur - der Mischer blendet
   * wirklich gerade ueber, und anteilB ist wirklich der Stand des Reglers.
   * Wer genau hinsieht, kann am Schatten ablesen, wie weit der Wechsel ist.
   */
  if (anteilB > 0) {
    const weg = m.reglerB * (anteilB - 0.5);
    rx = m.mitte + weg;
    ry = m.pultOben - m.kopfH * 0.14;
  }

  /*
   * Breakdown: der Kopfhoerer ans Ohr.
   *
   * Auch das stimmt: Im Breakdown bereitet die Buehne den naechsten Track vor.
   * Ein DJ hoert dann vor, und genau das tut die Figur.
   */
  if (abbau > 0.15) {
    const t = klemm((abbau - 0.15) / 0.5, 0, 1);
    lx += (m.mitte - m.kopfB * 0.78 - lx) * t;
    ly += (m.kopfY + m.kopfH * 0.05 - ly) * t;
  }

  /*
   * Aufbau: der rechte Arm geht hoch, je naeher der Drop kommt. Nicht
   * schlagartig - das Hochgehen *ist* die Ankuendigung.
   */
  const hoch = klemm((spannung - 0.35) / 0.55, 0, 1);
  if (hoch > 0) {
    rx += (m.mitte + m.schulterB * 0.9 - rx) * hoch;
    ry += (m.schulterY - m.kopfH * (1.0 + wucht * 0.35) - ry) * hoch;
  }

  /*
   * Drop: beide Arme hoch, und zwar sofort. dropHalt klingt ueber rund zwei
   * Sekunden ab - lang genug, dass man es sieht, kurz genug, dass die Figur
   * nicht minutenlang mit erhobenen Armen dasteht.
   */
  if (dropHalt > 0) {
    const t = klemm(dropHalt, 0, 1);
    lx += (m.mitte - m.schulterB * 1.0 - lx) * t;
    ly += (m.schulterY - m.kopfH * 1.35 - ly) * t;
    rx += (m.mitte + m.schulterB * 1.0 - rx) * t;
    ry += (m.schulterY - m.kopfH * 1.35 - ry) * t;
  }

  /*
   * Der Zeigefinger ins Publikum. Nur auf Phrasengrenzen, nur bei Betrieb,
   * und nur manchmal - eine Geste, die jeden Takt kommt, ist keine Geste
   * mehr, sondern ein Zucken.
   */
  if (zeigenHalt > 0 && dropHalt <= 0) {
    const t = klemm(zeigenHalt, 0, 1);
    rx += (m.mitte + m.schulterB * 1.5 - rx) * t;
    ry += (m.pultOben - m.kopfH * 1.0 - ry) * t;
  }

  return { lx, ly, rx, ry };
}

/* --- Zeichnen -------------------------------------------------------------- */

/**
 * Den Schatten-DJ zeichnen.
 *
 * `lage` kommt aus der Visualisierung: takt, spannung, abbau, wucht, drop,
 * anteilB, palette, sekunden. Fehlt etwas davon, steht die Figur eben ruhig -
 * sie darf nie der Grund sein, warum ein Bild ausfaellt.
 */
export function schattenZeichnen(stift, breite, hoehe, lage = {}) {
  if (!an || !stift || breite < 120 || hoehe < 120) return;

  const sekunden = klemm(lage.sekunden ?? 1 / 60, 0, 0.2);
  const takt = lage.takt ?? null;
  const spannung = klemm(lage.spannung ?? 0, 0, 1);
  const abbau = klemm(lage.abbau ?? 0, 0, 1);
  const wucht = klemm(lage.wucht ?? 0, 0, 1);
  const anteilB = klemm(lage.anteilB ?? 0, 0, 1);

  /*
   * Der Stoss auf den Schlag.
   *
   * Ausgeloest wird an der *Beatnummer*, nicht an einer Schwelle des
   * Bruchteils. Der Unterschied zaehlt: Bei einem ausgefallenen Bild springt
   * imBeat ueber die Schwelle hinweg, und der Schlag fiele aus. Die Nummer
   * kann man nicht ueberspringen, ohne dass es auffaellt.
   */
  if (takt && takt.nummer !== schattenLetzterBeat) {
    if (schattenLetzterBeat >= 0) {
      const staerke = takt.aufPhrase ? 1 : takt.aufEins ? 0.72 : 0.42;
      /*
       * Der Stoss geht in die *Geschwindigkeit*, die gewuenschte Groesse ist
       * aber eine *Auslenkung* - und zwischen beiden steht die Eigenfrequenz
       * der Feder.
       *
       * Hier stand zuerst der Wunschwert direkt als Stoss, und gemessen kam
       * dabei eine Auslenkung von 0,02 heraus statt der beabsichtigten 0,4:
       * Bei einer Federkonstanten von 190 ist die Eigenfrequenz rund 13,8 je
       * Sekunde, und ein Geschwindigkeitsstoss v erzeugt nur v/13,8 an Weg.
       * Der Faktor fehlte, und das Nicken war fast unsichtbar.
       */
      const wunsch = staerke * (0.30 + wucht * 0.45 + spannung * 0.25) * (1 - abbau * 0.6);
      nickV += wunsch * EIGENFREQUENZ;
    }
    schattenLetzterBeat = takt.nummer;

    // Die Geste ins Publikum: auf Phrasengrenzen, wenn es laut genug ist.
    if (takt.aufPhrase && takt.nummer !== letztePhrase) {
      letztePhrase = takt.nummer;
      if (wucht > 0.35 && abbau < 0.2 && Math.random() < 0.35) zeigenHalt = 1;
    }
  }

  /*
   * Die Feder. Kritisch gedaempft waere langweilig, also ein bisschen
   * darunter - dann schwingt der Kopf einmal nach, und das sieht nach
   * Koerper aus statt nach Mechanik.
   */
  nickV += (-FEDER_K * nickX - FEDER_D * nickV) * sekunden;
  nickX += nickV * sekunden;
  // Ohne Deckel schaukelt sich die Feder bei sehr schnellen Beats auf.
  nickX = klemm(nickX, -0.55, 0.55);

  if (zeigenHalt > 0) zeigenHalt = Math.max(0, zeigenHalt - sekunden * 0.55);
  if (lage.drop) dropHalt = 1;
  else if (dropHalt > 0) dropHalt = Math.max(0, dropHalt - sekunden * 0.5);

  const m = masse(breite, hoehe);

  // Traege Koerpergroessen. Der Oberkoerper geht mit der Spannung nach vorn -
  // der DJ beugt sich ueber das Pult, wenn es darauf zulaeuft.
  const neigungZiel = spannung * 0.16 - abbau * 0.06 + dropHalt * 0.1;
  neigung = folgen(neigung, neigungZiel, 2.4, sekunden);
  // Seitliches Wiegen, im halben Tempo des Schlags. Es laeuft ueber eine
  // eigene Phase und nicht ueber imBeat, damit es beim Tempowechsel nicht
  // springt.
  wiegePhase += sekunden * (0.7 + wucht * 0.7);
  const wiegeZiel = Math.sin(wiegePhase * Math.PI) * (0.35 + wucht * 0.5) * (1 - abbau * 0.5);
  wiegen = folgen(wiegen, wiegeZiel, 6, sekunden);
  // Der Kopf dreht sich zur Hand, die gerade etwas tut.
  kopfDreh = folgen(kopfDreh, (anteilB > 0 ? 0.35 : 0) - abbau * 0.5, 2, sekunden);

  const ziele = handZiele(m, { spannung, abbau, dropHalt, anteilB, wucht });
  if (!handL) { handL = { x: ziele.lx, y: ziele.ly }; handR = { x: ziele.rx, y: ziele.ry }; }
  // Haende schnell, damit ein Drop wirklich schlagartig wirkt - aber nicht so
  // schnell, dass es zuckt.
  const handTempo = 9 + dropHalt * 14;
  handL.x = folgen(handL.x, ziele.lx, handTempo, sekunden);
  handL.y = folgen(handL.y, ziele.ly, handTempo, sekunden);
  handR.x = folgen(handR.x, ziele.rx, handTempo, sekunden);
  handR.y = folgen(handR.y, ziele.ry, handTempo, sekunden);

  /*
   * Das Nicken bewegt den ganzen Oberkoerper, den Kopf am staerksten.
   *
   * Der Faktor sass zuerst bei 0,22 und war zu klein: Von der beabsichtigten
   * Auslenkung kommt bei einem Daempfungsgrad von 0,54 nur gut die Haelfte
   * an - das ist kein Fehler der Feder, sondern ihre Bauart. Statt die Feder
   * zu verstimmen wird hier verstaerkt, denn nur diese Zahl entscheidet
   * darueber, wie weit der Kopf wirklich wandert.
   */
  const nickPx = nickX * m.kopfH * 0.42;
  letzterNickPx = nickPx;
  const seitePx = wiegen * m.kopfH * 0.11;

  const kopfX = m.mitte + seitePx * 1.4 + kopfDreh * m.kopfH * 0.12;
  const kopfY = m.kopfY + nickPx + neigung * m.kopfH * 0.55;
  const schulterY = m.schulterY + nickPx * 0.5 + neigung * m.kopfH * 0.32;
  const schulterLx = m.mitte - m.schulterB + seitePx;
  const schulterRx = m.mitte + m.schulterB + seitePx;

  /*
   * Die Farbe.
   *
   * Ein Schatten ist nicht schwarz, sondern *fast* schwarz - ein Rest des
   * Bildes dahinter scheint durch. Voellig schwarz sieht aus wie ein
   * ausgeschnittenes Stueck Papier; mit einem Hauch Durchlaessigkeit sieht es
   * aus wie jemand vor einer Leinwand.
   */
  const palette = lage.palette ?? null;
  const randfarbe = palette?.[Math.min(palette.length - 1, 3)] ?? '#8ad7ff';
  const schluessel = `${Math.round(breite)}x${Math.round(hoehe)}|${randfarbe}`;
  if (schluessel !== verlaufSchluessel) {
    verlaufSchluessel = schluessel;
    randVerlauf = stift.createLinearGradient(0, m.kopfY - m.kopfH, 0, hoehe);
    randVerlauf.addColorStop(0, randfarbe);
    randVerlauf.addColorStop(1, 'rgba(0,0,0,0)');
  }

  stift.save();
  stift.lineJoin = 'round';
  stift.lineCap = 'round';

  /*
   * Voll deckend, und das ist eine Korrektur.
   *
   * Zuerst stand hier rgba(...,0.94) - ein Hauch Durchlaessigkeit, damit die
   * Figur nicht wie ausgeschnittenes Papier wirkt. Der Haken ist die
   * Zeichenreihenfolge: Wo sich zwei halbdurchlaessige Flaechen ueberlappen -
   * Arm ueber Oberkoerper, Kopf ueber Hals -, addieren sich die Deckungen,
   * und es entstehen dunklere Flecken entlang jeder inneren Naht. Im Bild war
   * das deutlich zu sehen.
   *
   * Ein Schatten vor einer Projektion ist ohnehin praktisch schwarz. Fuer die
   * Trennung vom Hintergrund sorgt das Streiflicht, nicht die Durchsicht.
   */
  const koerper = 'rgb(4,5,10)';
  letzterKopf = { x: kopfX, y: kopfY, hoehe: m.kopfH };
  stift.fillStyle = koerper;
  stift.strokeStyle = koerper;

  const pl = m.mitte - m.pultB / 2;
  const pr = m.mitte + m.pultB / 2;

  /*
   * Die Reihenfolge ist die halbe Miete, und sie ist zweimal falsch gewesen.
   *
   * Sie muss der Tiefe im Raum folgen: Die Teller stehen *auf* dem Pult, die
   * Haende liegen *auf* den Tellern, und die Pultfront steht vor allem. Wer
   * die Teller nach den Armen zeichnet, verschluckt die Haende - genau das
   * war zu sehen. Also von hinten nach vorn:
   *
   *   1. Teller und Mischer
   *   2. Koerper, Arme, Kopf
   *   3. die Pultfront, die unten alles abschneidet
   *
   * Damit muessen Beine gar nicht erst gezeichnet werden, und der Uebergang
   * stimmt bei jeder Bildgroesse von selbst.
   */

  // --- 1. Teller und Mischer -----------------------------------------------
  for (const seite of [-1, 1]) {
    stift.beginPath();
    stift.ellipse(
      m.mitte + seite * m.tellerX, m.pultOben,
      m.tellerR, m.tellerR * 0.72, 0, Math.PI, 0,
    );
    stift.fill();
  }
  stift.beginPath();
  stift.rect(m.mitte - m.reglerB / 2, m.pultOben - m.kopfH * 0.30, m.reglerB, m.kopfH * 0.30);
  stift.fill();

  // --- 2. Der Oberkoerper ---------------------------------------------------
  //
  // Eine Schulter faellt. Zuerst stand hier ein Trapez mit flachem Deckel, und
  // das las sich als Kasten - eher Laptopdeckel als Mensch. Die schraege
  // Linie vom Hals zur Schulter ist die eine Form, an der das Auge einen
  // Oberkoerper erkennt; ohne sie hilft keine Proportion.
  // Der Hals: schmal. Bei 0,42 Kopfbreiten je Seite war er fast so breit wie
  // der Kopf, und Kopf und Rumpf verschmolzen zu einem Klotz.
  const halsB = m.kopfB * 0.26;
  const halsY = schulterY - m.kopfH * 0.42;
  stift.beginPath();
  stift.moveTo(m.mitte - m.hueftB + seitePx * 0.5, hoehe);
  stift.lineTo(schulterLx, schulterY + m.kopfH * 0.10);
  stift.quadraticCurveTo(
    schulterLx + m.kopfH * 0.06, schulterY - m.kopfH * 0.30,
    m.mitte + seitePx - halsB, halsY,
  );
  stift.lineTo(m.mitte + seitePx + halsB * 1.6, halsY);
  stift.quadraticCurveTo(
    schulterRx - m.kopfH * 0.06, schulterY - m.kopfH * 0.30,
    schulterRx, schulterY + m.kopfH * 0.10,
  );
  stift.lineTo(m.mitte + m.hueftB + seitePx * 0.5, hoehe);
  stift.closePath();
  stift.fill();

  // --- Arme -----------------------------------------------------------------
  //
  // Nach dem Oberkoerper, damit sie davor liegen. Ein Arm, der hinter der
  // Schulter verschwindet, sieht abgerissen aus.
  stift.lineWidth = m.armDick;
  const armAnsatzY = schulterY - m.kopfH * 0.05;
  for (const [sx, hand, beugung] of [
    /*
     * Das Vorzeichen der Beugung: Der Ellenbogen soll *haengen*. Mit dem
     * umgekehrten Vorzeichen stand er ueber der Schulter, und der Arm sah aus
     * wie gebrochen - der haeufigste Fehler bei Zweigelenk-Kinematik, und von
     * aussen sofort sichtbar.
     */
    [schulterLx + m.kopfH * 0.05, handL, -1],
    [schulterRx - m.kopfH * 0.05, handR, 1],
  ]) {
    const g = ellbogen(sx, armAnsatzY, hand.x, hand.y, m.oberarm, m.unterarm, beugung);
    stift.beginPath();
    stift.moveTo(sx, armAnsatzY);
    stift.lineTo(g.ex, g.ey);
    stift.lineTo(g.hx, g.hy);
    stift.stroke();
    // Die Hand: ohne sie enden die Arme wie abgesaegt.
    stift.beginPath();
    stift.arc(g.hx, g.hy, m.armDick * 0.56, 0, Math.PI * 2);
    stift.fill();
  }

  // --- Hals und Kopf ---------------------------------------------------------
  stift.lineWidth = halsB * 2;
  stift.beginPath();
  stift.moveTo(kopfX, kopfY + m.kopfH * 0.28);
  stift.lineTo(m.mitte + seitePx, halsY + m.kopfH * 0.08);
  stift.stroke();
  stift.beginPath();
  stift.ellipse(kopfX, kopfY, m.kopfB / 2, m.kopfH / 2, kopfDreh * 0.22, 0, Math.PI * 2);
  stift.fill();

  /*
   * Der Kopfhoerer - das Zeichen, an dem ein DJ als DJ erkannt wird. Ohne ihn
   * ist die Silhouette nur jemand hinter einem Tisch.
   */
  const buegel = m.kopfB * 0.64;
  stift.lineWidth = m.kopfH * 0.12;
  stift.beginPath();
  stift.arc(kopfX, kopfY, buegel, Math.PI * 1.04, Math.PI * 1.96);
  stift.stroke();
  for (const seite of [-1, 1]) {
    stift.beginPath();
    stift.ellipse(
      kopfX + seite * buegel, kopfY - m.kopfH * 0.02,
      m.kopfH * 0.14, m.kopfH * 0.23, 0, 0, Math.PI * 2,
    );
    stift.fill();
  }

  // --- 3. Die Pultfront ------------------------------------------------------
  //
  // Ein schlichter Block. Alles Verspielte daran waere im Gegenlicht ohnehin
  // nicht zu sehen.
  stift.beginPath();
  stift.rect(pl, m.pultOben, m.pultB, hoehe - m.pultOben);
  stift.fill();

  /*
   * Das Streiflicht - der eine Strich, der aus einer Silhouette eine Person
   * macht. Eine helle Kante dort, wo das Licht der Leinwand auf Kopf,
   * Schulter und Pultkante faellt. Es wird heller, wenn die Musik lauter ist,
   * denn dann leuchtet die Projektion dahinter ja auch staerker.
   */
  if ((lage.guetestufe ?? 'hoch') !== 'niedrig') {
    stift.globalCompositeOperation = 'lighter';
    stift.strokeStyle = randVerlauf;
    stift.globalAlpha = 0.30 + wucht * 0.45 + dropHalt * 0.25;
    stift.lineWidth = Math.max(1.5, m.kopfH * 0.055);
    // Kopf.
    stift.beginPath();
    stift.ellipse(kopfX, kopfY, m.kopfB / 2, m.kopfH / 2, kopfDreh * 0.22, Math.PI * 1.05, Math.PI * 1.95);
    stift.stroke();
    // Die Schulterlinie - dieselbe Kurve wie beim Koerper, damit das Licht
    // wirklich auf der Kante sitzt und nicht daneben.
    stift.beginPath();
    stift.moveTo(schulterLx, schulterY + m.kopfH * 0.10);
    stift.quadraticCurveTo(
      schulterLx + m.kopfH * 0.06, schulterY - m.kopfH * 0.30,
      m.mitte + seitePx - m.kopfB * 0.42, schulterY - m.kopfH * 0.42,
    );
    stift.moveTo(schulterRx, schulterY + m.kopfH * 0.10);
    stift.quadraticCurveTo(
      schulterRx - m.kopfH * 0.06, schulterY - m.kopfH * 0.30,
      m.mitte + seitePx + m.kopfB * 0.42, schulterY - m.kopfH * 0.42,
    );
    stift.stroke();
    // Pultkante - sie gibt dem Block eine Oberflaeche.
    stift.beginPath();
    stift.moveTo(pl, m.pultOben);
    stift.lineTo(pr, m.pultOben);
    stift.stroke();
    stift.globalAlpha = 1;
    stift.globalCompositeOperation = 'source-over';
  }

  stift.restore();
}

/** Fuer die Abnahme: der innere Stand, ohne dass etwas gezeichnet werden muss. */
export function schattenStand() {
  return {
    an,
    nickX,
    nickV,
    nickPx: letzterNickPx,
    kopf: letzterKopf ? { ...letzterKopf } : null,
    zeigenHalt,
    dropHalt,
    handL: handL ? { ...handL } : null,
    handR: handR ? { ...handR } : null,
    neigung,
    wiegen,
  };
}
