"use client";

import { useActionState, useTransition } from "react";
import { AlertCircleIcon, CheckIcon, Loader2Icon } from "lucide-react";

import {
  automatikAbschalten,
  einstellungenSpeichern,
  type Ergebnis,
} from "@/app/demo/[slug]/leitstand/aktionen";
import { Button } from "@/components/ui/button";
import {
  FREIGABE_TYP_BEZEICHNUNG,
  PRIORITAET_BEZEICHNUNG,
  type FreigabeTyp,
  type MandantEinstellungen,
  type Prioritaet,
} from "@/lib/daten/typen";

/**
 * Die Regelwerte des Mandanten – als Formular, nicht als Schaufenster.
 *
 * Bewusst genau die Werte, an denen ein Verwalter im Gespräch drehen möchte:
 * Wann wird die Ampel rot, bis zu welchem Betrag gilt die
 * Kleinreparaturklausel, wer wird bei Notfällen zusätzlich alarmiert. Alles
 * andere auf dieser Seite bleibt Ansicht – es hängt an Stammdaten, die aus
 * dem ERP des Kunden kommen werden.
 */
export function RegelFormular({
  slug,
  einstellungen,
  standardGrenze,
}: {
  slug: string;
  einstellungen: MandantEinstellungen;
  standardGrenze: number;
}) {
  const [ergebnis, absenden, laeuft] = useActionState<Ergebnis | null, FormData>(
    (zustand, daten) => einstellungenSpeichern(slug, zustand, daten),
    null,
  );

  const sla = einstellungen.sla_stunden ?? {};

  return (
    <form action={absenden} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-slate-700">
          Ab wann ein Vorgang in der Ampel rot wird
        </legend>
        {(Object.keys(PRIORITAET_BEZEICHNUNG) as Prioritaet[]).map((p) => (
          <label key={p} className="flex items-center justify-between gap-3 text-sm">
            <span>{PRIORITAET_BEZEICHNUNG[p]}</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                name={`sla_${p}`}
                aria-label={`Frist ${PRIORITAET_BEZEICHNUNG[p]} in Stunden`}
                min={1}
                max={2000}
                defaultValue={sla[p] ?? ""}
                className="tabellenziffern h-9 w-24 rounded-md border border-input px-2 text-right text-sm focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
              />
              <span className="w-14 text-xs text-muted-foreground">Stunden</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
        <span className="min-w-0">
          Kleinreparaturen bis
          <span className="block text-xs text-muted-foreground">
            Darunter bietet der Assistent eine Anleitung an.
          </span>
        </span>
        <span className="flex items-center gap-2">
          <input
            type="number"
            name="kleinreparatur_grenze_euro"
            aria-label="Höchstbetrag für Kleinreparaturen in Euro"
            min={1}
            max={500}
            defaultValue={einstellungen.kleinreparatur_grenze_euro ?? standardGrenze}
            className="tabellenziffern h-9 w-24 rounded-md border border-input px-2 text-right text-sm focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
          />
          <span className="w-14 text-xs text-muted-foreground">Euro</span>
        </span>
      </label>

      <label className="block space-y-1 border-t border-border pt-3 text-sm">
        <span>Notfallnummer</span>
        <span className="block text-xs text-muted-foreground">
          Wird bei Notfällen zusätzlich per SMS alarmiert. Leer lassen schaltet es ab.
        </span>
        <input
          type="tel"
          name="notfall_telefon"
          defaultValue={einstellungen.notfall_telefon ?? ""}
          placeholder="0561 1234567"
          className="tabellenziffern mt-1 h-9 w-full rounded-md border border-input px-2 text-sm focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span>Interner Hinweis</span>
        <textarea
          name="hinweis"
          rows={2}
          defaultValue={einstellungen.hinweis ?? ""}
          placeholder="z. B. Freitags ab 13 Uhr nicht besetzt"
          className="mt-1 w-full rounded-md border border-input p-2 text-sm focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
        />
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="marke" size="sm" disabled={laeuft}>
          {laeuft && <Loader2Icon className="animate-spin" />}
          Speichern
        </Button>
        {ergebnis && <Rueckmeldung ergebnis={ergebnis} />}
      </div>
    </form>
  );
}

function Rueckmeldung({ ergebnis }: { ergebnis: Ergebnis }) {
  if (ergebnis.gespeichert) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-marke">
        <CheckIcon className="size-3.5" aria-hidden />
        Gespeichert
      </span>
    );
  }
  return (
    <span className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <AlertCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
      {ergebnis.hinweis}
    </span>
  );
}

/**
 * Die im Freigabe-Center gesetzten Automatikregeln – hier wieder abschaltbar.
 *
 * Wichtig fürs Gespräch: Automatisierung ist ein Angebot, keine Einbahnstraße.
 */
export function AutomatikRegeln({
  slug,
  typen,
}: {
  slug: string;
  typen: FreigabeTyp[];
}) {
  const [laeuft, starten] = useTransition();

  if (!typen.length) {
    return (
      <p className="text-xs text-muted-foreground">
        Keine. Jeder Vorschlag wird Ihnen einzeln vorgelegt. Im Freigabe-Center können
        Sie einzelne Arten künftig automatisch freigeben lassen.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border text-sm">
      {typen.map((typ) => (
        <li key={typ} className="flex items-center justify-between gap-3 py-2">
          <span className="min-w-0">
            {FREIGABE_TYP_BEZEICHNUNG[typ]}
            <span className="block text-xs text-muted-foreground">
              wird ohne Nachfrage erteilt
            </span>
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={laeuft}
            onClick={() =>
              starten(async () => void (await automatikAbschalten(slug, typ)))
            }
          >
            Abschalten
          </Button>
        </li>
      ))}
    </ul>
  );
}
