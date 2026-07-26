import "server-only";

/**
 * Zugriff auf die Mandantendaten – mit Rückfallebene.
 *
 * Normalfall: Die Daten kommen aus Supabase. Der Chat schreibt dorthin, das
 * Dashboard liest von dort, Realtime verbindet beides.
 *
 * Rückfall: Ist keine Datenbank konfiguriert oder antwortet sie nicht, liefert
 * der Beispieldaten-Generator denselben Bestand direkt aus dem Speicher.
 *
 * Warum dieser Aufwand für eine Demo:
 *   - Supabase pausiert Projekte im kostenlosen Tarif nach sieben Tagen ohne
 *     Zugriff. Ein Interessent, der den Link erst nach zehn Tagen anklickt,
 *     stünde sonst vor einer toten Seite – genau der Moment, den wir uns nicht
 *     leisten können.
 *   - Die Demo lässt sich schon ansehen, bevor überhaupt eine Datenbank
 *     eingerichtet ist.
 *
 * Im Rückfallbetrieb fehlt nur eines: Im Chat erzeugte Meldungen erscheinen
 * nicht live im Dashboard, weil nichts gespeichert wird. Die Oberfläche weist
 * darauf hin.
 */

import { MUSTER_MANDANT } from "@config/muster-mandant";
import { bestandErzeugen } from "@/lib/demo/generator";
import { supabaseServer } from "@/lib/supabase/server";
import type { Mandant, Mandantenbestand } from "./typen";

/** Mandanten, die auch ohne Datenbank verfügbar sind. */
const RUECKFALL_VORLAGEN = [MUSTER_MANDANT];

export type Herkunft = "datenbank" | "rueckfall";

export type BestandErgebnis = {
  bestand: Mandantenbestand;
  herkunft: Herkunft;
};

export function istDatenbankKonfiguriert(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Ob geschrieben werden kann. Lesen geht mit dem öffentlichen Schlüssel,
 * Schreiben ausschließlich mit dem Service-Role-Key – ohne ihn läuft die Demo
 * im Nur-Lesen-Betrieb weiter, statt mit einem Fehler abzubrechen.
 */
export function istSchreibenMoeglich(): boolean {
  return istDatenbankKonfiguriert() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Der Generator läuft pro Anfrage höchstens einmal je Mandant.
const rueckfallSpeicher = new Map<
  string,
  { bestand: Mandantenbestand; erzeugt: number }
>();
const RUECKFALL_HALTBARKEIT_MS = 5 * 60 * 1000;

function rueckfallBestand(slug: string): Mandantenbestand | null {
  const vorlage = RUECKFALL_VORLAGEN.find((v) => v.slug === slug);
  if (!vorlage) return null;

  const zwischenstand = rueckfallSpeicher.get(slug);
  if (zwischenstand && Date.now() - zwischenstand.erzeugt < RUECKFALL_HALTBARKEIT_MS) {
    return zwischenstand.bestand;
  }

  const bestand = bestandErzeugen(vorlage);
  rueckfallSpeicher.set(slug, { bestand, erzeugt: Date.now() });
  return bestand;
}

/**
 * Lädt nur die Mandantenkonfiguration – das braucht jedes Layout für Logo
 * und Farben, und es soll so schnell wie möglich gehen.
 */
export async function mandantLaden(slug: string): Promise<Mandant | null> {
  if (istDatenbankKonfiguriert()) {
    try {
      const supabase = await supabaseServer();
      const { data, error } = await supabase
        .from("demo_tenants")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (!error && data) return data as Mandant;
      if (error) {
        console.warn(
          `[daten] Mandant "${slug}" nicht aus der Datenbank ladbar:`,
          error.message,
        );
      }
    } catch (fehler) {
      console.warn(`[daten] Datenbank nicht erreichbar, nutze Rückfalldaten:`, fehler);
    }
  }

  return rueckfallBestand(slug)?.mandant ?? null;
}

/**
 * Lädt den vollständigen Bestand eines Mandanten.
 *
 * Bewusst als ein Rutsch statt vieler Einzelabfragen: Der Datenbestand einer
 * Demo ist klein (unter 500 Zeilen), und eine Anfrage über eine Verbindung
 * schlägt fünf nacheinander laufende deutlich – das ist der Unterschied
 * zwischen unter einer und über zwei Sekunden Ladezeit.
 */
export async function bestandLaden(slug: string): Promise<BestandErgebnis | null> {
  if (istDatenbankKonfiguriert()) {
    try {
      const supabase = await supabaseServer();
      const { data: mandant } = await supabase
        .from("demo_tenants")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (mandant) {
        const tenantId = (mandant as Mandant).id;
        const [
          objekte,
          einheiten,
          mitarbeiter,
          handwerker,
          zeitfenster,
          vorgaenge,
          nachrichten,
          verlauf,
          freigaben,
          termine,
        ] = await Promise.all([
          tabelle(supabase, "objekte", tenantId, "sortierung"),
          tabelle(supabase, "einheiten", tenantId),
          tabelle(supabase, "mitarbeiter", tenantId, "sortierung"),
          tabelle(supabase, "handwerker", tenantId),
          tabelle(supabase, "zeitfenster", tenantId),
          tabelle(supabase, "vorgaenge", tenantId, "erstellt_am", false),
          tabelle(supabase, "nachrichten", tenantId, "gesendet_am"),
          tabelle(supabase, "vorgang_verlauf", tenantId, "zeitpunkt"),
          tabelle(supabase, "freigaben", tenantId, "erstellt_am"),
          tabelle(supabase, "termine", tenantId, "beginn"),
        ]);

        return {
          herkunft: "datenbank",
          bestand: {
            mandant: mandant as Mandant,
            objekte,
            einheiten,
            mitarbeiter,
            handwerker,
            zeitfenster,
            vorgaenge,
            nachrichten,
            verlauf,
            freigaben,
            termine,
          } as Mandantenbestand,
        };
      }
    } catch (fehler) {
      console.warn(
        `[daten] Bestand für "${slug}" nicht ladbar, nutze Rückfalldaten:`,
        fehler,
      );
    }
  }

  const bestand = rueckfallBestand(slug);
  return bestand ? { bestand, herkunft: "rueckfall" } : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function tabelle(
  supabase: any,
  name: string,
  tenantId: string,
  sortierSpalte?: string,
  aufsteigend = true,
): Promise<any[]> {
  let abfrage = supabase.from(name).select("*").eq("tenant_id", tenantId);
  if (sortierSpalte) abfrage = abfrage.order(sortierSpalte, { ascending: aufsteigend });
  const { data } = await abfrage;
  return data ?? [];
}
