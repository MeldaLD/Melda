/**
 * Erzeugt aus dem Beispieldaten-Generator eine fertige SQL-Datei.
 *
 *   npm run seed:sql
 *
 * Das Ergebnis liegt unter supabase/seed/ und wird mitversioniert. Damit
 * lässt es sich ohne Kommandozeile einspielen: Datei öffnen, Inhalt kopieren,
 * im Supabase SQL Editor einfügen, ausführen. Das funktioniert auch auf einem
 * Tablet.
 *
 * Zeitangaben werden nicht als feste Zeitstempel geschrieben, sondern relativ
 * zu now(). Dadurch bleibt die Datei beliebig lange gültig: Egal wann sie
 * eingespielt wird, das Dashboard zeigt immer eine aktuelle Lage.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { MUSTER_MANDANT } from "../config/muster-mandant";
import { bestandErzeugen } from "../src/lib/demo/generator";
import type { Mandantenbestand } from "../src/lib/daten/typen";

const BEZUG = new Date("2026-01-01T12:00:00.000Z");

// --- SQL-Werte ------------------------------------------------------------

function text(wert: string | null | undefined): string {
  if (wert === null || wert === undefined) return "null";
  return `'${wert.replace(/'/g, "''")}'`;
}

function zahl(wert: number | null | undefined): string {
  return wert === null || wert === undefined ? "null" : String(wert);
}

function bool(wert: boolean): string {
  return wert ? "true" : "false";
}

function liste(werte: string[]): string {
  return werte.length ? `array[${werte.map(text).join(", ")}]::text[]` : "'{}'::text[]";
}

function json(wert: unknown): string {
  return `${text(JSON.stringify(wert))}::jsonb`;
}

/** Zeitstempel relativ zu now(), damit die Datei nicht veraltet. */
function zeit(iso: string | null): string {
  if (!iso) return "null";
  const sekunden = Math.round((new Date(iso).getTime() - BEZUG.getTime()) / 1000);
  return `now() + interval '${sekunden} seconds'`;
}

/** Baut ein INSERT mit mehreren Wertezeilen. */
function einfuegen(tabelle: string, spalten: string[], zeilen: string[][]): string {
  if (!zeilen.length) return "";
  const werte = zeilen.map((z) => `  (${z.join(", ")})`).join(",\n");
  return `insert into ${tabelle} (${spalten.join(", ")}) values\n${werte};\n`;
}

// --- Aufbau ---------------------------------------------------------------

