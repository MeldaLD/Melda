// Aus einer Bewegungsaufnahme wird eine Schleife, die am Schlag haengt.
//
// Der Weg von der BVH-Datei zur Figur auf der Leinwand, in fuenf Schritten.
// Jeder einzelne ist fuer sich pruefbar, und genau darum sind es fuenf und
// nicht einer.
//
//   1. Tipper finden      Wo sitzt der Einzaehltakt in der Aufnahme?
//   2. Raster stellen     Daraus Schlag 0 und die Schlagdauer.
//   3. Ausrichten         Kameraschraeglage herausrechnen.
//   4. Umrechnen          Gelenkstellungen -> Knochenrichtungen.
//   5. Schleife waehlen   Das Stueck mit der besten Naht.
//
// --- Warum Knochen*richtungen* und nicht Gelenk*stellungen* ----------------
//
// Die aufgenommene Person hat andere Proportionen als die gezeichnete Figur.
// Speichert man Stellungen, muss man sie umrechnen, und jede Ungenauigkeit
// dabei zieht einen Knochen laenger oder kuerzer - genau die Verformung, die
// bisher wie ein Bruch aussah.
//
// Speichert man dagegen nur die *Richtung* jedes Knochens und nimmt die
// Laengen aus der Zeichnung, kann das gar nicht passieren. Das Skelett auf
// der Leinwand ist dann immer in sich stimmig, egal wie unterschiedlich die
// beiden Koerper gebaut sind.
//
// Und es kostet fast nichts: sechs Knochen mal drei Zahlen, als Ganzzahl je
// ein Byte - achtzehn Byte je Bild statt sechzig.
//
// --- Warum drei Zahlen und nicht zwei -------------------------------------
//
// Weil die dritte die Tiefe ist. Ein Arm, der zur Kamera zeigt, ist im Bild
// *kuerzer* - er verschwindet nicht und er bricht nicht, er verkuerzt sich.
// Genau das leistet die z-Komponente: Die Laenge im Bild ist die Wurzel aus
// x²+y², und die ist von selbst kleiner, wenn z gross ist. Damit ist die
// Verkuerzung geschenkt, statt ein eigenes Problem zu sein.

import { bvhLesen, vorwaerts, gelenkeZuordnen } from './bvh.mjs';

/** Wie viele Abtastpunkte je Schlag gespeichert werden. */
export const PROBEN_JE_SCHLAG = 16;
/** Wie lang eine Schleife ist, in Schlaegen. Acht sind zwei Takte. */
export const SCHLEIFE_SCHLAEGE = 8;

/*
 * Die sechs Knochen, aus denen die Figur besteht.
 *
 * Mehr braucht der Schattenriss nicht: Die Beine stehen hinter dem Pult, und
 * Finger sind auf zehn Meter nicht zu sehen. Jeder weitere Knochen waere
 * Speicher fuer etwas, das niemand sieht.
 */
export const KNOCHEN = [
  ['rumpf', 'huefte', 'hals'],
  ['kopf', 'hals', 'kopf'],
  ['oberarmL', 'schulterL', 'ellbogenL'],
  ['unterarmL', 'ellbogenL', 'handL'],
  ['oberarmR', 'schulterR', 'ellbogenR'],
  ['unterarmR', 'ellbogenR', 'handR'],
];

const klemm = (x, a, b) => (x < a ? a : x > b ? b : x);

/* --- 1. und 2. Die Tipper und das Raster ---------------------------------- */

/**
 * Die vier Einzaehl-Tipper in einer Aufnahme finden.
 *
 * Gesucht wird *nicht* nach tiefen Handstellungen. Eine Hand ist beim
 * Groove staendig unten, und der tiefste Punkt eines Tippers unterscheidet
 * sich davon nicht. Was einen Aufschlag ausmacht, ist der *Knick*: Die Hand
 * faellt beschleunigt und wird schlagartig gestoppt. Das ist eine grosse
 * Beschleunigung nach oben, und die gibt es sonst nirgends.
 *
 * Gefunden wird die Reihe als Ganzes, ueber einen Kamm mit vier Zinken.
 * Einzelne Spitzen zu suchen und danach die passenden vier auszuwaehlen
 * waere der Umweg: Vier gleichmaessige Abstaende sind ein viel staerkeres
 * Merkmal als jede einzelne Spitze.
 *
 * @param {Array<Array<number>>} handL  Weltposition der linken Hand je Bild
 * @param {Array<Array<number>>} handR  dasselbe rechts
 * @param {number} bildDauer            Sekunden je Bild
 * @param {number} [erwartet]           erwartete Schlagdauer in Sekunden
 * @returns {{zeit: number, schlagDauer: number, hand: string, guete: number}}
 */
