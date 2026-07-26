"use server";

import { revalidatePath } from "next/cache";

import { entscheiderName } from "@/lib/daten/freigaben";
import { istSchreibenMoeglich } from "@/lib/daten/quelle";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Gewerk, MandantEinstellungen } from "@/lib/daten/typen";

/**
 * Die wenigen Dinge, die die Hausverwaltung selbst tut.
 *
 * Das ist Absicht und keine Lücke: Die Ausführung liegt bei uns. Was bleibt,
 * ist die Kontrollpflicht – und die braucht genau zwei Hebel.
 *
 *   1. Grenzen setzen, bis wohin wir ohne Rückfrage handeln dürfen.
 *   2. In einen einzelnen Vorgang eingreifen, wenn etwas nicht passt.
 *
 * Alles andere – Freigaben im Einzelfall, Betriebspflege, Terminabstimmung –
 * steht im Leitstand unter src/app/demo/[slug]/leitstand/aktionen.ts.
 */

export type Ergebnis = {
  gespeichert: boolean;
  fehlgeschlagen?: boolean;
  hinweis?: string;
};

const OHNE_DATENBANK: Ergebnis = {
  gespeichert: false,
  hinweis: "In dieser Vorschau ohne Datenbank – nicht gespeichert.",
};

function fehler(was: string, meldung: string): Ergebnis {
  console.error(`[verwalter/aktionen] ${was}:`, meldung);
  return {
    gespeichert: false,
    fehlgeschlagen: true,
    hinweis: `${was} fehlgeschlagen: ${meldung}`,
  };
}

async function mandantOderNull(slug: string) {
  const { data } = await supabaseAdmin()
    .from("demo_tenants")
    .select("id, firma, einstellungen")
    .eq("slug", slug)
    .maybeSingle();
  return data as {
    id: string;
    firma: string;
    einstellungen: MandantEinstellungen | null;
  } | null;
}

function neuLaden(slug: string) {
  revalidatePath(`/demo/${slug}/dashboard`, "layout");
  // Der Leitstand zeigt dieselben Daten – er muss mit.
  revalidatePath(`/demo/${slug}/leitstand`, "layout");
}

// --- Grenzen ---------------------------------------------------------------

/**
 * Setzt fest, bis wohin wir ohne Rückfrage handeln.
 *
 * Der wichtigste Bildschirm der Verwaltersicht. Wer hier eine Zahl ändert,
 * verschiebt, wie viel Arbeit auf seinem Tisch landet – und behält damit die
 * Kontrolle, ohne jeden Einzelfall zu entscheiden.
 */
export async function grenzenSpeichern(
  slug: string,
  _zustand: Ergebnis | null,
  daten: FormData,
): Promise<Ergebnis> {
  if (!istSchreibenMoeglich()) return OHNE_DATENBANK;

  try {
    const mandant = await mandantOderNull(slug);
    if (!mandant) return fehler("Grenzen", "Unbekannter Mandant");

    const betrag = Number(daten.get("freigabe_ab_euro"));
    const alt = mandant.einstellungen ?? {};

    const neu: MandantEinstellungen = {
      ...alt,
      freigabe_ab_euro:
        Number.isFinite(betrag) && betrag >= 0
          ? Math.round(betrag)
          : alt.freigabe_ab_euro,
      immer_vorlegen_gewerke: daten.getAll("immer_vorlegen").map(String) as Gewerk[],
      notfall_telefon: String(daten.get("notfall_telefon") ?? "").trim() || null,
    };

    const { error } = await supabaseAdmin()
      .from("demo_tenants")
      .update({ einstellungen: neu })
      .eq("id", mandant.id);
    if (error) return fehler("Grenzen", error.message);

    neuLaden(slug);
    return { gespeichert: true, hinweis: "Gespeichert." };
  } catch (ausnahme) {
    return fehler("Grenzen", meldungVon(ausnahme));
  }
}

// --- Eingreifen ------------------------------------------------------------

export type Eingriff = "stoppen" | "rueckruf" | "freigeben";

/**
 * Der Griff ins Steuer bei einem einzelnen Vorgang.
 *
 * Drei Möglichkeiten, mehr braucht es nicht: anhalten, sich melden lassen,
 * oder etwas ausdrücklich durchwinken, das über der Grenze lag. Jeder
 * Eingriff steht danach im Verlauf – auch das gehört zur Rechenschaft.
 */
export async function eingreifen(eingabe: {
  slug: string;
  vorgangId: string;
  art: Eingriff;
  bemerkung?: string;
}): Promise<Ergebnis> {
  if (!istSchreibenMoeglich()) return OHNE_DATENBANK;

  try {
    const db = supabaseAdmin();
    const mandant = await mandantOderNull(eingabe.slug);
    if (!mandant) return fehler("Eingriff", "Unbekannter Mandant");

    const akteur = await entscheiderName(db, mandant.id);
    const jetzt = new Date().toISOString();
    const zusatz = eingabe.bemerkung?.trim() ? ` – ${eingabe.bemerkung.trim()}` : "";

    let beschreibung: string;

    switch (eingabe.art) {
      case "stoppen": {
        const { error } = await db
          .from("vorgaenge")
          .update({ status: "storniert" })
          .eq("id", eingabe.vorgangId)
          .eq("tenant_id", mandant.id);
        if (error) return fehler("Eingriff", error.message);

        // Offene Vorschläge zu einem gestoppten Vorgang wären ein Widerspruch.
        await db
          .from("freigaben")
          .update({
            status: "abgelehnt",
            entschieden_am: jetzt,
            entschieden_von: akteur,
          })
          .eq("vorgang_id", eingabe.vorgangId)
          .eq("status", "offen");

        beschreibung = `Von der Hausverwaltung gestoppt${zusatz}`;
        break;
      }

      case "rueckruf":
        beschreibung = `Hausverwaltung bittet um Rücksprache${zusatz}`;
        break;

      case "freigeben": {
        await db
          .from("freigaben")
          .update({
            status: "freigegeben",
            entschieden_am: jetzt,
            entschieden_von: akteur,
          })
          .eq("vorgang_id", eingabe.vorgangId)
          .eq("status", "offen");
        beschreibung = `Von der Hausverwaltung ausdrücklich freigegeben${zusatz}`;
        break;
      }
    }

    const { error } = await db.from("vorgang_verlauf").insert({
      tenant_id: mandant.id,
      vorgang_id: eingabe.vorgangId,
      ereignis: `verwalter_${eingabe.art}`,
      beschreibung,
      akteur,
      ist_seed: false,
      zeitpunkt: jetzt,
    });
    if (error) return fehler("Eingriff", error.message);

    neuLaden(eingabe.slug);
    return { gespeichert: true };
  } catch (ausnahme) {
    return fehler("Eingriff", meldungVon(ausnahme));
  }
}

function meldungVon(ausnahme: unknown): string {
  return ausnahme instanceof Error ? ausnahme.message : "Unbekannter Fehler";
}
