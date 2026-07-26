import { notFound } from "next/navigation";
import { PhoneIcon, WrenchIcon } from "lucide-react";

import { grundNach, zeitwunschNach } from "@config/rueckruf-gruende";
import { LeerHinweis, Seitenkopf } from "@/components/dashboard/Anzeigen";
import { RueckrufZuordnen } from "@/components/dashboard/RueckrufZuordnen";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { alsDatum, alsZeitraum } from "@/lib/dashboard/format";
import { bestandLaden } from "@/lib/daten/quelle";
import { FACHBEREICH_BEZEICHNUNG } from "@/lib/daten/typen";

export default async function TermineSeite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ergebnis = await bestandLaden(slug);
  if (!ergebnis) notFound();

  const { bestand } = ergebnis;

  const rueckrufe = bestand.termine.filter((t) => t.typ === "rueckruf");
  const offeneRueckrufe = rueckrufe.filter((t) => !t.mitarbeiter_id);
  const zugeordnet = rueckrufe.filter((t) => t.mitarbeiter_id);
  const handwerkertermine = bestand.termine
    .filter((t) => t.typ === "handwerkertermin")
    .sort((a, b) => (a.beginn ?? "").localeCompare(b.beginn ?? ""));

  // Nur Name, Rolle und Bereich an den Browser geben – mehr braucht die
  // Auswahl nicht.
  const personen = bestand.mitarbeiter.map((m) => ({
    id: m.id,
    name: m.name,
    rolle: m.rolle,
    bereich: m.bereich,
  }));

  const person = (id: string | null) =>
    bestand.mitarbeiter.find((m) => m.id === id)?.name ?? null;
  const mieter = (id: string | null) =>
    bestand.einheiten.find((e) => e.id === id)?.mieter_name ?? "–";

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Seitenkopf
        titel="Rückrufe & Termine"
        beschreibung="Mieter nennen nur das Thema. Wer zurückruft, entscheiden Sie."
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <PhoneIcon className="size-4 text-marke" aria-hidden />
            Rückrufe ohne Zuordnung
          </CardTitle>
          {offeneRueckrufe.length > 0 && (
            <Badge variant="marke">{offeneRueckrufe.length} offen</Badge>
          )}
        </CardHeader>
        <CardContent>
          {offeneRueckrufe.length === 0 ? (
            <LeerHinweis text="Alle Rückrufwünsche sind zugeordnet." />
          ) : (
            <ul className="divide-y divide-border">
              {offeneRueckrufe.map((termin) => {
                const grund = termin.grund ? grundNach.get(termin.grund) : undefined;
                const zeit = termin.zeitwunsch
                  ? zeitwunschNach.get(termin.zeitwunsch)
                  : undefined;

                return (
                  <li
                    key={termin.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {grund?.bezeichnung ?? termin.titel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {mieter(termin.einheit_id)} · erreichbar{" "}
                        {zeit?.bezeichnung.toLowerCase() ?? "nach Absprache"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {termin.bereich_vorschlag && (
                        <span className="text-xs text-muted-foreground">
                          Vorschlag:{" "}
                          <span className="font-medium text-slate-700">
                            {FACHBEREICH_BEZEICHNUNG[termin.bereich_vorschlag]}
                          </span>
                        </span>
                      )}
                      <RueckrufZuordnen
                        slug={slug}
                        terminId={termin.id}
                        personen={personen}
                        vorschlag={termin.bereich_vorschlag}
                        zeitwunsch={termin.zeitwunsch}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Vereinbarte Rückrufe</CardTitle>
          </CardHeader>
          <CardContent>
            {zugeordnet.length === 0 ? (
              <LeerHinweis text="Keine vereinbarten Rückrufe." />
            ) : (
              <ul className="divide-y divide-border">
                {zugeordnet.map((termin) => (
                  <li key={termin.id} className="py-2.5">
                    <p className="text-sm font-medium">
                      {termin.grund
                        ? (grundNach.get(termin.grund)?.bezeichnung ?? termin.titel)
                        : termin.titel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {mieter(termin.einheit_id)} · {person(termin.mitarbeiter_id)} ·{" "}
                      {alsDatum(termin.beginn)},{" "}
                      {alsZeitraum(termin.beginn, termin.ende)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WrenchIcon className="size-4 text-marke" aria-hidden />
              Handwerkertermine
            </CardTitle>
          </CardHeader>
          <CardContent>
            {handwerkertermine.length === 0 ? (
              <LeerHinweis text="Keine Handwerkertermine geplant." />
            ) : (
              <ul className="divide-y divide-border">
                {handwerkertermine.map((termin) => {
                  const betrieb = bestand.handwerker.find(
                    (h) => h.id === termin.handwerker_id,
                  );
                  return (
                    <li key={termin.id} className="py-2.5">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {termin.titel}
                        {/* Ein vorgemerkter Termin ist noch keiner. Ohne diese
                            Unterscheidung stünde hier ein Wunsch des Mieters
                            wie eine feste Zusage. */}
                        {termin.status === "bestaetigt" ? (
                          <Badge variant="marke">Bestätigt</Badge>
                        ) : (
                          <Badge variant="outline">Vorgemerkt</Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {mieter(termin.einheit_id)} · {betrieb?.firma} ·{" "}
                        {alsDatum(termin.beginn)},{" "}
                        {alsZeitraum(termin.beginn, termin.ende)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
