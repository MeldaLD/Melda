// Die Herzbrille finden und darauf ausrichten.
//
// --- Warum die Brille und nicht das Gesicht ---------------------------------
//
// Der uebliche Weg fuer so ein Video heisst "face match cut": Man sucht in
// jedem Foto die Augen, dreht und skaliert so, dass beide Augen immer an
// derselben Stelle sitzen, und schneidet dann hart durch. Der Kopf bleibt
// stehen, die Person wechselt - das ist der ganze Effekt.
//
// Dafuer braucht man normalerweise ein Gesichtsmodell: ein neuronales Netz,
// das Landmarken findet. Das ist ein Modell von einigen Megabyte, das
// geladen, ausgeliefert und gepflegt werden will.
//
// Hier gibt es einen Abkuerzer, und er ist besser als das Modell: Auf *jedem*
// dieser Fotos sitzt dieselbe Brille. Zwei kraeftig rote Herzen, in einer
// Welt aus Haut, Himmel und Hemd. Das ist eine gebaute Passmarke - und zwar
// eine mit allem, was man braucht:
//
//   die beiden Mittelpunkte  →  Lage und Drehung
//   ihr Abstand              →  Groesse
//
// Genau die drei Groessen, die eine Aehnlichkeitsabbildung braucht. Kein
// Modell, kein Download, und robuster als Augenlandmarken: Augen sind mal
// zu, mal verdeckt, mal im Schatten - die Brille ist immer da und immer rot.
//
// --- Wie rot ist rot --------------------------------------------------------
//
// Haut ist auch roetlich, und genau daran scheitert der naive Ansatz "viel
// Rot". Der Unterschied ist die *Saettigung*: Haut liegt bei 0,2 bis 0,4,
// eine getoente Kunststofflinse bei 0,6 und darueber. Zusaetzlich zaehlt der
// Abstand zwischen Rot und den beiden anderen Kanaelen - bei Haut sind Gruen
// und Blau nah beieinander, bei der Linse faellt Gruen deutlich ab.

/*
 * Die Schwellen - und alle drei sind an dem Beispielfoto *gemessen*, nicht
 * geschaetzt. Der erste Versuch war geraten und lag genau daneben: Er hat
 * Stirn, Wangen und Mund markiert und die Linsen ausgelassen.
 *
 * Der Fehler war ein absoluter Kanalabstand ("rot muss 60 ueber gruen
 * liegen"). In einer dunklen getoenten Linse ist alles klein, also auch der
 * Abstand - waehrend sonnenbeschienene Haut ihn muehelos erreicht.
 *
 * Gemessen ueber ein Raster durch das Gesicht:
 *
 *              Saettigung    Farbwinkel   Gruen/Rot
 *   Linse      0,80 - 1,00   336 - 351    0,02 - 0,10
 *   Haut       0,11 - 0,54     2 -  12    0,54 - 0,70
 *
 * Drei Merkmale, und jedes einzelne trennt schon sauber. Alle drei zusammen
 * halten auch dann noch, wenn ein Foto anders belichtet ist.
 *
 * Das schoenste davon ist der Farbwinkel: Die Linse liegt *unterhalb* von
 * 360, also auf der Magentaseite von Rot, die Haut oberhalb von 0 auf der
 * Orangeseite. Das ist kein Zufall, sondern Physik - ein roter Farbfilter
 * laesst genau ein schmales Band durch, Haut streut breit ins Gelbe.
 */
