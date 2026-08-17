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

import { PULT, KOPF, RUMPF, OBERARM, UNTERARM } from './schattenteile.js';

/* --- Die gezeichneten Teile ------------------------------------------------
 *
 * Die Figur bestand zuerst aus Ellipsen und Linien, und man sah es ihr an:
 * "breit, aber ohne Muskeln", und die Plattenteller lasen sich als
 * Essensglocken. Jetzt sind es fuenf gezeichnete Silhouetten - Pult, Kopf,
 * Rumpf, Oberarm, Unterarm -, die hier wie eine Gliederpuppe zusammengesetzt
 * und bewegt werden.
 *
 * Warum in Teilen und nicht als *ein* Bild: Ein Bild waere ein Standbild.
 * Alles, was diese Figur ausmacht - Nicken auf den Schlag, Arm hoch beim
 * Aufbau, Kopfhoerer im Breakdown, Hand am Regler -, entsteht daraus, dass
 * sich die Teile gegeneinander drehen.
 *
 * Geladen wird einmal, aus Zeichenketten im Modul daneben. Bis das erste
 * Bild da ist, wird nichts gezeichnet: Ein halb geladener DJ ist schlimmer
 * als gar keiner.
 */
const TEILE = { pult: PULT, kopf: KOPF, rumpf: RUMPF, oberarm: OBERARM, unterarm: UNTERARM };

/*
 * Vorskalierte Abzuege - der Unterschied zwischen 0,83 und einem Bruchteil
 * davon.
 *
 * Zuerst wurde in jedem Bild aus der vollen Quelle heruntergerechnet: das
 * Pult von 720 auf 589 Bildpunkte Breite, der Rumpf von 347 auf 176, und das
 * alles zweimal wegen des Saums. Ein Verkleinern mit Glaettung ist aber kein
 * Kopieren, sondern eine Faltung ueber jeden Zielpunkt - sechzigmal in der
 * Sekunde fuer Bilder, die sich nicht aendern.
 *
 * Die Groessen aendern sich nur, wenn sich das Fenster aendert. Also wird je
 * Teil und Groesse einmal ein Abzug angelegt und danach nur noch geblittet.
 * Der Schluessel enthaelt die gerundete Zielbreite; ein Bildpunkt Unterschied
 * loest keine Neuanlage aus.
 */
const abzuege = new Map();

function abzug(name, breite, hoehe, hell) {
  const schluessel = `${name}|${Math.round(breite)}|${Math.round(hoehe)}|${hell ? 'h' : 'd'}`;
  const da = abzuege.get(schluessel);
  if (da) return da;
  const quelle = hell ? hellBilder[name] : bilder[name];
  if (!quelle) return null;
  const l = document.createElement('canvas');
  l.width = Math.max(1, Math.round(breite));
  l.height = Math.max(1, Math.round(hoehe));
  const st = l.getContext('2d');
  st.imageSmoothingQuality = 'high';
  st.drawImage(quelle, 0, 0, l.width, l.height);
  /*
   * Der Speicher darf nicht wachsen. Beim Ziehen am Fensterrand entsteht in
   * jeder Zwischengroesse ein Abzug; ohne Deckel liegen nach einer Minute
   * hundert davon herum. Aeltere fliegen raus - gebraucht werden immer nur
   * die zehn der aktuellen Groesse.
   */
  if (abzuege.size > 24) {
    for (const alt of [...abzuege.keys()].slice(0, 12)) abzuege.delete(alt);
  }
  abzuege.set(schluessel, l);
  return l;
}
const bilder = {};
// Weisse Abzuege derselben Teile - fuer das Streiflicht. Einmal angelegt,
// nicht je Bild: source-in auf einer neuen Leinwand ist billig, aber nicht
// sechzigmal in der Sekunde.
const hellBilder = {};
let geladen = false;
let laedt = false;

