/**
 * Wo ein Sprachmodell arbeitet – und wo ausdrücklich nicht.
 *
 * DIESE DATEI IST ZUM SELBST BEARBEITEN GEDACHT.
 *
 * Heute läuft der Chat vollständig auf hinterlegten Texten. Sobald die
 * Anbindung an die Modell-Schnittstelle steht, wird nicht alles davon durch
 * ein Modell ersetzt – das wäre teuer, langsamer und an mehreren Stellen
 * rechtlich heikel. Diese Datei hält fest, welcher Schritt welchen Weg geht,
 * und ist zugleich die Vorlage für die Umsetzung.
 *
 * DIE REGEL, AUS DER SICH ALLES ANDERE ERGIBT
 *
 *   Der Assistent darf verstehen und formulieren.
 *   Entscheiden und behaupten darf er nicht.
 *
 * Verstehen heißt: aus einem Freitext das Anliegen erkennen, aus einem Foto
 * lesen, was fehlt. Formulieren heißt: eine feststehende Aussage in die
 * Worte dieses Gesprächs bringen. Entscheiden und behaupten heißt: Fristen
 * nennen, Kosten zusagen, Rechtslagen erklären, Termine versprechen. Das
 * bleibt bei hinterlegten Texten und bei Menschen.
 *
 * WARUM DIESE GRENZE UND KEINE ANDERE
 *
 * 1. Recht. Ob eine KI-Antwort eine Rechtsdienstleistung im Sinne des § 2
 *    RDG ist, ist in Deutschland ungeklärt; die Grenze zwischen allgemeiner
 *    Information und Beratung im Einzelfall verläuft fließend, und es kommt
 *    allein auf den tatsächlichen Inhalt an – nicht auf Haftungsausschlüsse
 *    und nicht auf die technische Bauweise. Ein hinterlegter, einmal
 *    geprüfter Satz zur Kleinreparaturklausel bleibt deshalb hinterlegt.
 *    Ein frei erzeugter Satz zu genau derselben Frage wäre ein Risiko, das
 *    die Hausverwaltung trägt, nicht wir.
 * 2. Vertrauen. Der Mieter merkt sofort, wenn eine Zusage nicht hält. Alles,
 *    was nach außen wie ein Versprechen klingt, muss deshalb aus einer
 *    Quelle kommen, die niemand improvisiert.
 * 3. Kosten. Der Großteil aller Meldungen läuft über Knöpfe. Dafür ein
 *    Modell zu fragen, kostet Geld und Zeit für eine Antwort, die ohnehin
 *    feststeht.
 *
 * DIE GESTUFTE ARCHITEKTUR
 *
 * Das ist der Standardaufbau für so etwas: klassifizieren mit einem
 * günstigen Modell, erst danach – und nur wo nötig – ein größeres. Wer
 * jeden Schritt an das teuerste Modell gibt, zahlt ein Vielfaches für
 * dieselbe Qualität.
 */

/** Was ein Schritt kostet und wer ihn erledigt. */
export type Stufe = {
  id: string;
  bezeichnung: string;
  /**
   * Modellkennung. null bedeutet: kein Modellaufruf, der Text steht in der
   * Konfiguration.
   */
  modell: string | null;
  /** Preis je Million Token, Stand Juli 2026. */
  preis: { eingabe: number; ausgabe: number } | null;
  begruendung: string;
};

