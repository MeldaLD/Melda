"use server";

import { revalidatePath } from "next/cache";

import { vorschlaegeVorbelegen } from "@config/abstimmung";
import { vorschlaegeSenden } from "@/app/termin/[token]/aktionen";
import {
  entscheiderName,
  freigabeAblehnungVermerken,
  freigabeWirkungAnwenden,
  terminlinkVerschicken,
} from "@/lib/daten/freigaben";
import { istSchreibenMoeglich } from "@/lib/daten/quelle";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  FreigabeTyp,
  Kanal,
  MandantEinstellungen,
  Prioritaet,
  VorgangStatus,
} from "@/lib/daten/typen";

/**
 * Schreibende Aktionen des Verwalter-Dashboards.
 *
 * Alles läuft serverseitig mit dem Service-Role-Key; aus dem Browser lässt
 * sich nichts schreiben, es gibt keine INSERT-Policy. Nach jeder Änderung
 * wird der betroffene Pfad neu gerendert, sodass die Oberfläche denselben
 * Stand zeigt wie die Datenbank.
 *
 * Ist keine Datenbank konfiguriert, geben die Aktionen freundlich
 * `gespeichert: false` zurück. Die Oberfläche verhält sich dann wie vorher –
 * eine Vorführung darf daran nicht scheitern.
 */

export type Ergebnis = {
  gespeichert: boolean;
  /**
   * Unterscheidet die beiden Fälle von `gespeichert: false`:
   * echter Fehler (true) gegenüber Vorschau ohne Datenbank (false).
   */
  fehlgeschlagen?: boolean;
  /** Nur gesetzt, wenn etwas nicht geklappt hat oder nur simuliert wurde. */
  hinweis?: string;
};

const OHNE_DATENBANK: Ergebnis = {
  gespeichert: false,
  hinweis: "In dieser Vorschau ohne Datenbank – nicht gespeichert.",
};

function fehler(was: string, meldung: string): Ergebnis {
  console.error(`[dashboard/aktionen] ${was}:`, meldung);
  return {
    gespeichert: false,
    fehlgeschlagen: true,
    hinweis: `${was} fehlgeschlagen: ${meldung}`,
  };
}

/** Lädt den Mandanten und stellt sicher, dass es ihn gibt. */
async function mandantOderNull(slug: string) {
  const db = supabaseAdmin();
  const { data } = await db
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
  revalidatePath(`/demo/${slug}/leitstand`, "layout");
}

// --- Freigabe-Center -------------------------------------------------------

/**
 * Entscheidet über eine Freigabe.
 *
 * Der bearbeitete Entwurfstext wird mitgespeichert – wer am Text der KI etwas
 * ändert, will nicht, dass die Änderung mit dem Klick verschwindet.
 */
export async function freigabeEntscheiden(eingabe: {
  slug: string;
  freigabeId: string;
  entscheidung: "freigegeben" | "abgelehnt";
  entwurfText: string;
  /** "Diese Art künftig automatisch freigeben" */
  automatik: boolean;
}): Promise<Ergebnis> {
  if (!istSchreibenMoeglich()) return OHNE_DATENBANK;

  try {
    const db = supabaseAdmin();
    const mandant = await mandantOderNull(eingabe.slug);
    if (!mandant) return fehler("Freigabe", "Unbekannter Mandant");

    const { data: freigabe } = await db
      .from("freigaben")
      .select("id, tenant_id, vorgang_id, typ, titel, empfaenger, status")
      .eq("id", eingabe.freigabeId)
      .eq("tenant_id", mandant.id)
      .maybeSingle();

    if (!freigabe) return fehler("Freigabe", "Diesen Vorschlag gibt es nicht mehr.");
    if (freigabe.status !== "offen") {
      return { gespeichert: true, hinweis: "War bereits entschieden." };
    }

    const akteur = await entscheiderName(db, mandant.id);
    const jetzt = new Date().toISOString();

    const { error } = await db
      .from("freigaben")
      .update({
        status: eingabe.entscheidung,
        entwurf_text: eingabe.entwurfText,
        entschieden_am: jetzt,
        entschieden_von: akteur,
        regel_automatisch: eingabe.automatik,
      })
      .eq("id", freigabe.id);
    if (error) return fehler("Freigabe", error.message);

    if (eingabe.entscheidung === "freigegeben") {
      await freigabeWirkungAnwenden(
        db,
        { ...freigabe, entwurf_text: eingabe.entwurfText },
        akteur,
      );
    } else {
      await freigabeAblehnungVermerken(db, freigabe, akteur);
    }

    // Die Regel gilt ab jetzt, nicht rückwirkend: Was bereits im Center
    // liegt, bleibt liegen und will einzeln entschieden werden.
    if (eingabe.automatik) {
      await automatikSetzen(db, mandant, freigabe.typ as FreigabeTyp, true);
    }

    neuLaden(eingabe.slug);
    return { gespeichert: true };
  } catch (ausnahme) {
    return fehler("Freigabe", meldungVon(ausnahme));
  }
}

