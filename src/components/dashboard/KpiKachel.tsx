import Link from "next/link";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiKachel({
  bezeichnung,
  wert,
  einheit,
  hinweis,
  ziel,
  betont,
  warnung,
}: {
  bezeichnung: string;
  wert: string | number;
  einheit?: string;
  hinweis?: string;
  ziel?: string;
  /** Hebt die Kachel in der Markenfarbe hervor – für die Verkaufszahl. */
  betont?: boolean;
  /** Rote Zahl, wenn etwas Aufmerksamkeit braucht. */
  warnung?: boolean;
}) {
  const inhalt = (
    <Card
      className={cn(
        "h-full p-4 transition-colors",
        betont && "border-marke-rand bg-marke-sanft",
        ziel && "hover:border-marke-rand",
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{bezeichnung}</p>
      <p
        className={cn(
          "tabellenziffern mt-1.5 text-2xl font-semibold tracking-tight",
          betont && "text-marke",
          warnung && Number(wert) > 0 && "text-prio-notfall",
        )}
      >
        {wert}
        {einheit && (
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {einheit}
          </span>
        )}
      </p>
      {hinweis && <p className="mt-1 text-[11px] text-muted-foreground">{hinweis}</p>}
    </Card>
  );

  return ziel ? (
    <Link href={ziel} className="block focus-visible:outline-none">
      {inhalt}
    </Link>
  ) : (
    inhalt
  );
}
