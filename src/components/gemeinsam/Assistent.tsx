"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircleIcon,
  CheckIcon,
  Loader2Icon,
  SendIcon,
  SparklesIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";

import {
  mieterAnlegen,
  notizEintragen,
  type Ergebnis,
} from "@/app/demo/[slug]/leitstand/aktionen";
import {
  ASSISTENT_BEISPIELE,
  assistentAntwort,
  type AssistentKarte,
} from "@/lib/assistent/maschine";
import { PrioBadge, SlaPunkt } from "@/components/gemeinsam/Anzeigen";
import { alterKurz } from "@/lib/dashboard/kennzahlen";
import { STATUS_BEZEICHNUNG, type Mandantenbestand } from "@/lib/daten/typen";
import { tourMelden } from "@/lib/tour/ereignisse";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Eintrag = {
  id: number;
  von: "verwalter" | "assistent";
  text: string;
  karte?: AssistentKarte;
  /** Bereits bestätigte Aktionen zeigen statt der Knöpfe eine Quittung. */
  erledigt?: string;
  /** Hat die Speicherung nicht geklappt, steht der Grund an der Karte. */
  fehler?: string;
};

/**
 * Der Assistent im Dashboard.
 *
 * Zweck für den Verwalter: Routinearbeit im Klartext erledigen, statt sich
 * durch Formulare zu klicken. Zielgruppe ist jemand, der Excel kann und
 * keine Lust auf Masken hat.
 *
 * Schreibende Aktionen laufen über Server Actions und legen echte Zeilen an –
 * ein angelegter Mieter steht danach in den Objekten, eine Notiz in der
 * Historie des Vorgangs. Der Assistent führt sie nie allein aus: Zuerst zeigt
 * er, was er verstanden hat, dann bestätigt der Verwalter.
 *
 * Er steht in beiden Sichten: im Leitstand und in der Sicht der
 * Hausverwaltung. Deshalb kommt die Basisadresse von außen – ein Vorgang, den
 * er verlinkt, muss in der Sicht aufgehen, in der man ihn gerade benutzt.
 * Führte er aus der Verwaltersicht in den Leitstand, stünde der Kunde
 * plötzlich in unserem Arbeitsplatz.
 */
