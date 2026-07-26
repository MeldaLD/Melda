import "server-only";

/**
 * Schreibende Zugriffe auf die Datenbank.
 *
 * Ausschließlich serverseitig mit dem Service-Role-Key. Aus dem Browser kann
 * nichts geschrieben werden – es gibt keine INSERT-Policy (siehe
 * supabase/migrations/…_rls.sql).
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Mandantenbestand } from "./typen";

/**
 * Schreibt einen kompletten Bestand in die Datenbank.
 * Wird vom Zurücksetzen genutzt: erst demo_leeren(), dann das hier.
 *
 * Reihenfolge ist wichtig – Fremdschlüssel.
 */
export async function bestandSchreiben(bestand: Mandantenbestand): Promise<void> {
  const db = supabaseAdmin();

  const tabellen: [string, unknown[]][] = [
    ["objekte", bestand.objekte],
    ["einheiten", bestand.einheiten],
    ["mitarbeiter", bestand.mitarbeiter],
    ["handwerker", bestand.handwerker],
    ["zeitfenster", bestand.zeitfenster],
    ["vorgaenge", bestand.vorgaenge],
    ["nachrichten", bestand.nachrichten],
    ["vorgang_verlauf", bestand.verlauf],
    ["freigaben", bestand.freigaben],
    ["termine", bestand.termine],
  ];

  for (const [name, zeilen] of tabellen) {
    if (!zeilen.length) continue;
    const { error } = await db.from(name).insert(zeilen);
    if (error) {
      throw new Error(
        `Konnte ${name} nicht schreiben: ${verstaendlich(error.message)}`,
      );
    }
  }
}

/**
 * Übersetzt die häufigste Ursache in eine Anweisung.
 *
 * "Could not find the 'x' column … in the schema cache" heißt in der Praxis
 * fast immer: Eine Migration wurde noch nicht eingespielt. Die Rohmeldung
 * hilft dabei niemandem weiter.
 */
function verstaendlich(meldung: string): string {
  const spalte = meldung.match(/Could not find the '([^']+)' column/)?.[1];
  if (spalte) {
    return (
      `Die Spalte "${spalte}" fehlt in der Datenbank. Vermutlich ist eine ` +
      `Migration noch nicht eingespielt – bitte alle Dateien aus ` +
      `supabase/migrations in der Nummernfolge ausführen. Sind sie schon ` +
      `eingespielt, hilft im Supabase SQL Editor: notify pgrst, 'reload schema';`
    );
  }
  return meldung;
}

/** Leert alle Bewegungsdaten eines Mandanten über die Datenbankfunktion. */
export async function bestandLeeren(slug: string): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.rpc("demo_leeren", { p_slug: slug });
  if (error) throw new Error(`Zurücksetzen fehlgeschlagen: ${error.message}`);
}
