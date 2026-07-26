import { CheckIcon, MinusIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { basisUrl } from "@/lib/basis-url";

/**
 * Kleine Diagnoseseite.
 *
 * Zweck: Vom iPad (oder von jedem anderen Gerät ohne Terminal) prüfen können,
 * was auf dem Deployment tatsächlich konfiguriert ist und wie weit der Ausbau
 * ist – ohne dafür Logs lesen zu müssen.
 *
 * Zeigt bewusst nur "gesetzt / nicht gesetzt", niemals die Werte selbst.
 */

// Immer frisch rendern, damit nachträglich ergänzte Umgebungsvariablen
// sofort sichtbar werden und nicht erst nach einem neuen Build.
export const dynamic = "force-dynamic";

export const metadata = { title: "Status" };

const umgebungsvariablen = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", gesetzt: !!process.env.NEXT_PUBLIC_SUPABASE_URL },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    gesetzt: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    gesetzt: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  { name: "ADMIN_PASSWORT", gesetzt: !!process.env.ADMIN_PASSWORT },
  { name: "ADMIN_SESSION_SECRET", gesetzt: !!process.env.ADMIN_SESSION_SECRET },
];

/** Baustand nach dem Plan. Wird bei jedem Ausbauschritt hier mitgepflegt. */
const baustand = [
  { schritt: "Projektgerüst, Designsystem, CI", fertig: true },
  { schritt: "Vorschau-Deployment auf Vercel", fertig: true },
  { schritt: "Datenbankschema und Beispieldaten", fertig: false },
  { schritt: "Mieter-Chat", fertig: false },
  { schritt: "Verwalter-Dashboard", fertig: false },
  { schritt: "Mandanten-Personalisierung und Admin", fertig: false },
];

function Zeile({ text, erfuellt }: { text: string; erfuellt: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span
        className={
          erfuellt
            ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-marke text-marke-kontrast"
            : "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        }
      >
        {erfuellt ? <CheckIcon className="size-3" /> : <MinusIcon className="size-3" />}
      </span>
      <span
        className={
          erfuellt ? "text-sm break-all" : "text-sm break-all text-muted-foreground"
        }
      >
        {text}
      </span>
    </li>
  );
}

export default function StatusSeite() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  const umgebung = process.env.VERCEL_ENV ?? "lokal";
  const alleVariablenGesetzt = umgebungsvariablen.every((v) => v.gesetzt);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Diagnose
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Status</h1>
        <p className="text-sm text-muted-foreground">
          Diese Seite ist nur für uns. Sie zeigt, was auf diesem Deployment konfiguriert
          ist und wie weit der Ausbau ist.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Deployment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Umgebung</span>
            <span className="font-medium">{umgebung}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Branch</span>
            <span className="font-medium break-all">{branch ?? "–"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Commit</span>
            <span className="tabellenziffern font-medium">{commit ?? "–"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Abgerufen</span>
            <span className="tabellenziffern font-medium">
              {new Intl.DateTimeFormat("de-DE", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "Europe/Berlin",
              }).format(new Date())}
            </span>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-2">
            <span className="text-muted-foreground">Basis-URL</span>
            <span className="text-right font-medium break-all">{basisUrl()}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Wird für die Demo-Links in der E-Mail-Vorlage verwendet. Ohne gesetzte{" "}
            <code>NEXT_PUBLIC_BASIS_URL</code> automatisch von Vercel übernommen.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Umgebungsvariablen</CardTitle>
          <Badge variant={alleVariablenGesetzt ? "marke" : "outline"}>
            {umgebungsvariablen.filter((v) => v.gesetzt).length} von{" "}
            {umgebungsvariablen.length}
          </Badge>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {umgebungsvariablen.map((v) => (
              <Zeile key={v.name} text={v.name} erfuellt={v.gesetzt} />
            ))}
          </ul>
          <p className="pt-3 text-xs text-muted-foreground">
            Es werden nur Vorhandensein und Name angezeigt, niemals der Wert.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Baustand</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {baustand.map((b) => (
              <Zeile key={b.schritt} text={b.schritt} erfuellt={b.fertig} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
