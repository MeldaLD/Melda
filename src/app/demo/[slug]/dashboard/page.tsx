import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangleIcon, ArrowRightIcon, CheckIcon, InfoIcon } from "lucide-react";

import { Seitenkopf } from "@/components/gemeinsam/Anzeigen";
import { Datenumschalter } from "@/components/gemeinsam/Datenumschalter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { alterKurz } from "@/lib/dashboard/kennzahlen";
import { bestandLaden } from "@/lib/daten/quelle";
import { ausnahmen, kostengrenze, nachweis } from "@/lib/verwalter/ausnahmen";

/**
 * Die Startseite der Hausverwaltung.
 *
 * Die Reihenfolge ist die Aussage: zuerst, was Aufmerksamkeit braucht – und
 * wenn das leer ist, steht das auch so da. Erst darunter kommt, was ohne
 * Zutun gelaufen ist.
 *
 * Ein Dashboard mit zwölf Kacheln wäre keine Kontrolle, sondern deren
 * Vortäuschung. Hier steht deshalb eine einzige Frage im Vordergrund: Muss
 * ich gerade etwas tun?
 */
export default async function KontrollSeite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ergebnis = await bestandLaden(slug);
  if (!ergebnis) notFound();

  const { bestand, ansicht } = ergebnis;
  const basis = `/demo/${slug}/dashboard`;

  // Noch nichts gemeldet, Beispiele ausgeblendet: Ein "Nichts braucht Ihre
  // Aufmerksamkeit" wäre hier eine Beruhigung über nichts, und eine Bilanz aus
  // lauter Nullen sähe nach Fehler aus. Die Leiste erklärt die Lage.
  if (ansicht.nurEigene && bestand.vorgaenge.length === 0) {
    return (
      <div className="space-y-5 p-4 sm:p-6">
        <Seitenkopf
          titel="Ihre Kontrolle"
          beschreibung="Sie sehen, was abweicht. Alles Übrige läuft."
        />
        <Datenumschalter slug={slug} ansicht={ansicht} />
      </div>
    );
  }

  const liste = ausnahmen(bestand);
  const hoch = liste.filter((a) => a.dringlichkeit === "hoch");
  const mittel = liste.filter((a) => a.dringlichkeit === "mittel");
  const woche = nachweis(bestand, 7);
  const grenze = kostengrenze(bestand);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Seitenkopf
        titel="Ihre Kontrolle"
        beschreibung="Sie sehen, was abweicht. Alles Übrige läuft."
      />
      <Datenumschalter slug={slug} ansicht={ansicht} />

      {/* --- Was Aufmerksamkeit braucht ------------------------------------ */}
      <section className="space-y-3">
        {liste.length === 0 ? (
          <Card className="border-marke-rand bg-marke-sanft">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marke text-marke-kontrast">
                <CheckIcon className="size-4" aria-hidden />
              </span>
              <div>
                <p className="font-medium">Nichts braucht Ihre Aufmerksamkeit.</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Keine überschrittene Frist, kein Auftrag über Ihrer Grenze von{" "}
                  {grenze} €, nichts, das liegen bleibt. Wenn hier etwas steht, steht es
                  zu Recht.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Braucht Ihre Aufmerksamkeit</h2>
              <Badge variant={hoch.length ? "notfall" : "outline"}>
                {liste.length}
              </Badge>
            </div>
            {[...hoch, ...mittel].map((a) => (
              <Card
                key={a.id}
                className={
                  a.dringlichkeit === "hoch"
                    ? "border-prio-notfall/40"
                    : "border-border"
                }
              >
                <CardContent className="flex flex-wrap items-start gap-3 p-4">
                  <span
                    className={
                      a.dringlichkeit === "hoch"
                        ? "mt-0.5 shrink-0 text-prio-notfall"
                        : "mt-0.5 shrink-0 text-muted-foreground"
                    }
                  >
                    {a.dringlichkeit === "hoch" ? (
                      <AlertTriangleIcon className="size-4" aria-hidden />
                    ) : (
                      <InfoIcon className="size-4" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.titel}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                      {a.begruendung}
                    </p>
                    {a.ort && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Vorgang {a.vorgangNummer} · {a.ort}
                      </p>
                    )}
                  </div>
                  {a.vorgangId && (
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link href={`${basis}/vorgaenge/${a.vorgangId}`}>
                        Ansehen <ArrowRightIcon />
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </section>

      {/* --- Was ohne Ihr Zutun gelaufen ist ------------------------------- */}
      <Card>
        <CardHeader className="gap-1">
          <CardTitle>Diese Woche für Sie erledigt</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ohne dass Sie etwas tun mussten.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Zahl wert={woche.eingegangen} was="Meldungen aufgenommen" />
            <Zahl wert={woche.ohneRueckfrage} was="ohne Rückfrage erledigt" />
            <Zahl wert={`${woche.reaktionMinuten} Min.`} was="bis zur ersten Antwort" />
            <Zahl wert={`${woche.gesparteStunden} Std.`} was="Ihre Zeit gespart" />
          </dl>

          <p className="border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
            {woche.vorgelegt === 0
              ? `Nichts lag über Ihrer Grenze von ${grenze} € – deshalb mussten wir Sie zu keinem Auftrag fragen.`
              : `${woche.vorgelegt} ${woche.vorgelegt === 1 ? "Auftrag lag" : "Aufträge lagen"} über Ihrer Grenze von ${grenze} € und wurde${woche.vorgelegt === 1 ? "" : "n"} Ihnen vorgelegt.`}{" "}
            <Link href={`${basis}/grenzen`} className="text-marke hover:underline">
              Grenze ändern
            </Link>
          </p>
        </CardContent>
      </Card>

      {/* --- Der Weg zum Nachschlagen -------------------------------------- */}
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href={`${basis}/vorgaenge`}>
            Alle Vorgänge nachlesen <ArrowRightIcon />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`${basis}/nachweis`}>
            Nachweis für den Eigentümer <ArrowRightIcon />
          </Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Zuletzt eingegangen:{" "}
        {bestand.vorgaenge.length
          ? `vor ${alterKurz(
              [...bestand.vorgaenge].sort((a, b) =>
                b.erstellt_am.localeCompare(a.erstellt_am),
              )[0].erstellt_am,
            )}`
          : "–"}
      </p>
    </div>
  );
}

function Zahl({ wert, was }: { wert: string | number; was: string }) {
  return (
    <div>
      <dt className="sr-only">{was}</dt>
      <dd className="tabellenziffern text-2xl font-semibold tracking-tight">{wert}</dd>
      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{was}</p>
    </div>
  );
}