export function tipperFinden(handL, handR, bildDauer, erwartet = null) {
  const anzahl = Math.min(handL.length, handR.length);
  // Nur der Anfang: Der Einzaehltakt liegt vorn, und weiter hinten faenden
  // wir Tanzbewegungen, die genauso aussehen.
  const bis = Math.min(anzahl, Math.round(6 / bildDauer));

  /*
   * Die Stuetzweite der zweiten Ableitung, in *Sekunden* und nicht in
   * Bildern: 45 ms. Damit rechnet dieselbe Zeile bei 30 wie bei 60 Bildern je
   * Sekunde dasselbe, und die Erkennung haengt nicht daran, mit welcher
   * Bildrate jemand gefilmt hat.
   *
   * Die Weite ist zugleich der Tiefpass. Eine zweite Ableitung verstaerkt
   * Rauschen quadratisch - ueber ein Bild gerechnet wird aus einem Zittern
   * von einem Zentimeter eine Beschleunigung von 36 m/s². Ueber 45 ms
   * gerechnet bleibt ein Neuntel davon, und ein Aufschlag dauert ohnehin
   * laenger als ein Bild.
   */
  const stuetze = Math.max(1, Math.round(0.045 / bildDauer));

  const stoss = (hand) => {
    const y = new Float64Array(bis);
    for (let i = 0; i < bis; i++) {
      const a = hand[Math.max(0, i - 1)][1];
      const b = hand[i][1];
      const c = hand[Math.min(bis - 1, i + 1)][1];
      y[i] = (a + 2 * b + c) / 4;
    }
    const h = stuetze * bildDauer;
    // Geschwindigkeit ueber dieselbe Stuetzweite.
    const v = new Float64Array(bis);
    for (let i = stuetze; i < bis - stuetze; i++) v[i] = (y[i + stuetze] - y[i - stuetze]) / (2 * h);

    /*
     * Beschleunigung nach oben - aber nur, wenn sie einen *Fall* beendet.
     *
     * Das ist der Unterschied zwischen einem Aufschlag und einem Ausholen,
     * und ohne ihn ist die Erkennung nicht zu retten. Beides sind starke
     * Beschleunigungen nach oben:
     *
     *   Ausholen:  die Hand steht, dann geht sie hoch.   Davor v = 0.
     *   Aufschlag: die Hand faellt, dann steht sie.      Davor v < 0.
     *
     * Ohne diese Unterscheidung hat die Erkennung am Pruefstand hartnaeckig
     * den Beginn des Ausholens gefunden - 336 ms zu frueh, und mit voellig
     * richtigem Tempo, weil beide Ereignisse ja im selben Abstand
     * wiederkehren. Ein Fehler, den kein Tempotest je gefunden haette.
     *
     * Multipliziert und nicht als Schalter: Ein Schalter waere eine weitere
     * Schwelle, die man richtig treffen muss. So zaehlt ein Ereignis umso
     * mehr, je schneller die Hand vorher gefallen ist - und das ist genau
     * die Rangfolge, die man haben will.
     */
    const a = new Float64Array(bis);
    for (let i = stuetze; i < bis - stuetze; i++) {
      const hoch = Math.max(0, (y[i - stuetze] - 2 * y[i] + y[i + stuetze]) / (h * h));
      const fiel = Math.max(0, -v[Math.max(stuetze, i - stuetze)]);
      a[i] = hoch * fiel;
    }
    return a;
  };

  const kandidaten = [{ name: 'rechts', a: stoss(handR) }, { name: 'links', a: stoss(handL) }];
  const vonP = erwartet ? erwartet * 0.8 : 0.30;
  const bisP = erwartet ? erwartet * 1.25 : 0.80;

  let beste = { guete: -1 };
  for (const k of kandidaten) {
    for (let p = vonP; p <= bisP; p += bildDauer / 2) {
      const schritte = p / bildDauer;
      // Der letzte Zinken muss noch im Fenster liegen.
      for (let s = 0; s + 3 * schritte < bis - 1; s++) {
        let summe = 0;
        for (let n = 0; n < 4; n++) {
          const i = Math.round(s + n * schritte);
          // Ein Fenster von einem Bild nach beiden Seiten: Bei 60 Bildern je
          // Sekunde liegt ein Aufschlag nie genau auf einem Bild.
          summe += Math.max(k.a[i - 1] ?? 0, k.a[i] ?? 0, k.a[i + 1] ?? 0);
        }
        if (summe > beste.guete) {
          beste = { guete: summe, zeit: s * bildDauer, schlagDauer: p, hand: k.name, a: k.a };
        }
      }
    }
  }
  if (beste.guete < 0) return beste;

  /*
   * Nachmessen statt weitersuchen.
   *
   * Der Kamm oben rastert die Schlagdauer in halben Bildern - bei 60 Bildern
   * je Sekunde sind das 8,3 ms, und 8,3 ms auf einen halben Schlag sind gut
   * zwei BPM. Damit koennte diese Suche das Tempo gar nicht genauer angeben,
   * egal wie sauber die Daten sind.
   *
   * Also wird der grobe Treffer nur als Ausgangspunkt genommen: An jedem der
   * vier vorhergesagten Orte wird die tatsaechliche Spitze gesucht, und durch
   * die vier Spitzen wird eine Gerade gelegt. Ihre Steigung ist die
   * Schlagdauer, ihr Achsenabschnitt der erste Tipper. Vier Messpunkte statt
   * eines Rasterpunkts - und die Gerade mittelt das Rauschen gleich mit weg.
   *
   * Die Spitze selbst wird noch zwischen den Bildern verfeinert, ueber eine
   * Parabel durch die drei Werte um das Hoechste. Ein Aufschlag faellt nie
   * genau auf ein Bild.
   */
  const schritte = beste.schlagDauer / bildDauer;
  const stellen = [];
  for (let n = 0; n < 4; n++) {
    const mitte = Math.round(beste.zeit / bildDauer + n * schritte);
    const rand = Math.max(2, Math.round(schritte * 0.25));
    let bestesI = mitte;
    let bestesA = -Infinity;
    for (let i = Math.max(1, mitte - rand); i <= Math.min(bis - 2, mitte + rand); i++) {
      if (beste.a[i] > bestesA) { bestesA = beste.a[i]; bestesI = i; }
    }
    const l = beste.a[bestesI - 1] ?? 0;
    const m = beste.a[bestesI];
    const r = beste.a[bestesI + 1] ?? 0;
    const nenner = l - 2 * m + r;
    const versatz = Math.abs(nenner) > 1e-12 ? klemm((0.5 * (l - r)) / nenner, -1, 1) : 0;
    stellen.push((bestesI + versatz) * bildDauer);
  }
  // Ausgleichsgerade durch (n, zeit_n).
  let sn = 0;
  let st = 0;
  let snn = 0;
  let snt = 0;
  for (let n = 0; n < 4; n++) { sn += n; st += stellen[n]; snn += n * n; snt += n * stellen[n]; }
  const steigung = (4 * snt - sn * st) / (4 * snn - sn * sn);
  const abschnitt = (st - steigung * sn) / 4;
  return {
    guete: beste.guete,
    hand: beste.hand,
    zeit: abschnitt,
    schlagDauer: steigung,
    // Wie gut die vier Tipper auf einer Geraden liegen. Ein grosser Wert
    // heisst: Es waren keine vier gleichmaessigen Tipper, sondern etwas
    // anderes - und dann stimmt das ganze Raster nicht.
    streuung: Math.max(...stellen.map((t, n) => Math.abs(t - (abschnitt + steigung * n)))),
    stellen,
  };
}

