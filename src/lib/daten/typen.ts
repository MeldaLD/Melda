/**
 * Domänentypen der Anwendung.
 *
 * Handgepflegt und bewusst nah am SQL-Schema in supabase/migrations gehalten.
 * Wer die exakten, aus der Datenbank abgeleiteten Typen möchte:
 *   npm run typen:datenbank
 * (setzt eine verknüpfte Supabase-CLI voraus, siehe README)
 */

export type Prioritaet = "notfall" | "dringend" | "routine";

export type VorgangStatus =
  | "neu"
  | "in_pruefung"
  | "an_handwerker"
  | "termin_vereinbart"
  | "in_arbeit"
  | "erledigt"
  | "storniert";

export type Gewerk =
  | "sanitaer"
  | "heizung"
  | "elektro"
  | "schluesseldienst"
  | "maler"
  | "schreiner"
  | "reinigung"
  | "dach"
  | "sonstiges";

export type Kanal = "whatsapp" | "email" | "telefon";
export type NachrichtRichtung = "mieter" | "ki" | "verwalter" | "handwerker";
export type FreigabeTyp =
  "handwerkerauftrag" | "mieter_antwort" | "zahlungserinnerung" | "terminbestaetigung";
export type FreigabeStatus = "offen" | "freigegeben" | "abgelehnt";
export type TerminTyp = "rueckruf" | "handwerkertermin";
export type TerminStatus = "geplant" | "bestaetigt" | "abgesagt" | "erledigt";
export type Fachbereich = "technik" | "buchhaltung" | "weg" | "allgemein";

/** Beschriftungen für die Oberfläche – an einer Stelle, damit sie überall gleich sind. */
export const GEWERK_BEZEICHNUNG: Record<Gewerk, string> = {
  sanitaer: "Sanitär",
  heizung: "Heizung",
  elektro: "Elektro",
  schluesseldienst: "Schlüsseldienst",
  maler: "Maler",
  schreiner: "Schreiner",
  reinigung: "Reinigung",
  dach: "Dach",
  sonstiges: "Sonstiges",
};

export const PRIORITAET_BEZEICHNUNG: Record<Prioritaet, string> = {
  notfall: "Notfall",
  dringend: "Dringend",
  routine: "Routine",
};

export const STATUS_BEZEICHNUNG: Record<VorgangStatus, string> = {
  neu: "Neu",
  in_pruefung: "Wartet auf Freigabe",
  an_handwerker: "An Handwerker",
  termin_vereinbart: "Termin vereinbart",
  in_arbeit: "In Arbeit",
  erledigt: "Erledigt",
  storniert: "Storniert",
};

export const FREIGABE_TYP_BEZEICHNUNG: Record<FreigabeTyp, string> = {
  handwerkerauftrag: "Handwerkerauftrag",
  mieter_antwort: "Antwort an Mieter",
  zahlungserinnerung: "Zahlungserinnerung",
  terminbestaetigung: "Terminbestätigung",
};

export const FACHBEREICH_BEZEICHNUNG: Record<Fachbereich, string> = {
  technik: "Technik",
  buchhaltung: "Buchhaltung",
  weg: "WEG-Verwaltung",
  allgemein: "Allgemein",
};

/** Reihenfolge der Statusstufen für die Fortschrittsanzeige beim Mieter. */
export const MIETER_FORTSCHRITT: { status: VorgangStatus[]; beschriftung: string }[] = [
  { status: ["neu", "in_pruefung"], beschriftung: "Aufgenommen" },
  { status: ["an_handwerker"], beschriftung: "An Handwerker" },
  { status: ["termin_vereinbart", "in_arbeit"], beschriftung: "Termin vereinbart" },
  { status: ["erledigt"], beschriftung: "Erledigt" },
];

// --- Datensätze ------------------------------------------------------------

export type Mandant = {
  id: string;
  slug: string;
  firma: string;
  logo_url: string | null;
  primaerfarbe: string;
  sekundaerfarbe: string | null;
  ansprechpartner: string | null;
  stadt: string;
  objekt_namen: string[];
  mitarbeiter: MitarbeiterVorlage[];
  handwerker: HandwerkerVorlage[];
  einstellungen: MandantEinstellungen;
  ablaufdatum: string | null;
  aufrufe: number;
  ist_aktiv: boolean;
  erstellt_am: string;
};

/** Vorlagen aus dem JSON-Feld des Mandanten – Eingabe für den Generator. */
export type MitarbeiterVorlage = {
  name: string;
  rolle: string;
  bereich: Fachbereich;
};

export type HandwerkerVorlage = {
  firma: string;
  gewerk: Gewerk;
  reaktionszeit_h?: number;
  bewertung?: number;
  ansprechpartner?: string;
  email?: string;
  kontaktKanal?: Kanal;
  /** Betrieb hat der direkten Terminabstimmung zugestimmt. */
  abstimmungErlaubt?: boolean;
  arbeitszeiten?: string;
};

export type MandantEinstellungen = {
  /** Ab wann ein Vorgang in der SLA-Ampel rot wird, je Priorität (Stunden). */
  sla_stunden?: Partial<Record<Prioritaet, number>>;
  /** Wird bei Notfällen zusätzlich telefonisch alarmiert? */
  notfall_telefon?: string | null;
  /** Höchstbetrag der Kleinreparaturklausel je Einzelfall, in Euro. */
  kleinreparatur_grenze_euro?: number;
  /**
   * Freigabearten, die künftig ohne Nachfrage erteilt werden.
   * Wird im Freigabe-Center gesetzt und wirkt auf neu entstehende Vorgänge.
   */
  automatik_freigaben?: FreigabeTyp[];
  /** Freitext, erscheint in den Einstellungen des Dashboards. */
  hinweis?: string;
};

