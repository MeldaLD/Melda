/**
 * Deterministischer Zufall.
 *
 * Die Beispieldaten müssen bei jedem Durchlauf identisch sein: Nur dann
 * erzeugt das Zurücksetzen wirklich denselben Ausgangszustand, und nur dann
 * lässt sich die Seed-Datei sinnvoll versionieren.
 *
 * Deshalb kein Math.random(), sondern ein aus einer Zeichenkette gesäter
 * Generator. Gleicher Text, gleiche Zahlenfolge – heute wie in einem Jahr.
 */

/** Streut eine Zeichenkette zu einem 32-Bit-Startwert (xmur3). */
function saatAusText(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** Kleiner, schneller Generator (mulberry32). */
function mulberry32(startwert: number): () => number {
  let a = startwert >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Zufall {
  private naechste: () => number;

  constructor(saat: string) {
    this.naechste = mulberry32(saatAusText(saat)());
  }

  /** Ganzzahl von min bis max, beide einschließlich. */
  zahl(min: number, max: number): number {
    return min + Math.floor(this.naechste() * (max - min + 1));
  }

  /** Ein Element aus der Liste. */
  wahl<T>(liste: readonly T[]): T {
    return liste[Math.floor(this.naechste() * liste.length)];
  }

  /** Trifft mit der angegebenen Wahrscheinlichkeit zu (0 bis 1). */
  trifft(wahrscheinlichkeit: number): boolean {
    return this.naechste() < wahrscheinlichkeit;
  }

  /** Kopie der Liste in zufälliger, aber reproduzierbarer Reihenfolge. */
  mischen<T>(liste: readonly T[]): T[] {
    const kopie = [...liste];
    for (let i = kopie.length - 1; i > 0; i--) {
      const j = Math.floor(this.naechste() * (i + 1));
      [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
    }
    return kopie;
  }
}

/**
 * Erzeugt eine UUID, die sich allein aus dem übergebenen Schlüssel ergibt.
 *
 * Dadurch bekommt derselbe Datensatz bei jedem Generatorlauf dieselbe ID.
 * Die Seed-Datei bleibt damit stabil, Verweise zwischen Tabellen stimmen, und
 * ein erneutes Einspielen ersetzt sauber die alten Zeilen.
 */
export function stabileUuid(schluessel: string): string {
  const saat = saatAusText(schluessel);
  const zufall = mulberry32(saat());
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    hex.push(
      Math.floor(zufall() * 256)
        .toString(16)
        .padStart(2, "0"),
    );
  }
  const b = hex.join("");
  // Version 4 und Variante setzen, damit es eine formal gültige UUID ist.
  const version = "4" + b.slice(13, 16);
  const variante =
    ((parseInt(b.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + b.slice(17, 20);
  return `${b.slice(0, 8)}-${b.slice(8, 12)}-${version}-${variante}-${b.slice(20, 32)}`;
}
