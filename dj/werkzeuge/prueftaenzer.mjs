// Ein synthetischer Taenzer als Pruefstand.
//
//   node dj/werkzeuge/prueftaenzer.mjs [ziel.bvh]
//
// Wozu: Die ganze Einlesekette laesst sich damit durchmessen, bevor eine
// einzige echte Datei da ist - und zwar *gegen bekannte Sollwerte*, weil
// dieses Werkzeug sie selbst hineinschreibt. Wenn die Kette hinterher 124,0
// BPM, eine Verlagerung ueber acht Schlaege und ein Absacken ueber vier
// meldet, dann nicht, weil es plausibel aussieht, sondern weil genau das
// erzeugt wurde.
//
// Nachgebildet wird, was von einer Bewegungserfassung kommt:
//
//   - menschliche Proportionen in Zentimetern,
//   - ein voller Knochenbaum samt Beinen (die spaeter niemand sieht, die aber
//     in echten Dateien drinstehen und mitgelesen werden muessen),
//   - Drehkanaele in der Reihenfolge ZXY, so wie es die meisten Werkzeuge
//     schreiben,
//   - vier Tischtipper zum Einzaehlen,
//   - danach der Groove.
//
// Absichtlich *nicht* nachgebildet: das Zittern eines echten Loesers. Dafuer
// gibt es einen eigenen Schalter (`--zittern`), damit sich getrennt pruefen
// laesst, ob die Kette an sauberen Daten richtig rechnet und ob sie an
// verrauschten nicht zusammenbricht.

import fs from 'node:fs/promises';

export const BPM = 124;
export const SCHLAG = 60 / BPM;
export const BILDRATE = 60;
// Sieben Takte, wie die Referenzmusik: ein Takt Einzaehlen, sechs Takte Move.
export const TAKTE = 7;
// Die Sollwerte, gegen die die Abnahme prueft.
export const SOLL = {
  bpm: BPM,
  // Der erste Tipper sitzt bewusst *nicht* auf Sekunde null: In einem echten
  // Clip ist vorher noch etwas Video. Die Kette muss den Anfang finden und
  // darf ihn nicht annehmen.
  ersterTipper: 0.7,
  tipper: 4,
  // Eine ganze Gewichtsverlagerung dauert acht Schlaege, das Absacken vier.
  wiegeSchlaege: 8,
  senkSchlaege: 4,
  // Knochenlaengen in Zentimetern, wie unten im Baum.
  oberarm: 28,
  unterarm: 26,
  rumpf: 52,
};

/* --- Der Knochenbaum -------------------------------------------------------
 *
 * Proportionen einer etwa 1,70 m grossen Person. Die Zahlen sind nicht
 * geraten: Oberarm und Unterarm stehen im Verhaeltnis 28:26, und die
 * Spannweite Schulter-Schulter ist 36 - das entspricht dem, was
 * anthropometrische Tabellen fuer erwachsene Menschen angeben, und vor allem
 * dem Verhaeltnis, das die gezeichnete Figur hat. Wenn die Umrechnung auf die
 * Zeichnung hinterher stimmt, liegt es also nicht daran, dass beide zufaellig
 * gleich gebaut sind.
 */