async function automatikSetzen(
  db: ReturnType<typeof supabaseAdmin>,
  mandant: { id: string; einstellungen: MandantEinstellungen | null },
  typ: FreigabeTyp,
  an: boolean,
) {
  const bisher = new Set(mandant.einstellungen?.automatik_freigaben ?? []);
  if (an) bisher.add(typ);
  else bisher.delete(typ);

  await db
    .from("demo_tenants")
    .update({
      einstellungen: { ...mandant.einstellungen, automatik_freigaben: [...bisher] },
    })
    .eq("id", mandant.id);
}

/** Schaltet eine Automatikregel wieder ab – aus den Einstellungen heraus. */
export async function automatikAbschalten(
  slug: string,
  typ: FreigabeTyp,
): Promise<Ergebnis> {
  if (!istSchreibenMoeglich()) return OHNE_DATENBANK;

  try {
    const db = supabaseAdmin();
    const mandant = await mandantOderNull(slug);
    if (!mandant) return fehler("Regel", "Unbekannter Mandant");

    await automatikSetzen(db, mandant, typ, false);
    neuLaden(slug);
    return { gespeichert: true };
  } catch (ausnahme) {
    return fehler("Regel", meldungVon(ausnahme));
  }
}

// --- Rückrufe --------------------------------------------------------------

/**
 * Weist einen Rückruf einer Person zu und legt den Zeitpunkt fest.
 *
 * Genau der Schritt, den wir bewusst nicht dem Mieter überlassen: Wer
 * zurückruft und wann, weiß nur die Verwaltung.
 */
export async function rueckrufZuordnen(eingabe: {
  slug: string;
  terminId: string;
  mitarbeiterId: string;
  /** Lokale Zeitangabe aus dem Formular, z. B. "2026-07-28T10:00". */
  beginn: string;
  dauerMinuten?: number;
}): Promise<Ergebnis> {
  if (!istSchreibenMoeglich()) return OHNE_DATENBANK;

  try {
    const db = supabaseAdmin();
    const mandant = await mandantOderNull(eingabe.slug);
    if (!mandant) return fehler("Zuordnung", "Unbekannter Mandant");

    const beginn = new Date(eingabe.beginn);
    if (Number.isNaN(beginn.getTime())) {
      return fehler("Zuordnung", "Der Zeitpunkt ist ungültig.");
    }
    const ende = new Date(beginn.getTime() + (eingabe.dauerMinuten ?? 30) * 60_000);

    const { data: termin } = await db
      .from("termine")
      .select("id, vorgang_id, grund")
      .eq("id", eingabe.terminId)
      .eq("tenant_id", mandant.id)
      .maybeSingle();
    if (!termin) return fehler("Zuordnung", "Diesen Rückruf gibt es nicht mehr.");

    const { error } = await db
      .from("termine")
      .update({
        mitarbeiter_id: eingabe.mitarbeiterId,
        beginn: beginn.toISOString(),
        ende: ende.toISOString(),
        status: "bestaetigt",
      })
      .eq("id", termin.id);
    if (error) return fehler("Zuordnung", error.message);

    if (termin.vorgang_id) {
      const { data: person } = await db
        .from("mitarbeiter")
        .select("name")
        .eq("id", eingabe.mitarbeiterId)
        .maybeSingle();

      await db.from("vorgang_verlauf").insert({
        tenant_id: mandant.id,
        vorgang_id: termin.vorgang_id,
        ereignis: "rueckruf_zugeordnet",
        beschreibung: `Rückruf ${person?.name ? `an ${person.name} ` : ""}zugewiesen`,
        akteur: await entscheiderName(db, mandant.id),
        ist_seed: false,
        zeitpunkt: new Date().toISOString(),
      });
    }

    neuLaden(eingabe.slug);
    return { gespeichert: true };
  } catch (ausnahme) {
    return fehler("Zuordnung", meldungVon(ausnahme));
  }
}

