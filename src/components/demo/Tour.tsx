"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRightIcon, CheckIcon, LayersIcon, XIcon } from "lucide-react";

import { tourStationen, tourTexte } from "@config/tour";
import { beispieleUmschalten } from "@/app/demo/[slug]/aktionen";
import {
  Erweiterbar,
  Leistungsbilanz,
  NaechsterSchritt,
} from "@/components/gemeinsam/Leistungsbilanz";
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
 * DER HINWEIS WANDERT MIT
 *
 * Vorher stand er in einer festen Leiste ganz oben. Das hat beim Mitlesen
 * nicht funktioniert: Wer im Chat unten tippt, schaut nicht an den oberen
 * Bildschirmrand, und der Hinweis wurde schlicht übersehen. Jetzt hängt er
 * an dem Element, um das es gerade geht – dort, wo der Blick ohnehin ist –
 * und gleitet beim Stationswechsel sichtbar an die nächste Stelle. Diese
 * Bewegung ist nicht Schmuck: Sie zeigt, wohin man als Nächstes schauen soll.
 *
 * Farblich gehört er zur Demo (Bernstein), nicht zum Produkt (Mandantenfarbe).
 * Siehe src/components/demo/DemoLeiste.tsx.
 *
 * Wer die Tour loswerden will, kommt mit einem Klick raus, und die
 * Entscheidung hält für diese Sitzung.
 */
