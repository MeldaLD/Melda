import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/dashboard/Anzeigen";
import {
  FreigabeListe,
  type FreigabeZeile,
} from "@/components/dashboard/FreigabeListe";
import { bestandLaden } from "@/lib/daten/quelle";

export default async function FreigabeCenter({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ergebnis = await bestandLaden(slug);
  if (!ergebnis) notFound();

  const { bestand } = ergebnis;

  const zeilen: FreigabeZeile[] = bestand.freigaben
    .filter((f) => f.status === "offen")
    .sort((a, b) => a.erstellt_am.localeCompare(b.erstellt_am))
    .map((freigabe) => {
      const vorgang = bestand.vorgaenge.find((v) => v.id === freigabe.vorgang_id);
      const einheit = bestand.einheiten.find((e) => e.id === vorgang?.einheit_id);
      const objekt = bestand.objekte.find((o) => o.id === einheit?.objekt_id);

      return {
        freigabe,
        vorgangTitel: vorgang?.titel ?? null,
        vorgangId: vorgang?.id ?? null,
        vorgangNummer: vorgang?.nummer ?? null,
        prioritaet: vorgang?.prioritaet ?? null,
        objekt: objekt?.name ?? null,
        einheit: einheit?.bezeichnung ?? null,
      };
    });

  return (
    <div className="p-4 sm:p-6">
      <Seitenkopf
        titel="Freigabe-Center"
        beschreibung="Der Assistent hat alles vorbereitet. Entscheiden tun Sie."
      />
      <div className="max-w-3xl">
        <FreigabeListe zeilen={zeilen} basis={`/demo/${slug}/dashboard`} />
      </div>
    </div>
  );
}