/*
 * Die Schwellen, und der Weg dahin ist der Erwaehnung wert.
 *
 * Erster Versuch: ein absoluter Kanalabstand ("rot muss 60 ueber gruen
 * liegen"). Der markierte Stirn, Wangen und Mund und liess die Linsen aus -
 * in einer dunklen getoenten Scheibe ist jeder absolute Abstand klein.
 *
 * Zweiter Versuch: eine Schwelle, die sich am Bild ausrichtet - die
 * roetesten drei Prozent der Bildpunkte. Das klang robust und war es nicht.
 * Gemessen ueberlappen sich die Bereiche naemlich:
 *
 *              Roetung (r minus staerkster anderer Kanal)
 *   Linse      34 (dunkle Stelle) bis 118 (helle Stelle)
 *   Haut       71 bis 82
 *
 * Eine dunkle Linsenstelle ist *weniger* rot-dominant als helle Haut. Nach
 * Roetung allein laesst sich das nicht trennen, egal mit welcher Schwelle.
 *
 * Was trennt, ist die Saettigung, und zwar mit weitem Abstand:
 *
 *   Linse      0,80 bis 1,00
 *   Haut       0,11 bis 0,54
 *
 * Dazwischen liegt eine Luecke von 0,26. Die Schwelle in ihre Mitte zu
 * legen ist die einzige Entscheidung, die hier ueberhaupt zu treffen war.
 *
 * Der Grund ist Physik und kein Zufall: Eine rote Filterscheibe laesst ein
 * schmales Band durch und schluckt den Rest - das *ist* hohe Saettigung.
 * Haut streut breit und bleibt deshalb blass.
 */
const SAETTIGUNG_MINDESTENS = 0.67;
const GRUEN_HOECHSTENS = 0.45; // Anteil von Rot
const HELLIGKEIT_MINDESTENS = 15; // darunter ist es Schatten, kein Glas

/**
 * Alle Bildpunkte markieren, die zur Brille gehoeren koennten.
 *
 * @returns {Uint8Array} 1 je Bildpunkt
 */
export function rotMaske(daten, breite, hoehe, bereich = null) {
  const maske = new Uint8Array(breite * hoehe);
  for (let i = 0, q = 0; i < daten.length; i += 4, q++) {
    /*
     * Ausserhalb des Suchbereichs gar nicht erst hinsehen.
     *
     * Der Bereich kommt aus der Gesichtserkennung, und er ist der eigentliche
     * Grund, warum die Suche auf Partyfotos wieder funktioniert: Ein roter
     * Folienwedel in der Hand liegt ausserhalb des Gesichts und kann damit
     * gar nicht mehr gewinnen - egal wie rot er ist.
     */
    if (bereich) {
      const x = q % breite;
      const y = (q - x) / breite;
      if (x < bereich.links || x >= bereich.rechts
        || y < bereich.oben || y >= bereich.unten) continue;
    }
    const r = daten[i];
    const g = daten[i + 1];
    const b = daten[i + 2];
    if (r < HELLIGKEIT_MINDESTENS) continue;
    // Rot muss der staerkste Kanal sein.
    if (r <= g || r <= b) continue;
    const tief = g < b ? g : b;
    if ((r - tief) / r < SAETTIGUNG_MINDESTENS) continue;
    if (g > r * GRUEN_HOECHSTENS) continue;
    maske[q] = 1;
  }
  return maske;
}

/**
 * Die Maske aufdicken und wieder abtragen - ein Schliessen.
 *
 * Warum das noetig ist: Die beiden Herzen haengen nur an der Nasenbruecke
 * zusammen, und diese Bruecke ist duenn. Ein Lichtreflex, eine Nasenspitze
 * davor oder eine etwas andere Belichtung trennen sie - und dann findet die
 * Flecken-Suche *eine* Linse statt der Brille. Die Folgen sind zwei, und
 * beide sind schlimm: Die geschaetzte Groesse halbiert sich, und die
 * Hauptachse eines einzelnen, fast runden Herzens zeigt in eine beliebige
 * Richtung. Gemessen: Groesse 0,48 statt 1,0 und Winkelfehler bis 90 Grad.
 *
 * Aufdicken schliesst die Bruecke, Abtragen holt die urspruengliche Form
 * zurueck. Beides getrennt in x und y, damit es zwei Durchgaenge sind und
 * nicht einer je Fensterpunkt - bei einem Radius von zehn Punkten ist das
 * der Unterschied zwischen linear und vierhundertfach.
 */
