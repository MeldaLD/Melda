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
// --- Woraus die Figur besteht ----------------------------------------------
//
// Aus *einer* Zeichnung. Sie wird beim Bauen zu geschlossenen Streckenzuegen
// verfolgt (werkzeuge/schattenumriss.mjs) und hier an einem Skelett verformt,
// wie es 2D-Skelettanimation ueberall tut: Jeder der 878 Randpunkte gehoert
// anteilig zu einem oder mehreren Knochen und wandert mit ihnen.
//
// Der Vorgaenger war eine Gliederpuppe aus fuenf einzeln gezeichneten Teilen.
// Sie hatte zwei Schultern uebereinander, harte Naehte an den Gelenken und
// vier verschiedene Strichstaerken - etwas, das *fast* wie ein Mensch aussieht
// und genau deshalb unheimlich wirkt. Ein Umriss hat diese Fehler nicht, weil
// er eine Form ist.
//
// Der teure Teil eines solchen Verfahrens - Dreiecksnetz, Texturkoordinaten,
// Schattierer - faellt hier weg: Eine Silhouette hat keine Innenzeichnung, zu
// bewegen ist nur der Rand.
//
// --- Warum es billig ist ---------------------------------------------------
//
// Gemessen 0,14 ms je Bild in einem Chromium *ohne* Grafikkarte - ein Viertel
// dessen, was die Gliederpuppe aus Bildern kostete, und gegen ein Fraktal, das
// zwischen 2 und 300 ms braucht, nicht messbar. Es sind ein paar tausend
// Multiplikationen und vier Fuellungen; das einzige Bild ist das Pult, und das
// bewegt sich nicht.
//
// Zwei Entscheidungen halten es dort:
//
//   1. Vorwaerts rechnen statt suchen. Die Arme werden ueber eine
//      Zweigelenk-Umkehrkinematik gestellt - das ist ein Kosinussatz, keine
//      Iteration. Zwei Wurzeln und ein Arkuskosinus je Arm.
//   2. Die Gewichte werden einmal gerechnet, nicht je Bild. Sie haengen an
//      der Zeichnung, und die aendert sich nicht.
//
// --- Warum die Bewegung stimmt ---------------------------------------------
//
// Der Kopf nickt nicht auf einer Sinuskurve. Eine Sinuskurve ist symmetrisch,
// ein Nicken nicht: Es faellt schnell auf den Schlag und kommt langsam
// zurueck. Deshalb sitzt hinter dem Kopf eine gedaempfte Feder, die bei jedem
// Schlag einen Stoss bekommt. Das ergibt von selbst die richtige Asymmetrie -
// und es haelt auch dann, wenn ein Bild ausfaellt oder das Tempo wechselt,
// weil die Feder in Sekunden rechnet und nicht in Bildern.

import { PULT } from './schattenteile.js';
import { UMRISS, ROLLEN, MARKEN } from './schattenumriss.js';

/* --- Die Figur: ein Umriss an einem Skelett --------------------------------
 *
 * Vorgaenger war eine Gliederpuppe aus fuenf einzeln gezeichneten Teilen. Das
 * ergab zwei Schultern uebereinander, harte Naehte an den Gelenken und vier
 * verschiedene Strichstaerken - etwas, das *fast* wie ein Mensch aussieht und
 * genau deshalb unheimlich wirkt.
 *
 * Jetzt ist es *eine* Zeichnung, zu geschlossenen Streckenzuegen verfolgt
 * (siehe werkzeuge/schattenumriss.mjs) und wie in der Spielebranche ueblich
 * an einem Skelett verformt: Jeder Randpunkt gehoert anteilig zu einem oder
 * mehreren Knochen und wandert mit ihnen. Der teure Teil eines solchen
 * Verfahrens - Dreiecksnetz, Texturkoordinaten, Schattierer - faellt weg,
 * weil eine Silhouette keine Innenzeichnung hat. Zu bewegen sind nur die
 * Randpunkte, und davon gibt es 878.
 *
 * Ein Geschenk der Zeichnung: Die weisse Aermelnaht schneidet die Arme vom
 * Rumpf ab, also sind sie schon *eigene* Schleifen. Die Trennung muss
 * niemand berechnen, und die Naht deckt beim Drehen zugleich die Fuge ab.
 *
 * Alle Masse sind Vielfache der Figurenhoehe: y = 0 ist der Scheitel, y = 1
 * die Unterkante, x = 0 die Mitte.
 */