// --- Vorgangsbearbeitung ---------------------------------------------------

/**
 * Schiebt einen Vorgang weiter, nachdem der Mitarbeitende gehandelt hat.
 *
 * Der Punkt, an dem der Assistent aufhört: Er hat aufgenommen, nachgefragt
 * und vorbereitet. Was daraus wird – Auftrag erteilt, Termin steht, erledigt –
 * entscheidet ein Mensch, und genau das wird hier festgehalten.
 */
export async function vorgangWeiterschieben(eingabe: {
  slug: string;
  vorgangId: string;
  status: VorgangStatus;
  /** Was der Mitarbeitende getan hat – landet in der Historie. */
  vermerk: string;
}): Promise<Ergebnis> {
  if (!istSchreibenMoeglich()) return OHNE_DATENBANK;

  try {
    const db = supabaseAdmin();
    const mandant = await mandantOderNull(eingabe.slug);
    if (!mandant) return fehler("Vorgang", "Unbekannter Mandant");

    const felder: Record<string, unknown> = { status: eingabe.status };
    if (eingabe.status === "erledigt") felder.erledigt_am = new Date().toISOString();

    const { error } = await db
      .from("vorgaenge")
      .update(felder)
      .eq("id", eingabe.vorgangId)
      .eq("tenant_id", mandant.id);
    if (error) return fehler("Vorgang", error.message);

    await db.from("vorgang_verlauf").insert({
      tenant_id: mandant.id,
      vorgang_id: eingabe.vorgangId,
      ereignis: eingabe.status,
      beschreibung: eingabe.vermerk,
      akteur: await entscheiderName(db, mandant.id),
      ist_seed: false,
      zeitpunkt: new Date().toISOString(),
    });

    neuLaden(eingabe.slug);
    return { gespeichert: true };
  } catch (ausnahme) {
    return fehler("Vorgang", meldungVon(ausnahme));
  }
}

// --- Abstimmung mit dem Betrieb --------------------------------------------
//
// Der Terminlink geht nicht über einen eigenen Knopf raus, sondern als
// Wirkung der Freigabe des Handwerkerauftrags – siehe
// src/lib/daten/freigaben.ts. So gibt es genau eine Stelle, an der jemand
// entscheidet, ob ein Auftrag den Betrieb erreicht.
//
// Hier stehen nur noch die Aktionen, die es danach braucht.

/**
 * Schickt den Terminlink erneut.
 *
 * Rückfallebene für den Fall, dass der Auftrag längst freigegeben ist, aber
 * keine Anfrage vorliegt – abgelaufener Link, oder ein Vorgang aus den
 * Beispieldaten. Setzt voraus, dass der Auftrag bereits raus ist: Vor der
 * Freigabe gibt es hier nichts zu schicken.
 */