/* --- 3. Ausrichten -------------------------------------------------------- */

/**
 * Die Schraeglage der Kamera herausrechnen.
 *
 * Steht die Kamera nicht genau frontal, ist die ganze Aufnahme um die
 * senkrechte Achse gedreht - und die Figur zeigte auf der Leinwand dauerhaft
 * ein bisschen zur Seite. Herausgerechnet wird die *mittlere* Drehung ueber
 * den ganzen Clip, nicht die jedes einzelnen Bildes: Was sich zwischendurch
 * dreht, ist Bewegung und soll bleiben.
 *
 * @returns {number} Winkel in Bogenmass, um den zurueckzudrehen ist.
 */
export function schraeglage(schulterL, schulterR) {
  let sx = 0;
  let sz = 0;
  for (let i = 0; i < schulterL.length; i++) {
    sx += schulterL[i][0] - schulterR[i][0];
    sz += schulterL[i][2] - schulterR[i][2];
  }
  // Die Schulterlinie soll waagerecht im Bild liegen, also entlang x.
  return Math.atan2(sz, sx);
}

/** Um die senkrechte Achse drehen. */
export function drehen(p, winkel) {
  const c = Math.cos(winkel);
  const s = Math.sin(winkel);
  return [p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c];
}

/* --- 4. Umrechnen --------------------------------------------------------- */

