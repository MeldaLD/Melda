import "server-only";

import { szenarioNach } from "@config/scenarios";
import { einsatzNach } from "@config/ki-einsatz";

import { basisUrl } from "@/lib/basis-url";
import { fragen, kiVerfuegbar } from "./zugang";
import { bildurteilLesen } from "./pruefen";

/**
 * Das Foto auswerten – Stufe "sehen".
 *
 * Der einzige Schritt, bei dem ein Bild das Haus verlässt, und der einzige,
 * an dem das teuerste Modell arbeitet. Beides hat denselben Grund: Hier
 * entscheidet sich, ob dem Betrieb etwas fehlt. Das ist das Verkaufsargument,
 * und ein Modell, das eine gelöste Silikonfuge für Schimmel hält, kostet mehr
 * als es spart.
 *
 * Zwei Dinge tut es und keine dritten:
 *   1. Es beschreibt, was zu sehen ist, und fragt nach Bestätigung.
 *   2. Es sagt, ob ein zweites Bild bestimmt, WAS der Betrieb einpackt.
 *
 * Es nennt keine Kosten, keine Fristen und keine Termine. Diese Grenze steht
 * in der Anweisung und wird beim Auslesen noch einmal geprüft.
 */

export type Gesehen = {
  /** Der Satz an den Mieter, endet mit der Rückfrage. */
  erkennung: string;
  /** Ob eine Nachfrage nach einem zweiten Bild etwas bringt. */
  brauchtZweitfoto: boolean;
  modell: string;
  dauerMs: number;
  eingabeToken: number;
  ausgabeToken: number;
};

/** Größer als das nimmt kein Modell entgegen, und größer braucht es auch nicht. */
const HOECHSTGROESSE_BYTE = 4_000_000;

const anweisung = `Du bist der Serviceassistent einer deutschen Hausverwaltung und siehst das Foto eines Schadens, das ein Mieter gerade geschickt hat.

Deine Aufgabe hat genau zwei Teile:
1. Beschreibe in ein bis zwei Sätzen, was auf dem Bild zu sehen ist, und schließe mit einer Rückfrage, ob das zutrifft.
2. Entscheide, ob ein zweites Foto aus einer anderen Perspektive bestimmen würde, WAS der Handwerksbetrieb einpackt oder WER überhaupt fährt. Nur dann ist es ein Ja.

Verboten, ausnahmslos:
- Kosten, Preise, Beträge.
- Fristen, Termine, Zeitangaben, Zusagen jeder Art.
- Aussagen zur Rechtslage, zur Mietminderung oder zur Kostentragung.
- Handlungsanweisungen mit Sicherheitsfolgen ("schalten Sie ab", "stellen Sie ab").
- Vermutungen über Schuld oder Ursache, die über das Sichtbare hinausgehen.

Sprache: Deutsch, Sie-Form, sachlich, keine Ausrufezeichen, keine Emojis.

Antworte ausschließlich mit einem JSON-Objekt:
{"erkennung": "<ein bis zwei Sätze mit Rückfrage>", "zweitfoto": true|false}`;

/** Holt das Bild von der eigenen Adresse. Auf Vercel liegt public/ nicht im Dateisystem der Funktion. */
async function bildHolen(
  datei: string,
): Promise<{ base64: string; mimeTyp: string } | null> {
  try {
    const antwort = await fetch(`${basisUrl()}/demo-fotos/${datei}`);
    if (!antwort.ok) return null;

    const mimeTyp = antwort.headers.get("content-type") ?? "";
    if (!/^image\/(jpeg|png|webp)$/.test(mimeTyp)) return null;

    const roh = await antwort.arrayBuffer();
    if (roh.byteLength > HOECHSTGROESSE_BYTE) return null;

    return { base64: Buffer.from(roh).toString("base64"), mimeTyp };
  } catch {
    return null;
  }
}

export async function sehen(
  datei: string,
  szenarioId: string,
): Promise<Gesehen | null> {
  if (!kiVerfuegbar()) return null;
  if (!einsatzNach.get("bild")?.aktiv) return null;
  if (!szenarioNach.has(szenarioId)) return null;

  // Solange in public/demo-fotos/ nur Platzhalter liegen, gibt es nichts
  // auszuwerten. Dann bleibt es beim hinterlegten Text je Kachel – ohne
  // Fehler und ohne Kosten.
  const bild = await bildHolen(datei);
  if (!bild) return null;

  const antwort = await fragen({
    stufe: "sehen",
    system: anweisung,
    inhalt: [
      { art: "bild", mimeTyp: bild.mimeTyp, base64: bild.base64 },
      { art: "text", text: "Was ist hier zu sehen?" },
    ],
    maxToken: 400,
    beginntMit: '{"erkennung":',
  });
  if (!antwort) return null;

  const gelesen = bildurteilLesen(antwort.text);
  if (!gelesen) return null;

  return {
    ...gelesen,
    modell: antwort.modell,
    dauerMs: antwort.dauerMs,
    eingabeToken: antwort.eingabeToken,
    ausgabeToken: antwort.ausgabeToken,
  };
}
