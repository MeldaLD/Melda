// Gesichter finden - damit die Brille nicht mit dem Wedel verwechselt wird.
//
// --- Warum das noetig wurde -------------------------------------------------
//
// Die Brillensuche allein hat eine Annahme: Das Roteste im Bild ist die
// Brille. Auf der Party hatten viele Gaeste zusaetzlich einen Folienwedel in
// der Hand - ein Herz aus rotem Metallpapier mit Fransen. Der ist *kraeftiger*
// rot als die getoenten Scheiben, weil er das Licht spiegelt statt es zu
// filtern.
//
// Gemessen an vier echten Partyfotos: In dreien griff die Suche daneben, in
// einem verschmolzen Brille und Wedel zu einem Klumpen. Bei einem Foto war
// die Brille ueberhaupt nicht markiert, der Wedel vollstaendig.
//
// --- Der Umweg, der nicht funktioniert hat ----------------------------------
//
// Naheliegend war ein Zusatzmerkmal ohne neues Werkzeug: Die Brille sitzt auf
// Haut, der Wedel nicht. Also den Anteil hautfarbener Punkte in einem Ring um
// jeden roten Fleck messen.
//
// Gemessen trennt das nicht:
//
//   Foto              Wedel   Brille
//   ohne Wedel          -      0,05
//   f9faf208          0,28     0,44
//   664ebfb3          0,11     0,11
//
// Ausgerechnet der eine zweifelsfrei richtige Fund bekam den niedrigsten Wert
// von allen - der Ring liegt bei einem grossen Fleck schon im Himmel. Damit
// war die Idee erledigt, und zwar bevor sie gebaut war.
//
// --- Also doch ein Gesichtsmodell -------------------------------------------
//
// Der Browser bringt keins mit: `FaceDetector` gibt es nur auf Android. Also
// liegt hier MediaPipe BlazeFace lokal im Ordner - Laufzeit und Modell
// zusammen 9,6 MB. Das ist viel fuer eine Seite und trotzdem richtig: Die
// Alternative waere, dreissig Fotos von Hand nachzuziehen.
//
// Lokal und nicht ueber ein CDN, weil die Seite ohne Netz laufen soll - und
// weil ein CDN-Ausfall sonst genau dann auffaellt, wenn man es gerade braucht.
//
// BlazeFace liefert nebenbei sechs Landmarken, darunter beide Augen. Damit
// gibt es eine Rueckfallebene, wenn die Brille im Gesicht nicht gefunden wird:
// Dann wird eben auf die Augen ausgerichtet. Das ist ohnehin der klassische
// Weg fuer solche Videos.

/*
 * Wo Laufzeit und Modell liegen.
 *
 * Ausgerechnet aus `import.meta.url` und nicht als kurzer Pfad hingeschrieben,
 * weil hier zwei verschiedene Bezugspunkte aufeinandertreffen: Ein
 * `import('./gesicht/...')` loest gegen *dieses Modul* auf, der Pfad fuer den
 * FilesetResolver dagegen wird spaeter geholt und loest gegen die *Seite* auf.
 * Solange beides nebeneinander liegt, faellt der Unterschied nicht auf - beim
 * ersten Versuch lag dieses Modul in `gemeinsam/`, und der Ordner hier: Dann
 * greift der eine Pfad ins Leere und der andere trifft.
 *
 * Eine ausgerechnete absolute Adresse hat diesen Unterschied nicht. Sie
 * stimmt unter `/brille/` genauso wie unter `/dj/brille/`.
 */
const ORDNER = new URL('gesicht/', import.meta.url).href;

let sucher = null;
let laedt = null;

/**
 * Den Gesichtssucher laden. Mehrfachaufrufe teilen sich einen Sucher.
 */
export function gesichtssucherLaden() {
  if (sucher) return Promise.resolve(sucher);
  if (laedt) return laedt;
  laedt = (async () => {
    const { FilesetResolver, FaceDetector } = await import(`${ORDNER}vision_bundle.mjs`);
    const beiwerk = await FilesetResolver.forVisionTasks(ORDNER);
    sucher = await FaceDetector.createFromOptions(beiwerk, {
      baseOptions: { modelAssetPath: `${ORDNER}blaze_face_short_range.tflite` },
      runningMode: 'IMAGE',
      /*
       * Niedrig angesetzt: Lieber ein schwaches Gesicht zu viel als eines zu
       * wenig - welches gemeint ist, entscheidet gleich die Bewertung. An
       * echten Fotos lagen die richtigen Gesichter bei 0,83 bis 0,95, die
       * Fehlfunde auf Haenden bei 0,42 und 0,51.
       */
      minDetectionConfidence: 0.3,
    });
    return sucher;
  })();
  return laedt;
}

