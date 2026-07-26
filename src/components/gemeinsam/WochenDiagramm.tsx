import type { Wochenwert } from "@/lib/dashboard/kennzahlen";

/**
 * Balkendiagramm der Vorgänge je Woche.
 *
 * Bewusst als reines SVG von Hand statt mit einer Diagrammbibliothek: Das
 * sind sechs Balken, dafür 90 kB JavaScript in den Browser zu schicken wäre
 * bei einer Zielladezeit von zwei Sekunden nicht zu rechtfertigen. Und es
 * rendert serverseitig mit, ist also sofort sichtbar.
 */
/** Höhe der Zeichenfläche in Pixeln. */
const FLAECHE = 132;

export function WochenDiagramm({ werte }: { werte: Wochenwert[] }) {
  const hoechst = Math.max(1, ...werte.map((w) => w.gesamt));

  return (
    <div>
      <div className="flex items-end gap-2" style={{ height: FLAECHE + 36 }}>
        {werte.map((wert) => {
          // Bewusst feste Pixelwerte statt Prozent: Eine Prozenthöhe braucht
          // eine aufgelöste Elternhöhe, was in verschachtelten Flex-Boxen
          // unzuverlässig ist – die Balken blieben sonst unsichtbar.
          const hoehe = Math.max(3, Math.round((wert.gesamt / hoechst) * FLAECHE));
          const autoHoehe = wert.gesamt
            ? Math.round((wert.automatisch / wert.gesamt) * hoehe)
            : 0;

          return (
            <div
              key={wert.beschriftung}
              className="flex flex-1 flex-col items-center justify-end gap-1.5"
            >
              <span className="tabellenziffern text-xs font-medium text-slate-700">
                {wert.gesamt}
              </span>
              <div
                className="relative w-full overflow-hidden rounded-t-sm bg-slate-200"
                style={{ height: hoehe }}
                title={`${wert.gesamt} Vorgänge, davon ${wert.automatisch} vollautomatisch aufgenommen`}
              >
                {/* Der markenfarbene Teil ist der vollautomatisch aufgenommene
                    Anteil – die Zahl, die überzeugen soll. */}
                <div
                  className="absolute inset-x-0 bottom-0 bg-marke"
                  style={{ height: autoHoehe }}
                />
              </div>
              <span className="text-[10px] whitespace-nowrap text-muted-foreground">
                {wert.beschriftung}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 border-t border-border pt-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-marke" />
          <span className="text-muted-foreground">Vollautomatisch aufgenommen</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-slate-200" />
          <span className="text-muted-foreground">Manuell erfasst</span>
        </span>
      </div>
    </div>
  );
}
