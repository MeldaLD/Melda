// Was die Flaeche mit dem Licht macht, das man auf sie wirft.
//
// --- Das Problem ------------------------------------------------------------
//
// Ein Beamer addiert Licht zu dem, was eine Flaeche ohnehin zurueckwirft. Auf
// einer weissen Leinwand ist das folgenlos. Auf einer Grobspanplatte nicht:
// Die wirft warmes Orange zurueck und schluckt Blau weitgehend. Was dort als
// blauer Kegel ankommt, sieht kein Mensch als blau - es wird schmutziges Grau.
//
// Grob gerechnet gilt je Kanal
//
//     gesehen = geworfen * Ruecwurf
//
// und der Ruecwurf steht in der Messung: Die Einmessseite nimmt aus dem Foto
// den Median je Kanal, einmal fuer die Hauptflaeche und einmal je Bereich.
//
// --- Warum hier trotzdem nicht kompensiert wird -----------------------------
//
// Der Fachbegriff dafuer ist radiometrische Kompensation, und sie funktioniert:
// Man teilt das Wunschbild durch den Ruecwurf und wirft das Ergebnis. Nur
// kostet sie genau das, was sie verspricht.
//
// Auf der gemessenen Wand hier - rund rgb(200 155 95) - braeuchte reines Blau
// gegenueber Rot den Faktor 200/95 = 2,1. Der Beamer kann Blau aber nicht
// verdoppeln; er kann nur Rot und Gruen herunterziehen. Uebrig bleibt ein
// Bild mit weniger als der Haelfte der Helligkeit, und in den hellen Stellen
// laeuft die Rechnung aus dem darstellbaren Bereich und clippt sichtbar.
// Genau das beschreibt auch die Literatur als die Grenze des Verfahrens.
//
// Fuer eine Party in einem Lagerraum ist das der falsche Handel. Die viel
// wirksamere Entscheidung ist nicht "wie zwinge ich Blau auf Orange", sondern
// "was zeige ich auf Orange ueberhaupt" - und die trifft dieses Modul.
//
// --- Die Regel, die dabei herauskommt ---------------------------------------
//
// Eine Flaeche kann Farbe tragen oder nicht, und das haengt daran, wie neutral
// sie ist:
//
//   Neutral (Stahl, Beton, weisse Wand)  traegt Farbunterschiede.
//   Bunt (Holz, Ziegel)                  traegt Helligkeitsunterschiede.
//
// Auf einer orangen Wand sehen Blau, Gruen und Violett alle gleich aus -
// naemlich wie dunkleres Orange. Rot und Gelb sehen aus wie helleres Orange.
// Der Unterschied, den das Auge dort noch lesen kann, ist *hell gegen dunkel*,
// nicht *Farbe gegen Farbe*. Wer darauf ein buntes Bild wirft, bekommt kein
// buntes Bild, sondern ein flaues.
//
// Und daraus folgt fuer diesen Raum die ganze Gestaltung: Die Farbe gehoert
// auf die Gitterkaesten - verzinkter Stahl ist neutralgrau und gibt sie
// ungefaelscht wieder -, und die Holzwand bekommt warmes Licht mit starkem
// Hell-Dunkel. Nicht als Notloesung, sondern weil es das ist, was der Raum
// kann.

/** Der Median-Ruecwurf einer unvermessenen Flaeche: neutral und mittelhell. */
const NEUTRAL = [180, 180, 180];

/*
 * Was im Lagerraum gemessen zu erwarten ist, geschaetzt aus dem Foto vom
 * Aufbautag. Steht hier, damit das Bild schon *vor* der Messung ungefaehr
 * stimmt - und wird von jeder echten Messung ueberschrieben.
 *
 * Die Zahlen sind mit Absicht als Schaetzung gekennzeichnet und nicht als
 * Messung: Sie stammen aus dem Ansehen eines Handyfotos, nicht aus dem
 * Median-Lauf der Einmessseite.
 */
export const GESCHAETZT = {
  osb: [200, 155, 95],      // Grobspanplatte, warmes Orange
  stahl: [150, 152, 155],   // verzinktes Gitter, fast neutral
  glas: [40, 38, 34],       // Flaschenboeden, sehr dunkel
  balken: [120, 100, 74],   // Deckenbalken, dunkles Holz
};

