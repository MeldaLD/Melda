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

import { anfrageAnBetrieb, type Abstimmungsdaten } from "@config/abstimmung";
import { basisUrl } from "@/lib/basis-url";
import type { Terminvorschlag } from "./typen";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

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
 * Verschickt den Terminlink an einen Betrieb.
 *
 * Bewusst hier und nicht in einer Server Action: Ausgelöst wird das von der
 * Freigabe des Handwerkerauftrags, und die Freigabe wird an zwei Stellen
 * erteilt – im Freigabe-Center und über eine Automatikregel. Beide sollen
 * denselben Weg gehen.
 *
 * Gibt null zurück, wenn nichts zu tun war: Betrieb ohne Zustimmung, oder es
 * läuft bereits eine Anfrage.
 */
export async function terminanfrageAnlegen(
  db: Db,
  daten: Abstimmungsdaten,
  bezug: {
    tenantId: string;
    vorgangId: string;
    handwerkerId: string;
    kontaktKanal: string;
    abstimmungErlaubt: boolean;
  },
): Promise<{ token: string; link: string } | null> {
  if (!bezug.abstimmungErlaubt) return null;

  // Eine offene Anfrage reicht – sonst bekäme der Betrieb zwei Links.
  const { data: vorhanden } = await db
    .from("terminanfragen")
    .select("id")
    .eq("vorgang_id", bezug.vorgangId)
    .in("status", ["offen", "beantwortet"])
    .maybeSingle();
  if (vorhanden) return null;

  const token = tokenErzeugen();
  const link = terminLink(basisUrl(), token);
  const jetzt = new Date().toISOString();

  const { error } = await db.from("terminanfragen").insert({
    tenant_id: bezug.tenantId,
    vorgang_id: bezug.vorgangId,
    handwerker_id: bezug.handwerkerId,
    token,
    status: "offen",
    vorschlaege: [],
    ist_seed: false,
    erstellt_am: jetzt,
  });
  if (error) throw new Error(error.message);

  await db.from("nachrichten").insert({
    tenant_id: bezug.tenantId,
    vorgang_id: bezug.vorgangId,
    einheit_id: null,
    handwerker_id: bezug.handwerkerId,
    richtung: "verwalter",
    kanal: bezug.kontaktKanal,
    text: anfrageAnBetrieb(daten, link),
    ist_seed: false,
    gesendet_am: jetzt,
  });

  return { token, link };
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
