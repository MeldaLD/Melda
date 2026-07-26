import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Interne Startseite. Für Interessenten nicht gedacht – die bekommen immer
 * einen Direktlink auf /demo/[slug]. Diese Seite ist nur ein Wegweiser für uns.
 */
export default function Startseite() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-3">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Interner Bereich
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Demo-Plattform</h1>
        <p className="text-muted-foreground">
          Personalisierte Vertriebsdemos für Hausverwaltungen. Interessenten erhalten
          einen Direktlink der Form{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
            /demo/mandanten-kuerzel
          </code>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="marke">
          <Link href="/admin">Zur Mandantenverwaltung</Link>
        </Button>
      </div>
    </main>
  );
}