export function schliessen(maske, breite, hoehe, radius) {
  const auf = strecken(maske, breite, hoehe, radius, true);
  return strecken(auf, breite, hoehe, radius, false);
}

function strecken(quelle, breite, hoehe, radius, dicker) {
  const a = new Uint8Array(quelle.length);
  // Waagerecht
  for (let y = 0; y < hoehe; y++) {
    const z = y * breite;
    for (let x = 0; x < breite; x++) {
      let wert = dicker ? 0 : 1;
      const von = x - radius < 0 ? 0 : x - radius;
      const bis = x + radius >= breite ? breite - 1 : x + radius;
      for (let i = von; i <= bis; i++) {
        const v = quelle[z + i];
        if (dicker ? v : !v) { wert = dicker ? 1 : 0; break; }
      }
      a[z + x] = wert;
    }
  }
  const b = new Uint8Array(quelle.length);
  // Senkrecht
  for (let x = 0; x < breite; x++) {
    for (let y = 0; y < hoehe; y++) {
      let wert = dicker ? 0 : 1;
      const von = y - radius < 0 ? 0 : y - radius;
      const bis = y + radius >= hoehe ? hoehe - 1 : y + radius;
      for (let j = von; j <= bis; j++) {
        const v = a[j * breite + x];
        if (dicker ? v : !v) { wert = dicker ? 1 : 0; break; }
      }
      b[y * breite + x] = wert;
    }
  }
  return b;
}

/**
 * Zusammenhaengende Flecken in einer Maske finden.
 *
 * Vier-Nachbarschaft und eine eigene Halde statt Rekursion: Ein Fleck kann
 * bei einem Handyfoto hunderttausend Punkte haben, und so tief geht kein
 * Aufrufstapel.
 */
export function fleckenFinden(maske, breite, hoehe, mindestens = 40) {
  const marke = new Int32Array(maske.length).fill(-1);
  const flecken = [];
  const halde = new Int32Array(maske.length);
  for (let start = 0; start < maske.length; start++) {
    if (!maske[start] || marke[start] >= 0) continue;
    const nummer = flecken.length;
    let oben = 0;
    halde[oben++] = start;
    marke[start] = nummer;
    let anzahl = 0;
    let summeX = 0;
    let summeY = 0;
    // Zweite Momente gleich mitzaehlen - daraus kommt spaeter die Achse,
    // und ein zweiter Durchgang ueber hunderttausend Punkte waere schade.
    let summeXX = 0;
    let summeYY = 0;
    let summeXY = 0;
    let links = breite;
    let rechts = -1;
    let obenY = hoehe;
    let untenY = -1;
    while (oben > 0) {
      const q = halde[--oben];
      const x = q % breite;
      const y = (q - x) / breite;
      anzahl++;
      summeX += x;
      summeY += y;
      summeXX += x * x;
      summeYY += y * y;
      summeXY += x * y;
      if (x < links) links = x;
      if (x > rechts) rechts = x;
      if (y < obenY) obenY = y;
      if (y > untenY) untenY = y;
      if (x > 0 && maske[q - 1] && marke[q - 1] < 0) { marke[q - 1] = nummer; halde[oben++] = q - 1; }
      if (x < breite - 1 && maske[q + 1] && marke[q + 1] < 0) { marke[q + 1] = nummer; halde[oben++] = q + 1; }
      if (y > 0 && maske[q - breite] && marke[q - breite] < 0) { marke[q - breite] = nummer; halde[oben++] = q - breite; }
      if (y < hoehe - 1 && maske[q + breite] && marke[q + breite] < 0) { marke[q + breite] = nummer; halde[oben++] = q + breite; }
    }
    if (anzahl < mindestens) continue;
    const summen = { anzahl, sx: summeX, sy: summeY, sxx: summeXX, syy: summeYY, sxy: summeXY };
    const eigen = achseBestimmen(summen);
    flecken.push({
      anzahl,
      summen,
      mitte: [summeX / anzahl, summeY / anzahl],
      kasten: { links, rechts, oben: obenY, unten: untenY },
      breite: rechts - links + 1,
      hoehe: untenY - obenY + 1,
      achse: eigen ? eigen.winkel : 0,
      laenge: eigen ? eigen.laenge : rechts - links + 1,
      dicke: eigen ? eigen.dicke : untenY - obenY + 1,
    });
  }
  return flecken;
}

