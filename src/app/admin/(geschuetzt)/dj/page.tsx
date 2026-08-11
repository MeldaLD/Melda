"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type Zustand = "wartet" | "misst" | "laedt" | "fertig" | "fehler";

type Eintrag = {
  datei: File;
  titel: string;
  interpret: string;
  zustand: Zustand;
  schritt: string;
  befund?: Befund;
  meldung?: string;
};

type Befund = {
  dauer: number;
  bpm: number;
  raster: number;
  einstiegBeat: number;
  lufs: number;
  angleichDb: number;
  energie: number;
  marken: { name: string; beat: number; sekunde: number }[];
};

type Vorhanden = { id: string; titel: string; interpret: string; bpm: number | null };

/**
 * Musik aufnehmen: Datei aussuchen, im Browser vermessen, hochladen.
 *
 * Die Messung läuft hier und nicht auf dem Server – ein Track ist schnell
 * achtzig Megabyte an Abtastwerten, und die durch eine Serverfunktion zu
 * schieben wäre langsam und teuer. Der Browser hat mit Web Audio ohnehin alles
 * an Bord, was dafür nötig ist.
 */
export default function DjAufnahme() {
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const [bibliothek, setBibliothek] = useState<Vorhanden[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const auswahl = useRef<HTMLInputElement>(null);

  const bibliothekLaden = useCallback(async () => {
    try {
      const antwort = await fetch("/api/dj/track", { cache: "no-store" });
      const daten = await alsJson(antwort);
      if (!antwort.ok) {
        throw new Error(hinweisZu(antwort.status, daten.fehler ?? daten.roh ?? ""));
      }
      setBibliothek(daten.tracks ?? []);
      setFehler(null);
    } catch (grund) {
      setFehler(grund instanceof Error ? grund.message : String(grund));
    }
  }, []);

  useEffect(() => {
    void bibliothekLaden();
  }, [bibliothekLaden]);

  // Weil das Dateifeld absichtlich alles anbietet (siehe unten), wird hier
  // geprüft statt im Dialog. Ein Video oder ein PDF soll nicht erst beim
  // Dekodieren mit einer kryptischen Meldung auffallen.
  const HOERBAR = /\.(mp3|m4a|mp4|aac|wav|aiff?|flac|ogg|oga|opus|webm|caf)$/i;

  function dateienGewaehlt(liste: FileList | null) {
    if (!liste || liste.length === 0) return;

    const alle = Array.from(liste);
    const tauglich = alle.filter(
      (datei) => HOERBAR.test(datei.name) || datei.type.startsWith("audio/"),
    );
    const abgelehnt = alle.filter((datei) => !tauglich.includes(datei));

    setFehler(
      abgelehnt.length > 0
        ? `Übersprungen, weil keine Audiodatei: ${abgelehnt.map((d) => d.name).join(", ")}`
        : null,
    );

    if (tauglich.length === 0) return;

    setEintraege((bisher) => [
      ...bisher,
      ...tauglich.map((datei) => ({
        datei,
        ...ausDateiname(datei.name),
        zustand: "wartet" as Zustand,
        schritt: "",
      })),
    ]);

    // Damit dieselbe Datei nach einem Fehlversuch nochmal gewählt werden kann:
    // ohne das Zurücksetzen feuert `change` beim zweiten Mal nicht.
    if (auswahl.current) auswahl.current.value = "";
  }

  const aendern = (nummer: number, teil: Partial<Eintrag>) =>
    setEintraege((bisher) =>
      bisher.map((eintrag, i) => (i === nummer ? { ...eintrag, ...teil } : eintrag)),
    );

  async function alleVerarbeiten() {
    setLaeuft(true);
    setFehler(null);

    // Die Analyse wird zur Laufzeit geladen, nicht mitgebaut: Sie gehört zum
    // DJ unter dj/ und soll genau dieselbe Datei sein, die auch die Bühne
    // benutzt – sonst driften Messung und Wiedergabe auseinander.
    const pfad = "/dj/gemeinsam/analyse.js";
    const { analysiere } = await import(/* webpackIgnore: true */ pfad);

    const ctx = new (window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();

    for (const [nummer, eintrag] of eintraege.entries()) {
      if (eintrag.zustand === "fertig") continue;
      try {
        aendern(nummer, { zustand: "misst", schritt: "Datei lesen", meldung: undefined });
        const roh = await eintrag.datei.arrayBuffer();

        aendern(nummer, { schritt: "Dekodieren" });
        // decodeAudioData verbraucht den Puffer – deshalb eine Kopie für den
        // Upload zurückhalten.
        const puffer = await ctx.decodeAudioData(roh.slice(0));

        const befund: Befund = await analysiere(puffer, (schritt: string) =>
          aendern(nummer, { schritt }),
        );
        aendern(nummer, { befund, zustand: "laedt", schritt: "Hochladen" });

        const erlaubnis = await fetch("/api/dj/hochladen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dateiname: eintrag.datei.name }),
        });
        const erlaubt = await alsJson(erlaubnis);
        if (!erlaubnis.ok) {
          throw new Error(hinweisZu(erlaubnis.status, erlaubt.fehler ?? erlaubt.roh ?? ""));
        }

        if (!erlaubt.adresse || !erlaubt.pfad) {
          throw new Error("Der Server hat keine Adresse zum Hochladen geliefert.");
        }

        const hochgeladen = await fetch(erlaubt.adresse, {
          method: "PUT",
          headers: { "Content-Type": eintrag.datei.type || "audio/mpeg" },
          body: eintrag.datei,
        });
        if (!hochgeladen.ok) throw new Error(`Hochladen fehlgeschlagen (${hochgeladen.status}).`);

        aendern(nummer, { schritt: "Eintragen" });
        const eingetragen = await fetch("/api/dj/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titel: eintrag.titel,
            interpret: eintrag.interpret,
            datei: erlaubt.pfad,
            ...befund,
          }),
        });
        const ergebnis = await alsJson(eingetragen);
        if (!eingetragen.ok) {
          throw new Error(hinweisZu(eingetragen.status, ergebnis.fehler ?? ergebnis.roh ?? ""));
        }

        aendern(nummer, { zustand: "fertig", schritt: "" });
      } catch (grund) {
        aendern(nummer, {
          zustand: "fehler",
          schritt: "",
          meldung: grund instanceof Error ? grund.message : String(grund),
        });
      }
    }

    // Energie ist ein Rang innerhalb der Sammlung, kein absoluter Wert. Kommen
    // Tracks dazu, verschiebt sich der Rang aller anderen.
    await fetch("/api/dj/track", { method: "PATCH" });
    await bibliothekLaden();
    void ctx.close();
    setLaeuft(false);
  }

  const offen = eintraege.filter((e) => e.zustand !== "fertig").length;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Musik für den DJ</h1>
        <p className="text-sm text-muted-foreground">
          Dateien aussuchen, der Browser vermisst sie und lädt sie hoch. Tempo,
          Beatraster, Lautheit und Aufbau werden dabei bestimmt – ohne diese Werte
          kann der DJ nicht mischen.
        </p>
      </header>

      {fehler && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{fehler}</p>
      )}

      <section className="space-y-3">
        {/*
          Zwei Dinge sind hier bewusst so und nicht anders, beide wegen iOS:

          1. Ein echtes <label> statt eines Knopfes, der das Feld per
             JavaScript anklickt. Safari auf dem iPad blockiert einen
             programmatischen Klick auf ein Dateifeld – der Knopf tut dann
             einfach nichts, und es sieht aus, als wäre die Seite kaputt.
          2. Kein `accept`. Eine Liste aus MIME-Typen und Endungen kann iOS
             nicht zuverlässig zuordnen und graut dann im Dateien-Dialog alles
             aus. Lieber alles anbieten und hinterher prüfen.
        */}
        <input
          ref={auswahl}
          id="dj-dateien"
          type="file"
          multiple
          onChange={(e) => dateienGewaehlt(e.target.files)}
          className="sr-only"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="dj-dateien"
            className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 aria-disabled:pointer-events-none aria-disabled:opacity-50"
            aria-disabled={laeuft}
          >
            Dateien auswählen
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={alleVerarbeiten}
            disabled={laeuft || offen === 0}
          >
            {laeuft ? "Läuft …" : `${offen} vermessen und hochladen`}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Auf dem iPad kommen die Dateien aus „Dateien“ oder iCloud. Mehrere auf
          einmal gehen. Das Vermessen dauert je Track ein paar Sekunden – das
          Fenster muss dabei offen bleiben.
        </p>
      </section>

      {eintraege.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Warteschlange</h2>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {eintraege.map((eintrag, nummer) => (
              <li key={`${eintrag.datei.name}-${nummer}`} className="space-y-1 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">
                    {eintrag.interpret} – {eintrag.titel}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {beschriftung(eintrag)}
                  </span>
                </div>
                {eintrag.befund && (
                  <p className="text-xs text-muted-foreground">
                    {eintrag.befund.bpm} BPM · Raster {eintrag.befund.raster.toFixed(3)} s ·{" "}
                    {eintrag.befund.lufs} LUFS → Angleich{" "}
                    {eintrag.befund.angleichDb > 0 ? "+" : ""}
                    {eintrag.befund.angleichDb} dB · Einstieg Beat{" "}
                    {eintrag.befund.einstiegBeat} ·{" "}
                    {eintrag.befund.marken.filter((m) => m.name === "drop").length} Drop(s)
                  </p>
                )}
                {eintrag.meldung && (
                  <p className="text-xs text-red-700">{eintrag.meldung}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          In der Bibliothek: {bibliothek.length}{" "}
          {bibliothek.length === 1 ? "Track" : "Tracks"}
        </h2>
        {bibliothek.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch leer. Solange hier nichts steht, spielt die Bühne unter{" "}
            <code>/dj</code> nur den Prüfstand.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {bibliothek.map((track) => (
              <li key={track.id} className="flex justify-between gap-3 px-4 py-2">
                <span className="truncate">
                  {track.interpret} – {track.titel}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {track.bpm ? `${Math.round(track.bpm)} BPM` : "–"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/**
 * Antwort auslesen, ohne an einer Fehlerseite zu zerbrechen.
 *
 * Bei einem Serverfehler liefert Next HTML oder gar nichts. Ein blindes
 * `.json()` scheitert dann mit "Unexpected end of JSON input" – und diese
 * Meldung verdeckt genau den Fehler, den man sehen müsste.
 */
async function alsJson(antwort: Response): Promise<Record<string, string | undefined> & { tracks?: Vorhanden[] }> {
  const roh = await antwort.text();
  if (!roh) return { roh: "" };
  try {
    return JSON.parse(roh);
  } catch {
    return { roh: roh.slice(0, 300) };
  }
}

/**
 * Aus einem Serverfehler eine Anweisung machen.
 *
 * Die beiden Stolpersteine beim Einrichten sind immer dieselben: Die Migration
 * ist noch nicht eingespielt, oder der Service-Role-Schlüssel fehlt in den
 * Umgebungsvariablen. Beides sieht als roher Fehler gleich aus.
 */
function hinweisZu(status: number, text: string) {
  if (/SUPABASE_SERVICE_ROLE_KEY/i.test(text)) {
    return "SUPABASE_SERVICE_ROLE_KEY fehlt. In Vercel unter Settings → Environment Variables eintragen und neu bereitstellen.";
  }
  if (/dj_track|relation .* does not exist|schema cache/i.test(text)) {
    return "Die Tabelle dj_track gibt es noch nicht. Im Supabase-Dashboard unter SQL Editor die Datei supabase/migrations/20260811210000_dj.sql ausführen.";
  }
  if (status === 401) return "Nicht angemeldet – bitte neu am Adminbereich anmelden.";
  return `Bibliothek nicht lesbar (Fehler ${status}). ${text.slice(0, 200)}`;
}

function beschriftung(eintrag: Eintrag) {
  switch (eintrag.zustand) {
    case "wartet":
      return "wartet";
    case "misst":
    case "laedt":
      return eintrag.schritt || "läuft";
    case "fertig":
      return "fertig";
    case "fehler":
      return "Fehler";
  }
}

/** „Artist - Titel (Official Video).mp3“ zu brauchbaren Feldern aufräumen. */
function ausDateiname(name: string) {
  const MUELL =
    /\s*[([]\s*(official\s*(music\s*)?(video|audio)?|lyrics?( video)?|hq|hd|4k|free\s*(dl|download)|out now|extended( mix)?|original mix|radio edit|audio|remastered?( \d{4})?)\s*[)\]]/gi;

  const ohneEndung = name.replace(/\.[^.]+$/, "");
  const sauber = ohneEndung
    .replace(MUELL, "")
    .replace(/^\d{1,3}[\s.\-_]+/, "") // führende Titelnummer
    .replace(/[_]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const teile = sauber.split(/\s+[-–—]\s+/);
  if (teile.length >= 2) {
    return { interpret: teile[0].trim(), titel: teile.slice(1).join(" - ").trim() };
  }
  return { interpret: "Unbekannt", titel: sauber || name };
}
