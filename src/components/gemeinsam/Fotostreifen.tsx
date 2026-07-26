"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";

import { DemoFoto } from "@/components/chat/DemoFoto";

export type Beleg = {
  datei: string;
  /** Woher das Bild stammt, z. B. "Erstes Foto" oder "Nachgefordert". */
  herkunft: string;
  zeit: string;
};

/**
 * Die Bilder eines Vorgangs, direkt unter der Überschrift.
 *
 * Warum ganz oben und nicht im Chatverlauf vergraben: Wer einen Fall öffnet,
 * schaut zuerst auf das Bild. Alles andere – Text, Historie, Zuordnung –
 * versteht man schneller, wenn man weiß, worüber geredet wird.
 *
 * Ein Klick vergrößert. Handwerksbetriebe fragen am Telefon nach Details, die
 * auf einer Kachel von 200 Pixeln nicht zu erkennen sind.
 */
export function Fotostreifen({ belege }: { belege: Beleg[] }) {
  const [gross, setGross] = useState<Beleg | null>(null);

  if (!belege.length) return null;

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {belege.map((beleg, index) => (
          <button
            key={`${beleg.datei}-${index}`}
            type="button"
            onClick={() => setGross(beleg)}
            className="group w-56 shrink-0 text-left"
          >
            <DemoFoto
              datei={beleg.datei}
              beschriftung={beleg.herkunft}
              className="h-36 w-full rounded-md ring-marke-rand transition-shadow group-hover:ring-2"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {beleg.herkunft} · {beleg.zeit}
            </p>
          </button>
        ))}
      </div>

      {gross && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={gross.herkunft}
          onClick={() => setGross(null)}
        >
          <div
            className="w-full max-w-3xl rounded-lg bg-white p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">
                {gross.herkunft} · {gross.zeit}
              </p>
              <button
                type="button"
                onClick={() => setGross(null)}
                aria-label="Schließen"
                className="rounded p-1 text-slate-400 hover:text-slate-700"
              >
                <XIcon className="size-4" />
              </button>
            </div>
            <DemoFoto
              datei={gross.datei}
              beschriftung={gross.herkunft}
              className="h-[60vh] w-full rounded"
            />
          </div>
        </div>
      )}
    </>
  );
}