const BAUM = [
  // [Name, Elternname, Offset, ist Spitze]
  /*
   * Die Wurzel steht im Ursprung, ihre Hoehe traegt der Positionskanal.
   *
   * Zuerst stand hier [0, 92, 0] *und* der Kanal schrieb 92 - und die
   * Einlesekette meldete eine Huefte auf 184 cm. Sie hatte recht: Nach der
   * BVH-Regel addiert sich der Positionskanal auf den Offset, und zwei
   * Quellen fuer dieselbe Groesse sind eine zu viel. Fast alle echten
   * Dateien halten es genauso wie es jetzt hier steht.
   */
  ['Hips', null, [0, 0, 0]],
  ['Spine', 'Hips', [0, 12, 0]],
  ['Spine1', 'Spine', [0, 14, 0]],
  ['Spine2', 'Spine1', [0, 14, 0]],
  ['Neck', 'Spine2', [0, 12, 0]],
  ['Head', 'Neck', [0, 10, 0]],
  ['HeadTop', 'Head', [0, 14, 0], true],
  ['LeftShoulder', 'Spine2', [4, 8, 0]],
  ['LeftArm', 'LeftShoulder', [14, 0, 0]],
  ['LeftForeArm', 'LeftArm', [28, 0, 0]],
  ['LeftHand', 'LeftForeArm', [26, 0, 0]],
  ['LeftHandEnd', 'LeftHand', [8, 0, 0], true],
  ['RightShoulder', 'Spine2', [-4, 8, 0]],
  ['RightArm', 'RightShoulder', [-14, 0, 0]],
  ['RightForeArm', 'RightArm', [-28, 0, 0]],
  ['RightHand', 'RightForeArm', [-26, 0, 0]],
  ['RightHandEnd', 'RightHand', [-8, 0, 0], true],
  ['LeftUpLeg', 'Hips', [9, -4, 0]],
  ['LeftLeg', 'LeftUpLeg', [0, -44, 0]],
  ['LeftFoot', 'LeftLeg', [0, -42, 0]],
  ['LeftToe', 'LeftFoot', [0, -6, 14], true],
  ['RightUpLeg', 'Hips', [-9, -4, 0]],
  ['RightLeg', 'RightUpLeg', [0, -44, 0]],
  ['RightFoot', 'RightLeg', [0, -42, 0]],
  ['RightToe', 'RightFoot', [0, -6, 14], true],
];

/* --- Die Bewegung ----------------------------------------------------------
 *
 * Gebaut aus denselben Bausteinen, aus denen ein Mensch sie baut - und
 * ausdruecklich *nicht* aus denen, die der Schatten-DJ bisher benutzt hat.
 * Sonst wuerde die Abnahme am Ende nur bestaetigen, dass ich zweimal
 * dasselbe gerechnet habe.
 */

/*
 * Ein Tipper: die Hand holt aus, faellt beschleunigt und wird hart gestoppt.
 *
 * Der erste Anlauf ging vor *und* nach dem Aufschlag nach unten, und der
 * Aufschlag selbst war ein Hochpunkt dazwischen. Die Kette fand daraufhin
 * acht Tiefpunkte statt vier - im Abstand eines halben Schlages. Der Fehler
 * war offensichtlich, sobald die Zahlen dastanden, und unsichtbar, solange
 * man ihn nur gedacht hat.
 *
 * Worauf es ankommt, ist der Knick bei d = 0: davor beschleunigt die Hand
 * nach unten, danach kehrt sie geradlinig zurueck. Dieser Knick ist eine
 * grosse Beschleunigung nach oben - und genau daran erkennt man einen
 * Aufschlag, an der Hoehe allein naemlich nicht.
 */
const TIPP_FALL = 0.20;
const TIPP_RUECK = 0.26;
function tipper(t, wann) {
  const d = t - wann;
  if (d < -TIPP_FALL - 0.14 || d > TIPP_RUECK) return 0;
  /*
   * Ausholen: ein Bogen nach oben, und zwar einer, der an beiden Enden mit
   * Steigung null anfaengt und aufhoert.
   *
   * Zuerst stand hier sin(u*pi) statt sin(u*pi)^2. Der Unterschied klingt
   * nach nichts und war der Grund, warum die Tippererkennung 317 ms daneben
   * lag: sin(u*pi) startet bei u=0 mit voller Steigung, die Hand springt
   * also von Stillstand auf 7,9 Einheiten je Sekunde. Das ist ein
   * Geschwindigkeitssprung, und ein Geschwindigkeitssprung ist eine
   * unendliche Beschleunigung - genau das Merkmal, an dem ein Aufschlag
   * erkannt wird. Die Erkennung hat also brav den Anfang des Ausholens
   * gefunden, weil dort das schaerfere Ereignis lag als beim Aufschlag.
   *
   * In echter Bewegung gibt es solche Spruenge nicht. Der Pruefstand darf
   * sie deshalb auch nicht haben - sonst prueft er etwas, das nie vorkommt.
   */
  if (d < -TIPP_FALL) {
    const u = (d + TIPP_FALL + 0.14) / 0.14;
    return 0.35 * Math.sin(u * Math.PI) ** 2;
  }
  // Fallen: beschleunigt, unten bei -1.
  if (d < 0) {
    const u = d / TIPP_FALL + 1;
    return -(u * u);
  }
  // Zurueck: geradlinig. Der Knick bei d = 0 ist der Aufschlag.
  return -(1 - d / TIPP_RUECK);
}

