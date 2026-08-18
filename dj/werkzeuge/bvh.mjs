// BVH lesen und in Weltkoordinaten rechnen.
//
// BVH ist das Format, in dem Bewegungserfassung seit dreissig Jahren
// weitergegeben wird, und es ist aus einem guten Grund das richtige hier: Es
// ist Text, es beschreibt sich selbst, und es braucht keine Bibliothek. Eine
// FBX-Datei koennte dasselbe, waere aber binaer und ohne fremden Code nicht zu
// oeffnen - in einem Projekt, das ohne Abhaengigkeiten auskommt, ist das der
// Unterschied zwischen "laeuft" und "laeuft, solange jemand die Bibliothek
// pflegt".
//
// Eine Datei hat zwei Teile:
//
//   HIERARCHY  der Knochenbaum. Je Gelenk ein OFFSET (wo es relativ zu seinem
//              Elternteil sitzt, in Ruhe) und CHANNELS (welche Zahlen je Bild
//              dafuer in der Bewegungstabelle stehen, und in welcher
//              Reihenfolge).
//   MOTION     eine Zahl je Kanal je Bild, alle Gelenke in einer Zeile.
//
// Der Reihenfolge der Drehkanaele muss man dabei folgen und darf sie nicht
// annehmen: Fast alle Werkzeuge schreiben ZXY oder ZYX, manche XYZ, und wer
// die falsche Reihenfolge multipliziert, bekommt Arme, die sich verdrehen -
// genau der Fehler, den dieses ganze Vorhaben beseitigen soll.

/**
 * Eine BVH-Datei zerlegen.
 *
 * @param {string} text
 * @returns {{gelenke: Array, bilder: Float64Array[], bildDauer: number}}
 *   `gelenke` in Tiefensuchreihenfolge, jedes mit `name`, `offset`,
 *   `kanaele` (Namen in Dateireihenfolge), `ersterKanal` (Spalte in der
 *   Bewegungszeile) und `eltern` (Index, -1 fuer die Wurzel).
 */
export function bvhLesen(text) {
  const wort = text.replace(/\r/g, '').split(/\s+/).filter((w) => w.length);
  let i = 0;
  const naechstes = () => wort[i++];
  const erwarte = (was) => {
    const w = naechstes();
    if (w !== was) throw new Error(`BVH: "${was}" erwartet, "${w}" gefunden (Wort ${i})`);
  };

  if (naechstes() !== 'HIERARCHY') throw new Error('BVH: kein HIERARCHY am Anfang');

  const gelenke = [];
  let kanalZahl = 0;

  const zweig = (eltern) => {
    const art = naechstes(); // ROOT | JOINT | End
    /*
     * "End Site" ist kein Gelenk, sondern die Spitze eines Knochens - eine
     * Fingerkuppe, ein Scheitel. Es hat einen Offset, aber keine Kanaele, und
     * es taucht in der Bewegungstabelle nie auf. Trotzdem wird es gebraucht:
     * Ohne die Spitze weiss niemand, wie lang der letzte Knochen ist.
     */
    if (art === 'End') {
      naechstes(); // "Site"
      erwarte('{');
      erwarte('OFFSET');
      const offset = [Number(naechstes()), Number(naechstes()), Number(naechstes())];
      erwarte('}');
      gelenke.push({ name: `${gelenke[eltern].name}_Spitze`, offset, kanaele: [], ersterKanal: -1, eltern, spitze: true });
      return;
    }
    const name = naechstes();
    erwarte('{');
    erwarte('OFFSET');
    const offset = [Number(naechstes()), Number(naechstes()), Number(naechstes())];
    erwarte('CHANNELS');
    const anzahl = Number(naechstes());
    const kanaele = [];
    for (let k = 0; k < anzahl; k++) kanaele.push(naechstes());
    const eigen = gelenke.length;
    gelenke.push({ name, offset, kanaele, ersterKanal: kanalZahl, eltern, spitze: false });
    kanalZahl += anzahl;
    for (;;) {
      const w = wort[i];
      if (w === '}') { i++; return; }
      if (w === 'JOINT' || w === 'End') { zweig(eigen); continue; }
      throw new Error(`BVH: unerwartet "${w}" in ${name}`);
    }
  };

  if (wort[i] !== 'ROOT') throw new Error('BVH: kein ROOT');
  zweig(-1);

  erwarte('MOTION');
  erwarte('Frames:');
  const anzahlBilder = Number(naechstes());
  erwarte('Frame');
  erwarte('Time:');
  const bildDauer = Number(naechstes());

  const bilder = [];
  for (let b = 0; b < anzahlBilder; b++) {
    const zeile = new Float64Array(kanalZahl);
    for (let k = 0; k < kanalZahl; k++) zeile[k] = Number(wort[i++]);
    bilder.push(zeile);
  }
  return { gelenke, bilder, bildDauer };
}

/* --- Drehungen -------------------------------------------------------------
 *
 * Gerechnet wird mit 3x3-Matrizen und nicht mit Quaternionen. Der Grund ist
 * die Reihenfolge: BVH gibt die Drehungen als drei einzelne Achsdrehungen an,
 * und ihre Reihenfolge steht in der Datei. Matrizen in genau dieser
 * Reihenfolge zu multiplizieren ist die woertliche Umsetzung dessen, was
 * dasteht. Quaternionen waeren schneller, aber hier wird einmal beim Bauen
 * gerechnet und nie im Betrieb.
 */

