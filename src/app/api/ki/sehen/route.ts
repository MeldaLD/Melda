import { NextResponse } from "next/server";

import { sehen } from "@/lib/ki/sehen";
import { kiVerfuegbar } from "@/lib/ki/zugang";

/**
 * Wertet das Foto einer Meldung aus.
 *
 * Gibt "gesehen: null" zurück, wenn kein Schlüssel gesetzt ist, die Datei
 * nicht existiert oder die Antwort des Modells die Grenzen verletzt hat. Der
 * Chat nimmt dann den hinterlegten Text je Kachel – das ist der Zustand, in
 * dem die Demo heute überall läuft, und er darf nie wie ein Fehler wirken.
 */

export async function POST(anfrage: Request) {
  if (!kiVerfuegbar()) {
    return NextResponse.json({ gesehen: null, grund: "kein-schluessel" });
  }

  let eingang: { datei?: unknown; szenarioId?: unknown };
  try {
    eingang = await anfrage.json();
  } catch {
    return NextResponse.json({ fehler: "Ungültige Anfrage" }, { status: 400 });
  }

  const { datei, szenarioId } = eingang;
  if (typeof datei !== "string" || typeof szenarioId !== "string") {
    return NextResponse.json({ fehler: "Ungültige Anfrage" }, { status: 400 });
  }

  // Nur Dateinamen, keine Pfade: Sonst ließe sich über ../ alles abrufen,
  // was der Server ausliefert.
  if (!/^[\w-]+\.(jpe?g|png|webp)$/i.test(datei)) {
    return NextResponse.json({ gesehen: null, grund: "unzulaessige-datei" });
  }

  return NextResponse.json({ gesehen: await sehen(datei, szenarioId) });
}