/**
 * Eine Aufnahme in Knochenrichtungen und eine Wurzelspur umrechnen.
 *
 * @param {object} skelett   aus bvhLesen
 * @param {object} zu        aus gelenkeZuordnen
 * @param {object} [wahl]
 * @returns {{richtungen: Object<string, number[][]>, wurzel: number[][],
 *            groesse: number, spiegeln: boolean}}
 */
export function umrechnen(skelett, zu, { spiegeln = null } = {}) {
  const fehlend = KNOCHEN.flatMap(([, a, b]) => [a, b]).filter((g) => zu[g] === undefined);
  if (fehlend.length) throw new Error(`Gelenke fehlen im Skelett: ${[...new Set(fehlend)].join(', ')}`);

  const stellen = skelett.bilder.map((b) => vorwaerts(skelett, b));
  const holen = (name) => stellen.map((w) => w[zu[name]].p);

  const winkel = -schraeglage(holen('schulterL'), holen('schulterR'));
  const ausgerichtet = {};
  for (const g of Object.keys(zu)) ausgerichtet[g] = holen(g).map((p) => drehen(p, winkel));

  /*
   * Sieht man die Person von vorn oder von hinten?
   *
   * Nach dem Ausrichten liegt die Schulterlinie entlang x - aber ob die
   * *linke* Schulter dabei bei +x oder bei -x sitzt, haengt daran, in welche
   * Richtung die Person schaut. Auf der Leinwand steht sie frontal, also muss
   * ihre linke Schulter im Bild *rechts* erscheinen.
   *
   * Bestimmt wird das aus den Daten und nicht angenommen: Der Mittelwert
   * ueber den ganzen Clip sagt eindeutig, auf welcher Seite die linke
   * Schulter liegt.
   */
  let seiten = 0;
  for (let i = 0; i < stellen.length; i++) seiten += ausgerichtet.schulterL[i][0] - ausgerichtet.schulterR[i][0];
  const mussSpiegeln = spiegeln === null ? seiten < 0 : spiegeln;

  /*
   * Der Massstab: die Rumpflaenge, gemittelt.
   *
   * Alles wird darauf bezogen, damit eine 1,60-m-Person dieselbe Bewegung
   * ergibt wie eine 1,90-m-Person. Die Rumpflaenge und nicht die
   * Koerpergroesse, weil die Beine hinter dem Pult stehen und in der
   * Zeichnung gar nicht vorkommen.
   */
  let groesse = 0;
  for (let i = 0; i < stellen.length; i++) {
    groesse += Math.hypot(...ausgerichtet.hals[i].map((v, k) => v - ausgerichtet.huefte[i][k]));
  }
  groesse /= stellen.length;

  const richtungen = {};
  for (const [name, von, nach] of KNOCHEN) {
    richtungen[name] = ausgerichtet[nach].map((p, i) => {
      const q = ausgerichtet[von][i];
      let dx = p[0] - q[0];
      const dy = p[1] - q[1];
      let dz = p[2] - q[2];
      if (mussSpiegeln) { dx = -dx; dz = -dz; }
      const l = Math.hypot(dx, dy, dz) || 1;
      /*
       * y wird umgedreht: In der Bewegungsaufnahme zeigt y nach oben, auf
       * einer Leinwand nach unten. Wer das vergisst, bekommt eine Figur, die
       * kopfsteht - und merkt es erst am Bild.
       */
      return [dx / l, -dy / l, dz / l];
    });
  }

  // Die Wurzel: Huefte, auf die Rumpflaenge bezogen, um ihren Mittelwert.
  const roh = ausgerichtet.huefte.map((p) => [(mussSpiegeln ? -p[0] : p[0]) / groesse, -p[1] / groesse]);
  let mx = 0;
  let my = 0;
  for (const p of roh) { mx += p[0]; my += p[1]; }
  mx /= roh.length;
  my /= roh.length;
  const wurzel = roh.map((p) => [p[0] - mx, p[1] - my]);

  return { richtungen, wurzel, groesse, spiegeln: mussSpiegeln };
}

