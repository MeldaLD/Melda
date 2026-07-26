import { NextResponse } from "next/server";

import { grundNach, zeitwunschNach } from "@config/rueckruf-gruende";
import { istSchreibenMoeglich } from "@/lib/daten/quelle";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Legt einen Rückrufwunsch aus dem Chat an.
 *
 * Ohne Zeitpunkt und ohne Person: Der Mieter nennt nur das Thema und wann er
 * erreichbar ist. Wer zurückruft und wann genau, entscheidet die Verwaltung
 * unter "Rückrufe & Termine". Der Bereichsvorschlag aus dem Thema kommt als
 * Zuordnungshilfe mit und ist dort überschreibbar.
 */

type Eingang = {
  slug: string;
  einheitId: string | null;
  grundId: string;
  zeitwunschId: string;
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

  const grund = grundNach.get(eingang.grundId);
  const zeit = zeitwunschNach.get(eingang.zeitwunschId);
  if (!grund || !zeit) {
    return NextResponse.json({ fehler: "Unbekanntes Thema" }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();

    const { data: mandant } = await db
      .from("demo_tenants")
      .select("id")
      .eq("slug", eingang.slug)
      .maybeSingle();
    if (!mandant) {
      return NextResponse.json({ fehler: "Unbekannter Mandant" }, { status: 404 });
    }

    const { error } = await db.from("termine").insert({
      tenant_id: mandant.id,
      vorgang_id: null,
      typ: "rueckruf",
      titel: grund.bezeichnung,
      mitarbeiter_id: null,
      handwerker_id: null,
      einheit_id: eingang.einheitId,
      // Beides bleibt leer, bis die Verwaltung zuordnet.
      beginn: null,
      ende: null,
      status: "geplant",
      grund: grund.id,
      zeitwunsch: zeit.id,
      bereich_vorschlag: grund.bereichVorschlag,
      ist_seed: false,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({ gespeichert: true });
  } catch (fehler) {
    console.error("[api/chat/rueckruf]", fehler);
    return NextResponse.json({ gespeichert: false, grund: "fehler" });
  }
}