function sqlErzeugen(bestand: Mandantenbestand): string {
  const m = bestand.mandant;
  const teile: string[] = [];

  teile.push(`-- ---------------------------------------------------------------------------
-- Beispieldaten: ${m.firma}
--
-- ERZEUGT – NICHT VON HAND BEARBEITEN.
-- Quelle: config/muster-mandant.ts, config/scenarios.ts
-- Neu erzeugen mit:  npm run seed:sql
--
-- Einspielen:
--   Kommandozeile   npx supabase db push  (Migrationen)  und diese Datei
--   ohne Terminal   Inhalt kopieren und im Supabase SQL Editor ausführen
--
-- Die Datei ist wiederholbar: Sie leert die Bewegungsdaten des Mandanten und
-- schreibt sie neu. Ein zweiter Durchlauf stellt also den Ausgangszustand
-- wieder her – genau das, was der Zurücksetzen-Knopf tut.
--
-- Zeitangaben sind relativ zu now(), die Datei veraltet daher nicht.
-- ---------------------------------------------------------------------------

begin;
`);

  // Mandant
  teile.push(`-- Mandant anlegen oder aktualisieren
insert into demo_tenants (
  id, slug, firma, logo_url, primaerfarbe, sekundaerfarbe, ansprechpartner,
  stadt, objekt_namen, mitarbeiter, handwerker, einstellungen,
  ablaufdatum, aufrufe, ist_aktiv, erstellt_am
) values (
  ${text(m.id)}, ${text(m.slug)}, ${text(m.firma)}, ${text(m.logo_url)},
  ${text(m.primaerfarbe)}, ${text(m.sekundaerfarbe)}, ${text(m.ansprechpartner)},
  ${text(m.stadt)}, ${liste(m.objekt_namen)}, ${json(m.mitarbeiter)},
  ${json(m.handwerker)}, ${json(m.einstellungen)},
  ${text(m.ablaufdatum)}, ${zahl(m.aufrufe)}, ${bool(m.ist_aktiv)}, ${zeit(m.erstellt_am)}
)
on conflict (id) do update set
  firma = excluded.firma,
  primaerfarbe = excluded.primaerfarbe,
  sekundaerfarbe = excluded.sekundaerfarbe,
  ansprechpartner = excluded.ansprechpartner,
  stadt = excluded.stadt,
  objekt_namen = excluded.objekt_namen,
  mitarbeiter = excluded.mitarbeiter,
  handwerker = excluded.handwerker,
  einstellungen = excluded.einstellungen,
  ist_aktiv = excluded.ist_aktiv;

-- Bewegungsdaten leeren, damit ein erneuter Lauf sauber aufsetzt
select demo_leeren(${text(m.slug)});
`);

  teile.push(
    einfuegen(
      "objekte",
      [
        "id",
        "tenant_id",
        "name",
        "strasse",
        "plz",
        "ort",
        "einheiten_anzahl",
        "sortierung",
      ],
      bestand.objekte.map((o) => [
        text(o.id),
        text(o.tenant_id),
        text(o.name),
        text(o.strasse),
        text(o.plz),
        text(o.ort),
        zahl(o.einheiten_anzahl),
        zahl(o.sortierung),
      ]),
    ),
  );

  teile.push(
    einfuegen(
      "einheiten",
      ["id", "tenant_id", "objekt_id", "bezeichnung", "mieter_name", "mieter_telefon"],
      bestand.einheiten.map((e) => [
        text(e.id),
        text(e.tenant_id),
        text(e.objekt_id),
        text(e.bezeichnung),
        text(e.mieter_name),
        text(e.mieter_telefon),
      ]),
    ),
  );

  teile.push(
    einfuegen(
      "mitarbeiter",
      ["id", "tenant_id", "name", "initialen", "rolle", "bereich", "sortierung"],
      bestand.mitarbeiter.map((m2) => [
        text(m2.id),
        text(m2.tenant_id),
        text(m2.name),
        text(m2.initialen),
        text(m2.rolle),
        `${text(m2.bereich)}::fachbereich`,
        zahl(m2.sortierung),
      ]),
    ),
  );

  teile.push(
    einfuegen(
      "handwerker",
      [
        "id",
        "tenant_id",
        "firma",
        "gewerk",
        "telefon",
        "reaktionszeit_h",
        "bewertung",
        "ist_standard",
        "ansprechpartner",
        "email",
        "kontakt_kanal",
        "abstimmung_erlaubt",
        "arbeitszeiten",
      ],
      bestand.handwerker.map((h) => [
        text(h.id),
        text(h.tenant_id),
        text(h.firma),
        `${text(h.gewerk)}::gewerk`,
        text(h.telefon),
        zahl(h.reaktionszeit_h),
        zahl(h.bewertung),
        bool(h.ist_standard),
        text(h.ansprechpartner),
        text(h.email),
        `${text(h.kontakt_kanal)}::kanal`,
        bool(h.abstimmung_erlaubt),
        text(h.arbeitszeiten),
      ]),
    ),
  );

  teile.push(
    einfuegen(
      "zeitfenster",
      ["id", "tenant_id", "mitarbeiter_id", "wochentag", "von", "bis"],
      bestand.zeitfenster.map((z) => [
        text(z.id),
        text(z.tenant_id),
        text(z.mitarbeiter_id),
        zahl(z.wochentag),
        text(z.von),
        text(z.bis),
      ]),
    ),
  );

  teile.push(
    einfuegen(
      "vorgaenge",
      [
        "id",
        "tenant_id",
        "nummer",
        "einheit_id",
        "szenario_id",
        "titel",
        "kategorie",
        "gewerk",
        "prioritaet",
        "status",
        "ki_zusammenfassung",
        "quelle",
        "mitarbeiter_id",
        "handwerker_id",
        "sla_frist",
        "zweitanfahrt_vermieden",
        "kosten_schaetzung_euro",
        "selbsthilfe_angeboten",
        "selbsthilfe_erfolgreich",
        "erreichbarkeit",
        "ist_seed",
        "erstellt_am",
        "erledigt_am",
      ],
      bestand.vorgaenge.map((v) => [
        text(v.id),
        text(v.tenant_id),
        zahl(v.nummer),
        text(v.einheit_id),
        text(v.szenario_id),
        text(v.titel),
        text(v.kategorie),
        `${text(v.gewerk)}::gewerk`,
        `${text(v.prioritaet)}::prioritaet`,
        `${text(v.status)}::vorgang_status`,
        text(v.ki_zusammenfassung),
        `${text(v.quelle)}::kanal`,
        text(v.mitarbeiter_id),
        text(v.handwerker_id),
        zeit(v.sla_frist),
        bool(v.zweitanfahrt_vermieden),
        zahl(v.kosten_schaetzung_euro),
        bool(v.selbsthilfe_angeboten),
        bool(v.selbsthilfe_erfolgreich),
        text(v.erreichbarkeit),
        bool(v.ist_seed),
        zeit(v.erstellt_am),
        zeit(v.erledigt_am),
      ]),
    ),
  );

  teile.push(
    einfuegen(
      "nachrichten",
      [
        "id",
        "tenant_id",
        "vorgang_id",
        "einheit_id",
        "handwerker_id",
        "richtung",
        "kanal",
        "text",
        "foto_id",
        "meta",
        "ist_seed",
        "gesendet_am",
        "gelesen_am",
      ],
      bestand.nachrichten.map((n) => [
        text(n.id),
        text(n.tenant_id),
        text(n.vorgang_id),
        text(n.einheit_id),
        text(n.handwerker_id),
        `${text(n.richtung)}::nachricht_richtung`,
        `${text(n.kanal)}::kanal`,
        text(n.text),
        text(n.foto_id),
        n.meta ? json(n.meta) : "null",
        bool(n.ist_seed),
        zeit(n.gesendet_am),
        zeit(n.gelesen_am),
      ]),
    ),
  );

  teile.push(
    einfuegen(
      "vorgang_verlauf",
      [
        "id",
        "tenant_id",
        "vorgang_id",
        "ereignis",
        "beschreibung",
        "akteur",
        "ist_seed",
        "zeitpunkt",
      ],
      bestand.verlauf.map((v) => [
        text(v.id),
        text(v.tenant_id),
        text(v.vorgang_id),
        text(v.ereignis),
        text(v.beschreibung),
        text(v.akteur),
        bool(v.ist_seed),
        zeit(v.zeitpunkt),
      ]),
    ),
  );

  teile.push(
    einfuegen(
      "freigaben",
      [
        "id",
        "tenant_id",
        "vorgang_id",
        "typ",
        "titel",
        "begruendung",
        "entwurf_text",
        "empfaenger",
        "status",
        "entschieden_am",
        "entschieden_von",
        "regel_automatisch",
        "ist_seed",
        "erstellt_am",
      ],
      bestand.freigaben.map((f) => [
        text(f.id),
        text(f.tenant_id),
        text(f.vorgang_id),
        `${text(f.typ)}::freigabe_typ`,
        text(f.titel),
        text(f.begruendung),
        text(f.entwurf_text),
        text(f.empfaenger),
        `${text(f.status)}::freigabe_status`,
        zeit(f.entschieden_am),
        text(f.entschieden_von),
        bool(f.regel_automatisch),
        bool(f.ist_seed),
        zeit(f.erstellt_am),
      ]),
    ),
  );

  teile.push(
    einfuegen(
      "termine",
      [
        "id",
        "tenant_id",
        "vorgang_id",
        "typ",
        "titel",
        "mitarbeiter_id",
        "handwerker_id",
        "einheit_id",
        "beginn",
        "ende",
        "status",
        "grund",
        "zeitwunsch",
        "bereich_vorschlag",
        "ist_seed",
      ],
      bestand.termine.map((t) => [
        text(t.id),
        text(t.tenant_id),
        text(t.vorgang_id),
        `${text(t.typ)}::termin_typ`,
        text(t.titel),
        text(t.mitarbeiter_id),
        text(t.handwerker_id),
        text(t.einheit_id),
        zeit(t.beginn),
        zeit(t.ende),
        `${text(t.status)}::termin_status`,
        text(t.grund),
        text(t.zeitwunsch),
        t.bereich_vorschlag ? `${text(t.bereich_vorschlag)}::fachbereich` : "null",
        bool(t.ist_seed),
      ]),
    ),
  );

  teile.push("commit;\n");
  return teile.filter(Boolean).join("\n");
}

// --- Ausführung -----------------------------------------------------------

const bestand = bestandErzeugen(MUSTER_MANDANT, BEZUG);
const ziel = resolve(import.meta.dirname, "../supabase/seed/muster-hausverwaltung.sql");

mkdirSync(dirname(ziel), { recursive: true });
writeFileSync(ziel, sqlErzeugen(bestand), "utf8");

console.log(`Geschrieben: ${ziel}`);
console.log(
  [
    `  ${bestand.objekte.length} Objekte`,
    `  ${bestand.einheiten.length} Einheiten`,
    `  ${bestand.mitarbeiter.length} Mitarbeitende`,
    `  ${bestand.handwerker.length} Handwerksbetriebe`,
    `  ${bestand.vorgaenge.length} Vorgänge`,
    `  ${bestand.nachrichten.length} Nachrichten`,
    `  ${bestand.freigaben.length} Freigaben`,
    `  ${bestand.termine.length} Termine`,
  ].join("\n"),
);
