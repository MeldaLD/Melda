import "server-only";

import { szenarien } from "@config/scenarios";
import { anliegen } from "@config/anliegen";
import { einsatzNach } from "@config/ki-einsatz";

import { fragen, kiVerfuegbar } from "./zugang";
import { zuordnungLesen } from "./pruefen";
import { kuerzen, schwaerzen } from "./schwaerzen";

/**
 * Freitext einem Thema zuordnen – Stufe "verstehen".
 *
 * Was das Modell hier tut, ist bewusst eng: Es wählt aus einer Liste, die wir
 * vorgeben. Es formuliert nichts, es entscheidet nichts, es erklärt nichts.
 * Die Antwort ist eine Kennung; alles, was der Mieter danach liest, kommt aus
 * der Konfiguration. Damit ist dieser Schritt auch rechtlich unbedenklich:
 * Ein Modell, das nur "das klingt nach Heizung" sagt, erbringt keine
 * Rechtsdienstleistung.
 *
 * Deshalb genügt das kleinste Modell – siehe Begründung in
 * config/ki-einsatz.ts.
 */

export type Verstanden = {
  /** Kennung aus config/scenarios.ts, oder null. */
  szenarioId: string | null;
  /** Kennung aus config/anliegen.ts, wenn es kein Schaden ist. */
  anliegenId: string | null;
  /** 0 bis 1. Unter der Schwelle wird die Antwort verworfen. */
  sicherheit: number;
  modell: string;
  dauerMs: number;
  eingabeToken: number;
  ausgabeToken: number;
  /** Welche Arten von Angaben vor dem Aufruf entfernt wurden. */
  geschwaerzt: string[];
};

function katalog(): string {
  const faelle = szenarien
    .map((s) => `- ${s.id}: ${s.titel} (${s.kategorie}, ${s.gewerk})`)
    .join("\n");
  const themen = anliegen
    .filter((a) => !a.istSchaden)
    .map((a) => `- ${a.id}: ${a.bezeichnung}`)
    .join("\n");

  return `SCHADENSFÄLLE\n${faelle}\n\nANDERE THEMEN\n${themen}`;
}

function anweisung(): string {
  return `Du ordnest die Nachricht eines Mieters an seine Hausverwaltung genau einem Eintrag aus der folgenden Liste zu.

${katalog()}

Regeln:
- Antworte ausschließlich mit einem JSON-Objekt, ohne Vorrede und ohne Erklärung.
- Form: {"szenario": "<id oder null>", "thema": "<id oder null>", "sicherheit": <0 bis 1>}
- Passt die Nachricht zu einem Schadensfall, setze "szenario" und lasse "thema" auf null.
- Geht es nicht um einen Schaden, setze "thema" und lasse "szenario" auf null.
- Erfinde keine Kennungen. Nur die oben genannten sind zulässig.
- Bist du unsicher, gib eine niedrige Sicherheit an. Rate nicht.
- Du gibst dem Mieter keine Auskunft, keinen Rat und keine Einschätzung. Deine gesamte Aufgabe ist diese Zuordnung.`;
}

export async function verstehen(text: string): Promise<Verstanden | null> {
  if (!kiVerfuegbar()) return null;
  if (!einsatzNach.get("freitext")?.aktiv) return null;

  const sauber = schwaerzen(kuerzen(text));

  const antwort = await fragen({
    stufe: "verstehen",
    system: anweisung(),
    inhalt: [{ art: "text", text: sauber.text }],
    maxToken: 120,
    // Erzwingt die Form, ohne dass das Modell darum gebeten werden muss.
    beginntMit: '{"szenario":',
  });
  if (!antwort) return null;

  const gelesen = zuordnungLesen(antwort.text);
  if (!gelesen) return null;

  return {
    ...gelesen,
    modell: antwort.modell,
    dauerMs: antwort.dauerMs,
    eingabeToken: antwort.eingabeToken,
    ausgabeToken: antwort.ausgabeToken,
    geschwaerzt: sauber.entfernt,
  };
}