// Wie weich der Uebergang zwischen Ober- und Unterarm ist, als Anteil der
// Armlaenge. Zu hart, und der Ellenbogen knickt wie Blech; zu weich, und der
// Arm wird zur Banane.
const ELLBOGEN_WEICH = 0.09;
// Dasselbe fuer den Hals, in Figurenhoehen.
const HALS_WEICH = 0.045;

const glatt = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const rampe = (v, a, b) => glatt((v - a) / (b - a || 1e-9));

/*
 * Das Skelett und die Gewichte - einmal aus dem Umriss gerechnet.
 *
 * Vier Knochen: der Rumpf steht, der Kopf dreht um den Hals, je Seite ein
 * Oberarm und ein Unterarm. Jeder Randpunkt bekommt Anteile daran, und die
 * Anteile ergeben zusammen eins - das ist lineare Mischhaut, wie sie jede
 * 2D-Skelettanimation benutzt.
 *
 * Das haengt allein an der Zeichnung, nicht an der Bildgroesse und nicht an
 * der Musik, und wird deshalb genau einmal gerechnet.
 *
 * --- Der Aermel ist der Grund, warum das mehr ist als Drehen -------------
 *
 * Das Schultergelenk sitzt *im Rumpf*, gut zwanzig Prozent der Figurenhoehe
 * ueber der Aermelnaht. Dreht man den Arm darum, wandert sein oberes Ende
 * unter den Aermel - und wenn der Aermel stehenbleibt, reisst dort ein
 * weisser Keil auf. Deshalb gehoeren die Randpunkte des Aermels anteilig zum
 * Oberarmknochen: Der Aermel geht mit. Umgekehrt gehoeren die obersten
 * Randpunkte des Armes anteilig zum Rumpf, damit die Naht nicht ausfranst.
 * Die beiden Gewichte sind zueinander komplementaer; an der Naht summieren
 * sie sich zu eins, und genau deshalb bleibt sie dicht.
 */
