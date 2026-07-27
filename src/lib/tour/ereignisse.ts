"use client";

/**
 * Meldungen der Oberfläche an die Tour.
 *
 * Bewusst über ein Browser-Ereignis statt über React-Kontext: Die Tour muss
 * Dinge mitbekommen, die tief im Chat oder im Freigabe-Center passieren.
 * Alles dorthin durchzureichen würde jede Komponente über die Tour Bescheid
 * wissen lassen – so weiß keine etwas davon und ruft nur eine Zeile auf.
 *
 * WARUM MELDUNGEN NACHGEREICHT WERDEN
 *
 * Eine Station schließt sich auch dadurch ab, dass eine Seite geöffnet wird
 * (siehe TourMelder). Beim Seitenwechsel meldet diese Seite ihr Ereignis in
 * einem Effekt – und Kindeffekte laufen vor Elterneffekten. Hängt die Tour
 * in derselben Runde ihren Zuhörer neu an, fällt genau das Ereignis in die
 * Lücke, das die Station beenden sollte: Die Tour bleibt auf "öffnen Sie Ihre
 * Meldung" stehen, obwohl die Meldung offen vor einem liegt. Wer neu zuhört,
 * bekommt deshalb eine gerade eben abgesetzte Meldung nachgereicht.
 *
 * Damit dabei nichts doppelt verarbeitet wird, trägt jede Meldung eine
 * laufende Nummer; der Empfänger sieht daran, was er schon hatte.
 */

const EREIGNIS = "melda:tour";

/** Wie alt eine Meldung höchstens sein darf, um nachgereicht zu werden. */
const NACHREICHFRIST_MS = 3000;

type Meldung = { nr: number; was: string; zeit: number };

let laufend = 0;
let letzte: Meldung | null = null;

/** Meldet der Tour, dass etwas passiert ist. Ohne laufende Tour wirkungslos. */
export function tourMelden(was: string): void {
  if (typeof window === "undefined") return;
  laufend += 1;
  letzte = { nr: laufend, was, zeit: Date.now() };
  window.dispatchEvent(new CustomEvent<Meldung>(EREIGNIS, { detail: letzte }));
}

export function aufTourEreignis(
  zuhoerer: (was: string, nr: number) => void,
): () => void {
  const handler = (e: Event) => {
    const meldung = (e as CustomEvent<Meldung>).detail;
    zuhoerer(meldung.was, meldung.nr);
  };
  window.addEventListener(EREIGNIS, handler);

  if (letzte && Date.now() - letzte.zeit < NACHREICHFRIST_MS) {
    const nachzureichen = letzte;
    queueMicrotask(() => zuhoerer(nachzureichen.was, nachzureichen.nr));
  }

  return () => window.removeEventListener(EREIGNIS, handler);
}