/**
 * Das Gesicht heraussuchen, um das es geht.
 *
 * Auf den Fotos ist oft mehr als ein Gesicht: jemand im Hintergrund, und
 * BlazeFace findet gelegentlich auch eine Hand. Gemeint ist immer das
 * *grosse, sichere, mittige* - der Mensch, der fotografiert wurde.
 *
 * @param {HTMLCanvasElement} leinwand
 * @returns {{kasten:object, augen:number[][], sicher:number}|null}
 */
export async function gesichtFinden(leinwand) {
  const s = await gesichtssucherLaden();
  const erg = s.detect(leinwand);
  if (!erg.detections?.length) return null;
  const B = leinwand.width;
  const H = leinwand.height;
  let bestes = null;
  for (const d of erg.detections) {
    const k = d.boundingBox;
    const sicher = d.categories?.[0]?.score ?? 0;
    const flaeche = (k.width * k.height) / (B * H);
    // Wie mittig: 1 in der Mitte, 0 am Rand.
    const mx = (k.originX + k.width / 2) / B;
    const my = (k.originY + k.height / 2) / H;
    const mittig = 1 - Math.min(1, Math.hypot(mx - 0.5, my - 0.45) * 2);
    const punkte = sicher * (0.35 + flaeche * 8) * (0.55 + mittig * 0.65);
    if (!bestes || punkte > bestes.punkte) {
      /*
       * BlazeFace liefert sechs Landmarken in fester Reihenfolge; die
       * ersten beiden sind die Augen. Sie kommen in Anteilen und werden
       * hier gleich in Bildpunkte umgerechnet.
       */
      const augen = (d.keypoints ?? []).slice(0, 2).map((p) => [p.x * B, p.y * H]);
      bestes = { punkte, kasten: k, sicher, augen: augen.length === 2 ? augen : null };
    }
  }
  return bestes;
}

/**
 * Aus dem Gesichtskasten den Bereich machen, in dem die Brille liegen muss.
 *
 * Etwas groesser als der Kasten und nach oben verschoben: Der Kasten von
 * BlazeFace sitzt eng um Augen, Nase und Mund, waehrend die Buegel einer
 * Brille bis zu den Ohren reichen. Zu eng geschnitten faende man nur den
 * mittleren Teil und schaetzte die Brille zu klein.
 */
export function brillenBereich(kasten, B, H) {
  const b = kasten.width * 1.45;
  /*
   * Nach unten schmal, und das ist der wichtigere der beiden Werte.
   *
   * Zuerst stand hier 0,95 - also fast die volle Gesichtshoehe. Der Bereich
   * reichte damit bis ueber den Mund, und auf einem Foto lacht jemand mit
   * geschminkten Lippen: Lippen und Brille wurden ein einziger Fleck, und der
   * ist rund statt langgezogen. Damit faellt die Guete auf null, obwohl die
   * Brille sauber gefunden war.
   *
   * 0,55 reicht von etwa einem Zehntel bis zwei Dritteln der Gesichtshoehe.
   * Augenbrauen und Buegel liegen darin, Nasenspitze und Mund nicht mehr.
   */
  const h = kasten.height * 0.55;
  const mx = kasten.originX + kasten.width / 2;
  // Die Brille sitzt im oberen Drittel des Gesichts, nicht in seiner Mitte.
  const my = kasten.originY + kasten.height * 0.38;
  return {
    links: Math.max(0, Math.round(mx - b / 2)),
    oben: Math.max(0, Math.round(my - h / 2)),
    rechts: Math.min(B, Math.round(mx + b / 2)),
    unten: Math.min(H, Math.round(my + h / 2)),
  };
}

/* --- Aus dem Gesicht einen Fund machen -------------------------------------
 *
 * Hier kehrt sich die urspruengliche Idee um, und zwar aufgrund von Messung.
 *
 * Der Plan war: Die Brille richtet aus, das Gesicht ist nur die Rueckfallebene,
 * wenn die Brille nicht gefunden wird. Gemessen an den fuenf Probefotos traegt
 * das nicht. Selbst *im* Gesichtskasten findet die Brillensuche nur auf einem
 * einzigen Foto etwas, dem man die Ausrichtung anvertrauen moechte:
 *
 *   Foto          dWinkel   Versatz   Skala   Guete
 *   beispiel        1,7°      0,07     2,49    0,92
 *   64d071b9      -18,2°      0,35     2,70    0,63
 *   f9faf208      -83,6°      1,52     1,02    0
 *   664ebfb3      (die Brillensuche findet 3 Bildpunkte)
 *   31153039        3,7°      0,17     2,50    0,70
 *
 * "Versatz" ist der Abstand zwischen Brillenmitte und Augenmitte, gemessen in
 * Augenabstaenden. Bei 64d071b9 liegt die gefundene Mitte ein Drittel eines
 * Augenabstands daneben und der Winkel achtzehn Grad daneben - und die Guete
 * meldet trotzdem 0,63. Die Guete kann das auch gar nicht wissen: Sie
 * beurteilt Groesse, Form und Waagerechte des Flecks, aber nicht, ob der
 * Fleck an der richtigen Stelle sitzt.
 *
 * Das Gesicht weiss das. Damit ist die Reihenfolge klar:
 *
 *   Die Augen legen die Ausrichtung fest - sie sind auf allen fuenf Fotos da.
 *   Die Brille darf sie nachbessern - aber nur, wenn sie den Augen zustimmt.
 *
 * Das ist genau der Aufbau, der bestellt war: grob ueber das Gesicht, die
 * letzten Millimeter ueber die Brille.
 */

