/**
 * Der Beispielmandant.
 *
 * Dient zwei Zwecken:
 *  1. Vorlage für das Seed-Skript und für neue Mandanten im Admin.
 *  2. Rückfalldatensatz, wenn keine Datenbank erreichbar ist – damit die
 *     Demo auch dann läuft (siehe src/lib/daten/quelle.ts).
 *
 * Kassel ist bewusst eine echte Stadt mit echten Straßennamen. Beim Anlegen
 * eines Kundenmandanten werden die Objektnamen durch Straßen aus dessen Stadt
 * ersetzt – ein Hausverwalter erkennt sein Viertel sofort, und genau das
 * macht den Unterschied zwischen "Demo" und "meine Demo".
 */

import type { HandwerkerVorlage, MitarbeiterVorlage } from "@/lib/daten/typen";

export type MandantVorlage = {
  slug: string;
  firma: string;
  stadt: string;
  plz: string;
  primaerfarbe: string;
  sekundaerfarbe: string | null;
  ansprechpartner: string;
  objektNamen: string[];
  mitarbeiter: MitarbeiterVorlage[];
  handwerker: HandwerkerVorlage[];
};

export const MUSTER_MANDANT: MandantVorlage = {
  slug: "muster",
  firma: "Muster Hausverwaltung GmbH",
  stadt: "Kassel",
  plz: "34119",
  primaerfarbe: "#1F4E79",
  sekundaerfarbe: "#2F7D8C",
  ansprechpartner: "Herr Peter Muster",

  objektNamen: [
    "Wilhelmshöher Allee 112",
    "Holländische Straße 47",
    "Ludwig-Mond-Straße 8",
    "Germaniastraße 23",
  ],

  mitarbeiter: [
    { name: "Andrea Wilke", rolle: "Objektbetreuung", bereich: "technik" },
    { name: "Thomas Reinhardt", rolle: "Buchhaltung", bereich: "buchhaltung" },
    { name: "Sabine Groß", rolle: "WEG-Verwaltung", bereich: "weg" },
    { name: "Kevin Bartsch", rolle: "Assistenz", bereich: "allgemein" },
  ],

  // "abstimmungErlaubt" heißt: Der Betrieb hat zugesagt, dass der Assistent
  // Termine direkt mit ihm abstimmen darf. Bewusst nicht bei allen – so ist
  // in der Vorführung beides zu sehen: der Betrieb, den die Verwaltung selbst
  // anruft, und der, bei dem nur noch das Ergebnis bestätigt wird.
  handwerker: [
    {
      firma: "Sanitär Krause GmbH",
      gewerk: "sanitaer",
      reaktionszeit_h: 4,
      bewertung: 4.6,
      ansprechpartner: "Frau Krause",
      kontaktKanal: "whatsapp",
      abstimmungErlaubt: true,
      arbeitszeiten: "Mo–Do 7–16 Uhr, Fr 7–13 Uhr",
    },
    {
      firma: "Heizungsbau Nolte",
      gewerk: "heizung",
      reaktionszeit_h: 8,
      bewertung: 4.3,
      ansprechpartner: "Herr Nolte",
      kontaktKanal: "email",
      abstimmungErlaubt: true,
      arbeitszeiten: "Mo–Fr 8–17 Uhr",
    },
    {
      firma: "Elektro Sander & Sohn",
      gewerk: "elektro",
      reaktionszeit_h: 12,
      bewertung: 4.8,
      ansprechpartner: "Herr Sander",
    },
    {
      firma: "Malerbetrieb Ziegler",
      gewerk: "maler",
      reaktionszeit_h: 48,
      bewertung: 4.1,
    },
    {
      firma: "Tischlerei Hanke",
      gewerk: "schreiner",
      reaktionszeit_h: 36,
      bewertung: 4.5,
    },
    {
      firma: "Gebäudereinigung Vogt",
      gewerk: "reinigung",
      reaktionszeit_h: 24,
      bewertung: 4.0,
    },
    {
      firma: "Schlüsseldienst Kassel 24",
      gewerk: "schluesseldienst",
      reaktionszeit_h: 1,
      bewertung: 3.9,
    },
  ],
};

/** Ab wann ein Vorgang in der SLA-Ampel rot wird (Stunden seit Eingang). */
export const SLA_STANDARD = {
  notfall: 4,
  dringend: 48,
  routine: 120,
} as const;
