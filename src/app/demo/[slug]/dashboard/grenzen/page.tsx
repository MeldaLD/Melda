import { notFound } from "next/navigation";

import { demoKonfiguration } from "@config/demo";
import { Seitenkopf } from "@/components/gemeinsam/Anzeigen";
import { Erweiterbar } from "@/components/gemeinsam/Leistungsbilanz";
import { GrenzenFormular } from "@/components/verwalter/GrenzenFormular";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bestandLaden } from "@/lib/daten/quelle";
import { kostengrenze, nachweis } from "@/lib/verwalter/ausnahmen";

/**
 * Bis wohin dürfen wir handeln.
 *
 * Das ist der Bildschirm, der die ganze Verwaltersicht trägt: Kontrolle
 * vorher als Regel statt hinterher im Einzelfall. Ohne ihn wäre die
 * Abwesenheit der Einzelfreigabe ein Kontrollverlust; mit ihm ist sie eine
 * Entscheidung, die der Verwalter selbst getroffen hat.
 */
export default async function GrenzenSeite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ergebnis = await bestandLaden(slug);
  if (!ergebnis) notFound();

  const { bestand } = ergebnis;
  const grenze = kostengrenze(bestand);
  const monat = nachweis(bestand, 30);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Seitenkopf
        titel="Grenzen"
        beschreibung="Sie bestimmen, wie viel auf Ihrem Tisch landet."
      />

      <div className="grid max-w-5xl gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Was wir ohne Rückfrage tun dürfen</CardTitle>
          </CardHeader>
          <CardContent>
            <GrenzenFormular
              slug={slug}
              einstellungen={bestand.mandant.einstellungen ?? {}}
              standardBetrag={demoKonfiguration.verwalter.freigabeAbEuroStandard}
              wirkung={{ gesamt: monat.eingegangen, vorgelegt: monat.vorgelegt }}
            />
          </CardContent>
        </Card>

        <Card className="border-marke-rand bg-marke-sanft">
          <CardHeader>
            <CardTitle>Was Ihnen dabei bleibt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-slate-700">
            <p>
              Sie sehen jeden Vorgang vollständig, inklusive Wortlaut und Zeitstempel –
              und Sie können jederzeit eingreifen, auch bei etwas, das unter Ihrer
              Grenze lag.
            </p>
            <p>
              Was Sie nicht mehr tun: Anrufe annehmen, Rückfragen stellen, Betriebe
              suchen, Termine hin- und herschieben, Mieter zurückrufen.
            </p>
            <p className="border-t border-marke-rand pt-3 text-xs text-muted-foreground">
              Ihre Kontrollpflicht gegenüber dem Eigentümer bleibt bei Ihnen – sie lässt
              sich nicht auslagern. Deshalb ist diese Oberfläche darauf gebaut, dass
              Kontrolle wenig Zeit kostet, statt sie Ihnen abzunehmen. Aktuell liegt
              Ihre Grenze bei {grenze} €.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Wer hier die Regeln einstellt, merkt am ehesten, was ihm fehlt –
          deshalb steht die Antwort darauf genau hier. */}
      <div className="max-w-5xl">
        <Erweiterbar />
      </div>
    </div>
  );
}