/**
 * Aus den roten Flecken die Brille zusammensetzen.
 *
 * Der erste Entwurf hat nach einem *Paar* gesucht - zwei Linsen, zwei
 * Flecken. Das Foto sagt etwas anderes: Die Brille ist randlos und an der
 * Bruecke zusammengewachsen, also ist sie in aller Regel *ein* Fleck. Mal
 * traegt die Nase sie auseinander, mal nicht; darauf kann man keine
 * Erkennung bauen.
 *
 * Also andersherum: Der groesste rote Fleck ist die Brille. Alles, was
 * gross genug ist und *auf ihrer Achse* liegt, gehoert dazu - so kommt eine
 * abgetrennte zweite Linse wieder dazu, ohne dass Lippen oder ein rotes
 * Hemd mit hineinrutschen. Die liegen naemlich quer zur Achse, nicht auf
 * ihr.
 */
export function brilleZusammensetzen(flecken) {
  if (!flecken.length) return null;
  const sortiert = [...flecken].sort((a, b) => b.anzahl - a.anzahl);
  const kern = sortiert[0];
  const teile = [kern];
  const achse = kern.achse;
  for (const f of sortiert.slice(1, 8)) {
    if (f.anzahl < kern.anzahl * 0.15) continue;
    const dx = f.mitte[0] - kern.mitte[0];
    const dy = f.mitte[1] - kern.mitte[1];
    // Zerlegen in "entlang der Achse" und "quer dazu".
    const laengs = Math.abs(dx * Math.cos(achse) + dy * Math.sin(achse));
    const quer = Math.abs(-dx * Math.sin(achse) + dy * Math.cos(achse));
    if (laengs > kern.laenge * 1.3) continue;
    if (quer > kern.dicke * 1.2) continue;
    teile.push(f);
  }
  return teile;
}

/**
 * Lage, Drehung und Groesse aus einer Punktmenge.
 *
 * Hauptachsenzerlegung: Die Richtung, in der die Punkte am weitesten
 * streuen, ist die Richtung der Brille. Das ist dieselbe Rechnung, mit der
 * man eine Regressionsgerade legt, nur symmetrisch in x und y - und sie
 * braucht nichts weiter als sechs Summen.
 */
export function achseBestimmen(summen) {
  const { anzahl, sx, sy, sxx, syy, sxy } = summen;
  if (anzahl < 8) return null;
  const mx = sx / anzahl;
  const my = sy / anzahl;
  const vxx = sxx / anzahl - mx * mx;
  const vyy = syy / anzahl - my * my;
  const vxy = sxy / anzahl - mx * my;
  // Eigenwerte der 2x2-Streumatrix.
  const mitte = (vxx + vyy) / 2;
  const wurzel = Math.sqrt(Math.max(0, ((vxx - vyy) / 2) ** 2 + vxy * vxy));
  const gross = mitte + wurzel;
  const klein = Math.max(0, mitte - wurzel);
  const winkel = 0.5 * Math.atan2(2 * vxy, vxx - vyy);
  return {
    mitte: [mx, my],
    winkel,
    // Zwei Standardabweichungen nach jeder Seite decken eine langgezogene
    // Form gut ab - das ist die Laenge, an der spaeter skaliert wird.
    laenge: 4 * Math.sqrt(gross),
    dicke: 4 * Math.sqrt(klein),
    schlankheit: gross > 0 ? Math.sqrt(klein / gross) : 1,
  };
}

