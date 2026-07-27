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
  /**
   * Ereignisse, die die Station abschließen. Siehe src/lib/tour/ereignisse.ts
   *
   * Mehrere, weil es mehrere richtige Wege gibt: Ein Schaden lässt sich mit
   * einem Foto melden oder in eigenen Worten beschreiben. Beides ist erledigt.
   */
  erledigtBei: string[];
  /**
   * Ereignisse, nach denen diese Station gegenstandslos ist.
   *
   * Nicht jede Meldung braucht eine Nachfrage. Wenn der Assistent keine
   * stellt, darf die Tour nicht weiter "senden Sie das zweite Foto" fordern –
   * sie sagt kurz, warum das hier entfällt, und geht weiter.
   */
  entfaelltBei?: string[];
  /** Der Satz dazu. Pflicht, sobald entfaelltBei gesetzt ist. */
  entfaellt?: string;
  /**
   * Ereignisse, nach denen der Betrachter erkennbar einen anderen Weg geht.
   *
   * Dann hält die Tour an, statt eine Aufgabe stehen zu lassen, die sich
   * nicht mehr erfüllen lässt. Sie meldet sich von selbst zurück, sobald die
   * Stelle wieder da ist, um die es geht.
   */
  pausiertBei?: string[];
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
    // Ein Foto ist der schnellere Weg, aber nicht der einzige: Wer den
    // Schaden tippt, hat die Aufgabe genauso erfüllt.
    erledigtBei: ["chat:foto-gesendet", "chat:meldung-begonnen"],
    // Der Einstieg bietet sieben Themen an, und nur eines führt hierher.
    // Wer nach der Nebenkostenabrechnung fragt, macht nichts falsch – die
    // Tour hat hier nur nichts mehr zu sagen.
    pausiertBei: ["chat:kein-schaden"],
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
    erledigtBei: ["chat:erkenntnis"],
    // Müllraum, verstopfter Abfluss, Notfall: Hier fragt der Assistent nicht
    // nach, und das ist Absicht. Die Tour macht daraus lieber ein Argument,
    // als eine unerfüllbare Aufgabe stehen zu lassen.
    entfaelltBei: ["chat:ohne-nachfrage"],
    entfaellt:
      "Hier fragt der Assistent nicht nach – bei dieser Meldung bringt ein " +
      "zweites Foto dem Betrieb nichts. Dass er nicht immer nachfragt, macht " +
      "die Nachfrage glaubwürdig, wenn sie kommt.",
    // Wer der Diagnose widerspricht, beschreibt den Schaden neu. Bis dahin
    // gibt es nichts zu bestätigen.
    pausiertBei: ["chat:korrektur"],
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
    erledigtBei: ["verwalter:vorgang-geoeffnet"],
  },
];

/**
 * Die ausführliche Tour durch die Verwaltersicht.
 *
 * Die kurze Tour beantwortet eine Frage: Was ändert sich für meine Mieter?
 * Diese hier beantwortet die andere, die im Verkaufsgespräch danach kommt:
 * Was ändert sich für mich – und was gebe ich dabei aus der Hand?
 *
 * Sie ist länger, und das ist in Ordnung. Die Regel, dass Touren ab fünf
 * Schritten abgebrochen werden, gilt für aufgedrängte Touren. Diese hier
 * wählt der Betrachter ausdrücklich, und wer sie wählt, will Einzelheiten.
 *
 * Jede Station benennt die Entlastung, nicht die Funktion. "Grenzen" ist
 * eine Funktion; "einmal entscheiden statt bei jedem Auftrag neu" ist der
 * Grund, warum jemand dafür bezahlt.
 */
