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
  /**
   * Was zwischen dieser und der nächsten Station passiert – wird in der
   * Pause nach "Erledigt" gezeigt.
   *
   * Der Grund: Zwischen der Meldung und der Grenze liegt genau das, worum es
   * eigentlich geht – wir beauftragen, stimmen ab, halten den Mieter auf dem
   * Laufenden. Ohne diesen Satz springt die Tour von einem Foto zu einer
   * Einstellung, und der Betrachter fragt sich zu Recht, was dazwischen
   * passiert sein soll. Ein Satz statt einer vierten Station: Drei Schritte
   * werden zu rund 72 Prozent abgeschlossen, ab fünf fällt die Quote steil.
   */
  uebergang?: string;
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
    // Bestätigung und zweites Foto liegen an derselben Stelle über dem
    // Eingabefeld – der Hinweis wandert also nicht, sondern bleibt dort
    // stehen, wo geantwortet wird.
    markierung: "antwort-knopf",
    erledigtBei: "chat:erkenntnis",
    uebergang:
      "Ab hier übernehmen wir: Auftrag an den Betrieb, Termin abstimmen, " +
      "Mieter informieren. Sie bekommen davon nur das Ergebnis zu sehen.",
  },
  {
    // Die dritte Station hat zwei Vorgänger: erst eine Einzelfreigabe, dann
    // das Einstellen der Kostengrenze. Beide waren Bedienung von etwas, das
    // der Betrachter noch gar nicht kennt – eine Zahl einzutippen erklärt
    // nichts. Hier soll er stattdessen den Bogen schließen: dieselbe Meldung,
    // die er eben als Mieter geschrieben hat, liegt fertig aufbereitet auf
    // seinem Tisch. Dass sich die Grenze einstellen lässt, gehört in die
    // Zusammenfassung am Ende, nicht in eine Aufgabe.
    id: "wiedersehen",
    aufgabe: "Wechseln Sie in Ihre Sicht und öffnen Sie Ihre Meldung.",
    begruendung:
      "Dieselbe Meldung, die Sie eben als Mieter geschrieben haben – aufbereitet, eingeordnet und schon unterwegs.",
    pfad: "dashboard/vorgaenge",
    markierung: "vorgang-zeile",
    erledigtBei: "verwalter:vorgang-geoeffnet",
  },
];

export const tourTexte = {
  /**
   * Der Einstieg beschreibt erst die Welt des Betrachters und den Ärger
   * darin, dann erst das Produkt.
   *
   * Vorführungen scheitern selten an fehlenden Funktionen, sondern daran,
   * dass niemand den Konflikt benennt, den sie lösen. Wer mit "ich zeige
   * Ihnen drei Funktionen" beginnt, bekommt Höflichkeit; wer mit "so läuft
   * es heute bei Ihnen" beginnt, bekommt Aufmerksamkeit.
   */
  begruessung: {
    titel: "Kennen Sie das?",
    text:
      "Ein Mieter ruft an, Sie notieren mit. Der Handwerker fährt hin, und " +
      "vor Ort fehlt etwas – falsche Maße, falsches Material, keiner da. " +
      "Also fährt er noch einmal. Rund jeder dritte Auftrag läuft so. " +
      "Drei Schritte, dann wissen Sie, was sich daran ändert.",
    starten: "Zeigen Sie es mir",
    ablehnen: "Lieber allein umsehen",
  },

  /**
   * Der Abschluss ist keine Verabschiedung, sondern die Bilanz: was geht weg,
   * was bleibt, was fehlt noch – und ein konkreter nächster Schritt. Eine
   * Vorführung, die mit "danke fürs Ansehen" endet, endet folgenlos.
   */
  abschluss: {
    titel: "Kurz zusammengefasst",
    text:
      "Ihre Mieter melden über WhatsApp, wir fragen nach, was dem Handwerker " +
      "sonst fehlt, beauftragen den Betrieb und stimmen den Termin ab.",
    weiter: "Weiter umsehen",
    /**
     * Bis hierhin zeigt die Übersicht nur, was der Betrachter selbst gemeldet
     * hat – sonst wäre im Gewimmel der Beispieldaten nicht zu erkennen, dass
     * der Chat sie füllt. Jetzt ist der Zusammenhang gesehen, und der volle
     * Bestand wird interessant: So sieht ein Arbeitstag aus.
     */
    beispiele: {
      hinweis:
        "Ihre Übersicht zeigt gerade nur den Vorgang, den Sie eben selbst " +
        "gemeldet haben. Wenn Sie sehen möchten, wie ein voller Arbeitstag " +
        "aussieht, laden Sie zwei Wochen Beispieldaten dazu.",
      knopf: "Beispieldaten dazuladen",
    },
    /** Führt in den Leitstand, damit sichtbar wird, wohin die Arbeit wandert. */
    leitstand: "Zeigen, was im Hintergrund läuft",
  },

  leiste: {
    ueberspringen: "Tour beenden",
    schritt: (aktuell: number, gesamt: number) => `Schritt ${aktuell} von ${gesamt}`,
    erledigt: "Erledigt",
    /**
     * Steht über jedem Hinweis der Tour.
     *
     * Der Hinweiskasten sieht aus wie ein Teil der Oberfläche, wenn ihn nichts
     * als Beiwerk ausweist – und dann sucht der Betrachter den Knopf, den es
     * gar nicht gibt. Ein Wort in der Demofarbe genügt, um beides zu trennen.
     */
    kennzeichen: "Vorführung",
  },
} as const;
