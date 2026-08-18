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

// Wo die Haende zuletzt wirklich waren, und wie die Gelenke standen - fuer
// die Abnahme.
const letzteHand = [null, null];
const letzteGelenke = [null, null];

// Der Kopf laeuft dem Federn des Koerpers hinterher - hier steht, wie weit
// er gerade ist.
let kopfNick = 0;
// Die Ist-Winkel der vier Armgelenke. Sie sind der Zustand, der jeden Sprung
// verhindert: Gerechnet wird ein Ziel, gezeichnet wird das, was hier steht.
let armWinkel = null;

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
  kopfNick = 0;
  armWinkel = null;
  letzteHand[0] = null;
  letzteHand[1] = null;
  letzteGelenke[0] = null;
  letzteGelenke[1] = null;
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
 * Zweigelenk-Umkehrkinematik in der Ebene.
 *
 * Gegeben Schulter, Ziel und zwei Gliedlaengen - gesucht der Ellenbogen. Das
 * ist der Kosinussatz und sonst nichts. Loesungen gibt es immer zwei,
 * spiegelbildlich zur Verbindung Schulter-Hand. Welche gilt, entscheidet
 * *nicht* diese Funktion: Sie liefert beide, und der Aufrufer waehlt nach
 * Anatomie und nach dem, wo der Arm gerade steht.
 *
 * Das ist die dritte Fassung, und die beiden Vorgaenger sind der Grund.
 *
 *   1. Ein festes Vorzeichen je Seite. Heisst "der Ellenbogen liegt immer auf
 *      derselben Seite der Sehne" - und welche Seite das im Bild ist, haengt
 *      davon ab, wo die Hand steht. Greift sie nach unten, stimmt es; geht
 *      sie ans Ohr, klappt der Ellenbogen nach oben durch.
 *   2. Ein Polvektor. Besser, aber er entscheidet in jedem Bild neu und ohne
 *      Gedaechtnis. Wandert die Hand ueber die Linie, auf der beide Loesungen
 *      gleich weit vom Pol weg sind, springt der Ellenbogen in einem Bild auf
 *      die andere Seite. Gemessen ueber zwei Schlaege Faustpumpe: Der rechte
 *      Ellenbogen lief von -163 auf +149 Grad, also durch die Streckung
 *      hindurch. Genau das sieht aus wie ein gebrochener Arm.
 */
function ellbogenPaar(sx, sy, zx, zy, l1, l2) {
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
  return {
    fx: sx + ux * a,
    fy: sy + uy * a,
    nx: -uy,
    ny: ux,
    h,
    hx: sx + dx,
    hy: sy + dy,
  };
}

// Einen Winkel nach (-PI, PI] bringen.
function gerade(a) {
  let w = a;
  while (w > Math.PI) w -= Math.PI * 2;
  while (w < -Math.PI) w += Math.PI * 2;
  return w;
}

/* --- Die Gelenkgrenzen -----------------------------------------------------
 *
 * Am Bild gemessen und an der Anatomie geprueft. Die Bindepose ist der
 * T-Pose, in dem der Arm gestreckt zur Seite zeigt; der Ellenbogen steht dort
 * auf 0,1 Grad (links) beziehungsweise 4,3 Grad (rechts), also gerade.
 *
 * Ein menschlicher Ellenbogen beugt sich nur in *eine* Richtung. Welche das
 * in dieser Zeichnung ist, sagen die Haltungen, die richtig aussehen: der
 * Kopfhoerer am Ohr links bei +136 Grad, der erhobene Arm rechts bei -70. Die
 * Beugung ist also seitengespiegelt, und mit `seite` als Vorzeichen ergibt
 * sich eine einzige Regel fuer beide Arme.
 *
 * Ueber die Streckung hinaus geht nichts - ein Arm, der nach hinten
 * durchknickt, ist gebrochen. Fuenfzehn Grad Spiel bleiben, weil Menschen
 * genau so viel Ueberstreckung haben.
 */
const ELLBOGEN_BEUGUNG = (150 * Math.PI) / 180;
const ELLBOGEN_STRECKUNG = (15 * Math.PI) / 180;
/*
 * Wie weit der Oberarm aus der Waagerechten heraus darf - nach oben wie nach
 * unten. 105 Grad heisst: senkrecht hoch und senkrecht runter sind erlaubt,
 * ein Stueck darueber hinaus auch, aber der Arm kann nicht hinter den Koerper
 * greifen.
 */
