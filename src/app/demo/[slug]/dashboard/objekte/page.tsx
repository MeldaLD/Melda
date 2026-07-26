import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/dashboard/Anzeigen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { istOffen } from "@/lib/dashboard/kennzahlen";
import { bestandLaden } from "@/lib/daten/quelle";

export default async function ObjekteSeite({
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
        titel="Objekte & Einheiten"
        beschreibung={`${bestand.objekte.length} Objekte mit ${bestand.einheiten.length} Einheiten in ${bestand.mandant.stadt}.`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {bestand.objekte.map((objekt) => {
          const einheiten = bestand.einheiten.filter((e) => e.objekt_id === objekt.id);
          const einheitenIds = new Set(einheiten.map((e) => e.id));
          const offen = bestand.vorgaenge.filter(
            (v) => v.einheit_id && einheitenIds.has(v.einheit_id) && istOffen(v),
          ).length;

          return (
            <Card key={objekt.id}>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle>{objekt.name}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {objekt.plz} {objekt.ort} · {einheiten.length} Einheiten
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {offen} offen
                </span>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border text-sm">
                  {einheiten.map((einheit) => (
                    <li
                      key={einheit.id}
                      className="flex items-center justify-between gap-3 py-1.5"
                    >
                      <span className="w-28 shrink-0 text-muted-foreground">
                        {einheit.bezeichnung}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {einheit.mieter_name}
                      </span>
                      <span className="tabellenziffern shrink-0 text-xs text-muted-foreground">
                        {einheit.mieter_telefon}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
