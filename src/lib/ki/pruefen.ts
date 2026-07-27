import { anliegen } from "@config/anliegen";
import { szenarien } from "@config/scenarios";

/**
 * Die Sperren um die Antworten des Modells.
 *
 * Bewusst eine eigene Datei ohne "server-only": Das hier ist der Teil, der
 * geprüft gehört, und geprüft wird ohne Netz, ohne Schlüssel und ohne Browser
 * (scripts/ki-pruefen.ts). Was ein Modell antwortet, kann man nicht testen –
 * was man damit tut, sehr wohl.
 *
 * Grundhaltung überall hier: Im Zweifel verwerfen. Eine verworfene Antwort
 * kostet den hinterlegten Text, den es ohnehin gibt. Eine durchgelassene
 * falsche Antwort kostet die Hausverwaltung ihr Verhältnis zum Mieter.
 */

// --- Freitext zuordnen -----------------------------------------------------

export type Zuordnung = {
  szenarioId: string | null;
  anliegenId: string | null;
  sicherheit: number;
};

/**
 * Unterhalb dieser Sicherheit gilt die Zuordnung als nicht getroffen.
 *
 * Lieber einmal zu oft nachfragen als eine Meldung falsch einsortieren: Ein
 * falsch zugeordneter Vorgang schickt den falschen Betrieb los, und das ist
 * genau der Fehler, den wir der Branche abnehmen wollen.
 */
const SCHWELLE = 0.6;

export function zuordnungLesen(roh: string): Zuordnung | null {
  const feld = jsonAusText(roh);
  if (!feld) return null;

  const sicherheit = typeof feld.sicherheit === "number" ? feld.sicherheit : 0;
  if (sicherheit < SCHWELLE) return null;

  // Nur Kennungen, die es bei uns wirklich gibt. Alles andere ist erfunden.
  const szenarioId =
    typeof feld.szenario === "string" && szenarien.some((s) => s.id === feld.szenario)
      ? feld.szenario
      : null;
  const anliegenId =
    typeof feld.thema === "string" &&
    anliegen.some((a) => a.id === feld.thema && !a.istSchaden)
      ? feld.thema
      : null;

  if (!szenarioId && !anliegenId) return null;

  // Beides zugleich wäre widersprüchlich – dann gilt der Schadensfall, denn
  // ihn zu übersehen ist der teurere Fehler.
  return {
    szenarioId,
    anliegenId: szenarioId ? null : anliegenId,
    sicherheit: Math.min(1, Math.max(0, sicherheit)),
  };
}

// --- Bildauswertung --------------------------------------------------------

export type Bildurteil = {
  erkennung: string;
  brauchtZweitfoto: boolean;
};

export function bildurteilLesen(roh: string): Bildurteil | null {
  const feld = jsonAusText(roh);
  if (!feld) return null;

  const erkennung = typeof feld.erkennung === "string" ? feld.erkennung.trim() : "";
  if (erkennung.length < 20 || erkennung.length > 600) return null;
  if (verbotenerInhalt(erkennung)) return null;

  return { erkennung, brauchtZweitfoto: feld.zweitfoto === true };
}

/**
 * Grobe Sperre gegen die vier Sorten Aussage, die an den Mieter nie gehen.
 *
 * Bewusst streng und bewusst dumm: Ein falscher Alarm kostet nur den
 * hinterlegten Text, eine durchgelassene Kostenzusage kostet Vertrauen. Die
 * Anweisung an das Modell verbietet dasselbe – aber eine Anweisung ist eine
 * Bitte, und das hier ist die Kontrolle.
 */
export function verbotenerInhalt(text: string): boolean {
  const muster = [
    // Geld in jeder Schreibweise
    /\d+\s*(?:€|euro|eur)\b/i,
    /\bkostet\b|\bkosten\s+(?:sich|Sie|ca)/i,
    // Zusagen mit Zeitbezug
    /\b(?:heute|morgen|übermorgen|werktag\w*|stunden|tagen)\b[^.]*\b(?:kommt|kommen|da sein|erledigt|fertig)\b/i,
    // Rechtslage
    /\bmietminderung\b|\bmietmangel\b|\bmangel nach\b|\b§\s*\d+/i,
    // Handlungsanweisungen mit Sicherheitsfolgen
    /\bschalten Sie\b|\bsicherung\b|\bstellen Sie\b[^.]*\bab\b/i,
  ];
  return muster.some((m) => m.test(text));
}

// --- Gemeinsam -------------------------------------------------------------

/**
 * Holt das JSON-Objekt aus einer Antwort.
 *
 * Modelle stellen gern einen Satz davor ("Klar, hier:"). Statt darum zu
 * bitten, dass sie es lassen, wird hier einfach zwischen der ersten
 * geschweiften Klammer und der letzten gelesen.
 */
function jsonAusText(roh: string): Record<string, unknown> | null {
  const anfang = roh.indexOf("{");
  const ende = roh.lastIndexOf("}");
  if (anfang < 0 || ende <= anfang) return null;

  try {
    const gelesen: unknown = JSON.parse(roh.slice(anfang, ende + 1));
    if (typeof gelesen !== "object" || gelesen === null) return null;
    return gelesen as Record<string, unknown>;
  } catch {
    return null;
  }
}
