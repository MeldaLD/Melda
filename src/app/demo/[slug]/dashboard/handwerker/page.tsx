import { notFound } from "next/navigation";
import { StarIcon } from "lucide-react";

import { Seitenkopf } from "@/components/dashboard/Anzeigen";
import { Badge } from "@/components/ui/badge";
import { istOffen } from "@/lib/dashboard/kennzahlen";
import { bestandLaden } from "@/lib/daten/quelle";
import { GEWERK_BEZEICHNUNG } from "@/lib/daten/typen";

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

      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 pl-3 font-medium">Betrieb</th>
              <th className="py-2 pr-3 font-medium">Gewerk</th>
              <th className="py-2 pr-3 font-medium">Reaktionszeit</th>
              <th className="py-2 pr-3 font-medium">Bewertung</th>
              <th className="py-2 pr-3 font-medium">Laufende Aufträge</th>
              <th className="py-2 pr-3 font-medium">Telefon</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bestand.handwerker.map((betrieb) => {
              const laufend = bestand.vorgaenge.filter(
                (v) => v.handwerker_id === betrieb.id && istOffen(v),
              ).length;

              return (
                <tr key={betrieb.id} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-3 pl-3">
                    <span className="font-medium">{betrieb.firma}</span>
                    {betrieb.ist_standard && (
                      <Badge variant="marke" className="ml-2">
                        Standard
                      </Badge>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">{GEWERK_BEZEICHNUNG[betrieb.gewerk]}</td>
                  <td className="tabellenziffern py-2.5 pr-3">
                    ⌀ {betrieb.reaktionszeit_h} Std.
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-1">
                      <StarIcon
                        className="size-3.5 fill-amber-400 text-amber-400"
                        aria-hidden
                      />
                      <span className="tabellenziffern">
                        {betrieb.bewertung.toFixed(1)}
                      </span>
                    </span>
                  </td>
                  <td className="tabellenziffern py-2.5 pr-3">{laufend}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground">
                    {betrieb.telefon}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