export function Tour({
  slug,
  automatisch,
  beispieleLadbar,
}: {
  slug: string;
  automatisch: boolean;
  /** Ob es überhaupt Beispieldaten zum Dazuladen gibt. */
  beispieleLadbar: boolean;
}) {
  const router = useRouter();
  const pfad = usePathname();

  const [stand, setStand] = useState<Stand>("aus");
  const [index, setIndex] = useState(0);
  const [geradeErledigt, setGeradeErledigt] = useState(false);
  const [rahmen, setRahmen] = useState<DOMRect | null>(null);
  const [platz, setPlatz] = useState<Platz | null>(null);
  const [gleiten, setGleiten] = useState(false);
  const kasten = useRef<HTMLDivElement>(null);
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
    setPlatz(null);
  }, [speicherSchluessel]);

  // --- Fortschritt ---------------------------------------------------------
  useEffect(() => {
    if (stand !== "laeuft" || !station) return;

    return aufTourEreignis((was) => {
      if (was !== station.erledigtBei) return;

      // Kurz stehen lassen, damit der Erfolg wahrgenommen wird, bevor die
      // nächste Aufgabe erscheint. Steht ein Übergangssatz an, bekommt er
      // mehr Zeit – er will gelesen werden, nicht nur wahrgenommen.
      setGeradeErledigt(true);
      setRahmen(null);
      setTimeout(
        () => {
          setGeradeErledigt(false);
          if (index + 1 >= tourStationen.length) {
            setStand("abschluss");
          } else {
            setIndex(index + 1);
          }
        },
        station.uebergang ? 4200 : 1400,
      );
    });
  }, [stand, station, index]);

  // --- Markierung und Platzierung ------------------------------------------
  // Position des hervorgehobenen Elements nachführen: Der Chat scrollt, das
  // Dashboard auch, und auf dem Telefon dreht man das Gerät. Aus dem
  // gemessenen Rechteck ergibt sich beides – der Ring um das Element und der
  // Platz für den Hinweis daneben.
  useEffect(() => {
    if (stand !== "laeuft" || !station?.markierung || geradeErledigt) {
      setRahmen(null);
      return;
    }

    let laeuft = true;
    const messen = () => {
      if (!laeuft) return;
      requestAnimationFrame(messen);

      const ziel = document.querySelector(`[data-tour="${station.markierung}"]`);
      if (!ziel) {
        // Das Element ist gerade weg – etwa, weil der Assistent tippt und die
        // Knopfleiste kurz verschwindet. Dann den Ring ausblenden, den
        // Hinweis aber stehen lassen: Ein Kasten, der bei jeder Antwort quer
        // über den Bildschirm springt, macht nervös.
        setRahmen((alt) => (alt === null ? alt : null));
        return;
      }

      const gemessen = ziel.getBoundingClientRect();
      setRahmen((alt) => (gleicherRahmen(alt, gemessen) ? alt : gemessen));

      const eigen = kasten.current;
      if (!eigen) return;
      const neu = platzBerechnen(
        gemessen,
        eigen.offsetWidth,
        eigen.offsetHeight,
        obereGrenze(),
      );
      setPlatz((alt) => (gleicherPlatz(alt, neu) ? alt : neu));
    };
    requestAnimationFrame(messen);

    return () => {
      laeuft = false;
    };
  }, [stand, station, geradeErledigt, pfad]);

  // Nur beim Stationswechsel gleiten. Während des Scrollens muss der Hinweis
  // bildgenau am Element kleben – ein Übergang würde ihn hinterherhinken
  // lassen, und das sieht nach Fehler aus, nicht nach Absicht.
  useEffect(() => {
    setGleiten(true);
    const uhr = setTimeout(() => setGleiten(false), 700);
    return () => clearTimeout(uhr);
  }, [station?.id, geradeErledigt]);

  // Der Chat scrollt seinen Verlauf ganz nach unten. Läge der Hinweis dort
  // über der letzten Nachricht, verdeckte er genau den Satz, auf den er sich
  // bezieht. Also bekommt der Verlauf für die Dauer der Tour unten so viel
  // Luft, wie der Hinweis hoch ist. Siehe ChatFenster.
  useEffect(() => {
    const wurzel = document.documentElement;
    const wert =
      stand === "laeuft" && platz && !platz.unten
        ? `${Math.round(platz.hoehe + 16)}px`
        : "";
    // Nur schreiben, wenn sich wirklich etwas ändert: Jede Änderung an
    // diesem Wert lässt den Chat nachscrollen, und zweimal hintereinander
    // sähe das aus wie ein Zucken.
    if (wurzel.style.getPropertyValue("--tour-luft") === wert) return;
    if (wert) wurzel.style.setProperty("--tour-luft", wert);
    else wurzel.style.removeProperty("--tour-luft");
  }, [stand, platz]);

  useEffect(() => {
    return () => {
      document.documentElement.style.removeProperty("--tour-luft");
    };
  }, []);

  // --- Wegweiser -----------------------------------------------------------
  // Unterseiten zählen mit: Wer von der Vorgangsliste in einen Vorgang
  // klickt, ist nicht plötzlich falsch – sonst blitzte dort für einen
  // Augenblick ein "Hin"-Knopf auf, der zurück auf die Liste führt.
  const ziel = station ? `/demo/${slug}/${station.pfad}` : "";
  const amRichtigenOrt = !station || pfad === ziel || pfad.startsWith(`${ziel}/`);

  const hingehen = () => {
    if (station) router.push(ziel);
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
        breit
        // Der nächste Schritt gehört in die feste Fußleiste. Auf dem Telefon
        // liegt er sonst unter der Kante, und ein Abschluss, dessen Angebot
        // niemand sieht, endet mit "interessant" und sonst nichts.
        fussAktion={<NaechsterSchritt />}
        // Wer jetzt weiterschaut, hat den Zusammenhang zwischen Chat und
        // Übersicht gesehen. Ab hier hilft der volle Bestand mehr, als er
        // verdeckt – aber nur, wenn der Betrachter ihn selbst dazuholt.
        zweiteAktion={
          beispieleLadbar ? (
            <BeispieleKnopf
              slug={slug}
              onFertig={beenden}
              beschriftung={tourTexte.abschluss.beispiele.knopf}
            />
          ) : null
        }
      >
        {/* Die Bilanz statt einer Verabschiedung: was geht weg, was bleibt,
            was ließe sich ergänzen – und wohin, wenn es überzeugt hat. */}
        <div className="space-y-4">
          <Leistungsbilanz kompakt />
          <Erweiterbar knapp />
          {beispieleLadbar && (
            <p className="rounded-md border border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground">
              {tourTexte.abschluss.beispiele.hinweis}
            </p>
          )}
          <Link
            href={`/demo/${slug}/leitstand`}
            onClick={beenden}
            className="block text-center text-xs text-muted-foreground hover:text-marke"
          >
            {tourTexte.abschluss.leitstand} →
          </Link>
        </div>
      </Einladung>
    );
  }

  return (
    <>
      {rahmen && <Markierung rahmen={rahmen} />}

      <div
        ref={kasten}
        // Ohne gemessenen Platz – etwa auf einer Station ohne Markierung –
        // bleibt der Hinweis oben mittig stehen.
        className={cn(
          "fixed z-40 w-[min(24rem,calc(100vw-1rem))]",
          gleiten && "transition-[top,left] duration-500 ease-out",
          !platz && "top-16 left-1/2 -translate-x-1/2",
        )}
        style={platz ? { top: platz.oben, left: platz.links } : undefined}
      >
        <div className="relative rounded-lg bg-slate-900 px-3.5 py-2.5 text-left shadow-2xl ring-1 ring-black/20">
          {platz?.zeigt && (
            <span
              aria-hidden
              className="absolute size-3 rotate-45 bg-slate-900"
              style={{
                left: platz.pfeil - 6,
                top: platz.unten ? -5 : undefined,
                bottom: platz.unten ? undefined : -5,
              }}
            />
          )}

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.14em] text-demo uppercase">
              {tourTexte.leiste.kennzeichen}
            </span>
            <Fortschritt aktuell={index} erledigt={geradeErledigt} />
            <button
              type="button"
              onClick={beenden}
              aria-label={tourTexte.leiste.ueberspringen}
              title={tourTexte.leiste.ueberspringen}
              className="-mr-1 ml-auto shrink-0 rounded p-1 text-slate-400 transition-colors hover:text-white"
            >
              <XIcon className="size-4" />
            </button>
          </div>

          {geradeErledigt ? (
            <>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-demo">
                <CheckIcon className="size-4 shrink-0" aria-hidden />
                {tourTexte.leiste.erledigt}
              </p>
              {station?.uebergang && (
                <p className="mt-1 text-xs leading-snug text-slate-300">
                  {station.uebergang}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="mt-1 text-sm leading-snug font-medium text-white">
                {station?.aufgabe}
              </p>
              <p className="mt-1 text-xs leading-snug text-slate-300">
                {station?.begruendung}
              </p>
            </>
          )}

          {!amRichtigenOrt && !geradeErledigt && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={hingehen}
                className="inline-flex items-center gap-1 rounded-md bg-demo px-2.5 py-1 text-xs font-semibold text-slate-900 transition-opacity hover:opacity-90"
              >
                Hin
                <ArrowRightIcon className="size-3.5" aria-hidden />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// --- Platzierung -----------------------------------------------------------

type Platz = {
  oben: number;
  links: number;
  /** Waagerechte Lage der Zeigerspitze, gemessen im Kasten. */
  pfeil: number;
  /** Ob der Kasten unter dem Element sitzt statt darüber. */
  unten: boolean;
  /** Ob der Zeiger wirklich auf das Element deutet. */
  zeigt: boolean;
  hoehe: number;
};

/**
 * Abstand zwischen Hinweis und markiertem Element.
 *
 * Genug, dass der Ring rundherum frei steht: Er liegt mit Versatz sechs bis
 * acht Pixel außerhalb des Elements, und ein Hinweis, der auf dem Ring liegt,
 * sieht aus wie ein Darstellungsfehler.
 */
const ABSTAND = 18;
/** Mindestabstand zum Fensterrand. */
const LUFT = 8;

/**
 * Oberkante für den Hinweis.
 *
 * Die Demo-Leiste ist die einzige Kennzeichnung, dass hier nichts echt ist –
 * ausgerechnet die darf der Hinweis nicht verdecken. Sie ist immer sichtbar
 * und nicht immer gleich hoch, also wird sie gemessen statt geschätzt.
 */
function obereGrenze(): number {
  const leiste = document.querySelector("[data-demo-leiste]");
  if (!leiste) return LUFT;
  return leiste.getBoundingClientRect().bottom + LUFT;
}

/**
 * Wo der Hinweis zu einem markierten Element steht.
 *
 * Grundsätzlich darüber: Das markierte Element ist fast immer etwas zum
 * Anklicken, und ein Kasten darunter läge auf dem Telefon unter dem Daumen.
 * Nur wenn oben kein Platz ist, rutscht er nach unten.
 */
function platzBerechnen(
  ziel: DOMRect,
  breite: number,
  hoehe: number,
  grenzeOben: number,
): Platz {
  const unten = ziel.top - ABSTAND - hoehe < grenzeOben;

  const rohOben = unten ? ziel.bottom + ABSTAND : ziel.top - ABSTAND - hoehe;
  const oben = Math.max(
    grenzeOben,
    Math.min(rohOben, window.innerHeight - hoehe - LUFT),
  );

  const mitte = ziel.left + ziel.width / 2;
  const links = Math.max(
    LUFT,
    Math.min(mitte - breite / 2, window.innerWidth - breite - LUFT),
  );

  return {
    oben,
    links,
    pfeil: Math.max(14, Math.min(mitte - links, breite - 14)),
    unten,
    // Klebt der Kasten am Fensterrand und überlappt das Element, deutet der
    // Zeiger ins Leere. Dann lieber keiner als ein falscher.
    zeigt: unten ? oben >= ziel.bottom : oben + hoehe <= ziel.top,
    hoehe,
  };
}

function gleicherRahmen(a: DOMRect | null, b: DOMRect): boolean {
  return (
    a !== null &&
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  );
}

function gleicherPlatz(a: Platz | null, b: Platz): boolean {
  return (
    a !== null &&
    Math.round(a.oben) === Math.round(b.oben) &&
    Math.round(a.links) === Math.round(b.links) &&
    Math.round(a.pfeil) === Math.round(b.pfeil) &&
    Math.round(a.hoehe) === Math.round(b.hoehe) &&
    a.unten === b.unten &&
    a.zeigt === b.zeigt
  );
}

// ---------------------------------------------------------------------------

/** Drei Punkte statt einer Prozentzahl – auf einen Blick erfassbar. */
function Fortschritt({ aktuell, erledigt }: { aktuell: number; erledigt: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex gap-1">
        {tourStationen.map((s, i) => (
          <span
            key={s.id}
            className={cn(
              "size-1.5 rounded-full transition-colors",
              i < aktuell || (i === aktuell && erledigt)
                ? "bg-demo"
                : i === aktuell
                  ? "bg-demo/50"
                  : "bg-white/25",
            )}
          />
        ))}
      </div>
      <span className="tabellenziffern text-[10px] whitespace-nowrap text-slate-400">
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
 * Die Farbe ist die der Demo, nicht die des Mandanten – sonst sähe die
 * Markierung aus wie ein Bestandteil der Software.
 */
function Markierung({ rahmen }: { rahmen: DOMRect }) {
  const rand = 6;
  return (
    <div
      className="pointer-events-none fixed z-30 rounded-lg ring-2 ring-demo ring-offset-2 ring-offset-transparent"
      style={{
        top: rahmen.top - rand,
        left: rahmen.left - rand,
        width: rahmen.width + rand * 2,
        height: rahmen.height + rand * 2,
      }}
    >
      <span className="absolute inset-0 animate-pulse rounded-lg bg-demo/15" />
    </div>
  );
}

/**
 * Lädt die Beispieldaten dazu und schließt die Tour.
 *
 * Eigene Komponente, weil sie einen Übergang braucht: Zwischen Klick und
 * neuer Seite liegt ein Serveraufruf, und ein Knopf, der in dieser Zeit
 * nichts tut, wird ein zweites Mal gedrückt.
 */
function BeispieleKnopf({
  slug,
  beschriftung,
  onFertig,
}: {
  slug: string;
  beschriftung: string;
  onFertig: () => void;
}) {
  const router = useRouter();
  const [laeuft, starten] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={laeuft}
      onClick={() =>
        starten(async () => {
          await beispieleUmschalten(slug, true);
          onFertig();
          router.refresh();
        })
      }
    >
      <LayersIcon />
      {beschriftung}
    </Button>
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
  breit,
  fussAktion,
  zweiteAktion,
  children,
}: {
  titel: string;
  text: string;
  haupt: string;
  neben?: string;
  onHaupt: () => void;
  onNeben?: () => void;
  erledigt?: boolean;
  /** Für den Abschluss, der mehr als zwei Sätze trägt. */
  breit?: boolean;
  /** Bleibt in der Fußleiste sichtbar, auch wenn der Inhalt scrollt. */
  fussAktion?: React.ReactNode;
  /** Zweiter Weg neben dem Hauptknopf, gleichrangig gesetzt. */
  zweiteAktion?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      {/* Der Inhalt scrollt, die Knopfleiste bleibt stehen. Auf dem Telefon
          lag der wichtigste Knopf sonst unter der Kante – und ein Abschluss,
          dessen nächster Schritt niemand sieht, ist keiner. */}
      <div
        className={cn(
          "flex max-h-[88svh] w-full flex-col rounded-lg bg-white shadow-xl",
          breit ? "max-w-2xl" : "max-w-md",
        )}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* Auch der erste Kasten sagt, woran man ist: Was hier aufgeht, ist
              die Vorführung und nicht die Software. */}
          <div className="mb-3 flex items-center gap-2">
            {erledigt && (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marke text-marke-kontrast">
                <CheckIcon className="size-4" aria-hidden />
              </span>
            )}
            <span className="rounded-sm bg-demo px-1.5 py-0.5 text-[10px] leading-4 font-bold tracking-[0.14em] text-slate-900 uppercase">
              {tourTexte.leiste.kennzeichen}
            </span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight">{titel}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
          {children && <div className="mt-4">{children}</div>}
        </div>

        <div
          className={cn(
            "space-y-2 px-5 pt-3 pb-5",
            children && "border-t border-border",
          )}
        >
          {fussAktion}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {neben && onNeben && (
              <Button variant="ghost" onClick={onNeben}>
                {neben}
              </Button>
            )}
            {zweiteAktion}
            <Button variant={children ? "outline" : "marke"} onClick={onHaupt}>
              {haupt}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
