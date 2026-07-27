"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { demoKonfiguration } from "@config/demo";
import { szenarien, szenarioAusText } from "@config/scenarios";
import { anfangszustand, schritt, type Umgebung } from "./maschine";
import type {
  ChatEreignis,
  ChatNachricht,
  ChatZustand,
  KiAufruf,
  Meldung,
  Rueckrufwunsch,
  Taetigkeit,
  Terminfenster,
} from "./typen";

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
  const [taetigkeit, setTaetigkeit] = useState<Taetigkeit>("nichts");
  const [beschaeftigt, setBeschaeftigt] = useState(false);

  // Der Zustand wird auch außerhalb von React-Renderzyklen gebraucht,
  // wenn die Warteschlange abgearbeitet wird.
  const zustandRef = useRef(zustand);
  zustandRef.current = zustand;

  const zeitgeber = useRef<ReturnType<typeof setTimeout>[]>([]);
  const gestartet = useRef(false);
  /** Verlässlicher als der Zustand: Der Wert im Ref ist sofort aktuell. */
  const beschaeftigtRef = useRef(false);
  /** Eingaben, die während einer laufenden Antwort ankamen. */
  const warteschlange = useRef<[ChatEreignis, Partial<ChatNachricht> | undefined][]>(
    [],
  );
  /**
   * Meldungs-ID -> laufende oder abgeschlossene Speicherung.
   *
   * Bewusst die Zusage und nicht das Ergebnis: Wer gleich nach dem Absenden
   * ein Terminfenster antippt, wäre sonst schneller als die Datenbank und
   * hinge ohne Vorgangs-ID in der Luft. So wartet der Termin einfach ab.
   */
  const gespeicherte = useRef(new Map<string, Promise<Speicherung | null>>());

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
      // Während der Assistent antwortet, wird nichts angenommen. Früher wurde
      // die Eingabe hier stillschweigend verworfen – der Mieter tippte etwas,
      // das Eingabefeld leerte sich, und nichts geschah. Jetzt wandert sie in
      // eine Warteschlange und wird direkt danach abgearbeitet.
      if (beschaeftigtRef.current) {
        warteschlange.current.push([ereignis, eigeneNachricht]);
        return;
      }
      beschaeftigtRef.current = true;
      setBeschaeftigt(true);

      // Erst die Nachricht des Mieters anzeigen, dann reagieren.
      // Eine Blase ohne jeden Inhalt wird gar nicht erst erzeugt.
      if (eigeneNachricht && (eigeneNachricht.text || eigeneNachricht.foto)) {
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

      // Freitext, den die Stichwortsuche nicht einordnen kann, geht ans
      // Modell. Erst dann, und nie vorher: Die klaren Fälle trifft die Suche
      // im Browser sofort und umsonst, und ein Modell zu fragen, was
      // "Heizung kalt" bedeutet, wäre Geld für eine Antwort, die wir haben.
      let angereichert = ereignis;
      let aufruf: KiAufruf | undefined;

      // Erstes Foto: Wenn eine Bilddatei existiert und die Bildauswertung
      // eingeschaltet ist, sieht sich ein Modell das Bild wirklich an. Sonst
      // gilt der hinterlegte Text der Kachel.
      if (
        ereignis.art === "foto" &&
        (zustandRef.current.phase === "eingabe" ||
          zustandRef.current.phase === "begruessung")
      ) {
        const szenarioId = szenarioZuFoto(ereignis.datei);
        if (szenarioId) {
          setTaetigkeit("auswerten");
          const gesehen = await bildDeuten(ereignis.datei, szenarioId);
          setTaetigkeit("nichts");
          if (gesehen) {
            angereichert = {
              ...ereignis,
              diagnose: {
                text: gesehen.erkennung,
                brauchtZweitfoto: gesehen.brauchtZweitfoto,
              },
            };
            aufruf = gesehen.aufruf;
          }
        }
      }

      if (istOffenerFreitext(zustandRef.current, ereignis)) {
        setTaetigkeit("tippen");
        const verstanden = await freitextDeuten(ereignis.text);
        setTaetigkeit("nichts");
        if (verstanden) {
          angereichert = {
            ...ereignis,
            szenarioId: verstanden.szenarioId ?? undefined,
            anliegenId: verstanden.anliegenId ?? undefined,
          };
          aufruf = verstanden.aufruf;
        }
      }

      const ergebnis = schritt(zustandRef.current, angereichert, umgebung);

      // Angebot sofort entfernen, damit während der Antwort nichts anklickbar
      // ist, was gleich nicht mehr gilt.
      setZustand((alt) => ({ ...alt, angebot: { art: "keins" } }));

      for (const [index, ausgabe] of ergebnis.ausgabe.entries()) {
        if (index > 0) await warten(demoKonfiguration.chat.pauseZwischenNachrichten);
        setTaetigkeit(ausgabe.taetigkeit ?? "tippen");
        await warten(ausgabe.tippdauer);
        setTaetigkeit("nichts");
        anhaengen({
          id: neueId(),
          von: "ki",
          zeit: jetztIso(),
          ...ausgabe.nachricht,
          // Der Aufruf gehört an die erste Antwort, die aus ihm entstanden
          // ist. In der Technikansicht steht dort dann nicht "hier arbeitet
          // später ein Modell", sondern was eines gerade getan hat.
          ...(index === 0 && aufruf ? { kiAufruf: aufruf } : {}),
        });
      }

      // Zustand der Maschine übernehmen, aber den angezeigten Verlauf behalten.
      setZustand((alt) => ({ ...ergebnis.zustand, nachrichten: alt.nachrichten }));
      beschaeftigtRef.current = false;
      setBeschaeftigt(false);

      // Sobald eine Meldung durch ist, entsteht daraus ein echter Vorgang in
      // der Datenbank – der taucht dann live im Dashboard auf.
      const fertige = ergebnis.zustand.meldungen.find(
        (m) =>
          !gespeicherte.current.has(m.id) &&
          (m.status === "in_pruefung" ||
            m.status === "an_handwerker" ||
            // Selbst behobene Faelle werden ebenfalls angelegt - die
            // Verwaltung soll sehen, was der Tipp erspart hat.
            m.status === "erledigt"),
      );

      if (fertige) {
        const laeuft = vorgangSpeichern(
          slug,
          einheitId,
          fertige,
          ergebnis.zustand,
          zustandRef.current.nachrichten,
        );
        gespeicherte.current.set(fertige.id, laeuft);

        void laeuft.then((gespeichert) => {
          if (!gespeichert) return;
          setZustand((alt) => ({
            ...alt,
            meldungen: alt.meldungen.map((m) =>
              m.id === fertige.id
                ? { ...m, nummer: gespeichert.nummer, vorgangId: gespeichert.vorgangId }
                : m,
            ),
          }));
        });
      }

      // Erreichbarkeit und Rückruf hängen nicht am Abschluss einer Meldung,
      // sondern an der Wahl des Mieters – deshalb hier und nicht oben.
      if (ereignis.art === "erreichbarkeit") {
        void erreichbarkeitSpeichern(
          slug,
          ergebnis.zustand.meldungen[ergebnis.zustand.meldungen.length - 1],
          ereignis.zeitwunschId,
          gespeicherte.current,
        );
      }

      if (ereignis.art === "rueckrufZeit" && ergebnis.zustand.rueckruf?.zeitwunschId) {
        void rueckrufSpeichern(slug, einheitId, ergebnis.zustand.rueckruf);
      }

      if (ereignis.art === "terminauswahl") {
        void terminauswahlSenden(ereignis.token, ereignis.index);
      }

      // Was während der Antwort hereinkam, jetzt abarbeiten.
      const naechste = warteschlange.current.shift();
      if (naechste) {
        await warten(120);
        void ausloesenRef.current?.(naechste[0], naechste[1]);
      }
    },
    [alsGelesenMarkieren, anhaengen, umgebung, slug, einheitId],
  );

  // Selbstbezug für die Warteschlange – useCallback kann sich nicht direkt
  // selbst aufrufen, ohne in seine eigene Abhängigkeitsliste zu geraten.
  const ausloesenRef = useRef<typeof ausloesen>(null);
  ausloesenRef.current = ausloesen;

  /** Begrüßung einmalig beim Öffnen. */
  useEffect(() => {
    if (gestartet.current) return;
    gestartet.current = true;
    void ausloesen({ art: "start" });
    // Absicht: nur beim ersten Rendern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { zustand, taetigkeit, beschaeftigt, ausloesen };
}

// ---------------------------------------------------------------------------

/**
 * Ob dieser Freitext überhaupt eine Zuordnung braucht.
 *
 * Nur in den beiden Phasen, in denen eine Meldung entstehen kann, und nur
 * wenn die Stichwortsuche nichts findet. Alles andere – "Status", "Rückruf",
 * eine Antwort mitten im Ablauf – ist bereits eindeutig und geht niemanden
 * sonst etwas an.
 */
function istOffenerFreitext(
  zustand: ChatZustand,
  ereignis: ChatEreignis,
): ereignis is { art: "text"; text: string } {
  if (ereignis.art !== "text") return false;
  if (zustand.phase !== "eingabe" && zustand.phase !== "anliegen") return false;
  const text = ereignis.text.trim();
  if (text.length < 3) return false;
  if (/^status\b/i.test(text) || /r(ü|ue)ckruf/i.test(text)) return false;
  return !szenarioAusText(text);
}

/**
 * Fragt den Server, was der Mieter gemeint hat.
 *
 * Scheitert der Aufruf – kein Schlüssel, kein Netz, Modell unsicher –, kommt
 * null zurück und der Chat antwortet wie bisher mit der Nachfrage aus
 * config/chat-rahmen.ts. Eine Vorführung darf nicht daran scheitern, dass
 * eine Schnittstelle klemmt.
 */
async function freitextDeuten(text: string): Promise<{
  szenarioId: string | null;
  anliegenId: string | null;
  aufruf: KiAufruf;
} | null> {
  try {
    const antwort = await fetch("/api/ki/verstehen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const ergebnis = await antwort.json();
    const verstanden = ergebnis?.verstanden;
    if (!verstanden) return null;

    return {
      szenarioId: verstanden.szenarioId ?? null,
      anliegenId: verstanden.anliegenId ?? null,
      aufruf: {
        modell: verstanden.modell,
        dauerMs: verstanden.dauerMs,
        eingabeToken: verstanden.eingabeToken,
        ausgabeToken: verstanden.ausgabeToken,
        geschwaerzt: verstanden.geschwaerzt ?? [],
      },
    };
  } catch {
    return null;
  }
}

/** Zu welcher Meldung eine Fotokachel gehört. */
function szenarioZuFoto(datei: string): string | undefined {
  return szenarien.find((s) => s.foto === datei)?.id;
}

/**
 * Lässt das Bild auswerten.
 *
 * Gibt null zurück, sobald irgendetwas nicht passt – kein Schlüssel, keine
 * Bilddatei, Modell unsicher, Antwort außerhalb der Grenzen. Dann bleibt es
 * beim hinterlegten Text, und im Chat sieht es aus wie immer.
 */
async function bildDeuten(
  datei: string,
  szenarioId: string,
): Promise<{ erkennung: string; brauchtZweitfoto: boolean; aufruf: KiAufruf } | null> {
  try {
    const antwort = await fetch("/api/ki/sehen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datei, szenarioId }),
    });
    const gesehen = (await antwort.json())?.gesehen;
    if (!gesehen) return null;

    return {
      erkennung: gesehen.erkennung,
      brauchtZweitfoto: gesehen.brauchtZweitfoto === true,
      aufruf: {
        modell: gesehen.modell,
        dauerMs: gesehen.dauerMs,
        eingabeToken: gesehen.eingabeToken,
        ausgabeToken: gesehen.ausgabeToken,
        // Ein Bild wird nicht geschwärzt – es geht ganz oder gar nicht.
        geschwaerzt: [],
      },
    };
  } catch {
    return null;
  }
}

type Speicherung = { nummer: number | null; vorgangId: string | null };

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
  zustand: ChatZustand,
  nachrichten: ChatNachricht[],
): Promise<Speicherung | null> {
  try {
    const antwort = await fetch("/api/chat/vorgang", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        einheitId,
        szenarioId: meldung.szenarioId,
        zweitanfahrtVermieden: zustand.zweitanfahrtVermieden,
        selbsthilfeAngeboten: zustand.selbsthilfeAngeboten,
        selbsthilfeErfolgreich: meldung.status === "erledigt",
        nachrichten: nachrichten.map((n) => ({
          von: n.von,
          text: n.text,
          foto: n.foto,
          gesendetAm: n.zeit,
        })),
      }),
    });

    const ergebnis = await antwort.json();
    if (!ergebnis?.gespeichert) return null;
    return {
      nummer: ergebnis.nummer ?? null,
      vorgangId: ergebnis.vorgangId ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Hält fest, wann der Mieter erreichbar ist.
 *
 * Kein Termin: Die Zeitfenster nennt später der Betrieb. Diese Angabe geht
 * mit der Anfrage an ihn raus, damit er Fenster vorschlägt, die überhaupt
 * passen können.
 *
 * Wartet ab, bis der Vorgang selbst angelegt ist – vorher gibt es nichts,
 * woran die Angabe hängen könnte.
 */
async function erreichbarkeitSpeichern(
  slug: string,
  meldung: Meldung | undefined,
  zeitwunschId: string,
  gespeicherte: Map<string, Promise<Speicherung | null>>,
): Promise<void> {
  if (!meldung) return;

  try {
    const vorgang = await gespeicherte.get(meldung.id);
    if (!vorgang?.vorgangId) return;

    await fetch("/api/chat/erreichbarkeit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, vorgangId: vorgang.vorgangId, zeitwunschId }),
    });
  } catch {
    // Bewusst still: Der Mieter hat seine Bestätigung schon gesehen.
  }
}

