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
  /** 0 bis 1 waehrend des Hochladens, sonst null. */
  anteil?: number | null;
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
  /** Wie belastbar Tempo und Raster sind, 0 bis 1. */
  bpmVertrauen: number;
  /** true = kein brauchbares Raster; damit lässt sich nicht beatmatchen. */
  ohneRaster: boolean;
  /** Verlauf je Takt – daran hängt, wo ein Übergang ansetzt und wo er landet. */
  profil: { e: number; b: number; h: number; d: number }[];
  /** Auf welchem Takt eine Achttaktphrase beginnt (0–7). */
  phrasenVersatz: number;
};

type Vorhanden = {
  id: string;
  titel: string;
  interpret: string;
  bpm: number | null;
  /** Fehlt bei Einträgen aus der Zeit vor der Vertrauensmessung. */
  ohneRaster?: boolean;
  /** Leer bei Einträgen, die vor der Verlaufsmessung hochgeladen wurden. */
  profil?: { e: number; b: number; h: number; d: number }[];
};

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
  const [hinweis, setHinweis] = useState<string | null>(null);
  // Alles zu löschen ist nicht rückgängig zu machen. Deshalb zwei Klicks: Der
  // erste stellt die Frage, der zweite beantwortet sie.
  const [sicherheitsfrage, setSicherheitsfrage] = useState(false);
  const [loescht, setLoescht] = useState<string | null>(null);
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

    // Bewusst mit halber Abtastrate analysieren.
    //
    // Ein Sechsminüter voll aufgelöst sind über hundert Megabyte an
    // Abtastwerten, und daran scheitert Safari auf dem iPad mit „Decoding
    // failed“. Bei 22050 Hz ist es die Hälfte und doppelt so schnell.
    //
    // Nachgemessen an musikähnlichem Material: Tempo identisch, Lautheit auf
    // 0,00 dB identisch. Nur bei weißem Rauschen weicht sie ab, weil dort die
    // halbe Energie oberhalb 11 kHz liegt – bei Musik ist da fast nichts.
    //
    // Hochgeladen wird davon unberührt die Originaldatei.
    const ctx = neuerKontext(22050);

    for (const [nummer, eintrag] of eintraege.entries()) {
      if (eintrag.zustand === "fertig") continue;
      try {
        aendern(nummer, { zustand: "misst", schritt: "Datei lesen", meldung: undefined });
        const roh = await eintrag.datei.arrayBuffer();

        aendern(nummer, { schritt: "Dekodieren" });
        const puffer = await dekodieren(ctx, roh, eintrag.datei);

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

        await hochladenMitFortschritt(
          erlaubt.adresse,
          eintrag.datei,
          (anteil) => aendern(nummer, { anteil }),
        );

        aendern(nummer, { schritt: "Eintragen", anteil: null });
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

        aendern(nummer, { zustand: "fertig", schritt: "", anteil: null });
      } catch (grund) {
        aendern(nummer, {
          zustand: "fehler",
          schritt: "",
          anteil: null,
          meldung: grund instanceof Error ? grund.message : String(grund),
        });
      }
    }

    await bibliothekLaden();
    void ctx.close();
    setLaeuft(false);
  }

  async function loeschen(was: { id: string; titel: string } | { alle: true }) {
    const alle = "alle" in was;
    setLoescht(alle ? "alle" : was.id);
    setFehler(null);
    setHinweis(null);
    try {
      const antwort = await fetch("/api/dj/track", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        // Die Anzahl geht mit: Hat sich die Bibliothek seit dem Laden dieser
        // Seite geändert, bricht der Server ab, statt mehr zu löschen als hier
        // zu sehen war.
        body: JSON.stringify(alle ? { alle: true, anzahl: bibliothek.length } : { id: was.id }),
      });
      const daten = await alsJson(antwort);
      if (!antwort.ok) {
        throw new Error(hinweisZu(antwort.status, daten.fehler ?? daten.roh ?? ""));
      }
      setHinweis(
        alle
          ? `${daten.geloescht} Tracks und ${daten.dateien} Dateien gelöscht. Die Bibliothek ist leer.`
          : `„${was.titel}" gelöscht.`,
      );
      if (daten.warnung) setFehler(daten.warnung);
      await bibliothekLaden();
    } catch (grund) {
      setFehler(grund instanceof Error ? grund.message : String(grund));
    } finally {
      setLoescht(null);
      setSicherheitsfrage(false);
    }
  }

  const offen = eintraege.filter((e) => e.zustand !== "fertig").length;
  // Wie viele Einträge stammen aus der Zeit vor der Verlaufsmessung?
  const veraltet = bibliothek.filter((t) => (t.profil?.length ?? 0) === 0).length;

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

      {hinweis && (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{hinweis}</p>
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
                {typeof eintrag.anteil === "number" && (
                  <div className="h-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full bg-slate-800 transition-[width] duration-150"
                      style={{ width: `${Math.round(eintrag.anteil * 100)}%` }}
                    />
                  </div>
                )}
                {eintrag.befund && (
                  <p className="text-xs text-muted-foreground">
                    {eintrag.befund.ohneRaster ? (
                      /*
                       * Kein brauchbares Raster. Das ist keine Fehlermeldung,
                       * sondern eine Ansage: Der Track wird nicht beatgematcht,
                       * sondern läuft als Fläche unter dem eigenen Schlagwerk.
                       * Genau das täte ein DJ mit so einer Aufnahme auch.
                       */
                      <>
                        <strong>Kein Beat erkennbar</strong> – wird geschnitten
                        statt gemischt ·{" "}
                        {eintrag.befund.lufs} LUFS → Angleich{" "}
                        {eintrag.befund.angleichDb > 0 ? "+" : ""}
                        {eintrag.befund.angleichDb} dB
                      </>
                    ) : (
                      <>
                        {eintrag.befund.bpm} BPM
                        {eintrag.befund.bpmVertrauen < 0.7
                          ? ` (nur ${Math.round(eintrag.befund.bpmVertrauen * 100)} % sicher)`
                          : ""}{" "}
                        · Raster {eintrag.befund.raster.toFixed(3)} s ·{" "}
                        {eintrag.befund.lufs} LUFS → Angleich{" "}
                        {eintrag.befund.angleichDb > 0 ? "+" : ""}
                        {eintrag.befund.angleichDb} dB · Einstieg Beat{" "}
                        {eintrag.befund.einstiegBeat} ·{" "}
                        {eintrag.befund.marken.filter((m) => m.name === "drop").length} Drop(s)
                      </>
                    )}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            In der Bibliothek: {bibliothek.length}{" "}
            {bibliothek.length === 1 ? "Track" : "Tracks"}
            {veraltet > 0 && (
              <span className="ml-2 font-normal text-amber-700">
                · {veraltet} vor der Verlaufsmessung hochgeladen
              </span>
            )}
          </h2>
          {bibliothek.length > 0 &&
            (sicherheitsfrage ? (
              <span className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => loeschen({ alle: true })}
                  disabled={loescht !== null}
                >
                  {loescht === "alle"
                    ? "Löscht …"
                    : `Ja, alle ${bibliothek.length} löschen`}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSicherheitsfrage(false)}
                  disabled={loescht !== null}
                >
                  Abbrechen
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSicherheitsfrage(true)}
                disabled={laeuft || loescht !== null}
              >
                Alle löschen
              </Button>
            ))}
        </div>

        {sicherheitsfrage && (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Das löscht alle {bibliothek.length} Einträge <em>und</em> die
            hochgeladenen Audiodateien. Das lässt sich nicht rückgängig machen –
            die Dateien müssen danach neu hochgeladen werden.
          </p>
        )}

        {bibliothek.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch leer. Solange hier nichts steht, spielt die Bühne unter{" "}
            <code>/dj</code> nur den Prüfstand.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {bibliothek.map((track) => (
              <li key={track.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="truncate">
                  {track.interpret} – {track.titel}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {/*
                    Ein Track, dem der Verlauf fehlt, wurde vor der
                    Verlaufsmessung hochgeladen. Er läuft weiter, aber die
                    Übergänge können bei ihm nicht entscheiden, wo der Groove
                    anfängt und wo der Track zurückgeht – sie fallen auf den
                    natürlichen Einstieg zurück. Das sieht man dem Eintrag
                    sonst nicht an, deshalb steht es hier.
                  */}
                  {(track.profil?.length ?? 0) === 0 && (
                    <span
                      className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900"
                      title="Vor der Verlaufsmessung hochgeladen – neu hochladen, damit Ein- und Ausstieg berechnet werden können"
                    >
                      alte Messung
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {track.ohneRaster
                      ? "kein Raster"
                      : track.bpm
                        ? `${Math.round(track.bpm)} BPM`
                        : "–"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-red-700"
                    onClick={() => loeschen({ id: track.id, titel: track.titel })}
                    disabled={loescht !== null || laeuft}
                  >
                    {loescht === track.id ? "…" : "Löschen"}
                  </Button>
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
 * Hochladen mit Fortschritt.
 *
 * `fetch` meldet den Sendefortschritt nicht – es gibt schlicht kein Ereignis
 * dafür. Über Mobilfunk dauert eine Audiodatei aber lange genug, dass ein
 * Balken den Unterschied macht zwischen "arbeitet" und "hängt". Dafür ist der
 * alte XMLHttpRequest bis heute das einzige Mittel im Browser.
 */
function hochladenMitFortschritt(
  adresse: string,
  datei: File,
  beiFortschritt: (anteil: number) => void,
) {
  return new Promise<void>((fertig, gescheitert) => {
    const anfrage = new XMLHttpRequest();
    anfrage.open("PUT", adresse);
    anfrage.setRequestHeader("Content-Type", datei.type || "audio/mpeg");

    anfrage.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) beiFortschritt(e.loaded / e.total);
    });
    anfrage.addEventListener("load", () => {
      if (anfrage.status >= 200 && anfrage.status < 300) {
        beiFortschritt(1);
        fertig();
      } else {
        gescheitert(
          new Error(`Hochladen fehlgeschlagen (${anfrage.status}). ${anfrage.responseText.slice(0, 200)}`),
        );
      }
    });
    anfrage.addEventListener("error", () =>
      gescheitert(new Error("Verbindung beim Hochladen abgebrochen.")),
    );
    anfrage.addEventListener("abort", () => gescheitert(new Error("Hochladen abgebrochen.")));

    beiFortschritt(0);
    anfrage.send(datei);
  });
}

function neuerKontext(rate: number) {
  const Klasse =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  try {
    return new Klasse({ sampleRate: rate });
  } catch {
    // Ältere Safari-Versionen lehnen eine gewünschte Abtastrate ab.
    return new Klasse();
  }
}

/** Formate, die Safari nicht dekodieren kann – da hilft kein Nachfassen. */
const UNMOEGLICH = /\.(webm|opus|oga|ogg|wma|ra|amr)$/i;

/**
 * Dekodieren mit brauchbarer Fehlermeldung.
 *
 * „Decoding failed“ ist die Meldung des Browsers und sagt nichts darüber, was
 * zu tun ist. Die beiden echten Ursachen sind ein Format, das Safari nicht
 * kann, und zu wenig Speicher – und beide brauchen eine andere Reaktion.
 */
async function dekodieren(ctx: AudioContext, roh: ArrayBuffer, datei: File) {
  if (UNMOEGLICH.test(datei.name)) {
    throw new Error(
      `${datei.name}: Dieses Format kann Safari nicht abspielen. Wandle es in MP3, M4A oder WAV um – viele iPad-Konverter liefern heimlich Opus in einer .webm- oder .ogg-Hülle.`,
    );
  }

  try {
    // decodeAudioData verbraucht den Puffer, deshalb eine Kopie.
    return await ctx.decodeAudioData(roh.slice(0));
  } catch (grund) {
    const mb = (datei.size / 1048576).toFixed(1);

    // Zweiter Versuch mit noch weniger Speicher. Wenn es daran lag, reicht das.
    try {
      const sparsam = neuerKontext(11025);
      const puffer = await sparsam.decodeAudioData(roh.slice(0));
      void ctx.close();
      return puffer;
    } catch {
      // War also nicht der Speicher.
    }

    // Welche Formate ein Browser kann, hängt an ihm, nicht an der Datei: AAC
    // in .m4a spielt Safari mühelos, ein Chromium ohne Lizenzcodecs nicht.
    // Deshalb keine Behauptung über die Datei, sondern über die Lage.
    throw new Error(
      `${datei.name} (${mb} MB) konnte dieser Browser nicht dekodieren. ` +
        `Safari kann MP3, M4A/AAC und WAV; andere Browser können bei M4A aussteigen. ` +
        `Im Zweifel als MP3 oder WAV umwandeln. ` +
        `${grund instanceof Error ? grund.message : ""}`.trim(),
    );
  }
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
  return `Der Server hat mit Fehler ${status} geantwortet. ${text.slice(0, 200)}`.trim();
}

function beschriftung(eintrag: Eintrag) {
  switch (eintrag.zustand) {
    case "wartet":
      return "wartet";
    case "misst":
      return eintrag.schritt || "läuft";
    case "laedt":
      return typeof eintrag.anteil === "number"
        ? `Hochladen ${Math.round(eintrag.anteil * 100)} %`
        : eintrag.schritt || "läuft";
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
