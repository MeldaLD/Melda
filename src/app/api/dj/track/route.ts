import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { cookieName, sitzungGueltig } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Die Bibliothek. Liest jeder – die Bühne braucht sie ohne Anmeldung. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("dj_track")
    .select("*")
    .order("erstellt", { ascending: true });

  if (error) {
    return NextResponse.json({ fehler: error.message }, { status: 500 });
  }

  const basis = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/dj-musik/`;
  const tracks = (data ?? []).map((zeile) => ({
    id: zeile.id,
    titel: zeile.titel,
    interpret: zeile.interpret,
    // Die Bühne bekommt die fertige Adresse, damit sie nichts über Supabase
    // wissen muss.
    quelle: basis + zeile.datei,
    dauer: zeile.dauer,
    bpm: zeile.bpm,
    raster: zeile.raster,
    einstiegBeat: zeile.einstieg_beat,
    energie: zeile.energie,
    lufs: zeile.lufs,
    angleichDb: zeile.angleich_db,
    note: zeile.note,
    marken: zeile.marken,
  }));

  return NextResponse.json(
    { tracks },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Einen vermessenen Track eintragen. Nur für den Admin. */
export async function POST(anfrage: Request) {
  const speicher = await cookies();
  if (!sitzungGueltig(speicher.get(cookieName())?.value)) {
    return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  }

  let koerper: Record<string, unknown>;
  try {
    koerper = await anfrage.json();
  } catch {
    return NextResponse.json({ fehler: "Ungültige Anfrage." }, { status: 400 });
  }

  const text = (feld: string) =>
    typeof koerper[feld] === "string" ? (koerper[feld] as string) : "";
  const zahl = (feld: string, ersatz = 0) =>
    typeof koerper[feld] === "number" && Number.isFinite(koerper[feld])
      ? (koerper[feld] as number)
      : ersatz;

  if (!text("titel") || !text("datei")) {
    return NextResponse.json(
      { fehler: "Titel und Datei sind Pflicht." },
      { status: 400 },
    );
  }

  const zeile = {
    // Kennung aus Interpret und Titel: Lädt jemand denselben Track nochmal
    // hoch, ersetzt er den alten, statt doppelt in der Bibliothek zu stehen.
    id: kennung(text("interpret"), text("titel")),
    titel: text("titel"),
    interpret: text("interpret"),
    datei: text("datei"),
    dauer: zahl("dauer"),
    bpm: zahl("bpm", 120),
    raster: zahl("raster"),
    einstieg_beat: Math.round(zahl("einstiegBeat")),
    energie: zahl("energie", 0.5),
    lufs: zahl("lufs", -14),
    angleich_db: zahl("angleichDb"),
    note: zahl("note", 1),
    marken: Array.isArray(koerper.marken) ? koerper.marken : [],
  };

  const { error } = await supabaseAdmin()
    .from("dj_track")
    .upsert(zeile, { onConflict: "id" });

  if (error) {
    return NextResponse.json({ fehler: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: zeile.id });
}

/**
 * Die Energie neu über die Bibliothek verteilen.
 *
 * Ein absoluter Energiewert sagt wenig: Eine Sammlung aus reinem Ambient hätte
 * sonst nirgends "hohe Energie". Zählen soll der Rang innerhalb der eigenen
 * Sammlung – und der verschiebt sich, sobald neue Tracks dazukommen.
 */
export async function PATCH() {
  const speicher = await cookies();
  if (!sitzungGueltig(speicher.get(cookieName())?.value)) {
    return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db.from("dj_track").select("id, energie");
  if (error) {
    return NextResponse.json({ fehler: error.message }, { status: 500 });
  }
  if (!data || data.length < 2) {
    return NextResponse.json({ angepasst: 0 });
  }

  const sortiert = [...data].sort((a, b) => (a.energie ?? 0) - (b.energie ?? 0));
  const neu = sortiert.map((zeile, i) => ({
    id: zeile.id,
    energie: Number((i / (sortiert.length - 1)).toFixed(3)),
  }));

  for (const eintrag of neu) {
    const { error: fehler } = await db
      .from("dj_track")
      .update({ energie: eintrag.energie })
      .eq("id", eintrag.id);
    if (fehler) {
      return NextResponse.json({ fehler: fehler.message }, { status: 500 });
    }
  }

  return NextResponse.json({ angepasst: neu.length });
}

function kennung(interpret: string, titel: string) {
  return `${interpret} - ${titel}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}
