import { notFound } from "next/navigation";

import { Assistent } from "@/components/gemeinsam/Assistent";
import { LiveAktualisierung } from "@/components/gemeinsam/LiveAktualisierung";
import { Navigation } from "@/components/verwalter/Navigation";
import { bestandLaden } from "@/lib/daten/quelle";
import { ausnahmen } from "@/lib/verwalter/ausnahmen";

/**
 * Die Sicht der Hausverwaltung.
 *
 * Bewusst schmal. Wir übernehmen die Kommunikation mit Mietern und Betrieben;
 * was hier bleibt, ist Überblick und Kontrolle – nicht die Kleinarbeit. Warum
 * gerade diese vier Bereiche, steht in docs/betriebsmodell.md.
 *
 * Keine Freigabeliste, keine Betriebspflege: Das ist unser Arbeitsplatz und
 * liegt unter /leitstand.
 *
 * Der Assistent gehört dagegen hierher. Er ist keine Betriebsfunktion,
 * sondern die Abkürzung durch die Formulare: Wer einen neuen Mieter
 * aufnehmen oder eine Notiz an einem Vorgang hinterlassen will, schreibt das
 * in einem Satz, statt die passende Maske zu suchen. Für jemanden, der Excel
 * kann und keine Lust auf Masken hat, ist das die spürbarste Entlastung von
 * allen – und deshalb steht er auch in der ausführlichen Tour.
 */
export default async function VerwalterLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ergebnis = await bestandLaden(slug);
  if (!ergebnis) notFound();

  const { bestand } = ergebnis;
  const offen = ausnahmen(bestand).filter((a) => a.dringlichkeit === "hoch").length;

  return (
    <div className="flex min-h-full flex-col bg-slate-50 lg:flex-row">
      <Navigation mandant={bestand.mandant} offeneAusnahmen={offen} />
      {/* Die Umschaltleiste steht bewusst nicht hier, sondern auf den Seiten,
          die Fälle zeigen. Über "Grenzen" wäre ein "hier ist noch nichts"
          schlicht falsch – dort steht eine Einstellung, keine Liste. */}
      <main className="min-w-0 flex-1">{children}</main>
      <Assistent bestand={bestand} basis={`/demo/${slug}/dashboard`} />
      <LiveAktualisierung
        tenantId={bestand.mandant.id}
        basis={`/demo/${slug}/dashboard`}
      />
    </div>
  );
}
