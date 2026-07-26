import { notFound } from "next/navigation";

import { Seitenkopf } from "@/components/gemeinsam/Anzeigen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { alsDatum, alsEuro } from "@/lib/dashboard/format";
import { bestandLaden } from "@/lib/daten/quelle";
import { kostengrenze, nachweis } from "@/lib/verwalter/ausnahmen";

/**
 * Der Nachweis für die letzten 30 Tage.
 *
 * Rechenschaft ist keine Kür, sondern die dritte Pflicht aus § 666 BGB. Und
 * sie hat einen zweiten Adressaten: Der Verwalter muss dem Eigentümer sagen
 * können, was seine Verwaltung geleistet hat. Diese Seite ist so geschrieben,
 * dass sie sich unverändert weitergeben lässt.
 *
 * Deshalb Sätze statt Kacheln, wo es geht – eine Zahl ohne Bedeutung
 * überzeugt niemanden, der nicht ohnehin überzeugt ist.
 */
export default async function NachweisSeite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ergebnis = await bestandLaden(slug);
  if (!ergebnis) notFound();

  const { bestand } = ergebnis;
  const n = nachweis(bestand, 30);
  const grenze = kostengrenze(bestand);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Seitenkopf
        titel="Nachweis"
        beschreibung={`${alsDatum(n.vonIso)} bis ${alsDatum(n.bisIso)} · zum Weitergeben an den Eigentümer`}
      />

      <div className="max-w-3xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Was eingegangen ist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Zahl wert={n.eingegangen} was="Meldungen" />
              <Zahl wert={n.erledigt} was="davon abgeschlossen" />
              <Zahl wert={n.notfaelle} was="Notfälle" />
              <Zahl wert={`${n.reaktionMinuten} Min.`} was="bis zur Antwort" />
            </dl>
            <p className="border-t border-border pt-3 text-sm leading-relaxed text-slate-700">
              Jede Meldung wurde aufgenommen, eingeordnet und an den zuständigen Betrieb
              gebracht. Die durchschnittliche Bearbeitungsdauer bis zum Abschluss lag
              bei{" "}
              <span className="tabellenziffern font-medium">
                {n.dauerSchnittStunden} Stunden
              </span>
              .
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Was Ihnen vorgelegt wurde</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-4">
              <Zahl wert={n.ohneRueckfrage} was={`unter ${grenze} € – erledigt`} />
              <Zahl wert={n.vorgelegt} was={`über ${grenze} € – vorgelegt`} />
            </dl>
            <p className="border-t border-border pt-3 text-sm leading-relaxed text-slate-700">
              {n.vorgelegt === 0
                ? `In diesem Zeitraum lag kein Auftrag über Ihrer Grenze. Sie mussten zu keiner Meldung entscheiden.`
                : `Alles über Ihrer Grenze kam auf Ihren Tisch, alles darunter haben wir erledigt. So ist Ihre Grenze eingestellt – Sie können sie jederzeit ändern.`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Was das gebracht hat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Zahl wert={n.zweitanfahrtenVermieden} was="vermiedene Zweitanfahrten" />
              <Zahl wert={n.selbsthilfeErfolge} was="vom Mieter selbst behoben" />
              <Zahl wert={`${n.gesparteStunden} Std.`} was="Ihre Arbeitszeit" />
            </dl>
            <p className="border-t border-border pt-3 text-sm leading-relaxed text-slate-700">
              Vermiedene Kosten:{" "}
              <span className="tabellenziffern font-medium">
                {alsEuro(n.ersparnisEuro)}
              </span>
              . Darin stecken Anfahrten, die nicht nötig waren, weil der Umfang vorher
              feststand, und Einsätze, die ganz entfielen, weil der Mieter eine
              Anleitung bekommen hat.
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Die Zeitersparnis ist gerechnet, nicht gemessen: 20 Minuten je Meldung für
              Aufnahme, Rückfragen und Rückruf, dazu 15 Minuten je vermiedener
              Zweitanfahrt für die erneute Abstimmung. Die Annahmen stehen offen in der
              Konfiguration.
            </p>
          </CardContent>
        </Card>
      </div>
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
