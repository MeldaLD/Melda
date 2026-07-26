"use client";

import { useState, useTransition } from "react";
import { AlertCircleIcon, CheckIcon, Loader2Icon } from "lucide-react";

import { rueckrufZuordnen } from "@/app/demo/[slug]/dashboard/aktionen";
import { Button } from "@/components/ui/button";
import { FACHBEREICH_BEZEICHNUNG, type Fachbereich } from "@/lib/daten/typen";

export type ZuordnungsPerson = {
  id: string;
  name: string;
  rolle: string;
  bereich: Fachbereich;
};

/**
 * Weist einen Rückruf einer Person zu.
 *
 * Der Mieter hat im Chat nur das Thema genannt. Erst hier entsteht daraus ein
 * konkreter Rückruf: Wer, wann. Genau die Angaben, die wir beim Kunden nicht
 * kennen und deshalb bewusst nicht im Chat abgefragt haben.
 *
 * Die Auswahl steht schon auf der Person, deren Fachbereich zum Thema passt –
 * ein Klick reicht, wenn der Vorschlag stimmt.
 */
export function RueckrufZuordnen({
  slug,
  terminId,
  personen,
  vorschlag,
  zeitwunsch,
}: {
  slug: string;
  terminId: string;
  personen: ZuordnungsPerson[];
  vorschlag: Fachbereich | null;
  /** vormittag | nachmittag | egal */
  zeitwunsch: string | null;
}) {
  const [offen, setOffen] = useState(false);
  const [erledigt, setErledigt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();

  const empfohlen =
    personen.find((p) => vorschlag && p.bereich === vorschlag) ?? personen[0];
  const [personId, setPersonId] = useState(empfohlen?.id ?? "");
  const [zeitpunkt, setZeitpunkt] = useState(() => vorschlagszeit(zeitwunsch));

  if (erledigt) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-marke">
        <CheckIcon className="size-3.5" aria-hidden />
        {erledigt}
      </span>
    );
  }

  if (!offen) {
    return (
      <Button size="sm" variant="marke" onClick={() => setOffen(true)}>
        Zuordnen
      </Button>
    );
  }

  const speichern = () => {
    setFehler(null);
    starten(async () => {
      const person = personen.find((p) => p.id === personId);
      const ergebnis = await rueckrufZuordnen({
        slug,
        terminId,
        mitarbeiterId: personId,
        // Als lokale Zeit eingegeben, als Zeitstempel übergeben – sonst
        // landet die Uhrzeit in der Zeitzone des Servers.
        beginn: new Date(zeitpunkt).toISOString(),
      });

      if (ergebnis.fehlgeschlagen) {
        setFehler(ergebnis.hinweis ?? "Konnte nicht gespeichert werden.");
        return;
      }
      setErledigt(
        ergebnis.gespeichert
          ? `${person?.name ?? "Zugeordnet"} übernimmt`
          : "nur in der Anzeige",
      );
    });
  };

  return (
    <div className="w-full space-y-2 rounded-md border border-marke-rand bg-marke-sanft/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`person-${terminId}`}>
          Zuständige Person
        </label>
        <select
          id={`person-${terminId}`}
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className="h-9 min-w-48 flex-1 rounded-md border border-input bg-white px-2 text-sm focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
        >
          {personen.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {FACHBEREICH_BEZEICHNUNG[p.bereich]}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor={`zeit-${terminId}`}>
          Zeitpunkt des Rückrufs
        </label>
        <input
          id={`zeit-${terminId}`}
          type="datetime-local"
          value={zeitpunkt}
          onChange={(e) => setZeitpunkt(e.target.value)}
          className="tabellenziffern h-9 rounded-md border border-input bg-white px-2 text-sm focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="marke" onClick={speichern} disabled={laeuft}>
          {laeuft && <Loader2Icon className="animate-spin" />}
          Rückruf eintragen
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOffen(false)}
          disabled={laeuft}
        >
          Abbrechen
        </Button>
      </div>

      {fehler && (
        <p className="flex items-start gap-1.5 text-xs text-prio-notfall">
          <AlertCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          {fehler}
        </p>
      )}
    </div>
  );
}

/**
 * Vorbelegung aus dem Wunsch des Mieters: nächster Werktag, passende
 * Tageshälfte. Im Browser gerechnet, damit die Uhrzeit die des Verwalters ist.
 */
function vorschlagszeit(zeitwunsch: string | null): string {
  const tag = new Date();
  do {
    tag.setDate(tag.getDate() + 1);
  } while (tag.getDay() === 0 || tag.getDay() === 6);

  tag.setHours(zeitwunsch === "nachmittag" ? 14 : 10, 0, 0, 0);

  const zwei = (n: number) => String(n).padStart(2, "0");
  return (
    `${tag.getFullYear()}-${zwei(tag.getMonth() + 1)}-${zwei(tag.getDate())}` +
    `T${zwei(tag.getHours())}:${zwei(tag.getMinutes())}`
  );
}
