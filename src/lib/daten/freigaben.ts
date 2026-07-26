import "server-only";

/**
 * Was eine erteilte Freigabe auslöst.
 *
 * Das ist der Kern des Vertrauensarguments und deshalb an genau einer Stelle
 * beschrieben: Der Assistent bereitet vor, der Verwalter entscheidet – und
 * erst die Entscheidung bewegt den Vorgang.
 *
 * Zwei Aufrufer teilen sich diese Logik:
 *   - das Freigabe-Center im Dashboard (Verwalter drückt auf "Freigeben")
 *   - der Chat, wenn für diese Art von Freigabe eine Automatikregel gilt
 * Ohne gemeinsame Funktion würden beide Wege mit der Zeit auseinanderlaufen.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { terminanfrageAnlegen } from "./terminanfrage";
import type { Freigabe, Vorgang } from "./typen";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

/** Wer entschieden hat – erscheint im Verlauf und auf der Freigabe. */
export async function entscheiderName(db: Db, tenantId: string): Promise<string> {
  const { data } = await db
    .from("mitarbeiter")
    .select("name")
    .eq("tenant_id", tenantId)
    .order("sortierung")
    .limit(1);
  // DEMO: Es gibt keine Anmeldung im Dashboard. Als Entscheider steht deshalb
  // die erste hinterlegte Person – im Echtbetrieb der angemeldete Nutzer.
  return data?.[0]?.name ?? "Verwaltung";
}

/**
 * Führt aus, was hinter einer erteilten Freigabe steht.
 *
 * Ändert je nach Art den Vorgang, verschickt die Nachricht an den Mieter und
 * schreibt in jedem Fall einen Verlaufseintrag. Die Freigabezeile selbst wird
 * hier nicht angefasst – darum kümmert sich der Aufrufer.
 */
export async function freigabeWirkungAnwenden(
  db: Db,
  freigabe: Pick<Freigabe, "id" | "tenant_id" | "vorgang_id" | "typ" | "empfaenger"> & {
    entwurf_text: string;
  },
  akteur: string,
  automatisch = false,
): Promise<void> {
  const zusatz = automatisch ? " (Automatikregel)" : "";

  if (!freigabe.vorgang_id) {
    return;
  }

  const { data: vorgang } = await db
    .from("vorgaenge")
    .select("id, status, gewerk, einheit_id, handwerker_id")
    .eq("id", freigabe.vorgang_id)
    .maybeSingle();
  if (!vorgang) return;

  const v = vorgang as Pick<
    Vorgang,
    "id" | "status" | "gewerk" | "einheit_id" | "handwerker_id"
  >;

  let beschreibung: string;

  switch (freigabe.typ) {
    case "handwerkerauftrag": {
      // Standardbetrieb des Gewerks, falls noch keiner zugeordnet ist.
      let betriebId = v.handwerker_id;
      if (!betriebId) {
        const { data: betriebe } = await db
          .from("handwerker")
          .select("id")
          .eq("tenant_id", freigabe.tenant_id)
          .eq("gewerk", v.gewerk)
          .eq("ist_standard", true)
          .limit(1);
        betriebId = betriebe?.[0]?.id ?? null;
      }

      // Nur nach vorn schieben. Ist der Vorgang schon weiter, bleibt er es.
      if (v.status === "neu" || v.status === "in_pruefung") {
        await db
          .from("vorgaenge")
          .update({ status: "an_handwerker", handwerker_id: betriebId })
          .eq("id", v.id);
      } else if (!v.handwerker_id && betriebId) {
        await db.from("vorgaenge").update({ handwerker_id: betriebId }).eq("id", v.id);
      }

      beschreibung = `Auftrag an ${freigabe.empfaenger ?? "den Partnerbetrieb"} freigegeben und versendet${zusatz}`;

      // Genau hier – und nur hier – geht etwas an den Betrieb raus.
      //
      // Die Terminabstimmung ist keine eigene Handlung neben der Freigabe,
      // sondern deren Ausführung: Wer den Auftrag freigibt, gibt frei, dass
      // der Betrieb angesprochen wird. Ohne diese Kopplung ließe sich die
      // Freigabe umgehen, und das Versprechen "die KI entscheidet nichts
      // allein" wäre eines auf dem Papier.
      const angelegt = betriebId
        ? await terminlinkVerschicken(db, freigabe.tenant_id, v.id, betriebId)
        : null;
      if (angelegt) {
        beschreibung +=
          `. Terminlink an ${freigabe.empfaenger ?? "den Betrieb"} verschickt – ` +
          "der Betrieb nennt drei Fenster, der Mieter wählt";
      }
      break;
    }

    case "mieter_antwort": {
      // Die freigegebene Antwort geht als echte WhatsApp-Nachricht raus und
      // steht damit im Verlauf des Vorgangs – dort, wo auch der Mieter-Chat
      // steht. Ohne diese Zeile bliebe "versendet" eine Behauptung.
      await db.from("nachrichten").insert({
        tenant_id: freigabe.tenant_id,
        vorgang_id: v.id,
        einheit_id: v.einheit_id,
        richtung: "verwalter",
        kanal: "whatsapp",
        text: freigabe.entwurf_text,
        ist_seed: false,
        gesendet_am: new Date().toISOString(),
      });
      beschreibung = `Antwort an ${freigabe.empfaenger ?? "den Mieter"} freigegeben und versendet${zusatz}`;
      break;
    }

    case "terminbestaetigung": {
      await db
        .from("termine")
        .update({ status: "bestaetigt" })
        .eq("vorgang_id", v.id)
        .eq("typ", "handwerkertermin");

      if (v.status === "an_handwerker" || v.status === "in_pruefung") {
        await db
          .from("vorgaenge")
          .update({ status: "termin_vereinbart" })
          .eq("id", v.id);
      }
      beschreibung = `Termin bestätigt und dem Mieter mitgeteilt${zusatz}`;
      break;
    }

    case "zahlungserinnerung": {
      await db.from("nachrichten").insert({
        tenant_id: freigabe.tenant_id,
        vorgang_id: v.id,
        einheit_id: v.einheit_id,
        richtung: "verwalter",
        kanal: "email",
        text: freigabe.entwurf_text,
        ist_seed: false,
        gesendet_am: new Date().toISOString(),
      });
      beschreibung = `Zahlungserinnerung an ${freigabe.empfaenger ?? "den Mieter"} versendet${zusatz}`;
      break;
    }
  }

  await db.from("vorgang_verlauf").insert({
    tenant_id: freigabe.tenant_id,
    vorgang_id: v.id,
    ereignis: automatisch ? "automatisch_freigegeben" : "freigegeben",
    beschreibung,
    akteur,
    ist_seed: false,
    zeitpunkt: new Date().toISOString(),
  });
}