/**
 * Die Knochenrichtungen glaetten.
 *
 * Das ist die Glaettung, die DeepMotion ausdruecklich *nicht* machen soll.
 * Der Grund fuer die Arbeitsteilung: Der Dienst glaettet, bevor irgendwer
 * weiss, worauf es ankommt, und laut seiner eigenen Beschreibung kostet das
 * Genauigkeit auf Bildebene - also genau das, woran haengt, ob eine Bewegung
 * auf dem Schlag sitzt. Hier weiss man mehr: Was geglaettet werden soll, ist
 * das Zittern des Loesers, und das liegt oberhalb von etwa 20 Hz. Ein
 * Aufschlag dauert laenger.
 *
 * Die Weite ist deshalb in *Sekunden* angegeben und nicht in Bildern. Bei 40
 * ms bleibt alles stehen, was langsamer als 25 Hz ist - und ein Sechzehntel
 * bei 124 Schlaegen dauert 121 ms, also dreimal so lang.
 *
 * Geglaettet wird mit einem Binomialkern: Er hat keine Ueberschwinger, und
 * ein Ueberschwinger an einem Aufschlag saehe aus wie ein Rueckstoss, den es
 * nie gab.
 */
export function glaetten(spur, sekunden, weiteSekunden = 0.04) {
  const halb = Math.max(0, Math.round(weiteSekunden / sekunden));
  if (!halb) return spur;
  // Binomialgewichte ueber 2*halb+1 Stellen.
  const gewicht = [1];
  for (let n = 0; n < 2 * halb; n++) {
    const neu = [1];
    for (let i = 0; i < gewicht.length - 1; i++) neu.push(gewicht[i] + gewicht[i + 1]);
    neu.push(1);
    gewicht.length = 0;
    gewicht.push(...neu);
  }
  const summe = gewicht.reduce((a, b) => a + b, 0);

  for (const [name] of KNOCHEN) {
    const roh = spur.richtungen[name];
    const neu = roh.map((_, i) => {
      const v = [0, 0, 0];
      for (let k = -halb; k <= halb; k++) {
        const q = roh[klemm(i + k, 0, roh.length - 1)];
        const g = gewicht[k + halb] / summe;
        v[0] += q[0] * g; v[1] += q[1] * g; v[2] += q[2] * g;
      }
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / l, v[1] / l, v[2] / l];
    });
    spur.richtungen[name] = neu;
  }
  const rohW = spur.wurzel;
  spur.wurzel = rohW.map((_, i) => {
    const v = [0, 0];
    for (let k = -halb; k <= halb; k++) {
      const q = rohW[klemm(i + k, 0, rohW.length - 1)];
      const g = gewicht[k + halb] / summe;
      v[0] += q[0] * g; v[1] += q[1] * g;
    }
    return v;
  });
  return spur;
}

