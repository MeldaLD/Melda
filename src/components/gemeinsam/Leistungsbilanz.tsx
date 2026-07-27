import { ArrowRightIcon, CheckIcon, ShieldCheckIcon } from "lucide-react";

import {
  bleibt,
  erweiterbar,
  kontakt,
  uebernehmen,
  versprechen,
} from "@config/angebot";

/**
 * Was wir übernehmen, was bei Ihnen bleibt.
 *
 * Eine Bilanz, keine Funktionsliste. Wer eine Vorführung gesehen hat, kann
 * meistens einzelne Bildschirme wiedergeben, aber nicht in einem Satz sagen,
 * was sich für ihn ändert – genau daran scheitern die meisten. Deshalb steht
 * das hier nebeneinander und nicht untereinander: Der Unterschied ist die
 * Aussage.
 *
 * Wird an drei Stellen benutzt: am Ende der Tour, auf der Einstiegsseite und
 * in der Verwaltersicht. Der Inhalt steht in config/angebot.ts.
 */
export function Leistungsbilanz({ kompakt = false }: { kompakt?: boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed font-medium text-slate-800">
        {versprechen}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Spalte
          titel="Das nehmen wir Ihnen ab"
          punkte={kompakt ? uebernehmen.slice(0, 4) : uebernehmen}
          hervorgehoben
        />
        <Spalte
          titel="Das bleibt bei Ihnen"
          punkte={kompakt ? bleibt.slice(0, 3) : bleibt}
        />
      </div>
    </div>
  );
}

function Spalte({
  titel,
  punkte,
  hervorgehoben,
}: {
  titel: string;
  punkte: readonly string[];
  hervorgehoben?: boolean;
}) {
  return (
    <div
      className={
        hervorgehoben
          ? "rounded-md border border-marke-rand bg-marke-sanft p-3"
          : "rounded-md border border-border bg-white p-3"
      }
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-600 uppercase">
        {hervorgehoben ? (
          <CheckIcon className="size-3.5 text-marke" aria-hidden />
        ) : (
          <ShieldCheckIcon className="size-3.5 text-slate-500" aria-hidden />
        )}
        {titel}
      </p>
      <ul className="mt-2 space-y-1.5">
        {punkte.map((p) => (
          <li key={p} className="flex gap-2 text-sm leading-snug text-slate-700">
            <span
              className={
                hervorgehoben
                  ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-marke"
                  : "mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400"
              }
            />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Die Antwort auf „das passt nicht zu uns".
 *
 * Der häufigste stille Einwand bei fertiger Software. Wer ihn erst im
 * Gespräch entkräftet, hat das Gespräch oft schon nicht mehr – deshalb steht
 * die Antwort da, wo der Gedanke entsteht.
 */
export function Erweiterbar({ knapp = false }: { knapp?: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-4">
      <p className="text-sm font-semibold">{erweiterbar.titel}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {erweiterbar.text}
      </p>

      {!knapp && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {erweiterbar.beispiele.map((b) => (
            <li
              key={b}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-slate-600"
            >
              {b}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-sm leading-relaxed text-slate-700">
        {erweiterbar.schluss}
      </p>
    </div>
  );
}

/** Der nächste Schritt. Ohne ihn endet eine Vorführung mit „interessant". */
export function NaechsterSchritt() {
  const ziel = kontakt.telefon
    ? `tel:${kontakt.telefon.replace(/\s/g, "")}`
    : `mailto:${kontakt.email}`;

  return (
    <a
      href={ziel}
      className="flex items-center justify-between gap-3 rounded-lg bg-marke px-4 py-3 text-sm font-medium text-marke-kontrast transition-opacity hover:opacity-90"
    >
      {kontakt.einladung}
      <ArrowRightIcon className="size-4 shrink-0" aria-hidden />
    </a>
  );
}
