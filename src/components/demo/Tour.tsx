"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRightIcon, CheckIcon, XIcon } from "lucide-react";

import { tourStationen, tourTexte } from "@config/tour";
import { aufTourEreignis } from "@/lib/tour/ereignisse";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Stand = "begruessung" | "laeuft" | "abschluss" | "aus";

/**
 * Die geführte Tour durch die Demo.
 *
 * Handlungsorientiert statt erklärend: Jede Station ist erst erledigt, wenn
 * der Betrachter die Sache selbst getan hat. Es gibt bewusst keinen
 * "Weiter"-Knopf, mit dem man durchklicken kann, ohne etwas gesehen zu haben.
 *
 * Sichtbar bleibt dabei immer nur eine schmale Leiste oben – kein Kasten,
 * der die Oberfläche verdeckt. Wer sie loswerden will, kommt mit einem Klick
 * raus, und die Entscheidung hält für diese Sitzung.
 */
export function Tour({ slug, automatisch }: { slug: string; automatisch: boolean }) {
  const router = useRouter();
  const pfad = usePathname();

  const [stand, setStand] = useState<Stand>("aus");
  const [index, setIndex] = useState(0);
  const [geradeErledigt, setGeradeErledigt] = useState(false);
  const [rahmen, setRahmen] = useState<DOMRect | null>(null);
  const station = tourStationen[index];

  // Entscheidung merken, aber nur für diese Sitzung: Wer den Link morgen
  // erneut öffnet, soll das Angebot wiederbekommen.
  const speicherSchluessel = `melda_tour_${slug}`;

  useEffect(() => {
    if (sessionStorage.getItem(speicherSchluessel) === "beendet") return;
    if (!automatisch) return;

    // Nur auf der Einstiegsseite von selbst anbieten. Wer einen Direktlink
    // in den Chat bekommt, hat eine Absicht – dem soll sich kein Kasten in
    // den Weg stellen. Läuft die Tour bereits, bleibt sie natürlich sichtbar.
    const istEinstieg = /^\/demo\/[^/]+\/?$/.test(pfad);
    if (istEinstieg) setStand("begruessung");
    // Absicht: nur beim ersten Rendern prüfen, nicht bei jedem Seitenwechsel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automatisch, speicherSchluessel]);

  const beenden = useCallback(() => {
    sessionStorage.setItem(speicherSchluessel, "beendet");
    setStand("aus");
    setRahmen(null);
  }, [speicherSchluessel]);

  // --- Fortschritt ---------------------------------------------------------
  useEffect(() => {
    if (stand !== "laeuft" || !station) return;

    return aufTourEreignis((was) => {
      if (was !== station.erledigtBei) return;

      // Kurz stehen lassen, damit der Erfolg wahrgenommen wird, bevor die
      // nächste Aufgabe erscheint.
      setGeradeErledigt(true);
      setRahmen(null);
      setTimeout(() => {
        setGeradeErledigt(false);
        if (index + 1 >= tourStationen.length) {
          setStand("abschluss");
        } else {
          setIndex(index + 1);
        }
      }, 1400);
    });
  }, [stand, station, index]);

  // --- Markierung ----------------------------------------------------------
  // Position des hervorgehobenen Elements nachführen: Der Chat scrollt, das
  // Dashboard auch, und auf dem Telefon dreht man das Gerät.
  useEffect(() => {
    if (stand !== "laeuft" || !station?.markierung || geradeErledigt) {
      setRahmen(null);
      return;
    }

    let laeuft = true;
    const messen = () => {
      if (!laeuft) return;
      const ziel = document.querySelector(`[data-tour="${station.markierung}"]`);
      setRahmen(ziel ? ziel.getBoundingClientRect() : null);
      requestAnimationFrame(messen);
    };
    requestAnimationFrame(messen);

    return () => {
      laeuft = false;
    };
  }, [stand, station, geradeErledigt, pfad]);

  // --- Wegweiser -----------------------------------------------------------
  const amRichtigenOrt =
    !station ||
    (station.pfad === "chat" ? pfad.endsWith("/chat") : pfad.includes("/dashboard"));

  const hingehen = () => {
    if (!station) return;
    router.push(`/demo/${slug}/${station.pfad}`);
  };

  if (stand === "aus") return null;

  if (stand === "begruessung") {
    return (
      <Einladung
        titel={tourTexte.begruessung.titel}
        text={tourTexte.begruessung.text}
        haupt={tourTexte.begruessung.starten}
        neben={tourTexte.begruessung.ablehnen}
        onHaupt={() => {
          setStand("laeuft");
          if (!pfad.endsWith("/chat")) router.push(`/demo/${slug}/chat`);
        }}
        onNeben={beenden}
      />
    );
  }

  if (stand === "abschluss") {
    return (
      <Einladung
        titel={tourTexte.abschluss.titel}
        text={tourTexte.abschluss.text}
        haupt={tourTexte.abschluss.weiter}
        onHaupt={beenden}
        erledigt
      />
    );
  }

  return (
    <>
      {rahmen && <Markierung rahmen={rahmen} />}

      <div className="pointer-events-none fixed inset-x-0 top-7 z-40 flex justify-center px-3">
        <div className="pointer-events-auto w-full max-w-xl rounded-lg border border-marke-rand bg-white shadow-lg">
          <div className="flex items-start gap-3 px-3.5 py-2.5">
            <Fortschritt aktuell={index} erledigt={geradeErledigt} />

            <div className="min-w-0 flex-1">
              {geradeErledigt ? (
                <p className="flex items-center gap-1.5 text-sm font-medium text-marke">
                  <CheckIcon className="size-4" aria-hidden />
                  {tourTexte.leiste.erledigt}
                </p>
              ) : (
                <>
                  <p className="text-sm leading-snug font-medium text-slate-900">
                    {station?.aufgabe}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {station?.begruendung}
                  </p>
                </>
              )}
            </div>

            {!amRichtigenOrt && !geradeErledigt && (
              <Button size="sm" variant="marke" onClick={hingehen} className="shrink-0">
                Hin <ArrowRightIcon />
              </Button>
            )}

            <button
              type="button"
              onClick={beenden}
              aria-label={tourTexte.leiste.ueberspringen}
              title={tourTexte.leiste.ueberspringen}
              className="-mr-1 shrink-0 rounded p-1 text-slate-400 transition-colors hover:text-slate-700"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

/** Drei Punkte statt einer Prozentzahl – auf einen Blick erfassbar. */
function Fortschritt({ aktuell, erledigt }: { aktuell: number; erledigt: boolean }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
      <div className="flex gap-1">
        {tourStationen.map((s, i) => (
          <span
            key={s.id}
            className={cn(
              "size-1.5 rounded-full transition-colors",
              i < aktuell || (i === aktuell && erledigt)
                ? "bg-marke"
                : i === aktuell
                  ? "bg-marke/50"
                  : "bg-slate-200",
            )}
          />
        ))}
      </div>
      <span className="tabellenziffern text-[10px] whitespace-nowrap text-muted-foreground">
        {tourTexte.leiste.schritt(aktuell + 1, tourStationen.length)}
      </span>
    </div>
  );
}

/**
 * Ring um das gemeinte Element.
 *
 * Bewusst kein abdunkelnder Vollbild-Ausschnitt: Der Betrachter soll die
 * Oberfläche sehen und einschätzen können, nicht durch ein Guckloch schauen.
 */
function Markierung({ rahmen }: { rahmen: DOMRect }) {
  const rand = 6;
  return (
    <div
      className="pointer-events-none fixed z-30 rounded-lg ring-2 ring-marke ring-offset-2 ring-offset-transparent"
      style={{
        top: rahmen.top - rand,
        left: rahmen.left - rand,
        width: rahmen.width + rand * 2,
        height: rahmen.height + rand * 2,
      }}
    >
      <span className="absolute inset-0 animate-pulse rounded-lg bg-marke/10" />
    </div>
  );
}

function Einladung({
  titel,
  text,
  haupt,
  neben,
  onHaupt,
  onNeben,
  erledigt,
}: {
  titel: string;
  text: string;
  haupt: string;
  neben?: string;
  onHaupt: () => void;
  onNeben?: () => void;
  erledigt?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        {erledigt && (
          <span className="mb-3 flex size-9 items-center justify-center rounded-full bg-marke text-marke-kontrast">
            <CheckIcon className="size-4" aria-hidden />
          </span>
        )}
        <h2 className="text-lg font-semibold tracking-tight">{titel}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {neben && onNeben && (
            <Button variant="ghost" onClick={onNeben}>
              {neben}
            </Button>
          )}
          <Button variant="marke" onClick={onHaupt}>
            {haupt}
          </Button>
        </div>
      </div>
    </div>
  );
}