/* --- Abtasten und Schleife ------------------------------------------------ */

/** Zwischen zwei Bildern linear ablesen. */
function ablesen(reihe, wo) {
  const i = Math.floor(wo);
  const f = wo - i;
  const a = reihe[klemm(i, 0, reihe.length - 1)];
  const b = reihe[klemm(i + 1, 0, reihe.length - 1)];
  return a.map((v, k) => v + (b[k] - v) * f);
}

/**
 * Auf das Schlagraster abtasten.
 *
 * Ab hier zaehlt die Aufnahme nicht mehr in Sekunden. Das ist der ganze
 * Zweck: Auf der Buehne wird spaeter an einer *Schlagnummer* abgelesen, und
 * die kommt aus der Analyse des laufenden Stuecks. Ein Tempowechsel dehnt
 * die Schleife dann von selbst mit.
 *
 * @param {object} spur       aus umrechnen
 * @param {number} nullBild   Bild, auf dem Schlag 0 liegt (darf gebrochen sein)
 * @param {number} schrittBilder  wie viele Bilder ein Schlag dauert
 * @param {number} schlaege   wie viele Schlaege abgetastet werden
 */
export function abtasten(spur, nullBild, schrittBilder, schlaege) {
  const anzahl = Math.round(schlaege * PROBEN_JE_SCHLAG);
  const richtungen = {};
  for (const [name] of KNOCHEN) {
    richtungen[name] = [];
    for (let n = 0; n < anzahl; n++) {
      const wo = nullBild + (n / PROBEN_JE_SCHLAG) * schrittBilder;
      const v = ablesen(spur.richtungen[name], wo);
      // Nach dem Zwischenablesen ist die Richtung nicht mehr genau eins lang.
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      richtungen[name].push([v[0] / l, v[1] / l, v[2] / l]);
    }
  }
  const wurzel = [];
  for (let n = 0; n < anzahl; n++) {
    wurzel.push(ablesen(spur.wurzel, nullBild + (n / PROBEN_JE_SCHLAG) * schrittBilder));
  }
  return { richtungen, wurzel };
}

/**
 * Wie schlecht passt das Ende einer Schleife an ihren Anfang?
 *
 * In Grad, ueber alle Knochen der schlimmste. Eine Naht, die man sieht, ist
 * das haesslichste an einer Schleife - und die einzige Stelle, an der man
 * ihr ansieht, dass sie eine ist.
 */
