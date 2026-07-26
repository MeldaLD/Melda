"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type FertigeVorlage = {
  id: string;
  name: string;
  beschreibung: string;
  betreff: string;
  text: string;
};

export function VorlagenWahl({ vorlagen }: { vorlagen: FertigeVorlage[] }) {
  const [gewaehlt, setGewaehlt] = useState(vorlagen[0]?.id);
  const [kopiert, setKopiert] = useState<string | null>(null);

  const vorlage = vorlagen.find((v) => v.id === gewaehlt) ?? vorlagen[0];
  if (!vorlage) return null;

  const kopieren = async (was: "betreff" | "text" | "alles") => {
    const inhalt =
      was === "betreff"
        ? vorlage.betreff
        : was === "text"
          ? vorlage.text
          : `${vorlage.betreff}\n\n${vorlage.text}`;
    try {
      await navigator.clipboard.writeText(inhalt);
      setKopiert(was);
      setTimeout(() => setKopiert(null), 2500);
    } catch {
      // Ohne Zwischenablage-Rechte bleibt der Text zum Markieren stehen.
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {vorlagen.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setGewaehlt(v.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              v.id === gewaehlt
                ? "border-marke bg-marke text-marke-kontrast"
                : "border-border bg-white text-slate-600 hover:border-marke-rand",
            )}
          >
            {v.name}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{vorlage.beschreibung}</p>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-700">Betreff</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => kopieren("betreff")}
              >
                {kopiert === "betreff" ? <CheckIcon /> : <CopyIcon />}
                {kopiert === "betreff" ? "Kopiert" : "Kopieren"}
              </Button>
            </div>
            <p className="rounded-md border border-border bg-slate-50 px-3 py-2 text-sm">
              {vorlage.betreff}
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-700">Nachricht</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => kopieren("text")}
              >
                {kopiert === "text" ? <CheckIcon /> : <CopyIcon />}
                {kopiert === "text" ? "Kopiert" : "Kopieren"}
              </Button>
            </div>
            <pre className="max-h-96 overflow-y-auto rounded-md border border-border bg-slate-50 px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
              {vorlage.text}
            </pre>
          </div>

          <Button
            type="button"
            variant="marke"
            className="w-full"
            onClick={() => kopieren("alles")}
          >
            {kopiert === "alles" ? <CheckIcon /> : <CopyIcon />}
            {kopiert === "alles" ? "Betreff und Text kopiert" : "Alles kopieren"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