const RIG = (() => {
  const { halsY } = MARKEN;

  const arme = ROLLEN.arme.map((nr, i) => {
    const mk = MARKEN.arme[i];
    const [S, E, H] = [mk.schulter, mk.ellbogen, mk.hand];
    const laenge = Math.hypot(H[0] - S[0], H[1] - S[1]);
    // Laengs- und Querrichtung des Armes in der Bindepose.
    const dx = (H[0] - S[0]) / laenge;
    const dy = (H[1] - S[1]) / laenge;
    const laengs = (x, y) => (x - S[0]) * dx + (y - S[1]) * dy;
    const quer = (x, y) => -(x - S[0]) * dy + (y - S[1]) * dx;
    const eProj = laengs(E[0], E[1]);
    const weich = laenge * ELLBOGEN_WEICH;

    const punkte = UMRISS[nr];
    // Je Punkt: [Oberarm, Unterarm]. Am Ellenbogen tragen beide anteilig -
    // und genau deshalb *beugt* sich die Haut dort, statt dass zwei Teile
    // aneinanderstossen.
    const gewicht = punkte.map(([x, y]) => {
      const unten = rampe(laengs(x, y), eProj - weich, eProj + weich);
      return [1 - unten, unten];
    });

    /*
     * Die Schulterkappe - das Stueck Arm, das die Zeichnung nicht hergibt.
     *
     * Das Schultergelenk sitzt im Rumpf, gut ein Fuenftel der Figurenhoehe
     * ueber der Aermelnaht. Der gezeichnete Arm faengt aber erst an der Naht
     * an: Zwischen Gelenk und Arm klafft ein Stueck Oberarm, das im T-Shirt
     * steckt und deshalb nie gezeichnet wurde. Dreht man den Arm um das
     * Gelenk, kommt genau dieses Stueck zum Vorschein - und wenn es fehlt,
     * schwebt der Arm neben der Schulter.
     *
     * Also wird es ergaenzt: ein Balken in Armbreite vom Gelenk bis zur Naht,
     * oben rund abgeschlossen. Im Ruhestand liegt er vollstaendig hinter dem
     * Rumpf und ist unsichtbar; beim Heben wird er zum Deltamuskel. Weil er
     * denselben Knochen traegt wie der Arm, kann zwischen beiden nie eine
     * Fuge entstehen.
     *
     * Der Vorgaenger versuchte es andersherum - der *Aermel* sollte dem Arm
     * folgen, ueber Gewichte am Rumpfumriss. Das schmiert: Ein Randpunkt mit
     * Gewicht 0,5 dreht bei 90 Grad Armdrehung nur 45 Grad mit, und aus der
     * Schulter wird ein Zipfel. Bei erhobenen Armen stand der Rumpf als
     * schmales Rechteck ohne Schultern da.
     */
    let obenProj = Infinity;
    for (const [x, y] of punkte) obenProj = Math.min(obenProj, laengs(x, y));
    let halbe = 0;
    for (const [x, y] of punkte) {
      if (laengs(x, y) < obenProj + laenge * 0.08) halbe = Math.max(halbe, Math.abs(quer(x, y)));
    }
    // Etwas schmaler als der Arm: Die Kappe steckt im Aermel, und ein Rest
    // Rumpf soll auch bei ganz erhobenem Arm ueber ihr bleiben.
    const r = halbe * 0.8;
    const kappe = [];
    const BOGEN = 9;
    for (let k = 0; k <= BOGEN; k++) {
      const w = (k / BOGEN) * Math.PI;
      const q = Math.cos(w) * r;
      const l = -Math.sin(w) * r;
      kappe.push([S[0] + dx * l - dy * q, S[1] + dy * l + dx * q]);
    }
    const bis = obenProj + laenge * 0.06;
    kappe.push([S[0] + dx * bis + dy * r, S[1] + dy * bis - dx * r]);
    kappe.push([S[0] + dx * bis - dy * r, S[1] + dy * bis + dx * r]);

    return {
      punkte, gewicht, kappe,
      seite: Math.sign(mk.mitteX),
      schulter: S, ellbogen: E,
      l1: Math.hypot(E[0] - S[0], E[1] - S[1]),
      l2: Math.hypot(H[0] - E[0], H[1] - E[1]),
      bindOben: Math.atan2(E[1] - S[1], E[0] - S[0]),
      bindUnten: Math.atan2(H[1] - E[1], H[0] - E[0]),
    };
  });

  /*
   * Der Rumpf: starr, bis auf den Kopf.
   *
   * Je Punkt der Kopfanteil - eins oberhalb des Halses, null darunter, und
   * dazwischen weich, damit der Hals sich beugt statt zu knicken.
   */
  const koerper = UMRISS[ROLLEN.koerper];
  const kopfAnteil = koerper.map(([, y]) => 1 - rampe(y, halsY - HALS_WEICH, halsY + HALS_WEICH));

  // Zubehoer - hier der Kopfhoererbuegel - geht ganz mit dem Kopf.
  const kopfteile = ROLLEN.zubehoer.map((nr) => UMRISS[nr]);

  return { arme, koerper, kopfAnteil, kopfteile, halsY };
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
 * sieht. Also wird der Augenblick hier festgehalten und klingt ueber rund
 * zwei Sekunden ab: lang genug, dass man es sieht, kurz genug, dass die Figur
 * nicht minutenlang mit erhobenen Armen dasteht.
 */
let dropHalt = 0;

// Der Zeigefinger ins Publikum - ein Zufallsereignis, das nur auf
// Phrasengrenzen ausgeloest wird und dann eine Weile haelt.
let zeigenHalt = 0;
let letztePhrase = -1;


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
 * Zwei Einheiten, und beide haengen am Bild: die Breite des Pultes und die
 * Hoehe der Figur. Alles andere sind Vielfache davon. Damit stimmt die Figur
 * auf einem Telefon quer genauso wie auf einer Leinwand, und es gibt keine
 * Stelle, an der eine Zahl in Bildpunkten steht und bei anderer Groesse nicht
 * mehr passt.
 */

/*
 * Die Groesse der Figur - die einzigen beiden Zahlen hier, die reine
 * Bildkomposition sind und nicht Anatomie.
 *
 * Sie fuehren *von der Figur zum Pult* und nicht umgekehrt, und das ist eine
 * Korrektur. Vorher gab der Bildschirm die Pultbreite vor und die Figur
 * richtete sich danach: Auf einer Leinwand wurde das Pult 562 Bildpunkte
 * breit, die Figur 292 hoch - ein Moebel von der doppelten Schulterbreite,
 * hinter dem ein Kind steht. Ein DJ-Tisch ist gut zweieinhalb Schultern
 * breit, und eine Schulter ist knapp ein halbes Figurenmass. Daraus folgt
 * das Verhaeltnis unten.
 */
const FIGUR_ZU_BILD = 0.38;
const PULT_ZU_FIGUR = 1.6;
/*
 * Wo die Pultkante die Figur abschneidet, in Figurenhoehen.
 *
 * Die Zeichnung reicht vom Scheitel bis zur Huefte, und genau dort steht ein
 * DJ-Tisch: Ein Pult ist knapp einen Meter hoch, eine Huefte auch. 0,87
 * laesst die Figur ein Stueck hinter der Kante verschwinden, damit sie nicht
 * darauf zu sitzen scheint.
 *
 * Die Zahl entscheidet ausserdem ueber die Armhaltung, und das ist ihr
 * eigentliches Gewicht: Sie legt fest, wie hoch die Schulter ueber der Platte
 * steht. Bei 0,72 waren es 0,38 Figurenhoehen gegen eine Armlaenge von 0,64 -
 * der Arm musste sich fuer eine Reichweite von 128 Bildpunkten auf 194
 * zusammenfalten, und der Ellenbogen klappte vor die Brust. Bei 0,87 sind es
 * 0,53, und der Griff zum Teller braucht 87 % der Armlaenge: leicht gebeugt,
 * so wie jemand steht, der auflegt.
 */
const SCHNITT = 0.87;

function masse(breite, hoehe) {
  const mitte = breite * 0.5;

  // Erst die Figur, dann das Moebel. Der Deckel gegen die Bildbreite faengt
  // sehr schmale Bildschirme ab, auf denen das Pult sonst hinausstuende.
  const figurH = hoehe * FIGUR_ZU_BILD;
  const pultB = Math.min(figurH * PULT_ZU_FIGUR, breite * 0.7);
  const pultH = pultB * (PULT.hoehe / PULT.breite);
  // Die Oberkante des Bildes liegt ueber der Platte - dazwischen stehen die
  // Plattenteller. Der Koerper wird an der *Platte* abgeschnitten.
  const pultBildOben = hoehe - pultH * 1.02;
  const pultOben = pultBildOben + pultH * PULT.deckel;

  const figurOben = pultOben - figurH * SCHNITT;
  // Der Kopf: Scheitel bis Hals, gemessen an der Zeichnung. Er ist die
  // Einheit, in der die Choreografie unten rechnet.
  const kopfH = figurH * MARKEN.halsY;

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
    // Schulterbreite und -hoehe: die Gelenke, um die die Arme drehen.
    schulterB: figurH * Math.abs(schulter[0]),
    schulterY: figurOben + figurH * schulter[1],
    // Das Ohr - dorthin wandert im Breakdown die Hand mit dem Kopfhoerer.
    ohrX: figurH * 0.105,
    ohrY: figurOben + figurH * 0.15,
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
  /*
   * Wie weit aussen die Teller liegen - begrenzt durch die Reichweite.
   *
   * Nicht geschaetzt: PULT.teller ist die Mitte des linken Plattentellers,
   * im Pultbild gemessen. Steht die Hand woanders, sieht man es sofort - ein
   * DJ, der neben den Teller greift.
   */
  const tellerX = m.pultB * PULT.teller;
  let lx = m.mitte - tellerX;
  /*
   * Die Ruhehaende liegen *auf* den Tellern, also knapp ueber der Pultkante.
   *
   * Vorher lagen sie darunter - und weil das Pult zuletzt darueber gezeichnet
   * wird, waren beide Haende unsichtbar. Von einem Arm, der im Moebel endet,
   * hat die Silhouette nichts.
   */
  let ly = m.pultOben - m.kopfH * 0.10;
  let rx = m.mitte + tellerX;
  let ry = ly;

  /*
   * Uebergang: die rechte Hand wandert mit dem Regler.
   *
   * Das ist die ehrlichste Bewegung der ganzen Figur - der Mischer blendet
   * wirklich gerade ueber, und anteilB ist wirklich der Stand des Reglers.
   * Wer genau hinsieht, kann am Schatten ablesen, wie weit der Wechsel ist.
   */
  if (anteilB > 0) {
    /*
     * Der Regler sitzt in Wirklichkeit in der Mitte des Mischers - und dort
     * ist die Hand hinter dem Oberkoerper unsichtbar. Gemessen an der
     * Silhouette: Der Rumpf ist gut 38 Bildpunkte breit, die Schulter sitzt
     * bei 43, und eine Hand in der Mitte laesst den ganzen Arm verschwinden.
     * Vom Uebergang - der ehrlichsten Bewegung der Figur - saehe man dann
     * nichts.
     *
     * Also nach aussen versetzt, aber mit dem vollen Weg: Die Hand wandert
     * ueber ein Fuenftel der Pultbreite, und das ist von hinten im Raum zu
     * sehen. Die Abnahme verlangt dafuer mindestens 60 Bildpunkte auf einem
     * 600 Punkte hohen Bild.
     */
    rx = m.mitte + m.pultB * (0.10 + 0.20 * anteilB);
    ry = m.pultOben - m.kopfH * 0.02;
  }

  /*
   * Breakdown: der Kopfhoerer ans Ohr.
   *
   * Auch das stimmt: Im Breakdown bereitet die Buehne den naechsten Track vor.
   * Ein DJ hoert dann vor, und genau das tut die Figur.
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
  if (!pultBild) { pultLaden(); }

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

  /* --- Die Figur verformen ---------------------------------------------
   *
   * Ab hier wird gerechnet, was jedes Bild neu anfaellt: 878 Randpunkte
   * durch bis zu vier Knochen. Das sind ein paar tausend Multiplikationen -
   * gegen ein Fraktal, das zwischen 2 und 300 ms braucht, nicht messbar.
   *
   * Die Reihenfolge der Knochen ist die eines Koerpers: Der Rumpf traegt
   * alles, der Kopf haengt am Hals, die Arme haengen an den Schultern. Wer
   * unten etwas verschiebt, verschiebt oben mit.
   */
  const figH = m.figurH;
  const bx = m.mitte;
  const by = m.figurOben;

  // Der Rumpf verschiebt sich nur - er hat kein eigenes Gelenk.
  const rvx = seitePx;
  const rvy = nickPx * 0.85 + neigung * m.kopfH * 0.32;

  /*
   * Der Kopf dreht um den Hals und geht ein Stueck weiter als der Rumpf.
   *
   * Beides zusammen ist das, was ein Nicken ausmacht: Der Kopf faellt weiter
   * als die Schultern, und er kippt dabei ein wenig. Ein Nicken allein aus
   * dem Hals sieht aus wie ein Wackelkopf im Auto; eines allein aus den
   * Schultern sieht aus wie ein Aufzug.
   */
  const halsX = bx + rvx;
  const halsY = by + RIG.halsY * figH + rvy;
  const kopfW = kopfDreh * 0.18 + wiegen * 0.05;
  const kvx = seitePx * 0.4 + kopfDreh * m.kopfH * 0.12;
  const kvy = nickPx * 0.5 + neigung * m.kopfH * 0.23;
  const kcos = Math.cos(kopfW);
  const ksin = Math.sin(kopfW);

  /*
   * Die Arme: je Seite einmal Umkehrkinematik, daraus zwei Drehwinkel.
   *
   * Gedreht wird gegen die *Bindepose* - die Haltung, in der die Figur
   * gezeichnet wurde. Der Winkel ist also nicht "wohin zeigt der Arm",
   * sondern "wie weit hat er sich seit der Zeichnung gedreht". Nur so
   * stimmen Umriss und Skelett zusammen.
   */
  const armLage = RIG.arme.map((a, i) => {
    const bsx = bx + a.schulter[0] * figH;
    const bsy = by + a.schulter[1] * figH;
    const sx = bsx + rvx;
    const sy = bsy + rvy;
    const ziel = i === 0 ? handL : handR;
    const g = ellbogen(sx, sy, ziel.x, ziel.y, a.l1 * figH, a.l2 * figH, a.seite);
    const w1 = Math.atan2(g.ey - sy, g.ex - sx) - a.bindOben;
    const w2 = Math.atan2(g.hy - g.ey, g.hx - g.ex) - a.bindUnten;
    return {
      sx, sy, bsx, bsy,
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
    const dy = py + rvy - halsY;
    aus[0] = halsX + dx * kcos - dy * ksin + kvx;
    aus[1] = halsY + dx * ksin + dy * kcos + kvy;
  };

  // Wo der Kopf gelandet ist - die Abnahme misst daran, ob die Hand ans Ohr
  // kommt, und darf die Zahl nicht selbst nachrechnen muessen.
  const kopfMitte = [0, 0];
  amKopf(bx, by + RIG.halsY * 0.5 * figH, kopfMitte);
  letzterKopf = { x: kopfMitte[0], y: kopfMitte[1], hoehe: m.kopfH };

  stift.save();

  /*
   * Voll deckend, und das ist eine Korrektur.
   *
   * Zuerst stand hier rgba(...,0.94) - ein Hauch Durchlaessigkeit, damit die
   * Figur nicht wie ausgeschnittenes Papier wirkt. Der Haken ist die
   * Zeichenreihenfolge: Wo sich zwei halbdurchlaessige Flaechen ueberlappen -
   * Arm ueber Aermel, Kopf ueber Hals -, addieren sich die Deckungen, und es
   * entstehen dunklere Flecken entlang jeder inneren Naht.
   *
   * Ein Schatten vor einer Projektion ist ohnehin praktisch schwarz. Fuer die
   * Trennung vom Hintergrund sorgt das Streiflicht, nicht die Durchsicht.
   */
  const licht = klemm(0.16 + wucht * 0.5 + dropHalt * 0.35, 0, 0.85);
  const saum = Math.max(1.5, m.kopfH * 0.055);

  /*
   * Der Arm als ein Zug: Rumpfanteil, Oberarm, Unterarm gemischt.
   *
   * Gemischt und nicht umgeschaltet - das ist der ganze Unterschied zur
   * Gliederpuppe von vorher. An der Ellenbogenstelle traegt ein Punkt
   * anteilig beide Knochen, und deshalb *beugt* sich die Haut dort, statt
   * dass zwei Teile aneinanderstossen.
   */
  const armZeichnen = (k, versatzY) => {
    const a = RIG.arme[k];
    const L = armLage[k];
    const p = a.punkte;
    const g = a.gewicht;
    // Erst die Schulterkappe - sie traegt nur den Oberarm und geht deshalb
    // ohne Mischung.
    stift.beginPath();
    for (let i = 0; i < a.kappe.length; i++) {
      const dx = a.kappe[i][0] * figH + bx - L.bsx;
      const dy = a.kappe[i][1] * figH + by - L.bsy;
      const x = L.sx + dx * L.c1 - dy * L.s1;
      const y = L.sy + dx * L.s1 + dy * L.c1;
      if (i) stift.lineTo(x, y + versatzY);
      else stift.moveTo(x, y + versatzY);
    }
    stift.closePath();
    stift.fill();

    stift.beginPath();
    for (let i = 0; i < p.length; i++) {
      const px = bx + p[i][0] * figH;
      const py = by + p[i][1] * figH;
      const w = g[i];
      let x = 0;
      let y = 0;
      if (w[0] > 0) {
        const dx = px - L.bsx;
        const dy = py - L.bsy;
        x += w[0] * (L.sx + dx * L.c1 - dy * L.s1);
        y += w[0] * (L.sy + dx * L.s1 + dy * L.c1);
      }
      if (w[1] > 0) {
        const dx = px - L.bex;
        const dy = py - L.bey;
        x += w[1] * (L.ex + dx * L.c2 - dy * L.s2);
        y += w[1] * (L.ey + dx * L.s2 + dy * L.c2);
      }
      if (i) stift.lineTo(x, y + versatzY);
      else stift.moveTo(x, y + versatzY);
    }
    stift.closePath();
    stift.fill();
  };

  /*
   * Koerper und Kopfhoererbuegel in *einem* Pfad, gefuellt mit der
   * Gerade-Ungerade-Regel.
   *
   * Der Buegel liegt als eigene Schleife im Kopf. Als eigener Pfad gefuellt
   * waere er eine schwarze Flaeche auf schwarzem Grund und damit unsichtbar;
   * im selben Pfad wird der eingeschlossene Spalt zwischen Buegel und
   * Schaedel zum Loch - und erst das Loch macht aus einer Silhouette einen
   * Kopfhoerer.
   */
  const koerperZeichnen = (versatzY) => {
    const p = RIG.koerper;
    const g = RIG.kopfAnteil;
    const k = [0, 0];
    stift.beginPath();
    for (let i = 0; i < p.length; i++) {
      const px = bx + p[i][0] * figH;
      const py = by + p[i][1] * figH;
      const w = g[i];
      let x = (1 - w) * (px + rvx);
      let y = (1 - w) * (py + rvy);
      if (w > 0) { amKopf(px, py, k); x += w * k[0]; y += w * k[1]; }
      if (i) stift.lineTo(x, y + versatzY);
      else stift.moveTo(x, y + versatzY);
    }
    stift.closePath();
    for (const teil of RIG.kopfteile) {
      for (let i = 0; i < teil.length; i++) {
        amKopf(bx + teil[i][0] * figH, by + teil[i][1] * figH, k);
        if (i) stift.lineTo(k[0], k[1] + versatzY);
        else stift.moveTo(k[0], k[1] + versatzY);
      }
      stift.closePath();
    }
    stift.fill('evenodd');
  };

  /*
   * Das Streiflicht: dieselbe Gestalt noch einmal in Weiss, ein paar
   * Bildpunkte nach oben versetzt. Was davon oben uebersteht, ist genau die
   * Oberkante - egal welche Form sie gerade hat. Von Hand nachgezogene Boegen
   * koennten das nicht, weil die Kanten jetzt aus der Zeichnung kommen und
   * nicht mehr aus dem Code.
   *
   * Erst alles Weisse, dann alles Schwarze. Andersherum wuerde der weisse
   * Arm den schwarzen Koerper aufhellen.
   */
  stift.fillStyle = '#fff';
  stift.globalAlpha = licht;
  armZeichnen(0, -saum);
  armZeichnen(1, -saum);
  koerperZeichnen(-saum);

  /*
   * Gezeichnet wird von hinten nach vorn: Arme, Koerper, Pult.
   *
   * Die Arme kommen *vor* den Koerper, damit der Aermel ihr oberes Ende
   * ueberdeckt. Das Pult kommt zuletzt und schneidet die Figur unten ab -
   * eine Huefte muss dadurch gar nicht erst gezeichnet werden, und der
   * Uebergang stimmt bei jeder Bildgroesse von selbst.
   */
  stift.globalAlpha = 1;
  stift.fillStyle = 'rgb(4,5,10)';
  armZeichnen(0, 0);
  armZeichnen(1, 0);
  koerperZeichnen(0);

  // --- Pult ------------------------------------------------------------------
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
