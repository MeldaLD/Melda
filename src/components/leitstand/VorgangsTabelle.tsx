"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchIcon } from "lucide-react";

import {
  PrioBadge,
  SlaPunkt,
  StatusBadge,
  LeerHinweis,
} from "@/components/gemeinsam/Anzeigen";
import { alterKurz, nachDringlichkeit, slaZustand } from "@/lib/dashboard/kennzahlen";
import { alsDatumZeit } from "@/lib/dashboard/format";
import {
  GEWERK_BEZEICHNUNG,
  PRIORITAET_BEZEICHNUNG,
  STATUS_BEZEICHNUNG,
  type Prioritaet,
  type Vorgang,
  type VorgangStatus,
} from "@/lib/daten/typen";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type VorgangsZeile = {
  vorgang: Vorgang;
  objektName: string;
  objektId: string;
  einheit: string;
  mieter: string;
  mitarbeiter: string;
  mitarbeiterId: string;
  handwerker: string;
};

export type Filtervorgabe = {
  prioritaet?: string;
  status?: string;
  objekt?: string;
  sla?: string;
};

export function VorgangsTabelle({
  zeilen,
  basis,
  objekte,
  mitarbeitende,
  vorgabe,
}: {
  zeilen: VorgangsZeile[];
  basis: string;
  objekte: { id: string; name: string }[];
  mitarbeitende: { id: string; name: string }[];
  vorgabe: Filtervorgabe;
}) {
  const [suche, setSuche] = useState("");
  const [prioritaet, setPrioritaet] = useState(vorgabe.prioritaet ?? "alle");
  const [status, setStatus] = useState(vorgabe.status ?? "offen");
  const [objekt, setObjekt] = useState(vorgabe.objekt ?? "alle");
  const [mitarbeiter, setMitarbeiter] = useState("alle");
  const [sla, setSla] = useState(vorgabe.sla ?? "alle");
  const [sortierung, setSortierung] = useState("dringlichkeit");

  const gefiltert = useMemo(() => {
    const suchtext = suche.trim().toLowerCase();

    return zeilen
      .filter((z) => {
        if (prioritaet !== "alle" && z.vorgang.prioritaet !== prioritaet) return false;

        if (status === "offen") {
          if (z.vorgang.status === "erledigt" || z.vorgang.status === "storniert") {
            return false;
          }
        } else if (status !== "alle" && z.vorgang.status !== status) {
          return false;
        }

        if (objekt !== "alle" && z.objektId !== objekt) return false;
        if (mitarbeiter !== "alle" && z.mitarbeiterId !== mitarbeiter) return false;
        if (sla !== "alle" && slaZustand(z.vorgang) !== sla) return false;

        if (suchtext) {
          const heuhaufen = [
            z.vorgang.nummer,
            z.vorgang.titel,
            z.objektName,
            z.einheit,
            z.mieter,
            z.handwerker,
          ]
            .join(" ")
            .toLowerCase();
          if (!heuhaufen.includes(suchtext)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortierung === "neueste") {
          return b.vorgang.erstellt_am.localeCompare(a.vorgang.erstellt_am);
        }
        if (sortierung === "aelteste") {
          return a.vorgang.erstellt_am.localeCompare(b.vorgang.erstellt_am);
        }
        return nachDringlichkeit(a.vorgang, b.vorgang);
      });
  }, [zeilen, suche, prioritaet, status, objekt, mitarbeiter, sla, sortierung]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Suchen nach Objekt, Mieter, Vorgang…"
            className="pl-8"
            aria-label="Vorgänge durchsuchen"
          />
        </div>

        <Auswahl wert={status} setzen={setStatus} bezeichnung="Status">
          <option value="offen">Nur offene</option>
          <option value="alle">Alle</option>
          {(Object.keys(STATUS_BEZEICHNUNG) as VorgangStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_BEZEICHNUNG[s]}
            </option>
          ))}
        </Auswahl>

        <Auswahl wert={prioritaet} setzen={setPrioritaet} bezeichnung="Priorität">
          <option value="alle">Alle Prioritäten</option>
          {(Object.keys(PRIORITAET_BEZEICHNUNG) as Prioritaet[]).map((p) => (
            <option key={p} value={p}>
              {PRIORITAET_BEZEICHNUNG[p]}
            </option>
          ))}
        </Auswahl>

        <Auswahl wert={objekt} setzen={setObjekt} bezeichnung="Objekt">
          <option value="alle">Alle Objekte</option>
          {objekte.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Auswahl>

        <Auswahl wert={mitarbeiter} setzen={setMitarbeiter} bezeichnung="Mitarbeiter">
          <option value="alle">Alle Mitarbeitenden</option>
          {mitarbeitende.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Auswahl>

        <Auswahl wert={sla} setzen={setSla} bezeichnung="Frist">
          <option value="alle">Jede Frist</option>
          <option value="rot">Überschritten</option>
          <option value="gelb">Läuft bald ab</option>
          <option value="gruen">Im Rahmen</option>
        </Auswahl>

        <Auswahl wert={sortierung} setzen={setSortierung} bezeichnung="Sortierung">
          <option value="dringlichkeit">Nach Dringlichkeit</option>
          <option value="neueste">Neueste zuerst</option>
          <option value="aelteste">Älteste zuerst</option>
        </Auswahl>
      </div>

      <p className="text-xs text-muted-foreground">
        {gefiltert.length} von {zeilen.length} Vorgängen
      </p>

      {gefiltert.length === 0 ? (
        <LeerHinweis text="Kein Vorgang passt zu diesen Filtern." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full min-w-[54rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <Kopfzelle className="w-8" />
                <Kopfzelle>Nr.</Kopfzelle>
                <Kopfzelle>Vorgang</Kopfzelle>
                <Kopfzelle>Objekt / Einheit</Kopfzelle>
                <Kopfzelle>Gewerk</Kopfzelle>
                <Kopfzelle>Priorität</Kopfzelle>
                <Kopfzelle>Status</Kopfzelle>
                <Kopfzelle>Zuständig</Kopfzelle>
                <Kopfzelle>Eingang</Kopfzelle>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {gefiltert.map((z) => (
                <tr
                  key={z.vorgang.id}
                  className={cn(
                    "transition-colors hover:bg-slate-50",
                    slaZustand(z.vorgang) === "rot" && "bg-prio-notfall-sanft",
                  )}
                >
                  <td className="py-2.5 pl-3">
                    <SlaPunkt vorgang={z.vorgang} />
                  </td>
                  <td className="tabellenziffern py-2.5 pr-3 text-muted-foreground">
                    {z.vorgang.nummer}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Link
                      href={`${basis}/vorgaenge/${z.vorgang.id}`}
                      className="font-medium hover:text-marke hover:underline"
                    >
                      {z.vorgang.titel}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                    {z.objektName}
                    <br />
                    {z.einheit} · {z.mieter}
                  </td>
                  <td className="py-2.5 pr-3 text-xs">
                    {GEWERK_BEZEICHNUNG[z.vorgang.gewerk]}
                    {z.handwerker && (
                      <span className="block text-muted-foreground">
                        {z.handwerker}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <PrioBadge prioritaet={z.vorgang.prioritaet} />
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusBadge status={z.vorgang.status} />
                  </td>
                  <td className="py-2.5 pr-3 text-xs">{z.mitarbeiter}</td>
                  <td className="tabellenziffern py-2.5 pr-3 text-xs whitespace-nowrap text-muted-foreground">
                    {alsDatumZeit(z.vorgang.erstellt_am)}
                    <span className="block">
                      vor {alterKurz(z.vorgang.erstellt_am)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kopfzelle({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={cn("py-2 pr-3 pl-0 font-medium first:pl-3", className)}>
      {children}
    </th>
  );
}

function Auswahl({
  wert,
  setzen,
  bezeichnung,
  children,
}: {
  wert: string;
  setzen: (w: string) => void;
  bezeichnung: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={wert}
      onChange={(e) => setzen(e.target.value)}
      aria-label={bezeichnung}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
    </select>
  );
}
