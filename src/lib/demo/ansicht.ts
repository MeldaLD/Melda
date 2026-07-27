/**
 * Beispieldaten ausblenden oder zeigen.
 *
 * Reine Funktionen, kein Datenbank- und kein Next-Bezug – damit sie sich
 * einzeln prüfen lassen. Wer sie aufruft, steht in src/lib/daten/quelle.ts.
 *
 * Die Trennlinie ist die Spalte ist_seed: Was der Generator oder die
 * Seed-Datei angelegt hat, ist true; was während einer Vorführung durch den
 * Chat entstanden ist, ist false.
 */

import type { Ansicht, Mandantenbestand } from "@/lib/daten/typen";

/** Name des Cookies, das die Entscheidung des Betrachters hält. */
export const BEISPIELE_COOKIE = "melda_beispiele";

export function cookieName(slug: string): string {
  return `${BEISPIELE_COOKIE}_${slug}`;
}

const echt = (zeile: { ist_seed: boolean }) => !zeile.ist_seed;

/**
 * Blendet die Beispieldaten aus.
 *
 * Gefiltert wird nur, was einen Fall beschreibt: Vorgänge, Nachrichten,
 * Verlauf, Freigaben, Termine. Objekte, Einheiten, Mitarbeiter, Betriebe und
 * Zeitfenster bleiben stehen – das sind die Stammdaten der Hausverwaltung.
 * Ohne sie hätte der Chat niemanden, in dessen Namen er meldet, und die
 * Übersicht sähe nicht aufgeräumt aus, sondern kaputt.
 */
export function ohneBeispiele(bestand: Mandantenbestand): Mandantenbestand {
  return {
    ...bestand,
    vorgaenge: bestand.vorgaenge.filter(echt),
    nachrichten: bestand.nachrichten.filter(echt),
    verlauf: bestand.verlauf.filter(echt),
    freigaben: bestand.freigaben.filter(echt),
    termine: bestand.termine.filter(echt),
  };
}

/**
 * Entscheidet, welcher Bestand angezeigt wird, und beschreibt die Lage für
 * die Umschaltleiste.
 *
 * @param umschaltbar Nur mit schreibfähiger Datenbank sinnvoll. Im
 *   Vorschaubetrieb kann der Chat nichts anlegen; eine leere Übersicht wäre
 *   dort kein Aha-Moment, sondern eine Sackgasse.
 */
export function ansichtWaehlen(
  bestand: Mandantenbestand,
  optionen: {
    umschaltbar: boolean;
    beispieleGewuenscht: boolean;
    ausblendenVoreingestellt: boolean;
    alleDaten?: boolean;
  },
): { bestand: Mandantenbestand; ansicht: Ansicht } {
  const eigene = bestand.vorgaenge.filter(echt).length;
  const ausgeblendet = bestand.vorgaenge.length - eigene;

  const nurEigene =
    optionen.umschaltbar &&
    optionen.ausblendenVoreingestellt &&
    !optionen.beispieleGewuenscht &&
    !optionen.alleDaten;

  return {
    bestand: nurEigene ? ohneBeispiele(bestand) : bestand,
    ansicht: {
      nurEigene,
      // Ohne ausgeblendete Beispiele gibt es nichts zu laden, und ohne
      // Schreibrecht nichts, was sich je davon abheben würde.
      umschaltbar:
        optionen.umschaltbar &&
        optionen.ausblendenVoreingestellt &&
        ausgeblendet > 0 &&
        !optionen.alleDaten,
      eigene,
      ausgeblendet,
    },
  };
}
