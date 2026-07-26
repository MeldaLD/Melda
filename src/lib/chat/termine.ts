import type { Terminfenster } from "./typen";

/**
 * Terminvorschläge für den Chat.
 *
 * DEMO: Es gibt keinen Kalenderabgleich mit dem Handwerksbetrieb. Die
 * Vorschläge sind die nächsten drei Werktagsfenster ab morgen. Beim echten
 * System kommen sie aus der Schnittstelle des jeweiligen Betriebs.
 */

const WOCHENTAGE = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];

const MONATE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

/** Nächster Werktag nach dem übergebenen Datum. */
function naechsterWerktag(ab: Date): Date {
  const tag = new Date(ab);
  do {
    tag.setDate(tag.getDate() + 1);
  } while (tag.getDay() === 0 || tag.getDay() === 6);
  return tag;
}

function beschriften(
  tag: Date,
  vonStunde: number,
  bisStunde: number,
  morgen: boolean,
): string {
  const datum = morgen
    ? "Morgen"
    : `${WOCHENTAGE[tag.getDay()]}, ${tag.getDate()}. ${MONATE[tag.getMonth()]}`;
  const zeit = `${String(vonStunde).padStart(2, "0")}:00–${String(bisStunde).padStart(2, "0")}:00 Uhr`;
  return `${datum}, ${zeit}`;
}

function fenster(
  tag: Date,
  vonStunde: number,
  bisStunde: number,
  morgen: boolean,
): Terminfenster {
  const beginn = new Date(tag);
  beginn.setHours(vonStunde, 0, 0, 0);
  const ende = new Date(tag);
  ende.setHours(bisStunde, 0, 0, 0);
  return {
    beschriftung: beschriften(tag, vonStunde, bisStunde, morgen),
    beginn: beginn.toISOString(),
    ende: ende.toISOString(),
  };
}

/** Drei Zeitfenster für den Handwerkertermin. */
export function handwerkerfenster(jetzt: Date = new Date()): Terminfenster[] {
  const tag1 = naechsterWerktag(jetzt);
  const tag2 = naechsterWerktag(tag1);
  const tag3 = naechsterWerktag(tag2);

  // "Morgen" nur, wenn der erste Werktag wirklich der Folgetag ist.
  const istMorgen = tag1.getDate() === new Date(jetzt.getTime() + 86_400_000).getDate();

  return [
    fenster(tag1, 8, 10, istMorgen),
    fenster(tag2, 14, 16, false),
    fenster(tag3, 10, 12, false),
  ];
}
