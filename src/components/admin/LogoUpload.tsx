"use client";

import { useState, useTransition } from "react";
import { UploadIcon } from "lucide-react";

import { logoHochladen } from "@/app/admin/aktionen";
import { Button } from "@/components/ui/button";

/**
 * Logo-Upload nach Supabase Storage.
 *
 * Das Logo erscheint danach im Chat-Kopf und in der Dashboard-Seitenleiste –
 * zusammen mit der Primärfarbe der wirksamste Teil der Personalisierung.
 */
export function LogoUpload({
  slug,
  aktuellesLogo,
}: {
  slug: string;
  aktuellesLogo: string | null;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();

  return (
    <div className="space-y-3">
      {aktuellesLogo ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={aktuellesLogo}
            alt="Aktuelles Logo"
            className="h-9 max-w-40 object-contain"
          />
          <span className="text-xs text-muted-foreground">Aktuell hinterlegt</span>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Noch kein Logo. Ohne Logo werden die Initialen der Firma angezeigt.
        </p>
      )}

      <form
        action={(daten) =>
          starten(async () => {
            setFehler(await logoHochladen(slug, daten));
          })
        }
        className="flex flex-wrap items-center gap-2"
      >
        <input
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          required
          className="min-w-0 flex-1 text-xs file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1.5 file:text-xs"
        />
        <Button type="submit" variant="outline" size="sm" disabled={laeuft}>
          <UploadIcon /> {laeuft ? "Lädt…" : "Hochladen"}
        </Button>
      </form>

      {fehler && <p className="text-xs text-prio-notfall">{fehler}</p>}
      <p className="text-[11px] text-muted-foreground">
        PNG, JPG, SVG oder WebP, höchstens 1 MB. Am besten mit transparentem Hintergrund
        – das Logo steht auf der Markenfarbe.
      </p>
    </div>
  );
}
