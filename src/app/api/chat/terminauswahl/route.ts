import { NextResponse } from "next/server";

import { terminWaehlen } from "@/app/termin/[token]/aktionen";

/**
 * Der Mieter wählt eines der Zeitfenster, die der Betrieb genannt hat.
 *
 * Die eigentliche Arbeit macht die Server Action, die auch hinter der Seite
 * des Betriebs steht – ein Codepfad für beide Seiten der Abstimmung. Diese
 * Route existiert nur, weil der Chat aus dem Browser heraus ruft.
 */
export async function POST(anfrage: Request) {
  let eingang: { token?: string; index?: number };
  try {
    eingang = await anfrage.json();
  } catch {
    return NextResponse.json({ fehler: "Ungültige Anfrage" }, { status: 400 });
  }

  if (typeof eingang.token !== "string" || typeof eingang.index !== "number") {
    return NextResponse.json({ fehler: "Unvollständige Angaben" }, { status: 400 });
  }

  const ergebnis = await terminWaehlen(eingang.token, eingang.index);
  return NextResponse.json({ gespeichert: ergebnis.ok, grund: ergebnis.hinweis });
}
