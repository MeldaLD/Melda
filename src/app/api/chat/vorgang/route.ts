import { NextResponse } from "next/server";

import { szenarioNach } from "@config/scenarios";
import { SLA_STANDARD } from "@config/muster-mandant";
import { entscheiderName, freigabeWirkungAnwenden } from "@/lib/daten/freigaben";
import { istSchreibenMoeglich } from "@/lib/daten/quelle";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Mandant } from "@/lib/daten/typen";

/**
 * Legt aus einer Chat-Meldung einen echten Vorgang an.
 *
 * Das ist der Draht zwischen Mieter-Chat und Verwalter-Dashboard: Was hier
 * geschrieben wird, taucht über Supabase Realtime binnen Sekunden im
 * Dashboard auf – der Moment, der bei einer Live-Vorführung zieht.
 *
 * Läuft bewusst serverseitig mit dem Service-Role-Key. Der Browser hat kein
 * Schreibrecht, sonst könnte jeder Betrachter beliebige Daten einschleusen.
 *
 * Ohne konfigurierte Datenbank antwortet die Route freundlich mit
 * gespeichert:false – der Chat läuft dann normal weiter, nur ohne den
 * Live-Effekt.
 */

type Eingang = {
  slug: string;
  /** Wer meldet – wird beim Start des Chats gewählt. */
  einheitId: string | null;
  szenarioId: string;
  zweitanfahrtVermieden: boolean;
  /** Mieter hat den Schaden nach dem Tipp selbst behoben. */
  selbsthilfeAngeboten?: boolean;
  selbsthilfeErfolgreich?: boolean;
  nachrichten: {
    von: "mieter" | "ki";
    text?: string;
    foto?: string;
    gesendetAm: string;
  }[];
};