/**
 * Sammelt die Angaben für den Terminlink und schickt ihn los.
 *
 * Betriebe ohne Zustimmung überspringt das stillschweigend – dort ruft die
 * Verwaltung selbst an, wofür in der Übergabe die Bausteine bereitliegen.
 */
export async function terminlinkVerschicken(
  db: Db,
  tenantId: string,
  vorgangId: string,
  handwerkerId: string,
): Promise<{ token: string; link: string } | null> {
  const { data: betrieb } = await db
    .from("handwerker")
    .select(
      "firma, ansprechpartner, reaktionszeit_h, kontakt_kanal, abstimmung_erlaubt",
    )
    .eq("id", handwerkerId)
    .maybeSingle();
  if (!betrieb?.abstimmung_erlaubt) return null;

  const [{ data: mandant }, { data: vorgang }] = await Promise.all([
    db.from("demo_tenants").select("firma").eq("id", tenantId).maybeSingle(),
    db
      .from("vorgaenge")
      .select("nummer, titel, einheit_id, ki_zusammenfassung")
      .eq("id", vorgangId)
      .maybeSingle(),
  ]);

  const { data: einheit } = vorgang?.einheit_id
    ? await db
        .from("einheiten")
        .select("bezeichnung, mieter_name, objekt_id")
        .eq("id", vorgang.einheit_id)
        .maybeSingle()
    : { data: null };
  const { data: objekt } = einheit
    ? await db.from("objekte").select("name").eq("id", einheit.objekt_id).maybeSingle()
    : { data: null };

  const { data: wunsch } = await db
    .from("termine")
    .select("beginn, ende")
    .eq("vorgang_id", vorgangId)
    .eq("typ", "handwerkertermin")
    .maybeSingle();

  return terminanfrageAnlegen(
    db,
    {
      firma: mandant?.firma ?? "Ihre Hausverwaltung",
      vorgangsnummer: vorgang?.nummer ?? 0,
      titel: vorgang?.titel ?? "Auftrag",
      objekt: objekt?.name ?? "",
      einheit: einheit?.bezeichnung ?? "",
      mieterName: einheit?.mieter_name ?? "Mieter",
      betrieb: betrieb.firma,
      ansprechpartner: betrieb.ansprechpartner,
      wunsch:
        wunsch?.beginn && wunsch?.ende
          ? { beginn: new Date(wunsch.beginn), ende: new Date(wunsch.ende) }
          : null,
      reaktionszeitH: betrieb.reaktionszeit_h ?? 24,
      zusammenfassung: vorgang?.ki_zusammenfassung ?? null,
      erkenntnis: null,
    },
    {
      tenantId,
      vorgangId,
      handwerkerId,
      kontaktKanal: betrieb.kontakt_kanal ?? "email",
      abstimmungErlaubt: true,
    },
  );
}

/** Verlaufseintrag für eine abgelehnte Freigabe. */
export async function freigabeAblehnungVermerken(
  db: Db,
  freigabe: Pick<Freigabe, "tenant_id" | "vorgang_id" | "titel">,
  akteur: string,
): Promise<void> {
  if (!freigabe.vorgang_id) return;

  await db.from("vorgang_verlauf").insert({
    tenant_id: freigabe.tenant_id,
    vorgang_id: freigabe.vorgang_id,
    ereignis: "abgelehnt",
    beschreibung: `Vorschlag "${freigabe.titel}" abgelehnt – nichts versendet`,
    akteur,
    ist_seed: false,
    zeitpunkt: new Date().toISOString(),
  });
}
