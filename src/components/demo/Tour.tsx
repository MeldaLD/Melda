"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  CheckIcon,
  LayersIcon,
  PauseIcon,
  RouteIcon,
  XIcon,
} from "lucide-react";

import {
  detailStationen,
  tourStationen,
  tourTexte,
  type TourStation,
} from "@config/tour";
import { beispieleUmschalten } from "@/app/demo/[slug]/aktionen";
import {
  Erweiterbar,
  Leistungsbilanz,
  NaechsterSchritt,
} from "@/components/gemeinsam/Leistungsbilanz";
import { aufTourEreignis } from "@/lib/tour/ereignisse";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Stand = "begruessung" | "laeuft" | "pausiert" | "abschluss" | "aus";

/** Was zwischen zwei Stationen kurz stehen bleibt. */
type Zwischenstand = "erledigt" | "entfaellt";

/**
 * Wie lange die markierte Stelle fehlen darf, bevor die Tour anhält.
 *
 * Kurz weg ist normal: Der Assistent tippt, und die Knopfleiste verschwindet
 * für einen Moment. Dauerhaft weg heißt, dass der Betrachter etwas getan hat,
 * womit die Aufgabe nichts mehr zu tun hat. Der zweite Wert gilt, solange die
 * Stelle überhaupt noch nie da war – beim Seitenwechsel baut sich der Chat
 * erst auf, und ein Gespräch beginnt mit zwei getippten Sätzen.
 */
