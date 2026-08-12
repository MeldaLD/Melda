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
    // Wie belastbar Tempo und Raster sind. Bestandszeilen ohne diese Spalten
    // gelten als vertrauenswürdig – sie wurden vermessen, als es das Maß noch
    // nicht gab, und ihr Tempo blind zu verwerfen wäre schlechter als es zu
    // benutzen.
    bpmVertrauen: zeile.bpm_vertrauen ?? 1,
    ohneRaster: zeile.ohne_raster ?? false,
    // Der Verlauf über den Track. Fehlt er, plant der Übergang ohne ihn –
    // dann bleibt es beim natürlichen Einstieg statt beim Sprung in den Groove.
    profil: Array.isArray(zeile.profil) ? zeile.profil : [],
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
    bpm_vertrauen: zahl("bpmVertrauen", 1),
    ohne_raster: koerper.ohneRaster === true,
    profil: Array.isArray(koerper.profil) ? koerper.profil : [],
  };

  const { error } = await supabaseAdmin()
    .from("dj_track")
    .upsert(zeile, { onConflict: "id" });

  if (!error) return NextResponse.json({ id: zeile.id });

  /*
   * Die zwei Spalten bpm_vertrauen und ohne_raster kamen mit einer Migration
   * dazu. Ist die auf dieser Datenbank noch nicht gelaufen, lehnt Postgres den
   * ganzen Datensatz ab – und dann ließe sich überhaupt nichts mehr hochladen,
   * obwohl an der Datei nichts falsch ist.
   *
   * Ein fehlender Messwert ist ein kleineres Problem als eine Bibliothek, die
   * sich nicht mehr füllen lässt. Also: nochmal ohne die neuen Spalten, und im
   * Ergebnis steht, dass die Migration fehlt.
   */
  if (!fehltSpalte(error.message)) {
    return NextResponse.json({ fehler: error.message }, { status: 500 });
  }

  const { bpm_vertrauen, ohne_raster, profil, ...ohneNeueSpalten } = zeile;
  void bpm_vertrauen;
  void ohne_raster;
  void profil;

  const zweiter = await supabaseAdmin()
    .from("dj_track")
    .upsert(ohneNeueSpalten, { onConflict: "id" });

  if (zweiter.error) {
    return NextResponse.json({ fehler: zweiter.error.message }, { status: 500 });
  }

  return NextResponse.json({
    id: zeile.id,
    warnung:
      "Eingetragen, aber ohne das Rastervertrauen – die Migration " +
      "20260812060000_dj_rastervertrauen.sql / 20260812090000_dj_verlauf.sql sind auf dieser Datenbank noch nicht gelaufen. " +
      "Bis dahin gilt jedes Tempo als belastbar, auch ein erfundenes.",
  });
}

/** Meldet Postgres eine unbekannte Spalte? */
function fehltSpalte(meldung: string) {
  const text = meldung.toLowerCase();
  return (
    text.includes("bpm_vertrauen") ||
    text.includes("ohne_raster") ||
    text.includes("profil") ||
    (text.includes("column") && text.includes("does not exist")) ||
    text.includes("schema cache")
  );
}

/**
 * Tracks löschen – einen oder alle.
 *
 * Zwei Dinge müssen weg, nicht eines: der Datensatz und die Audiodatei im
 * Speicher. Bliebe die Datei liegen, wäre sie unauffindbar und würde trotzdem
 * für immer Platz belegen.
 *
 * Die Reihenfolge ist Absicht – erst die Datei, dann die Zeile. Andersherum
 * verlöre man bei einem Abbruch dazwischen den einzigen Hinweis darauf, welche
 * Datei überhaupt gemeint war.
 */
export async function DELETE(anfrage: Request) {
  const speicher = await cookies();
  if (!sitzungGueltig(speicher.get(cookieName())?.value)) {
    return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  }

  let koerper: Record<string, unknown> = {};
  try {
    koerper = await anfrage.json();
  } catch {
    // Ein leerer Rumpf ist in Ordnung – dann greift die Prüfung unten.
  }

  const id = typeof koerper.id === "string" ? koerper.id : null;
  const alle = koerper.alle === true;

  // Alles zu löschen ist nicht rückgängig zu machen und darf nicht aus Versehen
  // passieren – etwa durch eine wiederholte Anfrage. Deshalb muss der Aufrufer
  // die Anzahl mitschicken, die er zu löschen glaubt.
  if (!id && !alle) {
    return NextResponse.json({ fehler: "Weder id noch alle angegeben." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const abfrage = db.from("dj_track").select("id, datei");
  const { data, error } = id ? await abfrage.eq("id", id) : await abfrage;

  if (error) {
    return NextResponse.json({ fehler: error.message }, { status: 500 });
  }

  const zeilen = data ?? [];
  if (zeilen.length === 0) {
    return NextResponse.json({ geloescht: 0, dateien: 0 });
  }

  if (alle && typeof koerper.anzahl === "number" && koerper.anzahl !== zeilen.length) {
    return NextResponse.json(
      {
        fehler:
          `Die Bibliothek enthält ${zeilen.length} Tracks, die Anfrage ging von ` +
          `${koerper.anzahl} aus. Nichts gelöscht – bitte neu laden und noch einmal ansehen.`,
      },
      { status: 409 },
    );
  }

  const pfade = zeilen.map((z) => z.datei).filter((p): p is string => typeof p === "string" && p.length > 0);

  let dateifehler: string | null = null;
  if (pfade.length > 0) {
    const { error: speicherFehler } = await db.storage.from("dj-musik").remove(pfade);
    // Eine Datei, die sich nicht löschen lässt, darf den Eintrag nicht retten:
    // Sonst steht ein Track in der Bibliothek, dessen Audio niemand mehr
    // abspielen kann. Vermerkt wird es trotzdem.
    if (speicherFehler) dateifehler = speicherFehler.message;
  }

  const geloescht = id
    ? await db.from("dj_track").delete().eq("id", id)
    : await db.from("dj_track").delete().neq("id", "");

  if (geloescht.error) {
    return NextResponse.json({ fehler: geloescht.error.message }, { status: 500 });
  }

  return NextResponse.json({
    geloescht: zeilen.length,
    dateien: pfade.length,
    ...(dateifehler ? { warnung: `Einträge weg, Dateien nicht alle: ${dateifehler}` } : {}),
  });
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
