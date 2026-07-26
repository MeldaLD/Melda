/**
 * Gründe, aus denen ein Mieter um Rückruf bittet.
 *
 * Der Mieter wählt nur das Thema. Wer tatsächlich zurückruft – zuständige
 * Sachbearbeitung, Urlaubsvertretung, Springer – entscheidet die Verwaltung
 * im Dashboard. Das ist bewusst so:
 *
 *   Wir kennen die interne Aufgabenverteilung eines Kunden nicht, und sie
 *   ändert sich täglich. Ein Chat, der dem Mieter feste Termine bei
 *   namentlich genannten Mitarbeitenden anbietet, verspricht etwas, das wir
 *   nicht halten können – und wirkt für einen Verwalter, der seinen Betrieb
 *   kennt, sofort unglaubwürdig.
 *
 * `bereichVorschlag` ist deshalb ausdrücklich nur ein Vorschlag. Er erscheint
 * im Dashboard als Zuordnungshilfe und ist dort jederzeit überschreibbar.
 */

import type { Fachbereich } from "@/lib/daten/typen";

export type RueckrufGrund = {
  id: string;
  /** Was der Mieter im Chat liest. */
  bezeichnung: string;
  /** Interner Zuordnungsvorschlag für das Dashboard. */
  bereichVorschlag: Fachbereich;
};

export const rueckrufGruende: RueckrufGrund[] = [
  {
    id: "abrechnung",
    bezeichnung: "Nebenkosten- oder Heizkostenabrechnung",
    bereichVorschlag: "buchhaltung",
  },
  {
    id: "zahlung",
    bezeichnung: "Miete, Zahlung oder Mahnung",
    bereichVorschlag: "buchhaltung",
  },
  {
    id: "schaden",
    bezeichnung: "Frage zu einer Reparatur oder Meldung",
    bereichVorschlag: "technik",
  },
  {
    id: "vertrag",
    bezeichnung: "Mietvertrag, Kündigung oder Nachmieter",
    bereichVorschlag: "allgemein",
  },
  {
    id: "haus",
    bezeichnung: "Hausordnung oder Nachbarschaft",
    bereichVorschlag: "allgemein",
  },
  {
    id: "sonstiges",
    bezeichnung: "Etwas anderes",
    bereichVorschlag: "allgemein",
  },
];

export const grundNach = new Map(rueckrufGruende.map((g) => [g.id, g]));

/** Grobe Erreichbarkeit. Kein gebuchter Termin – nur eine Präferenz. */
export type Zeitwunsch = {
  id: string;
  bezeichnung: string;
};

export const zeitwuensche: Zeitwunsch[] = [
  { id: "vormittag", bezeichnung: "Vormittags (8–12 Uhr)" },
  { id: "nachmittag", bezeichnung: "Nachmittags (12–17 Uhr)" },
  { id: "egal", bezeichnung: "Jederzeit" },
];

export const zeitwunschNach = new Map(zeitwuensche.map((z) => [z.id, z]));
