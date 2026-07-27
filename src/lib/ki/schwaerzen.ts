/**
 * Was das Modell nicht zu sehen bekommt.
 *
 * Die Liste in config/ki-einsatz.ts (bleibtHier) ist das Versprechen an die
 * Hausverwaltung. Diese Datei ist seine Einlösung: Bevor ein Text das Haus
 * verlässt, laufen diese Muster darüber.
 *
 * Bewusst ohne Modellaufruf und ohne Bibliothek – eine Schwärzung, die selbst
 * ein Modell fragt, hätte den Text schon herausgegeben. Bewusst auch ohne
 * Namenserkennung: Die würde bei jedem zweiten deutschen Nachnamen daneben
 * greifen ("Herr Schön", "die Wand ist schön"). Namen kennen wir aus der
 * Datenbank, und die geben wir schlicht nicht mit – der Freitext des Mieters
 * enthält den eigenen Namen so gut wie nie.
 *
 * Grenzen, offen benannt: Dies fängt Kontaktdaten und Bankverbindungen. Wer
 * seinen Namen in den Fließtext schreibt, ist damit nicht geschützt. Deshalb
 * bekommt das Modell auch nur den einen Satz und nicht den ganzen Verlauf.
 */

/** Ein Muster und der Platzhalter, der an seine Stelle tritt. */
type Regel = { name: string; muster: RegExp; ersatz: string };

const regeln: Regel[] = [
  {
    name: "E-Mail-Adresse",
    muster: /[\w.+-]+@[\w-]+\.[\w.-]+/g,
    ersatz: "[E-Mail]",
  },
  {
    name: "IBAN",
    muster: /\b[A-Z]{2}\d{2}[\s]?(?:[A-Za-z0-9]{4}[\s]?){2,7}[A-Za-z0-9]{1,4}\b/g,
    ersatz: "[IBAN]",
  },
  {
    // Deutsche Rufnummern in den üblichen Schreibweisen. Mindestens sieben
    // Ziffern, damit Hausnummern, Beträge und Jahreszahlen stehen bleiben.
    name: "Telefonnummer",
    muster: /(?:\+49|0)[\d\s/().-]{7,}\d/g,
    ersatz: "[Telefon]",
  },
];

export type Schwaerzung = {
  text: string;
  /** Welche Arten von Angaben entfernt wurden – für die Technikansicht. */
  entfernt: string[];
};

export function schwaerzen(text: string): Schwaerzung {
  const entfernt: string[] = [];
  let ergebnis = text;

  for (const regel of regeln) {
    if (!regel.muster.test(ergebnis)) continue;
    // Ein globales Muster merkt sich seine Position; ohne dieses Zurücksetzen
    // findet der nächste Aufruf die erste Fundstelle nicht mehr.
    regel.muster.lastIndex = 0;
    ergebnis = ergebnis.replace(regel.muster, regel.ersatz);
    regel.muster.lastIndex = 0;
    entfernt.push(regel.name);
  }

  return { text: ergebnis, entfernt };
}

/**
 * Kürzt einen Text auf eine vertretbare Länge.
 *
 * Nicht aus Sparsamkeit, sondern gegen Missbrauch: Ohne Obergrenze könnte
 * jeder, der den Demo-Link hat, beliebig lange Texte auf unsere Rechnung
 * durch ein Modell schicken.
 */
export function kuerzen(text: string, hoechstens = 1200): string {
  return text.length <= hoechstens ? text : `${text.slice(0, hoechstens)} …`;
}