export function Assistent({
  bestand,
  basis,
}: {
  bestand: Mandantenbestand;
  /** Wohin Vorgangslinks führen, z. B. /demo/muster/dashboard */
  basis: string;
}) {
  const [offen, setOffen] = useState(false);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [entwurf, setEntwurf] = useState("");
  const ende = useRef<HTMLDivElement>(null);
  const zaehler = useRef(0);
  const slug = bestand.mandant.slug;
  const router = useRouter();

  useEffect(() => {
    if (offen) ende.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [eintraege.length, offen]);

  const senden = (text: string) => {
    const inhalt = text.trim();
    if (!inhalt) return;
    setEntwurf("");

    const antwort = assistentAntwort(inhalt, bestand);
    setEintraege((alt) => [
      ...alt,
      { id: ++zaehler.current, von: "verwalter", text: inhalt },
      {
        id: ++zaehler.current,
        von: "assistent",
        text: antwort.text,
        karte: antwort.karte,
      },
    ]);
  };

  /**
   * Führt aus, was auf der Karte steht.
   *
   * Das Ergebnis wird ehrlich gezeigt: gespeichert, nur angezeigt (Vorschau
   * ohne Datenbank) oder gescheitert. Eine Quittung, hinter der nichts steht,
   * wäre in einem Vertriebsgespräch das Letzte, was wir gebrauchen können.
   */
  const ausfuehren = async (
    id: number,
    aktion: () => Promise<Ergebnis>,
    quittung: string,
  ) => {
    const ergebnis = await aktion();

    setEintraege((alt) =>
      alt.map((e) =>
        e.id !== id
          ? e
          : ergebnis.fehlgeschlagen
            ? { ...e, fehler: ergebnis.hinweis ?? "Hat nicht geklappt." }
            : {
                ...e,
                fehler: undefined,
                erledigt: ergebnis.gespeichert
                  ? quittung
                  : `${quittung} (in dieser Vorschau nicht gespeichert)`,
              },
      ),
    );

    // Die neue Zeile soll auch in den Listen dahinter auftauchen.
    if (ergebnis.gespeichert) router.refresh();
  };

  if (!offen) {
    return (
      <button
        type="button"
        data-tour="assistent-knopf"
        onClick={() => {
          setOffen(true);
          // Station der ausführlichen Tour. Ohne laufende Tour wirkungslos.
          tourMelden("verwalter:assistent-geoeffnet");
        }}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-marke px-4 py-3 text-sm font-medium text-marke-kontrast shadow-lg transition-transform hover:scale-[1.02]"
      >
        <SparklesIcon className="size-4" aria-hidden />
        Assistent
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex h-[70svh] flex-col border-t border-border bg-white shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:h-[32rem] sm:w-[26rem] sm:rounded-lg sm:border">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <SparklesIcon className="size-4 text-marke" aria-hidden />
        <div className="flex-1">
          <p className="text-sm leading-tight font-semibold">Assistent</p>
          <p className="text-[11px] text-muted-foreground">
            Schreiben Sie einfach, was Sie brauchen
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOffen(false)}
          aria-label="Assistent schließen"
          className="rounded p-1 text-slate-400 hover:text-slate-700"
        >
          <XIcon className="size-4" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {eintraege.length === 0 && <Startpunkte onWaehlen={senden} />}

        {eintraege.map((e) => (
          <div
            key={e.id}
            className={cn(
              "flex",
              e.von === "verwalter" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[90%] space-y-2",
                e.von === "verwalter"
                  ? "rounded-lg rounded-br-sm bg-marke-sanft px-3 py-2"
                  : "",
              )}
            >
              {e.text && (
                <p className="text-sm whitespace-pre-line text-slate-800">{e.text}</p>
              )}
              {e.karte && (
                <Karte
                  karte={e.karte}
                  erledigt={e.erledigt}
                  fehler={e.fehler}
                  onAusfuehren={(aktion, quittung) =>
                    ausfuehren(e.id, aktion, quittung)
                  }
                  slug={slug}
                  basis={basis}
                />
              )}
            </div>
          </div>
        ))}
        <div ref={ende} />
      </div>

      <div className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={entwurf}
          onChange={(ev) => setEntwurf(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && !ev.shiftKey) {
              ev.preventDefault();
              senden(entwurf);
            }
          }}
          rows={1}
          placeholder="z. B. Neuer Mieter in der Germaniastraße 23, EG rechts…"
          className="max-h-24 min-h-9 flex-1 resize-none rounded-md border border-input px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
        />
        <Button
          type="button"
          size="icon"
          variant="marke"
          onClick={() => senden(entwurf)}
          disabled={!entwurf.trim()}
          aria-label="Senden"
        >
          <SendIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function Startpunkte({ onWaehlen }: { onWaehlen: (text: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">
        Ich lege Mieter an, beantworte Fragen zu laufenden Vorgängen und trage Notizen
        nach. Probieren Sie eines davon:
      </p>
      {ASSISTENT_BEISPIELE.map((beispiel) => (
        <button
          key={beispiel}
          type="button"
          onClick={() => onWaehlen(beispiel)}
          className="block w-full rounded-md border border-border px-3 py-2 text-left text-xs text-slate-600 transition-colors hover:border-marke-rand hover:text-marke"
        >
          {beispiel}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Karte({
  karte,
  erledigt,
  fehler,
  onAusfuehren,
  slug,
  basis,
}: {
  karte: AssistentKarte;
  erledigt?: string;
  fehler?: string;
  onAusfuehren: (aktion: () => Promise<Ergebnis>, quittung: string) => Promise<void>;
  slug: string;
  basis: string;
}) {
  const rahmen = "rounded-md border border-border bg-slate-50 p-3 space-y-2";

  switch (karte.art) {
    case "hilfe":
      return (
        <div className={rahmen}>
          <ul className="space-y-1.5 text-xs text-slate-600">
            <li>
              <strong className="font-medium text-slate-900">Mieter anlegen</strong> –
              Objekt, Lage, Name und Mobilnummer in einem Satz
            </li>
            <li>
              <strong className="font-medium text-slate-900">Vorgänge abfragen</strong>{" "}
              –
              {
                "\u201eWas ist offen?\u201c, \u201eZeig mir die Notf\u00e4lle\u201c, \u201eVorgang 1003\u201c"
              }
            </li>
            <li>
              <strong className="font-medium text-slate-900">Notiz nachtragen</strong> –
              {"\u201eVorgang 1003: Handwerker war da\u201c"}
            </li>
          </ul>
        </div>
      );

    case "neuerMieter": {
      const vollstaendig = karte.fehlt.length === 0;
      return (
        <div className={rahmen}>
          <div className="flex items-center gap-2">
            <UserPlusIcon className="size-4 text-marke" aria-hidden />
            <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Neuer Mieter
            </span>
          </div>
          <dl className="space-y-1 text-xs">
            <Zeile bezeichnung="Objekt" wert={karte.objekt?.name} />
            <Zeile bezeichnung="Wohnung" wert={karte.lage} />
            <Zeile bezeichnung="Name" wert={karte.name} />
            <Zeile bezeichnung="Mobilnummer" wert={karte.telefon} />
          </dl>

          {erledigt ? (
            <Quittung text={erledigt} />
          ) : vollstaendig ? (
            <>
              <p className="text-[11px] text-muted-foreground">
                Der Mieter erhält eine WhatsApp-Nachricht an diese Nummer und ist damit
                erreichbar. Es gibt keine Zugangsdaten und keine App.
              </p>
              <Ausfuehren
                beschriftung="Anlegen und begrüßen"
                fehler={fehler}
                onKlick={() =>
                  onAusfuehren(
                    () =>
                      mieterAnlegen({
                        slug,
                        objektId: karte.objekt!.id,
                        lage: karte.lage!,
                        name: karte.name!,
                        telefon: karte.telefon!,
                      }),
                    `${karte.name} wurde angelegt und per WhatsApp begrüßt.`,
                  )
                }
              />
            </>
          ) : (
            <p className="text-[11px] text-prio-dringend">
              Bitte ergänzen: {karte.fehlt.join(", ")}
            </p>
          )}
        </div>
      );
    }

    case "vorgang":
      return (
        <div className={rahmen}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {karte.vorgang.titel}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {karte.objekt?.name} · {karte.einheit?.bezeichnung} ·{" "}
                {karte.einheit?.mieter_name}
              </p>
            </div>
            <PrioBadge prioritaet={karte.vorgang.prioritaet} />
          </div>
          <dl className="space-y-1 text-xs">
            <Zeile
              bezeichnung="Status"
              wert={STATUS_BEZEICHNUNG[karte.vorgang.status]}
            />
            <Zeile bezeichnung="Alter" wert={alterKurz(karte.vorgang.erstellt_am)} />
          </dl>
          {karte.vorgang.ki_zusammenfassung && (
            <p className="text-xs leading-relaxed text-slate-600">
              {karte.vorgang.ki_zusammenfassung}
            </p>
          )}
          <Button asChild size="sm" variant="outline" className="w-full">
            <Link href={`${basis}/vorgaenge/${karte.vorgang.id}`}>Vorgang öffnen</Link>
          </Button>
        </div>
      );

    case "liste":
      return (
        <div className={rahmen}>
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {karte.ueberschrift}
          </p>
          <ul className="divide-y divide-border">
            {karte.vorgaenge.slice(0, 6).map((v) => (
              <li key={v.id}>
                <Link
                  href={`${basis}/vorgaenge/${v.id}`}
                  className="flex items-center gap-2 py-1.5 text-xs hover:text-marke"
                >
                  <SlaPunkt vorgang={v} />
                  <span className="tabellenziffern text-muted-foreground">
                    {v.nummer}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{v.titel}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {alterKurz(v.erstellt_am)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {karte.vorgaenge.length > 6 && (
            <p className="text-[11px] text-muted-foreground">
              … und {karte.vorgaenge.length - 6} weitere
            </p>
          )}
        </div>
      );

    case "notiz":
      return (
        <div className={rahmen}>
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Verlaufseintrag zu Vorgang {karte.vorgang.nummer}
          </p>
          <p className="text-sm text-slate-800">{karte.text}</p>
          {erledigt ? (
            <Quittung text={erledigt} />
          ) : (
            <Ausfuehren
              beschriftung="Eintragen"
              fehler={fehler}
              onKlick={() =>
                onAusfuehren(
                  () =>
                    notizEintragen({
                      slug,
                      vorgangId: karte.vorgang.id,
                      text: karte.text,
                    }),
                  `Notiz zu Vorgang ${karte.vorgang.nummer} gespeichert.`,
                )
              }
            />
          )}
        </div>
      );
  }
}

/** Bestätigungsknopf mit Laufanzeige und Fehlerausgabe. */
function Ausfuehren({
  beschriftung,
  fehler,
  onKlick,
}: {
  beschriftung: string;
  fehler?: string;
  onKlick: () => Promise<void>;
}) {
  const [laeuft, starten] = useTransition();

  return (
    <>
      <Button
        size="sm"
        variant="marke"
        className="w-full"
        disabled={laeuft}
        onClick={() => starten(async () => void (await onKlick()))}
      >
        {laeuft && <Loader2Icon className="animate-spin" />}
        {beschriftung}
      </Button>
      {fehler && (
        <p className="flex items-start gap-1.5 text-[11px] text-prio-notfall">
          <AlertCircleIcon className="mt-px size-3 shrink-0" aria-hidden />
          {fehler}
        </p>
      )}
    </>
  );
}

function Zeile({ bezeichnung, wert }: { bezeichnung: string; wert?: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{bezeichnung}</dt>
      <dd className={wert ? "text-slate-900" : "text-prio-dringend"}>
        {wert ?? "fehlt"}
      </dd>
    </div>
  );
}

function Quittung({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-1.5 rounded-md bg-marke-sanft px-2 py-1.5 text-xs text-marke">
      <CheckIcon className="size-3.5 shrink-0" aria-hidden />
      {text}
    </p>
  );
}
