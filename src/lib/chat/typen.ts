import type { Gewerk, Prioritaet, VorgangStatus } from "@/lib/daten/typen";

/** Die Phasen des Gesprächs. Siehe src/lib/chat/maschine.ts für die Übergänge. */
export type Phase =
  | "begruessung"
  | "eingabe" // wartet auf Text oder Foto
  | "bestaetigung" // "Ist das korrekt?" – wartet auf Ja/Nein
  | "zweitfoto" // wartet auf das zweite Bild
  | "terminwahl"
  | "rueckrufwahl"
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
  | { art: "status"; status: VorgangStatus; nummer: number | null };

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
  | { art: "termin"; fenster: Terminfenster[] }
  | { art: "rueckruf"; fenster: Rueckruffenster[] }
  | { art: "frei" }; // Freitext, Status, Rückruf

export type Terminfenster = {
  /** Anzeigetext, z. B. "Donnerstag, 24. Juli, 08:00–10:00 Uhr" */
  beschriftung: string;
  beginn: string;
  ende: string;
};

export type Rueckruffenster = Terminfenster & {
  mitarbeiter: string;
  bereich: string;
};

export type ChatZustand = {
  phase: Phase;
  nachrichten: ChatNachricht[];
  angebot: Angebot;

  /** Laufendes Szenario, sobald erkannt. */
  szenarioId: string | null;
  /** Betrieb, an den weitergeleitet wurde. */
  betrieb: string | null;
  /** Stand der Meldung – speist die Fortschrittsanzeige. */
  status: VorgangStatus | null;
  /** Vorgangsnummer, sobald in der Datenbank angelegt. */
  nummer: number | null;
  /** Wurde durch das zweite Foto eine Anfahrt gespart? */
  zweitanfahrtVermieden: boolean;
  /** Ein Fehlversuch beim zweiten Foto wird abgefangen, danach nicht mehr. */
  zweitfotoFehlversuche: number;
  /** Gewähltes Zeitfenster, für die Bestätigungstexte. */
  gewaehlterTermin: Terminfenster | null;
};

/** Ereignisse, die der Mieter auslöst. */
export type ChatEreignis =
  | { art: "start" }
  | { art: "text"; text: string }
  | { art: "foto"; datei: string }
  | { art: "bestaetigung"; ja: boolean }
  | { art: "termin"; index: number }
  | { art: "rueckruf" }
  | { art: "rueckrufTermin"; index: number }
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
