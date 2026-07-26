"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BuildingIcon,
  CalendarIcon,
  CheckSquareIcon,
  InboxIcon,
  LayoutDashboardIcon,
  ListIcon,
  SettingsIcon,
  SmartphoneIcon,
  WrenchIcon,
} from "lucide-react";

import type { Mandant } from "@/lib/daten/typen";
import { cn } from "@/lib/utils";

/**
 * Navigation des Dashboards.
 *
 * Desktop: feste Seitenleiste links.
 * Tablet und kleiner: waagerecht scrollbare Leiste oben. Bewusst kein
 * ausklappbares Menü – ein Verwalter, der die Demo unterwegs überfliegt,
 * soll sehen können, was es alles gibt, ohne erst etwas aufzuklappen.
 */

const BEREICHE = [
  { pfad: "", name: "Übersicht", symbol: LayoutDashboardIcon },
  { pfad: "/vorgaenge", name: "Vorgänge", symbol: ListIcon },
  { pfad: "/freigaben", name: "Freigaben", symbol: CheckSquareIcon, hervorheben: true },
  { pfad: "/termine", name: "Rückrufe & Termine", symbol: CalendarIcon },
  { pfad: "/handwerker", name: "Handwerker", symbol: WrenchIcon },
  { pfad: "/postfach", name: "Postfach", symbol: InboxIcon },
  { pfad: "/objekte", name: "Objekte", symbol: BuildingIcon },
  { pfad: "/einstellungen", name: "Einstellungen", symbol: SettingsIcon },
];

export function Seitenleiste({
  mandant,
  offeneFreigaben,
}: {
  mandant: Mandant;
  offeneFreigaben: number;
}) {
  const pfad = usePathname();
  const basis = `/demo/${mandant.slug}/dashboard`;

  const eintraege = BEREICHE.map((b) => {
    const ziel = `${basis}${b.pfad}`;
    return {
      ...b,
      ziel,
      aktiv: b.pfad === "" ? pfad === ziel : pfad.startsWith(ziel),
    };
  });

  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-white lg:flex">
        <Kopf mandant={mandant} />
        <nav className="flex-1 space-y-0.5 p-3">
          {eintraege.map((e) => (
            <Link
              key={e.ziel}
              href={e.ziel}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                e.aktiv
                  ? "bg-marke-sanft font-medium text-marke"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <e.symbol className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{e.name}</span>
              {e.hervorheben && offeneFreigaben > 0 && (
                <span className="tabellenziffern rounded-full bg-marke px-1.5 py-0.5 text-[11px] font-semibold text-marke-kontrast">
                  {offeneFreigaben}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <MieterAnsicht slug={mandant.slug} />
      </aside>

      {/* Tablet und Telefon */}
      <div className="border-b border-border bg-white lg:hidden">
        <Kopf mandant={mandant} />
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {eintraege.map((e) => (
            <Link
              key={e.ziel}
              href={e.ziel}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors",
                e.aktiv
                  ? "bg-marke-sanft font-medium text-marke"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              <e.symbol className="size-3.5" aria-hidden />
              {e.name}
              {e.hervorheben && offeneFreigaben > 0 && (
                <span className="tabellenziffern rounded-full bg-marke px-1 text-[10px] font-semibold text-marke-kontrast">
                  {offeneFreigaben}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}

function Kopf({ mandant }: { mandant: Mandant }) {
  const initialen = mandant.firma
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
      {mandant.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mandant.logo_url} alt="" className="h-7 max-w-28 object-contain" />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-marke text-xs font-semibold text-marke-kontrast">
          {initialen}
        </span>
      )}
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm leading-tight font-semibold">
          {mandant.firma}
        </p>
        <p className="text-[11px] text-muted-foreground">Hausverwaltung</p>
      </div>
    </div>
  );
}

function MieterAnsicht({ slug }: { slug: string }) {
  return (
    <div className="border-t border-border p-3">
      <Link
        href={`/demo/${slug}/chat`}
        className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-2 text-sm text-slate-600 transition-colors hover:border-marke-rand hover:text-marke"
      >
        <SmartphoneIcon className="size-4 shrink-0" aria-hidden />
        Mieter-Ansicht öffnen
      </Link>
    </div>
  );
}
