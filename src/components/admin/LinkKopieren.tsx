"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Den fertigen Demo-Link in einem Klick in die Zwischenablage. */
export function LinkKopieren({ link }: { link: string }) {
  const [kopiert, setKopiert] = useState(false);

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2500);
    } catch {
      // Ohne Zwischenablage-Rechte bleibt der Link zum Markieren stehen.
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-slate-50 px-3 py-2 text-xs">
        {link}
      </code>
      <Button type="button" variant="marke" size="sm" onClick={kopieren}>
        {kopiert ? <CheckIcon /> : <CopyIcon />}
        {kopiert ? "Kopiert" : "Kopieren"}
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={link} target="_blank" rel="noopener noreferrer">
          <ExternalLinkIcon /> Öffnen
        </a>
      </Button>
    </div>
  );
}
