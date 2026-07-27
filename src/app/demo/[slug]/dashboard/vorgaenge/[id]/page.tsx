import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, TrendingDownIcon, WrenchIcon } from "lucide-react";

import { DemoFoto } from "@/components/chat/DemoFoto";
import { PrioBadge, StatusBadge } from "@/components/gemeinsam/Anzeigen";
import { Fotostreifen, type Beleg } from "@/components/gemeinsam/Fotostreifen";
import { Eingreifen } from "@/components/verwalter/Eingreifen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { alsDatumZeit } from "@/lib/dashboard/format";
import { alterKurz, slaZustand } from "@/lib/dashboard/kennzahlen";
import { bestandLaden } from "@/lib/daten/quelle";
import { GEWERK_BEZEICHNUNG } from "@/lib/daten/typen";

/**
 * Ein Vorgang aus Sicht der Hausverwaltung.
 *
 * Zwei Dinge und sonst nichts: die Zusammenfassung und der lückenlose
 * Verlauf. Genau das braucht jemand, den der Eigentümer anruft – und genau
 * das schuldet ein Beauftragter nach § 666 BGB.
 *
 * Keine Textbausteine, kein Telefonleitfaden, keine Statusknöpfe: Das ist
 * Arbeit, und die haben wir übernommen. Wer trotzdem eingreifen will, findet
 * unten den Weg dazu – das ist die Kontrolle, die nicht delegierbar ist.
 */
export default async function VorgangLesen({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  // Mit allen Daten: Ein Link auf einen Beispielvorgang soll auch dann
  // funktionieren, wenn die Liste gerade nur die eigenen Vorgänge zeigt.
  const ergebnis = await bestandLaden(slug, { alleDaten: true });
  if (!ergebnis) notFound();

  const { bestand } = ergebnis;
  const vorgang = bestand.vorgaenge.find((v) => v.id === id);
  if (!vorgang) notFound();

  const einheit = bestand.einheiten.find((e) => e.id === vorgang.einheit_id);
  const objekt = bestand.objekte.find((o) => o.id === einheit?.objekt_id);
  const handwerker = bestand.handwerker.find((h) => h.id === vorgang.handwerker_id);

  const nachrichten = bestand.nachrichten
    .filter((n) => n.vorgang_id === vorgang.id)
    .sort((a, b) => a.gesendet_am.localeCompare(b.gesendet_am));

  // Der Verlauf ist hier die Hauptsache, nicht eine Randspalte: Er ist der
  // Nachweis, dass gearbeitet wurde. Älteste zuerst – man liest eine
  // Geschichte von vorn.
  const verlauf = bestand.verlauf
    .filter((v) => v.vorgang_id === vorgang.id)
    .sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt));

  const belege: Beleg[] = nachrichten
    .filter((n) => n.foto_id)
    .map((n, index) => ({
      datei: n.foto_id as string,
      herkunft: index === 0 ? "Erstes Foto" : "Vom Assistenten nachgefordert",
      zeit: alsDatumZeit(n.gesendet_am),
    }));

  const termin = bestand.termine.find(
    (t) => t.vorgang_id === vorgang.id && t.typ === "handwerkertermin",
  );
  const basis = `/demo/${slug}/dashboard`;
  const frist = slaZustand(vorgang);

  return (
    <div className="p-4 sm:p-6">
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`${basis}/vorgaenge`}>
          <ArrowLeftIcon /> Zurück
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
          {vorgang.selbsthilfe_erfolgreich && (
            <Badge variant="marke">
              <WrenchIcon className="size-3" /> Vom Mieter selbst behoben
            </Badge>
          )}
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

      {belege.length > 0 && (
        <div className="mb-4">
          <Fotostreifen belege={belege} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Worum es geht</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-relaxed text-slate-700">
                {vorgang.ki_zusammenfassung ?? vorgang.titel}
              </p>
              <dl className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-border pt-3 text-xs">
                <Eckwert
                  bezeichnung="Gewerk"
                  wert={GEWERK_BEZEICHNUNG[vorgang.gewerk]}
                />
                <Eckwert
                  bezeichnung="Betrieb"
                  wert={handwerker?.firma ?? "noch keiner"}
                />
                {vorgang.kosten_schaetzung_euro && (
                  <Eckwert
                    bezeichnung="Kosten"
                    wert={`etwa ${vorgang.kosten_schaetzung_euro} €`}
                  />
                )}
                <Eckwert
                  bezeichnung="Eingegangen"
                  wert={`vor ${alterKurz(vorgang.erstellt_am)}`}
                />
                {termin?.beginn && (
                  <Eckwert bezeichnung="Termin" wert={alsDatumZeit(termin.beginn)} />
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Der Nachweis: jeder Schritt mit Zeitpunkt und Urheber. */}
          <Card>
            <CardHeader className="gap-1">
              <CardTitle>Was passiert ist</CardTitle>
              <p className="text-xs text-muted-foreground">
                Lückenlos, mit Zeitpunkt und Urheber.
              </p>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {verlauf.map((eintrag) => (
                  <li key={eintrag.id} className="flex gap-3">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-marke" />
                    <div className="min-w-0 flex-1">
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

          <Card>
            <CardHeader className="gap-1">
              <CardTitle>Gespräch mit dem Mieter</CardTitle>
              <p className="text-xs text-muted-foreground">
                Wortlaut, falls jemand nachfragt.
              </p>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {nachrichten.map((nachricht) => {
                const vomMieter = nachricht.richtung === "mieter";
                const vomBetrieb = nachricht.richtung === "handwerker";
                return (
                  <div
                    key={nachricht.id}
                    className={vomMieter ? "flex justify-start" : "flex justify-end"}
                  >
                    <div
                      className={
                        vomMieter
                          ? "max-w-[80%] rounded-lg rounded-bl-sm bg-slate-100 px-3 py-2"
                          : vomBetrieb
                            ? "max-w-[80%] rounded-lg rounded-bl-sm border border-border bg-white px-3 py-2"
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
                        {vomMieter
                          ? einheit?.mieter_name
                          : vomBetrieb
                            ? (handwerker?.firma ?? "Betrieb")
                            : "Assistent"}{" "}
                        · {alsDatumZeit(nachricht.gesendet_am)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div>
          <Eingreifen
            slug={slug}
            vorgangId={vorgang.id}
            titel={vorgang.titel}
            gestoppt={vorgang.status === "storniert"}
          />
        </div>
      </div>
    </div>
  );
}

function Eckwert({ bezeichnung, wert }: { bezeichnung: string; wert: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{bezeichnung}</dt>
      <dd className="font-medium text-slate-800">{wert}</dd>
    </div>
  );
}
