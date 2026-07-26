"use server";

import { revalidatePath } from "next/cache";

import { auswahlAnMieter, begruendung, bestaetigungAnMieter } from "@config/abstimmung";
import { istSchreibenMoeglich } from "@/lib/daten/quelle";
import { vorschlaegeLesen } from "@/lib/daten/terminanfrage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Terminvorschlag } from "@/lib/daten/typen";

/**
 * Was hinter dem Terminlink passiert.
 *
 * Der Betrieb ist hier nicht angemeldet – der Token in der Adresse ist der
 * einzige Ausweis. Deshalb wird konsequent über ihn gesucht und nie über
 * IDs aus dem Formular: Wer den Link nicht hat, kann nichts anfassen, und
 * wer ihn hat, kommt nur an diesen einen Vorgang.
 */

export type Antwort = { ok: boolean; hinweis?: string };

/** Nimmt die Zeitfenster entgegen, die der Betrieb genannt hat. */
export async function vorschlaegeSenden(
  token: string,
  vorschlaege: Terminvorschlag[],
): Promise<Antwort> {
  if (!istSchreibenMoeglich()) {
    return { ok: false, hinweis: "In dieser Vorschau ohne Datenbank." };
  }

  const geprueft = vorschlaegeLesen(vorschlaege);
  if (!geprueft.length) {
    return { ok: false, hinweis: "Bitte nennen Sie mindestens ein Zeitfenster." };
  }

  try {
    const db = supabaseAdmin();
    const { data: anfrage } = await db
      .from("terminanfragen")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!anfrage) return { ok: false, hinweis: "Dieser Link ist nicht mehr gültig." };
    if (anfrage.status !== "offen") {
      return { ok: false, hinweis: "Diese Anfrage wurde bereits beantwortet." };
    }
    if (new Date(anfrage.gueltig_bis) < new Date()) {
      await db
        .from("terminanfragen")
        .update({ status: "abgelaufen" })
        .eq("id", anfrage.id);
      return { ok: false, hinweis: "Dieser Link ist abgelaufen." };
    }

    const jetzt = new Date();
    const { error } = await db
      .from("terminanfragen")
      .update({
        vorschlaege: geprueft,
        status: "beantwortet",
        beantwortet_am: jetzt.toISOString(),
      })
      .eq("id", anfrage.id);
    if (error) return { ok: false, hinweis: error.message };

    const { data: betrieb } = await db
      .from("handwerker")
      .select("firma, kontakt_kanal")
      .eq("id", anfrage.handwerker_id)
      .maybeSingle();

    const { data: vorgang } = await db
      .from("vorgaenge")
      .select("id, titel, einheit_id")
      .eq("id", anfrage.vorgang_id)
      .maybeSingle();

    // Die Antwort des Betriebs im Verlauf festhalten …
    await db.from("nachrichten").insert({
      tenant_id: anfrage.tenant_id,
      vorgang_id: anfrage.vorgang_id,
      einheit_id: null,
      handwerker_id: anfrage.handwerker_id,
      richtung: "handwerker",
      kanal: betrieb?.kontakt_kanal ?? "email",
      text: "Mögliche Termine:\n" + geprueft.map((v) => `– ${zeitraum(v)}`).join("\n"),
      ist_seed: false,
      gesendet_am: jetzt.toISOString(),
    });

    // … und dem Mieter die Auswahl schicken. Die drei Fenster stehen in der
    // Nachricht; ausgewählt wird im Chat.
    await db.from("nachrichten").insert({
      tenant_id: anfrage.tenant_id,
      vorgang_id: anfrage.vorgang_id,
      einheit_id: vorgang?.einheit_id ?? null,
      handwerker_id: null,
      richtung: "ki",
      kanal: "whatsapp",
      text:
        auswahlAnMieter(
          {
            firma: "",
            vorgangsnummer: 0,
            titel: vorgang?.titel ?? "Ihre Meldung",
            objekt: "",
            einheit: "",
            mieterName: "",
            betrieb: betrieb?.firma ?? "Der Betrieb",
            ansprechpartner: null,
            wunsch: null,
            reaktionszeitH: 24,
            zusammenfassung: null,
            erkenntnis: null,
          },
          geprueft.length,
        ) +
        "\n" +
        geprueft.map((v, i) => `${i + 1}. ${zeitraum(v)}`).join("\n"),
      meta: { art: "terminauswahl", token, vorschlaege: geprueft },
      ist_seed: false,
      gesendet_am: new Date(jetzt.getTime() + 1000).toISOString(),
    });

    await db.from("vorgang_verlauf").insert({
      tenant_id: anfrage.tenant_id,
      vorgang_id: anfrage.vorgang_id,
      ereignis: "termine_vorgeschlagen",
      beschreibung:
        `${betrieb?.firma ?? "Der Betrieb"} hat ${geprueft.length} Zeitfenster ` +
        "genannt – zur Auswahl an den Mieter geschickt",
      akteur: betrieb?.firma ?? "Handwerksbetrieb",
      ist_seed: false,
      zeitpunkt: new Date(jetzt.getTime() + 2000).toISOString(),
    });

    revalidatePath(`/termin/${token}`);
    return { ok: true };
  } catch (ausnahme) {
    console.error("[termin/vorschlaegeSenden]", ausnahme);
    return { ok: false, hinweis: "Das hat leider nicht geklappt." };
  }
}

