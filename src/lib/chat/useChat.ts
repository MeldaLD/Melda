"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { demoKonfiguration } from "@config/demo";
import { anfangszustand, schritt, type Umgebung } from "./maschine";
import type { ChatEreignis, ChatNachricht, ChatZustand } from "./typen";

/**
 * Spielt die Zustandsmaschine mit menschlich wirkenden Pausen ab.
 *
 * Die Maschine liefert die Antworten sofort. Dieser Hook gibt sie nacheinander
 * aus, mit "tippt gerade…" davor – ohne diese Verzögerung wirkt der Chat wie
 * ein Formular, nicht wie ein Gespräch.
 */

let zaehler = 0;
function neueId(): string {
  return `n${++zaehler}`;
}

function jetztIso(): string {
  return new Date().toISOString();
}

export function useChat(umgebung: Umgebung) {
  const [zustand, setZustand] = useState<ChatZustand>(anfangszustand);
  const [tippt, setTippt] = useState(false);
  const [beschaeftigt, setBeschaeftigt] = useState(false);

  // Der Zustand wird auch außerhalb von React-Renderzyklen gebraucht,
  // wenn die Warteschlange abgearbeitet wird.
  const zustandRef = useRef(zustand);
  zustandRef.current = zustand;

  const zeitgeber = useRef<ReturnType<typeof setTimeout>[]>([]);
  const gestartet = useRef(false);

  useEffect(() => {
    const laufende = zeitgeber.current;
    return () => laufende.forEach(clearTimeout);
  }, []);

  const warten = (ms: number) =>
    new Promise<void>((fertig) => {
      const id = setTimeout(fertig, ms);
      zeitgeber.current.push(id);
    });

  const anhaengen = useCallback((nachricht: ChatNachricht) => {
    setZustand((alt) => ({ ...alt, nachrichten: [...alt.nachrichten, nachricht] }));
  }, []);

  /** Markiert die letzte Mieternachricht als gelesen – die blauen Haken. */
  const alsGelesenMarkieren = useCallback(() => {
    setZustand((alt) => ({
      ...alt,
      nachrichten: alt.nachrichten.map((n) =>
        n.von === "mieter" ? { ...n, gelesen: true } : n,
      ),
    }));
  }, []);

  const ausloesen = useCallback(
    async (ereignis: ChatEreignis, eigeneNachricht?: Partial<ChatNachricht>) => {
      if (beschaeftigt) return;
      setBeschaeftigt(true);

      // Erst die Nachricht des Mieters anzeigen, dann reagieren.
      if (eigeneNachricht) {
        anhaengen({
          id: neueId(),
          von: "mieter",
          zeit: jetztIso(),
          gelesen: false,
          ...eigeneNachricht,
        });
        await warten(350);
        alsGelesenMarkieren();
      }

      const ergebnis = schritt(zustandRef.current, ereignis, umgebung);

      // Angebot sofort entfernen, damit während der Antwort nichts anklickbar
      // ist, was gleich nicht mehr gilt.
      setZustand((alt) => ({ ...alt, angebot: { art: "keins" } }));

      for (const [index, ausgabe] of ergebnis.ausgabe.entries()) {
        if (index > 0) await warten(demoKonfiguration.chat.pauseZwischenNachrichten);
        setTippt(true);
        await warten(ausgabe.tippdauer);
        setTippt(false);
        anhaengen({
          id: neueId(),
          von: "ki",
          zeit: jetztIso(),
          ...ausgabe.nachricht,
        });
      }

      // Zustand der Maschine übernehmen, aber den angezeigten Verlauf behalten.
      setZustand((alt) => ({ ...ergebnis.zustand, nachrichten: alt.nachrichten }));
      setBeschaeftigt(false);
    },
    [alsGelesenMarkieren, anhaengen, beschaeftigt, umgebung],
  );

  /** Begrüßung einmalig beim Öffnen. */
  useEffect(() => {
    if (gestartet.current) return;
    gestartet.current = true;
    void ausloesen({ art: "start" });
    // Absicht: nur beim ersten Rendern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { zustand, tippt, beschaeftigt, ausloesen };
}
