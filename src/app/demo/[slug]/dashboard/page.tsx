import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";

import { KpiKachel } from "@/components/dashboard/KpiKachel";
import { WochenDiagramm } from "@/components/dashboard/WochenDiagramm";
import { PrioBadge, Seitenkopf, SlaPunkt } from "@/components/dashboard/Anzeigen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bestandLaden } from "@/lib/daten/quelle";
import {
  alterKurz,
  istOffen,
  kennzahlen,
  nachDringlichkeit,
  wochenverlauf,
} from "@/lib/dashboard/kennzahlen";
import { alsEuro } from "@/lib/dashboard/format";

export default async function Uebersicht({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ergebnis = await bestandLaden(slug);
  if (!ergebnis) notFound();

  const { bestand } = ergebnis;
  const zahlen = kennzahlen(bestand);
  const verlauf = wochenverlauf(bestand);
  const basis = `/demo/${slug}/dashboard`;

  const dringendste = bestand.vorgaenge
    .filter(istOffen)
    .sort(nachDringlichkeit)
    .slice(0, 5);

  return (
    <div className="p-4 sm:p-6">
      <Seitenkopf
        titel="Übersicht"
        beschreibung={`Stand für ${bestand.mandant.firma}`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiKachel
          bezeichnung="Offene Vorgänge"
          wert={zahlen.offen}
          ziel={`${basis}/vorgaenge`}
        />
        <KpiKachel
          bezeichnung="Davon Notfälle"
          wert={zahlen.notfaelle}
          warnung
          ziel={`${basis}/vorgaenge?prioritaet=notfall`}
        />
        <KpiKachel
          bezeichnung="Wartet auf Ihre Freigabe"
          wert={zahlen.offeneFreigaben}
          ziel={`${basis}/freigaben`}
        />
        <KpiKachel
          bezeichnung="Frist überschritten"
          wert={zahlen.ueberfaellig}
          warnung
          ziel={`${basis}/vorgaenge?sla=rot`}
        />
      </div>

      {/* Die Zahl, die den Verwalter überzeugt – bewusst eine eigene Reihe. */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiKachel
          betont
          bezeichnung="Zeitersparnis diese Woche"
          wert={zahlen.gesparteStunden}
          einheit="Stunden"
          hinweis={`${zahlen.vorgaengeDieseWoche} Meldungen ohne Telefonat aufgenommen`}
        />
        <KpiKachel
          betont
          bezeichnung="Vermiedene Zweitanfahrten"
          wert={zahlen.zweitanfahrtenVermieden}
          hinweis={`Rund ${alsEuro(zahlen.ersparnisEuro)} nicht angefallene Kosten`}
        />
        <KpiKachel
          betont
          bezeichnung="Selbst behoben statt Handwerker"
          wert={zahlen.selbsthilfeErfolge}
          hinweis={`Anleitung im Chat statt Einsatz · ${alsEuro(zahlen.selbsthilfeErsparnisEuro)} gespart`}
        />
        <KpiKachel
          bezeichnung="⌀ Bearbeitungsdauer"
          wert={zahlen.dauerSchnittStunden}
          einheit="Stunden"
          hinweis="Von der Meldung bis zur Erledigung"
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Vorgänge pro Woche</CardTitle>
          </CardHeader>
          <CardContent>
            <WochenDiagramm werte={verlauf} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Dringendste Vorgänge</CardTitle>
            <Link
              href={`${basis}/vorgaenge`}
              className="flex items-center gap-1 text-xs text-marke hover:underline"
            >
              Alle <ArrowRightIcon className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {dringendste.map((vorgang) => {
                const einheit = bestand.einheiten.find(
                  (e) => e.id === vorgang.einheit_id,
                );
                const objekt = bestand.objekte.find((o) => o.id === einheit?.objekt_id);

                return (
                  <li key={vorgang.id}>
                    <Link
                      href={`${basis}/vorgaenge/${vorgang.id}`}
                      className="flex items-start gap-2.5 py-2.5 hover:text-marke"
                    >
                      <SlaPunkt vorgang={vorgang} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{vorgang.titel}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {objekt?.name} · {einheit?.bezeichnung}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <PrioBadge prioritaet={vorgang.prioritaet} />
                        <span className="text-[11px] text-muted-foreground">
                          {alterKurz(vorgang.erstellt_am)}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
