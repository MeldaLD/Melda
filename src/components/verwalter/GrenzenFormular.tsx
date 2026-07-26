"use client";

import { useActionState } from "react";
import { AlertCircleIcon, CheckIcon, Loader2Icon } from "lucide-react";

import { grenzenSpeichern, type Ergebnis } from "@/app/demo/[slug]/dashboard/aktionen";
import { Button } from "@/components/ui/button";
import { tourMelden } from "@/lib/tour/ereignisse";
import {
  GEWERK_BEZEICHNUNG,
  type Gewerk,
  type MandantEinstellungen,
} from "@/lib/daten/typen";

/**
 * Das Steuerrad der Hausverwaltung.
 *
 * Wer die Ausführung abgibt, braucht genau hier die Kontrolle: vorher, als
 * Regel, statt hinterher im Einzelfall. Eine Zahl entscheidet, wie viel auf
 * dem Tisch der Verwaltung landet – und damit, ob sich das Abgeben lohnt.
 *
 * Die Rückmeldung darunter ist Absicht: Sie sagt in einem Satz, was die
 * Einstellung im letzten Monat bedeutet hätte. Eine Grenze ohne Gefühl für
 * ihre Wirkung wird entweder zu vorsichtig oder zu großzügig gesetzt.
 */
export function GrenzenFormular({
  slug,
  einstellungen,
  standardBetrag,
  wirkung,
}: {
  slug: string;
  einstellungen: MandantEinstellungen;
  standardBetrag: number;
  /** Wie viele Vorgänge der letzten 30 Tage über der aktuellen Grenze lagen. */
  wirkung: { gesamt: number; vorgelegt: number };
}) {
  const [ergebnis, absenden, laeuft] = useActionState<Ergebnis | null, FormData>(
    (zustand, daten) => grenzenSpeichern(slug, zustand, daten),
    null,
  );

  const gesetzt = new Set(einstellungen.immer_vorlegen_gewerke ?? []);
  const betrag = einstellungen.freigabe_ab_euro ?? standardBetrag;

  return (
    <form action={absenden} className="space-y-5">
      <div className="space-y-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Fragen Sie mich ab</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              name="freigabe_ab_euro"
              aria-label="Betrag, ab dem vorgelegt wird, in Euro"
              // Ziel der dritten Tourstation – siehe config/tour.ts
              data-tour="grenze-feld"
              onFocus={() => tourMelden("verwalter:grenze-gesehen")}
              min={0}
              max={100000}
              step={50}
              defaultValue={betrag}
              className="tabellenziffern h-11 w-32 rounded-md border border-input px-3 text-right text-lg focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
            />
            <span className="text-lg">Euro</span>
          </span>
        </label>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Darunter beauftragen wir den passenden Betrieb, stimmen den Termin ab und
          melden uns erst, wenn es erledigt ist. Darüber legen wir Ihnen alles
          vorbereitet vor und warten auf Ihr Ja.
        </p>
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {wirkung.gesamt === 0
            ? "Im letzten Monat gab es keine Meldungen zum Vergleich."
            : wirkung.vorgelegt === 0
              ? `Mit dieser Grenze hätten Sie im letzten Monat keine der ${wirkung.gesamt} Meldungen entscheiden müssen.`
              : `Mit dieser Grenze hätten Sie im letzten Monat ${wirkung.vorgelegt} von ${wirkung.gesamt} Meldungen entscheiden müssen.`}
        </p>
      </div>

      <fieldset className="space-y-2 border-t border-border pt-4">
        <legend className="text-sm font-medium">Diese Gewerke immer vorlegen</legend>
        <p className="text-xs text-muted-foreground">
          Unabhängig vom Betrag. Sinnvoll bei allem, wo Sie den Betrieb selbst aussuchen
          möchten.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1 sm:grid-cols-3">
          {(Object.keys(GEWERK_BEZEICHNUNG) as Gewerk[]).map((g) => (
            <label key={g} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="immer_vorlegen"
                value={g}
                defaultChecked={gesetzt.has(g)}
                className="size-3.5 accent-[var(--marke)]"
              />
              {GEWERK_BEZEICHNUNG[g]}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1 border-t border-border pt-4 text-sm">
        <span className="font-medium">Bei Notfällen zusätzlich anrufen</span>
        <span className="block text-xs text-muted-foreground">
          Wir alarmieren den Notdienst sofort und informieren Sie parallel per SMS. Leer
          lassen schaltet es ab.
        </span>
        <input
          type="tel"
          name="notfall_telefon"
          defaultValue={einstellungen.notfall_telefon ?? ""}
          placeholder="0561 1234567"
          className="tabellenziffern mt-1 h-10 w-full max-w-xs rounded-md border border-input px-3 text-sm focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
        />
      </label>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button type="submit" variant="marke" disabled={laeuft}>
          {laeuft && <Loader2Icon className="animate-spin" />}
          Grenzen speichern
        </Button>
        {ergebnis?.gespeichert && (
          <span className="flex items-center gap-1.5 text-sm text-marke">
            <CheckIcon className="size-4" aria-hidden />
            Gespeichert
          </span>
        )}
        {ergebnis && !ergebnis.gespeichert && (
          <span className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {ergebnis.hinweis}
          </span>
        )}
      </div>
    </form>
  );
}
