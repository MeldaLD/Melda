import "server-only";

/**
 * Terminanfragen: der Link an den Handwerksbetrieb.
 *
 * Der Ablauf in einem Satz: Wir schicken dem Betrieb einen Link, er nennt
 * dort drei Zeitfenster, der Mieter wählt eines aus, die Verwaltung bestätigt.
 *
 * Warum ein Link und keine Anbindung: Kleine Handwerksbetriebe haben selten
 * eine Software mit Schnittstelle, und wo es eine gibt, ist sie es nicht
 * wert, für einen einzelnen Auftrag angebunden zu werden. Ein Link, der auf
 * dem Telefon in zwanzig Sekunden erledigt ist, funktioniert dagegen bei
 * jedem – auch bei dem Betrieb, der noch mit Papierkalender arbeitet.
 */

import { randomBytes } from "node:crypto";

import type { Terminvorschlag } from "./typen";

/** Erzeugt einen nicht erratbaren Token für die öffentliche URL. */
export function tokenErzeugen(): string {
  // 24 Byte -> 32 Zeichen base64url. Dahinter stehen Auftragsdaten ohne
  // Anmeldung, deshalb nicht kürzer.
  return randomBytes(24).toString("base64url");
}

/** Öffentliche Adresse, die der Betrieb bekommt. */
export function terminLink(basis: string, token: string): string {
  return `${basis.replace(/\/$/, "")}/termin/${token}`;
}

/**
 * Liest die Vorschläge aus dem JSON-Feld und verwirft Unbrauchbares.
 * Die Spalte ist jsonb – auf verlässliche Form kann man sich nicht verlassen.
 */
export function vorschlaegeLesen(roh: unknown): Terminvorschlag[] {
  if (!Array.isArray(roh)) return [];

  return roh
    .slice(0, 3)
    .map((eintrag) => {
      if (!eintrag || typeof eintrag !== "object") return null;
      const { beginn, ende } = eintrag as Record<string, unknown>;
      if (typeof beginn !== "string" || typeof ende !== "string") return null;
      if (Number.isNaN(Date.parse(beginn)) || Number.isNaN(Date.parse(ende)))
        return null;
      if (Date.parse(ende) <= Date.parse(beginn)) return null;
      return { beginn, ende };
    })
    .filter((v): v is Terminvorschlag => v !== null);
}
