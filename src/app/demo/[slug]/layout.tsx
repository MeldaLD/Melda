import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Aufrufzaehler } from "@/components/demo/Aufrufzaehler";
import { DemoLeiste } from "@/components/demo/DemoLeiste";
import { Tour } from "@/components/demo/Tour";
import { ansichtKonfiguration } from "@config/ansicht";
import { demoKonfiguration } from "@config/demo";
import { markenPalette } from "@/lib/branding/farben";
import {
  istDatenbankKonfiguriert,
  istSchreibenMoeglich,
  mandantLaden,
} from "@/lib/daten/quelle";

type Eigenschaften = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const mandant = await mandantLaden(slug);
  return {
    title: mandant ? `Demo für ${mandant.firma}` : "Demo",
    robots: { index: false, follow: false },
  };
}

export default async function DemoLayout({ children, params }: Eigenschaften) {
  const { slug } = await params;
  const mandant = await mandantLaden(slug);

  if (!mandant) notFound();

  // Die Mandantenfarben werden als CSS-Variablen direkt ins gelieferte HTML
  // geschrieben. Dadurch ist die Oberfläche schon beim ersten Bild korrekt
  // eingefärbt – kein sichtbares Umspringen nach dem Laden.
  const palette = markenPalette(mandant.primaerfarbe, mandant.sekundaerfarbe);

  const ohneDatenbank = !istDatenbankKonfiguriert();

  return (
    <div
      className="grid h-svh grid-rows-[auto_1fr]"
      style={palette as React.CSSProperties}
    >
      <DemoLeiste
        slug={slug}
        hinweis={ohneDatenbank ? "Vorschaubetrieb ohne Datenbank" : undefined}
        zuruecksetzenZeigen={!ohneDatenbank}
      />
      <div className="min-h-0 overflow-y-auto">{children}</div>
      {/* Meldet still, ob und wie lange die Demo angesehen wird. */}
      <Aufrufzaehler slug={slug} />
      {/* Führt Betrachter, die allein auf den Link geklickt haben. */}
      <Tour
        slug={slug}
        automatisch={demoKonfiguration.flags.tourAutomatischStarten}
        // Reine Umgebungsprüfung statt einer weiteren Abfrage: Ohne
        // Schreibrecht kann der Chat nichts anlegen, also gibt es auch nichts,
        // wovon sich Beispieldaten abheben würden.
        beispieleLadbar={
          istSchreibenMoeglich() && ansichtKonfiguration.beispieleZunaechstAusblenden
        }
      />
    </div>
  );
}
