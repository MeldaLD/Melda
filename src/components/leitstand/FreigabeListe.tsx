"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircleIcon,
  CheckIcon,
  InfoIcon,
  Loader2Icon,
  PencilIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";

import { LeerHinweis, PrioBadge } from "@/components/gemeinsam/Anzeigen";
import { freigabeEntscheiden } from "@/app/demo/[slug]/leitstand/aktionen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { alterKurz } from "@/lib/dashboard/kennzahlen";
import { tourMelden } from "@/lib/tour/ereignisse";
import {
  FREIGABE_TYP_BEZEICHNUNG,
  type Freigabe,
  type Prioritaet,
} from "@/lib/daten/typen";

export type FreigabeZeile = {
  freigabe: Freigabe;
  vorgangTitel: string | null;
  vorgangId: string | null;
  vorgangNummer: number | null;
  prioritaet: Prioritaet | null;
  objekt: string | null;
  einheit: string | null;
};

type Entscheidung = "freigegeben" | "abgelehnt";

type Abschluss = {
  entscheidung: Entscheidung;
  /** Nur gesetzt, wenn die Datenbank nicht mitgespielt hat. */
  hinweis?: string;
};

/**
 * Das Freigabe-Center.
 *
 * Hier sitzt das gesamte Vertrauensargument: Der Assistent bereitet vor, der
 * Verwalter entscheidet. Deshalb zeigt jede Karte drei Dinge nebeneinander –
 * was getan werden soll, worauf sich das stützt, und den fertigen Text.
 *
 * Die Entscheidung geht in die Datenbank: Ein freigegebener Handwerkerauftrag
 * schiebt den Vorgang auf "An Handwerker", eine freigegebene Mieterantwort
 * wird als versendete Nachricht mitgeschrieben. Der Mieter sieht das im Chat,
 * sobald er den Status abfragt. Was genau passiert, steht in
 * src/lib/daten/freigaben.ts.
 */