/**
 * Wie lang die Brille im Verhaeltnis zum Augenabstand ist.
 *
 * Gemessen an den drei Fotos, auf denen die Brillensuche einen zusammen-
 * haengenden Fleck ueber beide Glaeser gelegt hat: 2,49 / 2,70 / 2,50. Der
 * Mittelwert daraus. Die beiden Fehlfunde liegen bei 1,02 - weit genug weg,
 * dass sich daran auch gleich pruefen laesst, ob ein Fund taugt.
 */
const AUGEN_STRECKUNG = 2.56;

/**
 * Aus den beiden Augenlandmarken denselben Fund bauen, den die Brillensuche
 * sonst liefert: Mitte, Drehung, Laenge.
 */
export function augenFund(augen) {
  if (!augen || augen.length !== 2) return null;
  const [a, b] = augen;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const abstand = Math.hypot(dx, dy);
  if (!(abstand > 1)) return null;
  return {
    mitte: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    winkel: Math.atan2(dy, dx),
    laenge: abstand * AUGEN_STRECKUNG,
    dicke: abstand * 0.5,
    augenAbstand: abstand,
    /*
     * Ein Fund aus den Augen ist gut, aber nicht so gut wie ein bestaetigter:
     * Die Landmarken sitzen auf dem Auge, nicht auf der Glasmitte, und bei
     * einem leicht gedrehten Kopf ist das nicht dasselbe. Der Wert liegt
     * deshalb ueber der Schwelle "fraglich" und unter einer glatten Eins.
     */
    guete: 0.7,
    quelle: 'augen',
  };
}

/*
 * Wann die Brille die Augen nachbessern darf.
 *
 * Alle drei Bedingungen muessen halten. Einzeln laesst sich jede austricksen -
 * ein Wedel neben dem Kopf hat durchaus den richtigen Winkel, und ein
 * einzelnes Glas hat durchaus die richtige Mitte. Zusammen nicht mehr.
 */
const DARF_NACHBESSERN = {
  /** Grad Winkelunterschied zur Augenachse. */
  winkel: 40,
  /** Versatz der Mitte, in Augenabstaenden. */
  versatz: 0.5,
  /** Erlaubtes Laengenverhaeltnis zum Augenabstand. */
  skala: [1.9, 3.2],
};

/*
 * --- Warum diese Schwellen weit sind, und warum das kein Nachlassen ist -----
 *
 * Sie standen einmal bei 10 Grad und 0,2 Augenabstaenden. Das war richtig
 * gerechnet und trotzdem falsch: Damals fand die Rotmaske auf zwei von fuenf
 * Fotos ueberhaupt keine Glaeser, die Brille war also tatsaechlich der
 * schwaechere der beiden Anker. Seit die Maske auf der Magentaseite trennt
 * (siehe brille.js), findet sie auf allen fuenf - und jetzt zeigt die
 * Messung ins Gegenteil.
 *
 * Nachgemessen wird im *ausgerichteten* Bild: Steht die Brille dort schief
 * oder falsch gross, war der Anker schlecht. Ueber die Augen ausgerichtet:
 *
 *   64d071b9   die Brille steht 16 Grad schief
 *   f9faf208   die Brille ist 33 Prozent zu gross
 *
 * Beide Male hat der enge Winkeltest die Brille verworfen und auf die Augen
 * zurueckgefallen - also ausgerechnet auf die schlechtere Angabe. Der Grund
 * ist kein Fehler im Modell, sondern seine Aufloesung: BlazeFace rechnet
 * intern auf 128 mal 128 Bildpunkten. Fuer "wo ist das Gesicht" ist das
 * reichlich, fuer "wo genau sitzt die Pupille" nicht.
 *
 * Die Augen bleiben deshalb, was sie koennen: der Wachhund gegen den Wedel.
 * Dafuer reichen weite Schwellen locker - ein Wedelfund lag 1,52
 * Augenabstaende daneben, die echten Funde liegen bei 0,14 bis 0,37. Und die
 * Rueckfallebene bleiben sie auch: Wo gar keine Glaeser gefunden werden, ist
 * ein grober Anker immer noch besser als keiner.
 */