/** Macht aus zwei Zeitstempeln die Beschriftung, die im Chat steht. */
function beschriften(v: { beginn: string; ende: string }): Terminfenster {
  const tag = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Berlin",
  }).format(new Date(v.beginn));
  const zeit = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  return {
    beschriftung: `${tag}, ${zeit.format(new Date(v.beginn))}–${zeit.format(new Date(v.ende))} Uhr`,
    beginn: v.beginn,
    ende: v.ende,
  };
}

/**
 * Meldet die Wahl des Mieters zurück.
 *
 * Daraus entsteht serverseitig die Terminbestätigung im Freigabe-Center –
 * verbindlich wird der Termin erst mit der Freigabe der Verwaltung.
 */
async function terminauswahlSenden(token: string, index: number): Promise<void> {
  try {
    await fetch("/api/chat/terminauswahl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, index }),
    });
  } catch {
    // Der Mieter hat seine Bestätigung schon gesehen.
  }
}

/** Legt den Rückrufwunsch an. Hängt an keinem Vorgang, nur an der Wohnung. */
async function rueckrufSpeichern(
  slug: string,
  einheitId: string | null,
  rueckruf: Partial<Rueckrufwunsch>,
): Promise<void> {
  if (!rueckruf.grundId || !rueckruf.zeitwunschId) return;

  try {
    await fetch("/api/chat/rueckruf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        einheitId,
        grundId: rueckruf.grundId,
        zeitwunschId: rueckruf.zeitwunschId,
      }),
    });
  } catch {
    // Siehe oben.
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
      {
        status: Meldung["status"];
        schritte: { was: string; zeit: string }[];
        terminauswahl?: {
          token: string;
          vorschlaege: { beginn: string; ende: string }[];
        };
      }
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
        terminauswahl: frisch.terminauswahl
          ? {
              token: frisch.terminauswahl.token,
              vorschlaege: frisch.terminauswahl.vorschlaege.map(beschriften),
            }
          : null,
      };
    });
  } catch {
    return null;
  }
}
