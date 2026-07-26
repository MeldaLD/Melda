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

export function useChat(umgebung: Umgebung, slug: string) {
  const [zustand, setZustand] = useState<ChatZustand>(anfangszustand);
  const [tippt, setTippt] = useState(false);
  const [beschaeftigt, setBeschaeftigt] = useState(false);

  // Der Zustand wird auch außerhalb von React-Renderzyklen gebraucht,
  // wenn die Warteschlange abgearbeitet wird.
  const zustandRef = useRef(zustand);
  zustandRef.current = zustand;

  const zeitgeber = useRef<ReturnType<typeof setTimeout>[]>([]);
  const gestartet = useRef(false);
  // Der Vorgang wird genau einmal je Meldung gespeichert.
  const gespeichert = useRef(false);

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

      // Sobald die Meldung weitergeleitet ist, entsteht daraus ein echter
      // Vorgang in der Datenbank – der taucht dann live im Dashboard auf.
      if (
        !gespeichert.current &&
        ergebnis.zustand.status === "an_handwerker" &&
        ergebnis.zustand.szenarioId
      ) {
        gespeichert.current = true;
        void vorgangSpeichern(
          slug,
          ergebnis.zustand,
          zustandRef.current.nachrichten,
        ).then((nummer) => {
          if (nummer !== null) setZustand((alt) => ({ ...alt, nummer }));
        });
      }
    },
    [alsGelesenMarkieren, anhaengen, beschaeftigt, umgebung, slug],
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

/**
 * Legt den Vorgang serverseitig an.
 *
 * Schlägt das fehl – keine Datenbank konfiguriert, Projekt pausiert, kein
 * Netz – läuft der Chat unverändert weiter. Eine Vorführung darf nicht daran
 * scheitern, dass im Hintergrund etwas nicht gespeichert werden konnte.
 */
async function vorgangSpeichern(
  slug: string,
  zustand: ChatZustand,
  nachrichten: ChatNachricht[],
): Promise<number | null> {
  try {
    const antwort = await fetch("/api/chat/vorgang", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        szenarioId: zustand.szenarioId,
        zweitanfahrtVermieden: zustand.zweitanfahrtVermieden,
        nachrichten: nachrichten.map((n) => ({
          von: n.von,
          text: n.text,
          foto: n.foto,
          gesendetAm: n.zeit,
        })),
      }),
    });

    const ergebnis = await antwort.json();
    return ergebnis?.gespeichert ? (ergebnis.nummer ?? null) : null;
  } catch {
    return null;
  }
}