export async function POST(anfrage: Request) {
  if (!istSchreibenMoeglich()) {
    return NextResponse.json({ gespeichert: false, grund: "keine-datenbank" });
  }

  let eingang: Eingang;
  try {
    eingang = await anfrage.json();
  } catch {
    return NextResponse.json({ fehler: "Ungültige Anfrage" }, { status: 400 });
  }

  const szenario = szenarioNach.get(eingang.szenarioId);
  if (!szenario) {
    return NextResponse.json({ fehler: "Unbekanntes Szenario" }, { status: 400 });
  }

  try {
    const db = supabaseAdmin();

    const { data: mandant } = await db
      .from("demo_tenants")
      .select("*")
      .eq("slug", eingang.slug)
      .maybeSingle();

    if (!mandant) {
      return NextResponse.json({ fehler: "Unbekannter Mandant" }, { status: 404 });
    }
    const tenant = mandant as Mandant;

    // --- Einheit bestimmen -------------------------------------------------
    // Im Echtbetrieb ergibt sich der Absender aus seiner Telefonnummer. In der
    // Demo wählt der Betrachter zu Beginn des Chats, als wer er meldet.
    const { data: einheiten } = await db
      .from("einheiten")
      .select("id, bezeichnung, mieter_name")
      .eq("tenant_id", tenant.id)
      .limit(60);

    if (!einheiten?.length) {
      return NextResponse.json(
        { fehler: "Für diesen Mandanten sind keine Einheiten angelegt." },
        { status: 409 },
      );
    }

    const gewaehlt = eingang.einheitId
      ? einheiten.find((e) => e.id === eingang.einheitId)
      : undefined;

    // Ohne Auswahl (alter Aufruf, direkter Link) eine Wohnung ohne offenen
    // Vorgang nehmen, damit bei mehrfachem Vorführen Abwechslung entsteht.
    let einheit = gewaehlt;
    if (!einheit) {
      const { data: belegt } = await db
        .from("vorgaenge")
        .select("einheit_id")
        .eq("tenant_id", tenant.id)
        .not("status", "in", '("erledigt","storniert")');

      const belegteIds = new Set((belegt ?? []).map((v) => v.einheit_id));
      const frei = einheiten.filter((e) => !belegteIds.has(e.id));
      const auswahl = frei.length ? frei : einheiten;
      einheit = auswahl[Math.floor(Math.random() * auswahl.length)];
    }

    // --- Zuständigkeiten ---------------------------------------------------
    const { data: betriebe } = await db
      .from("handwerker")
      .select("id, firma")
      .eq("tenant_id", tenant.id)
      .eq("gewerk", szenario.gewerk)
      .eq("ist_standard", true)
      .limit(1);
    const betrieb = betriebe?.[0] ?? null;

    const { data: technik } = await db
      .from("mitarbeiter")
      .select("id, name")
      .eq("tenant_id", tenant.id)
      .eq("bereich", "technik")
      .limit(1);
    const bearbeiter = technik?.[0] ?? null;

    // --- Fortlaufende Nummer ----------------------------------------------
    const { data: hoechste } = await db
      .from("vorgaenge")
      .select("nummer")
      .eq("tenant_id", tenant.id)
      .order("nummer", { ascending: false })
      .limit(1);
    const nummer = (hoechste?.[0]?.nummer ?? 999) + 1;

    // --- Vorgang -----------------------------------------------------------
    const jetzt = new Date();
    const notfall = szenario.prioritaet === "notfall";
    const selbstBehoben = Boolean(eingang.selbsthilfeErfolgreich);

    const { data: vorgang, error: vorgangFehler } = await db
      .from("vorgaenge")
      .insert({
        tenant_id: tenant.id,
        nummer,
        einheit_id: einheit.id,
        szenario_id: szenario.id,
        titel: szenario.titel,
        kategorie: szenario.kategorie,
        gewerk: szenario.gewerk,
        prioritaet: szenario.prioritaet,
        // Ein Notfall geht sofort an den Notdienst, alles andere wartet auf
        // die Freigabe des Verwalters. Genau das ist das Vertrauensargument.
        status: selbstBehoben ? "erledigt" : notfall ? "an_handwerker" : "in_pruefung",
        ki_zusammenfassung: szenario.kiZusammenfassung,
        quelle: "whatsapp",
        mitarbeiter_id: bearbeiter?.id ?? null,
        handwerker_id: notfall ? (betrieb?.id ?? null) : null,
        // Fristen aus den Einstellungen des Mandanten, sonst der Standard.
        // Dreht der Verwalter dort an der Schraube, rechnet die Ampel sofort
        // anders – sonst wäre die Einstellung eine Attrappe.
        sla_frist: new Date(
          jetzt.getTime() +
            (tenant.einstellungen?.sla_stunden?.[szenario.prioritaet] ??
              SLA_STANDARD[szenario.prioritaet]) *
              3600_000,
        ).toISOString(),
        zweitanfahrt_vermieden: eingang.zweitanfahrtVermieden,
        kosten_schaetzung_euro: szenario.kostenschaetzungEuro,
        selbsthilfe_angeboten: Boolean(eingang.selbsthilfeAngeboten),
        selbsthilfe_erfolgreich: Boolean(eingang.selbsthilfeErfolgreich),
        // Nicht als Seed markiert: Diese Zeile ist während einer Vorführung
        // entstanden und wird beim Zurücksetzen entfernt.
        ist_seed: false,
        erstellt_am: jetzt.toISOString(),
      })
      .select("id, nummer")
      .single();

    if (vorgangFehler || !vorgang) {
      throw new Error(vorgangFehler?.message ?? "Vorgang konnte nicht angelegt werden");
    }

    // --- Chatverlauf mitschreiben -----------------------------------------
    const nachrichten = eingang.nachrichten
      .filter((n) => n.text || n.foto)
      .map((n) => ({
        tenant_id: tenant.id,
        vorgang_id: vorgang.id,
        einheit_id: einheit.id,
        richtung: n.von,
        kanal: "whatsapp",
        text: n.text ?? "[Foto]",
        foto_id: n.foto ?? null,
        ist_seed: false,
        gesendet_am: n.gesendetAm,
        gelesen_am: n.gesendetAm,
      }));

    if (nachrichten.length) await db.from("nachrichten").insert(nachrichten);

    // --- Historie ----------------------------------------------------------
    const verlauf = [
      {
        ereignis: "eingegangen",
        beschreibung: "Meldung über WhatsApp eingegangen",
        akteur: einheit.mieter_name,
      },
      {
        ereignis: "klassifiziert",
        beschreibung: "Kategorie, Gewerk und Priorität automatisch bestimmt",
        akteur: "KI-Assistent",
      },
      ...(eingang.zweitanfahrtVermieden
        ? [
            {
              ereignis: "nachgefasst",
              beschreibung:
                "Zweites Foto angefordert und ausgewertet – Diagnose verfeinert",
              akteur: "KI-Assistent",
            },
          ]
        : []),
      notfall
        ? {
            ereignis: "eskaliert",
            beschreibung: `Notdienst von ${betrieb?.firma ?? "Partnerbetrieb"} alarmiert`,
            akteur: "KI-Assistent",
          }
        : {
            ereignis: "vorbereitet",
            beschreibung: "Handwerkerauftrag zur Freigabe vorgelegt",
            akteur: "KI-Assistent",
          },
    ].map((e, index) => ({
      ...e,
      tenant_id: tenant.id,
      vorgang_id: vorgang.id,
      ist_seed: false,
      zeitpunkt: new Date(jetzt.getTime() + index * 1000).toISOString(),
    }));

    await db.from("vorgang_verlauf").insert(verlauf);

    // --- Freigaben ---------------------------------------------------------
    // Hat der Verwalter für eine Art "künftig automatisch freigeben"
    // angehakt, entsteht sie hier gleich als erledigt und wirkt sofort. Die
    // Zeile bleibt trotzdem stehen – nachvollziehbar, wer was wann entschieden
    // hat, auch wenn es eine Regel war.
    const automatik = new Set(tenant.einstellungen?.automatik_freigaben ?? []);

    if (!notfall && !selbstBehoben && betrieb) {
      const entwuerfe = [
        {
          tenant_id: tenant.id,
          vorgang_id: vorgang.id,
          typ: "handwerkerauftrag" as const,
          titel: `Auftrag an ${betrieb.firma}`,
          begruendung:
            `Gerade über WhatsApp eingegangen. ${betrieb.firma} ist der ` +
            `hinterlegte Standardbetrieb für ${szenario.gewerk}.` +
            (eingang.zweitanfahrtVermieden
              ? " Durch die Rückfrage nach einem zweiten Foto ist der Umfang bereits bekannt."
              : ""),
          entwurf_text:
            `Sehr geehrte Damen und Herren,\n\nbitte übernehmen Sie folgenden Auftrag:\n\n` +
            `Objekt: ${einheit.bezeichnung}\nMieter: ${einheit.mieter_name}\n` +
            `Meldung: ${szenario.titel}\n\n${szenario.kiZusammenfassung}\n\n` +
            `Bitte stimmen Sie den Termin direkt mit dem Mieter ab.\n\n` +
            `Mit freundlichen Grüßen\n${tenant.firma}`,
          empfaenger: betrieb.firma,
          status: "offen",
          ist_seed: false,
        },
        {
          tenant_id: tenant.id,
          vorgang_id: vorgang.id,
          typ: "mieter_antwort" as const,
          titel: `Antwort an ${einheit.mieter_name}`,
          begruendung:
            "Der Mieter hat eine Eingangsbestätigung erhalten. Entwurf beruht " +
            `auf der Kategorie "${szenario.kategorie}".`,
          entwurf_text: szenario.mieterAntwortEntwurf,
          empfaenger: einheit.mieter_name,
          status: "offen",
          ist_seed: false,
        },
      ];

      const akteur = automatik.size ? await entscheiderName(db, tenant.id) : "";
      const jetztIso = jetzt.toISOString();

      const zeilen = entwuerfe.map((e) =>
        automatik.has(e.typ)
          ? {
              ...e,
              status: "freigegeben" as const,
              entschieden_am: jetztIso,
              entschieden_von: `${akteur} (Automatikregel)`,
              regel_automatisch: true,
            }
          : e,
      );

      const { data: angelegt } = await db.from("freigaben").insert(zeilen).select("*");

      for (const freigabe of angelegt ?? []) {
        if (freigabe.status !== "freigegeben") continue;
        await freigabeWirkungAnwenden(db, freigabe, akteur, true);
      }
    }

    return NextResponse.json({
      gespeichert: true,
      nummer: vorgang.nummer,
      vorgangId: vorgang.id,
      einheit: `${einheit.bezeichnung}, ${einheit.mieter_name}`,
    });
  } catch (fehler) {
    console.error("[api/chat/vorgang]", fehler);
    // Die Demo darf daran nicht scheitern – der Chat läuft ohne Speicherung weiter.
    return NextResponse.json({ gespeichert: false, grund: "fehler" });
  }
}
