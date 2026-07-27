import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/gemeinsam/Anzeigen";
import { Datenumschalter } from "@/components/gemeinsam/Datenumschalter";
import {
  VorgangsTabelle,
  type VorgangsZeile,
} from "@/components/leitstand/VorgangsTabelle";
import { bestandLaden } from "@/lib/daten/quelle";

export default async function VorgangsListe({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const filter = await searchParams;
  const ergebnis = await bestandLaden(slug);
  if (!ergebnis) notFound();

  const { bestand, ansicht } = ergebnis;

  // Die Verknüpfungen einmal serverseitig auflösen, damit die Tabelle im
  // Browser nur noch filtern und sortieren muss.
  const zeilen: VorgangsZeile[] = bestand.vorgaenge.map((vorgang) => {
    const einheit = bestand.einheiten.find((e) => e.id === vorgang.einheit_id);
    const objekt = bestand.objekte.find((o) => o.id === einheit?.objekt_id);
    const mitarbeiter = bestand.mitarbeiter.find(
      (m) => m.id === vorgang.mitarbeiter_id,
    );
    const handwerker = bestand.handwerker.find((h) => h.id === vorgang.handwerker_id);

    return {
      vorgang,
      objektName: objekt?.name ?? "–",
      objektId: objekt?.id ?? "",
      einheit: einheit?.bezeichnung ?? "–",
      mieter: einheit?.mieter_name ?? "–",
      mitarbeiter: mitarbeiter?.name ?? "Nicht zugewiesen",
      mitarbeiterId: mitarbeiter?.id ?? "",
      handwerker: handwerker?.firma ?? "",
    };
  });

  const einzeln = (wert: string | string[] | undefined) =>
    Array.isArray(wert) ? wert[0] : wert;

  return (
    <div className="p-4 sm:p-6">
      <Seitenkopf
        titel="Vorgänge"
        beschreibung="Alle Meldungen aus WhatsApp, E-Mail und Telefon an einer Stelle."
      />
      <div className="mb-5">
        <Datenumschalter slug={slug} ansicht={ansicht} />
      </div>
      <VorgangsTabelle
        zeilen={zeilen}
        basis={`/demo/${slug}/leitstand`}
        objekte={bestand.objekte.map((o) => ({ id: o.id, name: o.name }))}
        mitarbeitende={bestand.mitarbeiter.map((m) => ({ id: m.id, name: m.name }))}
        vorgabe={{
          prioritaet: einzeln(filter.prioritaet),
          status: einzeln(filter.status),
          objekt: einzeln(filter.objekt),
          sla: einzeln(filter.sla),
        }}
      />
    </div>
  );
}
