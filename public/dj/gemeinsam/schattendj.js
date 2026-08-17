// Der Schatten-DJ.
//
// Unten im Bild steht das Gegenlicht-Bild eines DJs hinter seinem Pult. Er
// bewegt sich zur Musik, und zwar nicht zu *irgendeiner* Musik, sondern zu
// der, die gerade laeuft: Er nickt auf den Schlag, pumpt bei viel Wucht die
// Faust, zieht beim Aufbau den Arm hoch, reisst beim Drop beide hoch, nimmt
// im Breakdown den Kopfhoerer ans Ohr und legt beim Uebergang die Hand an den
// Regler.
//
// Warum das mehr ist als Zierrat: Ein Fraktal, das den ganzen Bildschirm
// fuellt, sieht aus wie ein Bildschirmschoner. Steht eine Silhouette davor,
// sieht dasselbe Fraktal aus wie eine *Projektion in einem Raum* - und der
// Raum hat einen DJ. Das ist ein alter Buehnentrick und kostet fast nichts.
//
// --- Woraus die Figur besteht ----------------------------------------------
//
// Aus *einer* Zeichnung im T-Pose. Sie wird beim Bauen in ihre Teile zerlegt
// (werkzeuge/schattenumriss.mjs) und hier an einem Skelett bewegt: acht
// geschlossene Streckenzuege - Kopf, Kopfhoerer, Rumpf, Hose, je Seite Ober-
// und Unterarm - mit gut tausend Randpunkten zusammen.
//
// Jedes Teil ist *starr* und dreht um sein Gelenk. Das ist eine bewusste
// Rueckkehr: Der Vorgaenger mischte je Randpunkt mehrere Knochen (lineare
// Mischhaut), damit sich die Haut an der Schulter beugt. Bei kleinen Winkeln
// sieht das besser aus, bei grossen zerreisst es - ein Punkt mit Gewicht 0,5
// dreht bei 90 Grad Armdrehung nur 45 Grad mit, und aus der Schulter wird ein
// Zipfel. Die Zeichnung trennt die Glieder ohnehin durch weisse Linien; wo
// die Zeichnung schon geschnitten hat, ist ein starres Teil das Ehrlichere.
// Was an den Gelenken sonst aufreissen wuerde, deckt ein Kreis in
// Gliedmassendicke ab - genau so macht es jedes Ausschneide-Rig.
//
// --- Warum der T-Pose ------------------------------------------------------
//
// Weil er die Bindepose ist, von der aus *jede* Zielhaltung eine maessige
// Drehung ist. Aus haengenden Armen braucht "Haende hoch" fast 180 Grad; aus
// waagerechten Armen sind es siebzig. Das ist kein Zufall, sondern der Grund,
// warum die ganze Spielebranche in dieser Haltung modelliert.
//
// --- Warum es billig ist ---------------------------------------------------
//
// Ein paar tausend Multiplikationen und ein Dutzend Fuellungen je Bild. Das
// einzige Bild ist das Pult, und das bewegt sich nicht. Gegen ein Fraktal,
// das zwischen 2 und 300 ms braucht, ist das nicht messbar.
//
// --- Warum die Bewegung stimmt ---------------------------------------------
//
// Der Kopf nickt nicht auf einer Sinuskurve. Eine Sinuskurve ist symmetrisch,
// ein Nicken nicht: Es faellt schnell auf den Schlag und kommt langsam
// zurueck. Deshalb sitzt hinter dem Kopf eine gedaempfte Feder, die bei jedem
// Schlag einen Stoss bekommt und deren Steifigkeit dem gemessenen Tempo
// folgt. Das ergibt von selbst die richtige Asymmetrie - und es haelt auch
// dann, wenn ein Bild ausfaellt oder das Tempo wechselt, weil die Feder in
// Sekunden rechnet und nicht in Bildern.
//
// Dieselbe Feder treibt die Haende, und zwar *nach* der Glaettung. Das ist
// der Unterschied zwischen "der Arm wandert irgendwann dorthin" und "der Arm
// sitzt auf dem Schlag": Ziele werden weich angefahren, der Schlag selbst
// wird hart draufgelegt.

import { PULT } from './schattenteile.js';
import { UMRISS, ROLLEN, MARKEN } from './schattenumriss.js';

/* --- Das Skelett -----------------------------------------------------------
 *
 * Alles hier kommt aus der Zeichnung und wird genau einmal gerechnet. Die
 * Gelenke sind gemessen, nicht geschaetzt - die Zeichnung trennt an genau den
 * Stellen, an denen die Knochen enden, und das Werkzeug prueft das Ergebnis
 * gegen menschliche Gliedmassenverhaeltnisse nach (Ellenbogen bei 42,3 % der
 * Armlaenge, Handgelenk bei 75,5 %; gemessen 43,1 / 74,6 und 43,5 / 74,9).
 */