function haltung(t, mitZittern) {
  const schlag = t / SCHLAG;
  const nachEinzug = Math.max(0, schlag - 4);
  // Erst nach dem Einzaehltakt geht der Groove los, und er faehrt hoch.
  const staerke = Math.min(1, nachEinzug / 4);

  // Gewichtsverlagerung ueber acht Schlaege, Absacken mit doppeltem Tempo.
  const phase = (2 * Math.PI * nachEinzug) / SOLL.wiegeSchlaege;
  const wiegen = Math.sin(phase) * staerke;
  const senken = Math.cos(2 * phase) * 0.5 * staerke;

  // Die vier Tipper mit der rechten Hand. `runter` ist +1 im Aufschlag.
  let tip = 0;
  for (let k = 0; k < SOLL.tipper; k++) tip += tipper(t, SOLL.ersterTipper + k * SCHLAG);
  const runter = -tip;
  // Nach dem Einzaehltakt wandert die rechte Hand aufs Pult.
  const einzugAus = Math.min(1, Math.max(0, (schlag - 4) / 2));

  const r = mitZittern ? () => (Math.random() - 0.5) * 1.4 : () => 0;

  return {
    // Wurzel: seitlich mitgehen, senkrecht absacken.
    wurzel: [wiegen * 3.2 + r() * 0.3, 92 + senken * 4.5 + r() * 0.3, r() * 0.3],
    // Die Schulterlinie kippt zur belasteten Seite, der Rumpf dreht leicht.
    rumpfZ: -wiegen * 3.5 + r(),
    rumpfY: wiegen * 4 + r(),
    // Der Kopf laeuft nach.
    kopfZ: -wiegen * 2.5 + r(),
    kopfX: senken * 4 + r(),
    // Arme: beide liegen auf dem Pult, die rechte tippt im Einzaehltakt.
    // Der Wert ist der Winkel des Oberarms aus der T-Pose nach unten.
    armL: -62 + wiegen * 5 + r(),
    /*
     * Der Tipparm braucht Platz nach unten, sonst gibt es keinen Tipper.
     *
     * Zwei Fehler steckten hier hintereinander, und beide waren erst an den
     * Zahlen zu sehen:
     *
     * 1. Das Vorzeichen. `tipper` liefert beim Aufschlag -1, und *dann* muss
     *    der Arm am weitesten unten stehen. Mit `+ tip * 26` lag der tiefste
     *    Punkt beim Ausholen - 0,27 s zu frueh.
     *
     * 2. Der Spielraum. In der Pultstellung steht der Arm mit 62 + 48 Grad
     *    schon fast senkrecht: Die Summe aus Oberarm- und Ellenbogenwinkel
     *    ist 110 Grad, und tiefer als 90 Grad kommt eine Hand nicht. Von den
     *    gewuenschten zehn Zentimetern blieben gemessen 2,5. Die Rechnung
     *    dazu ist einfach - die Handhoehe ist -28*sin(a) - 26*sin(a+e), und
     *    die hat ihr Minimum bei a+e = 90.
     *
     * Also faengt der Tipparm im Einzaehltakt hoeher an (35 + 25 Grad) und
     * geht beim Aufschlag auf die 90 Grad hinunter. Danach blendet er in die
     * Pultstellung. Gemessen sind es damit gut zwoelf Zentimeter.
     */
    armR: 35 + 27 * einzugAus + runter * 27 * (1 - einzugAus) - wiegen * 5 + r(),
    ellL: -48 - senken * 6 + r(),
    ellR: 25 + 23 * einzugAus + runter * 3 * (1 - einzugAus) + senken * 6 + r(),
    /*
     * Und die Arme greifen nach vorn.
     *
     * Ohne das lag die ganze Bewegung in der Bildebene, und die Abnahme fuer
     * die Verkuerzung meldete 0,1 Prozent - zu Recht: Es gab keine Tiefe zu
     * pruefen. Ein Mensch am Pult streckt die Arme aber nach vorn, und beim
     * Ausholen kommt die Hand zusaetzlich zum Koerper. Genau daraus entsteht
     * die Verkuerzung, um die es geht.
     */
    vornL: 34 + wiegen * 10 + r(),
    vornR: 34 - wiegen * 10 + r(),
  };
}