export const detailStationen: TourStation[] = [
  {
    id: "ausnahmen",
    aufgabe: "Öffnen Sie den ersten Punkt, der Ihre Aufmerksamkeit braucht.",
    begruendung:
      "Diese Liste ist die ganze Idee: Hier steht nur, was abweicht. Alles Übrige läuft, ohne dass Sie es ansehen müssen.",
    pfad: "dashboard",
    markierung: "ausnahme-ansehen",
    erledigtBei: ["verwalter:vorgang-geoeffnet"],
    uebergang:
      "Sie sind jetzt in einem einzelnen Vorgang. Alles, was dazu passiert " +
      "ist, steht untereinander – Meldung, Fotos, Auftrag, Rückfragen, " +
      "Termin. Kein Suchen in WhatsApp, E-Mail und Notizzettel.",
  },
  {
    id: "eingreifen",
    aufgabe: "Öffnen Sie unten rechts „Ich möchte eingreifen“.",
    begruendung:
      "Ihre Kontrollpflicht lässt sich nicht mit auslagern. Deshalb halten Sie jeden Vorgang mit einem Klick an – oder geben ihn ausdrücklich frei.",
    pfad: "dashboard/vorgaenge",
    markierung: "eingreifen-knopf",
    erledigtBei: ["verwalter:eingreifen-geoeffnet"],
  },
  {
    id: "grenze",
    aufgabe: "Setzen Sie den Betrag, ab dem wir Sie fragen, und speichern Sie.",
    begruendung:
      "Einmal entscheiden statt bei jedem Auftrag neu. Darunter beauftragen wir, darüber legen wir Ihnen vor.",
    pfad: "dashboard/grenzen",
    markierung: "grenze-feld",
    erledigtBei: ["verwalter:grenze-gespeichert"],
    uebergang:
      "Daneben steht sofort, wie viele Vorgänge der letzten Wochen mit " +
      "dieser Grenze auf Ihrem Tisch gelandet wären. Die Einstellung ist " +
      "damit keine Zahl, sondern eine Entscheidung mit sichtbarer Folge.",
  },
  {
    id: "nachweis",
    aufgabe: "Sehen Sie sich den Nachweis an.",
    begruendung:
      "Was Sie sonst für den Eigentümer zusammensuchen – wer hat wann was gemeldet, was hat es gekostet, wie lange hat es gedauert – steht hier fertig.",
    pfad: "dashboard/nachweis",
    erledigtBei: ["verwalter:nachweis-geoeffnet"],
  },
  {
    id: "hintergrund",
    aufgabe: "Zum Schluss: was im Hintergrund läuft.",
    begruendung:
      "Freigaben, Terminabstimmung mit den Betrieben, Rückrufe, Postfach. Das ist die Arbeit, für die Sie sonst jemanden einstellen müssten.",
    pfad: "leitstand",
    erledigtBei: ["verwalter:leitstand-geoeffnet"],
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
    weiter: "Selbst umschauen",
    /**
     * Die Weggabelung.
     *
     * Vorher gab es einen Hauptknopf und darunter Kleingedrucktes. Wer an
     * dieser Stelle überzeugt ist, will sprechen; wer noch prüft, will
     * Einzelheiten; wer sich nicht drängen lassen mag, will in Ruhe klicken.
     * Alle drei sind gute Ausgänge, also stehen sie gleichrangig nebeneinander
     * und nicht einer davon versteckt.
     */
    wege: {
      detail: "Alles im Einzelnen ansehen",
      detailHinweis:
        "Fünf Stationen durch Ihre Sicht: was Ihnen abgenommen wird, was auf " +
        "Ihrem Tisch landet und was Sie in der Hand behalten.",
    },
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

  /**
   * Der Abschluss der ausführlichen Tour.
   *
   * Kein zweites "kurz zusammengefasst": Wer bis hierhin gekommen ist, hat
   * alles gesehen und braucht keine Wiederholung, sondern einen Satz dazu,
   * was jetzt sinnvoll wäre.
   */
  detailAbschluss: {
    titel: "Das war alles Wesentliche",
    text:
      "Sie haben jetzt beide Seiten gesehen: wie eine Meldung hereinkommt " +
      "und was davon bei Ihnen ankommt. Wie das mit Ihren Objekten, Ihren " +
      "Betrieben und Ihren Abläufen aussieht, klären wir am besten im " +
      "Gespräch – zwanzig Minuten genügen.",
    weiter: "Schließen",
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

  /**
   * Wenn der Betrachter einen anderen Weg geht.
   *
   * Eine Vorführung, die auf einer Aufgabe beharrt, die sich gerade nicht
   * erfüllen lässt, wird zum Ärgernis – und ausgerechnet in dem Moment, in
   * dem der Kunde von selbst etwas ausprobiert. Also tritt die Tour zur
   * Seite, ohne sich zu verabschieden, und kommt zurück, sobald die Stelle
   * wieder da ist, um die es geht.
   */
  angehalten: {
    titel: "Tour angehalten",
    text:
      "Sie sind gerade woanders unterwegs – sehen Sie sich in Ruhe um. " +
      "Sobald es an dieser Stelle weitergeht, melde ich mich wieder.",
    weiter: "Nächster Schritt",
  },
} as const;
