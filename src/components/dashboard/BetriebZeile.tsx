"use client";

import { useState, useTransition } from "react";
import { AlertCircleIcon, CheckIcon, Loader2Icon, StarIcon } from "lucide-react";

import { betriebPflegen } from "@/app/demo/[slug]/dashboard/aktionen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GEWERK_BEZEICHNUNG, type Handwerker, type Kanal } from "@/lib/daten/typen";

const KANAL_BEZEICHNUNG: Record<Kanal, string> = {
  whatsapp: "WhatsApp",
  email: "E-Mail",
  telefon: "Telefon",
};

/**
 * Ein Handwerksbetrieb in der Liste, aufklappbar zum Pflegen.
 *
 * Der wichtigste Schalter steht hier: ob der Assistent Termine direkt mit
 * diesem Betrieb abstimmen darf. Das ist ausdrücklich eine Entscheidung des
 * Betriebs, die die Verwaltung nur festhält – deshalb steht es auch so am
 * Schalter. Ein Betrieb, dem ungefragt Nachrichten eines fremden Systems
 * zugehen, ist als Partner verloren.
 */
export function BetriebZeile({
  slug,
  betrieb,
  laufend,
}: {
  slug: string;
  betrieb: Handwerker;
  laufend: number;
}) {
  const [offen, setOffen] = useState(false);

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="py-2.5 pr-3 pl-3">
          <span className="font-medium">{betrieb.firma}</span>
          {betrieb.ist_standard && (
            <Badge variant="marke" className="ml-2">
              Standard
            </Badge>
          )}
          {betrieb.ansprechpartner && (
            <span className="block text-xs text-muted-foreground">
              {betrieb.ansprechpartner}
            </span>
          )}
        </td>
        <td className="py-2.5 pr-3">{GEWERK_BEZEICHNUNG[betrieb.gewerk]}</td>
        <td className="tabellenziffern py-2.5 pr-3">
          ⌀ {betrieb.reaktionszeit_h} Std.
        </td>
        <td className="py-2.5 pr-3">
          <span className="flex items-center gap-1">
            <StarIcon className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
            <span className="tabellenziffern">{betrieb.bewertung.toFixed(1)}</span>
          </span>
        </td>
        <td className="tabellenziffern py-2.5 pr-3">{laufend}</td>
        <td className="py-2.5 pr-3">
          {betrieb.abstimmung_erlaubt ? (
            <Badge variant="marke">
              <CheckIcon className="size-3" /> Wir stimmen ab
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">Sie rufen an</span>
          )}
        </td>
        <td className="py-2.5 pr-3">
          <Button size="sm" variant="ghost" onClick={() => setOffen((o) => !o)}>
            {offen ? "Schließen" : "Bearbeiten"}
          </Button>
        </td>
      </tr>

      {offen && (
        <tr>
          <td colSpan={7} className="bg-slate-50 px-3 pb-4">
            <Formular slug={slug} betrieb={betrieb} onFertig={() => setOffen(false)} />
          </td>
        </tr>
      )}
    </>
  );
}

function Formular({
  slug,
  betrieb,
  onFertig,
}: {
  slug: string;
  betrieb: Handwerker;
  onFertig: () => void;
}) {
  const [ansprechpartner, setAnsprechpartner] = useState(betrieb.ansprechpartner ?? "");
  const [email, setEmail] = useState(betrieb.email ?? "");
  const [telefon, setTelefon] = useState(betrieb.telefon ?? "");
  const [kanal, setKanal] = useState<Kanal>(betrieb.kontakt_kanal);
  const [zeiten, setZeiten] = useState(betrieb.arbeitszeiten ?? "");
  const [erlaubt, setErlaubt] = useState(betrieb.abstimmung_erlaubt);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();

  const speichern = () =>
    starten(async () => {
      const ergebnis = await betriebPflegen({
        slug,
        handwerkerId: betrieb.id,
        ansprechpartner,
        email,
        telefon,
        kontaktKanal: kanal,
        arbeitszeiten: zeiten,
        abstimmungErlaubt: erlaubt,
      });

      if (ergebnis.fehlgeschlagen) {
        setFehler(ergebnis.hinweis ?? "Konnte nicht gespeichert werden.");
        return;
      }
      setFehler(null);
      if (ergebnis.gespeichert) {
        onFertig();
      } else {
        setMeldung(ergebnis.hinweis ?? "Nicht gespeichert.");
      }
    });

  return (
    <div className="space-y-3 pt-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Feld
          beschriftung="Ansprechpartner"
          wert={ansprechpartner}
          onAendern={setAnsprechpartner}
          platzhalter="Frau Krause"
        />
        <Feld
          beschriftung="E-Mail"
          wert={email}
          onAendern={setEmail}
          platzhalter="buero@betrieb.de"
          typ="email"
        />
        <Feld
          beschriftung="Telefon"
          wert={telefon}
          onAendern={setTelefon}
          platzhalter="0561 123456"
          typ="tel"
        />
        <label className="block space-y-1 text-xs">
          <span className="font-medium text-slate-700">Bevorzugter Weg</span>
          <select
            value={kanal}
            onChange={(e) => setKanal(e.target.value as Kanal)}
            aria-label={`Bevorzugter Weg für ${betrieb.firma}`}
            className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
          >
            {(Object.keys(KANAL_BEZEICHNUNG) as Kanal[]).map((k) => (
              <option key={k} value={k}>
                {KANAL_BEZEICHNUNG[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Feld
        beschriftung="Arbeitszeiten"
        wert={zeiten}
        onAendern={setZeiten}
        platzhalter="Mo–Do 7–16 Uhr, Fr 7–13 Uhr"
      />

      <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-white p-3 text-xs">
        <input
          type="checkbox"
          checked={erlaubt}
          onChange={(e) => setErlaubt(e.target.checked)}
          aria-label={`Terminabstimmung mit ${betrieb.firma} übernehmen`}
          className="mt-0.5 size-3.5 accent-[var(--marke)]"
        />
        <span>
          <span className="block font-medium text-slate-800">
            {betrieb.firma} hat zugestimmt, dass wir Termine direkt abstimmen
          </span>
          <span className="mt-0.5 block text-muted-foreground">
            Der Assistent fragt den Betrieb dann selbst nach einem Zeitfenster, gleicht
            es mit dem Wunsch des Mieters ab und legt Ihnen nur das Ergebnis zur
            Bestätigung vor. Ohne Zustimmung des Betriebs geht keine Nachricht raus.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <Button size="sm" variant="marke" onClick={speichern} disabled={laeuft}>
          {laeuft && <Loader2Icon className="animate-spin" />}
          Speichern
        </Button>
        <Button size="sm" variant="ghost" onClick={onFertig} disabled={laeuft}>
          Abbrechen
        </Button>
        {meldung && <span className="text-xs text-muted-foreground">{meldung}</span>}
        {fehler && (
          <span className="flex items-start gap-1.5 text-xs text-prio-notfall">
            <AlertCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
            {fehler}
          </span>
        )}
      </div>
    </div>
  );
}

function Feld({
  beschriftung,
  wert,
  onAendern,
  platzhalter,
  typ = "text",
}: {
  beschriftung: string;
  wert: string;
  onAendern: (wert: string) => void;
  platzhalter?: string;
  typ?: string;
}) {
  return (
    <label className="block space-y-1 text-xs">
      <span className="font-medium text-slate-700">{beschriftung}</span>
      <input
        type={typ}
        value={wert}
        onChange={(e) => onAendern(e.target.value)}
        placeholder={platzhalter}
        className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
      />
    </label>
  );
}
