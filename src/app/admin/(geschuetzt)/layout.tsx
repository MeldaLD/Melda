import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LogOutIcon } from "lucide-react";

import { abmelden } from "../aktionen";
import { adminEingerichtet, cookieName, sitzungGueltig } from "@/lib/auth/admin";
import { Button } from "@/components/ui/button";

/**
 * Immer zur Laufzeit rendern.
 *
 * Ohne das prerendert Next Seiten dieses Bereichs beim Bauen. Beim Bauen ist
 * ADMIN_PASSWORT aber nicht gesetzt, wodurch der Hinweis "nicht eingerichtet"
 * fest ins HTML gebacken würde – und zwar dauerhaft, auch wenn zur Laufzeit
 * alles korrekt konfiguriert ist. Der frühe Rücksprung unten verhindert
 * zudem, dass cookies() aufgerufen wird und Next die Seite von sich aus als
 * dynamisch erkennt.
 */
export const dynamic = "force-dynamic";

/**
 * Die verlässliche Sperre des Admin-Bereichs.
 *
 * Die Middleware prüft nur, ob überhaupt ein Cookie da ist – in der
 * Edge-Laufzeit steht node:crypto nicht zur Verfügung. Hier wird die
 * Signatur geprüft. Ein gefälschtes Cookie kommt bis hierher und wird
 * genau hier abgewiesen.
 */
export default async function GeschuetztesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!adminEingerichtet()) {
    return (
      <main className="mx-auto max-w-lg space-y-3 px-6 py-16">
        <h1 className="text-lg font-semibold">Admin-Bereich nicht eingerichtet</h1>
        <p className="text-sm text-muted-foreground">
          Bitte <code>ADMIN_PASSWORT</code> und <code>ADMIN_SESSION_SECRET</code> als
          Umgebungsvariablen setzen und neu bereitstellen. Beide sind in{" "}
          <code>.env.example</code> beschrieben.
        </p>
      </main>
    );
  }

  const speicher = await cookies();
  if (!sitzungGueltig(speicher.get(cookieName())?.value)) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-svh bg-slate-50">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
          <Link href="/admin" className="text-sm font-semibold hover:text-marke">
            Mandantenverwaltung
          </Link>
          <form action={abmelden}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOutIcon /> Abmelden
            </Button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-6">{children}</div>
    </div>
  );
}
