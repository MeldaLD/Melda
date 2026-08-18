// Das Spektrum so aufbereiten, dass man die Musik sieht.
//
// Zwischen dem Analyser des Browsers und dem Bild lag bisher nichts. Das
// klingt sparsam, kostet aber genau das, worum es geht - drei Dinge waren
// gemessen falsch:
//
// --- 1. Das Bild kam zu spaet ------------------------------------------------
//
// Der Analyser glaettet mit einem Faktor, und der stand auf 0,75. Das ist ein
// Tiefpass mit 58 ms Zeitkonstante: Nach einem Bild sind erst 25 % eines
// Anschlags da, nach 150 ms 90 %. Bei 128 Schlaegen je Minute ist das ein
// Drittel Schlag. Das Taktraster der Buehne sitzt derweil auf Millisekunden
// genau - Bewegung und Farbe liefen also gegeneinander.
//
// Der Faktor ist jetzt niedrig, und was der Tiefpass an Ruhe geliefert hat,
// liefert hier ein Spitzenhalter: Anstieg sofort, Abfall traege. Damit
// verschwindet die Verzoegerung, ohne dass das Bild flimmert - denn Flimmern
// entsteht beim Zurueckfallen, nicht beim Ansteigen.
//
// --- 2. Zwei Drittel des Spektrums waren tot ---------------------------------
//
// Gemessen ueber 900 Bilder Pruefstand: Der Bass liegt im Mittel bei 176 von
// 255 und ueberschreitet in 89 % der Bilder die Haelfte. Oberhalb von Bin 98
// liegt der Mittelwert bei 42 und der *Hoechstwert* nie ueber 128. Auf die
// Farbtabelle des Mandelbrots uebersetzt heisst das: Die inneren Baender sind
// dauerhaft hell, die aeusseren vierzig Prozent dauerhaft dunkel. Was sich
// bewegt, ist ein schmaler Ring in der Mitte.
//
// Dagegen hilft eine Verstaerkung je Band, bezogen auf das, was dieses Band
// ueber die letzten Sekunden hergegeben hat. Sie ist begrenzt (hoechstens
// gut das Dreifache), damit der Bass der Bass bleibt und nicht alles gleich
// laut wird - aber sie reicht, damit ein Becken oben genauso aufblitzt wie
// eine Bassdrum unten.
//
// --- 3. Oben wurde Rauschen abgetastet ---------------------------------------
//
// Die Farbtabelle liest je Eintrag *einen* Bin. Am unteren Ende lesen 245 von
// 512 Eintraegen denselben Bin wie ihr Vorgaenger, am oberen ueberspringt
// jeder Eintrag bis zu dreizehn. Ein Becken, das in Bin 700 sitzt, wird also
// mit einer Wahrscheinlichkeit von eins zu dreizehn ueberhaupt gesehen.
//
// Deshalb wird hier zuerst in 64 logarithmische Baender zusammengefasst, und
// zwar ueber das *Maximum* - ein Mittelwert wuerde die Spitze wegmitteln, auf
// die es ankommt. Danach traegt jeder Bin den Wert seines Bandes, und das
// Abtasten kann keinen Anschlag mehr verfehlen.
//
// --- Was es kostet -----------------------------------------------------------
//
// Weniger als das, was es ersetzt. Ein Durchgang ueber die nutzbaren Bins zum
// Zusammenfassen, 64 Baender rechnen, ein Durchgang zum Zurueckschreiben:
// gut tausend Rechenschritte je Bild. Die Farbtabelle daneben braucht
// sechstausend.

// Wie viele logarithmische Baender. 64 ist die Zahl, ab der die Baender im
// Bass schmaler sind als ein Bin - mehr braeuchte niemand.
export const BAENDER = 64;

/*
 * Nur die unteren 45 Prozent der Bins zaehlen: darueber ist bei Musik so gut
 * wie nie etwas los. Dieselbe Zahl benutzt visualmodi.js fuer seine
 * Tonlagen-Abbildung; sie steht hier, weil die Aufbereitung sie zuerst
 * braucht.
 */
export const NUTZBARER_ANTEIL = 0.45;

export function nutzbareBins(anzahl) {
  return Math.max(2, Math.floor(anzahl * NUTZBARER_ANTEIL));
}

/*
 * Wie schnell ein Band zurueckfaellt, je Sekunde.
 *
 * 9 heisst: nach 111 ms noch gut ein Drittel, nach einer Viertelsekunde ein
 * Zehntel. Kuerzer und das Bild flackert zwischen den Bildern; laenger und
 * zwei Schlaege verschmelzen zu einem Leuchten.
 */
const ABKLINGEN = 9;
/*
 * Ueber wie viele Sekunden sich ein Band merkt, wozu es faehig ist.
 *
 * Vier Sekunden sind rund acht Schlaege - lang genug, dass ein einzelner
 * Anschlag den Massstab nicht verstellt, kurz genug, dass ein Breakdown
 * innerhalb weniger Takte durchschlaegt.
 */
