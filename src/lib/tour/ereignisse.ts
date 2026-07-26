"use client";

/**
 * Meldungen der Oberfläche an die Tour.
 *
 * Bewusst über ein Browser-Ereignis statt über React-Kontext: Die Tour muss
 * Dinge mitbekommen, die tief im Chat oder im Freigabe-Center passieren.
 * Alles dorthin durchzureichen würde jede Komponente über die Tour Bescheid
 * wissen lassen – so weiß keine etwas davon und ruft nur eine Zeile auf.
 */

const EREIGNIS = "melda:tour";

/** Meldet der Tour, dass etwas passiert ist. Ohne laufende Tour wirkungslos. */
export function tourMelden(was: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EREIGNIS, { detail: was }));
}

export function aufTourEreignis(zuhoerer: (was: string) => void): () => void {
  const handler = (e: Event) => zuhoerer((e as CustomEvent<string>).detail);
  window.addEventListener(EREIGNIS, handler);
  return () => window.removeEventListener(EREIGNIS, handler);
}
