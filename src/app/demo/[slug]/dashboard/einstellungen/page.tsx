import { notFound } from "next/navigation";

import { rueckrufGruende } from "@config/rueckruf-gruende";
import { kleinreparaturen, selbsthilfeKatalog } from "@config/kleinreparaturen";
import { Seitenkopf } from "@/components/dashboard/Anzeigen";
import { AutomatikRegeln, RegelFormular } from "@/components/dashboard/RegelFormular";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bestandLaden } from "@/lib/daten/quelle";
import { FACHBEREICH_BEZEICHNUNG, GEWERK_BEZEICHNUNG } from "@/lib/daten/typen";

/**
 * Die Einstellungen.
 *
 * Die Regelwerte – Ampelfristen, Kleinreparaturgrenze, Notfallnummer,
 * Automatikregeln – lassen sich hier ändern und werden gespeichert. Sie
 * wirken sofort: Die Ampel rechnet danach, und der Assistent bietet die
 * Selbsthilfe entsprechend an.
 *
 * DEMO: Mitarbeitende, Objekte und Handwerksbetriebe bleiben Ansicht. Diese
 * Stammdaten kommen im Echtbetrieb aus dem ERP des Kunden; ein Formular
 * dafür würde eine Pflege vortäuschen, die es so nicht geben wird.
 */
export default async function EinstellungenSeite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ergebnis = await bestandLaden(slug);
  if (!ergebnis) notFound();

  const { bestand } = ergebnis;
  const { mandant } = bestand;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Seitenkopf
        titel="Einstellungen"
        beschreibung="Regelwerte ändern Sie hier. Stammdaten kommen später aus Ihrem System."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mitarbeitende</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {bestand.mitarbeiter.map((person) => (
                <li key={person.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-marke-sanft text-xs font-semibold text-marke">
                    {person.initialen}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{person.name}</p>
                    <p className="text-xs text-muted-foreground">{person.rolle}</p>
                  </div>
                  <Badge variant="outline">
                    {FACHBEREICH_BEZEICHNUNG[person.bereich]}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Regeln</CardTitle>
          </CardHeader>
          <CardContent>
            <RegelFormular
              slug={slug}
              einstellungen={mandant.einstellungen ?? {}}
              standardGrenze={kleinreparaturen.grenzeEuro}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Automatische Gewerkezuordnung</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {bestand.handwerker
                .filter((h) => h.ist_standard)
                .map((betrieb) => (
                  <li
                    key={betrieb.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="text-muted-foreground">
                      {GEWERK_BEZEICHNUNG[betrieb.gewerk]}
                    </span>
                    <span className="font-medium">{betrieb.firma}</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kleinreparaturen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Liegt eine Reparatur unter diesem Betrag und lässt sie sich gefahrlos
              selbst beheben, bietet der Assistent dem Mieter eine Anleitung an. Nimmt
              er sie an, entfällt der Einsatz.
            </p>
            <ul className="divide-y divide-border text-sm">
              <li className="flex items-center justify-between py-2">
                <span>Jahresobergrenze</span>
                <span className="tabellenziffern font-medium">
                  {Math.round(kleinreparaturen.jahresgrenzeAnteil * 100)} % der
                  Jahreskaltmiete
                </span>
              </li>
              <li className="flex items-center justify-between py-2">
                <span>Anleitungen hinterlegt</span>
                <span className="tabellenziffern font-medium">
                  {Object.keys(selbsthilfeKatalog).length} Fälle
                </span>
              </li>
            </ul>
            <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
              Die Kleinreparaturklausel überträgt nur die Kosten, nicht die Pflicht zu
              reparieren. Der Assistent bietet die Anleitung deshalb ausdrücklich an und
              fordert nie dazu auf.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Automatische Freigaben</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Was der Assistent ohne Nachfrage erledigen darf. Sie werden weiterhin über
              jeden Vorgang informiert.
            </p>
            <AutomatikRegeln
              slug={slug}
              typen={mandant.einstellungen?.automatik_freigaben ?? []}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rückruf-Themen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Diese Auswahl bekommt der Mieter im Chat. Der Zuordnungsvorschlag ist nur
              ein Vorschlag – die Zuweisung machen Sie.
            </p>
            <ul className="divide-y divide-border text-sm">
              {rueckrufGruende.map((grund) => (
                <li
                  key={grund.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0 flex-1">{grund.bezeichnung}</span>
                  <Badge variant="outline">
                    {FACHBEREICH_BEZEICHNUNG[grund.bereichVorschlag]}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Erscheinungsbild</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center gap-3">
                <dt className="w-32 shrink-0 text-xs text-muted-foreground">
                  Primärfarbe
                </dt>
                <dd className="flex items-center gap-2">
                  <span
                    className="size-5 rounded border border-border"
                    style={{ background: mandant.primaerfarbe }}
                  />
                  <span className="tabellenziffern">{mandant.primaerfarbe}</span>
                </dd>
              </div>
              <div className="flex items-center gap-3">
                <dt className="w-32 shrink-0 text-xs text-muted-foreground">
                  Sekundärfarbe
                </dt>
                <dd className="flex items-center gap-2">
                  {mandant.sekundaerfarbe ? (
                    <>
                      <span
                        className="size-5 rounded border border-border"
                        style={{ background: mandant.sekundaerfarbe }}
                      />
                      <span className="tabellenziffern">{mandant.sekundaerfarbe}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Nicht gesetzt</span>
                  )}
                </dd>
              </div>
              <div className="flex items-center gap-3">
                <dt className="w-32 shrink-0 text-xs text-muted-foreground">Stadt</dt>
                <dd>{mandant.stadt}</dd>
              </div>
              <div className="flex items-center gap-3">
                <dt className="w-32 shrink-0 text-xs text-muted-foreground">
                  Ansprechpartner
                </dt>
                <dd>{mandant.ansprechpartner ?? "–"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Demo-Kennung: <code className="rounded bg-muted px-1 py-0.5">{slug}</code>
      </p>
    </div>
  );
}
