import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { stufeNach } from "@config/ki-einsatz";

/**
 * Der Zugang zum Sprachmodell.
 *
 * SERVERSEITIG UND SONST NIRGENDS. Das "server-only" oben ist keine Zierde:
 * Es lässt den Build scheitern, sobald diese Datei versehentlich in einer
 * Komponente landet, die im Browser läuft. Ein Schlüssel, der einmal im
 * Browser war, ist verbrannt.
 *
 * Der Schlüssel steht ausschließlich in der Umgebung (ANTHROPIC_API_KEY),
 * niemals im Repository. Fehlt er, läuft die ganze Anwendung unverändert
 * weiter – auf hinterlegten Texten. Das ist der Normalfall bei jeder
 * Vorführung ohne Vertrag und darf nirgends zu einem Fehler führen.
 */

/** Kein Aufruf darf eine Vorführung aufhalten. */
const ZEITGRENZE_MS = 20_000;

/** Ein einzelner Versuch bei Netzfehlern – mehr kostet nur Wartezeit. */
const VERSUCHE = 1;

let zugang: Anthropic | null = null;

export function kiVerfuegbar(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function anthropic(): Anthropic | null {
  if (!kiVerfuegbar()) return null;
  zugang ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: ZEITGRENZE_MS,
    maxRetries: VERSUCHE,
  });
  return zugang;
}

/**
 * Welches Modell für eine Stufe zuständig ist.
 *
 * Die Zuordnung steht in config/ki-einsatz.ts und nirgends sonst – dort ist
 * sie zusammen mit der Begründung nachlesbar und änderbar, ohne dass jemand
 * Code anfassen muss.
 */
export function modellFuer(stufeId: string): string | null {
  return stufeNach.get(stufeId)?.modell ?? null;
}

export type Inhalt =
  { art: "text"; text: string } | { art: "bild"; mimeTyp: string; base64: string };

export type Anfrage = {
  /** Kennung aus config/ki-einsatz.ts – bestimmt das Modell. */
  stufe: string;
  /** Die Anweisung. Bei jedem Aufruf gleich, damit sie zwischengespeichert wird. */
  system: string;
  inhalt: Inhalt[];
  maxToken: number;
  /**
   * Erste Worte der Antwort. Zwingt das Modell in eine Form, ohne dass man
   * darum bitten muss – die verlässlichste Art, JSON zu bekommen.
   */
  beginntMit?: string;
};

export type Antwort = {
  text: string;
  modell: string;
  eingabeToken: number;
  ausgabeToken: number;
  dauerMs: number;
};

/**
 * Ein Aufruf beim Modell.
 *
 * Gibt null zurück, wenn kein Schlüssel gesetzt ist, das Modell nicht
 * antwortet oder etwas anderes schiefgeht. Jeder Aufrufer muss mit null
 * umgehen können und auf den hinterlegten Text zurückfallen – siehe die
 * Routen unter src/app/api/ki/.
 */
export async function fragen(anfrage: Anfrage): Promise<Antwort | null> {
  const kunde = anthropic();
  const modell = modellFuer(anfrage.stufe);
  if (!kunde || !modell) return null;

  const beginn = Date.now();
  try {
    const antwort = await kunde.messages.create({
      model: modell,
      max_tokens: anfrage.maxToken,
      // Der Systemtext ist bei jedem Aufruf derselbe. Zwischengespeichert
      // kostet er beim Lesen etwa ein Zehntel – siehe kostenschaetzung in
      // config/ki-einsatz.ts. Unterhalb der Mindestlänge greift der Speicher
      // stillschweigend nicht; das kostet nichts und schadet nichts.
      system: [
        {
          type: "text",
          text: anfrage.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        { role: "user", content: anfrage.inhalt.map(alsBlock) },
        ...(anfrage.beginntMit
          ? [{ role: "assistant" as const, content: anfrage.beginntMit }]
          : []),
      ],
    });

    const text = antwort.content
      .map((teil) => (teil.type === "text" ? teil.text : ""))
      .join("");

    return {
      // Vorgegebener Anfang gehört zur Antwort, kommt aber nicht zurück.
      text: (anfrage.beginntMit ?? "") + text,
      modell,
      eingabeToken: antwort.usage.input_tokens,
      ausgabeToken: antwort.usage.output_tokens,
      dauerMs: Date.now() - beginn,
    };
  } catch (fehler) {
    // Bewusst nur eine Zeile im Serverprotokoll: Der Inhalt der Anfrage
    // gehört dort nicht hinein, und die Vorführung läuft weiter.
    console.error(
      `[ki] ${anfrage.stufe} fehlgeschlagen nach ${Date.now() - beginn} ms:`,
      fehler instanceof Error ? fehler.message : "unbekannter Fehler",
    );
    return null;
  }
}

function alsBlock(inhalt: Inhalt) {
  if (inhalt.art === "text") {
    return { type: "text" as const, text: inhalt.text };
  }
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: inhalt.mimeTyp as "image/jpeg" | "image/png" | "image/webp",
      data: inhalt.base64,
    },
  };
}