const SCHULTER_SPANNE = (105 * Math.PI) / 180;
/*
 * Wie schnell Gelenkwinkel ihren Zielen folgen, je Sekunde.
 *
 * Das ist die Versicherung gegen jeden Sprung: Ein Gelenk kann sich hier
 * nicht mehr in einem Bild umlegen, egal was die Kinematik ausrechnet. 26
 * entspricht 38 ms - schnell genug, dass eine Faustpumpe schlagartig wirkt,
 * langsam genug, dass ein Wechsel der Loesung als Bewegung sichtbar waere
 * statt als Sprung. Er kommt nur nicht mehr vor, weil die Grenzen oben ihn
 * ausschliessen.
 */
const GELENK_TEMPO = 26;
// Wie schnell ein Gelenk hoechstens dreht, im Bogenmass je Sekunde.
const GELENK_HOECHSTTEMPO = (800 * Math.PI) / 180;

/* --- Das Mass des Grooves --------------------------------------------------
 *
 * Alles in Kopfhoehen beziehungsweise Bogenmass, damit es auf jedem Bildschirm
 * gleich aussieht.
 */
/*
 * Wie tief der Koerper auf den Schlag einsackt.
 *
 * Nachgerechnet: Die Feder erreicht bei viel Wucht eine Auslenkung von rund
 * 0,25, die Kopfhoehe betraegt 64 Bildpunkte auf einem 640 Punkte hohen Bild.
 * 0,8 ergibt daraus knapp 13 Bildpunkte - umgerechnet auf einen Menschen gut
 * vier Zentimeter Kniebeuge, also das, was jemand tut, der mitgeht. Bei 0,42
 * waren es sechs Bildpunkte, und die sah man nicht.
 */
const FEDERN = 0.8;
// Wie weit der Kopf ueber das Federn des Koerpers hinaus nachgibt.
const KOPF_NICKEN = 0.35;
// Seitliche Gewichtsverlagerung.
const WIEGEN = 0.13;
/*
 * Wie weit der Rumpf dabei um die Huefte rollt, im Bogenmass.
 *
 * Das ist die Bewegung, die aus einer wippenden Puppe einen Menschen macht,
 * und sie ist klein: 0,045 sind zweieinhalb Grad. Mehr, und die Figur
 * schwankt wie ein Betrunkener; weniger, und die Schulterlinie steht starr,
 * waehrend der Koerper seitlich wandert - was das Auge sofort als falsch
 * liest, ohne sagen zu koennen warum.
 */
const KOERPER_ROLLEN = 0.045;
/*
 * Wie weit der Kopf gegen das Rollen ausgleicht.
 *
 * Menschen halten den Kopf senkrecht, auch wenn der Koerper kippt - das
 * Gleichgewichtsorgan sitzt darin. Der Ausgleich ist nicht vollstaendig,
 * sonst wirkt der Hals steif.
 */
const KOPF_AUSGLEICH = -0.028;
// Wo die Huefte sitzt, in Figurenhoehen - der Drehpunkt des Rollens.
const HUEFTE = 0.98;
/*
 * Wie weit die Ruhehaltung des Oberarms von der Senkrechten abweicht.
 *
 * Ein haengender Arm steht nicht am Koerper an, sondern faellt ein Stueck
 * nach aussen. Zwanzig Grad sind es beim entspannten Stehen; sie geben der
 * Loesungswahl ihre Richtung, wenn beide Ellenbogenlagen erlaubt sind.
 */
const RUHE_AUSWAERTS = (20 * Math.PI) / 180;

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