function teileLaden() {
  if (laedt) return;
  laedt = true;
  let offen = Object.keys(TEILE).length;
  for (const [name, teil] of Object.entries(TEILE)) {
    const bild = new Image();
    bild.onload = () => {
      bilder[name] = bild;
      // Der weisse Abzug: dieselbe Form, nur weiss statt schwarz.
      const l = document.createElement('canvas');
      l.width = teil.breite;
      l.height = teil.hoehe;
      const st = l.getContext('2d');
      st.drawImage(bild, 0, 0);
      st.globalCompositeOperation = 'source-in';
      st.fillStyle = '#fff';
      st.fillRect(0, 0, l.width, l.height);
      hellBilder[name] = l;
      if (--offen === 0) geladen = true;
    };
    bild.onerror = () => { if (--offen === 0) geladen = true; };
    bild.src = teil.daten;
  }
}

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


/**
 * Die Teile laden und melden, wann sie da sind.
 *
 * Ausgefuehrt, weil jeder Aufrufer, der nicht in einer Bildschleife sitzt,
 * darauf warten muss: Die Bilder kommen ueber ein onload, und wer synchron
 * durchrechnet, gibt dem Browser nie die Gelegenheit, es auszuloesen.
 */
export function schattenLaden() {
  teileLaden();
  return new Promise((fertig) => {
    const sehen = () => (geladen ? fertig(true) : setTimeout(sehen, 20));
    sehen();
  });
}

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
  schlagDauer = 0.5;
  letzteSchlagZeit = 0;
  federStimmen();
}

/* --- Die Feder hinter dem Nicken -------------------------------------------
 *
 * Kritisch gedaempft waere D = 2*sqrt(K) = 27,6 - dann kaeme der Kopf ohne
 * Nachschwingen zurueck, und das saehe nach Mechanik aus. Mit 15 liegt es
 * deutlich darunter: Der Kopf schwingt einmal nach, und genau das liest das
 * Auge als Koerper.
 */
/* --- Die Feder hinter dem Nicken -------------------------------------------
 *
 * Sie war zuerst *fest* gestimmt, und das war der Grund fuer "Beat und
 * Bewegung passen nicht zusammen".
 *
 * Bei einer Federkonstanten von 190 schwingt sie mit rund 13,8 je Sekunde,
 * hat also eine Periode von 0,46 Sekunden. Ein Stueck mit 140 Schlaegen je
 * Minute hat eine Schlagdauer von 0,43 Sekunden - fast genau dasselbe. Damit
 * trifft jeder neue Stoss die Feder mitten in ihrer eigenen Schwingung,
 * einmal mit ihr und einmal gegen sie, und heraus kommt ein Wabern, das mit
 * dem Schlag nichts mehr zu tun hat. Bei einem langsameren Stueck haette es
 * gepasst, bei einem schnelleren wird es Brei.
 *
 * Jetzt wird die Schlagdauer gemessen und die Feder danach gestimmt: Sie soll
 * ihre Bewegung in gut der Haelfte eines Schlages abgeschlossen haben. Damit
 * nickt die Figur bei 120 wie bei 175 Schlaegen sauber auf den Punkt.
 *
 * Die Daempfung wandert mit: Was zaehlt, ist ihr *Verhaeltnis* zur
 * Eigenfrequenz. Bei 0,54 schwingt der Kopf einmal nach - das liest das Auge
 * als Koerper und nicht als Mechanik.
 */
const DAEMPFUNGSGRAD = 0.54;
// Die Schlagdauer in Sekunden, gemessen und traege geglaettet.
let schlagDauer = 0.5;
let letzteSchlagZeit = 0;
// Daraus die Federwerte.
let federK = 190;
let federD = 15;
let eigenFrequenz = Math.sqrt(190);