export const stufen: Stufe[] = [
  {
    id: "skript",
    bezeichnung: "Hinterlegter Text",
    modell: null,
    preis: null,
    begruendung:
      "Kein Modellaufruf. Alles, was jedes Mal gleich lauten muss und was " +
      "eine Zusage enthält – Rechtslage, Kosten, Fristen, Bestätigungen.",
  },
  {
    id: "verstehen",
    bezeichnung: "Verstehen",
    modell: "claude-haiku-4-5",
    preis: { eingabe: 1, ausgabe: 5 },
    begruendung:
      "Ordnet Freitext einem unserer Themen zu und liest heraus, was darin " +
      "an Fakten steckt. Die Antwort ist eine Kennung aus unserer Liste, " +
      "kein Text an den Mieter – deshalb genügt das kleinste Modell.",
  },
  {
    id: "sehen",
    bezeichnung: "Bild auswerten",
    modell: "claude-opus-5",
    preis: { eingabe: 5, ausgabe: 25 },
    begruendung:
      "Der einzige Schritt, der ein Foto verlässt. Hier entscheidet sich, " +
      "ob dem Betrieb etwas fehlt – das ist unser Verkaufsargument und die " +
      "Stelle, an der Qualität vor Preis geht.",
  },
  {
    id: "formulieren",
    bezeichnung: "Formulieren",
    modell: "claude-sonnet-5",
    preis: { eingabe: 3, ausgabe: 15 },
    begruendung:
      "Bringt eine feststehende Aussage in die Worte dieses Gesprächs und " +
      "fasst den Vorgang für die Verwaltung zusammen. Der Inhalt kommt aus " +
      "der Konfiguration, frei ist nur die Formulierung.",
  },
  {
    id: "mensch",
    bezeichnung: "Mensch",
    modell: null,
    preis: null,
    begruendung:
      "Konflikt, Kündigung, Geld über der Grenze, oder das Modell ist sich " +
      "nicht sicher. Kein Modell entscheidet sich selbst für diesen Weg – " +
      "die Regeln dafür stehen in config/demo.ts und config/anliegen.ts.",
  },
];

export const stufeNach = new Map(stufen.map((s) => [s.id, s]));

/**
 * Ob ein Schritt heute aus Vorsatz oder aus Ermangelung der Schnittstelle
 * hinterlegt ist. Genau diese Unterscheidung soll die Demo zeigen.
 */
export type Stand =
  /** Bleibt für immer ein hinterlegter Text. */
  | "endgueltig"
  /** Ist heute hinterlegt, wird mit der Schnittstelle ein Modellaufruf. */
  | "vorlaeufig";

export type Einsatz = {
  schritt: string;
  /** Kennung aus stufen – wohin der Schritt gehört, wenn alles steht. */
  stufe: string;
  stand: Stand;
  /**
   * Was das Modell zu sehen bekommt. Leer, wo kein Aufruf stattfindet.
   *
   * Bewusst knapp gehalten: Was hier nicht steht, geht auch nicht raus.
   */
  daten?: string;
  hinweis: string;
};

export const einsaetze: Einsatz[] = [
  {
    schritt: "Begrüßung und Themenauswahl",
    stufe: "skript",
    stand: "endgueltig",
    hinweis:
      "Sieben Knöpfe. Ein Modell zu fragen, welcher davon gemeint ist, wäre " +
      "Geld für eine Antwort, die der Mieter schon gegeben hat.",
  },
  {
    schritt: "Freitext einem Thema zuordnen",
    stufe: "verstehen",
    stand: "vorlaeufig",
    daten: "Der Text des Mieters. Kein Name, keine Anschrift, keine Nummer.",
    hinweis:
      "Heute eine Stichwortsuche über config/scenarios.ts. Sie trifft die " +
      "klaren Fälle und scheitert an allem, was anders formuliert ist – " +
      "genau dafür ist das Modell da.",
  },
  {
    schritt: "Foto auswerten und Diagnose stellen",
    stufe: "sehen",
    stand: "vorlaeufig",
    daten: "Das Foto und der bisherige Gesprächsverlauf. Keine Anschrift.",
    hinweis:
      "Heute hinterlegter Text je Kachel; es findet keine Bildanalyse statt. " +
      "Der sichtbare Hinweis „Bild wird ausgewertet“ hält den Platz frei, " +
      "an dem später wirklich etwas passiert.",
  },
  {
    schritt: "Entscheiden, ob ein zweites Foto etwas bringt",
    stufe: "sehen",
    stand: "vorlaeufig",
    hinweis:
      "Heute eine Regel je Szenario (siehe config/scenarios.ts). Später " +
      "beantwortet das Modell dieselbe Frage am konkreten Bild: Fehlt etwas, " +
      "das bestimmt, was der Betrieb einpackt?",
  },
  {
    schritt: "Auskunft zu Abrechnung, Vertrag, Hausordnung",
    stufe: "skript",
    stand: "endgueltig",
    hinweis:
      "Fristen, Rechte, Pflichten. Hier ist die Grenze zur Rechtsberatung " +
      "im Einzelfall fließend, und der Inhalt zählt, nicht der Hinweis " +
      "darunter. Diese Texte schreibt ein Mensch und liest ein Mensch gegen.",
  },
  {
    schritt: "Kleinreparatur und Selbsthilfe",
    stufe: "skript",
    stand: "endgueltig",
    hinweis:
      "Eine Kostenaussage an den Mieter. Sie muss stimmen und jedes Mal " +
      "gleich lauten – siehe config/kleinreparaturen.ts.",
  },
  {
    schritt: "Antwort an den Mieter in seine Worte bringen",
    stufe: "formulieren",
    stand: "vorlaeufig",
    daten: "Der hinterlegte Kernsatz und der Gesprächsverlauf. Kein Klarname.",
    hinweis:
      "Der Inhalt bleibt der hinterlegte. Das Modell darf umformulieren, " +
      "nicht ergänzen – was nicht im Kernsatz steht, darf nicht in der " +
      "Antwort stehen.",
  },
  {
    schritt: "Zusammenfassung des Vorgangs für die Verwaltung",
    stufe: "formulieren",
    stand: "vorlaeufig",
    daten: "Gesprächsverlauf und Diagnose. Empfänger ist die Verwaltung.",
    hinweis:
      "Hier darf frei formuliert werden: Der Leser ist Fachmann, kann das " +
      "Original daneben lesen und trägt die Entscheidung ohnehin selbst.",
  },
  {
    schritt: "Nachricht an den Handwerksbetrieb",
    stufe: "formulieren",
    stand: "vorlaeufig",
    daten: "Auftragsdaten und Diagnose. Der Name des Mieters bleibt hier.",
    hinweis:
      "Heute aus Bausteinen (config/abstimmung.ts). Der Terminlink und die " +
      "Zeitfenster bleiben in jedem Fall hinterlegt – ein Modell darf keine " +
      "Zeiten erfinden.",
  },
  {
    schritt: "Terminbestätigung und Zusagen",
    stufe: "skript",
    stand: "endgueltig",
    hinweis:
      "Was der Betrieb genannt und der Mieter gewählt hat, wird zitiert, " +
      "nicht formuliert.",
  },
  {
    schritt: "Freigabe über der Kostengrenze",
    stufe: "mensch",
    stand: "endgueltig",
    hinweis:
      "Die Grenze setzt die Verwaltung, die Entscheidung trifft sie. Ein " +
      "Modell bereitet vor und legt vor – mehr nicht.",
  },
];

