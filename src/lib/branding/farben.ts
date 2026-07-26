/**
 * Ableitung des Mandanten-Farbschemas aus einer einzigen Primärfarbe.
 *
 * Der Vertrieb pflegt im Admin nur "Primärfarbe" (und optional eine
 * Sekundärfarbe) als Hex-Wert. Alles Weitere – Hover-Zustand, Textfarbe auf
 * der Marke, sanfte Flächen, Randfarbe – wird hier berechnet.
 *
 * Gerechnet wird in OKLCH, nicht in HSL: OKLCH ist wahrnehmungsbezogen
 * gleichabständig. Eine Helligkeitsänderung um 0,06 sieht bei einem dunklen
 * Blau genauso stark aus wie bei einem hellen Orange. Mit HSL bekämen wir
 * bei manchen Kundenfarben unbrauchbare Ergebnisse.
 *
 * Ausgegeben werden fertige CSS-Werte (`oklch(...)`), die alle aktuellen
 * Browser nativ verstehen – keine Rückrechnung nach Hex nötig.
 */

export type Oklch = { l: number; c: number; h: number };

const HEX_MUSTER = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Maximale Helligkeit der Markenfarbe als Flächenfarbe.
 *  Verhindert, dass ein sehr helles Kundengelb weiße Schrift unlesbar macht. */
const MAX_L_FLAECHE = 0.72;
/** Minimale Helligkeit – ein fast schwarzes Firmenblau soll noch als Farbe wirken. */
const MIN_L_FLAECHE = 0.28;

export function hexIstGueltig(hex: string): boolean {
  return HEX_MUSTER.test(hex.trim());
}

function hexZuRgb(hex: string): [number, number, number] {
  let wert = hex.trim().replace("#", "");
  if (wert.length === 3) {
    wert = wert
      .split("")
      .map((z) => z + z)
      .join("");
  }
  const zahl = parseInt(wert, 16);
  return [(zahl >> 16) & 255, (zahl >> 8) & 255, zahl & 255];
}

/** sRGB (0–255) -> lineares RGB (0–1) */
function linearisieren(kanal: number): number {
  const v = kanal / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Hex -> OKLCH. Referenz: Björn Ottosson, "A perceptual color space for image
 *  processing" (2020). */
export function hexZuOklch(hex: string): Oklch {
  const [r8, g8, b8] = hexZuRgb(hex);
  const r = linearisieren(r8);
  const g = linearisieren(g8);
  const b = linearisieren(b8);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const chroma = Math.sqrt(okA * okA + okB * okB);
  let hue = (Math.atan2(okB, okA) * 180) / Math.PI;
  if (hue < 0) hue += 360;

  return { l: okL, c: chroma, h: hue };
}

function css({ l, c, h }: Oklch): string {
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`;
}

function begrenzen(wert: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, wert));
}

export type MarkenPalette = {
  /** Die Kundenfarbe unverändert – für Logo-Akzente und Diagramme. */
  "--marke-rein": string;
  /** Flächentaugliche Markenfarbe (Helligkeit begrenzt). */
  "--marke": string;
  /** Hover-/Aktiv-Zustand: eine Spur dunkler. */
  "--marke-hover": string;
  /** Text-/Icon-Farbe auf der Markenfläche – automatisch hell oder dunkel. */
  "--marke-kontrast": string;
  /** Sehr helle Tönung für Hinterlegungen, z. B. aktive Menüeinträge. */
  "--marke-sanft": string;
  /** Dezente Randfarbe, passend zur Marke. */
  "--marke-rand": string;
  /** Sekundärfarbe für Diagramme und zweitrangige Akzente. */
  "--marke-zweit": string;
};

/**
 * Erzeugt die CSS-Variablen für einen Mandanten.
 * Das Ergebnis wird als `style`-Attribut auf das Layout-Element gesetzt –
 * dadurch ist die Färbung schon im vom Server gelieferten HTML enthalten und
 * es gibt kein sichtbares Umfärben nach dem Laden.
 */
export function markenPalette(
  primaerHex: string,
  sekundaerHex?: string | null,
): MarkenPalette {
  const roh = hexIstGueltig(primaerHex)
    ? hexZuOklch(primaerHex)
    : { l: 0.45, c: 0.09, h: 245 };

  const basis: Oklch = {
    l: begrenzen(roh.l, MIN_L_FLAECHE, MAX_L_FLAECHE),
    // Sehr grelle Farben leicht zurücknehmen – wirkt in der Fläche seriöser.
    c: Math.min(roh.c, 0.19),
    h: roh.h,
  };

  // Weiße Schrift ist ab etwa L 0,62 nicht mehr sicher lesbar.
  const kontrast: Oklch =
    basis.l > 0.62
      ? { l: 0.22, c: Math.min(basis.c, 0.04), h: basis.h }
      : { l: 0.99, c: 0, h: 0 };

  const zweit =
    sekundaerHex && hexIstGueltig(sekundaerHex) ? hexZuOklch(sekundaerHex) : null;

  return {
    "--marke-rein": css(roh),
    "--marke": css(basis),
    "--marke-hover": css({ ...basis, l: begrenzen(basis.l - 0.06, 0.18, 1) }),
    "--marke-kontrast": css(kontrast),
    "--marke-sanft": css({ l: 0.965, c: Math.min(basis.c, 0.028), h: basis.h }),
    "--marke-rand": css({ l: 0.885, c: Math.min(basis.c, 0.05), h: basis.h }),
    "--marke-zweit": zweit
      ? css({
          l: begrenzen(zweit.l, MIN_L_FLAECHE, MAX_L_FLAECHE),
          c: Math.min(zweit.c, 0.19),
          h: zweit.h,
        })
      : // Ohne Sekundärfarbe: harmonischer Nachbarton der Primärfarbe.
        css({
          l: begrenzen(basis.l + 0.1, 0.28, 0.8),
          c: basis.c * 0.6,
          h: (basis.h + 32) % 360,
        }),
  };
}
