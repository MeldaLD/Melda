import { Badge } from "@/components/ui/badge";
import { slaZustand, type SlaZustand } from "@/lib/dashboard/kennzahlen";
import {
  PRIORITAET_BEZEICHNUNG,
  STATUS_BEZEICHNUNG,
  type Prioritaet,
  type Vorgang,
  type VorgangStatus,
} from "@/lib/daten/typen";
import { cn } from "@/lib/utils";

/** Kleine, überall wiederverwendete Anzeigebausteine des Dashboards. */

export function PrioBadge({ prioritaet }: { prioritaet: Prioritaet }) {
  return <Badge variant={prioritaet}>{PRIORITAET_BEZEICHNUNG[prioritaet]}</Badge>;
}

const STATUS_FARBE: Record<VorgangStatus, string> = {
  neu: "bg-slate-100 text-slate-700",
  in_pruefung: "bg-amber-50 text-amber-800",
  an_handwerker: "bg-sky-50 text-sky-800",
  termin_vereinbart: "bg-sky-50 text-sky-800",
  in_arbeit: "bg-sky-50 text-sky-800",
  erledigt: "bg-emerald-50 text-emerald-800",
  storniert: "bg-slate-100 text-slate-500",
};

export function StatusBadge({ status }: { status: VorgangStatus }) {
  return (
    <span
      className={cn(
        "inline-block rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_FARBE[status],
      )}
    >
      {STATUS_BEZEICHNUNG[status]}
    </span>
  );
}

const SLA_FARBE: Record<SlaZustand, string> = {
  gruen: "bg-emerald-500",
  gelb: "bg-amber-500",
  rot: "bg-prio-notfall",
  erledigt: "bg-slate-300",
};

const SLA_TITEL: Record<SlaZustand, string> = {
  gruen: "Innerhalb der Frist",
  gelb: "Frist läuft bald ab",
  rot: "Frist überschritten",
  erledigt: "Abgeschlossen",
};

/** Die SLA-Ampel als kleiner Punkt vor dem Vorgang. */
export function SlaPunkt({ vorgang }: { vorgang: Vorgang }) {
  const zustand = slaZustand(vorgang);
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", SLA_FARBE[zustand])}
      title={SLA_TITEL[zustand]}
      aria-label={SLA_TITEL[zustand]}
    />
  );
}

export function Seitenkopf({
  titel,
  beschreibung,
  aktion,
}: {
  titel: string;
  beschreibung?: string;
  aktion?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{titel}</h1>
        {beschreibung && (
          <p className="mt-1 text-sm text-muted-foreground">{beschreibung}</p>
        )}
      </div>
      {aktion}
    </header>
  );
}

export function LeerHinweis({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}