/**
 * Was das Modell nie zu sehen bekommt.
 *
 * Kein Haftungsausschluss, sondern eine Bauvorschrift: Diese Felder werden
 * vor dem Aufruf entfernt und danach lokal wieder eingesetzt. Für die
 * Hausverwaltung ist das die Antwort auf die erste Frage, die sie stellen
 * wird – „was schicken Sie von meinen Mietern wohin?“
 */
export const bleibtHier = [
  "Name des Mieters – ersetzt durch „der Mieter“",
  "Anschrift und Wohnungsnummer – ersetzt durch „die Wohnung“",
  "Telefonnummer und E-Mail-Adresse",
  "Bankverbindung und Zahlungsstände",
  "Alles aus anderen Vorgängen desselben Hauses",
];

/**
 * Grobe Kostenrechnung je Vorgang.
 *
 * DEMO: Geschätzte Tokenmengen, keine Messung – die gibt es erst mit der
 * Schnittstelle. Die Größenordnung stimmt, und darum geht es hier: Der
 * Vergleichswert ist nicht ein anderes Modell, sondern die zwanzig Minuten,
 * die dieselbe Meldung am Telefon kostet.
 */
export const kostenschaetzung = {
  posten: [
    { stufe: "verstehen", eingabeToken: 1500, ausgabeToken: 50, anzahl: 1 },
    { stufe: "sehen", eingabeToken: 3000, ausgabeToken: 300, anzahl: 2 },
    { stufe: "formulieren", eingabeToken: 2000, ausgabeToken: 400, anzahl: 2 },
  ],

  /**
   * Wiederholte Anweisungen zahlt man nur einmal.
   *
   * Der Systemtext ist bei jedem Aufruf derselbe; zwischengespeichert kostet
   * er beim Lesen etwa ein Zehntel. Ein Fallstrick dabei: Der Zwischenspeicher
   * greift erst ab einer Mindestlänge, und die ist je Modell verschieden –
   * bei Haiku 4.5 sind es 4096 Token, bei Opus 5 nur 512. Ein kurzer
   * Klassifikationsprompt wird also stillschweigend gar nicht gespeichert.
   */
  zwischenspeicherFaktor: 0.35,
};
