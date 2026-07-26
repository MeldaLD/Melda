import { notFound } from "next/navigation";

import { vorschlaegeVorbelegen, type Abstimmungsdaten } from "@config/abstimmung";
import { TerminFormular } from "@/components/termin/TerminFormular";
import { istSchreibenMoeglich } from "@/lib/daten/quelle";
import { vorschlaegeLesen } from "@/lib/daten/terminanfrage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { markenPalette } from "@/lib/branding/farben";

/**
 * Die Seite, die ein Handwerksbetrieb per Link bekommt.
 *
 * Die ganze Interaktion ist: drei Zeitfenster antippen, senden. Keine
 * Anmeldung, kein Konto, keine App – die Zielgruppe steht auf einer Leiter
 * und hat eine Hand frei. Alles, was mehr verlangt, bleibt unbeantwortet.
 *
 * Der Token in der Adresse ist der einzige Ausweis; entsprechend steht auf
 * der Seite nur, was für die Terminwahl nötig ist – kein Mietername, keine
 * Telefonnummer, keine anderen Vorgänge.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Terminvorschlag",
  robots: { index: false, follow: false },
};

export default async function TerminSeite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!istSchreibenMoeglich()) {
    return (
      <Rahmen titel="Terminvorschlag">
        <p className="text-sm text-muted-foreground">
          Diese Vorschau läuft ohne Datenbank. In der eingerichteten Demo steht hier der
          Auftrag mit drei Feldern für Ihre Terminvorschläge.
        </p>
      </Rahmen>
    );
  }

  const db = supabaseAdmin();
  const { data: anfrage } = await db
    .from("terminanfragen")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!anfrage) notFound();

  const [{ data: vorgang }, { data: betrieb }, { data: mandant }] = await Promise.all([
    db
      .from("vorgaenge")
      .select("nummer, titel, kategorie, ki_zusammenfassung, prioritaet, einheit_id")
      .eq("id", anfrage.vorgang_id)
      .maybeSingle(),
    db
      .from("handwerker")
      .select("firma, ansprechpartner, reaktionszeit_h")
      .eq("id", anfrage.handwerker_id)
      .maybeSingle(),
    db
      .from("demo_tenants")
      .select("firma, primaerfarbe, logo_url")
      .eq("id", anfrage.tenant_id)
      .maybeSingle(),
  ]);

  const { data: einheit } = vorgang?.einheit_id
    ? await db
        .from("einheiten")
        .select("bezeichnung, objekt_id")
        .eq("id", vorgang.einheit_id)
        .maybeSingle()
    : { data: null };
  const { data: objekt } = einheit
    ? await db.from("objekte").select("name").eq("id", einheit.objekt_id).maybeSingle()
    : { data: null };

  const farben = markenPalette(
    mandant?.primaerfarbe ?? "#1F4E79",
  ) as React.CSSProperties;
  const abgelaufen = new Date(anfrage.gueltig_bis) < new Date();
  const erledigt = anfrage.status !== "offen";

  // Wo der Auftrag ist, gehört auf die Seite. Wer dort wohnt, nicht – der
  // Betrieb erfährt den Namen mit der Terminbestätigung.
  const ort = [objekt?.name, einheit?.bezeichnung].filter(Boolean).join(", ");

  const daten: Abstimmungsdaten = {
    firma: mandant?.firma ?? "Hausverwaltung",
    vorgangsnummer: vorgang?.nummer ?? 0,
    titel: vorgang?.titel ?? "Auftrag",
    objekt: objekt?.name ?? "",
    einheit: einheit?.bezeichnung ?? "",
    mieterName: "",
    betrieb: betrieb?.firma ?? "",
    ansprechpartner: betrieb?.ansprechpartner ?? null,
    wunsch:
      anfrage.wunsch_beginn && anfrage.wunsch_ende
        ? {
            beginn: new Date(anfrage.wunsch_beginn),
            ende: new Date(anfrage.wunsch_ende),
          }
        : null,
    reaktionszeitH: betrieb?.reaktionszeit_h ?? 24,
    zusammenfassung: vorgang?.ki_zusammenfassung ?? null,
    erkenntnis: null,
  };

  return (
    <Rahmen titel={mandant?.firma ?? "Hausverwaltung"} stil={farben}>
      <div className="space-y-4">
        <header className="space-y-1">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Auftrag {vorgang?.nummer}
          </p>
          <h1 className="text-xl leading-tight font-semibold tracking-tight">
            {vorgang?.titel}
          </h1>
          {ort && <p className="text-sm text-muted-foreground">{ort}</p>}
        </header>

        {vorgang?.ki_zusammenfassung && (
          <div className="rounded-md bg-marke-sanft p-3">
            <p className="text-sm leading-relaxed text-slate-700">
              {vorgang.ki_zusammenfassung}
            </p>
          </div>
        )}

        {abgelaufen ? (
          <Meldung text="Dieser Link ist abgelaufen. Bitte melden Sie sich telefonisch bei der Verwaltung." />
        ) : erledigt ? (
          <Meldung
            text={
              anfrage.status === "beantwortet"
                ? "Danke, Ihre Termine sind angekommen. Sobald der Mieter gewählt hat, erhalten Sie die Bestätigung."
                : "Dieser Termin ist bereits abgestimmt."
            }
            vorschlaege={vorschlaegeLesen(anfrage.vorschlaege)}
          />
        ) : (
          <TerminFormular
            token={token}
            wunsch={
              daten.wunsch
                ? {
                    beginn: daten.wunsch.beginn.toISOString(),
                    ende: daten.wunsch.ende.toISOString(),
                  }
                : null
            }
            vorbelegt={vorschlaegeVorbelegen(daten).map((f) => ({
              beginn: f.beginn.toISOString(),
              ende: f.ende.toISOString(),
            }))}
          />
        )}

        <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
          Diese Seite gehört zu {mandant?.firma}. Sie brauchen kein Konto und keine App.
          Den Termin stimmen wir anschließend mit dem Mieter ab und melden uns bei
          Ihnen.
        </p>
      </div>
    </Rahmen>
  );
}

function Rahmen({
  titel,
  stil,
  children,
}: {
  titel: string;
  stil?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <main style={stil} className="mx-auto min-h-svh max-w-lg px-4 py-8 sm:px-6">
      <p className="mb-4 text-sm font-medium text-marke">{titel}</p>
      <div className="rounded-lg border border-border bg-white p-4 sm:p-5">
        {children}
      </div>
    </main>
  );
}

function Meldung({
  text,
  vorschlaege,
}: {
  text: string;
  vorschlaege?: { beginn: string; ende: string }[];
}) {
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm text-slate-700">{text}</p>
      {vorschlaege && vorschlaege.length > 0 && (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {vorschlaege.map((v) => (
            <li key={v.beginn} className="tabellenziffern">
              {new Intl.DateTimeFormat("de-DE", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Berlin",
              }).format(new Date(v.beginn))}{" "}
              Uhr
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