/**
 * Der Mieter wählt eines der Fenster.
 *
 * Aufgerufen aus dem Chat. Ergebnis ist kein bestätigter Termin, sondern eine
 * Terminbestätigung im Freigabe-Center – bestätigt wird von der Verwaltung.
 */
export async function terminWaehlen(token: string, index: number): Promise<Antwort> {
  if (!istSchreibenMoeglich()) {
    return { ok: false, hinweis: "In dieser Vorschau ohne Datenbank." };
  }

  try {
    const db = supabaseAdmin();
    const { data: anfrage } = await db
      .from("terminanfragen")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (!anfrage) return { ok: false, hinweis: "Diese Auswahl ist nicht mehr gültig." };
    if (anfrage.status !== "beantwortet") {
      return { ok: false, hinweis: "Hier ist gerade nichts auszuwählen." };
    }

    const vorschlaege = vorschlaegeLesen(anfrage.vorschlaege);
    const gewaehlt = vorschlaege[index];
    if (!gewaehlt) return { ok: false, hinweis: "Dieses Zeitfenster gibt es nicht." };

    const { data: mandant } = await db
      .from("demo_tenants")
      .select("firma")
      .eq("id", anfrage.tenant_id)
      .maybeSingle();
    const { data: betrieb } = await db
      .from("handwerker")
      .select("firma")
      .eq("id", anfrage.handwerker_id)
      .maybeSingle();
    const { data: vorgang } = await db
      .from("vorgaenge")
      .select("id, nummer, titel, einheit_id")
      .eq("id", anfrage.vorgang_id)
      .maybeSingle();
    const { data: einheit } = vorgang?.einheit_id
      ? await db
          .from("einheiten")
          .select("bezeichnung, mieter_name")
          .eq("id", vorgang.einheit_id)
          .maybeSingle()
      : { data: null };

    const daten = {
      firma: mandant?.firma ?? "Ihre Hausverwaltung",
      vorgangsnummer: vorgang?.nummer ?? 0,
      titel: vorgang?.titel ?? "Ihre Meldung",
      objekt: "",
      einheit: einheit?.bezeichnung ?? "",
      mieterName: einheit?.mieter_name ?? "Mieter",
      betrieb: betrieb?.firma ?? "Der Betrieb",
      ansprechpartner: null,
      wunsch: null,
      reaktionszeitH: 24,
      zusammenfassung: null,
      erkenntnis: null,
    };
    const fenster = {
      beginn: new Date(gewaehlt.beginn),
      ende: new Date(gewaehlt.ende),
    };

    await db
      .from("terminanfragen")
      .update({ status: "bestaetigt", gewaehlt: index })
      .eq("id", anfrage.id);

    // Termin vormerken – bestätigt wird er mit der Freigabe.
    const zeile = {
      tenant_id: anfrage.tenant_id,
      vorgang_id: anfrage.vorgang_id,
      typ: "handwerkertermin" as const,
      titel: daten.titel,
      handwerker_id: anfrage.handwerker_id,
      einheit_id: vorgang?.einheit_id ?? null,
      beginn: gewaehlt.beginn,
      ende: gewaehlt.ende,
      status: "geplant" as const,
      ist_seed: false,
    };
    const { data: vorhanden } = await db
      .from("termine")
      .select("id")
      .eq("vorgang_id", anfrage.vorgang_id)
      .eq("typ", "handwerkertermin")
      .maybeSingle();

    if (vorhanden) {
      await db.from("termine").update(zeile).eq("id", vorhanden.id);
    } else {
      await db.from("termine").insert(zeile);
    }

    await db.from("freigaben").insert({
      tenant_id: anfrage.tenant_id,
      vorgang_id: anfrage.vorgang_id,
      typ: "terminbestaetigung",
      titel: `Termin mit ${daten.betrieb}: ${zeitraum(gewaehlt)}`,
      begruendung: begruendung(daten, fenster),
      entwurf_text: bestaetigungAnMieter(daten, fenster),
      empfaenger: daten.mieterName,
      status: "offen",
      ist_seed: false,
    });

    await db.from("vorgang_verlauf").insert({
      tenant_id: anfrage.tenant_id,
      vorgang_id: anfrage.vorgang_id,
      ereignis: "termin_gewaehlt",
      beschreibung:
        `${daten.mieterName} hat ${zeitraum(gewaehlt)} gewählt – ` +
        "Bestätigung liegt zur Freigabe bereit",
      akteur: daten.mieterName,
      ist_seed: false,
      zeitpunkt: new Date().toISOString(),
    });

    return { ok: true };
  } catch (ausnahme) {
    console.error("[termin/terminWaehlen]", ausnahme);
    return { ok: false, hinweis: "Das hat leider nicht geklappt." };
  }
}

function zeitraum(v: Terminvorschlag): string {
  const tag = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Berlin",
  }).format(new Date(v.beginn));
  const zeit = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  return `${tag}, ${zeit.format(new Date(v.beginn))}–${zeit.format(new Date(v.ende))} Uhr`;
}