const GEDULD_MS = 6000;
const GEDULD_ANFANG_MS = 15000;

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
 * DIE TOUR HÄLT AN, WENN DER BETRACHTER WOANDERS HINGEHT
 *
 * Der Chat bietet sieben Themen an, und nur eines führt auf den Weg dieser
 * Tour. Auch innerhalb einer Schadensmeldung gibt es Fälle ohne Rückfrage.
 * Eine Tour, die dann weiter "senden Sie das zweite Foto" fordert, macht die
 * Vorführung kaputt – ausgerechnet in dem Moment, in dem der Kunde von selbst
 * etwas ausprobiert. Deshalb drei Stufen, von genau nach grob:
 *
 *   1. erledigtBei – mehrere richtige Wege zum selben Ziel.
 *   2. entfaelltBei / pausiertBei – benannte Abzweigungen, sofort erkannt.
 *   3. Der Wächter in der Messschleife – fehlt die markierte Stelle dauerhaft,
 *      obwohl der Betrachter auf der richtigen Seite ist, hält die Tour an.
 *      Das fängt auch ab, woran beim Schreiben niemand gedacht hat.
 *
 * Angehalten heißt nicht beendet: Sobald die Stelle wieder da ist, läuft die
 * Tour von selbst weiter.
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
  const [zwischenstand, setZwischenstand] = useState<Zwischenstand | null>(null);
  const [rahmen, setRahmen] = useState<DOMRect | null>(null);
  const [platz, setPlatz] = useState<Platz | null>(null);
  const [gleiten, setGleiten] = useState(false);
  /** Unterkante der festen Kopfleisten – dort beginnt der freie Bereich. */
  const [grenze, setGrenze] = useState(64);
  const kasten = useRef<HTMLDivElement>(null);
  /**
   * Welche der beiden Touren gerade läuft.
   *
   * Die kurze beantwortet "was ändert sich für meine Mieter", die
   * ausführliche "was ändert sich für mich". Beide benutzen dieselbe
   * Mechanik – Stationen, wandernder Hinweis, Pause, Wächter –, nur die
   * Liste ist eine andere.
   */
  const [welche, setWelche] = useState<"kurz" | "detail">("kurz");
  const stationen = welche === "detail" ? detailStationen : tourStationen;
  const station = stationen[index];

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
  /**
   * Station abhaken und weiterziehen.
   *
   * Der Zwischenstand bleibt kurz stehen, damit er wahrgenommen wird, bevor
   * die nächste Aufgabe erscheint. Ein Übergangssatz und die Begründung, warum
   * eine Station entfällt, wollen gelesen werden – die bekommen mehr Zeit.
   */
  /**
   * Nummer der zuletzt verarbeiteten Meldung.
   *
   * Der Bus reicht eine gerade abgesetzte Meldung an neue Zuhörer nach –
   * sonst ginge sie beim Seitenwechsel verloren. Ohne dieses Gedächtnis
   * würde dieselbe Meldung nach jedem Neuanhängen ein zweites Mal wirken.
   */
  const verarbeitet = useRef(0);
  /** Läuft gerade ein Übergang? Dann nimmt die Station nichts mehr an. */
  const imUebergang = useRef(false);

  const naechsteStation = useCallback(() => {
    imUebergang.current = false;
    setZwischenstand(null);
    setRahmen(null);
    if (index + 1 >= stationen.length) setStand("abschluss");
    else {
      setStand("laeuft");
      setIndex(index + 1);
    }
  }, [index, stationen.length]);

  const weiterziehen = useCallback(
    (art: Zwischenstand) => {
      imUebergang.current = true;
      setZwischenstand(art);
      setStand("laeuft");
      setRahmen(null);
      const pause = art === "entfaellt" || station?.uebergang ? 4200 : 1400;
      setTimeout(naechsteStation, pause);
    },
    [naechsteStation, station],
  );

  useEffect(() => {
    if ((stand !== "laeuft" && stand !== "pausiert") || !station) return;

    return aufTourEreignis((was, nr) => {
      // Jede Meldung wirkt genau einmal, und während ein Übergang läuft,
      // wirkt gar keine: Sonst zöge eine Station, die sich über zwei Wege
      // gleichzeitig abschließt, die nächste gleich mit weiter.
      if (nr <= verarbeitet.current) return;
      verarbeitet.current = nr;
      if (imUebergang.current) return;

      if (station.erledigtBei.includes(was)) return weiterziehen("erledigt");
      if (station.entfaelltBei?.includes(was)) return weiterziehen("entfaellt");
      // Anhalten statt beharren: Wer gerade etwas anderes tut, soll nicht
      // gegen eine Aufgabe anlaufen, die sich hier nicht mehr erfüllen lässt.
      if (stand === "laeuft" && station.pausiertBei?.includes(was)) {
        setStand("pausiert");
      }
    });
  }, [stand, station, weiterziehen]);

  // --- Wegweiser -----------------------------------------------------------
  // Unterseiten zählen mit: Wer von der Vorgangsliste in einen Vorgang
  // klickt, ist nicht plötzlich falsch – sonst blitzte dort für einen
  // Augenblick ein "Hin"-Knopf auf, der zurück auf die Liste führt.
  const ziel = station ? `/demo/${slug}/${station.pfad}` : "";
  const amRichtigenOrt = !station || pfad === ziel || pfad.startsWith(`${ziel}/`);

  // --- Markierung und Platzierung ------------------------------------------
  // Position des hervorgehobenen Elements nachführen: Der Chat scrollt, das
  // Dashboard auch, und auf dem Telefon dreht man das Gerät. Aus dem
  // gemessenen Rechteck ergibt sich beides – der Ring um das Element und der
  // Platz für den Hinweis daneben.
  //
  // Dieselbe Schleife ist der Wächter der Tour: Wenn die markierte Stelle
  // dauerhaft fehlt, obwohl der Betrachter auf der richtigen Seite ist, hat
  // er etwas getan, womit die Aufgabe nichts mehr zu tun hat. Dann hält die
  // Tour an – und läuft weiter, sobald die Stelle wieder da ist. Das fängt
  // auch die Fälle ab, an die beim Schreiben der Stationen niemand gedacht
  // hat; die benannten Abzweigungen oben wirken nur schneller.
  useEffect(() => {
    const beobachten = stand === "laeuft" || stand === "pausiert";
    if (!beobachten || !station?.markierung || zwischenstand) {
      setRahmen(null);
      return;
    }

    let laeuft = true;
    let jeGesehen = false;
    let fehltSeit: number | null = null;

    const messen = () => {
      if (!laeuft) return;
      requestAnimationFrame(messen);

      const oben = obereGrenze();
      setGrenze((alt) => (Math.round(alt) === Math.round(oben) ? alt : oben));

      const gefunden = document.querySelector(`[data-tour="${station.markierung}"]`);
      if (!gefunden) {
        // Kurz weg ist normal – etwa, weil der Assistent tippt und die
        // Knopfleiste verschwindet. Dann den Ring ausblenden, den Hinweis
        // aber stehen lassen: Ein Kasten, der bei jeder Antwort quer über den
        // Bildschirm springt, macht nervös.
        setRahmen((alt) => (alt === null ? alt : null));
        // Auf dem Weg zur richtigen Seite fehlt die Stelle zu Recht; dort
        // zeigt die Tour einen Wegweiser statt einer Pause.
        if (!amRichtigenOrt) return;
        fehltSeit ??= performance.now();
        const geduld = jeGesehen ? GEDULD_MS : GEDULD_ANFANG_MS;
        if (performance.now() - fehltSeit > geduld) {
          setStand((alt) => (alt === "laeuft" ? "pausiert" : alt));
        }
        return;
      }

      jeGesehen = true;
      fehltSeit = null;
      setStand((alt) => (alt === "pausiert" ? "laeuft" : alt));

      const gemessen = gefunden.getBoundingClientRect();
      setRahmen((alt) => (gleicherRahmen(alt, gemessen) ? alt : gemessen));

      const eigen = kasten.current;
      if (!eigen) return;
      const neu = platzBerechnen(gemessen, eigen.offsetWidth, eigen.offsetHeight, oben);
      setPlatz((alt) => (gleicherPlatz(alt, neu) ? alt : neu));
    };
    requestAnimationFrame(messen);

    return () => {
      laeuft = false;
    };
  }, [stand, station, zwischenstand, pfad, amRichtigenOrt]);

  // Nur beim Stationswechsel gleiten. Während des Scrollens muss der Hinweis
  // bildgenau am Element kleben – ein Übergang würde ihn hinterherhinken
  // lassen, und das sieht nach Fehler aus, nicht nach Absicht.
  useEffect(() => {
    setGleiten(true);
    const uhr = setTimeout(() => setGleiten(false), 700);
    return () => clearTimeout(uhr);
  }, [station?.id, zwischenstand]);

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

  const hingehen = () => {
    if (station) router.push(ziel);
  };

  /**
   * Von der kurzen in die ausführliche Tour.
   *
   * Die Beispieldaten kommen dabei mit dazu, ohne zu fragen: Die
   * ausführliche Tour beginnt mit "was braucht heute Ihre Aufmerksamkeit",
   * und diese Liste ist ohne Bestand leer. Ein leerer Bildschirm als erste
   * Station wäre der schlechteste denkbare Einstieg – deshalb steht der
   * Hinweis darauf im Knopf und nicht in einer Rückfrage.
   */
  const detailStarten = async () => {
    if (beispieleLadbar) await beispieleUmschalten(slug, true);
    setWelche("detail");
    setIndex(0);
    setZwischenstand(null);
    setStand("laeuft");
    router.push(`/demo/${slug}/${detailStationen[0].pfad}`);
    router.refresh();
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

  // Der Abschluss der ausführlichen Tour: kein zweites "kurz
  // zusammengefasst", sondern der nächste Schritt und sonst nichts.
  if (stand === "abschluss" && welche === "detail") {
    return (
      <Einladung
        titel={tourTexte.detailAbschluss.titel}
        text={tourTexte.detailAbschluss.text}
        haupt={tourTexte.detailAbschluss.weiter}
        onHaupt={beenden}
        erledigt
        fussAktion={<NaechsterSchritt />}
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
        // Die zweite von drei gleichrangigen Türen: sprechen, alles ansehen,
        // selbst umschauen. Wer hier weiterschaut, bekommt die Verwaltersicht
        // im Einzelnen erklärt.
        zweiteAktion={<DetailKnopf onStarten={detailStarten} />}
      >
        {/* Die Bilanz statt einer Verabschiedung: was geht weg, was bleibt,
            was ließe sich ergänzen – und wohin, wenn es überzeugt hat. */}
        <div className="space-y-4">
          <Leistungsbilanz kompakt />
          <Erweiterbar knapp />
          <p className="rounded-md border border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground">
            {tourTexte.abschluss.wege.detailHinweis}
          </p>

          {/* Wer selbst umschauen will, tut das besser mit vollem Bestand.
              Der Knopf steht hier und nicht unten bei den drei Wegen: Er ist
              kein vierter Weg, sondern eine Zutat zum dritten. */}
          {beispieleLadbar && (
            <div className="space-y-2 rounded-md border border-dashed border-border p-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {tourTexte.abschluss.beispiele.hinweis}
              </p>
              <BeispieleKnopf
                slug={slug}
                onFertig={beenden}
                beschriftung={tourTexte.abschluss.beispiele.knopf}
              />
            </div>
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

  // Angehalten hängt der Hinweis an keiner Stelle mehr – es gibt gerade
  // keine. Also zurück an den oberen Rand, schmaler und ohne Aufgabe.
  const angehalten = stand === "pausiert";
  const verankert = platz && !angehalten;

  return (
    <>
      {rahmen && <Markierung rahmen={rahmen} />}

      <div
        ref={kasten}
        className={cn(
          "fixed z-40",
          angehalten
            ? "w-[min(20rem,calc(100vw-1rem))]"
            : "w-[min(24rem,calc(100vw-1rem))]",
          gleiten && "transition-[top,left] duration-500 ease-out",
          !verankert && "left-1/2 -translate-x-1/2",
        )}
        // Ohne Anker unter den festen Kopfleisten – nicht darüber. Verdeckt
        // wäre dort die Demo-Kennzeichnung oder die Kopfzeile des Chats.
        style={verankert ? { top: platz.oben, left: platz.links } : { top: grenze }}
      >
        <div className="relative rounded-lg bg-slate-900 px-3.5 py-2.5 text-left shadow-2xl ring-1 ring-black/20">
          {/* Kein Zeiger ohne Ring: Zwischen zwei Stationen ist die
              Markierung weg, und ein Zeiger deutete dann auf nichts. */}
          {verankert && platz.zeigt && !zwischenstand && (
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
            <Fortschritt
              aktuell={index}
              erledigt={zwischenstand !== null}
              stationen={stationen}
            />
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

          {angehalten ? (
            <>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-demo">
                <PauseIcon className="size-4 shrink-0" aria-hidden />
                {tourTexte.angehalten.titel}
              </p>
              <p className="mt-1 text-xs leading-snug text-slate-300">
                {tourTexte.angehalten.text}
              </p>
            </>
          ) : zwischenstand === "entfaellt" ? (
            <p className="mt-1 text-xs leading-snug text-slate-300">
              {station?.entfaellt}
            </p>
          ) : zwischenstand === "erledigt" ? (
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

          {/* Angehalten: der Weg nach vorn, falls der Betrachter hier gar
              nicht mehr weitermachen will. Sonst der Wegweiser zur Seite,
              auf der die Aufgabe stattfindet. */}
          {angehalten ? (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                // Ohne "Erledigt": Der Betrachter hat diese Station nicht
                // gemacht, sondern übersprungen. Das eine als das andere
                // auszugeben, merkt jeder.
                onClick={naechsteStation}
                className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/20"
              >
                {tourTexte.angehalten.weiter}
                <ArrowRightIcon className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : (
            !amRichtigenOrt &&
            !zwischenstand && (
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
            )
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
 * Zwei Dinge dürfen nie verdeckt werden: die Demo-Leiste, weil sie die
 * einzige Kennzeichnung ist, dass hier nichts echt ist – und die Kopfzeile
 * des Chats, weil dort steht, mit wem der Mieter schreibt. Beide sind nicht
 * immer gleich hoch, also werden sie gemessen statt geschätzt.
 */
function obereGrenze(): number {
  const kanten = document.querySelectorAll("[data-demo-leiste], [data-tour-oben]");
  let unterste = 0;
  kanten.forEach((k) => {
    unterste = Math.max(unterste, k.getBoundingClientRect().bottom);
  });
  return unterste + LUFT;
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
function Fortschritt({
  aktuell,
  erledigt,
  stationen,
}: {
  aktuell: number;
  erledigt: boolean;
  stationen: TourStation[];
}) {
  const gesamt = stationen.length;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex gap-1">
        {stationen.map((s, i) => (
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
        {tourTexte.leiste.schritt(aktuell + 1, gesamt)}
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
 * Führt in die ausführliche Tour.
 *
 * Eigene Komponente aus demselben Grund wie der Knopf darunter: Zwischen
 * Klick und neuer Seite liegt ein Serveraufruf, und ein Knopf, der in dieser
 * Zeit nichts tut, wird ein zweites Mal gedrückt.
 */
function DetailKnopf({ onStarten }: { onStarten: () => Promise<void> }) {
  const [laeuft, starten] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={laeuft}
      onClick={() => starten(async () => void (await onStarten()))}
    >
      <RouteIcon />
      {tourTexte.abschluss.wege.detail}
    </Button>
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