export function nahtFehler(stueck) {
  let schlimmster = 0;
  for (const [name] of KNOCHEN) {
    const r = stueck.richtungen[name];
    const a = r[r.length - 1];
    const b = r[0];
    const skalar = klemm(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
    schlimmster = Math.max(schlimmster, (Math.acos(skalar) * 180) / Math.PI);
  }
  return schlimmster;
}

/**
 * Die Schleife mit der besten Naht waehlen.
 *
 * Probiert werden alle Anfaenge auf *ganzen Schlaegen* ab `abSchlag`. Nur
 * ganze Schlaege, denn eine Schleife, die mitten im Schlag anfaengt, sitzt
 * auf der Buehne dauerhaft schief - und das faellt mehr auf als eine etwas
 * schlechtere Naht.
 */
export function schleifeWaehlen(spur, nullBild, schrittBilder, {
  abSchlag = 4, bisSchlag = null, schlaege = SCHLEIFE_SCHLAEGE,
} = {}) {
  const letztes = spur.wurzel.length - 1;
  const hoechster = bisSchlag ?? Math.floor((letztes - nullBild) / schrittBilder) - schlaege;
  let beste = null;
  for (let s = abSchlag; s <= hoechster; s++) {
    const stueck = abtasten(spur, nullBild + s * schrittBilder, schrittBilder, schlaege);
    const fehler = nahtFehler(stueck);
    if (!beste || fehler < beste.fehler) beste = { abSchlag: s, fehler, stueck };
  }
  if (!beste) throw new Error('Die Aufnahme ist zu kurz fuer eine Schleife');
  return beste;
}

/**
 * Die Naht schliessen.
 *
 * Auch die beste Stelle passt nicht genau. Ueber die letzten Proben wird
 * deshalb auf den Anfang zurueckgeblendet - kurz genug, dass niemand die
 * Ueberblendung sieht, lang genug, dass kein Ruck bleibt.
 */
export function nahtSchliessen(stueck, proben = PROBEN_JE_SCHLAG) {
  const anzahl = stueck.wurzel.length;
  const n = Math.min(proben, Math.floor(anzahl / 3));
  for (const [name] of KNOCHEN) {
    const r = stueck.richtungen[name];
    for (let i = 0; i < n; i++) {
      // Von hinten nach vorn: die letzte Probe wird ganz zum Anfang.
      const idx = anzahl - n + i;
      const t = (i + 1) / n;
      // Weich einsteigen, sonst sieht man den Beginn der Blende.
      const g = t * t * (3 - 2 * t);
      const a = r[idx];
      const b = r[i === n - 1 ? 0 : 0];
      const v = [a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g, a[2] + (b[2] - a[2]) * g];
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      r[idx] = [v[0] / l, v[1] / l, v[2] / l];
    }
  }
  const w = stueck.wurzel;
  for (let i = 0; i < n; i++) {
    const idx = anzahl - n + i;
    const t = (i + 1) / n;
    const g = t * t * (3 - 2 * t);
    w[idx] = [w[idx][0] + (w[0][0] - w[idx][0]) * g, w[idx][1] + (w[0][1] - w[idx][1]) * g];
  }
  return stueck;
}

/* --- 5. Packen ------------------------------------------------------------ */

/**
 * Eine Schleife in Ganzzahlen packen.
 *
 * Richtungen als Byte: Der Bereich -1..1 auf -127..127 heisst eine
 * Aufloesung von 0,008 - bei einem Einheitsvektor sind das rund ein halbes
 * Grad. Ein halbes Grad an der Schulter sind bei einem 55 cm langen Arm
 * fuenf Millimeter an der Hand, und das ist auf einer Leinwand ein
 * Zehntelbildpunkt.
 *
 * Die Wurzel bekommt zwei Byte, weil sie klein ist und ein Zittern darin die
 * ganze Figur bewegt.
 */
export function packen(stueck) {
  const anzahl = stueck.wurzel.length;
  const r = [];
  for (const [name] of KNOCHEN) {
    for (let i = 0; i < anzahl; i++) {
      for (let k = 0; k < 3; k++) {
        r.push(Math.round(klemm(stueck.richtungen[name][i][k], -1, 1) * 127));
      }
    }
  }
  const w = [];
  for (let i = 0; i < anzahl; i++) {
    for (let k = 0; k < 2; k++) w.push(Math.round(klemm(stueck.wurzel[i][k], -2, 2) * 8000));
  }
  return { proben: anzahl, richtungen: r, wurzel: w };
}

/** Und wieder auspacken - dieselbe Rechnung rueckwaerts. */
export function auspacken(gepackt) {
  const anzahl = gepackt.proben;
  const richtungen = {};
  let p = 0;
  for (const [name] of KNOCHEN) {
    richtungen[name] = [];
    for (let i = 0; i < anzahl; i++) {
      const v = [gepackt.richtungen[p++] / 127, gepackt.richtungen[p++] / 127, gepackt.richtungen[p++] / 127];
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      richtungen[name].push([v[0] / l, v[1] / l, v[2] / l]);
    }
  }
  const wurzel = [];
  for (let i = 0; i < anzahl; i++) wurzel.push([gepackt.wurzel[i * 2] / 8000, gepackt.wurzel[i * 2 + 1] / 8000]);
  return { richtungen, wurzel };
}

/* --- Alles zusammen ------------------------------------------------------- */

/**
 * Eine BVH-Datei zu einer schlaggebundenen Schleife machen.
 *
 * @param {string} text        Inhalt der BVH-Datei
 * @param {object} [wahl]
 * @param {number} [wahl.bpm]  erwartetes Tempo, hilft beim Tipper-Suchen
 * @returns {object} Schleife samt Messwerten fuer die Abnahme
 */
export function einlesen(text, {
  bpm = 124, schlaege = SCHLEIFE_SCHLAEGE, abSchlag = 4, festerSchlag = null, glaettung = 0.04,
} = {}) {
  const skelett = bvhLesen(text);
  const zu = gelenkeZuordnen(skelett);
  const spur = glaetten(umrechnen(skelett, zu), skelett.bildDauer, glaettung);

  const stellen = skelett.bilder.map((b) => vorwaerts(skelett, b));
  const tipper = tipperFinden(
    stellen.map((w) => w[zu.handL].p),
    stellen.map((w) => w[zu.handR].p),
    skelett.bildDauer,
    60 / bpm,
  );

  /*
   * Das Tempo kommt aus der *Musik*, nicht aus den Tippern.
   *
   * Die Tipper liefern beides - Phase und Abstand -, aber nicht gleich gut.
   * Gemessen am verrauschten Pruefstand streut der Tempowert ueber mehrere
   * Laeufe um rund drei BPM, waehrend die Phase auf wenige Millisekunden
   * genau sitzt. Das ist kein Zufall: Die Phase ist der Mittelwert von vier
   * Messungen, das Tempo ihre *Steigung* - und eine Steigung aus vier
   * Punkten ueber anderthalb Sekunden reagiert viel empfindlicher auf
   * Rauschen als ihr Mittelwert.
   *
   * Drei BPM sind 2,4 Prozent, und ueber acht Schlaege sind das ein Fuenftel
   * Schlag Versatz am Ende der Schleife. Das saehe man.
   *
   * Also: Die Schlagdauer ist bekannt, sie steht in der Referenzmusik. Was
   * die Tipper messen, wird zur *Kontrolle* - und nur dann benutzt, wenn die
   * Abweichung so gross ist, dass sie kein Rauschen mehr sein kann. Dann
   * naemlich lief das Video wirklich zu schnell oder zu langsam, und das ist
   * ein Fehler, den man sehen und nicht ueberbuegeln will.
   */
  const erwartet = 60 / bpm;
  const abweichung = (tipper.schlagDauer - erwartet) / erwartet;
  const echteAbweichung = Math.abs(abweichung) > 0.05;
  const schlagDauer = echteAbweichung ? tipper.schlagDauer : erwartet;

  const schrittBilder = schlagDauer / skelett.bildDauer;
  const nullBild = tipper.zeit / skelett.bildDauer;
  /*
   * `festerSchlag` ist fuer die Abnahme: Sie vergleicht dieselbe Aufnahme
   * einmal sauber und einmal verrauscht, und dafuer muessen beide *dieselbe*
   * Stelle nehmen. Sonst vergleicht sie zwei verschiedene Takte miteinander
   * und nennt den Unterschied Rauschen.
   */
  const beste = festerSchlag === null
    ? schleifeWaehlen(spur, nullBild, schrittBilder, { abSchlag, schlaege })
    : (() => {
      const stueck = abtasten(spur, nullBild + festerSchlag * schrittBilder, schrittBilder, schlaege);
      return { abSchlag: festerSchlag, fehler: nahtFehler(stueck), stueck };
    })();
  nahtSchliessen(beste.stueck);

  return {
    ...beste.stueck,
    gepackt: packen(beste.stueck),
    messwerte: {
      bilder: skelett.bilder.length,
      bildDauer: skelett.bildDauer,
      tipperZeit: tipper.zeit,
      schlagDauer,
      bpm: 60 / schlagDauer,
      // Was die Tipper selbst gemessen haben, und wie weit das vom Erwarteten
      // abweicht. Ueber fuenf Prozent gilt es als echt und wird benutzt.
      gemessenBpm: 60 / tipper.schlagDauer,
      tempoAbweichung: abweichung,
      tempoAusMessung: echteAbweichung,
      tipperStreuung: tipper.streuung,
      tipperHand: tipper.hand,
      abSchlag: beste.abSchlag,
      nahtGrad: beste.fehler,
      rumpfLaenge: spur.groesse,
      gespiegelt: spur.spiegeln,
      gelenke: Object.fromEntries(Object.entries(zu).map(([k, v]) => [k, skelett.gelenke[v].name])),
    },
  };
}
