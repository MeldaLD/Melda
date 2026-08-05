import { notFound } from "next/navigation";

import { Assistent } from "@/components/gemeinsam/Assistent";
import { LiveAktualisierung } from "@/components/gemeinsam/LiveAktualisierung";
import { Seitenleiste } from "@/components/leitstand/Seitenleiste";
import { bestandLaden } from "@/lib/daten/quelle";

export default async function DashboardLayout({
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
  const offeneFreigaben = bestand.freigaben.filter((f) => f.status === "offen").length;

  return (
    <div className="flex min-h-full flex-col bg-slate-50 lg:flex-row">
      <Seitenleiste mandant={bestand.mandant} offeneFreigaben={offeneFreigaben} />
      {/* Die Umschaltleiste tragen die Seiten selbst – nur die, die Fälle
          zeigen. Siehe die Verwaltersicht. */}
      <main className="min-w-0 flex-1">{children}</main>
      <Assistent bestand={bestand} basis={`/demo/${slug}/leitstand`} />
      {/* Hört auf Änderungen, die aus dem Mieter-Chat kommen. */}
      <LiveAktualisierung
        tenantId={bestand.mandant.id}
        basis={`/demo/${slug}/leitstand`}
      />
    </div>
  );
}
