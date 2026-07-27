"use client";

import { useState, useTransition } from "react";
import { AlertCircleIcon, CheckIcon, Loader2Icon } from "lucide-react";

import { eingreifen, type Eingriff } from "@/app/demo/[slug]/dashboard/aktionen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tourMelden } from "@/lib/tour/ereignisse";

/**
 * Der Griff ins Steuer.
 *
 * Die Kontrollpflicht der Hausverwaltung lässt sich nicht mit auslagern. Sie
 * braucht deshalb nicht nur Einsicht, sondern die Möglichkeit einzugreifen –
 * sonst wäre die Kontrolle eine Behauptung.
 *
 * Bewusst klein und ruhig gehalten und rechts statt oben: Wer hier landet,
 * soll lesen, nicht bedienen. Der Knopf ist da, wenn er gebraucht wird.
 */
export function Eingreifen({
  slug,
  vorgangId,
  titel,
  gestoppt,
}: {
  slug: string;
  vorgangId: string;
  titel: string;
  gestoppt: boolean;
}) {
  const [offen, setOffen] = useState(false);
  const [bemerkung, setBemerkung] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();

  const ausloesen = (art: Eingriff, erfolg: string) =>
    starten(async () => {
      const ergebnis = await eingreifen({ slug, vorgangId, art, bemerkung });
      if (ergebnis.fehlgeschlagen) {
        setFehler(ergebnis.hinweis ?? "Hat nicht geklappt.");
        return;
      }
      setFehler(null);
      setBemerkung("");
      setMeldung(
        ergebnis.gespeichert
          ? erfolg
          : `${erfolg} (in dieser Vorschau nicht gespeichert)`,
      );
    });

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>Eingreifen</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Sie müssen hier nichts tun – wir kümmern uns. Wenn Ihnen etwas nicht passt,
          halten Sie es an.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {gestoppt ? (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
            Dieser Vorgang ist von Ihnen gestoppt. Wir unternehmen nichts weiter, bis
            Sie sich melden.
          </p>
        ) : !offen ? (
          <Button
            variant="outline"
            size="sm"
            data-tour="eingreifen-knopf"
            onClick={() => {
              setOffen(true);
              // Die ausführliche Tour wartet genau darauf. Ohne laufende Tour
              // verpufft der Aufruf.
              tourMelden("verwalter:eingreifen-geoeffnet");
            }}
          >
            Ich möchte eingreifen
          </Button>
        ) : (
          <>
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700">
                Worum geht es? (freiwillig)
              </span>
              <textarea
                value={bemerkung}
                onChange={(e) => setBemerkung(e.target.value)}
                rows={2}
                placeholder="z. B. Eigentümer möchte vorher gefragt werden"
                className="w-full rounded-md border border-input p-2 text-sm focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
              />
            </label>

            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={laeuft}
                onClick={() => ausloesen("rueckruf", "Wir melden uns bei Ihnen.")}
              >
                {laeuft && <Loader2Icon className="animate-spin" />}
                Bitte kurz Rücksprache
              </Button>
              <Button
                variant="marke"
                size="sm"
                disabled={laeuft}
                onClick={() => ausloesen("freigeben", "Freigegeben.")}
              >
                Ausdrücklich freigeben
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={laeuft}
                onClick={() => ausloesen("stoppen", "Vorgang gestoppt.")}
                className="text-prio-notfall hover:text-prio-notfall"
              >
                Vorgang anhalten
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={laeuft}
                onClick={() => setOffen(false)}
              >
                Abbrechen
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Jeder Eingriff steht danach im Verlauf von „{titel}&ldquo; – mit Zeitpunkt
              und Namen.
            </p>
          </>
        )}

        {meldung && (
          <p className="flex items-center gap-1.5 text-xs text-marke">
            <CheckIcon className="size-3.5 shrink-0" aria-hidden />
            {meldung}
          </p>
        )}
        {fehler && (
          <p className="flex items-start gap-1.5 text-xs text-prio-notfall">
            <AlertCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
            {fehler}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