/**
 * Die Brille in einem Bild finden.
 *
 * @param {ImageData} bild
 * @returns {{mitte:number[], winkel:number, laenge:number, dicke:number, guete:number}|null}
 */
export function brilleFinden(bild, bereich = null) {
  const { width: breite, height: hoehe, data } = bild;
  const roh = rotMaske(data, breite, hoehe, bereich);
  /*
   * Der Radius zum Schliessen. Er muss groesser sein als die Nasenbruecke
   * breit ist und kleiner als der Abstand zu allem anderen Roten.
   *
   * Ohne Suchbereich bleibt nur die Bildbreite als Anhaltspunkt: knapp zwei
   * Prozent davon. Mit Suchbereich ist der Bezug ein besserer, naemlich der
   * Bereich selbst - und der Unterschied ist keine Feinheit. Gemessen an
   * einem Foto mit 213 Punkten Bereichsbreite:
   *
   *   Radius 4    5500 Punkte Brille, Haare daneben getrennt
   *   Radius 8    5790 Punkte Brille, Haare daneben getrennt
   *   Radius 12  10217 Punkte - Brille und Haare zu einem Klumpen
   *
   * Zwoelf ist genau der Wert, den die Bildbreite vorgibt. Im ganzen Foto
   * ist er richtig, im Gesichtskasten verschmilzt er, was getrennt gehoert.
   */
  const bezug = bereich ? bereich.rechts - bereich.links : breite;
  const maske = schliessen(roh, breite, hoehe,
    Math.max(2, Math.round(bezug * (bereich ? 0.035 : 0.018))));
  // Mindestgroesse an der Bildflaeche festmachen und nicht an einer festen
  // Zahl: dasselbe Motiv kann als 800er oder als 4000er Foto kommen.
  /*
   * Die Mindestgroesse bezieht sich auf den *Suchbereich*. Im Gesichtskasten
   * ist die Brille ein grosser Teil der Flaeche, im ganzen Foto ein kleiner -
   * eine Schwelle am Gesamtbild waere im Kasten viel zu grob.
   */
  const flaeche = bereich
    ? (bereich.rechts - bereich.links) * (bereich.unten - bereich.oben)
    : breite * hoehe;
  const mindestens = Math.max(12, Math.round(flaeche * 0.0015));
  const flecken = fleckenFinden(maske, breite, hoehe, mindestens);
  if (!flecken.length) return null;
  const teile = brilleZusammensetzen(flecken);
  if (!teile) return null;
  // Die Summen der Teile addieren sich - deshalb muss nichts neu gezaehlt
  // werden.
  const g = { anzahl: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 };
  for (const t of teile) {
    g.anzahl += t.summen.anzahl;
    g.sx += t.summen.sx;
    g.sy += t.summen.sy;
    g.sxx += t.summen.sxx;
    g.syy += t.summen.syy;
    g.sxy += t.summen.sxy;
  }
  const lage = achseBestimmen(g);
  if (!lage) return null;
  /*
   * Wie sicher der Fund ist. Drei Dinge muessen stimmen, und jedes davon
   * kann ein Fehlfund verletzen:
   *
   *   Groesse     eine Brille nimmt einen nennenswerten Teil des Fotos ein
   *   Form        sie ist deutlich breiter als hoch
   *   Lage        sie steht ungefaehr waagerecht, nicht senkrecht
   */
  const anteil = g.anzahl / flaeche;
  const grossGenug = Math.min(1, anteil / (bereich ? 0.05 : 0.004));
  const schlank = Math.min(1, Math.max(0, (0.75 - lage.schlankheit) / 0.45));
  const neigung = Math.abs(((lage.winkel + Math.PI / 2) % Math.PI) - Math.PI / 2);
  const waagerecht = Math.min(1, Math.max(0, (0.7 - neigung) / 0.5));
  return {
    ...lage,
    teile: teile.length,
    anteil,
    guete: grossGenug * schlank * waagerecht,
  };
}

