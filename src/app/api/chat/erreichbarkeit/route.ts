import { NextResponse } from "next/server";

import { zeitwunschNach } from "@config/rueckruf-gruende";
import { istSchreibenMoeglich } from "@/lib/daten/quelle";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Hält fest, wann der Mieter erreichbar ist.
 *
 * Hier stand einmal die Route, die einen "Wunschtermin" des Mieters als
 * Termin in die Datenbank schrieb – noch bevor irgendjemand den Betrieb
 * gefragt hatte. Im Dashboard sah das aus wie ein vereinbarter Termin, und
 * unter "Rückrufe & Termine" stand eine Zeile, hinter der nichts stand.
 *
 * So läuft es in Deutschland nicht. Der Handwerksbetrieb nennt die
 * Zeitpunkte, an denen er kann; der Mieter entscheidet danach, ob einer
 * davon passt. Vom Mieter brauchen wir vorher nur die grobe Erreichbarkeit,
 * damit der Betrieb keine Fenster vorschlägt, an denen ohnehin niemand
 * öffnet.
 *
 * Es entsteht deshalb bewusst kein Termin, sondern nur ein Vermerk am
 * Vorgang und eine Zeile im Verlauf.
 */

type Eingang = {
  slug: string;
  vorgangId: string;
  /** vormittag | nachmittag | egal – siehe config/rueckruf-gruende.ts */
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

  const zeit = zeitwunschNach.get(eingang.zeitwunschId);
  if (!zeit) {
    return NextResponse.json({ fehler: "Unbekannte Erreichbarkeit" }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();

    const { data: vorgang } = await db
      .from("vorgaenge")
      .select("id, tenant_id")
      .eq("id", eingang.vorgangId)
      .maybeSingle();
    if (!vorgang) {
      return NextResponse.json({ fehler: "Unbekannter Vorgang" }, { status: 404 });
    }

    // Ein zweiter Klick überschreibt die Angabe, statt sie zu verdoppeln.
    const { error } = await db
      .from("vorgaenge")
      .update({ erreichbarkeit: zeit.id })
      .eq("id", vorgang.id);
    if (error) throw new Error(error.message);

    await db.from("vorgang_verlauf").insert({
      tenant_id: vorgang.tenant_id,
      vorgang_id: vorgang.id,
      ereignis: "erreichbarkeit",
      beschreibung: `Mieter ist erreichbar: ${zeit.bezeichnung}`,
      akteur: "Mieter",
      ist_seed: false,
      zeitpunkt: new Date().toISOString(),
    });

    return NextResponse.json({ gespeichert: true });
  } catch (fehler) {
    console.error("[api/chat/erreichbarkeit]", fehler);
    // Der Chat läuft weiter – der Mieter hat seine Bestätigung schon gesehen.
    return NextResponse.json({ gespeichert: false, grund: "fehler" });
  }
}
