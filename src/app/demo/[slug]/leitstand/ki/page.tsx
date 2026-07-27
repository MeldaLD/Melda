import { notFound } from "next/navigation";
import { CircleDashedIcon, CpuIcon, LockIcon, UserIcon } from "lucide-react";

import {
  bleibtHier,
  einsaetze,
  kostenschaetzung,
  stufeNach,
  stufen,
  type Einsatz,
} from "@config/ki-einsatz";
import { Seitenkopf } from "@/components/gemeinsam/Anzeigen";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mandantLaden } from "@/lib/daten/quelle";

/**
 * Wo ein Sprachmodell arbeitet – und wo ausdrücklich nicht.
 *
 * Diese Seite gehört bewusst in den Leitstand und nicht in die
 * Verwaltersicht: Sie ist Werkzeug und Gesprächsgrundlage, nicht Teil des
 * Produkts. Im Verkaufsgespräch beantwortet sie die beiden Fragen, die eine
 * Hausverwaltung als erstes stellt – „erfindet die was?“ und „was schicken
 * Sie von meinen Mietern wohin?“ –, und uns zeigt sie, was mit der
 * Modellanbindung noch zu bauen ist.
 *
 * Der Inhalt steht in config/ki-einsatz.ts.
 */
export default async function KiSeite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const mandant = await mandantLaden(slug);
  if (!mandant) notFound();

  const offen = einsaetze.filter((e) => e.stand === "vorlaeufig");

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Seitenkopf
        titel="Was die KI tut"
        beschreibung="Und an welchen Stellen sie ausdrücklich nichts zu sagen hat."
      />

      <Card className="max-w-4xl border-marke-rand bg-marke-sanft">
        <CardContent className="space-y-2 p-5">
          <p className="text-lg leading-snug font-medium text-slate-900">
            Der Assistent darf verstehen und formulieren. Entscheiden und behaupten darf
            er nicht.
          </p>
          <p className="text-sm leading-relaxed text-slate-700">
            Verstehen heißt: aus einem Satz das Anliegen erkennen, aus einem Foto lesen,
            was fehlt. Formulieren heißt: eine feststehende Aussage in die Worte dieses
            Gesprächs bringen. Fristen nennen, Kosten zusagen, Rechtslagen erklären,
            Termine versprechen – das kommt aus hinterlegten Texten oder von einem
            Menschen.
          </p>
        </CardContent>
      </Card>

      {/* --- Die Stufen ----------------------------------------------------- */}
      <Card className="max-w-4xl">
        <CardHeader className="gap-1">
          <CardTitle>
            {stufen.length} Stufen, {stufen.filter((s) => s.modell).length} davon mit
            Modell
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Klassifizieren mit dem kleinsten Modell, erst danach – und nur wo nötig –
            ein größeres. Wer jeden Schritt an das teuerste Modell gibt, zahlt ein
            Vielfaches für dieselbe Qualität.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {stufen.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-start gap-x-4 gap-y-1 border-t border-border pt-3 first:border-0 first:pt-0"
            >
              <div className="w-40 shrink-0">
                <p className="text-sm font-medium">{s.bezeichnung}</p>
                <p className="tabellenziffern text-xs text-muted-foreground">
                  {s.modell ?? "kein Modellaufruf"}
                </p>
              </div>
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
                {s.begruendung}
              </p>
              <p className="tabellenziffern w-28 shrink-0 text-right text-xs text-muted-foreground">
                {s.preis ? `${s.preis.eingabe} / ${s.preis.ausgabe} $ je Mio.` : "0 €"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* --- Schritt für Schritt -------------------------------------------- */}
      <Card className="max-w-4xl">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Schritt für Schritt</CardTitle>
            <p className="text-xs text-muted-foreground">
              „Vorläufig“ heißt: heute ein hinterlegter Text, weil die Schnittstelle
              noch fehlt. „Bleibt“ heißt: hinterlegt aus Überzeugung, auch danach.
            </p>
          </div>
          <Badge variant="outline">{offen.length} offen</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {einsaetze.map((e) => (
            <Zeile key={e.schritt} einsatz={e} />
          ))}
        </CardContent>
      </Card>

      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
        {/* --- Datensparsamkeit --------------------------------------------- */}
        <Card>
          <CardHeader className="gap-1">
            <CardTitle className="flex items-center gap-2">
              <LockIcon className="size-4 text-marke" aria-hidden />
              Was das Modell nie sieht
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Keine Zusicherung im Kleingedruckten, sondern eine Bauvorschrift: Diese
              Felder werden vor dem Aufruf entfernt und danach lokal wieder eingesetzt.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {bleibtHier.map((f) => (
                <li key={f} className="flex gap-2 text-sm leading-snug text-slate-700">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-400" />
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* --- Kosten -------------------------------------------------------- */}
        <Kosten />
      </div>
    </div>
  );
}

function Zeile({ einsatz }: { einsatz: Einsatz }) {
  const stufe = stufeNach.get(einsatz.stufe);
  const mitModell = Boolean(stufe?.modell);
  const mensch = einsatz.stufe === "mensch";

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-t border-border pt-3 first:border-0 first:pt-0">
      <span
        className={
          mitModell
            ? "mt-0.5 shrink-0 text-marke"
            : "mt-0.5 shrink-0 text-muted-foreground"
        }
      >
        {mensch ? (
          <UserIcon className="size-4" aria-hidden />
        ) : mitModell ? (
          <CpuIcon className="size-4" aria-hidden />
        ) : (
          <CircleDashedIcon className="size-4" aria-hidden />
        )}
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{einsatz.schritt}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {einsatz.hinweis}
        </p>
        {einsatz.daten && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium">Geht raus:</span> {einsatz.daten}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant={einsatz.stand === "vorlaeufig" ? "outline" : "secondary"}>
          {einsatz.stand === "vorlaeufig" ? "Vorläufig Skript" : "Bleibt Skript"}
        </Badge>
        <span className="tabellenziffern text-[11px] text-muted-foreground">
          {stufe?.modell ?? stufe?.bezeichnung}
        </span>
      </div>
    </div>
  );
}

/**
 * Was ein Vorgang an Modellkosten verursacht.
 *
 * DEMO: Geschätzte Tokenmengen. Der Vergleichswert ist nicht ein anderes
 * Modell, sondern die zwanzig Minuten, die dieselbe Meldung am Telefon kostet.
 */
function Kosten() {
  const posten = kostenschaetzung.posten.map((p) => {
    const stufe = stufeNach.get(p.stufe);
    const preis = stufe?.preis;
    const dollar = preis
      ? ((p.eingabeToken * preis.eingabe + p.ausgabeToken * preis.ausgabe) /
          1_000_000) *
        p.anzahl
      : 0;
    return { name: stufe?.bezeichnung ?? p.stufe, anzahl: p.anzahl, dollar };
  });

  const summe = posten.reduce((s, p) => s + p.dollar, 0);
  const mitSpeicher = summe * kostenschaetzung.zwischenspeicherFaktor + summe * 0.65;
  const cent = (d: number) => `${(d * 100).toFixed(1)} ¢`;

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>Was ein Vorgang kostet</CardTitle>
        <p className="text-xs text-muted-foreground">
          DEMO: geschätzte Tokenmengen, keine Messung – die gibt es erst mit der
          Schnittstelle. Die Größenordnung stimmt.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {posten.map((p) => (
          <div key={p.name} className="flex justify-between gap-4">
            <span className="text-muted-foreground">
              {p.name}
              {p.anzahl > 1 && ` · ${p.anzahl}×`}
            </span>
            <span className="tabellenziffern font-medium">{cent(p.dollar)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-border pt-2">
          <span className="text-muted-foreground">
            Mit Zwischenspeicher für den Systemtext
          </span>
          <span className="tabellenziffern font-medium">{cent(mitSpeicher)}</span>
        </div>
        <p className="border-t border-border pt-3 text-sm leading-relaxed text-slate-700">
          Gut {cent(mitSpeicher)} je Meldung. Dieselbe Meldung am Telefon aufzunehmen,
          zu briefen und zurückzurufen kostet die Verwaltung rund zwanzig Minuten.
        </p>
      </CardContent>
    </Card>
  );
}