const GEDAECHTNIS = 4;
/*
 * Wie weit ein leises Band hochgezogen werden darf.
 *
 * Ohne Deckel wuerde jedes Band auf seinen eigenen Hoechstwert normiert, und
 * das Spektrum waere flach - der Bass verlore seine Vorherrschaft, und mit
 * ihr das, was ein Techno-Stueck ausmacht. 3,2 reicht, damit die gemessenen
 * 42 im oberen Drittel zu sichtbaren 134 werden.
 */
const HOECHSTE_VERSTAERKUNG = 3.2;
/*
 * Unterhalb dieses Pegels gilt ein Band als still und bekommt keine
 * Verstaerkung. Ohne diese Grenze wuerde in der Stille das Grundrauschen des
 * Analysers auf volle Helligkeit gezogen - und das Bild leuchtete, wenn gar
 * nichts laeuft.
 */
const STILLE_UNTER = 8;

let kanten = null;
let bandFuerBin = null;
let huelle = null;
let bezug = null;
let fuerLaenge = 0;

function vorbereiten(laenge) {
  if (fuerLaenge === laenge) return;
  fuerLaenge = laenge;
  const nutzbar = nutzbareBins(laenge);
  kanten = new Int32Array(BAENDER + 1);
  /*
   * Logarithmische Bandgrenzen. Streng steigend erzwungen: Im Bass liegen
   * mehrere Grenzen rechnerisch auf demselben Bin, und ein Band ohne Bin
   * haette keinen Wert.
   */
  for (let k = 0; k <= BAENDER; k++) {
    const roh = Math.round(Math.pow(nutzbar, k / BAENDER)) - 1;
    kanten[k] = Math.min(nutzbar, Math.max(roh, k === 0 ? 0 : kanten[k - 1] + 1));
  }
  kanten[BAENDER] = nutzbar;
  bandFuerBin = new Uint8Array(nutzbar);
  for (let k = 0; k < BAENDER; k++) {
    for (let i = kanten[k]; i < kanten[k + 1]; i++) bandFuerBin[i] = k;
  }
  huelle = new Float32Array(BAENDER);
  bezug = new Float32Array(BAENDER);
}

/** Fuer die Abnahme und den Moduswechsel: Huellkurven und Massstaebe leeren. */
export function spektrumZuruecksetzen() {
  if (huelle) huelle.fill(0);
  if (bezug) bezug.fill(0);
}

/**
 * Aus dem rohen Spektrum eines machen, in dem die Musik zu sehen ist.
 *
 * `roh` bleibt unveraendert - der Pegel fuer die Wucht wird daran gemessen
 * und darf nicht normiert sein, sonst waere jedes Stueck gleich laut.
 *
 * @param {Uint8Array} roh       was der Analyser liefert
 * @param {Uint8Array} ziel      gleich lang; nimmt das Ergebnis auf
 * @param {number} sekunden      seit dem letzten Bild
 * @returns {Uint8Array} ziel
 */
export function spektrumSchaerfen(roh, ziel, sekunden) {
  vorbereiten(roh.length);
  const nutzbar = kanten[BAENDER];
  const abfall = Math.exp(-ABKLINGEN * Math.max(0, sekunden));
  const vergessen = Math.exp(-Math.max(0, sekunden) / GEDAECHTNIS);

  // Zusammenfassen und Huellkurve nachziehen - in einem Durchgang.
  let lauteste = 0;
  for (let k = 0; k < BAENDER; k++) {
    let spitze = 0;
    for (let i = kanten[k]; i < kanten[k + 1]; i++) {
      const v = roh[i];
      if (v > spitze) spitze = v;
    }
    // Spitzenhalter: sofort hoch, traege zurueck.
    const h = spitze > huelle[k] ? spitze : huelle[k] * abfall;
    huelle[k] = h;
    const b = h > bezug[k] ? h : bezug[k] * vergessen;
    bezug[k] = b;
    if (b > lauteste) lauteste = b;
  }

  for (let k = 0; k < BAENDER; k++) {
    const b = bezug[k];
    /*
     * Die Verstaerkung bezieht sich auf das lauteste Band, nicht auf 255.
     * Damit haengt sie am Stueck und nicht am Aussteuerungspegel: Ein leise
     * gemasterter Track sieht genauso lebendig aus wie ein lauter.
     */
    const v = b > STILLE_UNTER ? Math.min(HOECHSTE_VERSTAERKUNG, Math.max(1, lauteste / b)) : 1;
    const wert = Math.min(255, huelle[k] * v);
    for (let i = kanten[k]; i < kanten[k + 1]; i++) ziel[i] = wert;
  }
  // Was oberhalb liegt, hat nie Musik enthalten. Es wird auf das oberste Band
  // gesetzt statt auf null, damit eine Abbildung, die versehentlich bis ganz
  // oben reicht, nicht in ein schwarzes Loch laeuft.
  const oben = ziel[nutzbar - 1];
  for (let i = nutzbar; i < ziel.length; i++) ziel[i] = oben;
  return ziel;
}