/**
 * Eine gemessene Flaechenfarbe auswerten.
 *
 * @param {number[]|null} rgb  Median-Ruecwurf, 0..255 je Kanal
 */
export function oberflaecheLesen(rgb) {
  const f = Array.isArray(rgb) && rgb.length === 3 ? rgb : NEUTRAL;
  const [r, g, b] = f.map((v) => Math.max(1, Math.min(255, v)) / 255);
  const hoch = Math.max(r, g, b);
  const tief = Math.min(r, g, b);

  /*
   * Wie viel von jedem Kanal ueberlebt, bezogen auf den staerksten. Der
   * staerkste Kanal ist immer 1 - gefragt ist das Verhaeltnis, nicht die
   * absolute Helligkeit.
   */
  const wiedergabe = [r / hoch, g / hoch, b / hoch];

  /*
   * Neutralitaet: 1 = grau, 0 = knallbunt. Das ist die Saettigung der
   * Flaeche, andersherum gelesen.
   */
  const neutral = 1 - (hoch - tief) / hoch;

  /*
   * Was eine Kompensation kosten wuerde: Der schwaechste Kanal muesste um
   * diesen Faktor angehoben werden, und weil das nicht geht, muessen die
   * anderen entsprechend herunter. Der Kehrwert ist die Helligkeit, die
   * uebrig bliebe.
   */
  const kompensationsKosten = hoch / Math.max(0.02, tief);

  return {
    rgb: f,
    wiedergabe,
    neutral,
    helligkeit: 0.2126 * r + 0.7152 * g + 0.0722 * b,
    kompensationsKosten,
    /*
     * Traegt diese Flaeche Farbe? Die Schwelle bei 0,6 ist eine
     * Entscheidung und keine Messung: Darunter liegen Holz und Ziegel,
     * darueber Stahl, Beton und Putz.
     */
    traegtFarbe: neutral >= 0.6,
    /**
     * Wie viel Licht ein Farbwinkel auf dieser Flaeche noch zurueckbringt,
     * 0 bis 1, bezogen auf den besten Winkel.
     *
     * Hier stand zuerst die Saettigung des zurueckgeworfenen Lichts, und das
     * war das falsche Mass: Eine voll gesaettigte Farbe hat immer einen
     * Kanal auf null, und der bleibt nach der Multiplikation auf null - die
     * Saettigung kommt also *immer* als 1 heraus. Die Abnahme hat prompt
     * gemeldet, dass Blau und Rot auf der orangen Wand gleich gut
     * abschneiden, und das ist offensichtlich Unsinn.
     *
     * Was auf einer bunten Flaeche wirklich passiert, ist auch nicht
     * Entsaettigung, sondern *Verdunkelung*: Blau auf Orange wird nicht zu
     * blassem Blau, es wird zu fast nichts. Gerechnet wird deshalb die
     * zurueckkommende Leuchtdichte, verglichen mit dem besten Winkel dieser
     * Flaeche.
     *
     * Fuer die gemessene Holzwand kommt damit heraus: Blau 0,29, Rot 0,52,
     * Gelb 1,0. Das deckt sich mit dem, was man sieht.
     */
    taugt(winkel) {
      const w = ((winkel % 360) + 360) % 360;
      const licht = (grad) => {
        const [wr, wg, wb] = hslNachRgb(grad, 1, 0.5);
        return 0.2126 * wr * wiedergabe[0]
          + 0.7152 * wg * wiedergabe[1]
          + 0.0722 * wb * wiedergabe[2];
      };
      let bestes = 0;
      for (let grad = 0; grad < 360; grad += 10) bestes = Math.max(bestes, licht(grad));
      return bestes <= 1e-6 ? 0 : Math.min(1, licht(w) / bestes);
    },
    /** Der Farbwinkel, der auf dieser Flaeche am meisten Licht zurueckgibt. */
    besterWinkel() {
      let bestes = -1;
      let wo = 0;
      for (let grad = 0; grad < 360; grad += 5) {
        const [wr, wg, wb] = hslNachRgb(grad, 1, 0.5);
        const l = 0.2126 * wr * wiedergabe[0]
          + 0.7152 * wg * wiedergabe[1] + 0.0722 * wb * wiedergabe[2];
        if (l > bestes) { bestes = l; wo = grad; }
      }
      return wo;
    },
  };
}

