// Farben aus der Palette holen - egal in welcher Form sie kommt.
//
// Diese Datei gibt es wegen eines Fehlers, den zwei Abnahmen nicht gefunden
// haben, weil beide dieselbe falsche Annahme teilten.
//
// Die Palette der Buehne ist ein *Objekt*:
//
//   { name, grundton, akzent, baender, toene: ['rgb(..)', ...], hell: 'rgb(..)' }
//
// Zwei neue Schichten - die Architektur und der Lichtpark - haben sie als
// *Feld* behandelt (`palette[0]`, `palette.length`) und ausserdem Alpha als
// Hexziffern angehaengt (`${farbe}22`). Beides geht schief, und zwar nicht
// laut: `palette[0]` ist undefined, daraus wird die Zeichenkette
// "undefined22", und die Leinwand meldet sie als unlesbare Farbe - einmal je
// Verlauf, hundertmal je Sekunde.
//
// Die Abnahmen haben es nicht gefunden, weil sie der Einfachheit halber ein
// Feld aus Hexfarben uebergeben haben. Sie pruefen seither mit der echten
// Form, und die Umrechnung steht hier, damit sie nicht dreimal danebengeht.

/**
 * Die Farbtoene einer Palette als Feld.
 *
 * Nimmt entweder das Palettenobjekt der Buehne, ein Feld aus Farben oder
 * nichts. Es kommen immer mindestens vier Eintraege heraus - jede Schicht
 * hier greift auf feste Plaetze zu (0 der Grundton, 3 der helle Akzent), und
 * eine kuerzere Liste waere ein Loch an genau der Stelle.
 */
export function toeneAus(palette) {
  let liste = null;
  if (Array.isArray(palette)) liste = palette.filter((f) => typeof f === 'string');
  else if (palette && Array.isArray(palette.toene)) {
    liste = [...palette.toene];
    if (typeof palette.hell === 'string') liste.push(palette.hell);
  }
  if (!liste || !liste.length) liste = ['rgb(80 90 220)', 'rgb(120 70 220)', 'rgb(60 190 230)', 'rgb(240 245 255)'];
  while (liste.length < 4) liste.push(liste[liste.length - 1]);
  return liste;
}

/**
 * Dieselbe Farbe, durchsichtig.
 *
 * Die Buehne liefert `rgb(r g b)` in der Schreibweise mit Leerzeichen; dort
 * gehoert Alpha hinter einen Schraegstrich. Hexfarben und die aeltere
 * Kommaschreibweise koennen aber genauso vorkommen - etwa aus einer
 * Abnahme -, deshalb werden alle drei behandelt.
 *
 * Der stille Fehler, den das verhindert: `'#8ad7ff' + '22'` ergibt zufaellig
 * eine gueltige Farbe, `'rgb(1 2 3)' + '22'` dagegen Unsinn. Wer nur mit
 * Hexfarben prueft, sieht den Unterschied nie.
 */
export function mitAlpha(farbe, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  if (typeof farbe !== 'string') return `rgb(255 255 255 / ${a})`;
  const t = farbe.trim();
  if (t.startsWith('#')) {
    // #rgb und #rrggbb - laengere Formen tragen ihr Alpha schon selbst.
    if (t.length === 4 || t.length === 7) {
      const hex = Math.round(a * 255).toString(16).padStart(2, '0');
      return t.length === 4
        ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}${hex}`
        : `${t}${hex}`;
    }
    return t;
  }
  /*
   * rgb() und hsl() gleich behandelt.
   *
   * hsl stand hier zuerst *nicht* drin, und der Fehler war im Bild sofort zu
   * sehen: Der Lichtpark baut seine Farben als hsl(), die Zeichenkette fiel
   * unten durch und kam *deckend* zurueck - also waren alle "durchsichtigen"
   * Farbstopps undurchsichtig, und aus jedem weichen Leuchtfleck wurde ein
   * hartes Quadrat.
   *
   * Genau die Fehlerklasse, fuer die es diese Datei gibt. Sie wiederholt sich,
   * sobald irgendwo eine neue Farbschreibweise dazukommt - deshalb faellt der
   * Rest jetzt nicht mehr stillschweigend durch, sondern wird gemeldet.
   */
  if (t.startsWith('rgb') || t.startsWith('hsl')) {
    const kopf = t.slice(0, t.indexOf('('));
    const inhalt = t.slice(t.indexOf('(') + 1, t.lastIndexOf(')'));
    const kern = inhalt.split('/')[0].trim();
    return `${kopf.replace(/a$/, '')}(${kern} / ${a})`;
  }
  if (typeof console !== 'undefined') {
    console.warn(`mitAlpha kennt die Schreibweise "${t}" nicht - sie kommt deckend zurueck.`);
  }
  return t;
}

/**
 * Helle, gesaettigte Farben fuer den Lichtpark.
 *
 * Der Lichtpark darf *nicht* die Farbtoene der Palette benutzen, und das ist
 * kein Geschmack, sondern folgt aus dem, was er darstellt.
 *
 * Die Palette ist absichtlich dunkel: Ein Mandala fuellt die ganze Leinwand,
 * und eine helle Flaeche dieser Groesse ueberstrahlt den Raum - nachgerechnet
 * in FARBWIRKUNG.md, wo das hellste Bild des ganzen Laufs nur ein Zehntel der
 * moeglichen Leuchtdichte erreicht.
 *
 * Ein Lichtpark ist das Gegenteil: fast alles bleibt schwarz, und was leuchtet,
 * sind schmale Kegel und kleine Punkte. Die *mittlere* Helligkeit bleibt damit
 * niedrig, auch wenn die Kegel hell sind - und ein Kegel, der nicht hell ist,
 * ist kein Licht, sondern ein grauer Fleck. Der erste Anlauf hat genau so
 * ausgesehen.
 *
 * Genommen werden deshalb die Farb*winkel* der Palette - die Identitaet des
 * Stuecks bleibt also erhalten - und daraus neue Farben mit hoher Saettigung
 * gebaut.
 */
export function lichtToene(palette) {
  const grund = typeof palette?.grundton === 'number' ? palette.grundton : 250;
  const akzent = typeof palette?.akzent === 'number' ? palette.akzent : 200;
  /*
   * 62 Prozent Helligkeit und 92 Prozent Saettigung. Darueber laufen die
   * Kanaele in die Saettigung und die Farbe kippt nach Weiss - was auf einer
   * Wand nach Baustellenlampe aussieht statt nach Buehnenlicht.
   */
  const t = (winkel, hell = 62, satt = 92) => `hsl(${((winkel % 360) + 360) % 360} ${satt}% ${hell}%)`;
  return [
    t(grund),
    t(grund + 18),
    t(akzent),
    // Der vierte ist der helle Akzent - der Blinder und die Duesen nehmen ihn.
    t(akzent, 86, 70),
  ];
}
