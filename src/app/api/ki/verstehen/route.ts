import { NextResponse } from "next/server";

import { verstehen } from "@/lib/ki/verstehen";
import { kiVerfuegbar } from "@/lib/ki/zugang";

/**
 * Ordnet einen Freitext des Mieters einem Thema zu.
 *
 * Der Chat fragt hier erst, wenn die Stichwortsuche im Browser nichts
 * gefunden hat – siehe src/lib/chat/useChat.ts. Damit kostet der Normalfall
 * nichts und der schwierige Fall ein Zehntelcent.
 *
 * Antwortet immer mit 200 und einem Feld "verstanden", das auch null sein
 * darf. Ein Fehlerstatus würde im Browser als Ausnahme landen; hier ist
 * "ich weiß es nicht" aber ein gültiges Ergebnis und keine Störung.
 */

export async function POST(anfrage: Request) {
  if (!kiVerfuegbar()) {
    return NextResponse.json({ verstanden: null, grund: "kein-schluessel" });
  }

  let text: unknown;
  try {
    text = (await anfrage.json())?.text;
  } catch {
    return NextResponse.json({ fehler: "Ungültige Anfrage" }, { status: 400 });
  }

  if (typeof text !== "string" || text.trim().length < 3) {
    return NextResponse.json({ verstanden: null, grund: "zu-kurz" });
  }

  const verstanden = await verstehen(text);
  return NextResponse.json({ verstanden });
}
