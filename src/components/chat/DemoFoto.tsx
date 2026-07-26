"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Zeigt ein Demo-Foto aus public/demo-fotos/.
 *
 * Solange dort noch keine echte Datei liegt, erscheint ein beschrifteter
 * Platzhalter statt eines kaputten Bildsymbols. Sobald Sie eine Datei mit dem
 * passenden Namen ablegen, wird sie automatisch angezeigt – es ist keine
 * Codeänderung nötig.
 *
 * DEMO: Vor dem ersten Kundenversand müssen die echten Bilder hinterlegt sein.
 * Welche Dateinamen gebraucht werden, steht in config/scenarios.ts.
 */
export function DemoFoto({
  datei,
  beschriftung,
  alt,
  className,
}: {
  datei: string;
  beschriftung: string;
  alt?: string;
  className?: string;
}) {
  const [fehlt, setFehlt] = useState(false);

  if (fehlt) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 bg-slate-100 p-3 text-center",
          className,
        )}
        role="img"
        aria-label={alt ?? beschriftung}
      >
        <ImageIcon className="size-5 text-slate-400" aria-hidden />
        <span className="text-[11px] leading-tight font-medium text-slate-500">
          {beschriftung}
        </span>
      </div>
    );
  }

  return (
    // Bewusst ein einfaches img-Element: Die Dateien liegen statisch im
    // Projekt, und der onError-Rückfall oben ist mit next/image nicht möglich.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/demo-fotos/${datei}`}
      alt={alt ?? beschriftung}
      className={cn("object-cover", className)}
      onError={() => setFehlt(true)}
      loading="lazy"
    />
  );
}
