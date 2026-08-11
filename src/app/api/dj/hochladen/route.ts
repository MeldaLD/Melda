import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { cookieName, sitzungGueltig } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Gibt eine signierte Adresse zurück, unter der genau eine Datei hochgeladen
 * werden darf.
 *
 * Warum der Umweg: Eine Audiodatei ist schnell acht Megabyte groß, und durch
 * eine Vercel-Funktion passen nur viereinhalb. Der Browser lädt deshalb direkt
 * zu Supabase – aber nicht mit dem öffentlichen Schlüssel, sondern mit einer
 * Erlaubnis, die dieser Server für genau diesen einen Pfad ausstellt. Damit
 * bleibt der Speicher für Fremde verschlossen.
 */
export async function POST(anfrage: Request) {
  const speicher = await cookies();
  if (!sitzungGueltig(speicher.get(cookieName())?.value)) {
    return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  }

  let dateiname: unknown;
  try {
    ({ dateiname } = await anfrage.json());
  } catch {
    return NextResponse.json({ fehler: "Ungültige Anfrage." }, { status: 400 });
  }

  if (typeof dateiname !== "string" || dateiname.length === 0) {
    return NextResponse.json({ fehler: "Kein Dateiname." }, { status: 400 });
  }

  // Der Name wird nicht übernommen, sondern nur die Endung: Alles andere kommt
  // aus einer Zufallskennung. Das verhindert Pfad-Tricks und Kollisionen, wenn
  // zwei Leute dieselbe Datei hochladen.
  const endung = (dateiname.split(".").pop() ?? "mp3")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5);
  const pfad = `${crypto.randomUUID()}.${endung || "mp3"}`;

  const { data, error } = await supabaseAdmin()
    .storage.from("dj-musik")
    .createSignedUploadUrl(pfad);

  if (error) {
    return NextResponse.json({ fehler: error.message }, { status: 500 });
  }

  return NextResponse.json({ pfad, adresse: data.signedUrl, kennung: data.token });
}