/* --- Die Choreografie ------------------------------------------------------
 *
 * Zwei Arten von Haltung, und sie brauchen zwei verschiedene Werkzeuge. Das
 * zu trennen ist die wichtigste Entscheidung an dieser Figur.
 *
 *   Griffe   - die Hand muss an einen *Ort*: auf den Plattenteller, an den
 *              Regler, ans Ohr. Wo der Ellenbogen dabei landet, ergibt sich.
 *              Dafuer ist Umkehrkinematik gemacht.
 *   Gesten   - die Faust in die Luft, beide Arme hoch, der Zeigefinger ins
 *              Publikum. Hier gibt es keinen Ort in der Welt, nur eine Form.
 *
 * Beides mit Umkehrkinematik zu machen war der Fehler, und er war messbar:
 * Bei der Faustpumpe liegt das Handziel nur 64 Bildpunkte von der Schulter
 * weg, der Arm ist aber 156 lang. Er muss sich also stark falten, und *wie*
 * er sich faltet, entscheidet die Kinematik in jedem Bild neu. Protokolliert
 * ueber zwei Schlaege: Der Oberarm drehte sich von 69 auf 102 Grad - kaum
 * etwas -, waehrend der Unterarm in siebzig Millisekunden um 117 Grad
 * durchpeitschte. Genau das ist das Zucken im Ellenbogen.
 *
 * Gesten werden deshalb als *Gelenkwinkel* hingeschrieben, so wie ein
 * Animator sie hinschreiben wuerde. Zwei Zahlen je Arm genuegen:
 *
 *   aus      wie weit der Oberarm aus der Senkrechten heraussteht -
 *            0 = haengt herunter, 90 = waagerecht, 180 = senkrecht hoch.
 *   beugung  wie weit der Ellenbogen gebeugt ist, immer in die eine
 *            Richtung, in die ein Ellenbogen sich beugen kann.
 *
 * Beide Zahlen gelten fuer beide Arme; die Seite kommt ueber das Vorzeichen
 * dazu. Damit kann eine Geste gar nicht erst unmenschlich werden.
 */
const grad = (g) => (g * Math.PI) / 180;

const GESTEN = {
  /*
   * Die Faustpumpe: Oberarm waagerecht nach aussen, Ellenbogen zu gut
   * siebzig Grad gebeugt - der Unterarm steht dadurch fast senkrecht und die
   * Faust ueber dem Kopf.
   *
   * Der erste Versuch hatte den Oberarm haengen (28 Grad aus der Senkrechten)
   * und den Ellenbogen mit 112 Grad staerker gebeugt. Nachgerechnet landet
   * die Faust damit nicht oben, sondern *seitlich* auf Schulterhoehe: Bei
   * einem Unterarm von 82 Bildpunkten und dieser Beugung zeigt er nach
   * rechts oben, nicht nach oben. Im Bild sah es aus, als winke die Figur.
   */
  pumpe: { aus: grad(118), beugung: grad(78) },
  // Beide Arme hoch, leicht nach innen geneigt: das V ueber dem Kopf.
  drop: { aus: grad(150), beugung: grad(30) },
  // Der Aufbau: ein Arm steigt fast gestreckt hoch.
  aufbau: { aus: grad(158), beugung: grad(16) },
  // Der Zeigefinger ins Publikum - Arm nach vorn oben, fast gestreckt.
  zeigen: { aus: grad(108), beugung: grad(10) },
};

/*
 * Wohin die Haende greifen sollen, und welche Geste wie stark dazwischenkommt.
 */
