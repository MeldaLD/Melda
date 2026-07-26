import { NextResponse, type NextRequest } from "next/server";

/**
 * Schützt den Admin-Bereich.
 *
 * Die Middleware prüft nur, ob überhaupt ein Cookie da ist – die Signatur
 * kann sie nicht prüfen, weil in der Edge-Laufzeit kein node:crypto
 * verfügbar ist. Die echte Prüfung macht das Admin-Layout serverseitig.
 *
 * Diese Doppelung ist Absicht: Die Middleware spart den Seitenaufbau für
 * offensichtlich Unangemeldete, das Layout ist die verlässliche Sperre.
 */
export function middleware(anfrage: NextRequest) {
  const pfad = anfrage.nextUrl.pathname;

  if (!pfad.startsWith("/admin") || pfad === "/admin/login") {
    return NextResponse.next();
  }

  if (!anfrage.cookies.get("melda_admin")?.value) {
    const ziel = new URL("/admin/login", anfrage.url);
    return NextResponse.redirect(ziel);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
