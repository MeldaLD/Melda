import Link from "next/link";
import { EyeIcon, PlusIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LeerHinweis } from "@/components/gemeinsam/Anzeigen";
import { alsDatumZeit } from "@/lib/dashboard/format";
import { istDatenbankKonfiguriert } from "@/lib/daten/quelle";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { basisUrl } from "@/lib/basis-url";

export const dynamic = "force-dynamic";

type Zeile = {
  slug: string;
  firma: string;
  stadt: string;
  primaerfarbe: string;
  ist_aktiv: boolean;
  ablaufdatum: string | null;
  aufrufe: number;
  erstellt_am: string;
  letzterBesuch: string | null;
  gesamtdauer: number;
};

/**
 * Übersicht aller Demos.
 *
 * Die wichtigste Spalte ist nicht die Firma, sondern "zuletzt angesehen":
 * Das ist das Signal zum Nachfassen. Wer gestern zwölf Minuten im Dashboard
 * war, bekommt heute einen Anruf.
 */
export default async function Mandantenliste() {
  if (!istDatenbankKonfiguriert() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <LeerHinweis text="Ohne Datenbank lassen sich keine Mandanten verwalten. Bitte die Supabase-Variablen setzen." />
    );
  }

  const db = supabaseAdmin();
  const { data: mandanten } = await db
    .from("demo_tenants")
    .select(
      "id, slug, firma, stadt, primaerfarbe, ist_aktiv, ablaufdatum, aufrufe, erstellt_am",
    )
    .order("erstellt_am", { ascending: false });

  const { data: besuche } = await db
    .from("demo_besuche")
    .select("tenant_id, letzter_ping, dauer_sekunden");

  const zeilen: Zeile[] = (mandanten ?? []).map((m) => {
    const eigene = (besuche ?? []).filter((b) => b.tenant_id === m.id);
    return {
      ...m,
      letzterBesuch:
        eigene
          .map((b) => b.letzter_ping)
          .sort()
          .at(-1) ?? null,
      gesamtdauer: eigene.reduce((summe, b) => summe + (b.dauer_sekunden ?? 0), 0),
    };
  });

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Demos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {zeilen.length} {zeilen.length === 1 ? "Mandant" : "Mandanten"} · Basis-URL{" "}
            {basisUrl()}
          </p>
        </div>
        <Button asChild variant="marke">
          <Link href="/admin/mandanten/neu">
            <PlusIcon /> Neue Demo
          </Link>
        </Button>
      </header>

      {zeilen.length === 0 ? (
        <LeerHinweis text="Noch keine Demo angelegt." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {zeilen.map((zeile) => (
                <li key={zeile.slug}>
                  <Link
                    href={`/admin/mandanten/${zeile.slug}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
                  >
                    <span
                      className="size-8 shrink-0 rounded-md border border-border"
                      style={{ background: zeile.primaerfarbe }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {zeile.firma}
                        {!zeile.ist_aktiv && (
                          <Badge variant="outline">Deaktiviert</Badge>
                        )}
                        {zeile.ablaufdatum &&
                          new Date(zeile.ablaufdatum) < new Date() && (
                            <Badge variant="notfall">Abgelaufen</Badge>
                          )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        /demo/{zeile.slug} · {zeile.stadt}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="tabellenziffern text-sm font-medium">
                        {zeile.aufrufe} {zeile.aufrufe === 1 ? "Aufruf" : "Aufrufe"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {zeile.letzterBesuch
                          ? `zuletzt ${alsDatumZeit(zeile.letzterBesuch)}`
                          : "noch nicht geöffnet"}
                      </p>
                    </div>

                    {zeile.gesamtdauer > 0 && (
                      <span className="flex shrink-0 items-center gap-1 rounded-md bg-marke-sanft px-2 py-1 text-xs font-medium text-marke">
                        <EyeIcon className="size-3" aria-hidden />
                        {Math.max(1, Math.round(zeile.gesamtdauer / 60))} Min.
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