export async function terminlinkErneutSenden(eingabe: {
  slug: string;
  vorgangId: string;
}): Promise<Ergebnis> {
  if (!istSchreibenMoeglich()) return OHNE_DATENBANK;

  try {
    const db = supabaseAdmin();
    const mandant = await mandantOderNull(eingabe.slug);
    if (!mandant) return fehler("Terminlink", "Unbekannter Mandant");

    const { data: vorgang } = await db
      .from("vorgaenge")
      .select("id, status, gewerk, handwerker_id")
      .eq("id", eingabe.vorgangId)
      .eq("tenant_id", mandant.id)
      .maybeSingle();
    if (!vorgang) return fehler("Terminlink", "Diesen Vorgang gibt es nicht.");

    if (vorgang.status === "neu" || vorgang.status === "in_pruefung") {
      return {
        gespeichert: false,
        fehlgeschlagen: true,
        hinweis:
          "Der Auftrag ist noch nicht freigegeben. Solange geht nichts an den Betrieb.",
      };
    }

    let betriebId = vorgang.handwerker_id;
    if (!betriebId) {
      const { data: standard } = await db
        .from("handwerker")
        .select("id")
        .eq("tenant_id", mandant.id)
        .eq("gewerk", vorgang.gewerk)
        .eq("ist_standard", true)
        .limit(1);
      betriebId = standard?.[0]?.id ?? null;
    }
    if (!betriebId) {
      return fehler("Terminlink", "Für dieses Gewerk ist kein Betrieb hinterlegt.");
    }

    const angelegt = await terminlinkVerschicken(db, mandant.id, vorgang.id, betriebId);
    if (!angelegt) {
      return {
        gespeichert: false,
        fehlgeschlagen: true,
        hinweis:
          "Entweder hat der Betrieb nicht zugestimmt, oder es läuft bereits eine Anfrage.",
      };
    }

    await db.from("vorgang_verlauf").insert({
      tenant_id: mandant.id,
      vorgang_id: vorgang.id,
      ereignis: "terminanfrage",
      beschreibung: "Terminlink erneut an den Betrieb verschickt",
      akteur: await entscheiderName(db, mandant.id),
      ist_seed: false,
      zeitpunkt: new Date().toISOString(),
    });

    neuLaden(eingabe.slug);
    return { gespeichert: true, hinweis: "Link verschickt." };
  } catch (ausnahme) {
    return fehler("Terminlink", meldungVon(ausnahme));
  }
}

/**
 * DEMO: Lässt den Betrieb sofort antworten.
 *
 * In einer Vorführung wartet niemand darauf, dass ein echter Handwerksbetrieb
 * auf den Link klickt. Dieser Knopf nimmt genau diesen einen Schritt vorweg –
 * und zwar über denselben Weg, den der Betrieb sonst geht: Es werden dieselbe
 * Server Action und dieselben Prüfungen benutzt wie hinter der Seite unter
 * /termin/<token>. Übersprungen wird nur der Mensch, nicht die Logik.
 *
 * Wer die Seite lieber selbst bedienen möchte – auf dem eigenen Telefon, als
 * wäre man der Betrieb –, öffnet einfach den Link daneben.
 */
export async function demoBetriebAntwortenLassen(eingabe: {
  slug: string;
  vorgangId: string;
}): Promise<Ergebnis> {
  if (!istSchreibenMoeglich()) return OHNE_DATENBANK;

  try {
    const db = supabaseAdmin();
    const mandant = await mandantOderNull(eingabe.slug);
    if (!mandant) return fehler("Antwort", "Unbekannter Mandant");

    const { data: anfrage } = await db
      .from("terminanfragen")
      .select("token, handwerker_id, wunsch_beginn, wunsch_ende, status")
      .eq("vorgang_id", eingabe.vorgangId)
      .eq("tenant_id", mandant.id)
      .order("erstellt_am", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!anfrage || anfrage.status !== "offen") {
      return fehler("Antwort", "Es wartet gerade keine Anfrage auf eine Antwort.");
    }

    const { data: betrieb } = await db
      .from("handwerker")
      .select("firma, reaktionszeit_h")
      .eq("id", anfrage.handwerker_id)
      .maybeSingle();

    const fenster = vorschlaegeVorbelegen({
      firma: mandant.firma,
      vorgangsnummer: 0,
      titel: "",
      objekt: "",
      einheit: "",
      mieterName: "",
      betrieb: betrieb?.firma ?? "",
      ansprechpartner: null,
      wunsch:
        anfrage.wunsch_beginn && anfrage.wunsch_ende
          ? {
              beginn: new Date(anfrage.wunsch_beginn),
              ende: new Date(anfrage.wunsch_ende),
            }
          : null,
      reaktionszeitH: betrieb?.reaktionszeit_h ?? 24,
      zusammenfassung: null,
      erkenntnis: null,
    });

    const antwort = await vorschlaegeSenden(
      anfrage.token,
      fenster.map((f) => ({
        beginn: f.beginn.toISOString(),
        ende: f.ende.toISOString(),
      })),
    );
    if (!antwort.ok) return fehler("Antwort", antwort.hinweis ?? "unbekannt");

    neuLaden(eingabe.slug);
    return {
      gespeichert: true,
      hinweis: `${betrieb?.firma ?? "Der Betrieb"} hat ${fenster.length} Fenster genannt.`,
    };
  } catch (ausnahme) {
    return fehler("Antwort", meldungVon(ausnahme));
  }
}

