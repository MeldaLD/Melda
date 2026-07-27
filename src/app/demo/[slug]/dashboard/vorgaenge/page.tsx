import Link from "next/link";
import { notFound } from "next/navigation";

import {
  LeerHinweis,
  PrioBadge,
  Seitenkopf,
  StatusBadge,
} from "@/components/gemeinsam/Anzeigen";
import { Datenumschalter } from "@/components/gemeinsam/Datenumschalter";
import { alsDatum } from "@/lib/dashboard/format";
import { alterKurz, istOffen, nachDringlichkeit } from "@/lib/dashboard/kennzahlen";
import { bestandLaden } from "@/lib/daten/quelle";

/**
 * Alle Vorgänge – zum Nachlesen, nicht zum Bearbeiten.
 *
 * Das ist die Auskunftspflicht aus § 666 BGB in Oberflächenform: Der
 * Verwalter muss jederzeit sehen können, was läuft, ohne uns zu fragen.
 * Deshalb vollständig und deshalb ohne Knöpfe – gearbeitet wird im
 * Leitstand.
 *
 * Bewusst keine Filterleiste mit fünf Auswahlfeldern: Wer hier landet, sucht
 * meistens einen bestimmten Vorgang, weil ein Eigentümer oder Mieter angerufen
 * hat. Dafür reicht eine gute Sortierung.
 */
export default async function VorgangsListe({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ergebnis = await bestandLaden(slug);
  if (!ergebnis) notFound();

  const { bestand, ansicht } = ergebnis;
  const basis = `/demo/${slug}/dashboard`;

  const offene = bestand.vorgaenge.filter(istOffen).sort(nachDringlichkeit);
  const erledigte = bestand.vorgaenge
    .filter((v) => !istOffen(v))
    .sort((a, b) => (b.erledigt_am ?? "").localeCompare(a.erledigt_am ?? ""));

  const ort = (einheitId: string | null) => {
    const einheit = bestand.einheiten.find((e) => e.id === einheitId);
    const objekt = bestand.objekte.find((o) => o.id === einheit?.objekt_id);
    return {
      objekt: objekt?.name ?? "–",
      lage: einheit?.bezeichnung ?? "",
      mieter: einheit?.mieter_name ?? "",
    };
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Seitenkopf
        titel="Vorgänge"
        beschreibung="Alles nachlesbar, jederzeit. Bearbeitet wird im Hintergrund."
      />
      <Datenumschalter slug={slug} ansicht={ansicht} />

      <Abschnitt titel="Läuft gerade" anzahl={offene.length}>
        {offene.map((v, i) => {
          const o = ort(v.einheit_id);
          return (
            <Zeile
              key={v.id}
              // Die geführte Tour zeigt auf die oberste Zeile. Blendet die
              // Demo gerade nur die eigenen Vorgänge ein, ist genau das die
              // Meldung, die der Betrachter eben geschrieben hat.
              markieren={i === 0}
              href={`${basis}/vorgaenge/${v.id}`}
              nummer={v.nummer}
              titel={v.titel}
              ort={`${o.objekt} · ${o.lage}${o.mieter ? ` · ${o.mieter}` : ""}`}
              rechts={`seit ${alterKurz(v.erstellt_am)}`}
            >
              <PrioBadge prioritaet={v.prioritaet} />
              <StatusBadge status={v.status} />
            </Zeile>
          );
        })}
      </Abschnitt>

      <Abschnitt titel="Abgeschlossen" anzahl={erledigte.length}>
        {erledigte.slice(0, 25).map((v) => {
          const o = ort(v.einheit_id);
          return (
            <Zeile
              key={v.id}
              href={`${basis}/vorgaenge/${v.id}`}
              nummer={v.nummer}
              titel={v.titel}
              ort={`${o.objekt} · ${o.lage}`}
              rechts={v.erledigt_am ? alsDatum(v.erledigt_am) : "–"}
            >
              <StatusBadge status={v.status} />
            </Zeile>
          );
        })}
      </Abschnitt>
    </div>
  );
}

function Abschnitt({
  titel,
  anzahl,
  children,
}: {
  titel: string;
  anzahl: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">
        {titel}{" "}
        <span className="tabellenziffern font-normal text-muted-foreground">
          ({anzahl})
        </span>
      </h2>
      {anzahl === 0 ? (
        <LeerHinweis text="Hier ist nichts." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
          {children}
        </ul>
      )}
    </section>
  );
}

function Zeile({
  href,
  nummer,
  titel,
  ort,
  rechts,
  markieren,
  children,
}: {
  href: string;
  nummer: number;
  titel: string;
  ort: string;
  rechts: string;
  /** Ziel der geführten Tour. */
  markieren?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        data-tour={markieren ? "vorgang-zeile" : undefined}
        href={href}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-slate-50"
      >
        <span className="tabellenziffern w-12 shrink-0 text-xs text-muted-foreground">
          {nummer}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{titel}</span>
          <span className="block truncate text-xs text-muted-foreground">{ort}</span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">{children}</span>
        <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
          {rechts}
        </span>
      </Link>
    </li>
  );
}
