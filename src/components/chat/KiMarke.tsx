"use client";

import { useState } from "react";
import { ChevronDownIcon, CircleDashedIcon, CpuIcon } from "lucide-react";

import { einsatzNach, stufeNach } from "@config/ki-einsatz";
import { cn } from "@/lib/utils";

/**
 * Zeigt unter einer Chatnachricht, wer sie erzeugt hat.
 *
 * Nur sichtbar, wenn die Technikansicht eingeschaltet ist (?technik=1). Ein
 * Mieter sieht das nie – für den ist es Rauschen und für eine Vorführung
 * beim Kunden meistens auch. Beim Testen dagegen ist es die einzige Art,
 * nachzuvollziehen, an welcher Stelle später wirklich ein Modell arbeitet,
 * warum genau dort, und was es zu sehen bekäme.
 *
 * Zwei Sorten, farblich getrennt:
 *   - Hinterlegter Text, der hinterlegt bleibt (grau, gestrichelter Kreis)
 *   - Heute Skript, später Modellaufruf (Markenfarbe, Prozessorsymbol)
 */
export function KiMarke({ schritt }: { schritt: string }) {
  const [offen, setOffen] = useState(false);
  const einsatz = einsatzNach.get(schritt);
  const stufe = einsatz ? stufeNach.get(einsatz.stufe) : undefined;
  if (!einsatz || !stufe) return null;

  const kommt = einsatz.stand === "vorlaeufig";

  return (
    <div className="mt-1 max-w-[85%]">
      <button
        type="button"
        onClick={() => setOffen(!offen)}
        aria-expanded={offen}
        className={cn(
          "flex w-full items-center gap-1.5 rounded border border-dashed px-2 py-1 text-left text-[11px] transition-colors",
          kommt
            ? "border-marke-rand bg-marke-sanft text-marke hover:bg-marke-sanft/70"
            : "border-border bg-white/60 text-muted-foreground hover:bg-white",
        )}
      >
        {kommt ? (
          <CpuIcon className="size-3 shrink-0" aria-hidden />
        ) : (
          <CircleDashedIcon className="size-3 shrink-0" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">
          {kommt ? `Später ${stufe.bezeichnung}` : "Bleibt hinterlegter Text"}
          {stufe.modell && ` · ${stufe.modell}`}
        </span>
        <ChevronDownIcon
          className={cn("size-3 shrink-0 transition-transform", offen && "rotate-180")}
          aria-hidden
        />
      </button>

      {offen && (
        <div className="mt-1 space-y-1.5 rounded border border-border bg-white p-2.5 text-[11px] leading-relaxed">
          <Zeile beschriftung="Schritt" wert={einsatz.schritt} />
          {/* Warum diese Stufe und nicht eine andere – das ist die Frage,
              die im Verkaufsgespräch tatsächlich gestellt wird. */}
          <Zeile beschriftung="Warum diese Stufe" wert={stufe.begruendung} />
          <Zeile beschriftung="Heute" wert={einsatz.hinweis} />
          {/* Wenn nichts rausgeht, muss das genauso deutlich dastehen wie
              die Aufzählung dessen, was rausginge. */}
          <Zeile
            beschriftung="Geht raus"
            wert={einsatz.daten ?? "Nichts – hier findet kein Modellaufruf statt."}
            hervorheben={Boolean(einsatz.daten)}
          />
          {stufe.preis && (
            <Zeile
              beschriftung="Preis"
              wert={`${stufe.preis.eingabe} $ je Mio. Eingabe, ${stufe.preis.ausgabe} $ je Mio. Ausgabe`}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Zeile({
  beschriftung,
  wert,
  hervorheben,
}: {
  beschriftung: string;
  wert: string;
  hervorheben?: boolean;
}) {
  return (
    <p className={hervorheben ? "text-marke" : "text-slate-600"}>
      <span className="font-semibold">{beschriftung}:</span> {wert}
    </p>
  );
}

/**
 * Erklärt die Marken einmal am Kopf des Verlaufs.
 *
 * Ohne diese Zeile weiß niemand, wofür die beiden Farben stehen – und die
 * Unterscheidung ist der ganze Zweck der Ansicht.
 */
export function KiLegende() {
  return (
    <div className="rounded-lg border border-dashed border-marke-rand bg-white/80 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
      <p className="font-semibold text-slate-800">Technikansicht</p>
      <p className="mt-0.5">
        Unter jeder Antwort steht, wer sie erzeugt.{" "}
        <span className="text-marke">Blau</span> heißt: heute hinterlegter Text, mit der
        Schnittstelle ein Modellaufruf. Grau heißt: bleibt hinterlegt, weil eine Zusage
        oder eine Rechtsauskunft darin steckt. Antippen zeigt, was das Modell zu sehen
        bekäme.
      </p>
    </div>
  );
}