const RIG = (() => {
  const arme = MARKEN.arme.map((m, i) => {
    const [S, E, H] = [m.schulter, m.ellbogen, m.hand];
    return {
      seite: m.seite,
      oberarm: UMRISS[ROLLEN.oberarme[i]],
      unterarm: UMRISS[ROLLEN.unterarme[i]],
      schulter: S,
      ellbogen: E,
      hand: H,
      schulterR: m.schulterR,
      ellbogenR: m.ellbogenR,
      wurzel: m.wurzel,
      l1: Math.hypot(E[0] - S[0], E[1] - S[1]),
      l2: Math.hypot(H[0] - E[0], H[1] - E[1]),
      bindOben: Math.atan2(E[1] - S[1], E[0] - S[0]),
      bindUnten: Math.atan2(H[1] - E[1], H[0] - E[0]),
    };
  });
  return {
    arme,
    kopf: UMRISS[ROLLEN.kopf],
    kopfTeile: ROLLEN.kopfTeile.map((n) => UMRISS[n]),
    rumpf: UMRISS[ROLLEN.rumpf],
    still: ROLLEN.still.map((n) => UMRISS[n]),
    // Der Drehpunkt des Kopfes: die schmalste Stelle des Halses.
    halsY: MARKEN.halsY,
    // Die ganze Armlaenge - Bezugsmass fuer Reichweite und Pol.
    armL: arme[0].l1 + arme[0].l2,
  };
})();

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
 * sieht. Also wird der Augenblick hier festgehalten und klingt ueber gut
 * anderthalb Sekunden ab.
 */
let dropHalt = 0;

// Der Zeigefinger ins Publikum - ein Zufallsereignis, das nur auf
// Phrasengrenzen ausgeloest wird und dann eine Weile haelt.
let zeigenHalt = 0;
let letztePhrase = -1;

// Die Faustpumpe laeuft ueber zwei Schlaege. Sie zaehlt in *Schlaegen* und
// nicht in Sekunden, damit sie beim Tempowechsel nicht aus dem Takt faellt.
let pumpPhase = 0;

/*
 * Das Pult ist das einzige, was noch ein Bild ist - es bewegt sich nicht und
 * braucht kein Skelett.
 */
let pultBild = null;
let pultHell = null;
let pultLaeuft = false;

function pultLaden() {
  if (pultLaeuft) return;
  pultLaeuft = true;
  const bild = new Image();
  bild.onload = () => {
    pultBild = bild;
    const l = document.createElement('canvas');
    l.width = PULT.breite;
    l.height = PULT.hoehe;
    const st = l.getContext('2d');
    st.drawImage(bild, 0, 0);
    st.globalCompositeOperation = 'source-in';
    st.fillStyle = '#fff';
    st.fillRect(0, 0, l.width, l.height);
    pultHell = l;
  };
  bild.src = PULT.daten;
}

/**
 * Warten, bis das Pultbild da ist.
 *
 * Ausgefuehrt, weil jeder Aufrufer, der nicht in einer Bildschleife sitzt,
 * darauf warten muss: Das Bild kommt ueber ein onload, und wer synchron
 * durchrechnet, gibt dem Browser nie die Gelegenheit, es auszuloesen. Die
 * Figur selbst braucht das nicht - sie ist Zahlen und sofort da.
 */
