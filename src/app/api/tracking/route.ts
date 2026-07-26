import { NextResponse } from "next/server";

import { istDatenbankKonfiguriert } from "@/lib/daten/quelle";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Aufruf-Tracking der Demos.
 *
 * Zweck ist ausschließlich vertrieblich: zu sehen, ob und wie lange ein
 * Interessent die Demo angesehen hat. Wer eine Viertelstunde im Dashboard
 * war, ist ein anderer Anruf wert als jemand, der nach zehn Sekunden weg war.
 *
 * Bewusst sparsam: eine zufällige Sitzungskennung aus dem Browser, der Pfad,
 * die Dauer. Kein Cookie, keine IP-Adresse, keine Wiedererkennung über
 * Sitzungen hinweg. Die Tabelle ist über RLS für die Öffentlichkeit gesperrt.
 */

type Eingang = {
  slug: string;
  sitzung: string;
  pfad: string;
  /** Bisherige Verweildauer in Sekunden. */
  dauer: number;
  /** Nur beim ersten Ereignis einer Sitzung mitgeschickt. */
  verweis?: string;
};

export async function POST(anfrage: Request) {
  if (!istDatenbankKonfiguriert() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ erfasst: false });
  }

  let eingang: Eingang;
  try {
    eingang = await anfrage.json();
  } catch {
    return NextResponse.json({ erfasst: false }, { status: 400 });
  }

  if (!eingang.slug || !eingang.sitzung) {
    return NextResponse.json({ erfasst: false }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();
    const { data: mandant } = await db
      .from("demo_tenants")
      .select("id, aufrufe")
      .eq("slug", eingang.slug)
      .maybeSingle();

    if (!mandant) return NextResponse.json({ erfasst: false });

    const dauer = Math.max(0, Math.min(Math.round(eingang.dauer), 4 * 3600));

    // Je Sitzung und Pfad genau eine Zeile, die mitwächst.
    const { data: vorhanden } = await db
      .from("demo_besuche")
      .select("id, dauer_sekunden")
      .eq("tenant_id", mandant.id)
      .eq("sitzung", eingang.sitzung)
      .eq("pfad", eingang.pfad)
      .maybeSingle();

    if (vorhanden) {
      await db
        .from("demo_besuche")
        .update({
          dauer_sekunden: Math.max(vorhanden.dauer_sekunden, dauer),
          letzter_ping: new Date().toISOString(),
        })
        .eq("id", vorhanden.id);
    } else {
      await db.from("demo_besuche").insert({
        tenant_id: mandant.id,
        sitzung: eingang.sitzung,
        pfad: eingang.pfad,
        dauer_sekunden: dauer,
        user_agent: anfrage.headers.get("user-agent")?.slice(0, 300) ?? null,
        verweis: eingang.verweis?.slice(0, 300) ?? null,
      });

      // Der Zähler am Mandanten steigt nur bei einer neuen Sitzung, nicht
      // bei jedem Seitenwechsel – sonst wäre "12 Aufrufe" bedeutungslos.
      if (eingang.pfad === "erstkontakt") {
        await db
          .from("demo_tenants")
          .update({ aufrufe: (mandant.aufrufe ?? 0) + 1 })
          .eq("id", mandant.id);
      }
    }

    return NextResponse.json({ erfasst: true });
  } catch (fehler) {
    console.error("[api/tracking]", fehler);
    // Tracking darf die Demo unter keinen Umständen stören.
    return NextResponse.json({ erfasst: false });
  }
}
