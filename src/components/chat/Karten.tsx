import { AlertTriangleIcon, ArrowRightIcon, CheckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  GEWERK_BEZEICHNUNG,
  MIETER_FORTSCHRITT,
  PRIORITAET_BEZEICHNUNG,
  type Prioritaet,
  type VorgangStatus,
} from "@/lib/daten/typen";
import type { Karte } from "@/lib/chat/typen";
import { cn } from "@/lib/utils";

/** Die eingebetteten Karten im Chat. Mehr als Text, aber im Stil der Blasen. */
export function ChatKarte({ karte }: { karte: Karte }) {
  switch (karte.art) {
    case "sofortmassnahme":
      return <SofortmassnahmeKarte />;
    case "erkenntnis":
      return <ErkenntnisKarte vorher={karte.vorher} nachher={karte.nachher} />;
    case "klassifizierung":
      return (
        <KlassifizierungsKarte
          prioritaet={karte.prioritaet}
          gewerk={karte.gewerk}
          kategorie={karte.kategorie}
        />
      );
    case "status":
      return <StatusKarte status={karte.status} nummer={karte.nummer} />;
  }
}

function SofortmassnahmeKarte() {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-md bg-prio-notfall/10 px-2.5 py-1.5">
      <AlertTriangleIcon className="size-4 shrink-0 text-prio-notfall" aria-hidden />
      <span className="text-xs font-medium text-prio-notfall">
        Sofortmaßnahme – bitte jetzt ausführen
      </span>
    </div>
  );
}

/**
 * Die Karte, die das wichtigste Verkaufsargument sichtbar macht: Was hätte der
 * Handwerker ohne das zweite Foto gewusst – und was weiß er jetzt.
 */
function ErkenntnisKarte({ vorher, nachher }: { vorher: string; nachher: string }) {
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 px-3 py-1.5">
        <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
          Auftrag an den Handwerker
        </span>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <div className="flex gap-2">
          <span className="mt-0.5 text-[11px] text-slate-400">Vorher</span>
          <span className="text-xs text-slate-400 line-through">{vorher}</span>
        </div>
        <div className="flex gap-2">
          <ArrowRightIcon className="mt-0.5 size-3 shrink-0 text-marke" aria-hidden />
          <span className="text-xs font-medium text-slate-800">{nachher}</span>
        </div>
      </div>
    </div>
  );
}

const PRIO_VARIANTE: Record<Prioritaet, "notfall" | "dringend" | "routine"> = {
  notfall: "notfall",
  dringend: "dringend",
  routine: "routine",
};

function KlassifizierungsKarte({
  prioritaet,
  gewerk,
  kategorie,
}: {
  prioritaet: Prioritaet;
  gewerk: keyof typeof GEWERK_BEZEICHNUNG;
  kategorie: string;
}) {
  return (
    <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
        {kategorie}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={PRIO_VARIANTE[prioritaet]}>
          {PRIORITAET_BEZEICHNUNG[prioritaet]}
        </Badge>
        <Badge variant="outline">{GEWERK_BEZEICHNUNG[gewerk]}</Badge>
      </div>
    </div>
  );
}

/** Fortschrittsanzeige wie bei einer Paketverfolgung. */
function StatusKarte({
  status,
  nummer,
}: {
  status: VorgangStatus;
  nummer: number | null;
}) {
  const aktuellerIndex = MIETER_FORTSCHRITT.findIndex((stufe) =>
    stufe.status.includes(status),
  );

  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-3">
      {nummer !== null && (
        <p className="mb-2 text-[11px] text-slate-500">Vorgang {nummer}</p>
      )}
      <ol className="space-y-0">
        {MIETER_FORTSCHRITT.map((stufe, index) => {
          const erledigt = index <= aktuellerIndex;
          const istAktuell = index === aktuellerIndex;
          const letzte = index === MIETER_FORTSCHRITT.length - 1;

          return (
            <li key={stufe.beschriftung} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full border",
                    erledigt
                      ? "border-marke bg-marke text-marke-kontrast"
                      : "border-slate-300 bg-white",
                  )}
                >
                  {erledigt && <CheckIcon className="size-2.5" aria-hidden />}
                </span>
                {!letzte && (
                  <span
                    className={cn(
                      "h-6 w-px",
                      index < aktuellerIndex ? "bg-marke" : "bg-slate-200",
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  "pb-2 text-xs",
                  istAktuell
                    ? "font-semibold text-slate-900"
                    : erledigt
                      ? "text-slate-600"
                      : "text-slate-400",
                )}
              >
                {stufe.beschriftung}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