export type Objekt = {
  id: string;
  tenant_id: string;
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  einheiten_anzahl: number;
  sortierung: number;
};

export type Einheit = {
  id: string;
  tenant_id: string;
  objekt_id: string;
  bezeichnung: string;
  mieter_name: string;
  mieter_telefon: string | null;
};

export type Mitarbeiter = {
  id: string;
  tenant_id: string;
  name: string;
  initialen: string;
  rolle: string;
  bereich: Fachbereich;
  sortierung: number;
};

export type Handwerker = {
  id: string;
  tenant_id: string;
  firma: string;
  gewerk: Gewerk;
  telefon: string | null;
  reaktionszeit_h: number;
  bewertung: number;
  ist_standard: boolean;
  ansprechpartner: string | null;
  email: string | null;
  /** Über welchen Weg der Betrieb angesprochen werden möchte. */
  kontakt_kanal: Kanal;
  /** Betrieb hat der direkten Terminabstimmung zugestimmt. */
  abstimmung_erlaubt: boolean;
  /** Übliche Arbeitszeiten als Freitext, z. B. "Mo–Do 7–16 Uhr". */
  arbeitszeiten: string | null;
};

export type Zeitfenster = {
  id: string;
  tenant_id: string;
  mitarbeiter_id: string;
  wochentag: number;
  von: string;
  bis: string;
};

export type Vorgang = {
  id: string;
  tenant_id: string;
  nummer: number;
  einheit_id: string | null;
  szenario_id: string | null;
  titel: string;
  kategorie: string;
  gewerk: Gewerk;
  prioritaet: Prioritaet;
  status: VorgangStatus;
  ki_zusammenfassung: string | null;
  quelle: Kanal;
  mitarbeiter_id: string | null;
  handwerker_id: string | null;
  sla_frist: string | null;
  zweitanfahrt_vermieden: boolean;
  /** Geschätzte Kosten eines Handwerkereinsatzes. */
  kosten_schaetzung_euro: number | null;
  /** Dem Mieter wurde eine Selbsthilfe-Anleitung angeboten. */
  selbsthilfe_angeboten: boolean;
  /** Vom Mieter selbst behoben – Handwerkereinsatz entfallen. */
  selbsthilfe_erfolgreich: boolean;
  ist_seed: boolean;
  erstellt_am: string;
  erledigt_am: string | null;
};

export type Nachricht = {
  id: string;
  tenant_id: string;
  vorgang_id: string | null;
  einheit_id: string | null;
  /** Gesetzt bei Nachrichten an oder von einem Handwerksbetrieb. */
  handwerker_id: string | null;
  richtung: NachrichtRichtung;
  kanal: Kanal;
  text: string;
  foto_id: string | null;
  meta: Record<string, unknown> | null;
  ist_seed: boolean;
  gesendet_am: string;
  gelesen_am: string | null;
};

export type VorgangVerlauf = {
  id: string;
  tenant_id: string;
  vorgang_id: string;
  ereignis: string;
  beschreibung: string;
  akteur: string;
  ist_seed: boolean;
  zeitpunkt: string;
};

export type Freigabe = {
  id: string;
  tenant_id: string;
  vorgang_id: string | null;
  typ: FreigabeTyp;
  titel: string;
  begruendung: string;
  entwurf_text: string;
  empfaenger: string | null;
  status: FreigabeStatus;
  entschieden_am: string | null;
  entschieden_von: string | null;
  regel_automatisch: boolean;
  ist_seed: boolean;
  erstellt_am: string;
};

export type Termin = {
  id: string;
  tenant_id: string;
  vorgang_id: string | null;
  typ: TerminTyp;
  titel: string;
  mitarbeiter_id: string | null;
  handwerker_id: string | null;
  einheit_id: string | null;
  /** Bei Rückrufen zunächst leer – die Verwaltung terminiert im Dashboard. */
  beginn: string | null;
  ende: string | null;
  status: TerminStatus;
  /** Nur bei Rückrufen: das vom Mieter gewählte Thema. */
  grund: string | null;
  /** Nur bei Rückrufen: vormittag | nachmittag | egal */
  zeitwunsch: string | null;
  /** Zuordnungsvorschlag aus dem Thema, im Dashboard überschreibbar. */
  bereich_vorschlag: Fachbereich | null;
  ist_seed: boolean;
};

export type TerminanfrageStatus = "offen" | "beantwortet" | "bestaetigt" | "abgelaufen";

/** Ein Zeitfenster, das der Betrieb vorgeschlagen hat. */
export type Terminvorschlag = { beginn: string; ende: string };

/**
 * Der Link an einen Handwerksbetrieb: drei Vorschläge ohne Anmeldung.
 * Siehe supabase/migrations/…_terminanfragen.sql
 */
export type Terminanfrage = {
  id: string;
  tenant_id: string;
  vorgang_id: string;
  handwerker_id: string;
  token: string;
  status: TerminanfrageStatus;
  vorschlaege: Terminvorschlag[];
  gewaehlt: number | null;
  wunsch_beginn: string | null;
  wunsch_ende: string | null;
  ist_seed: boolean;
  erstellt_am: string;
  beantwortet_am: string | null;
  gueltig_bis: string;
};

/** Vollständiger Datenbestand eines Mandanten – Ergebnis des Generators. */
export type Mandantenbestand = {
  mandant: Mandant;
  objekte: Objekt[];
  einheiten: Einheit[];
  mitarbeiter: Mitarbeiter[];
  handwerker: Handwerker[];
  zeitfenster: Zeitfenster[];
  vorgaenge: Vorgang[];
  nachrichten: Nachricht[];
  verlauf: VorgangVerlauf[];
  freigaben: Freigabe[];
  termine: Termin[];
};