export function taenzerBauen({ zittern = false, takte = TAKTE } = {}) {
  const knoten = BAUM.map(([name, eltern, offset, spitze]) => ({ name, eltern, offset, spitze }));
  const beweglich = knoten.filter((k) => !k.spitze);

  const bilder = [];
  const dauer = takte * 4 * SCHLAG;
  const anzahl = Math.round(dauer * BILDRATE);
  for (let b = 0; b < anzahl; b++) {
    const t = b / BILDRATE;
    const h = haltung(t, zittern);
    const zeile = [];
    for (const k of beweglich) {
      if (k.name === 'Hips') zeile.push(...h.wurzel);
      // Reihenfolge ZXY, wie unten in CHANNELS angekuendigt.
      if (k.name === 'Spine1') zeile.push(h.rumpfZ * 0.5, 0, h.rumpfY * 0.5);
      else if (k.name === 'Spine2') zeile.push(h.rumpfZ * 0.5, 0, h.rumpfY * 0.5);
      else if (k.name === 'Head') zeile.push(h.kopfZ, h.kopfX, 0);
      // Zrotation schwenkt in der Bildebene, Yrotation nach vorn und hinten.
      else if (k.name === 'LeftArm') zeile.push(h.armL, 0, -h.vornL);
      else if (k.name === 'LeftForeArm') zeile.push(h.ellL, 0, -h.vornL * 0.5);
      else if (k.name === 'RightArm') zeile.push(h.armR, 0, h.vornR);
      else if (k.name === 'RightForeArm') zeile.push(h.ellR, 0, h.vornR * 0.5);
      else zeile.push(0, 0, 0);
    }
    bilder.push(zeile);
  }

  // --- Als BVH ausschreiben ---
  const kinder = (name) => knoten.filter((k) => k.eltern === name);
  const zeilen = [];
  const schreibe = (k, tiefe) => {
    const ein = '  '.repeat(tiefe);
    if (k.spitze) {
      zeilen.push(`${ein}End Site`, `${ein}{`, `${ein}  OFFSET ${k.offset.join(' ')}`, `${ein}}`);
      return;
    }
    zeilen.push(`${ein}${k.eltern === null ? 'ROOT' : 'JOINT'} ${k.name}`, `${ein}{`);
    zeilen.push(`${ein}  OFFSET ${k.offset.join(' ')}`);
    zeilen.push(k.eltern === null
      ? `${ein}  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation`
      : `${ein}  CHANNELS 3 Zrotation Xrotation Yrotation`);
    for (const kind of kinder(k.name)) schreibe(kind, tiefe + 1);
    zeilen.push(`${ein}}`);
  };
  schreibe(knoten[0], 0);

  const text = ['HIERARCHY', ...zeilen, 'MOTION',
    `Frames: ${bilder.length}`,
    `Frame Time: ${(1 / BILDRATE).toFixed(7)}`,
    ...bilder.map((z) => z.map((v) => v.toFixed(4)).join(' ')),
  ].join('\n');
  return text + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ziel = process.argv[2] ?? new URL('../pruefungen/proben/prueftaenzer.bvh', import.meta.url).pathname;
  await fs.mkdir(ziel.replace(/\/[^/]+$/, ''), { recursive: true });
  const text = taenzerBauen();
  await fs.writeFile(ziel, text);
  const zitter = taenzerBauen({ zittern: true });
  await fs.writeFile(ziel.replace('.bvh', '-zittrig.bvh'), zitter);
  console.log(`${ziel} geschrieben – ${(text.length / 1024).toFixed(0)} kB, ` +
    `${TAKTE} Takte bei ${BPM} BPM, ${SOLL.tipper} Tipper ab ${SOLL.ersterTipper} s`);
}