function armZiele(m, lage) {
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
   * Uebergang: die rechte Hand wandert mit dem Regler.
   *
   * Das ist die ehrlichste Bewegung der ganzen Figur - der Mischer blendet
   * wirklich gerade ueber, und anteilB ist wirklich der Stand des Reglers.
   * Nach aussen versetzt, weil die Hand in der Mitte hinter dem Oberkoerper
   * verschwindet und man vom Uebergang dann nichts saehe.
   */
  if (anteilB > 0) {
    /*
     * Der Weg ist etwas laenger als frueher und faengt weiter innen an, weil
     * jetzt die *echte* Handposition gemessen wird und nicht mehr das Ziel.
     * Am aeusseren Ende reicht der Arm nicht mehr ganz hin, der zurueckgelegte
     * Weg faellt also kuerzer aus als der Sollweg - gemessen 55 statt 74
     * Bildpunkten. Mit 0,24 der Pultbreite bleibt das Ziel in Reichweite und
     * die Bewegung ist wieder von hinten im Raum zu sehen.
     */
    rx = m.mitte + m.pultB * (0.08 + 0.24 * anteilB);
    ry = m.pultOben - m.kopfH * 0.04;
  }

  /*
   * Breakdown: der Kopfhoerer ans Ohr. Auch das stimmt - im Breakdown
   * bereitet die Buehne wirklich den naechsten Track vor, und ein DJ hoert
   * dann vor.
   */
  const amOhr = klemm((abbau - 0.15) / 0.5, 0, 1);
  if (amOhr > 0) {
    lx += (m.mitte - m.ohrX - lx) * amOhr;
    ly += (m.ohrY - ly) * amOhr;
  }

  /*
   * Die Gesten, nach Rang geordnet: Was staerker ist, gewinnt. Sie mischen
   * sich nicht - zwei halbe Gesten ergeben keine halbe Figur, sondern eine
   * unentschlossene.
   */
  const aufbau = klemm((spannung - 0.35) / 0.55, 0, 1);
  const gesten = [null, null];
  const setzen = (seite, name, gewicht) => {
    if (gewicht <= 0.01) return;
    const bisher = gesten[seite];
    if (!bisher || gewicht > bisher.gewicht) gesten[seite] = { ...GESTEN[name], gewicht };
  };
  // Rechts: Pumpe, Aufbau, Zeigen - je nach Lage.
  setzen(1, 'pumpe', pumpe);
  setzen(1, 'aufbau', aufbau);
  if (halt <= 0) setzen(1, 'zeigen', klemm(zeigenHalt, 0, 1));
  // Der Drop nimmt beide und schlaegt alles.
  if (halt > 0) {
    gesten[0] = { ...GESTEN.drop, gewicht: klemm(halt, 0, 1) };
    gesten[1] = { ...GESTEN.drop, gewicht: klemm(halt, 0, 1) };
  }
  // Am Ohr bleibt der linke Arm, was er ist - eine Geste waere dort falsch.
  if (amOhr > 0.2) gesten[0] = null;
  void wucht;

  return { lx, ly, rx, ry, gesten };
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
  /*
   * Die Form der Pumpe: steil hoch, oben bleiben, steil zurueck.
   *
   * Der Sinus hoch 0,6 macht genau das - flache Kuppe, steile Flanken. Die
   * beiden Vorgaenger waren beide falsch, und zwar aus demselben Grund: Eine
   * halb eingemischte Geste ist die *Durchgangslage*, und die ist hier ein
   * waagerecht abstehender Arm. Eine Sinuskuppel (hoch 1) haelt sich zu lange
   * darin auf, ein langsames Abklingen erst recht - im Filmstreifen stand der
   * Arm in fuenf von achtzehn Bildern seitlich ab und die Figur sah aus, als
   * winke sie. Was zaehlt, ist nicht die Dauer der Geste, sondern wie schnell
   * sie durch die Mitte kommt.
   */
  const roh = uPump >= 1 ? 0 : Math.sin(Math.PI * uPump) ** 0.6;
  /*
   * Die Pumpe kommt erst bei wirklich viel Energie, und dann ganz.
   *
   * Ein Versuch, den Arm zwischen zwei Pumpen auf halber Hoehe stehen zu
   * lassen, ist wieder heraus: Eine halb eingemischte Geste ist keine halbe
   * Geste, sondern die *Durchgangslage* - der Arm stand waagerecht ab, als
   * zeige die Figur dauerhaft zur Seite. Zwischenwerte einer Pose sind nur
   * auf dem Weg gut, nicht als Ruhelage.
   *
   * Stattdessen eine Schwelle, und eine scharfe: Unterhalb arbeitet die Figur
   * am Pult und grooved mit dem Koerper, oberhalb pumpt sie. Ueber acht
   * Prozent Wucht ist der Uebergang durch - waere er breiter, staende der
   * Arm bei mittlerer Lautstaerke dauerhaft in der Durchgangslage. Das ist
   * auch musikalisch richtig: Niemand reisst bei halber Lautstaerke die
   * Faust hoch.
   */
  const pumpe = klemm((schwung - 0.62) / 0.08, 0, 1) * roh;

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

  const ziele = armZiele(m, { spannung, abbau, dropHalt, anteilB, wucht, pumpe });
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

  /* --- Der Groove: aus dem Koerper, nicht aus den Haenden ----------------
   *
   * Hier stand vorher das Gegenteil, und das war der Fehler. Der Schlag wurde
   * auf die *Haende* gelegt: Sie zuckten auf jeden Beat ein Stueck nach unten
   * und aussen. Gemessen ueber zwei Schlaege lief der rechte Ellenbogen dabei
   * um 125 Grad hin und her, im Ruhezustand wohlgemerkt - er zuckte, statt zu
   * grooven.
   *
   * Ein Mensch macht es umgekehrt. Die Haende liegen auf den Tellern und
   * bleiben dort; was federt, sind die Knie. Der Koerper sackt auf den Schlag
   * ein paar Zentimeter ab, die Huefte verlagert das Gewicht von einem Bein
   * aufs andere, die Schulterlinie kippt dabei mit. Und weil die Hand liegen
   * bleibt, waehrend die Schulter sinkt, *beugt sich der Ellenbogen von
   * selbst* - genau im Takt, ohne dass irgendwo ein Beat auf einen Arm
   * gerechnet wird. Das ist der ganze Trick, und es ist derselbe, den eine
   * Bewegungsaufnahme liefern wuerde.
   *
   * Vier Groessen, vier Koerperteile:
   *
   *   Federn    Knie  - der Koerper sackt auf den Schlag ab.
   *   Wiegen    Huefte- Gewichtsverlagerung ueber zwei Schlaege, seitlich.
   *   Rollen    Rumpf - die Schulterlinie kippt zur belasteten Seite.
   *   Nicken    Kopf  - laeuft dem Koerper hinterher, nicht mit ihm.
   */

  /*
   * Das Nicken des Kopfes laeuft dem Federn *nach*.
   *
   * Ein Kopf sitzt auf einem Hals, und ein Hals ist weich. Sackt der Koerper
   * ab, folgt der Kopf ein Stueck spaeter - diese Verzoegerung ist das, was
   * das Auge als Masse liest. Bewegen sich beide gleichzeitig, sieht die Figur
   * aus wie aus einem Stueck Holz.
   */
  kopfNick += (nickX - kopfNick) * klemm(sekunden * 17, 0, 1);

  const federPx = nickX * m.kopfH * FEDERN;
  letzterNickPx = kopfNick * m.kopfH * (FEDERN + KOPF_NICKEN);
  const seitePx = wiegen * m.kopfH * WIEGEN;

  /* --- Die Figur stellen -------------------------------------------------- */
  const figH = m.figurH;
  const bx = m.mitte;
  const by = m.figurOben;

  /*
   * Der Koerper dreht um die Huefte, nicht um seine Mitte.
   *
   * Dort steht er auf den Beinen, und dort ist der Drehpunkt jeder
   * Gewichtsverlagerung. Rollt er um die Mitte, wandern Kopf und Huefte
   * gegenlaeufig aus - das sieht aus wie ein Metronom, nicht wie ein Mensch.
   */
  const hueftY = by + figH * HUEFTE;
  const koerperW = wiegen * KOERPER_ROLLEN;
  const rcos = Math.cos(koerperW);
  const rsin = Math.sin(koerperW);
  const rvx = seitePx;
  const rvy = federPx + neigung * m.kopfH * 0.32;
  const amKoerper = (px, py, aus) => {
    const dx = px - bx;
    const dy = py - hueftY;
    aus[0] = bx + dx * rcos - dy * rsin + rvx;
    aus[1] = hueftY + dx * rsin + dy * rcos + rvy;
  };

  /*
   * Der Kopf: er dreht zusaetzlich um den Hals und faellt weiter als die
   * Schultern. Beides zusammen ist ein Nicken. Nur aus dem Hals sieht es aus
   * wie ein Wackelkopf im Auto, nur aus den Schultern wie ein Aufzug.
   */
  const hals = [0, 0];
  amKoerper(bx, by + RIG.halsY * figH, hals);
  const kopfW = kopfDreh * 0.2 + wiegen * KOPF_AUSGLEICH;
  const kvy = kopfNick * m.kopfH * KOPF_NICKEN + neigung * m.kopfH * 0.25;
  const kvx = kopfDreh * m.kopfH * 0.14;
  const kcos = Math.cos(kopfW);
  const ksin = Math.sin(kopfW);
  const amKopf = (px, py, aus) => {
    amKoerper(px, py, aus);
    const dx = aus[0] - hals[0];
    const dy = aus[1] - hals[1];
    aus[0] = hals[0] + dx * kcos - dy * ksin + kvx;
    aus[1] = hals[1] + dx * ksin + dy * kcos + kvy;
  };

  /*
   * Die Arme.
   *
   * Die Hand ist das Ziel, die Schulter der Ausgangspunkt - und die Schulter
   * bewegt sich mit dem Koerper. Aus beidem rechnet die Kinematik den
   * Ellenbogen, und weil sie zwei Loesungen liefert, faellt hier die
   * Entscheidung: erst nach Anatomie, dann nach Naehe zum jetzigen Stand.
   */
  if (!armWinkel) armWinkel = RIG.arme.map(() => null);
  const schulterPunkt = [0, 0];
  const armLage = RIG.arme.map((a, i) => {
    amKoerper(bx + a.schulter[0] * figH, by + a.schulter[1] * figH, schulterPunkt);
    const sx = schulterPunkt[0];
    const sy = schulterPunkt[1];
    const hand = i === 0 ? handL : handR;
    const g = ellbogenPaar(sx, sy, hand.x, hand.y, a.l1 * figH, a.l2 * figH);

    let bestes = null;
    for (const vz of [1, -1]) {
      const ex = g.fx + vz * g.h * g.nx;
      const ey = g.fy + vz * g.h * g.ny;
      const o = Math.atan2(ey - sy, ex - sx);
      const u = Math.atan2(g.hy - ey, g.hx - ex);
      const rel = gerade(u - o);
      /*
       * Erlaubt ist nur, was ein Ellenbogen kann: Beugung in *eine* Richtung,
       * und ueber die Streckung hinaus fast nichts. `seite` dreht die Regel
       * fuer den linken Arm um - beide Arme beugen spiegelbildlich.
       */
      const gebeugt = -a.seite * rel;
      const erlaubt = gebeugt <= ELLBOGEN_BEUGUNG && gebeugt >= -ELLBOGEN_STRECKUNG;
      /*
       * Sind beide zulaessig, entscheiden zwei Dinge: wie nah die Loesung an
       * der Ruhehaltung liegt, und wie nah am jetzigen Stand.
       *
       * Die Ruhehaltung ist noetig, und das war ein Fehler: Zuerst zaehlte
       * nur die Naehe zum Ist-Wert. Im ersten Bild gibt es den aber nicht,
       * also gewann die zuerst gepruefte Loesung - und weil sie danach
       * *ihre eigene* Naehe geniesst, blieb der Arm fuer immer dort. Im
       * Standbild stand der rechte Arm waagerecht ab, waehrend der linke
       * ordentlich am Teller lag.
       *
       * Die Ruhehaltung ist "haengend, leicht nach aussen" - dorthin faellt
       * ein Arm unter seinem Gewicht.
       */
      const zurRuhe = Math.abs(gerade(o - (Math.PI / 2 - a.seite * RUHE_AUSWAERTS)));
      const naehe = armWinkel[i] ? Math.abs(gerade(o - armWinkel[i].o)) : 0;
      const wert = (erlaubt ? 0 : 100) + zurRuhe * 0.6 + naehe * 0.5;
      if (!bestes || wert < bestes.wert) bestes = { wert, o, u, rel, ex, ey };
    }

    /*
     * Die Geste dazwischenmischen.
     *
     * Sie kommt als Gelenkwinkel und nicht als Ort, also wird auch in
     * Winkeln gemischt - auf dem kuerzeren Bogen, sonst laeuft der Arm bei
     * einer Ueberblendung ueber 180 Grad einmal falsch herum.
     */
    let o = bestes.o;
    let uZiel = bestes.u;
    const geste = ziele.gesten[i];
    if (geste) {
      const oG = Math.PI / 2 - a.seite * geste.aus + koerperW;
      const uG = oG - a.seite * geste.beugung;
      o += gerade(oG - o) * geste.gewicht;
      uZiel += gerade(uG - uZiel) * geste.gewicht;
    }
    const ausBind = gerade(o - (a.bindOben + koerperW));
    if (ausBind > SCHULTER_SPANNE) o -= ausBind - SCHULTER_SPANNE;
    else if (ausBind < -SCHULTER_SPANNE) o -= ausBind + SCHULTER_SPANNE;
    let u = uZiel;
    const gebeugt2 = -a.seite * gerade(u - o);
    if (gebeugt2 > ELLBOGEN_BEUGUNG) u = o - a.seite * ELLBOGEN_BEUGUNG;
    else if (gebeugt2 < -ELLBOGEN_STRECKUNG) u = o + a.seite * ELLBOGEN_STRECKUNG;

    /*
     * Zum Schluss nachziehen - und zwar zweifach begrenzt.
     *
     * Das traege Nachziehen allein genuegt nicht. Es laesst je Bild einen
     * festen *Anteil* der Differenz zu, also bei einem grossen Sprung auch
     * einen grossen Schritt: Beim Drop schaltet die Geste in einem Bild von
     * null auf eins, und die Abnahme mass daraufhin 61 Grad in einer
     * Sechzigstelsekunde - 3700 Grad je Sekunde. Kein Gelenk kann das.
     *
     * Deshalb zusaetzlich eine Hoechstgeschwindigkeit. 800 Grad je Sekunde
     * ist schnell: Ein Boxer kommt am Ellenbogen auf gut das Doppelte, eine
     * Faust in die Luft auf die Haelfte. Der Drop braucht damit 175
     * Millisekunden, bis die Arme oben sind - ein Drittel Schlag, also genau
     * so schnell, wie es sich anfuehlen soll, und trotzdem eine Bewegung
     * statt eines Umschaltens.
     */
    const t = klemm(sekunden * GELENK_TEMPO, 0, 1);
    const hoechstens = GELENK_HOECHSTTEMPO * sekunden;
    /*
     * Gedaempft wird im *Gelenkraum*: die Schulter absolut, der Ellenbogen
     * gegen den Oberarm. Wuerde man beide absolut deckeln, koennten sie
     * gegenlaeufig ans Limit laufen und die Beugung aenderte sich doppelt so
     * schnell wie erlaubt - die Abnahme hat genau das gemessen, 18,5 Grad je
     * Bild bei einem Deckel von 13,3.
     */
    if (!armWinkel[i]) armWinkel[i] = { o, rel: gerade(u - o) };
    else {
      armWinkel[i].o += klemm(gerade(o - armWinkel[i].o) * t, -hoechstens, hoechstens);
      const relZiel = gerade(u - o);
      armWinkel[i].rel += klemm(gerade(relZiel - armWinkel[i].rel) * t, -hoechstens, hoechstens);
    }
    if (typeof window !== 'undefined' && window.__armLog) {
      window.__armLog.push([i, Math.round((o*180)/Math.PI), Math.round((u*180)/Math.PI),
        Math.round((armWinkel[i].o*180)/Math.PI), Math.round((armWinkel[i].u*180)/Math.PI),
        geste ? Math.round(geste.gewicht*100) : 0]);
    }
    const oI = armWinkel[i].o;
    const uI = oI + armWinkel[i].rel;
    /*
     * Wo die Hand wirklich gelandet ist.
     *
     * Nicht das Ziel, sondern das Ergebnis - und das ist ein Unterschied,
     * seit Gesten ueber Gelenkwinkel laufen: Bei erhobenen Armen gibt es gar
     * kein Handziel mehr, das man messen koennte. Die Abnahme prueft damit
     * das gezeichnete Bild statt einer Zwischenrechnung.
     */
    const exI = sx + Math.cos(oI) * a.l1 * figH;
    const eyI = sy + Math.sin(oI) * a.l1 * figH;
    letzteHand[i] = {
      x: exI + Math.cos(uI) * a.l2 * figH,
      y: eyI + Math.sin(uI) * a.l2 * figH,
    };
    /*
     * Die Gelenkstellung nach aussen sichtbar machen - fuer die Abnahme.
     *
     * `schulter` ist die Drehung des Oberarms gegen die Bindepose, `beugung`
     * die Beugung des Ellenbogens; beide in Grad, beide seitenbereinigt, so
     * dass links und rechts dieselben Zahlen ergeben. Damit kann die Abnahme
     * pruefen, was ein Mensch kann - und nicht nur, ob ein Bild entsteht.
     */
    letzteGelenke[i] = {
      schulter: (gerade(oI - (a.bindOben + koerperW)) * 180) / Math.PI * -a.seite,
      beugung: (-a.seite * gerade(uI - oI) * 180) / Math.PI,
    };
    const w1 = oI - a.bindOben;
    const w2 = uI - a.bindUnten;
    return {
      sx, sy,
      bsx: bx + a.schulter[0] * figH,
      bsy: by + a.schulter[1] * figH,
      bex: bx + a.ellbogen[0] * figH,
      bey: by + a.ellbogen[1] * figH,
      ex: exI,
      ey: eyI,
      c1: Math.cos(w1), s1: Math.sin(w1),
      c2: Math.cos(w2), s2: Math.sin(w2),
    };
  });

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
    handL: letzteHand[0] ? { ...letzteHand[0] } : null,
    handR: letzteHand[1] ? { ...letzteHand[1] } : null,
    // Die *Ziele* daneben - fuer die Fehlersuche, wenn Ziel und Ergebnis
    // auseinanderlaufen.
    zielL: handL ? { ...handL } : null,
    zielR: handR ? { ...handR } : null,
    gelenke: letzteGelenke.map((g) => (g ? { ...g } : null)),
    neigung,
    wiegen,
  };
}
