import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/dashboard/Anzeigen";
import { BetriebZeile } from "@/components/dashboard/BetriebZeile";
import { istOffen } from "@/lib/dashboard/kennzahlen";
import { bestandLaden } from "@/lib/daten/quelle";

export default async function HandwerkerSeite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ergebnis = await bestandLaden(slug);
  if (!ergebnis) notFound();

  const { bestand } = ergebnis;

  return (
    <div className="p-4 sm:p-6">
      <Seitenkopf
        titel="Handwerker & Dienstleister"
        beschreibung="Der als Standard markierte Betrieb wird bei diesem Gewerk automatisch vorgeschlagen."
      />

      <p className="mb-4 max-w-3xl rounded-md border border-marke-rand bg-marke-sanft p-3 text-sm leading-relaxed text-slate-700">
        Wo ein Betrieb zugestimmt hat, übernehmen wir die Terminabstimmung: Der Betrieb
        bekommt einen Link, nennt dort drei Zeitfenster, der Mieter wählt eines aus. Auf
        Ihrem Tisch landet nur noch die Bestätigung. Ohne Zustimmung des Betriebs geht
        keine Nachricht raus.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 pl-3 font-medium">Betrieb</th>
              <th className="py-2 pr-3 font-medium">Gewerk</th>
              <th className="py-2 pr-3 font-medium">Reaktionszeit</th>
              <th className="py-2 pr-3 font-medium">Bewertung</th>
              <th className="py-2 pr-3 font-medium">Laufende Aufträge</th>
              <th className="py-2 pr-3 font-medium">Terminabstimmung</th>
              <th className="py-2 pr-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bestand.handwerker.map((betrieb) => (
              <BetriebZeile
                key={betrieb.id}
                slug={slug}
                betrieb={betrieb}
                laufend={
                  bestand.vorgaenge.filter(
                    (v) => v.handwerker_id === betrieb.id && istOffen(v),
                  ).length
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
