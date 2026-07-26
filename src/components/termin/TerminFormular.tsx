"use client";

import { useState, useTransition } from "react";
import { AlertCircleIcon, CheckIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react";

import { vorschlaegeSenden } from "@/app/termin/[token]/aktionen";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Terminvorschlag } from "@/lib/daten/typen";

/** Die Zeitfenster, die zur Auswahl stehen. Bewusst nur drei. */
const FENSTER = [
  { id: "vormittag", beschriftung: "Vormittags", von: 8, bis: 12 },
  { id: "mittag", beschriftung: "Mittags", von: 11, bis: 14 },
  { id: "nachmittag", beschriftung: "Nachmittags", von: 13, bis: 17 },
] as const;

type Zeile = { datum: string; fenster: (typeof FENSTER)[number]["id"] };

/**
 * Drei Terminvorschläge, mehr nicht.
 *
 * Die Bedienung muss einhändig auf einem Telefon funktionieren, im Stehen,
 * zwischen zwei Baustellen. Deshalb: vorbelegte Werte, Datumsfeld und drei
 * große Schalter statt einer Uhrzeitauswahl. Wer nichts ändern will, tippt
 * einmal auf Senden.
 *
 * Genau in dieser Niedrigschwelligkeit liegt der Unterschied zu einem
 * Handwerkerportal – das wird nicht benutzt, ein Link wird benutzt.
 */
export function TerminFormular({
  token,
  wunsch,
  vorbelegt,
}: {
  token: string;
  wunsch: Terminvorschlag | null;
  vorbelegt: Terminvorschlag[];
}) {
  const [zeilen, setZeilen] = useState<Zeile[]>(() =>
    (vorbelegt.length ? vorbelegt : [null, null, null]).slice(0, 3).map((v, i) => {
      if (!v) return { datum: naechsterTag(i + 1), fenster: "vormittag" as const };
      const start = new Date(v.beginn);
      return {
        datum: alsDatumsfeld(start),
        fenster: fensterZuStunde(start.getHours()),
      };
    }),
  );
  const [gesendet, setGesendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();

  if (gesendet) {
    return (
      <div className="space-y-2 rounded-md border border-marke-rand bg-marke-sanft p-4">
        <p className="flex items-center gap-2 font-medium text-marke">
          <CheckIcon className="size-4 shrink-0" aria-hidden />
          Danke, das ist angekommen.
        </p>
        <p className="text-sm text-slate-700">
          Wir stimmen die Termine jetzt mit dem Mieter ab und melden uns, sobald einer
          feststeht. Sie müssen nichts weiter tun.
        </p>
      </div>
    );
  }

  const senden = () =>
    starten(async () => {
      const vorschlaege = zeilen
        .filter((z) => z.datum)
        .map((z) => {
          const f = FENSTER.find((e) => e.id === z.fenster) ?? FENSTER[0];
          return {
            beginn: new Date(`${z.datum}T${zwei(f.von)}:00`).toISOString(),
            ende: new Date(`${z.datum}T${zwei(f.bis)}:00`).toISOString(),
          };
        });

      const antwort = await vorschlaegeSenden(token, vorschlaege);
      if (antwort.ok) setGesendet(true);
      else setFehler(antwort.hinweis ?? "Das hat nicht geklappt.");
    });

  return (
    <div className="space-y-4">
      {wunsch && (
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
          Der Mieter hätte gern{" "}
          <span className="font-medium">{lesbar(wunsch.beginn, wunsch.ende)}</span>.
          Passt Ihnen das, lassen Sie den ersten Vorschlag einfach stehen.
        </p>
      )}

      <div>
        <p className="text-sm font-medium text-slate-800">Wann könnten Sie kommen?</p>
        <p className="text-xs text-muted-foreground">
          Nennen Sie uns bis zu drei Möglichkeiten. Der Mieter wählt eine davon aus.
        </p>
      </div>

      <ol className="space-y-3">
        {zeilen.map((zeile, index) => (
          <li key={index} className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Möglichkeit {index + 1}
              </span>
              {zeilen.length > 1 && (
                <button
                  type="button"
                  onClick={() => setZeilen(zeilen.filter((_, i) => i !== index))}
                  aria-label={`Möglichkeit ${index + 1} entfernen`}
                  className="rounded p-1 text-slate-400 hover:text-slate-700"
                >
                  <XIcon className="size-4" />
                </button>
              )}
            </div>

            <input
              type="date"
              value={zeile.datum}
              min={alsDatumsfeld(new Date())}
              aria-label={`Datum für Möglichkeit ${index + 1}`}
              onChange={(e) =>
                setZeilen(
                  zeilen.map((z, i) =>
                    i === index ? { ...z, datum: e.target.value } : z,
                  ),
                )
              }
              className="tabellenziffern h-12 w-full rounded-md border border-input px-3 text-base focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
            />

            <div className="mt-2 grid grid-cols-3 gap-2">
              {FENSTER.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={zeile.fenster === f.id}
                  onClick={() =>
                    setZeilen(
                      zeilen.map((z, i) => (i === index ? { ...z, fenster: f.id } : z)),
                    )
                  }
                  className={cn(
                    "flex h-12 flex-col items-center justify-center rounded-md border text-xs font-medium transition-colors",
                    zeile.fenster === f.id
                      ? "border-marke-rand bg-marke text-marke-kontrast"
                      : "border-border bg-white text-slate-600",
                  )}
                >
                  {f.beschriftung}
                  <span className="tabellenziffern text-[10px] opacity-75">
                    {zwei(f.von)}–{zwei(f.bis)} Uhr
                  </span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>

      {zeilen.length < 3 && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() =>
            setZeilen([
              ...zeilen,
              { datum: naechsterTag(zeilen.length + 1), fenster: "vormittag" },
            ])
          }
        >
          <PlusIcon /> Weitere Möglichkeit
        </Button>
      )}

      <Button
        variant="marke"
        className="h-12 w-full text-base"
        onClick={senden}
        disabled={laeuft}
      >
        {laeuft && <Loader2Icon className="animate-spin" />}
        Termine senden
      </Button>

      {fehler && (
        <p className="flex items-start gap-1.5 text-sm text-prio-notfall">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {fehler}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

const zwei = (n: number) => String(n).padStart(2, "0");

function alsDatumsfeld(tag: Date): string {
  return `${tag.getFullYear()}-${zwei(tag.getMonth() + 1)}-${zwei(tag.getDate())}`;
}

/** Der n-te Werktag ab heute – Vorbelegung, wenn nichts anderes vorliegt. */
function naechsterTag(abstand: number): string {
  const tag = new Date();
  let offen = abstand;
  while (offen > 0) {
    tag.setDate(tag.getDate() + 1);
    if (tag.getDay() !== 0 && tag.getDay() !== 6) offen -= 1;
  }
  return alsDatumsfeld(tag);
}

function fensterZuStunde(stunde: number): (typeof FENSTER)[number]["id"] {
  if (stunde >= 13) return "nachmittag";
  if (stunde >= 11) return "mittag";
  return "vormittag";
}

function lesbar(beginn: string, ende: string): string {
  const tag = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Berlin",
  }).format(new Date(beginn));
  const zeit = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  return `${tag}, ${zeit.format(new Date(beginn))}–${zeit.format(new Date(ende))} Uhr`;
}
