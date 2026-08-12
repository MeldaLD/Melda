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

  /*
   * Die Energie wird hier beim Lesen nachjustiert, nicht beim Schreiben.
   *
   * Vorher ersetzte ein eigener Durchlauf den gemessenen Wert durch den Rang
   * in der Bibliothek. Bei zwei Tracks kamen dabei zwangsläufig 0 % und 100 %
   * heraus, und ein hinzugekommener Track verschob alle anderen dauerhaft.
   *
   * Jetzt bleibt in der Datenbank der gemessene Wert stehen, und der Rang
   * redet nur mit – gewichtet danach, wie viele Tracks es überhaupt gibt.
   * Bei einer kleinen Sammlung sagt eine Rangfolge nichts.
   */
  const sortiert = [...(data ?? [])].sort((a, b) => (a.energie ?? 0) - (b.energie ?? 0));
  const rang = new Map(
    sortiert.map((zeile, i) => [zeile.id, sortiert.length > 1 ? i / (sortiert.length - 1) : 0.5]),
  );
  const rangGewicht = Math.min(0.5, Math.max(0, ((data?.length ?? 0) - 4) / 16));

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
    energie: Number(
      ((zeile.energie ?? 0.5) * (1 - rangGewicht) + (rang.get(zeile.id) ?? 0.5) * rangGewicht).toFixed(3),
    ),
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

function kennung(interpret: string, titel: string) {
  return `${interpret} - ${titel}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}