/**
 * Pflegt die Daten eines Handwerksbetriebs.
 *
 * Das ist die Voraussetzung dafür, dass wir die Abstimmung übernehmen können:
 * Ohne Ansprechpartner, Weg und Zustimmung schreibt der Assistent niemandem.
 */
export async function betriebPflegen(eingabe: {
  slug: string;
  handwerkerId: string;
  ansprechpartner: string;
  email: string;
  telefon: string;
  kontaktKanal: Kanal;
  arbeitszeiten: string;
  abstimmungErlaubt: boolean;
}): Promise<Ergebnis> {
  if (!istSchreibenMoeglich()) return OHNE_DATENBANK;

  try {
    const db = supabaseAdmin();
    const mandant = await mandantOderNull(eingabe.slug);
    if (!mandant) return fehler("Betrieb", "Unbekannter Mandant");

    // Ohne Kontaktweg keine Abstimmung – sonst stünde die Zusage im System
    // und der Assistent hätte niemanden, dem er schreiben könnte.
    const erreichbar =
      eingabe.kontaktKanal === "email" ? eingabe.email.trim() : eingabe.telefon.trim();
    if (eingabe.abstimmungErlaubt && !erreichbar) {
      return {
        gespeichert: false,
        fehlgeschlagen: true,
        hinweis:
          eingabe.kontaktKanal === "email"
            ? "Für die Abstimmung per E-Mail fehlt die Adresse."
            : "Für die Abstimmung fehlt die Telefonnummer.",
      };
    }

    const { error } = await db
      .from("handwerker")
      .update({
        ansprechpartner: eingabe.ansprechpartner.trim() || null,
        email: eingabe.email.trim() || null,
        telefon: eingabe.telefon.trim() || null,
        kontakt_kanal: eingabe.kontaktKanal,
        arbeitszeiten: eingabe.arbeitszeiten.trim() || null,
        abstimmung_erlaubt: eingabe.abstimmungErlaubt,
      })
      .eq("id", eingabe.handwerkerId)
      .eq("tenant_id", mandant.id);
    if (error) return fehler("Betrieb", error.message);

    neuLaden(eingabe.slug);
    return { gespeichert: true };
  } catch (ausnahme) {
    return fehler("Betrieb", meldungVon(ausnahme));
  }
}

// --- Assistent -------------------------------------------------------------

/**
 * Legt einen Mieter an.
 *
 * Bewusst ohne Zugangsdaten: Erreichbar wird der Mieter über seine
 * Mobilnummer. Das ist der Punkt, an dem sich die Lösung von Portallösungen
 * unterscheidet, und deshalb erzeugt die Aktion auch gleich die
 * Begrüßungsnachricht, die im Postfach nachweisbar steht.
 */
export async function mieterAnlegen(eingabe: {
  slug: string;
  objektId: string;
  lage: string;
  name: string;
  telefon: string;
}): Promise<Ergebnis> {
  if (!istSchreibenMoeglich()) return OHNE_DATENBANK;

  try {
    const db = supabaseAdmin();
    const mandant = await mandantOderNull(eingabe.slug);
    if (!mandant) return fehler("Anlegen", "Unbekannter Mandant");

    const { data: objekt } = await db
      .from("objekte")
      .select("id, name, einheiten_anzahl")
      .eq("id", eingabe.objektId)
      .eq("tenant_id", mandant.id)
      .maybeSingle();
    if (!objekt) return fehler("Anlegen", "Dieses Objekt gibt es nicht.");

    const { data: vorhanden } = await db
      .from("einheiten")
      .select("id")
      .eq("objekt_id", objekt.id)
      .eq("bezeichnung", eingabe.lage)
      .maybeSingle();
    if (vorhanden) {
      return {
        gespeichert: false,
        hinweis: `${objekt.name}, ${eingabe.lage} ist schon belegt.`,
      };
    }

    const { data: einheit, error } = await db
      .from("einheiten")
      .insert({
        tenant_id: mandant.id,
        objekt_id: objekt.id,
        bezeichnung: eingabe.lage,
        mieter_name: eingabe.name,
        mieter_telefon: eingabe.telefon,
      })
      .select("id")
      .single();
    if (error || !einheit) return fehler("Anlegen", error?.message ?? "unbekannt");

    await db
      .from("objekte")
      .update({ einheiten_anzahl: (objekt.einheiten_anzahl ?? 0) + 1 })
      .eq("id", objekt.id);

    await db.from("nachrichten").insert({
      tenant_id: mandant.id,
      vorgang_id: null,
      einheit_id: einheit.id,
      richtung: "verwalter",
      kanal: "whatsapp",
      text:
        `Guten Tag ${eingabe.name}, hier ist ${mandant.firma}. ` +
        `Sie erreichen uns ab sofort unter dieser Nummer – einfach schreiben, ` +
        `gern auch mit Foto. Eine App brauchen Sie dafür nicht.`,
      ist_seed: false,
      gesendet_am: new Date().toISOString(),
    });

    neuLaden(eingabe.slug);
    return { gespeichert: true };
  } catch (ausnahme) {
    return fehler("Anlegen", meldungVon(ausnahme));
  }
}

