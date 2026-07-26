"use client";

import { UserIcon } from "lucide-react";

import type { Mandant } from "@/lib/daten/typen";

export type ChatNutzer = {
  einheitId: string;
  name: string;
  objekt: string;
  lage: string;
  telefon: string | null;
};

/**
 * Wer meldet hier eigentlich?
 *
 * Im Echtbetrieb ist das klar: Der Mieter schreibt von seiner Nummer, und die
 * Zuordnung ergibt sich daraus. In der Demo fehlt diese Information – ohne
 * Auswahl weiß der Betrachter nicht, in wessen Rolle er steckt, und im
 * Dashboard taucht die Meldung bei einer beliebigen Wohnung auf.
 *
 * Deshalb zu Beginn diese Auswahl. Sie erklärt zugleich, wie die Zuordnung
 * später funktioniert.
 */
export function NutzerAuswahl({
  mandant,
  nutzer,
  onWaehlen,
}: {
  mandant: Mandant;
  nutzer: ChatNutzer[];
  onWaehlen: (nutzer: ChatNutzer) => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center bg-slate-50 px-5 py-8">
      <div className="mx-auto w-full max-w-md">
        <p className="text-xs font-medium tracking-widest text-marke uppercase">
          Mieter-Ansicht
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          Als wen möchten Sie melden?
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Im laufenden Betrieb erkennt der Assistent den Mieter an seiner Mobilnummer –
          niemand muss sich anmelden. Für diese Demo wählen Sie bitte eine Wohnung aus,
          dann sehen Sie im Dashboard, wo Ihre Meldung landet.
        </p>

        <ul className="mt-5 space-y-2">
          {nutzer.map((eintrag) => (
            <li key={eintrag.einheitId}>
              <button
                type="button"
                onClick={() => onWaehlen(eintrag)}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-white px-3.5 py-3 text-left transition-colors hover:border-marke focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marke-sanft">
                  <UserIcon className="size-4 text-marke" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {eintrag.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {eintrag.objekt} · {eintrag.lage}
                  </span>
                </span>
                {eintrag.telefon && (
                  <span className="tabellenziffern hidden shrink-0 text-[11px] text-muted-foreground sm:block">
                    {eintrag.telefon}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs text-muted-foreground">
          Alle Namen und Nummern sind erfunden. Objekte tragen Straßennamen aus{" "}
          {mandant.stadt}.
        </p>
      </div>
    </div>
  );
}
