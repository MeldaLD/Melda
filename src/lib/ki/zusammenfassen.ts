import "server-only";

import { einsatzNach } from "@config/ki-einsatz";

import { fragen, kiVerfuegbar } from "./zugang";
import { kuerzen, schwaerzen } from "./schwaerzen";

/**
 * Den Vorgang für die Verwaltung zusammenfassen – Stufe "formulieren".
 *
 * Der einzige Schritt, an dem ein Modell wirklich frei formulieren darf, und
 * zwar aus einem Grund: Der Leser ist Fachmann, hat den Gesprächsverlauf
 * daneben liegen und trifft die Entscheidung ohnehin selbst. Was hier steht,
 * ist eine Arbeitshilfe, keine Zusage an einen Mieter.
 *
 * Trotzdem eng geführt: Was nicht im Gespräch stand, darf nicht in der
 * Zusammenfassung stehen. Eine erfundene Ursache im Vorgang ist schlimmer
 * als gar keine Zusammenfassung, weil sie sich später wie eine Feststellung
 * liest.
 */

export type Zusammenfassung = {
  text: string;
  modell: string;
  dauerMs: number;
  eingabeToken: number;
  ausgabeToken: number;
};

const anweisung = `Du fasst für eine deutsche Hausverwaltung zusammen, was ein Mieter im Chat gemeldet hat.

Der Leser ist Sachbearbeiter und entscheidet danach, ob er den Auftrag freigibt.

Regeln:
- Zwei bis vier Sätze, Fließtext, Sie-Form, sachlich.
- Nenne nur, was im Verlauf tatsächlich steht. Ergänze nichts aus eigenem Wissen.
- Keine Empfehlung, ob freigegeben werden soll – das ist die Entscheidung des Lesers.
- Keine Kosten und keine Fristen, außer sie stehen wörtlich im Verlauf.
- Keine Namen und keine Anschriften; die stehen bereits am Vorgang.
- Kein Vorwort, keine Überschrift, keine Aufzählung. Nur der Text.`;

/** Länger liest niemand, und länger sagt auch niemand mehr. */
const HOECHSTLAENGE = 700;

export async function zusammenfassen(
  szenarioTitel: string,
  verlauf: { von: string; text?: string }[],
): Promise<Zusammenfassung | null> {
  if (!kiVerfuegbar()) return null;
  if (!einsatzNach.get("zusammenfassung")?.aktiv) return null;

  const gespraech = verlauf
    .filter((n) => n.text?.trim())
    .map((n) => `${n.von === "mieter" ? "Mieter" : "Assistent"}: ${n.text!.trim()}`)
    .join("\n");
  if (gespraech.length < 40) return null;

  const sauber = schwaerzen(kuerzen(gespraech, 6000));

  const antwort = await fragen({
    stufe: "formulieren",
    system: anweisung,
    inhalt: [
      {
        art: "text",
        text: `Meldung: ${szenarioTitel}\n\nVerlauf:\n${sauber.text}`,
      },
    ],
    maxToken: 400,
  });
  if (!antwort) return null;

  const text = antwort.text.trim();
  if (text.length < 40 || text.length > HOECHSTLAENGE) return null;

  return {
    text,
    modell: antwort.modell,
    dauerMs: antwort.dauerMs,
    eingabeToken: antwort.eingabeToken,
    ausgabeToken: antwort.ausgabeToken,
  };
}
