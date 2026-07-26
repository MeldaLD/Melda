import { NextResponse } from "next/server";

import { MUSTER_MANDANT } from "@config/muster-mandant";
import { bestandErzeugen } from "@/lib/demo/generator";
import { bestandLeeren, bestandSchreiben } from "@/lib/daten/schreiben";
import { istDatenbankKonfiguriert } from "@/lib/daten/quelle";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Setzt einen Mandanten auf den Ausgangszustand zurück.
 *
 * Nötig, weil während einer Vorführung echte Vorgänge entstehen. Ohne
 * Zurücksetzen wäre die zweite Vorführung eine andere als die erste.
 *
 * Ablauf: alle Bewegungsdaten löschen, dann den Bestand aus dem Generator
 * neu schreiben. Derselbe Weg wie beim Seed – ein Codepfad, kein zweiter,
 * der auseinanderlaufen könnte.
 */
export async function POST(anfrage: Request) {
  if (!istDatenbankKonfiguriert() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ zurueckgesetzt: false, grund: "keine-datenbank" });
  }

  let slug: string;
  try {
    ({ slug } = await anfrage.json());
  } catch {
    return NextResponse.json({ fehler: "Ungültige Anfrage" }, { status: 400 });
  }

  // DEMO: Zurückgesetzt werden kann nur, wofür eine Vorlage hinterlegt ist.
  // Sonst würde der Knopf die Daten eines Mandanten löschen, den danach
  // niemand wiederherstellen kann.
  const vorlage = [MUSTER_MANDANT].find((v) => v.slug === slug);
  if (!vorlage) {
    return NextResponse.json(
      { fehler: "Für diesen Mandanten ist keine Vorlage hinterlegt." },
      { status: 409 },
    );
  }

  try {
    const db = supabaseAdmin();
    const { data: mandant } = await db
      .from("demo_tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!mandant) {
      return NextResponse.json({ fehler: "Unbekannter Mandant" }, { status: 404 });
    }

    await bestandLeeren(slug);

    // Der Mandant selbst bleibt bestehen, nur seine Bewegungsdaten werden neu
    // erzeugt – deshalb den Mandanten aus dem Bestand herausnehmen.
    const bestand = bestandErzeugen(vorlage);
    await bestandSchreiben(bestand);

    return NextResponse.json({
      zurueckgesetzt: true,
      vorgaenge: bestand.vorgaenge.length,
    });
  } catch (fehler) {
    console.error("[api/demo/reset]", fehler);
    return NextResponse.json(
      { fehler: fehler instanceof Error ? fehler.message : "Unbekannter Fehler" },
      { status: 500 },
    );
  }
}
