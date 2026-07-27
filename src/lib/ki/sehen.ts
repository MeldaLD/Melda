import "server-only";

import { istDemoFoto, szenarioNach } from "@config/scenarios";
import { einsatzNach } from "@config/ki-einsatz";

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
 *
 * WAS NICHT RAUSGEHT
 *
 * Die Bilder der Vorführung – die zehn Kacheln im Foto-Dialog und ihre
 * Nachfragebilder – bleiben hier, auch mit gesetztem Schlüssel. Zu jedem
 * gibt es eine hinterlegte Diagnose, die ein Mensch geschrieben hat und die
 * zum weiteren Gesprächsverlauf passt. Ein Modell danach zu fragen, wäre
 * Geld für eine schlechtere Antwort, und in einer Vorführung zusätzlich ein
 * Risiko: Das Modell sieht dasselbe Bild jedes Mal ein bisschen anders.
 *
 * Nur ein Bild, dessen Name nicht in config/scenarios.ts steht, geht wirklich
 * an ein Modell. Für das gibt es nämlich keine hinterlegte Antwort.
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

/**
 * Holt das Bild von der eigenen Adresse.
 *
 * Über HTTP und nicht aus dem Dateisystem: Auf Vercel liegt public/ nicht im
 * Bündel der Funktion, ein Lesezugriff ginge dort ins Leere.
 *
 * Die Adresse kommt aus der eingehenden Anfrage und nicht aus basisUrl().
 * Letzteres ist die Adresse, die der Kunde sehen soll – lokal ist das
 * Port 3000, auch wenn der Server auf einem anderen läuft, und dann holt sich
 * die Bildauswertung nichts als eine abgewiesene Verbindung.
 */
async function bildHolen(
  herkunft: string,
  datei: string,
): Promise<{ base64: string; mimeTyp: string } | null> {
  try {
    const antwort = await fetch(`${herkunft}/demo-fotos/${datei}`);
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
  /** Ursprung der eingehenden Anfrage, z. B. https://demo.example.de */
  herkunft: string,
  datei: string,
  szenarioId?: string,
): Promise<Gesehen | null> {
  if (!kiVerfuegbar()) return null;
  if (!einsatzNach.get("bild")?.aktiv) return null;

  // Die Sperre. Bewusst hier und nicht nur im Browser: Was der Server nicht
  // verschickt, lässt sich auch durch eine veränderte Anfrage nicht erzwingen.
  if (istDemoFoto(datei)) return null;

  // Ein mitgegebenes Szenario muss es geben – sonst stammt die Anfrage nicht
  // von uns.
  if (szenarioId && !szenarioNach.has(szenarioId)) return null;

  // Kein lesbares Bild an dieser Adresse: Dann bleibt es beim hinterlegten
  // Text – ohne Fehler und ohne Kosten.
  const bild = await bildHolen(herkunft, datei);
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
