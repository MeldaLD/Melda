import type { MitarbeiterVorlage } from "@/lib/daten/typen";
import { FACHBEREICH_BEZEICHNUNG } from "@/lib/daten/typen";
import type { Rueckruffenster, Terminfenster } from "./typen";

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

/**
 * Rückruffenster der Verwaltung, verteilt auf die Mitarbeitenden.
 * Die Zuordnung nach Fachbereich macht sichtbar, dass hinter der Buchung ein
 * durchdachtes Team steht und nicht eine anonyme Warteschleife.
 */
export function rueckruffenster(
  mitarbeiter: MitarbeiterVorlage[],
  jetzt: Date = new Date(),
): Rueckruffenster[] {
  const auswahl = mitarbeiter.length
    ? mitarbeiter
    : [{ name: "Hausverwaltung", rolle: "Service", bereich: "allgemein" as const }];

  const tag1 = naechsterWerktag(jetzt);
  const tag2 = naechsterWerktag(tag1);
  const istMorgen = tag1.getDate() === new Date(jetzt.getTime() + 86_400_000).getDate();

  const zeiten: [Date, number, number, boolean][] = [
    [tag1, 9, 10, istMorgen],
    [tag1, 15, 16, istMorgen],
    [tag2, 11, 12, false],
  ];

  return zeiten.map(([tag, von, bis, morgen], index) => {
    const person = auswahl[index % auswahl.length];
    return {
      ...fenster(tag, von, bis, morgen),
      mitarbeiter: person.name,
      bereich: FACHBEREICH_BEZEICHNUNG[person.bereich],
    };
  });
}