/**
 * Die Farbwinkel einer Palette auf das schieben, was die Flaeche hergibt.
 *
 * Kein Umfaerben um jeden Preis: Traegt die Flaeche Farbe, bleibt alles, wie
 * es ist. Traegt sie keine, werden die Winkel zu dem hin gezogen, was dort
 * ueberhaupt noch unterscheidbar ist - und das ist die Gegend um die
 * Flaechenfarbe selbst, weil nur dort noch Saettigung uebrig bleibt.
 */
export function winkelAnpassen(winkel, flaeche) {
  if (flaeche.traegtFarbe) return winkel;
  const eigen = rgbNachWinkel(flaeche.rgb);
  const w = ((winkel % 360) + 360) % 360;
  let d = ((w - eigen + 540) % 360) - 180;
  /*
   * Die Spreizung zusammenziehen, aber nicht auf null: Ein Bild, in dem
   * alles genau denselben Farbwinkel hat, ist tot. Der Rest der
   * Unterscheidung kommt aus der Helligkeit.
   */
  const enge = 0.35 + flaeche.neutral * 0.5;
  d *= enge;
  return (eigen + d + 360) % 360;
}

/** Der Farbwinkel einer RGB-Farbe, 0 bis 360. */
export function rgbNachWinkel([r, g, b]) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const hoch = Math.max(R, G, B);
  const tief = Math.min(R, G, B);
  const d = hoch - tief;
  if (d < 1e-6) return 0;
  let w;
  if (hoch === R) w = ((G - B) / d) % 6;
  else if (hoch === G) w = (B - R) / d + 2;
  else w = (R - G) / d + 4;
  w *= 60;
  return (w + 360) % 360;
}

/** HSL nach RGB, Anteile 0..1. Nur hier gebraucht, deshalb hier. */
function hslNachRgb(winkel, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((winkel / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = winkel < 60 ? [c, x, 0]
    : winkel < 120 ? [x, c, 0]
      : winkel < 180 ? [0, c, x]
        : winkel < 240 ? [0, x, c]
          : winkel < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

/**
 * Die Flaechen einer Messung auslesen.
 *
 * Liefert die Hauptflaeche und eine Zuordnung Bereichsname -> Flaeche. Ohne
 * Messung kommt ueberall die neutrale Vorgabe zurueck, damit nichts
 * abfragen muss, ob es eine Messung gibt.
 */
export function flaechenLesen(bild) {
  const jeBereich = new Map();
  for (const b of bild?.bereiche ?? []) {
    jeBereich.set(b.name, oberflaecheLesen(b.farbe ?? null));
  }

  /*
   * Welche Farbe gilt als *die* Flaeche des Raumes?
   *
   * `grundfarbe` ist der Median des ganzen Fotos, und solange der Raum aus
   * einem Material besteht, ist das genau richtig. Sobald jemand weisse
   * Platten an eine orange Holzwand haengt, ist es genau falsch: Der Median
   * landet irgendwo zwischen beiden und beschreibt keine der beiden
   * Flaechen. Die Folge waere die schlechteste von allen - die Farbwinkel
   * wuerden auf ein Orange geschoben, das es an der Stelle gar nicht mehr
   * gibt, und die weisse Platte bekaeme eine Korrektur, die sie nicht
   * braucht.
   *
   * Gibt es Bereiche der Art "flaeche", sind das die Stellen, auf die
   * geworfen wird - dann zaehlen die und nicht der Durchschnitt des Raumes.
   * Gemittelt wird ueber sie, damit zwei verschieden helle Platten nicht
   * davon abhaengen, welche zuerst markiert wurde.
   */
  const vorzug = (bild?.bereiche ?? []).filter((b) => b.art === 'flaeche' && b.farbe);
  let grundfarbe = bild?.grundfarbe ?? null;
  if (vorzug.length) {
    const summe = [0, 0, 0];
    for (const b of vorzug) for (let i = 0; i < 3; i++) summe[i] += b.farbe[i];
    grundfarbe = summe.map((v) => Math.round(v / vorzug.length));
  }
  const grund = oberflaecheLesen(grundfarbe);

  return {
    grund,
    jeBereich,
    /** Ob die Hauptflaeche aus markierten Projektionsflaechen kommt. */
    ausVorzug: vorzug.length > 0,
    vorzugsflaechen: vorzug.map((b) => b.name),
    fuer: (bereich) => jeBereich.get(bereich?.name) ?? grund,
  };
}
