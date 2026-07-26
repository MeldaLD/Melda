import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, SparklesIcon, TrendingDownIcon } from "lucide-react";

import { szenarioNach } from "@config/scenarios";
import { DemoFoto } from "@/components/chat/DemoFoto";
import { PrioBadge, StatusBadge } from "@/components/dashboard/Anzeigen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { alsDatumZeit } from "@/lib/dashboard/format";
import { alterKurz, slaZustand } from "@/lib/dashboard/kennzahlen";
import { bestandLaden } from "@/lib/daten/quelle";
import { GEWERK_BEZEICHNUNG } from "@/lib/daten/typen";

export default async function VorgangDetail({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ergebnis = await bestandLaden(slug);
  if (!ergebnis) notFound();

  const { bestand } = ergebnis;
  const vorgang = bestand.vorgaenge.find((v) => v.id === id);
  if (!vorgang) notFound();

  const einheit = bestand.einheiten.find((e) => e.id === vorgang.einheit_id);
  const objekt = bestand.objekte.find((o) => o.id === einheit?.objekt_id);
  const mitarbeiter = bestand.mitarbeiter.find((m) => m.id === vorgang.mitarbeiter_id);
  const handwerker = bestand.handwerker.find((h) => h.id === vorgang.handwerker_id);
  const szenario = vorgang.szenario_id
    ? szenarioNach.get(vorgang.szenario_id)
    : undefined;

  const nachrichten = bestand.nachrichten
    .filter((n) => n.vorgang_id === vorgang.id)
    .sort((a, b) => a.gesendet_am.localeCompare(b.gesendet_am));

  const verlauf = bestand.verlauf
    .filter((v) => v.vorgang_id === vorgang.id)
    .sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt));

  const basis = `/demo/${slug}/dashboard`;
  const frist = slaZustand(vorgang);

  return (
    <div className="p-4 sm:p-6">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`${basis}/vorgaenge`}>
          <ArrowLeftIcon /> Zurück zur Liste
        </Link>
      </Button>

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tabellenziffern text-sm text-muted-foreground">
            Vorgang {vorgang.nummer}
          </span>
          <PrioBadge prioritaet={vorgang.prioritaet} />
          <StatusBadge status={vorgang.status} />
          {frist === "rot" && <Badge variant="notfall">Frist überschritten</Badge>}
          {vorgang.zweitanfahrt_vermieden && (
            <Badge variant="marke">
              <TrendingDownIcon className="size-3" /> Zweitanfahrt vermieden
            </Badge>
          )}
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{vorgang.titel}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {objekt?.name} · {einheit?.bezeichnung} · {einheit?.mieter_name}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {vorgang.ki_zusammenfassung && (
            <Card className="border-marke-rand bg-marke-sanft">
              <CardHeader className="flex-row items-center gap-2">
                <SparklesIcon className="size-4 text-marke" aria-hidden />
                <CardTitle>Zusammenfassung des Assistenten</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-slate-700">
                  {vorgang.ki_zusammenfassung}
                </p>
                {szenario && vorgang.zweitanfahrt_vermieden && (
                  <div className="mt-3 space-y-1.5 border-t border-marke-rand pt-3 text-xs">
                    <p className="font-medium text-slate-700">
                      Was die Nachfrage nach dem zweiten Foto gebracht hat
                    </p>
                    <p className="text-muted-foreground line-through">
                      {szenario.erkenntnis.vorher}
                    </p>
                    <p className="font-medium text-marke">
                      {szenario.erkenntnis.nachher}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Verlauf mit dem Mieter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {nachrichten.map((nachricht) => {
                const vomMieter = nachricht.richtung === "mieter";
                return (
                  <div
                    key={nachricht.id}
                    className={vomMieter ? "flex justify-start" : "flex justify-end"}
                  >
                    <div
                      className={
                        vomMieter
                          ? "max-w-[80%] rounded-lg rounded-bl-sm bg-slate-100 px-3 py-2"
                          : "max-w-[80%] rounded-lg rounded-br-sm bg-marke-sanft px-3 py-2"
                      }
                    >
                      {nachricht.foto_id && (
                        <DemoFoto
                          datei={nachricht.foto_id}
                          beschriftung="Foto des Mieters"
                          className="mb-1.5 h-36 w-full rounded"
                        />
                      )}
                      <p className="text-sm whitespace-pre-line text-slate-800">
                        {nachricht.text}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {vomMieter ? einheit?.mieter_name : "Assistent"} ·{" "}
                        {alsDatumZeit(nachricht.gesendet_am)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Zuordnung</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2.5 text-sm">
                <Feld bezeichnung="Kategorie" wert={vorgang.kategorie} />
                <Feld bezeichnung="Gewerk" wert={GEWERK_BEZEICHNUNG[vorgang.gewerk]} />
                <Feld
                  bezeichnung="Handwerker"
                  wert={handwerker?.firma ?? "Noch nicht beauftragt"}
                />
                <Feld
                  bezeichnung="Zuständig"
                  wert={mitarbeiter?.name ?? "Nicht zugewiesen"}
                />
                <Feld
                  bezeichnung="Eingang"
                  wert={`${alsDatumZeit(vorgang.erstellt_am)} (vor ${alterKurz(vorgang.erstellt_am)})`}
                />
                <Feld bezeichnung="Kanal" wert={kanalName(vorgang.quelle)} />
                <Feld bezeichnung="Telefon" wert={einheit?.mieter_telefon ?? "–"} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historie</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {verlauf.map((eintrag) => (
                  <li key={eintrag.id} className="flex gap-2.5">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-marke" />
                    <div className="min-w-0">
                      <p className="text-sm leading-snug">{eintrag.beschreibung}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {eintrag.akteur} · {alsDatumZeit(eintrag.zeitpunkt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Feld({ bezeichnung, wert }: { bezeichnung: string; wert: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-xs text-muted-foreground">{bezeichnung}</dt>
      <dd className="min-w-0 flex-1 text-sm">{wert}</dd>
    </div>
  );
}

function kanalName(kanal: string): string {
  return { whatsapp: "WhatsApp", email: "E-Mail", telefon: "Telefon" }[kanal] ?? kanal;
}
