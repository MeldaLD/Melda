/**
 * Womit ein Mieter ankommt – und was zuerst versucht wird.
 *
 * DIESE DATEI IST ZUM SELBST BEARBEITEN GEDACHT.
 *
 * Der Chat beginnt nicht mit „Beschreiben Sie den Schaden". Die meisten
 * Mieter kommen mit etwas anderem: einer Frage zur Abrechnung, zum Vertrag,
 * zum Nachbarn. Wer nur Schadensmeldungen anbietet, bekommt trotzdem alles
 * andere – nur unsortiert und im Freitext.
 *
 * Die Reihenfolge unten ist Absicht: Zu jedem Thema steht zuerst eine
 * Antwort, die das Anliegen ohne Anruf erledigt. Der Rückruf ist der letzte
 * Ausweg, nicht der erste Knopf.
 *
 * Warum das nicht Geiz ist, sondern für beide besser:
 *   - Der Mieter hat sein Ergebnis sofort, statt auf einen Werktag zu warten.
 *   - Die Verwaltung führt das Gespräch nicht, das sie diese Woche zum
 *     zwölften Mal geführt hätte.
 * Beides fällt weg, sobald die Antwort nicht wirklich hilft – deshalb wird
 * jedes Mal gefragt, ob es gereicht hat, und der Rückruf steht offen.
 */

import type { Fachbereich } from "@/lib/daten/typen";

export type Anliegen = {
  id: string;
  /** Beschriftung des Knopfes im Chat. */
  bezeichnung: string;
  /**
   * Führt direkt in die Schadensaufnahme statt in eine Auskunft.
   * Nur beim Thema "kaputt".
   */
  istSchaden?: boolean;
  /** Die Antwort, mit der es meistens erledigt ist. */
  auskunft?: string;
  /**
   * Was der Mieter konkret tun kann. Erscheint als Liste unter der Antwort –
   * ein Absatz Fließtext wird auf dem Telefon nicht gelesen.
   */
  schritte?: string[];
  /** Zuordnungsvorschlag, falls doch ein Rückruf daraus wird. */
  bereichVorschlag: Fachbereich;
};

export const anliegen: Anliegen[] = [
  {
    id: "schaden",
    bezeichnung: "Etwas ist kaputt oder undicht",
    istSchaden: true,
    bereichVorschlag: "technik",
  },
  {
    id: "abrechnung",
    bezeichnung: "Frage zur Nebenkostenabrechnung",
    auskunft:
      "Die Abrechnung für das vergangene Jahr geht bis spätestens 31. Dezember " +
      "an alle Mieter – dazu müssen Sie nichts tun. Wenn Sie eine bereits " +
      "erhaltene Abrechnung nicht nachvollziehen können, dürfen Sie die Belege " +
      "einsehen; das lässt sich in aller Regel ohne Termin klären.",
    schritte: [
      "Sagen Sie mir kurz, welche Position unklar ist – dann hole ich die Erläuterung dazu.",
      "Falls Sie Belegeinsicht möchten: Ich melde das der Verwaltung, Sie bekommen die Unterlagen digital.",
      "Ihre Frist für einen Widerspruch läuft zwölf Monate ab Zugang – es eilt also nicht.",
    ],
    bereichVorschlag: "buchhaltung",
  },
  {
    id: "zahlung",
    bezeichnung: "Miete, Zahlung oder Mahnung",
    auskunft:
      "Zahlungen laufen über die Buchhaltung. Die häufigsten Fälle kann ich " +
      "Ihnen direkt abnehmen – für alles Weitere gebe ich es dorthin weiter.",
    schritte: [
      // Die Richtung war hier einmal umgekehrt: Der Mieter sollte seine neue
      // IBAN schicken. Das ergibt in Deutschland keinen Sinn – die Miete
      // läuft über einen Dauerauftrag, den der Mieter selbst einrichtet, und
      // nicht über einen Einzug der Verwaltung. Gebraucht wird also die
      // Bankverbindung der Verwaltung, nicht die des Mieters.
      "Bankverbindung für Ihren Dauerauftrag: Ich zeige Ihnen Empfänger, IBAN und den Verwendungszweck, den Sie angeben müssen.",
      "Mahnung erhalten, obwohl gezahlt: Schicken Sie mir den Zahlungsbeleg als Foto, dann klären wir das ohne Anruf.",
      // Vorher stand hier nur „Sie brauchen mehr Zeit“ – Zeit wofür, war
      // nicht zu erkennen.
      "Sie können eine Forderung gerade nicht in voller Höhe zahlen: Nennen Sie mir den Betrag und bis wann Sie ihn aufbringen können. Ich lege der Verwaltung eine Ratenzahlung vor.",
    ],
    bereichVorschlag: "buchhaltung",
  },
  {
    id: "haus",
    bezeichnung: "Hausordnung, Lärm oder Nachbarn",
    auskunft:
      "Bei Lärm und Nachbarschaft bringt das direkte Gespräch erfahrungsgemäß " +
      "schneller Ruhe als ein Schreiben der Verwaltung – und es lässt sich " +
      "danach immer noch eskalieren.",
    schritte: [
      "Halten Sie fest, wann es zu laut war (Datum, Uhrzeit, wie lange). Das brauchen wir, falls es weitergeht.",
      "Sprechen Sie die Nachbarn einmal an, wenn Sie sich damit wohlfühlen.",
      "Bleibt es dabei: Schreiben Sie mir die Notizen – die Verwaltung geht dann förmlich vor.",
    ],
    bereichVorschlag: "allgemein",
  },
  {
    id: "vertrag",
    bezeichnung: "Mietvertrag, Kündigung oder Nachmieter",
    auskunft:
      "Vertragliches läuft schriftlich, damit es für beide Seiten belastbar " +
      "ist. Sie können den ersten Schritt aber hier machen.",
    schritte: [
      "Kündigung: Schreiben Sie mir das Wunschdatum, ich lege den Vorgang an und die Verwaltung bestätigt Ihnen die Frist.",
      "Nachmieter: Nennen Sie mir Name und Kontakt, dann meldet sich die Verwaltung dort direkt.",
      "Untervermietung oder Änderungen brauchen eine Genehmigung – schildern Sie es mir, ich hole sie ein.",
    ],
    bereichVorschlag: "allgemein",
  },
  {
    id: "stand",
    bezeichnung: "Stand einer laufenden Meldung",
    auskunft:
      "Den kann ich Ihnen sofort zeigen – dafür brauchen Sie niemanden zu " +
      "erreichen.",
    bereichVorschlag: "technik",
  },
  {
    id: "sonstiges",
    bezeichnung: "Etwas anderes",
    auskunft:
      "Schreiben Sie mir einfach, worum es geht. Vieles kann ich direkt " +
      "beantworten, und wenn nicht, sorge ich dafür, dass sich jemand meldet.",
    bereichVorschlag: "allgemein",
  },
];

export const anliegenNach = new Map(anliegen.map((a) => [a.id, a]));

/** Themen, zu denen es eine Auskunft gibt – alles außer der Schadensmeldung. */
export const anliegenMitAuskunft = anliegen.filter((a) => !a.istSchaden);