/* --- Ausrichten -------------------------------------------------------------
 *
 * Aus dem Fund wird eine Aehnlichkeitsabbildung: verschieben, drehen,
 * skalieren. Kein Verzerren - ein Gesicht, das gestaucht wird, sieht sofort
 * falsch aus, und die Brille gibt ohnehin nur diese drei Groessen her.
 *
 * Das Ziel ist fuer alle Bilder dasselbe: Die Brille sitzt immer an
 * derselben Stelle, immer gleich gross, immer waagerecht. Genau daran haengt
 * der ganze Effekt - der Blick des Zuschauers bleibt in der Mitte stehen,
 * waehrend die Menschen wechseln.
 */

/**
 * Wohin die Brille soll, in Anteilen der Ausgabegroesse.
 *
 * Etwas oberhalb der Mitte, weil ein Portraet mehr Platz unter den Augen
 * braucht als darueber - Kinn, Hals und Schultern gehoeren mit ins Bild,
 * ueber der Stirn reicht wenig.
 */
export const ZIEL = { x: 0.5, y: 0.42, breite: 0.42 };

/**
 * Die Abbildung auf einen Zeichenstift legen.
 *
 * @param {CanvasRenderingContext2D} stift
 * @param {object} fund   aus brilleFinden, in Koordinaten von `suchGroesse`
 * @param {number} suchBreite  Breite, bei der gesucht wurde
 * @param {number} breite  Ausgabebreite
 * @param {number} hoehe   Ausgabehoehe
 * @param {number} zoom    zusaetzliche Vergroesserung, 1 = wie vorgegeben
 */
export function ausrichtungLegen(stift, fund, suchBreite, quellBreite, breite, hoehe, zoom = 1) {
  /*
   * Der Fund kommt aus einem verkleinerten Bild - gesucht wird bei 640
   * Bildpunkten Breite, gezeichnet wird aus dem Original. Ohne diesen
   * Faktor sitzt die Brille auf einem 4000er Foto um das Sechsfache daneben.
   */
  const f = quellBreite / suchBreite;
  const mx = fund.mitte[0] * f;
  const my = fund.mitte[1] * f;
  const laenge = fund.laenge * f;
  const skala = ((ZIEL.breite * breite) / Math.max(1, laenge)) * zoom;
  stift.translate(ZIEL.x * breite, ZIEL.y * hoehe);
  stift.rotate(-fund.winkel);
  stift.scale(skala, skala);
  stift.translate(-mx, -my);
}

/**
 * Die mittlere Helligkeit und Farbe eines ausgerichteten Bildes messen.
 *
 * Wozu: Dreissig Fotos von dreissig Handys in dreissig Lichtsituationen
 * flackern in der Abfolge wie eine kaputte Leuchtstoffroehre. Wer sie auf
 * eine gemeinsame Helligkeit zieht, nimmt dem Video genau dieses Zappeln -
 * und *nur* das; die Gesichter bleiben, wie sie sind.
 *
 * Gemessen wird nur der mittlere Bereich, dort wo das Gesicht sitzt. Ein
 * heller Himmel im Hintergrund darf die Korrektur nicht bestimmen.
 */
export function helligkeitMessen(stift, breite, hoehe) {
  const x = Math.round(breite * 0.25);
  const y = Math.round(hoehe * 0.2);
  const b = Math.max(1, Math.round(breite * 0.5));
  const h = Math.max(1, Math.round(hoehe * 0.5));
  const d = stift.getImageData(x, y, b, h).data;
  let r = 0;
  let g = 0;
  let bl = 0;
  let n = 0;
  // Jeder achte Punkt reicht fuer einen Mittelwert.
  for (let i = 0; i < d.length; i += 32) {
    r += d[i];
    g += d[i + 1];
    bl += d[i + 2];
    n++;
  }
  return [r / n, g / n, bl / n];
}