function federStimmen() {
  /*
   * Die Bewegung soll nach gut der Haelfte eines Schlages durch sein. Eine
   * volle Schwingung dauert 2*PI/omega; gesetzt wird omega so, dass diese
   * Dauer 0,62 Schlaege betraegt.
   */
  const ziel = Math.max(0.15, Math.min(1.2, schlagDauer)) * 0.62;
  eigenFrequenz = (2 * Math.PI) / ziel;
  federK = eigenFrequenz * eigenFrequenz;
  federD = 2 * DAEMPFUNGSGRAD * eigenFrequenz;
}

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
   * Alle Masse haengen an der Kopfhoehe, und die Kopfhoehe an der Bildhoehe.
   *
   * Die Verhaeltnisse innerhalb eines Teils bringt das Bild selbst mit - eine
   * Schulter ist so breit, wie sie gezeichnet ist. Hier steht nur noch, wie
   * gross die Teile *zueinander* sind und wo sie sitzen.
   */
  const kopfH = Math.max(28, hoehe * 0.095);
  const mitte = breite * 0.5;

  // Das Pult: gut die halbe Bildbreite. Seine Hoehe kommt aus dem Bild.
  const pultB = Math.min(breite * 0.46, kopfH * 8.2);
  const pultH = pultB * (PULT.hoehe / PULT.breite);
  // Die Oberkante des Bildes liegt ueber der Platte - dazwischen stehen die
  // Plattenteller. Der Koerper wird an der *Platte* abgeschnitten.
  const pultBildOben = hoehe - pultH * 1.02;
  const pultOben = pultBildOben + pultH * PULT.deckel;

  // Der Rumpf: seine Breite ist die Schulterbreite und ergibt sich aus dem
  // Kopf - gut zwei Kopfhoehen, das ist die Anatomie.
  /*
   * Die Schulterbreite. Bei 2,15 Kopfhoehen war der Kopf fast so breit wie
   * die Schultern - die Figur sah aus wie ein Kind. Ein erwachsener
   * Oberkoerper ist gut zweieinhalb Kopfhoehen breit.
   */
  const rumpfB = kopfH * 2.6;
  const rumpfH = rumpfB * (RUMPF.hoehe / RUMPF.breite);
  /*
   * Wo der Rumpf sitzt: so, dass die Platte ihn etwa auf Brusthoehe
   * abschneidet. Sichtbar bleiben Schultern, Hals und die Oberarmansaetze -
   * der oberste Teil, mehr braucht es nicht.
   */
  const rumpfOben = pultOben - rumpfH * 0.74;

  /*
   * Die Schultergelenke sitzen am Ende des Aermels - und wo das ist, sagt
   * das Bild, nicht ich.
   *
   * Geraten hatte ich 0,42 der Breite und 0,30 der Hoehe. Gemessen sind es
   * 1,00 und 0,46: Der Aermel laeuft bis ganz nach aussen und endet erst
   * knapp unter der Bildmitte. Mit meinen Zahlen hingen die Arme mitten an
   * der Brust und deutlich zu hoch - man sah es sofort, und es war auch das
   * erste, was auffiel.
   */
  const schulterB = rumpfB * (RUMPF.armX - 0.5);
  const schulterY = rumpfOben + rumpfH * RUMPF.armY;

  return {
    kopfH,
    mitte,
    pultB,
    pultH,
    pultBildOben,
    pultOben,
    rumpfB,
    rumpfH,
    rumpfOben,
    schulterB,
    schulterY,
    // Der Kopf: das Bild enthaelt den Kopfhoerer, der ueber den Schaedel
    // hinausragt. Etwas groesser als die reine Kopfhoehe, damit der Schaedel
    // selbst stimmt.
    kopfBildH: kopfH * 1.18,
    kopfBildB: kopfH * 1.18 * (KOPF.breite / KOPF.hoehe),
    kopfB: kopfH * 0.78,
    // Der Halsansatz - dort sitzt der Kopf auf.
    kopfY: rumpfOben + rumpfH * 0.02 - kopfH * 0.52,
    /*
     * Die Armlaengen. Zuerst zu kurz: Die Haende liegen auf den Tellern, und
     * die stehen weit aussen - der Arm kam nicht hin, die Kinematik klemmte
     * am Anschlag, und uebrig blieben zwei Stummel an der Schulter. Ein Arm
     * reicht beim Menschen bis knapp unter die Huefte; in Kopfhoehen
     * gerechnet sind Ober- und Unterarm zusammen gut zweieinhalb.
     */
    oberarm: kopfH * 1.05,
    unterarm: kopfH * 0.95,
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
  let lx = m.mitte - m.pultB * 0.245;
  /*
   * Die Ruhehaende liegen auf den Tellern - und die Teller stehen *ueber*
   * der Pultkante. Ein bisschen darunter angesetzt, dann verschwindet die
   * Hand hinter dem Teller und der Unterarm laeuft sichtbar darauf zu. Genau
   * so sieht es aus, wenn jemand wirklich die Hand auf einer Platte hat.
   */
  let ly = m.pultOben + m.kopfH * 0.10;
  let rx = m.mitte + m.pultB * 0.245;
  let ry = m.pultOben + m.kopfH * 0.10;

  /*
   * Uebergang: die rechte Hand wandert mit dem Regler.
   *
   * Das ist die ehrlichste Bewegung der ganzen Figur - der Mischer blendet
   * wirklich gerade ueber, und anteilB ist wirklich der Stand des Reglers.
   * Wer genau hinsieht, kann am Schatten ablesen, wie weit der Wechsel ist.
   */
  if (anteilB > 0) {
    const weg = m.pultB * 0.20 * (anteilB - 0.5);
    rx = m.mitte + weg;
    ry = m.pultOben + m.kopfH * 0.02;
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
  if (!geladen) { teileLaden(); return; }

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
    /*
     * Die Schlagdauer aus dem Abstand zweier Schlaege - nicht aus der BPM-
     * Angabe des Tracks. In einem Stundenmix wechselt das Tempo unterwegs,
     * und die Tempokarte weiss davon; eine feste Zahl aus dem Dateinamen
     * nicht. Gemessen wird ausserdem genau das, was auch die Beatnummer
     * treibt - damit koennen die beiden nicht auseinanderlaufen.
     */
    const jetzt = (letzteSchlagZeit || 0) + sekunden;
    if (schattenLetzterBeat >= 0 && takt.nummer === schattenLetzterBeat + 1) {
      const gemessen = jetzt;
      if (gemessen > 0.12 && gemessen < 2) {
        schlagDauer = schlagDauer * 0.7 + gemessen * 0.3;
        federStimmen();
      }
    }
    letzteSchlagZeit = 0;
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
      nickV += wunsch * eigenFrequenz;
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
  nickV += (-federK * nickX - federD * nickV) * sekunden;
  nickX += nickV * sekunden;
  // Ohne Deckel schaukelt sich die Feder bei sehr schnellen Beats auf.
  nickX = klemm(nickX, -0.55, 0.55);

  letzteSchlagZeit += sekunden;
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
  /*
   * Wie weit das Nicken den Koerper bewegt.
   *
   * Bei 0,42 war es rechnerisch da und praktisch nicht zu sehen - "die
   * Bewegungen passten nicht zum Beat" hiess in Wirklichkeit "ich sehe keine
   * Bewegung". Mit 0,85 wandert der Kopf auf einer Leinwand rund zwoelf
   * Bildpunkte, und der Schlag ist von hinten im Raum zu erkennen.
   */
  const nickPx = nickX * m.kopfH * 0.85;
  letzterNickPx = nickPx;
  const seitePx = wiegen * m.kopfH * 0.11;

  const kopfX = m.mitte + seitePx * 1.4 + kopfDreh * m.kopfH * 0.12;
  // Der Kopf geht am weitesten, die Schultern gehen mit - ein Nicken aus
  // dem Hals allein sieht aus wie ein Wackelkopf im Auto.
  const kopfY = m.kopfY + nickPx * 1.35 + neigung * m.kopfH * 0.55;

  stift.save();

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
  /*
   * Gezeichnet wird von hinten nach vorn: Rumpf, Arme, Kopf, Pult.
   *
   * Das Pult kommt zuletzt und schneidet die Figur unten ab - Beine muessen
   * dadurch gar nicht erst gezeichnet werden, und der Uebergang stimmt bei
   * jeder Bildgroesse von selbst. Die Haende liegen ueber der Platte und
   * bleiben deshalb sichtbar.
   */

  /*
   * Ein Teil setzen: Drehpunkt oben in der Mitte, Ausrichtung nach unten.
   *
   * Alle Gliedmassen sind senkrecht nach unten gezeichnet. Um eines entlang
   * einer Richtung zu legen, wird um `richtung - PI/2` gedreht - der
   * Viertelkreis ist der Unterschied zwischen "zeigt nach unten" und "zeigt
   * nach rechts", also zwischen der Zeichnung und dem Winkel, den die
   * Kinematik liefert.
   */
  const teilSetzen = (name, px, py, laenge, richtung, spiegeln, hell) => {
    const t = TEILE[name];
    const f = laenge / t.hoehe;
    const bild = abzug(name, t.breite * f, laenge, hell);
    if (!bild) return;
    stift.save();
    stift.translate(px, py);
    stift.rotate(richtung - Math.PI / 2);
    if (spiegeln) stift.scale(-1, 1);
    stift.drawImage(bild, -bild.width / 2, 0);
    stift.restore();
  };

  /*
   * Das Streiflicht.
   *
   * Frueher waren das von Hand nachgezogene Boegen entlang der gezeichneten
   * Kanten - mit gezeichneten Teilen ginge das nicht mehr, denn die Kanten
   * stehen jetzt im Bild und nicht im Code. Stattdessen wird jedes Teil
   * zweimal gesetzt: erst ein weisser Abzug, ein paar Bildpunkte nach oben
   * verschoben, dann das schwarze Teil darueber. Was vom weissen uebersteht,
   * ist genau die Oberkante - egal welche Form sie hat.
   */
  // Wo der Kopf steht - die Abnahme misst daran, ob die Hand ans Ohr kommt.
  letzterKopf = { x: kopfX, y: kopfY, hoehe: m.kopfH };

  const licht = klemm(0.16 + wucht * 0.5 + dropHalt * 0.35, 0, 0.85);
  const saum = Math.max(1.5, m.kopfH * 0.055);

  // --- Rumpf ----------------------------------------------------------------
  const rumpfX = m.mitte + seitePx;
  const rumpfY = m.rumpfOben + nickPx * 0.85 + neigung * m.kopfH * 0.32;
  const rumpfSetzen = (versatzY, hell) => {
    const bild = abzug('rumpf', m.rumpfB, m.rumpfH, hell);
    if (!bild) return;
    stift.drawImage(bild, rumpfX - bild.width / 2, rumpfY + versatzY);
  };
  stift.globalAlpha = licht;
  rumpfSetzen(-saum, true);
  stift.globalAlpha = 1;
  rumpfSetzen(0, false);

  // --- Arme ------------------------------------------------------------------
  //
  // Die Umkehrkinematik liefert den Ellenbogen; daraus werden zwei
  // Richtungen, und jede traegt ein Bild.
  const schulterLx = rumpfX - m.schulterB;
  const schulterRx = rumpfX + m.schulterB;
  const schulterY = rumpfY + m.rumpfH * RUMPF.armY;
  const arme = [];
  for (const [sx, hand, beugung, spiegeln] of [
    /*
     * Das Vorzeichen der Beugung: Der Ellenbogen soll *haengen*. Mit dem
     * umgekehrten Vorzeichen stand er ueber der Schulter, und der Arm sah aus
     * wie gebrochen - der haeufigste Fehler bei Zweigelenk-Kinematik.
     */
    [schulterLx, handL, -1, true],
    [schulterRx, handR, 1, false],
  ]) {
    const g = ellbogen(sx, schulterY, hand.x, hand.y, m.oberarm, m.unterarm, beugung);
    arme.push({
      sx, sy: schulterY, spiegeln,
      obenRichtung: Math.atan2(g.ey - schulterY, g.ex - sx),
      untenRichtung: Math.atan2(g.hy - g.ey, g.hx - g.ex),
      ex: g.ex, ey: g.ey,
    });
  }
  for (const hell of [true, false]) {
    stift.globalAlpha = hell ? licht : 1;
    const v = hell ? -saum : 0;
    for (const arm of arme) {
      teilSetzen('oberarm', arm.sx, arm.sy + v, m.oberarm, arm.obenRichtung, arm.spiegeln, hell);
      teilSetzen('unterarm', arm.ex, arm.ey + v, m.unterarm, arm.untenRichtung, arm.spiegeln, hell);
    }
  }
  stift.globalAlpha = 1;

  // --- Kopf -------------------------------------------------------------------
  const kopfSetzen = (versatzY, hell) => {
    const bild = abzug('kopf', m.kopfBildB, m.kopfBildH, hell);
    if (!bild) return;
    stift.save();
    stift.translate(kopfX, kopfY + versatzY);
    stift.rotate(kopfDreh * 0.18);
    stift.drawImage(bild, -bild.width / 2, -bild.height / 2);
    stift.restore();
  };
  stift.globalAlpha = licht;
  kopfSetzen(-saum, true);
  stift.globalAlpha = 1;
  kopfSetzen(0, false);

  // --- Pult --------------------------------------------------------------------
  /*
   * Das Pult in zwei Teilen - und das halbiert die Kosten der ganzen Figur.
   *
   * Unterhalb der Kante ist es ein schwarzer Block, und ein Block ist ein
   * Rechteck. Ihn als Bild zu blitten heisst, siebzigtausend Bildpunkte durch
   * das Alpha-Mischwerk zu schicken, obwohl jeder einzelne davon dasselbe
   * undurchsichtige Schwarz ist. Ein fillRect schreibt dieselbe Flaeche ohne
   * zu mischen.
   *
   * Als Bild bleibt nur der Streifen oben, in dem die Plattenteller ueber die
   * Kante ragen - ein Fuenftel der Hoehe.
   */
  const pultBild = (versatzY, hell) => {
    const bild = abzug('pult', m.pultB, m.pultH, hell);
    if (!bild) return;
    const strich = Math.ceil(bild.height * (PULT.deckel + 0.02));
    stift.drawImage(
      bild, 0, 0, bild.width, strich,
      m.mitte - bild.width / 2, m.pultBildOben + versatzY, bild.width, strich,
    );
  };
  const pultBlock = () => {
    const oben = m.pultBildOben + m.pultH * (PULT.deckel + 0.015);
    stift.fillStyle = 'rgb(4,5,10)';
    stift.fillRect(m.mitte - m.pultB / 2, oben, m.pultB, hoehe - oben);
  };
  const pultSetzen = (versatzY, hell) => {
    pultBild(versatzY, hell);
    if (!hell) pultBlock();
  };
  /*
   * Das Pult bekommt seinen Saum nur, wenn Zeit dafuer ist.
   *
   * Es ist mit Abstand die groesste Flaeche der ganzen Figur - gut die halbe
   * Bildbreite -, und ein zweiter Durchgang darueber kostet mehr als alle
   * anderen Teile zusammen. Gemessen war der Schatten damit bei 0,86 ms je
   * Bild; das ist bei sechzig Bildern ein Zwanzigstel des ganzen Budgets fuer
   * eine Kante von drei Bildpunkten.
   */
  if ((lage.guetestufe ?? 'hoch') === 'hoch') {
    stift.globalAlpha = licht * 0.7;
    pultSetzen(-saum * 0.8, true);
    stift.globalAlpha = 1;
  }
  pultSetzen(0, false);

  stift.restore();
}

/** Fuer die Abnahme: der innere Stand, ohne dass etwas gezeichnet werden muss. */
export function schattenStand() {
  return {
    an,
    nickX,
    nickV,
    geladen,
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
