import { notFound } from "next/navigation";

import { Assistent } from "@/components/dashboard/Assistent";
import { LiveAktualisierung } from "@/components/dashboard/LiveAktualisierung";
import { Seitenleiste } from "@/components/dashboard/Seitenleiste";
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
      <main className="min-w-0 flex-1">{children}</main>
      <Assistent bestand={bestand} />
      {/* Hört auf Änderungen, die aus dem Mieter-Chat kommen. */}
      <LiveAktualisierung
        tenantId={bestand.mandant.id}
        basis={`/demo/${slug}/dashboard`}
      />
    </div>
  );
}
