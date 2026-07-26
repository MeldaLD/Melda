import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutDashboardIcon, MessageCircleIcon, WrenchIcon } from "lucide-react";

import { szenarien } from "@config/scenarios";
import { Card } from "@/components/ui/card";
import { mandantLaden } from "@/lib/daten/quelle";

/**
 * Einstiegsseite der personalisierten Demo.
 *
 * Das ist die Seite, auf der ein Interessent aus der E-Mail landet. Sie muss
 * in fünf Sekunden klarmachen, worum es geht, und zwei Wege anbieten:
 * die Sicht des Mieters und die des Verwalters.
 */
export default async function DemoStartseite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const mandant = await mandantLaden(slug);
  if (!mandant) notFound();

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
      <div className="space-y-3">
        {mandant.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mandant.logo_url}
            alt={mandant.firma}
            className="mb-4 h-10 object-contain"
          />
        ) : null}

        <p className="text-xs font-medium tracking-widest text-marke uppercase">
          Persönliche Demonstration
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          Mieterkommunikation über WhatsApp – für die {mandant.firma}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Ihre Mieter schreiben über WhatsApp, ohne App und ohne Anmeldung. Wir nehmen
          auf, fragen gezielt nach, beauftragen den Betrieb und stimmen den Termin ab.
          Sie behalten den Überblick und die Kontrolle – die Kleinarbeit haben wir.
        </p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Einstieg
          href={`/demo/${slug}/chat`}
          symbol={<MessageCircleIcon className="size-5" />}
          titel="Sicht des Mieters"
          beschreibung="Der Chat, wie ihn Ihre Mieter sehen. Am besten am Telefon ansehen."
          hervorgehoben
        />
        <Einstieg
          href={`/demo/${slug}/dashboard`}
          symbol={<LayoutDashboardIcon className="size-5" />}
          titel="Ihre Sicht"
          beschreibung="Was Aufmerksamkeit braucht, was gelaufen ist, und Ihre Grenzen."
        />
      </div>

      {/* Bewusst kleiner und darunter: Der Leitstand ist unsere Werkbank, nicht
          das, was der Kunde bedienen muss. Ihn zu zeigen schafft aber
          Vertrauen – man sieht, wo die Arbeit hinwandert. */}
      <Link
        href={`/demo/${slug}/leitstand`}
        className="mt-3 flex items-center gap-2.5 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-marke-rand hover:text-marke"
      >
        <WrenchIcon className="size-4 shrink-0" aria-hidden />
        <span>
          <strong className="font-medium">Unser Leitstand</strong> – was im Hintergrund
          passiert, damit Ihre Sicht so ruhig bleibt.
        </span>
      </Link>

      <div className="mt-10 space-y-4 border-t border-border pt-6">
        <h2 className="text-sm font-semibold">Worauf Sie achten sollten</h2>
        <ul className="space-y-2.5 text-sm text-muted-foreground">
          <li className="flex gap-2.5">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-marke" />
            <span>
              <strong className="font-medium text-foreground">
                Die Rückfrage nach dem zweiten Foto.
              </strong>{" "}
              Rund 30 Prozent aller Handwerkeraufträge brauchen eine zweite Anfahrt,
              weil bei der Aufnahme etwas gefehlt hat. Genau dort setzt der Assistent
              an.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-marke" />
            <span>
              <strong className="font-medium text-foreground">Keine App.</strong> Ihre
              Mieter installieren nichts und melden sich nirgends an. Genau daran
              scheitern Portallösungen in der Praxis.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-marke" />
            <span>
              <strong className="font-medium text-foreground">
                Nichts geht ohne Ihre Freigabe.
              </strong>{" "}
              Der Assistent bereitet vor, entscheiden tun Sie.
            </span>
          </li>
        </ul>

        <p className="pt-2 text-xs text-muted-foreground">
          Diese Demo enthält {szenarien.length} Beispielszenarien und ausschließlich
          erfundene Daten. Die Objekte tragen Straßennamen aus {mandant.stadt}.
        </p>
      </div>
    </main>
  );
}

function Einstieg({
  href,
  symbol,
  titel,
  beschreibung,
  hervorgehoben,
}: {
  href: string;
  symbol: React.ReactNode;
  titel: string;
  beschreibung: string;
  hervorgehoben?: boolean;
}) {
  return (
    <Link href={href} className="group block focus-visible:outline-none">
      <Card
        className={
          hervorgehoben
            ? "h-full border-marke-rand bg-marke-sanft p-5 transition-colors group-hover:border-marke group-focus-visible:ring-2 group-focus-visible:ring-ring"
            : "h-full p-5 transition-colors group-hover:border-marke-rand group-focus-visible:ring-2 group-focus-visible:ring-ring"
        }
      >
        <span className="flex size-9 items-center justify-center rounded-md bg-marke text-marke-kontrast">
          {symbol}
        </span>
        <p className="mt-3 font-semibold">{titel}</p>
        <p className="mt-1 text-sm text-muted-foreground">{beschreibung}</p>
      </Card>
    </Link>
  );
}
