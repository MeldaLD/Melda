import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckIcon,
  PlayIcon,
  WrenchIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  GEWERK_BEZEICHNUNG,
  MIETER_FORTSCHRITT,
  PRIORITAET_BEZEICHNUNG,
  type Prioritaet,
} from "@/lib/daten/typen";
import type { Karte, Meldung } from "@/lib/chat/typen";
import { cn } from "@/lib/utils";

/** Die eingebetteten Karten im Chat. Mehr als Text, aber im Stil der Blasen. */
export function ChatKarte({ karte }: { karte: Karte }) {
  switch (karte.art) {
    case "sofortmassnahme":
      return <SofortmassnahmeKarte />;
    case "erkenntnis":
      return <ErkenntnisKarte vorher={karte.vorher} nachher={karte.nachher} />;
    case "klassifizierung":
      return (
        <KlassifizierungsKarte
          prioritaet={karte.prioritaet}
          gewerk={karte.gewerk}
          kategorie={karte.kategorie}
        />
      );
    case "status":
      return <StatusKarte meldungen={karte.meldungen} />;
    case "kleinreparatur":
      return (
        <KleinreparaturKarte
          kostenEuro={karte.kostenEuro}
          grenzeEuro={karte.grenzeEuro}
        />
      );
    case "anleitung":
      return <AnleitungsKarte karte={karte} />;
  }
}

function SofortmassnahmeKarte() {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-md bg-prio-notfall/10 px-2.5 py-1.5">
      <AlertTriangleIcon className="size-4 shrink-0 text-prio-notfall" aria-hidden />
      <span className="text-xs font-medium text-prio-notfall">
        Sofortmaßnahme – bitte jetzt ausführen
      </span>
    </div>
  );
}

/**
 * Die Karte, die das wichtigste Verkaufsargument sichtbar macht: Was hätte der
 * Handwerker ohne das zweite Foto gewusst – und was weiß er jetzt.
 */
function ErkenntnisKarte({ vorher, nachher }: { vorher: string; nachher: string }) {
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 px-3 py-1.5">
        <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
          Auftrag an den Handwerker
        </span>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <div className="flex gap-2">
          <span className="mt-0.5 text-[11px] text-slate-400">Vorher</span>
          <span className="text-xs text-slate-400 line-through">{vorher}</span>
        </div>
        <div className="flex gap-2">
          <ArrowRightIcon className="mt-0.5 size-3 shrink-0 text-marke" aria-hidden />
          <span className="text-xs font-medium text-slate-800">{nachher}</span>
        </div>
      </div>
    </div>
  );
}

const PRIO_VARIANTE: Record<Prioritaet, "notfall" | "dringend" | "routine"> = {
  notfall: "notfall",
  dringend: "dringend",
  routine: "routine",
};

function KlassifizierungsKarte({
  prioritaet,
  gewerk,
  kategorie,
}: {
  prioritaet: Prioritaet;
  gewerk: keyof typeof GEWERK_BEZEICHNUNG;
  kategorie: string;
}) {
  return (
    <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
        {kategorie}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={PRIO_VARIANTE[prioritaet]}>
          {PRIORITAET_BEZEICHNUNG[prioritaet]}
        </Badge>
        <Badge variant="outline">{GEWERK_BEZEICHNUNG[gewerk]}</Badge>
      </div>
    </div>
  );
}

/**
 * Kostenhinweis bei einer Kleinreparatur.
 *
 * Zeigt den Handwerkerpreis gegen die vertragliche Grenze – daraus wird für
 * den Mieter sofort greifbar, warum sich der Tipp lohnt.
 */
