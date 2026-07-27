import { InfoIcon } from "lucide-react";

import { TechnikSchalter } from "./TechnikSchalter";
import { ZuruecksetzenKnopf } from "./ZuruecksetzenKnopf";

/**
 * Kennzeichnung jeder Demo-Seite.
 *
 * Bewusst als schmale Leiste über allem statt als schwebendes Abzeichen:
 * Sie ist immer sichtbar, verdeckt nichts und wirkt wie ein bewusster Hinweis
 * und nicht wie ein Aufkleber, den man wegklicken soll. Wer eine Demo zeigt,
 * sollte das auch sagen – das schafft Vertrauen, statt es zu kosten.
 */
export function DemoLeiste({
  slug,
  hinweis,
  zuruecksetzenZeigen,
}: {
  slug: string;
  hinweis?: string;
  /** Nur für uns sichtbar machen, wenn eine Datenbank angebunden ist. */
  zuruecksetzenZeigen?: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-3 bg-slate-900 px-3 py-1.5 text-center text-[11px] font-medium text-slate-300">
      <span className="flex items-center gap-1.5">
        <InfoIcon className="size-3 shrink-0" aria-hidden />
        Demo-Ansicht – Beispieldaten{hinweis ? ` · ${hinweis}` : ""}
      </span>
      {/* Nur für uns: macht im Chat sichtbar, welcher Schritt später an ein
          Modell geht. Vor einem Kunden bleibt sie aus. */}
      <TechnikSchalter />
      {zuruecksetzenZeigen && <ZuruecksetzenKnopf slug={slug} />}
    </div>
  );
}
