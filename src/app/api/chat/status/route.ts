import { NextResponse } from "next/server";

import { istDatenbankKonfiguriert } from "@/lib/daten/quelle";
import { supabaseServer } from "@/lib/supabase/server";
import type { VorgangStatus } from "@/lib/daten/typen";

/**
 * Aktueller Stand der Meldungen eines Mieters.
 *
 * Wird aufgerufen, bevor der Chat die Statusanzeige zeigt. Dadurch sieht der
 * Mieter, was die Verwaltung inzwischen getan hat – gibt sie im Dashboard
 * einen Auftrag frei, springt die Anzeige beim nächsten „Status" weiter.
 *
 * Nur lesend und über den Anon-Key: Es werden ausschließlich Daten geliefert,
 * die durch die Sicherheitsregeln ohnehin öffentlich lesbar sind.
 */

/** Verlaufsereignisse, die für den Mieter interessant sind. */
const MIETER_RELEVANT: Record<string, string> = {
  eingegangen: "Meldung aufgenommen",
  klassifiziert: "Eingeordnet und geprüft",
  nachgefasst: "Rückfrage zum Foto ausgewertet",
  vorbereitet: "Auftrag vorbereitet, wartet auf Freigabe",
  freigegeben: "Von der Hausverwaltung freigegeben",
  beauftragt: "An den Handwerksbetrieb übermittelt",
  terminiert: "Termin abgestimmt",
  begonnen: "Arbeiten begonnen",
  erledigt: "Erledigt",
  eskaliert: "Notdienst alarmiert",
};

export async function GET(anfrage: Request) {
  if (!istDatenbankKonfiguriert()) {
    return NextResponse.json({ staende: null });
  }

  const nummern = (new URL(anfrage.url).searchParams.get("nummern") ?? "")
    .split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 20);

  if (!nummern.length) return NextResponse.json({ staende: null });

  try {
    const db = await supabaseServer();

    const { data: vorgaenge } = await db
      .from("vorgaenge")
      .select("id, nummer, status")
      .in("nummer", nummern);

    if (!vorgaenge?.length) return NextResponse.json({ staende: null });

    const { data: verlauf } = await db
      .from("vorgang_verlauf")
      .select("vorgang_id, ereignis, zeitpunkt")
      .in(
        "vorgang_id",
        vorgaenge.map((v) => v.id),
      )
      .order("zeitpunkt", { ascending: true });

    const staende: Record<
      string,
      { status: VorgangStatus; schritte: { was: string; zeit: string }[] }
    > = {};

    for (const vorgang of vorgaenge) {
      const schritte = (verlauf ?? [])
        .filter((e) => e.vorgang_id === vorgang.id)
        .map((e) => ({ was: MIETER_RELEVANT[e.ereignis], zeit: e.zeitpunkt }))
        .filter((e) => Boolean(e.was));

      staende[String(vorgang.nummer)] = { status: vorgang.status, schritte };
    }

    return NextResponse.json({ staende });
  } catch (fehler) {
    console.error("[api/chat/status]", fehler);
    return NextResponse.json({ staende: null });
  }
}
