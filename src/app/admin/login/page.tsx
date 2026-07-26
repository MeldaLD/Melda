"use client";

import { useActionState } from "react";
import { LockIcon } from "lucide-react";

import { anmelden } from "../aktionen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLogin() {
  const [fehler, absenden, laeuft] = useActionState(anmelden, null);

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center px-6 py-16">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-md bg-marke text-marke-kontrast">
          <LockIcon className="size-4" aria-hidden />
        </span>
        <div>
          <h1 className="text-lg leading-tight font-semibold">Mandantenverwaltung</h1>
          <p className="text-xs text-muted-foreground">Interner Bereich</p>
        </div>
      </div>

      <form action={absenden} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="passwort">Passwort</Label>
          <Input
            id="passwort"
            name="passwort"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
          />
        </div>

        {fehler && <p className="text-sm text-prio-notfall">{fehler}</p>}

        <Button type="submit" variant="marke" className="w-full" disabled={laeuft}>
          {laeuft ? "Wird geprüft…" : "Anmelden"}
        </Button>
      </form>

      <p className="mt-6 text-xs text-muted-foreground">
        Das Passwort steht in der Umgebungsvariable <code>ADMIN_PASSWORT</code>.
      </p>
    </main>
  );
}