const EINHEIT = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function mal(a, b) {
  const c = new Array(9);
  for (let z = 0; z < 3; z++) {
    for (let s = 0; s < 3; s++) {
      c[z * 3 + s] = a[z * 3] * b[s] + a[z * 3 + 1] * b[3 + s] + a[z * 3 + 2] * b[6 + s];
    }
  }
  return c;
}

function achse(name, grad) {
  const w = (grad * Math.PI) / 180;
  const c = Math.cos(w);
  const s = Math.sin(w);
  if (name === 'Xrotation') return [1, 0, 0, 0, c, -s, 0, s, c];
  if (name === 'Yrotation') return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/**
 * Alle Gelenke eines Bildes in Weltkoordinaten.
 *
 * @param {{gelenke: Array}} skelett
 * @param {Float64Array} bild  eine Zeile der Bewegungstabelle
 * @returns {Array<{name: string, p: number[], m: number[]}>}
 *   je Gelenk die Weltposition und die Weltdrehung.
 */
export function vorwaerts(skelett, bild) {
  const aus = [];
  for (let g = 0; g < skelett.gelenke.length; g++) {
    const gelenk = skelett.gelenke[g];
    const eltern = gelenk.eltern >= 0 ? aus[gelenk.eltern] : { p: [0, 0, 0], m: EINHEIT };

    // Verschiebung: der Ruhe-Offset, gedreht mit dem Elternteil.
    let [vx, vy, vz] = gelenk.offset;
    /*
     * Wandernde Kanaele werden auf den Offset addiert, nicht ersetzt.
     *
     * Bei der Wurzel traegt die Bewegungstabelle die Position; bei allen
     * anderen Gelenken traegt sie sie normalerweise nicht. Manche Werkzeuge
     * schreiben aber auch dort Verschiebungen hinein - wer die uebersieht,
     * bekommt ein Skelett, dessen Knochen im falschen Moment die falsche
     * Laenge haben.
     */
    let drehung = EINHEIT;
    for (let k = 0; k < gelenk.kanaele.length; k++) {
      const name = gelenk.kanaele[k];
      const wert = bild[gelenk.ersterKanal + k];
      if (name === 'Xposition') vx += wert;
      else if (name === 'Yposition') vy += wert;
      else if (name === 'Zposition') vz += wert;
      else drehung = mal(drehung, achse(name, wert));
    }

    const m = eltern.m;
    const p = [
      eltern.p[0] + m[0] * vx + m[1] * vy + m[2] * vz,
      eltern.p[1] + m[3] * vx + m[4] * vy + m[5] * vz,
      eltern.p[2] + m[6] * vx + m[7] * vy + m[8] * vz,
    ];
    aus.push({ name: gelenk.name, p, m: mal(m, drehung) });
  }
  return aus;
}

/* --- Gelenknamen -----------------------------------------------------------
 *
 * Jedes Werkzeug benennt seine Knochen anders. Mixamo schreibt
 * "mixamorig:LeftArm" fuer den *Oberarm*, DeepMotion und Rokoko haben eigene
 * Sammlungen, und "LeftArm" heisst je nach Herkunft Oberarm oder ganzer Arm.
 * Deshalb steht hier eine Liste von Kandidaten je gesuchtem Gelenk, und
 * gesucht wird in dieser Reihenfolge.
 *
 * Wichtig ist die Reihenfolge innerhalb einer Zeile: Der erste Treffer
 * gewinnt. "LeftForeArm" muss vor "LeftArm" stehen, sonst faengt die
 * Teilzeichenkette den Unterarm weg.
 */
export const GESUCHT = {
  huefte: ['hips', 'pelvis', 'root', 'hip'],
  brust: ['spine2', 'spine1', 'chest', 'upperchest', 'spine'],
  hals: ['neck'],
  kopf: ['head'],
  schulterL: ['leftarm', 'leftupperarm', 'lupperarm', 'l_upperarm', 'leftshoulder'],
  ellbogenL: ['leftforearm', 'leftlowerarm', 'llowerarm', 'l_lowerarm', 'leftelbow'],
  handL: ['lefthand', 'lhand', 'l_hand', 'leftwrist'],
  schulterR: ['rightarm', 'rightupperarm', 'rupperarm', 'r_upperarm', 'rightshoulder'],
  ellbogenR: ['rightforearm', 'rightlowerarm', 'rlowerarm', 'r_lowerarm', 'rightelbow'],
  handR: ['righthand', 'rhand', 'r_hand', 'rightwrist'],
};

/**
 * Die gesuchten Gelenke im Skelett finden.
 *
 * @returns {Object<string, number>} Name -> Index, fehlende fehlen auch hier.
 */
export function gelenkeZuordnen(skelett) {
  const sauber = skelett.gelenke.map((g) => g.name.toLowerCase().replace(/^.*:/, '').replace(/[_\s-]/g, ''));
  const zu = {};
  for (const [wunsch, kandidaten] of Object.entries(GESUCHT)) {
    for (const k of kandidaten) {
      const ziel = k.replace(/[_\s-]/g, '');
      // Erst genau, dann als Teilzeichenkette. Ein genauer Treffer ist immer
      // der bessere: "leftarm" steckt auch in "leftarmroll".
      let treffer = sauber.findIndex((n, idx) => n === ziel && !skelett.gelenke[idx].spitze);
      if (treffer < 0) treffer = sauber.findIndex((n, idx) => n.includes(ziel) && !skelett.gelenke[idx].spitze);
      if (treffer >= 0) { zu[wunsch] = treffer; break; }
    }
  }
  return zu;
}
