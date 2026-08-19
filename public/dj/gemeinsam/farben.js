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
  if (t.startsWith('rgb')) {
    // Alles zwischen den Klammern nehmen und ein vorhandenes Alpha abschneiden.
    const inhalt = t.slice(t.indexOf('(') + 1, t.lastIndexOf(')'));
    const kern = inhalt.split('/')[0].trim();
    return `rgb(${kern} / ${a})`;
  }
  return t;
}
