import Link from "next/link";
import { notFound } from "next/navigation";
import { MailIcon, MessageCircleIcon, PhoneIcon } from "lucide-react";

import { LeerHinweis, Seitenkopf } from "@/components/dashboard/Anzeigen";
import { Badge } from "@/components/ui/badge";
import { alsDatumZeit } from "@/lib/dashboard/format";
import { bestandLaden } from "@/lib/daten/quelle";
import type { Kanal } from "@/lib/daten/typen";

const KANAL_SYMBOL = {
  whatsapp: MessageCircleIcon,
  email: MailIcon,
  telefon: PhoneIcon,
};

const KANAL_NAME: Record<Kanal, string> = {
  whatsapp: "WhatsApp",
  email: "E-Mail",
  telefon: "Telefonnotiz",
};

/**
 * Alle Kanäle in einer Inbox. Genau das ist der Kern dessen, was casavi und
 * iDWELL verkaufen – es muss sichtbar sein, dass wir es auch können.
 */
export default async function Postfach({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ergebnis = await bestandLaden(slug);
  if (!ergebnis) notFound();

  const { bestand } = ergebnis;

  // Je Vorgang nur die letzte Nachricht, dazu alle Einzelnachrichten ohne
  // Vorgang – so liest sich das Postfach wie eine Konversationsliste.
  const letzteJeVorgang = new Map<string, (typeof bestand.nachrichten)[number]>();
  const ohneVorgang: typeof bestand.nachrichten = [];

  for (const nachricht of bestand.nachrichten) {
    if (!nachricht.vorgang_id) {
      ohneVorgang.push(nachricht);
      continue;
    }
    const bisher = letzteJeVorgang.get(nachricht.vorgang_id);
    if (!bisher || nachricht.gesendet_am > bisher.gesendet_am) {
      letzteJeVorgang.set(nachricht.vorgang_id, nachricht);
    }
  }

  const eintraege = [...letzteJeVorgang.values(), ...ohneVorgang].sort((a, b) =>
    b.gesendet_am.localeCompare(a.gesendet_am),
  );

  const basis = `/demo/${slug}/dashboard`;

  return (
    <div className="p-4 sm:p-6">
      <Seitenkopf
        titel="Postfach"
        beschreibung="WhatsApp, E-Mail und Telefonnotizen in einer Ansicht."
      />

      {eintraege.length === 0 ? (
        <LeerHinweis text="Das Postfach ist leer." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
          {eintraege.slice(0, 30).map((nachricht) => {
            const Symbol = KANAL_SYMBOL[nachricht.kanal];
            const einheit = bestand.einheiten.find(
              (e) => e.id === nachricht.einheit_id,
            );
            const objekt = bestand.objekte.find((o) => o.id === einheit?.objekt_id);
            const vorgang = bestand.vorgaenge.find(
              (v) => v.id === nachricht.vorgang_id,
            );
            const ungelesen = !nachricht.gelesen_am;

            const inhalt = (
              <div className="flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                  <Symbol className="size-4 text-slate-500" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {einheit?.mieter_name ?? "Unbekannt"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {objekt?.name} · {einheit?.bezeichnung}
                    </span>
                    {ungelesen && <Badge variant="marke">Neu</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-600">
                    {nachricht.richtung === "mieter" ? "" : "Sie: "}
                    {nachricht.text}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {KANAL_NAME[nachricht.kanal]} ·{" "}
                    {alsDatumZeit(nachricht.gesendet_am)}
                    {vorgang ? ` · Vorgang ${vorgang.nummer}` : " · Kein Vorgang"}
                  </p>
                </div>
              </div>
            );

            return (
              <li key={nachricht.id}>
                {vorgang ? (
                  <Link href={`${basis}/vorgaenge/${vorgang.id}`} className="block">
                    {inhalt}
                  </Link>
                ) : (
                  inhalt
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
