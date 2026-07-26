import { NextResponse } from "next/server";

import { istSchreibenMoeglich } from "@/lib/daten/quelle";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Hält den Wunschtermin fest, den der Mieter im Chat gewählt hat.
 *
 * Bewusst nur ein Wunsch: Der Termin entsteht mit Status "geplant" und wird
 * erst bestätigt, wenn die Verwaltung den Auftrag freigegeben und der Betrieb
 * zugesagt hat. Der Vorgang bleibt deshalb hier unverändert – ein Klick des
 * Mieters darf ihn nicht weiterschieben.
 *
 * Im Dashboard taucht er sofort unter "Rückrufe & Termine" auf.
 */

type Eingang = {
  slug: string;
  vorgangId: string;
  /** ISO-Zeitstempel aus dem gewählten Fenster. */
  beginn: string;
  ende: string;
  beschriftung: string;
};

export async function POST(anfrage: Request) {
  if (!istSchreibenMoeglich()) {
    return NextResponse.json({ gespeichert: false, grund: "keine-datenbank" });
  }

  let eingang: Eingang;
  try {
    eingang = await anfrage.json();
  } catch {
    return NextResponse.json({ fehler: "Ungültige Anfrage" }, { status: 400 });
  }

  const beginn = new Date(eingang.beginn);
  const ende = new Date(eingang.ende);
  if (Number.isNaN(beginn.getTime()) || ende <= beginn) {
    return NextResponse.json({ fehler: "Ungültiges Zeitfenster" }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();

    const { data: vorgang } = await db
      .from("vorgaenge")
      .select("id, tenant_id, titel, einheit_id, gewerk, handwerker_id")
      .eq("id", eingang.vorgangId)
      .maybeSingle();
    if (!vorgang) {
      return NextResponse.json({ fehler: "Unbekannter Vorgang" }, { status: 404 });
    }

    // Steht der Betrieb noch nicht fest, den Standardbetrieb des Gewerks
    // eintragen – sonst stünde im Dashboard ein Termin ohne Handwerker.
    let betriebId = vorgang.handwerker_id;
    if (!betriebId) {
      const { data: betriebe } = await db
        .from("handwerker")
        .select("id")
        .eq("tenant_id", vorgang.tenant_id)
        .eq("gewerk", vorgang.gewerk)
        .eq("ist_standard", true)
        .limit(1);
      betriebId = betriebe?.[0]?.id ?? null;
    }

    // Ein zweiter Klick auf ein anderes Fenster soll den Termin verschieben,
    // nicht verdoppeln.
    const { data: vorhanden } = await db
      .from("termine")
      .select("id")
      .eq("vorgang_id", vorgang.id)
      .eq("typ", "handwerkertermin")
      .maybeSingle();

    const zeile = {
      tenant_id: vorgang.tenant_id,
      vorgang_id: vorgang.id,
      typ: "handwerkertermin" as const,
      titel: vorgang.titel,
      handwerker_id: betriebId,
      einheit_id: vorgang.einheit_id,
      beginn: beginn.toISOString(),
      ende: ende.toISOString(),
      status: "geplant" as const,
      ist_seed: false,
    };

    const { error } = vorhanden
      ? await db.from("termine").update(zeile).eq("id", vorhanden.id)
      : await db.from("termine").insert(zeile);
    if (error) throw new Error(error.message);

    await db.from("vorgang_verlauf").insert({
      tenant_id: vorgang.tenant_id,
      vorgang_id: vorgang.id,
      ereignis: "wunschtermin",
      beschreibung: `Mieter wünscht ${eingang.beschriftung}`,
      akteur: "Mieter",
      ist_seed: false,
      zeitpunkt: new Date().toISOString(),
    });

    return NextResponse.json({ gespeichert: true });
  } catch (fehler) {
    console.error("[api/chat/termin]", fehler);
    // Der Chat läuft weiter – der Termin steht dem Mieter ohnehin schon da.
    return NextResponse.json({ gespeichert: false, grund: "fehler" });
  }
}