/**
 * Augenfund und Brillenfund zusammenbringen.
 *
 * Stimmt die Brille den Augen zu, gewinnt die Brille: Sie sitzt auf der
 * Glasmitte statt auf der Pupille und ist damit das genauere Mass fuer
 * genau die Stelle, die im Video stillstehen soll. Widerspricht sie,
 * gewinnen die Augen - kommentarlos, denn ein Widerspruch heisst hier immer,
 * dass die Brillensuche etwas anderes erwischt hat.
 */
export function fundVereinen(ausAugen, ausBrille) {
  if (!ausAugen) return ausBrille;
  if (!ausBrille) return ausAugen;
  const abstand = ausAugen.augenAbstand;
  let dw = ((ausBrille.winkel - ausAugen.winkel) * 180) / Math.PI;
  while (dw > 90) dw -= 180;
  while (dw < -90) dw += 180;
  const versatz = Math.hypot(
    ausBrille.mitte[0] - ausAugen.mitte[0],
    ausBrille.mitte[1] - ausAugen.mitte[1],
  ) / abstand;
  const skala = ausBrille.laenge / abstand;
  const einig = Math.abs(dw) <= DARF_NACHBESSERN.winkel
    && versatz <= DARF_NACHBESSERN.versatz
    && skala >= DARF_NACHBESSERN.skala[0]
    && skala <= DARF_NACHBESSERN.skala[1];
  if (!einig) return { ...ausAugen, verworfen: { dw: +dw.toFixed(1), versatz: +versatz.toFixed(2), skala: +skala.toFixed(2) } };
  return {
    ...ausBrille,
    augenAbstand: abstand,
    // Zwei unabhaengige Verfahren, die sich einig sind - das ist mehr wert
    // als das bessere der beiden allein.
    guete: Math.min(1, 0.75 + ausBrille.guete * 0.25),
    quelle: 'brille',
  };
}

/**
 * Die ganze Kette fuer ein Bild.
 *
 * @param {HTMLCanvasElement} leinwand  das verkleinerte Suchbild
 * @param {ImageData} daten             dieselben Bildpunkte als Rohdaten
 * @returns {object|null} ein Fund wie aus `brilleFinden`, zusaetzlich mit
 *   `quelle` ('brille' | 'augen' | 'nurBrille') und `sicher`.
 */
export async function fundBestimmen(leinwand, daten, brilleFinden, glaeserFinden) {
  const gesicht = await gesichtFinden(leinwand);
  if (!gesicht) {
    /*
     * Kein Gesicht: dann bleibt nur die alte Suche im ganzen Bild. Das ist
     * der Fall, der den Wedel erwischt - aber ohne Gesicht gibt es nichts
     * Besseres, und die Kachel faellt in der Galerie ohnehin auf.
     */
    const f = brilleFinden(daten);
    return f ? { ...f, quelle: 'nurBrille', sicher: 0 } : null;
  }

  /*
   * Der genaue Weg zuerst: die beiden Glasmitten in zwei Kreisscheiben um
   * die Augen. Siehe glaeserFinden() - das ist die Stufe, an der die
   * Millimeter haengen.
   */
  if (glaeserFinden) {
    const glas = glaeserFinden(daten, gesicht.augen);
    if (glas && plausibel(glas)) {
      return {
        ...glas,
        guete: 1,
        quelle: 'glaeser',
        sicher: gesicht.sicher,
        augen: gesicht.augen,
      };
    }
  }

  /*
   * Sonst der grobe Weg: Brillensuche im Gesichtskasten, gegen die Augen
   * geprueft, und im Zweifel die Augen selbst.
   */
  const bereich = brillenBereich(gesicht.kasten, leinwand.width, leinwand.height);
  const vereint = fundVereinen(augenFund(gesicht.augen), brilleFinden(daten, bereich));
  if (!vereint) return null;
  return { ...vereint, sicher: gesicht.sicher, bereich, augen: gesicht.augen };
}

/*
 * Sitzt das gefundene Glaeserpaar plausibel zum Gesicht?
 *
 * Gemessen an den fuenf Probefotos liegt der Abstand der beiden Glasmitten
 * zwischen dem 1,09- und dem 1,23-fachen des Augenabstands - die Glaeser
 * sind ja etwas weiter auseinander als die Pupillen. Der erlaubte Bereich
 * ist absichtlich viel weiter: Er soll grobe Ausreisser abfangen, nicht die
 * Messung nachkorrigieren. Wo er zuschlaegt, uebernimmt der grobe Weg.
 */
function plausibel(glas) {
  const v = glas.glasabstand / glas.augenAbstand;
  return v > 0.7 && v < 1.8;
}
