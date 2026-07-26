"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { demoKonfiguration } from "@config/demo";
import { anfangszustand, schritt, type Umgebung } from "./maschine";
import type { ChatEreignis, ChatNachricht, ChatZustand, Meldung } from "./typen";

/**
 * Spielt die Zustandsmaschine mit menschlich wirkenden Pausen ab und hält die
 * Meldungen mit der Datenbank im Gleichklang.
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

export function useChat(umgebung: Umgebung, slug: string, einheitId: string | null) {
  const [zustand, setZustand] = useState<ChatZustand>(anfangszustand);
  const [tippt, setTippt] = useState(false);
  const [beschaeftigt, setBeschaeftigt] = useState(false);

  // Der Zustand wird auch außerhalb von React-Renderzyklen gebraucht,
  // wenn die Warteschlange abgearbeitet wird.
  const zustandRef = useRef(zustand);
  zustandRef.current = zustand;

  const zeitgeber = useRef<ReturnType<typeof setTimeout>[]>([]);
  const gestartet = useRef(false);
  /** Meldungs-IDs, die bereits in der Datenbank angelegt wurden. */
  const gespeicherte = useRef(new Set<string>());

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

      // Vor einer Statusabfrage den echten Stand holen. Gibt die Verwaltung
      // im Dashboard einen Auftrag frei, sieht der Mieter das hier – ohne
      // diesen Abgleich zeigte der Chat einen veralteten Stand.
      if (ereignis.art === "status") {
        const frisch = await statusAbgleichen(zustandRef.current.meldungen);
        if (frisch) setZustand((alt) => ({ ...alt, meldungen: frisch }));
        await warten(50);
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

      // Sobald eine Meldung durch ist, entsteht daraus ein echter Vorgang in
      // der Datenbank – der taucht dann live im Dashboard auf.
      const fertige = ergebnis.zustand.meldungen.find(
        (m) =>
          !gespeicherte.current.has(m.id) &&
          (m.status === "in_pruefung" || m.status === "an_handwerker"),
      );

      if (fertige) {
        gespeicherte.current.add(fertige.id);
        void vorgangSpeichern(
          slug,
          einheitId,
          fertige,
          ergebnis.zustand.zweitanfahrtVermieden,
          zustandRef.current.nachrichten,
        ).then((nummer) => {
          if (nummer === null) return;
          setZustand((alt) => ({
            ...alt,
            meldungen: alt.meldungen.map((m) =>
              m.id === fertige.id ? { ...m, nummer } : m,
            ),
          }));
        });
      }
    },
    [alsGelesenMarkieren, anhaengen, beschaeftigt, umgebung, slug, einheitId],
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

// ---------------------------------------------------------------------------

/**
 * Legt den Vorgang serverseitig an.
 *
 * Schlägt das fehl – keine Datenbank konfiguriert, Projekt pausiert, kein
 * Netz – läuft der Chat unverändert weiter. Eine Vorführung darf nicht daran
 * scheitern, dass im Hintergrund etwas nicht gespeichert werden konnte.
 */
async function vorgangSpeichern(
  slug: string,
  einheitId: string | null,
  meldung: Meldung,
  zweitanfahrtVermieden: boolean,
  nachrichten: ChatNachricht[],
): Promise<number | null> {
  try {
    const antwort = await fetch("/api/chat/vorgang", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        einheitId,
        szenarioId: meldung.szenarioId,
        zweitanfahrtVermieden,
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

/**
 * Holt den aktuellen Stand aller gespeicherten Meldungen.
 * Gibt null zurück, wenn es nichts abzugleichen gibt oder der Abruf scheitert.
 */
async function statusAbgleichen(meldungen: Meldung[]): Promise<Meldung[] | null> {
  const nummern = meldungen.map((m) => m.nummer).filter((n): n is number => n !== null);
  if (!nummern.length) return null;

  try {
    const antwort = await fetch(`/api/chat/status?nummern=${nummern.join(",")}`);
    const ergebnis = await antwort.json();
    if (!ergebnis?.staende) return null;

    const staende = ergebnis.staende as Record<
      string,
      { status: Meldung["status"]; schritte: { was: string; zeit: string }[] }
    >;

    return meldungen.map((meldung) => {
      const frisch =
        meldung.nummer !== null ? staende[String(meldung.nummer)] : undefined;
      if (!frisch) return meldung;
      return {
        ...meldung,
        status: frisch.status,
        // Die Historie aus der Datenbank ist die verlässlichere Quelle,
        // weil dort auch steht, was die Verwaltung getan hat.
        schritte: frisch.schritte.length ? frisch.schritte : meldung.schritte,
      };
    });
  } catch {
    return null;
  }
}