export function FreigabeListe({
  zeilen,
  basis,
  slug,
}: {
  zeilen: FreigabeZeile[];
  basis: string;
  slug: string;
}) {
  // Entschiedene Karten bleiben bis zum Neuladen als Quittung stehen. Ohne das
  // verschwände die Karte einfach, und der Betrachter wüsste nicht, ob etwas
  // passiert ist.
  const [abgeschlossen, setAbgeschlossen] = useState<Record<string, Abschluss>>({});

  const offen = zeilen.filter((z) => !abgeschlossen[z.freigabe.id]);
  const erledigt = zeilen.filter((z) => abgeschlossen[z.freigabe.id]);

  return (
    <div className="space-y-4">
      {offen.length === 0 ? (
        <LeerHinweis text="Nichts wartet auf Ihre Freigabe. Alles erledigt." />
      ) : (
        <div className="space-y-3">
          {offen.map((zeile) => (
            <Karte
              key={zeile.freigabe.id}
              zeile={zeile}
              basis={basis}
              slug={slug}
              onFertig={(abschluss) =>
                setAbgeschlossen((alt) => ({ ...alt, [zeile.freigabe.id]: abschluss }))
              }
            />
          ))}
        </div>
      )}

      {erledigt.length > 0 && (
        <section className="space-y-2 border-t border-border pt-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            Gerade entschieden
          </h2>
          {erledigt.map((zeile) => {
            const abschluss = abgeschlossen[zeile.freigabe.id];
            return (
              <div
                key={zeile.freigabe.id}
                className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm"
              >
                {abschluss.entscheidung === "freigegeben" ? (
                  <CheckIcon className="size-4 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <XIcon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{zeile.freigabe.titel}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {abschluss.entscheidung === "freigegeben"
                    ? "freigegeben und versendet"
                    : "abgelehnt"}
                  {abschluss.hinweis && ` · ${abschluss.hinweis}`}
                </span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function Karte({
  zeile,
  basis,
  slug,
  onFertig,
}: {
  zeile: FreigabeZeile;
  basis: string;
  slug: string;
  onFertig: (abschluss: Abschluss) => void;
}) {
  const { freigabe } = zeile;
  const [bearbeiten, setBearbeiten] = useState(false);
  const [text, setText] = useState(freigabe.entwurf_text);
  const [automatik, setAutomatik] = useState(freigabe.regel_automatisch);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();

  const entscheiden = (entscheidung: Entscheidung) => {
    setFehler(null);
    starten(async () => {
      const ergebnis = await freigabeEntscheiden({
        slug,
        freigabeId: freigabe.id,
        entscheidung,
        entwurfText: text,
        automatik,
      });

      if (ergebnis.fehlgeschlagen) {
        setFehler(ergebnis.hinweis ?? "Konnte nicht gespeichert werden.");
        return;
      }

      if (entscheidung === "freigegeben") tourMelden("dashboard:freigegeben");

      // Nicht gespeichert, aber auch kein Fehler: die Vorschau ohne
      // Datenbank. Die Karte wandert trotzdem weiter, nur mit ehrlichem
      // Vermerk – sonst wirkte die Demo kaputt.
      onFertig({
        entscheidung,
        hinweis: ergebnis.gespeichert ? undefined : "nur in der Anzeige",
      });
    });
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{FREIGABE_TYP_BEZEICHNUNG[freigabe.typ]}</Badge>
              {zeile.prioritaet && <PrioBadge prioritaet={zeile.prioritaet} />}
            </div>
            <p className="mt-1.5 font-medium">{freigabe.titel}</p>
            {zeile.vorgangId && (
              <Link
                href={`${basis}/vorgaenge/${zeile.vorgangId}`}
                className="text-xs text-muted-foreground hover:text-marke hover:underline"
              >
                Vorgang {zeile.vorgangNummer} · {zeile.objekt} · {zeile.einheit}
              </Link>
            )}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            seit {alterKurz(freigabe.erstellt_am)}
          </span>
        </div>

        {/* Worauf sich der Vorschlag stützt – ohne das ist es Blackbox. */}
        <div className="flex gap-2 rounded-md bg-slate-50 p-3">
          <SparklesIcon className="mt-0.5 size-4 shrink-0 text-marke" aria-hidden />
          <div>
            <p className="text-xs font-medium text-slate-700">
              Grundlage des Vorschlags
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {freigabe.begruendung}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-700">
            Entwurf {freigabe.empfaenger ? `an ${freigabe.empfaenger}` : ""}
          </p>
          {bearbeiten ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              className="w-full rounded-md border border-input p-3 font-mono text-xs focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
            />
          ) : (
            <pre className="max-h-44 overflow-y-auto rounded-md border border-border bg-white p-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-700">
              {text}
            </pre>
          )}
          {text !== freigabe.entwurf_text && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Ihre Änderung wird mit der Freigabe gespeichert.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="marke"
            size="sm"
            data-tour="freigabe-knopf"
            disabled={laeuft}
            onClick={() => entscheiden("freigegeben")}
          >
            {laeuft ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
            Freigeben
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={laeuft}
            onClick={() => setBearbeiten((b) => !b)}
          >
            <PencilIcon /> {bearbeiten ? "Fertig" : "Bearbeiten"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={laeuft}
            onClick={() => entscheiden("abgelehnt")}
          >
            <XIcon /> Ablehnen
          </Button>
        </div>

        {fehler && (
          <p className="flex items-start gap-1.5 rounded-md bg-prio-notfall-sanft px-2.5 py-2 text-xs text-prio-notfall">
            <AlertCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
            {fehler}
          </p>
        )}

        {/* Der Weg zu mehr Automatisierung – ohne Kontrollverlust. */}
        <label className="flex cursor-pointer items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={automatik}
            onChange={(e) => setAutomatik(e.target.checked)}
            className="mt-0.5 size-3.5 accent-[var(--marke)]"
          />
          <span>
            {FREIGABE_TYP_BEZEICHNUNG[freigabe.typ]} dieser Art künftig automatisch
            freigeben
            {automatik && (
              <span className="mt-1 flex items-center gap-1 text-marke">
                <InfoIcon className="size-3" aria-hidden />
                Gilt ab der nächsten Meldung. Sie werden weiterhin informiert und können
                die Regel in den Einstellungen jederzeit wieder abschalten.
              </span>
            )}
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