export function schattenLaden() {
  pultLaden();
  return new Promise((fertig) => {
    const sehen = () => (pultBild ? fertig(true) : setTimeout(sehen, 20));
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
  pumpPhase = 0;
  schlagDauer = 0.5;
  letzteSchlagZeit = 0;
  federStimmen();
}

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
 * dem Schlag nichts mehr zu tun hat.
 *
 * Jetzt wird die Schlagdauer gemessen und die Feder danach gestimmt: Sie soll
 * ihre Bewegung in gut der Haelfte eines Schlages abgeschlossen haben. Damit
 * nickt die Figur bei 100 wie bei 175 Schlaegen sauber auf den Punkt.
 *
 * Die Daempfung wandert mit: Was zaehlt, ist ihr *Verhaeltnis* zur
 * Eigenfrequenz. Bei 0,54 schwingt der Kopf einmal nach - das liest das Auge
 * als Koerper und nicht als Mechanik.
 */
const DAEMPFUNGSGRAD = 0.54;
let schlagDauer = 0.5;
let letzteSchlagZeit = 0;
let federK = 190;
let federD = 15;
let eigenFrequenz = Math.sqrt(190);

function federStimmen() {
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
 * Zweigelenk-Umkehrkinematik in der Ebene, mit Polvektor.
 *
 * Gegeben Schulter, Ziel und zwei Gliedlaengen - gesucht der Ellenbogen. Das
 * ist der Kosinussatz und sonst nichts. Zwei Loesungen gibt es immer,
 * spiegelbildlich zur Verbindung Schulter-Hand; welche davon gilt, sagt der
 * Pol.
 *
 * --- Warum ein Pol und kein festes Vorzeichen ---------------------------
 *
 * Vorher stand hier ein Vorzeichen je Seite: links so herum, rechts anders
 * herum. Das ist falsch, und zwar sichtbar falsch - im Video war es der
 * schlimmste Fehler der ganzen Figur. Ein festes Vorzeichen heisst "der
 * Ellenbogen liegt immer auf derselben Seite der Sehne", und welche Seite das
 * im Bild ist, haengt davon ab, wo die Hand gerade steht. Greift die Hand
 * nach unten, ist es die richtige; geht sie hoch ans Ohr, klappt derselbe
 * Ellenbogen nach oben durch. Der Arm sah aus wie gebrochen.
 *
 * Der Pol ist die Antwort, die jedes Rig gibt: ein Punkt, zu dem der
 * Ellenbogen zeigen *soll*. Er liegt unten aussen - dorthin, wohin ein Arm
 * unter seinem eigenen Gewicht faellt. Damit stimmt das Gelenk in jeder
 * Haltung, ohne dass irgendwo ein Sonderfall steht.
 */
function ellbogen(sx, sy, zx, zy, l1, l2, polx, poly) {
  let dx = zx - sx;
  let dy = zy - sy;
  let d = Math.hypot(dx, dy);
  // Ausserhalb der Reichweite wird das Ziel herangezogen statt der Arm
  // gestreckt - sonst zittert die Hand am Anschlag.
  const hoechst = (l1 + l2) * 0.995;
  const kleinst = Math.abs(l1 - l2) * 1.02 + 1e-4;
  if (d > hoechst) {
    const f = hoechst / d;
    dx *= f; dy *= f; d = hoechst;
  } else if (d < kleinst) {
    const f = kleinst / Math.max(d, 1e-6);
    dx *= f; dy *= f; d = kleinst;
  }
  const a = (d * d + l1 * l1 - l2 * l2) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d;
  const uy = dy / d;
  const fx = sx + ux * a;
  const fy = sy + uy * a;
  const nx = -uy;
  const ny = ux;
  const seite = (polx - fx) * nx + (poly - fy) * ny >= 0 ? 1 : -1;
  return {
    ex: fx + seite * h * nx,
    ey: fy + seite * h * ny,
    hx: sx + dx,
    hy: sy + dy,
  };
}

/* --- Die Figur im Bild -----------------------------------------------------
 *
 * Vier Zahlen legen die Komposition fest. Sie sind Absicht, nicht Anatomie -
 * alles Anatomische steht in der Zeichnung.
 */

/*
 * Wie hoch die Figur ist, als Anteil der Bildhoehe.
 *
 * Sie haengt am Bild und nicht am Pult - das war einmal andersherum und ergab
 * auf einer Leinwand ein Moebel von doppelter Schulterbreite, hinter dem ein
 * Kind stand.
 */
const FIGUR_ZU_BILD = 0.36;
// Das Pult ist gut zweieinhalb Schultern breit; eine Schulter ist knapp ein
// halbes Figurenmass.
const PULT_ZU_FIGUR = 1.6;
/*
 * Wo die Pultkante im Bild liegt, als Anteil der Bildhoehe.
 *
 * Ganz unten, und das ist eine Ansage: Vom gemalten Pult soll sich nur die
 * Oberkante abzeichnen. Am Partyabend steht davor ein echtes, selbstgebautes
 * Pult, und je weniger vom gemalten zu sehen ist, desto besser gehen beide
 * ineinander ueber.
 */
const PULT_KANTE = 0.94;
/*
 * Wo die Pultkante die Figur abschneidet, in Figurenhoehen.
 *
 * Die Zeichnung reicht vom Scheitel bis zur Huefte, und genau dort steht ein
 * DJ-Tisch: Ein Pult ist knapp einen Meter hoch, eine Huefte auch.
 *
 * Die Zahl entscheidet ausserdem ueber die Armhaltung, und das ist ihr
 * eigentliches Gewicht: Sie legt fest, wie hoch die Schulter ueber der Platte
 * steht - und damit ueber die Armhaltung. Bei 0,95 sind es 0,50
 * Figurenhoehen gegen eine Armlaenge von 0,63; der Griff zum Teller braucht
 * damit rund 89 % der Armlaenge, und der Ellenbogen sitzt eine halbe
 * Kopfhoehe unter der Schulter. Bei 0,90 waren es 85 %, und der Ellenbogen
 * stand auf Schulterhoehe waagerecht ab - die Figur sah aus, als haette sie
 * die Haende in die Hueften gestemmt.
 */
const SCHNITT = 0.95;
/*
 * Wie lange eine Faustpumpe dauert, in Schlaegen - der Rest der zwei Schlaege
 * ist Pause.
 *
 * Ohne Pause ist es keine Geste, sondern ein Dauerzustand: Bei einer vollen
 * Sinuskuppel ueber zwei Schlaege stand der Arm die meiste Zeit oben und kam
 * nur kurz herunter. Drei Viertel Schlag hoch, fuenf Viertel unten - so
 * bleibt es ein Akzent.
 */
const PUMPE_DAUER = 0.75;

function masse(breite, hoehe) {
  const mitte = breite * 0.5;

  const figurH = hoehe * FIGUR_ZU_BILD;
  // Der Deckel gegen die Bildbreite faengt sehr schmale Bildschirme ab, auf
  // denen das Pult sonst hinausstuende.
  const pultB = Math.min(figurH * PULT_ZU_FIGUR, breite * 0.72);
  const pultH = pultB * (PULT.hoehe / PULT.breite);
  // Die Platte, an der die Figur abgeschnitten wird. Darueber ragen nur noch
  // die Plattenteller heraus.
  const pultOben = hoehe * PULT_KANTE;
  const pultBildOben = pultOben - pultH * PULT.deckel;

  const figurOben = pultOben - figurH * SCHNITT;
  /*
   * Das Bezugsmass der Choreografie. Nicht Kopf samt Hals (das waere
   * MARKEN.halsY), sondern der Schaedel - er ist das, was das Auge als "einen
   * Kopf gross" liest.
   */
  const kopfH = figurH * 0.28;

  const schulter = MARKEN.arme[1].schulter;

  return {
    mitte,
    pultB,
    pultH,
    pultBildOben,
    pultOben,
    figurH,
    figurOben,
    kopfH,
    schulterB: figurH * Math.abs(schulter[0]),
    schulterY: figurOben + figurH * schulter[1],
    armL: figurH * RIG.armL,
    // Das Ohr - dorthin wandert im Breakdown die Hand mit dem Kopfhoerer.
    ohrX: figurH * 0.11,
    ohrY: figurOben + figurH * 0.14,
  };
}

/*
 * Wohin die Haende sollen - die eigentliche Choreografie.
 *
 * Sechs Haltungen, und jede hat einen Grund in der Musik. Sie schliessen sich
 * nicht aus: Was herauskommt, ist eine Mischung, gewichtet nach dem, was die
 * Analyse gerade meldet. Deshalb gibt es keinen sichtbaren Umschaltpunkt.
 */
function handZiele(m, lage) {
  const { spannung, abbau, dropHalt: halt, anteilB, wucht, pumpe } = lage;

  /*
   * Grundhaltung: beide Haende auf den Tellern.
   *
   * Wo die Teller stehen, ist nicht geraten - PULT.teller ist im Pultbild
   * gemessen. Steht die Hand woanders, sieht man es sofort: ein DJ, der neben
   * den Teller greift.
   */
  const tellerX = m.pultB * PULT.teller;
  let lx = m.mitte - tellerX;
  /*
   * Die Ruhehaende liegen *auf* den Tellern, also knapp ueber der Pultkante.
   * Darunter waeren sie unsichtbar, weil das Pult zuletzt darueber kommt -
   * und von einem Arm, der im Moebel endet, hat die Silhouette nichts.
   */
  let ly = m.pultOben - m.kopfH * 0.12;
  let rx = m.mitte + tellerX;
  let ry = ly;

  /*
   * Die Faustpumpe - der Grund, warum die Figur "motiviert" aussieht statt
   * beschaeftigt.
   *
   * Alles andere hier haengt an langsam wandernden Groessen (Spannung, Abbau,
   * Reglerstand); eine Figur, die nur davon lebt, driftet. Die Pumpe ist die
   * einzige Bewegung, die *jeden zweiten Schlag* etwas tut, und sie traegt
   * den ganzen Eindruck.
   */
  if (pumpe > 0) {
    rx += (m.mitte + m.schulterB * 1.35 - rx) * pumpe;
    ry += (m.schulterY - m.kopfH * 1.0 - ry) * pumpe;
  }

  /*
   * Uebergang: die rechte Hand wandert mit dem Regler.
   *
   * Das ist die ehrlichste Bewegung der ganzen Figur - der Mischer blendet
   * wirklich gerade ueber, und anteilB ist wirklich der Stand des Reglers.
   * Nach aussen versetzt, weil die Hand in der Mitte hinter dem Oberkoerper
   * verschwindet und man vom Uebergang dann nichts saehe.
   */
  if (anteilB > 0) {
    rx = m.mitte + m.pultB * (0.10 + 0.20 * anteilB);
    ry = m.pultOben - m.kopfH * 0.04;
  }

  /*
   * Breakdown: der Kopfhoerer ans Ohr.
   *
   * Auch das stimmt: Im Breakdown bereitet die Buehne den naechsten Track
   * vor. Ein DJ hoert dann vor, und genau das tut die Figur.
   */
  if (abbau > 0.15) {
    const t = klemm((abbau - 0.15) / 0.5, 0, 1);
    lx += (m.mitte - m.ohrX - lx) * t;
    ly += (m.ohrY - ly) * t;
  }

  /*
   * Aufbau: der rechte Arm geht hoch, je naeher der Drop kommt. Nicht
   * schlagartig - das Hochgehen *ist* die Ankuendigung.
   */
  const hoch = klemm((spannung - 0.35) / 0.55, 0, 1);
  if (hoch > 0) {
    rx += (m.mitte + m.schulterB * 2.2 - rx) * hoch;
    ry += (m.schulterY - m.kopfH * (1.3 + wucht * 0.4) - ry) * hoch;
  }

  /*
   * Drop: beide Arme hoch, und zwar sofort. dropHalt klingt ueber gut
   * anderthalb Sekunden ab - lang genug, dass man es sieht, kurz genug, dass
   * die Figur nicht minutenlang mit erhobenen Armen dasteht.
   */
  if (halt > 0) {
    const t = klemm(halt, 0, 1);
    lx += (m.mitte - m.schulterB * 2.6 - lx) * t;
    ly += (m.schulterY - m.kopfH * 1.7 - ly) * t;
    rx += (m.mitte + m.schulterB * 2.6 - rx) * t;
    ry += (m.schulterY - m.kopfH * 1.7 - ry) * t;
  }

  /*
   * Der Zeigefinger ins Publikum. Nur auf Phrasengrenzen, nur bei Betrieb,
   * und nur manchmal - eine Geste, die jeden Takt kommt, ist keine Geste
   * mehr, sondern ein Zucken.
   */
  if (zeigenHalt > 0 && halt <= 0) {
    const t = klemm(zeigenHalt, 0, 1);
    rx += (m.mitte + m.schulterB * 3.4 - rx) * t;
    ry += (m.pultOben - m.kopfH * 1.8 - ry) * t;
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
  if (!pultBild) pultLaden();

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
     * Die Schlagdauer aus dem Abstand zweier Schlaege - nicht aus der
     * BPM-Angabe des Tracks. In einem Stundenmix wechselt das Tempo
     * unterwegs, und die Tempokarte weiss davon; eine feste Zahl aus dem
     * Dateinamen nicht.
     */
    const gemessen = (letzteSchlagZeit || 0) + sekunden;
    if (schattenLetzterBeat >= 0 && takt.nummer === schattenLetzterBeat + 1) {
      if (gemessen > 0.12 && gemessen < 2) {
        schlagDauer = schlagDauer * 0.7 + gemessen * 0.3;
        federStimmen();
      }
    }
    letzteSchlagZeit = 0;
    if (schattenLetzterBeat >= 0) {
      const staerke = takt.aufPhrase ? 1 : takt.aufEins ? 0.78 : 0.5;
      /*
       * Der Stoss geht in die *Geschwindigkeit*, die gewuenschte Groesse ist
       * aber eine *Auslenkung* - und zwischen beiden steht die Eigenfrequenz
       * der Feder. Ohne diesen Faktor kam von 0,4 gerade 0,02 an, und das
       * Nicken war fast unsichtbar.
       */
      const wunsch = staerke * (0.34 + wucht * 0.5 + spannung * 0.26) * (1 - abbau * 0.6);
      nickV += wunsch * eigenFrequenz;
    }
    schattenLetzterBeat = takt.nummer;

    // Die Geste ins Publikum: auf Phrasengrenzen, wenn es laut genug ist.
    if (takt.aufPhrase && takt.nummer !== letztePhrase) {
      letztePhrase = takt.nummer;
      if (wucht > 0.35 && abbau < 0.2 && Math.random() < 0.5) zeigenHalt = 1;
    }
  }

  // Die Feder.
  nickV += (-federK * nickX - federD * nickV) * sekunden;
  nickX += nickV * sekunden;
  // Ohne Deckel schaukelt sie sich bei sehr schnellen Beats auf.
  nickX = klemm(nickX, -0.6, 0.6);

  letzteSchlagZeit += sekunden;
  if (zeigenHalt > 0) zeigenHalt = Math.max(0, zeigenHalt - sekunden * 0.8);
  if (lage.drop) dropHalt = 1;
  else if (dropHalt > 0) dropHalt = Math.max(0, dropHalt - sekunden * 0.65);

  const m = masse(breite, hoehe);

  /*
   * Wie sehr er mitgeht. Aus Wucht und Abbau, denn beides steht in der
   * Analyse: Wucht ist die Energie des Stuecks, Abbau der Breakdown. Im
   * Breakdown pumpt niemand die Faust, und waehrend eines Uebergangs hat die
   * rechte Hand am Regler zu tun.
   */
  const schwung = klemm(wucht * 1.35 - abbau * 1.6 - anteilB * 0.5, 0, 1);

  /*
   * Die Faustpumpe zaehlt in Schlaegen, nicht in Sekunden.
   *
   * Bei einem Tempowechsel mitten im Mix bliebe eine Pumpe auf Sekundenbasis
   * stehen, waehrend der Schlag weiterlaeuft. Der Schlagzaehler kommt aus der
   * Analyse und ist die einzige Zeitachse, die zur Musik gehoert.
   */
  if (takt) pumpPhase = takt.beat ?? takt.nummer + (takt.imBeat ?? 0);
  /*
   * Die Form der Pumpe: harter Anschlag, langsames Zurueck.
   *
   * Zuerst stand hier eine Sinuskuppel ueber zwei Schlaege. Die ist
   * symmetrisch, und symmetrisch sieht aus wie *Winken*: Die Hand steigt
   * genauso lange, wie sie faellt, und beschreibt einen grossen Bogen. Ein
   * Fauststoss geht in einem Sechstel Schlag hoch und kommt ueber den Rest
   * zurueck - dieselbe Asymmetrie, die auch das Nicken erst zu einem Nicken
   * macht.
   */
  const uPump = (((pumpPhase % 2) + 2) % 2) / PUMPE_DAUER;
  const ANSCHLAG = 0.22;
  const roh =
    uPump >= 1 ? 0
      : uPump < ANSCHLAG ? uPump / ANSCHLAG
        : (1 - (uPump - ANSCHLAG) / (1 - ANSCHLAG)) ** 2.2;
  const pumpe = schwung * roh;

  // Traege Koerpergroessen. Der Oberkoerper geht mit der Spannung nach vorn -
  // der DJ beugt sich ueber das Pult, wenn es darauf zulaeuft.
  const neigungZiel = spannung * 0.16 - abbau * 0.06 + dropHalt * 0.1;
  neigung = folgen(neigung, neigungZiel, 3.2, sekunden);
  // Seitliches Wiegen, im halben Tempo des Schlags. Ueber eine eigene Phase
  // und nicht ueber imBeat, damit es beim Tempowechsel nicht springt.
  wiegePhase += sekunden * (0.7 + wucht * 0.9);
  const wiegeZiel = Math.sin(wiegePhase * Math.PI) * (0.4 + wucht * 0.6) * (1 - abbau * 0.5);
  wiegen = folgen(wiegen, wiegeZiel, 7, sekunden);
  // Der Kopf dreht sich zur Hand, die gerade etwas tut.
  kopfDreh = folgen(kopfDreh, (anteilB > 0 ? 0.4 : 0) - abbau * 0.55, 2.6, sekunden);

  const ziele = handZiele(m, { spannung, abbau, dropHalt, anteilB, wucht, pumpe });
  if (!handL) {
    handL = { x: ziele.lx, y: ziele.ly };
    handR = { x: ziele.rx, y: ziele.ry };
  }
  /*
   * Wie schnell die Haende ihren Zielen folgen.
   *
   * Vorher 9 je Sekunde, also eine Zeitkonstante von 110 ms - und das war der
   * Grund fuer "viel zu langsam fuer einen motivierten DJ". Bei 22 sind es
   * 45 ms: schnell genug, dass ein Drop schlagartig wirkt, langsam genug,
   * dass nichts zuckt.
   */
  const handTempo = 22 + dropHalt * 30;
  handL.x = folgen(handL.x, ziele.lx, handTempo, sekunden);
  handL.y = folgen(handL.y, ziele.ly, handTempo, sekunden);
  handR.x = folgen(handR.x, ziele.rx, handTempo, sekunden);
  handR.y = folgen(handR.y, ziele.ry, handTempo, sekunden);

  /*
   * Wie weit das Nicken den Koerper bewegt.
   *
   * Bei 0,42 war es rechnerisch da und praktisch nicht zu sehen - "die
   * Bewegungen passen nicht zum Beat" hiess in Wirklichkeit "ich sehe keine
   * Bewegung".
   */
  const nickPx = nickX * m.kopfH * 1.15;
  letzterNickPx = nickPx;
  const seitePx = wiegen * m.kopfH * 0.13;

  /*
   * Der Schlag auf den Haenden - und zwar *nach* der Glaettung.
   *
   * Das ist der Kunstgriff, der die Figur auf den Punkt bringt. Ginge der
   * Stoss in die Ziele, wuerde ihn dieselbe Traegheit wegbuegeln, die die
   * Posenwechsel weich macht. So bleibt beides: weiche Wege, harter Schlag.
   */
  const schlagY = nickPx * (0.8 + schwung * 0.9);
  const schlagX = nickPx * 0.35 * (0.3 + schwung);

  /* --- Die Figur stellen -------------------------------------------------- */
  const figH = m.figurH;
  const bx = m.mitte;
  const by = m.figurOben;

  // Der Rumpf verschiebt sich nur - er hat kein eigenes Gelenk.
  const rvx = seitePx;
  const rvy = nickPx * 0.85 + neigung * m.kopfH * 0.32;

  /*
   * Der Kopf dreht um den Hals und geht ein Stueck weiter als der Rumpf.
   * Beides zusammen ist das, was ein Nicken ausmacht: Der Kopf faellt weiter
   * als die Schultern, und er kippt dabei ein wenig. Ein Nicken allein aus
   * dem Hals sieht aus wie ein Wackelkopf im Auto; eines allein aus den
   * Schultern wie ein Aufzug.
   */
  const halsX = bx + rvx;
  const halsPy = by + RIG.halsY * figH + rvy;
  const kopfW = kopfDreh * 0.2 + wiegen * 0.06;
  const kvx = seitePx * 0.45 + kopfDreh * m.kopfH * 0.14;
  const kvy = nickPx * 0.55 + neigung * m.kopfH * 0.25;
  const kcos = Math.cos(kopfW);
  const ksin = Math.sin(kopfW);

  /*
   * Die Arme: je Seite einmal Umkehrkinematik, daraus zwei Drehwinkel.
   *
   * Gedreht wird gegen die *Bindepose* - den T-Pose, in dem gezeichnet wurde.
   * Der Winkel ist also nicht "wohin zeigt der Arm", sondern "wie weit hat er
   * sich seit der Zeichnung gedreht". Nur so stimmen Umriss und Skelett
   * zusammen.
   */
  const armLage = RIG.arme.map((a, i) => {
    const bsx = bx + a.schulter[0] * figH;
    const bsy = by + a.schulter[1] * figH;
    const sx = bsx + rvx;
    const sy = bsy + rvy;
    const hand = i === 0 ? handL : handR;
    const zx = hand.x + a.seite * schlagX;
    const zy = hand.y + schlagY;
    /*
     * Der Pol: aussen und unten, im Verhaeltnis 0,9 zu 0,75 - also gut
     * vierzig Grad unter der Waagerechten.
     *
     * Beide Extreme sind durchprobiert und beide sind falsch. Fast
     * waagerecht (1,15 zu 0,5) stellt die Ellenbogen ab wie Arme in die
     * Seite gestemmt. Fast senkrecht (0,42 zu 1,25) klappt sie nach innen
     * *hinter* den Rumpf - dort verschwinden die Oberarme, und uebrig
     * bleiben zwei waagerechte Stoecke am Pult.
     *
     * Nachgerechnet fuer die drei Schluesselhaltungen ergibt dieser Pol:
     * Haende am Teller - Ellenbogen aussen, knapp unter Schulterhoehe;
     * Kopfhoerer am Ohr - Ellenbogen aussen und angehoben, wie beim
     * Vorhoeren; Haende hoch - Ellenbogen aussen unter den Haenden.
     *
     * Er wandert mit dem Schlag ein Stueck mit, damit bei viel Wucht auch
     * der Ellenbogen sichtbar mitarbeitet und nicht nur die Hand.
     */
    const polx = sx + a.seite * m.armL * (0.9 + schwung * 0.2);
    const poly = sy + m.armL * (0.75 + nickX * 0.2);
    const g = ellbogen(sx, sy, zx, zy, a.l1 * figH, a.l2 * figH, polx, poly);
    const w1 = Math.atan2(g.ey - sy, g.ex - sx) - a.bindOben;
    const w2 = Math.atan2(g.hy - g.ey, g.hx - g.ex) - a.bindUnten;
    return {
      sx, sy,
      bsx, bsy,
      bex: bx + a.ellbogen[0] * figH,
      bey: by + a.ellbogen[1] * figH,
      ex: g.ex, ey: g.ey,
      c1: Math.cos(w1), s1: Math.sin(w1),
      c2: Math.cos(w2), s2: Math.sin(w2),
    };
  });

  // Einen Punkt der Zeichnung dorthin bringen, wo der Kopf ihn haben will.
  const amKopf = (px, py, aus) => {
    const dx = px + rvx - halsX;
    const dy = py + rvy - halsPy;
    aus[0] = halsX + dx * kcos - dy * ksin + kvx;
    aus[1] = halsPy + dx * ksin + dy * kcos + kvy;
  };

  // Wo der Kopf gelandet ist - die Abnahme misst daran, ob die Hand ans Ohr
  // kommt, und darf die Zahl nicht selbst nachrechnen muessen.
  const kopfMitte = [0, 0];
  amKopf(bx, by + RIG.halsY * 0.45 * figH, kopfMitte);
  letzterKopf = { x: kopfMitte[0], y: kopfMitte[1], hoehe: m.kopfH };

  stift.save();

  const licht = klemm(0.16 + wucht * 0.5 + dropHalt * 0.35, 0, 0.85);
  const saum = Math.max(1.5, m.kopfH * 0.06);

  /* --- Alles in einem Pfad ------------------------------------------------
   *
   * Die Figur besteht aus acht Umrissen und vier Gelenkkreisen. Sie einzeln
   * zu fuellen kostete gemessen 0,80 ms je Bild - sechsmal so viel wie die
   * Vorgaengerfassung, und das lag nicht an der Rechnung, sondern an der
   * Zahl der Fuellungen: vierundzwanzig je Bild statt sechs. Jede kostet den
   * Rasterer einen festen Aufschlag, unabhaengig davon, wie gross die Flaeche
   * ist.
   *
   * Also ein einziger Pfad je Durchgang, gefuellt mit der Nichtnull-Regel.
   * Ueberlappende Teile bleiben dabei gefuellt, weil alle Umrisse denselben
   * Umlaufsinn haben - das ist kein Zufall, sondern faellt bei der
   * Randverfolgung so an (das Innere liegt immer links). Ein echtes Loch
   * laeuft andersherum und bleibt deshalb ein Loch, ohne dass jemand
   * Aussen- von Innenrand unterscheiden muss.
   *
   * Nebenwirkung, und eine gute: Innerhalb eines Durchgangs gibt es keine
   * Reihenfolge mehr und damit auch keine inneren Kanten, an denen das
   * Streiflicht durchscheinen koennte.
   */

  // Ein starres Teil: um seinen Bindepunkt gedreht und ans Gelenk gelegt.
  const teil = (punkte, dx0, dy0, zx0, zy0, c, s, versatzY) => {
    for (let i = 0; i < punkte.length; i++) {
      const px = bx + punkte[i][0] * figH - dx0;
      const py = by + punkte[i][1] * figH - dy0;
      const x = zx0 + px * c - py * s;
      const y = zy0 + px * s + py * c;
      if (i) stift.lineTo(x, y + versatzY);
      else stift.moveTo(x, y + versatzY);
    }
    stift.closePath();
  };

  // Ein Teil, das sich nur verschiebt.
  const stillTeil = (punkte, vx, vy) => {
    for (let i = 0; i < punkte.length; i++) {
      const x = bx + punkte[i][0] * figH + vx;
      const y = by + punkte[i][1] * figH + vy;
      if (i) stift.lineTo(x, y);
      else stift.moveTo(x, y);
    }
    stift.closePath();
  };

  // Kopf und Kopfhoererbuegel drehen um den Hals.
  const kopfTeile = (versatzY) => {
    const k = [0, 0];
    for (const stueck of [RIG.kopf, ...RIG.kopfTeile]) {
      for (let i = 0; i < stueck.length; i++) {
        amKopf(bx + stueck[i][0] * figH, by + stueck[i][1] * figH, k);
        if (i) stift.lineTo(k[0], k[1] + versatzY);
        else stift.moveTo(k[0], k[1] + versatzY);
      }
      stift.closePath();
    }
  };

  /*
   * An der Schulter wird *nicht* abgedeckt.
   *
   * Hier standen nacheinander zwei Loesungen fuer die Fuge, die beim Drehen
   * zwischen Arm und Rumpf aufgeht: erst ein Kreis in Armdicke (der sass als
   * sichtbare Kugel auf der Schulter), dann ein Viereck ueber die
   * ueberstrichene Flaeche. Beide sind wieder heraus, und das ist eine
   * Entscheidung der Zeichnung: Das Aermelloch ist als weisser Schlitz
   * gezeichnet, weil die Trennung dort *gewollt* ist. Ein Rig, das sie
   * zukleistert, arbeitet gegen die Vorlage.
   *
   * Am Ellenbogen ist es anders - dort liegt eine weisse Naht quer durch den
   * Arm, und die soll beim Beugen nicht aufklaffen. Deshalb bleibt nur der
   * Kreis unten.
   */

  /*
   * Ein Gelenkkreis.
   *
   * Zwei starre Teile, die um einen gemeinsamen Punkt gegeneinander drehen,
   * reissen an der Aussenseite der Beugung einen Keil auf - beide Enden sind
   * gerade abgeschnitten. Der Kreis deckt ihn bei jedem Winkel ab. Sein
   * Radius ist die halbe Gliedmassendicke, im Bild gemessen: groesser waere
   * eine Beule, kleiner liesse den Keil stehen.
   *
   * Der Bogen laeuft rueckwaerts, damit sein Umlaufsinn zu den Umrissen
   * passt. Andersherum wuerde die Nichtnull-Regel aus jedem Gelenk ein Loch
   * machen.
   */
  const gelenk = (x, y, r, versatzY) => {
    stift.moveTo(x + r, y + versatzY);
    stift.arc(x, y + versatzY, r, 0, Math.PI * 2, true);
    stift.closePath();
  };

  /*
   * Ein ganzer Durchgang durch die Figur.
   *
   * Zweimal aufgerufen: erst weiss und ein paar Bildpunkte nach oben versetzt
   * (das Streiflicht), dann schwarz. Was vom Weissen oben uebersteht, ist
   * genau die Oberkante - egal welche Form sie gerade hat. Von Hand
   * nachgezogene Boegen koennten das nicht, weil die Kanten aus der Zeichnung
   * kommen und nicht aus dem Code.

   */
  const durchgang = (versatzY) => {
    stift.beginPath();
    for (let i = 0; i < RIG.arme.length; i++) {
      const a = RIG.arme[i];
      const L = armLage[i];
      teil(a.oberarm, L.bsx, L.bsy, L.sx, L.sy, L.c1, L.s1, versatzY);
      gelenk(L.ex, L.ey, a.ellbogenR * figH, versatzY);
      teil(a.unterarm, L.bex, L.bey, L.ex, L.ey, L.c2, L.s2, versatzY);
    }
    kopfTeile(versatzY);
    stillTeil(RIG.rumpf, rvx, rvy + versatzY);
    for (const st of RIG.still) stillTeil(st, rvx, rvy + versatzY);
    stift.fill();
  };

  stift.fillStyle = '#fff';
  stift.globalAlpha = licht;
  durchgang(-saum);
  stift.globalAlpha = 1;
  stift.fillStyle = 'rgb(4,5,10)';
  durchgang(0);

  /*
   * Das Pult in zwei Teilen - und das halbiert seine Kosten.
   *
   * Unterhalb der Kante ist es ein schwarzer Block, und ein Block ist ein
   * Rechteck. Ihn als Bild zu blitten heisst, zehntausende Bildpunkte durch
   * das Alpha-Mischwerk zu schicken, obwohl jeder davon dasselbe
   * undurchsichtige Schwarz ist. Ein fillRect schreibt dieselbe Flaeche ohne
   * zu mischen.
   *
   * Als Bild bleibt nur der Streifen oben, in dem die Plattenteller ueber die
   * Kante ragen.
   */
  const pultSetzen = (versatzY, hell) => {
    const bild = hell ? pultHell : pultBild;
    if (bild) {
      const anteil = PULT.deckel + 0.02;
      stift.drawImage(
        bild, 0, 0, PULT.breite, Math.ceil(PULT.hoehe * anteil),
        m.mitte - m.pultB / 2, m.pultBildOben + versatzY, m.pultB, m.pultH * anteil,
      );
    }
    if (hell) return;
    const oben = m.pultBildOben + m.pultH * (PULT.deckel + 0.015);
    stift.fillStyle = 'rgb(4,5,10)';
    stift.fillRect(m.mitte - m.pultB / 2, oben, m.pultB, hoehe - oben);
  };
  /*
   * Das Pult bekommt seinen Saum nur, wenn Zeit dafuer ist. Es ist die
   * groesste Flaeche der ganzen Figur, und ein zweiter Durchgang darueber
   * kostet mehr als alle anderen Teile zusammen.
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
    geladen: pultBild !== null,
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
