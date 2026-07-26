import { notFound } from "next/navigation";

import { rueckrufGruende } from "@config/rueckruf-gruende";
import { Seitenkopf } from "@/components/dashboard/Anzeigen";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bestandLaden } from "@/lib/daten/quelle";
import {
  FACHBEREICH_BEZEICHNUNG,
  GEWERK_BEZEICHNUNG,
  PRIORITAET_BEZEICHNUNG,
  type Prioritaet,
} from "@/lib/daten/typen";

/**
 * DEMO: Die Einstellungen sind eine Ansicht, kein Formular. Sie zeigen, was
 * konfigurierbar wäre, damit ein Verwalter die Tiefe des Systems einschätzen
 * kann – gespeichert wird hier nichts.
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
  const sla = mandant.einstellungen?.sla_stunden ?? {};

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Seitenkopf
        titel="Einstellungen"
        beschreibung="In dieser Vorschau nur zur Ansicht."
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
            <CardTitle>Eskalationsregeln</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Ab wann ein Vorgang in der Ampel rot wird.
            </p>
            <ul className="divide-y divide-border text-sm">
              {(Object.keys(PRIORITAET_BEZEICHNUNG) as Prioritaet[]).map((p) => (
                <li key={p} className="flex items-center justify-between py-2">
                  <span>{PRIORITAET_BEZEICHNUNG[p]}</span>
                  <span className="tabellenziffern text-muted-foreground">
                    {sla[p] ?? "–"} Stunden
                  </span>
                </li>
              ))}
            </ul>
            {mandant.einstellungen?.notfall_telefon && (
              <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                Bei Notfällen wird zusätzlich{" "}
                <span className="tabellenziffern font-medium text-slate-700">
                  {mandant.einstellungen.notfall_telefon}
                </span>{" "}
                per SMS alarmiert.
              </p>
            )}
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
