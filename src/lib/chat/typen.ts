import type { Gewerk, Prioritaet, VorgangStatus } from "@/lib/daten/typen";

/** Die Phasen des Gesprächs. Siehe src/lib/chat/maschine.ts für die Übergänge. */
export type Phase =
  | "begruessung"
  | "eingabe" // wartet auf Text oder Foto
  | "bestaetigung" // "Ist das korrekt?" – wartet auf Ja/Nein
  | "zweitfoto" // wartet auf das zweite Bild
  | "selbsthilfe" // Angebot zur Eigenreparatur
  | "selbsthilfeErgebnis"
  | "terminwahl"
  | "rueckrufGrund" // Worum geht es?
  | "rueckrufZeit" // Wann sind Sie erreichbar?
  | "frei"; // Meldung abgeschlossen, freies Gespräch

/** Eingebettete Karten im Chat – mehr als reiner Text. */
export type Karte =
  | { art: "sofortmassnahme"; text: string }
  | {
      art: "erkenntnis";
      vorher: string;
      nachher: string;
    }
  | {
      art: "klassifizierung";
      prioritaet: Prioritaet;
      gewerk: Gewerk;
      kategorie: string;
    }
  | { art: "status"; meldungen: Meldung[] }
  | {
      art: "anleitung";
      titel: string;
      dauerMinuten: number;
      material: string[];
      schritte: string[];
      videoUrl: string;
      abbruchHinweis?: string;
    }
  | { art: "kleinreparatur"; kostenEuro: number; grenzeEuro: number };

/**
 * Eine Schadensmeldung des Mieters.
 *
 * Ein Mieter kann mehrere gleichzeitig laufen haben – Heizung im Wohnzimmer
 * und tropfender Hahn in der Küche sind zwei Vorgänge. Die Statusanzeige
 * muss deshalb eine Liste zeigen und nicht einen einzelnen Zustand.
 */
export type Meldung = {
  /** Nur intern, bis die Vorgangsnummer aus der Datenbank zurückkommt. */
  id: string;
  szenarioId: string;
  /** Derselbe Titel wie im Dashboard – Mieter und Verwalter reden über dasselbe. */
  titel: string;
  /** Vorgangsnummer aus der Datenbank, sobald gespeichert. */
  nummer: number | null;
  /** Datenbank-ID des Vorgangs – nötig, um später Termine anzuhängen. */
  vorgangId: string | null;
  status: VorgangStatus;
  prioritaet: Prioritaet;
  betrieb: string | null;
  /** Was wann passiert ist – die Zeitleiste der Statusanzeige. */
  schritte: Meldungsschritt[];
};

export type Meldungsschritt = {
  /** Kurzer Text, z. B. "Meldung aufgenommen". */
  was: string;
  zeit: string;
};

export type ChatNachricht = {
  id: string;
  von: "mieter" | "ki";
  text?: string;
  /** Dateiname aus public/demo-fotos/ */
  foto?: string;
  fotoBeschriftung?: string;
  karte?: Karte;
  zeit: string;
  /** Nur bei eigenen Nachrichten: blaue Haken. */
  gelesen?: boolean;
};

/** Was der Mieter gerade tun kann. Steuert die Knopfleiste unter dem Verlauf. */
export type Angebot =
  | { art: "keins" }
  | { art: "eingabe" } // Freitext und Foto
  | { art: "bestaetigung" }
  | { art: "zweitfoto"; optionen: string[] }
  | { art: "selbsthilfe" }
  | { art: "selbsthilfeErgebnis" }
  | { art: "termin"; fenster: Terminfenster[] }
  | { art: "rueckrufGrund" }
  | { art: "rueckrufZeit" }
  | { art: "frei" }; // Freitext, Status, Rückruf

export type Terminfenster = {
  /** Anzeigetext, z. B. "Donnerstag, 24. Juli, 08:00–10:00 Uhr" */
  beschriftung: string;
  beginn: string;
  ende: string;
};

/** Was der Mieter zu seinem Rückrufwunsch angegeben hat. */
export type Rueckrufwunsch = {
  grundId: string;
  grundBezeichnung: string;
  zeitwunschId: string;
  zeitwunschBezeichnung: string;
};

export type ChatZustand = {
  phase: Phase;
  nachrichten: ChatNachricht[];
  angebot: Angebot;

  /** Szenario der Meldung, an der gerade gearbeitet wird. */
  szenarioId: string | null;
  /** Betrieb, für den der Auftrag vorbereitet wurde. */
  betrieb: string | null;
  /** Alle Meldungen dieses Mieters, neueste zuletzt. */
  meldungen: Meldung[];
  /** Wurde für die laufende Meldung ein Selbsthilfe-Tipp gezeigt? */
  selbsthilfeAngeboten: boolean;
  /** Wurde durch das zweite Foto eine Anfahrt gespart? */
  zweitanfahrtVermieden: boolean;
  /** Ein Fehlversuch beim zweiten Foto wird abgefangen, danach nicht mehr. */
  zweitfotoFehlversuche: number;
  /** Gewähltes Zeitfenster, für die Bestätigungstexte. */
  gewaehlterTermin: Terminfenster | null;
  /** Offener Rückrufwunsch, während der Mieter ihn zusammenstellt. */
  rueckruf: Partial<Rueckrufwunsch> | null;
};

/** Ereignisse, die der Mieter auslöst. */
export type ChatEreignis =
  | { art: "start" }
  | { art: "text"; text: string }
  | { art: "foto"; datei: string }
  | { art: "bestaetigung"; ja: boolean }
  | { art: "selbsthilfe"; annehmen: boolean }
  | { art: "selbsthilfeErfolg"; geklappt: boolean }
  | { art: "termin"; index: number }
  | { art: "rueckruf" }
  | { art: "rueckrufGrund"; grundId: string }
  | { art: "rueckrufZeit"; zeitwunschId: string }
  | { art: "status" }
  | { art: "neueMeldung" };

/** Eine vom Assistenten auszugebende Nachricht, samt Tippdauer davor. */
export type Ausgabe = {
  nachricht: Omit<ChatNachricht, "id" | "zeit" | "von">;
  /** Dauer des "tippt gerade…"-Indikators in Millisekunden. */
  tippdauer: number;
};

export type SchrittErgebnis = {
  zustand: ChatZustand;
  ausgabe: Ausgabe[];
};
