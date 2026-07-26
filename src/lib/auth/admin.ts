import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Zugangsschutz für den Admin-Bereich.
 *
 * Bewusst minimal: ein Passwort aus der Umgebung, ein signiertes Cookie.
 * Hier verwaltet eine Person ihre eigenen Vertriebsdemos – ein vollwertiges
 * Benutzersystem wäre Aufwand ohne Gegenwert.
 *
 * Was trotzdem sauber gemacht ist: Das Cookie enthält kein Passwort, sondern
 * eine HMAC-Signatur mit Ablaufzeit, und der Passwortvergleich läuft
 * zeitkonstant. Damit ist weder das Cookie fälschbar noch das Passwort über
 * die Antwortzeit erratbar.
 */

const COOKIE_NAME = "melda_admin";
const GUELTIG_TAGE = 7;

function geheimnis(): string {
  const wert = process.env.ADMIN_SESSION_SECRET;
  if (!wert) {
    throw new Error(
      "ADMIN_SESSION_SECRET fehlt. Bitte in .env.local bzw. in den " +
        "Vercel-Umgebungsvariablen hinterlegen (siehe .env.example).",
    );
  }
  return wert;
}

function signieren(gueltigBis: number): string {
  return createHmac("sha256", geheimnis()).update(String(gueltigBis)).digest("hex");
}

/** Prüft das eingegebene Passwort zeitkonstant. */
export function passwortStimmt(eingabe: string): boolean {
  const erwartet = process.env.ADMIN_PASSWORT;
  if (!erwartet) return false;

  const a = Buffer.from(eingabe.padEnd(64).slice(0, 64));
  const b = Buffer.from(erwartet.padEnd(64).slice(0, 64));
  return timingSafeEqual(a, b) && eingabe.length === erwartet.length;
}

/** Wert für das Sitzungscookie. */
export function sitzungAnlegen(): { name: string; wert: string; maxAlter: number } {
  const gueltigBis = Date.now() + GUELTIG_TAGE * 24 * 3600_000;
  return {
    name: COOKIE_NAME,
    wert: `${gueltigBis}.${signieren(gueltigBis)}`,
    maxAlter: GUELTIG_TAGE * 24 * 3600,
  };
}

export function cookieName(): string {
  return COOKIE_NAME;
}

/** Ist das mitgeschickte Cookie echt und noch gültig? */
export function sitzungGueltig(cookieWert: string | undefined): boolean {
  if (!cookieWert) return false;

  const [zeitTeil, signatur] = cookieWert.split(".");
  const gueltigBis = Number(zeitTeil);
  if (!Number.isFinite(gueltigBis) || gueltigBis < Date.now()) return false;
  if (!signatur) return false;

  try {
    const erwartet = signieren(gueltigBis);
    const a = Buffer.from(signatur, "hex");
    const b = Buffer.from(erwartet, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Ist der Admin-Bereich überhaupt eingerichtet? */
export function adminEingerichtet(): boolean {
  return Boolean(process.env.ADMIN_PASSWORT && process.env.ADMIN_SESSION_SECRET);
}