/** Trägt eine Notiz als Verlaufseintrag an einem Vorgang nach. */
export async function notizEintragen(eingabe: {
  slug: string;
  vorgangId: string;
  text: string;
}): Promise<Ergebnis> {
  if (!istSchreibenMoeglich()) return OHNE_DATENBANK;

  try {
    const db = supabaseAdmin();
    const mandant = await mandantOderNull(eingabe.slug);
    if (!mandant) return fehler("Notiz", "Unbekannter Mandant");

    const { error } = await db.from("vorgang_verlauf").insert({
      tenant_id: mandant.id,
      vorgang_id: eingabe.vorgangId,
      ereignis: "notiz",
      beschreibung: eingabe.text,
      akteur: await entscheiderName(db, mandant.id),
      ist_seed: false,
      zeitpunkt: new Date().toISOString(),
    });
    if (error) return fehler("Notiz", error.message);

    neuLaden(eingabe.slug);
    return { gespeichert: true };
  } catch (ausnahme) {
    return fehler("Notiz", meldungVon(ausnahme));
  }
}

// --- Einstellungen ---------------------------------------------------------

/** Speichert die Regelwerte des Mandanten. */
export async function einstellungenSpeichern(
  slug: string,
  _zustand: Ergebnis | null,
  daten: FormData,
): Promise<Ergebnis> {
  if (!istSchreibenMoeglich()) return OHNE_DATENBANK;

  try {
    const db = supabaseAdmin();
    const mandant = await mandantOderNull(slug);
    if (!mandant) return fehler("Einstellungen", "Unbekannter Mandant");

    const stunden = (feld: Prioritaet, ersatz: number) => {
      const wert = Number(daten.get(`sla_${feld}`));
      return Number.isFinite(wert) && wert > 0 ? Math.round(wert) : ersatz;
    };

    const alt = mandant.einstellungen ?? {};
    const grenze = Number(daten.get("kleinreparatur_grenze_euro"));

    const neu: MandantEinstellungen = {
      ...alt,
      sla_stunden: {
        notfall: stunden("notfall", alt.sla_stunden?.notfall ?? 4),
        dringend: stunden("dringend", alt.sla_stunden?.dringend ?? 48),
        routine: stunden("routine", alt.sla_stunden?.routine ?? 120),
      },
      kleinreparatur_grenze_euro:
        Number.isFinite(grenze) && grenze > 0
          ? Math.round(grenze)
          : alt.kleinreparatur_grenze_euro,
      notfall_telefon: String(daten.get("notfall_telefon") ?? "").trim() || null,
      hinweis: String(daten.get("hinweis") ?? "").trim() || undefined,
    };

    const { error } = await db
      .from("demo_tenants")
      .update({ einstellungen: neu })
      .eq("id", mandant.id);
    if (error) return fehler("Einstellungen", error.message);

    neuLaden(slug);
    return { gespeichert: true, hinweis: "Gespeichert." };
  } catch (ausnahme) {
    return fehler("Einstellungen", meldungVon(ausnahme));
  }
}

// --- Hilfsmittel -----------------------------------------------------------

function meldungVon(ausnahme: unknown): string {
  return ausnahme instanceof Error ? ausnahme.message : "Unbekannter Fehler";
}
