/**
 * Die geführte Tour.
 *
 * Der Normalfall ist nicht die Live-Vorführung, sondern jemand, der abends
 * allein auf einen Link in einer E-Mail klickt. Diese Person muss ohne uns
 * an die drei Stellen kommen, die den Unterschied machen.
 *
 * WARUM DIE TOUR SO GEBAUT IST
 *
 * Aus der Praxis von Produkt-Touren ist gut belegt:
 *
 *   - Touren, bei denen der Betrachter selbst etwas tut, werden zu rund
 *     72 Prozent abgeschlossen. Touren, die nur auf Funktionen zeigen, zu
 *     etwa 16 Prozent. Deshalb hat hier jede Station eine Handlung, und
 *     weiter geht es erst, wenn sie ausgeführt wurde – nicht per Klick auf
 *     "Weiter".
 *   - Bei drei Schritten liegt die Abschlussquote bei etwa 72 Prozent, ab
 *     fünf Schritten fällt sie steil. Deshalb drei Stationen, nicht sieben.
 *   - Überspringen muss jederzeit und sichtbar möglich sein. Eine Tour, die
 *     man nicht loswird, kostet den Termin, statt ihn zu bringen.
 *
 * Die Texte hier sind zum Ändern gedacht.
 */

export type TourStation = {
  id: string;
  /** Kurz und konkret – das ist die Aufgabe, nicht die Erklärung. */
  aufgabe: string;
  /** Ein Satz dazu, warum das der Blick wert ist. */
  begruendung: string;
  /**
   * Wo die Station stattfindet, relativ zu /demo/<slug>/. Passt der Pfad
   * nicht, führt die Tour zuerst dorthin.
   */
  pfad: string;
  /**
   * Element, das hervorgehoben wird. Muss im Markup ein passendes
   * data-tour-Attribut tragen. Leer lassen, wenn es nichts zu markieren gibt.
   */
  markierung?: string;
  /** Ereignis, das die Station abschließt. Siehe src/lib/tour/ereignisse.ts */
  erledigtBei: string;
};

export const tourStationen: TourStation[] = [
  {
    id: "melden",
    aufgabe: "Melden Sie einen Schaden und senden Sie ein Foto.",
    begruendung:
      "So sieht es für Ihre Mieter aus. Keine App, keine Anmeldung, kein Portal.",
    pfad: "chat",
    markierung: "foto-knopf",
    erledigtBei: "chat:foto-gesendet",
  },
  {
    id: "nachfrage",
    aufgabe: "Bestätigen Sie die Diagnose und senden Sie das zweite Foto.",
    begruendung:
      "Jetzt kommt der Punkt, um den es geht: Rund 30 Prozent aller Aufträge brauchen eine zweite Anfahrt, weil bei der Aufnahme etwas fehlte.",
    pfad: "chat",
    erledigtBei: "chat:erkenntnis",
  },
  {
    // Die dritte Station war früher eine Freigabe. Das war richtig, solange
    // die Verwaltung jeden Auftrag einzeln entschied – inzwischen übernehmen
    // wir die Abstimmung, und die eigentliche Botschaft ist eine andere:
    // Nicht "Sie entscheiden jeden Fall", sondern "Sie setzen die Grenze und
    // sehen nur noch, was abweicht".
    id: "kontrolle",
    aufgabe: "Wechseln Sie in Ihre Sicht und stellen Sie Ihre Grenze ein.",
    begruendung:
      "Sie entscheiden einmal, bis wohin wir ohne Rückfrage handeln – statt jeden Auftrag einzeln freizugeben.",
    pfad: "dashboard/grenzen",
    markierung: "grenze-feld",
    erledigtBei: "verwalter:grenze-gesehen",
  },
];

export const tourTexte = {
  begruessung: {
    titel: "Drei Minuten, drei Stationen",
    text:
      "Ich zeige Ihnen die drei Stellen, an denen sich diese Lösung von " +
      "einem Portal unterscheidet. Sie klicken selbst – lesen können Sie " +
      "hinterher.",
    starten: "Los geht's",
    ablehnen: "Lieber allein umsehen",
  },

  abschluss: {
    titel: "Das war der Kern",
    text:
      "Ihre Mieter melden über WhatsApp, wir fragen nach, was dem Handwerker " +
      "sonst fehlt, und stimmen den Termin direkt mit dem Betrieb ab. Sie " +
      "behalten den Überblick und die Kontrolle – die Kleinarbeit haben wir. " +
      "Wie das im Hintergrund aussieht, sehen Sie in unserem Leitstand.",
    weiter: "Weiter umsehen",
  },

  leiste: {
    ueberspringen: "Tour beenden",
    schritt: (aktuell: number, gesamt: number) => `Schritt ${aktuell} von ${gesamt}`,
    erledigt: "Erledigt",
  },
} as const;
