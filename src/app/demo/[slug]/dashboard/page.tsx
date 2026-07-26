import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mandantLaden } from "@/lib/daten/quelle";

/**
 * Platzhalter, bis das Verwalter-Dashboard gebaut ist (Punkt 5 des Plans).
 * Verhindert, dass der Einstiegslink ins Leere führt.
 */
export default async function DashboardPlatzhalter({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const mandant = await mandantLaden(slug);
  if (!mandant) notFound();

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-5 px-5 py-16 text-center">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Verwalter-Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Dieser Bereich wird gerade gebaut. Die Beispieldaten dafür stehen bereits:
          Vorgänge, offene Freigaben, Termine und Handwerksbetriebe.
        </p>
      </div>

      <div className="flex justify-center gap-2">
        <Button asChild variant="marke">
          <Link href={`/demo/${slug}/chat`}>Zur Mieter-Ansicht</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/demo/${slug}`}>
            <ArrowLeftIcon /> Übersicht
          </Link>
        </Button>
      </div>
    </main>
  );
}
