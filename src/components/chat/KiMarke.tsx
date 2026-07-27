"use client";

import { useState } from "react";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDashedIcon,
  CpuIcon,
} from "lucide-react";

import { einsatzNach, stufeNach } from "@config/ki-einsatz";
import type { KiAufruf } from "@/lib/chat/typen";
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
 * Drei Sorten, farblich getrennt:
 *   - Hinterlegter Text, der hinterlegt bleibt (grau, gestrichelter Kreis)
 *   - Heute Skript, später Modellaufruf (Markenfarbe, Prozessorsymbol)
 *   - Gerade wirklich gelaufen (grün, Haken) – mit Modell, Dauer und Token
 *
 * Der dritte Fall ist der Beweis: Ohne ANTHROPIC_API_KEY gibt es ihn nicht,
 * mit Schlüssel steht dort, was tatsächlich passiert ist.
 */
export function KiMarke({ schritt, aufruf }: { schritt: string; aufruf?: KiAufruf }) {
  const [offen, setOffen] = useState(false);
  const einsatz = einsatzNach.get(schritt);
  const stufe = einsatz ? stufeNach.get(einsatz.stufe) : undefined;
  if (!einsatz || !stufe) return null;

  const kommt = einsatz.stand === "vorlaeufig";
  const gelaufen = Boolean(aufruf);

  return (
    <div className="mt-1 max-w-[85%]">
      <button
        type="button"
        onClick={() => setOffen(!offen)}
        aria-expanded={offen}
        className={cn(
          "flex w-full items-center gap-1.5 rounded border px-2 py-1 text-left text-[11px] transition-colors",
          gelaufen
            ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            : kommt
              ? "border-dashed border-marke-rand bg-marke-sanft text-marke hover:bg-marke-sanft/70"
              : "border-dashed border-border bg-white/60 text-muted-foreground hover:bg-white",
        )}
      >
        {gelaufen ? (
          <CheckCircle2Icon className="size-3 shrink-0" aria-hidden />
        ) : kommt ? (
          <CpuIcon className="size-3 shrink-0" aria-hidden />
        ) : (
          <CircleDashedIcon className="size-3 shrink-0" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">
          {gelaufen
            ? `${stufe.bezeichnung} gelaufen`
            : kommt
              ? `Später ${stufe.bezeichnung}`
              : "Bleibt hinterlegter Text"}
          {(aufruf?.modell ?? stufe.modell) && ` · ${aufruf?.modell ?? stufe.modell}`}
        </span>
        <ChevronDownIcon
          className={cn("size-3 shrink-0 transition-transform", offen && "rotate-180")}
          aria-hidden
        />
      </button>

      {offen && (
        <div className="mt-1 space-y-1.5 rounded border border-border bg-white p-2.5 text-[11px] leading-relaxed">
          <Zeile beschriftung="Schritt" wert={einsatz.schritt} />
          {aufruf && (
            <>
              {/* Was wirklich passiert ist, steht vor allem, was passieren
                  würde – sonst liest man die Absicht für die Tat. */}
              <Zeile
                beschriftung="Gerade gelaufen"
                wert={`${aufruf.modell}, ${(aufruf.dauerMs / 1000).toFixed(1)} s, ${aufruf.eingabeToken} Token hinein, ${aufruf.ausgabeToken} hinaus`}
                hervorheben
              />
              <Zeile
                beschriftung="Vorher entfernt"
                wert={
                  aufruf.geschwaerzt.length
                    ? aufruf.geschwaerzt.join(", ")
                    : "Nichts gefunden, was zu entfernen gewesen wäre."
                }
              />
            </>
          )}
          {/* Warum diese Stufe und nicht eine andere – das ist die Frage,
              die im Verkaufsgespräch tatsächlich gestellt wird. */}
          <Zeile beschriftung="Warum diese Stufe" wert={stufe.begruendung} />
          {!aufruf && <Zeile beschriftung="Heute" wert={einsatz.hinweis} />}
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
        <span className="text-emerald-700">Grün</span> heißt: Hier hat gerade wirklich
        ein Modell gearbeitet – mit Dauer und Tokenzahl.{" "}
        <span className="text-marke">Blau</span> heißt: heute hinterlegter Text, mit
        gesetztem Schlüssel ein Modellaufruf. Grau heißt: bleibt hinterlegt, weil eine
        Zusage oder eine Rechtsauskunft darin steckt. Antippen zeigt die Einzelheiten.
      </p>
    </div>
  );
}