function KleinreparaturKarte({
  kostenEuro,
  grenzeEuro,
}: {
  kostenEuro: number;
  grenzeEuro: number;
}) {
  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
        Kleinreparatur
      </p>
      <dl className="mt-1.5 space-y-1 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Handwerkereinsatz</dt>
          <dd className="tabellenziffern font-medium text-slate-900">
            ca. {kostenEuro} €
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Ihr Anteil laut Mietvertrag</dt>
          <dd className="tabellenziffern font-medium text-slate-900">
            bis {grenzeEuro} €
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-slate-200 pt-1">
          <dt className="font-medium text-marke">Wenn Sie es selbst beheben</dt>
          <dd className="tabellenziffern font-semibold text-marke">0 €</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Die Selbsthilfe-Anleitung.
 *
 * Enthält bewusst einen Abbruchhinweis: Ein Tipp, der nicht sagt, wann man
 * die Finger davon lassen soll, ist gefährlich – und im Schadensfall ein
 * Problem für die Verwaltung.
 */
function AnleitungsKarte({ karte }: { karte: Extract<Karte, { art: "anleitung" }> }) {
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-marke-rand bg-white">
      <div className="flex items-center gap-2 border-b border-marke-rand bg-marke-sanft px-3 py-2">
        <WrenchIcon className="size-3.5 shrink-0 text-marke" aria-hidden />
        <span className="text-xs font-semibold text-marke">
          {karte.titel} · ca. {karte.dauerMinuten} Min.
        </span>
      </div>

      <div className="space-y-2.5 px-3 py-2.5">
        {karte.material.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-slate-500">Sie brauchen</p>
            <p className="text-xs text-slate-700">{karte.material.join(" · ")}</p>
          </div>
        )}

        <ol className="space-y-1.5">
          {karte.schritte.map((schritt, i) => (
            <li key={i} className="flex gap-2">
              <span className="tabellenziffern mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-marke-sanft text-[10px] font-semibold text-marke">
                {i + 1}
              </span>
              <span className="text-xs leading-snug text-slate-700">{schritt}</span>
            </li>
          ))}
        </ol>

        {karte.abbruchHinweis && (
          <p className="flex gap-1.5 rounded bg-prio-dringend-sanft px-2 py-1.5">
            <AlertTriangleIcon
              className="mt-px size-3 shrink-0 text-prio-dringend"
              aria-hidden
            />
            <span className="text-[11px] leading-snug text-prio-dringend">
              {karte.abbruchHinweis}
            </span>
          </p>
        )}

        <a
          href={karte.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium text-marke hover:underline"
        >
          <PlayIcon className="size-3.5" aria-hidden />
          Video-Anleitungen dazu ansehen
        </a>
      </div>
    </div>
  );
}

/**
 * Fortschrittsanzeige wie bei einer Paketverfolgung.
 *
 * Zeigt alle laufenden Meldungen des Mieters, nicht nur die letzte: Wer
 * Heizung und Wasserhahn gemeldet hat, will beides sehen. Jede Meldung trägt
 * denselben Titel wie im Dashboard, damit Mieter und Verwalter am Telefon
 * über dasselbe reden, und die Zeitstempel sagen, wann was passiert ist.
 */
function StatusKarte({ meldungen }: { meldungen: Meldung[] }) {
  return (
    <div className="mt-2 space-y-2">
      {meldungen.map((meldung) => (
        <MeldungsKarte key={meldung.id} meldung={meldung} />
      ))}
    </div>
  );
}

function MeldungsKarte({ meldung }: { meldung: Meldung }) {
  const aktuellerIndex = MIETER_FORTSCHRITT.findIndex((stufe) =>
    stufe.status.includes(meldung.status),
  );

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm leading-snug font-medium text-slate-900">
            {meldung.titel}
          </p>
          <p className="text-[11px] text-slate-500">
            {meldung.nummer !== null ? `Vorgang ${meldung.nummer}` : "Wird angelegt"}
            {meldung.betrieb ? ` · ${meldung.betrieb}` : ""}
          </p>
        </div>
        {meldung.prioritaet === "notfall" && <Badge variant="notfall">Notfall</Badge>}
      </div>

      {/* Die vier Stufen zeigen, wie weit es ist. Sie sind bewusst grob –
          ein Mieter will nicht die interne Prozesskette sehen. */}
      <ol className="flex items-center gap-1">
        {MIETER_FORTSCHRITT.map((stufe, index) => {
          const erledigt = index <= aktuellerIndex;
          const istAktuell = index === aktuellerIndex;
          return (
            <li key={stufe.beschriftung} className="flex flex-1 flex-col gap-1">
              <span
                className={cn(
                  "h-1 rounded-full",
                  erledigt ? "bg-marke" : "bg-slate-200",
                )}
              />
              <span
                className={cn(
                  "text-[10px] leading-tight",
                  istAktuell
                    ? "font-semibold text-slate-900"
                    : erledigt
                      ? "text-slate-600"
                      : "text-slate-400",
                )}
              >
                {stufe.beschriftung}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Darunter, was wann tatsächlich passiert ist. Das beantwortet die
          Frage, die ein Mieter wirklich hat: Tut sich da überhaupt etwas? */}
      {meldung.schritte.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2.5">
          {meldung.schritte.map((schritt, index) => (
            <li key={index} className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-start gap-1.5">
                <CheckIcon className="mt-0.5 size-3 shrink-0 text-marke" aria-hidden />
                <span className="text-[11px] leading-snug text-slate-600">
                  {schritt.was}
                </span>
              </span>
              <span className="tabellenziffern shrink-0 text-[11px] whitespace-nowrap text-slate-400">
                {zeitstempel(schritt.zeit)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Kurzer Zeitstempel: heute nur die Uhrzeit, sonst mit Datum. */
function zeitstempel(iso: string): string {
  const zeit = new Date(iso);
  const heute = new Date().toDateString() === zeit.toDateString();
  return new Intl.DateTimeFormat("de-DE", {
    ...(heute ? {} : { day: "2-digit", month: "2-digit" }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(zeit);
}
