"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, CameraIcon, SendIcon } from "lucide-react";
import Link from "next/link";

import { chatRahmen } from "@config/chat-rahmen";
import { szenarien } from "@config/scenarios";
import { useChat } from "@/lib/chat/useChat";
import type { Umgebung } from "@/lib/chat/maschine";
import type { Mandant } from "@/lib/daten/typen";
import { Button } from "@/components/ui/button";
import { Blase, TippIndikator } from "./Blase";
import { FotoDialog } from "./FotoDialog";

export function ChatFenster({ mandant }: { mandant: Mandant }) {
  const umgebung: Umgebung = {
    firma: mandant.firma,
    handwerker: mandant.handwerker ?? [],
    mitarbeiter: mandant.mitarbeiter ?? [],
  };

  const { zustand, tippt, beschaeftigt, ausloesen } = useChat(umgebung);
  const [entwurf, setEntwurf] = useState("");
  const [fotoOffen, setFotoOffen] = useState(false);
  const ende = useRef<HTMLDivElement>(null);

  // Auch auf das Angebot hören: Die Knopfleiste erscheint erst, wenn die
  // Antwort fertig ist, und schiebt den Verlauf dann noch einmal nach oben.
  // Ohne diese Abhängigkeit bliebe die letzte Nachricht angeschnitten.
  useEffect(() => {
    ende.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [zustand.nachrichten.length, zustand.angebot, tippt, beschaeftigt]);

  const absenden = () => {
    const text = entwurf.trim();
    if (!text || beschaeftigt) return;
    setEntwurf("");
    void ausloesen({ art: "text", text }, { text });
  };

  const fotoWaehlen = (datei: string, beschriftung: string) => {
    setFotoOffen(false);
    void ausloesen(
      { art: "foto", datei },
      { foto: datei, fotoBeschriftung: beschriftung },
    );
  };

  const angebot = zustand.angebot;
  const zweitfotoOptionen = angebot.art === "zweitfoto" ? angebot.optionen : undefined;

  // Der Foto-Knopf steht nur zur Verfügung, wenn ein Bild auch weiterhilft.
  const fotoMoeglich = angebot.art === "eingabe" || angebot.art === "zweitfoto";

  return (
    // h-full statt h-svh: Die Demo-Kennzeichnung im Layout darüber belegt
    // bereits einen Teil des Bildschirms.
    <div className="flex h-full flex-col bg-chat-hintergrund">
      <Kopfzeile mandant={mandant} tippt={tippt} />

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3 sm:px-4">
        <Datumstrenner />
        {zustand.nachrichten.map((nachricht) => (
          <Blase key={nachricht.id} nachricht={nachricht} />
        ))}
        {tippt && <TippIndikator />}
        <div ref={ende} />
      </div>

      <Aktionsleiste
        angebot={angebot}
        beschaeftigt={beschaeftigt}
        onEreignis={ausloesen}
        onFotoOeffnen={() => setFotoOffen(true)}
      />

      <div className="flex items-end gap-2 border-t border-black/5 bg-slate-50 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setFotoOffen(true)}
          disabled={!fotoMoeglich || beschaeftigt}
          aria-label="Foto senden"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm transition-colors hover:text-marke disabled:opacity-40"
        >
          <CameraIcon className="size-5" />
        </button>

        <textarea
          value={entwurf}
          onChange={(e) => setEntwurf(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              absenden();
            }
          }}
          rows={1}
          placeholder="Nachricht schreiben"
          disabled={beschaeftigt}
          className="max-h-28 min-h-10 flex-1 resize-none rounded-2xl border-0 bg-white px-4 py-2.5 text-[15px] shadow-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
        />

        <button
          type="button"
          onClick={absenden}
          disabled={!entwurf.trim() || beschaeftigt}
          aria-label="Senden"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-marke text-marke-kontrast shadow-sm transition-opacity disabled:opacity-40"
        >
          <SendIcon className="size-4" />
        </button>
      </div>

      <FotoDialog
        offen={fotoOffen}
        onSchliessen={() => setFotoOffen(false)}
        onAuswahl={fotoWaehlen}
        optionen={zweitfotoOptionen}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Kopfzeile({ mandant, tippt }: { mandant: Mandant; tippt: boolean }) {
  const initialen = mandant.firma
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="flex items-center gap-3 bg-marke px-3 py-2.5 text-marke-kontrast">
      <Link
        href={`/demo/${mandant.slug}`}
        aria-label="Zurück zur Übersicht"
        className="-ml-1 shrink-0 rounded p-1 opacity-90 hover:opacity-100"
      >
        <ArrowLeftIcon className="size-5" />
      </Link>

      {mandant.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mandant.logo_url}
          alt=""
          className="size-9 shrink-0 rounded-full bg-white object-contain p-0.5"
        />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">
          {initialen}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] leading-tight font-medium">
          {mandant.firma}
        </p>
        <p className="text-xs opacity-80">
          {tippt ? "tippt gerade…" : "Serviceassistent · antwortet sofort"}
        </p>
      </div>
    </header>
  );
}

function Datumstrenner() {
  return (
    <div className="flex justify-center py-1">
      <span className="rounded-md bg-white/70 px-2.5 py-1 text-[11px] font-medium text-slate-600">
        Heute
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------

type AktionsleisteProps = {
  angebot: ReturnType<typeof useChat>["zustand"]["angebot"];
  beschaeftigt: boolean;
  onEreignis: ReturnType<typeof useChat>["ausloesen"];
  onFotoOeffnen: () => void;
};

/** Die Knopfleiste über dem Eingabefeld – führt durch den Ablauf. */
function Aktionsleiste({
  angebot,
  beschaeftigt,
  onEreignis,
  onFotoOeffnen,
}: AktionsleisteProps) {
  if (angebot.art === "keins" || beschaeftigt) return null;

  const rahmen = "flex flex-wrap gap-2 px-3 pb-1 sm:px-4";

  switch (angebot.art) {
    case "eingabe":
      return (
        <div className={rahmen}>
          <Schnellknopf onClick={onFotoOeffnen}>{chatRahmen.knoepfe.foto}</Schnellknopf>
        </div>
      );

    case "bestaetigung":
      return (
        <div className={rahmen}>
          <Schnellknopf
            hervorgehoben
            onClick={() =>
              onEreignis(
                { art: "bestaetigung", ja: true },
                { text: chatRahmen.knoepfe.ja },
              )
            }
          >
            {chatRahmen.knoepfe.ja}
          </Schnellknopf>
          <Schnellknopf
            onClick={() =>
              onEreignis(
                { art: "bestaetigung", ja: false },
                { text: chatRahmen.knoepfe.nein },
              )
            }
          >
            {chatRahmen.knoepfe.nein}
          </Schnellknopf>
        </div>
      );

    case "zweitfoto":
      return (
        <div className={rahmen}>
          <Schnellknopf hervorgehoben onClick={onFotoOeffnen}>
            Zweites Foto senden
          </Schnellknopf>
        </div>
      );

    case "termin":
      return (
        <div className="flex flex-col gap-2 px-3 pb-1 sm:px-4">
          {angebot.fenster.map((f, index) => (
            <Schnellknopf
              key={f.beginn}
              breit
              onClick={() =>
                onEreignis({ art: "termin", index }, { text: f.beschriftung })
              }
            >
              {f.beschriftung}
            </Schnellknopf>
          ))}
        </div>
      );

    case "rueckruf":
      return (
        <div className="flex flex-col gap-2 px-3 pb-1 sm:px-4">
          {angebot.fenster.map((f, index) => (
            <Schnellknopf
              key={f.beginn}
              breit
              onClick={() =>
                onEreignis({ art: "rueckrufTermin", index }, { text: f.beschriftung })
              }
            >
              <span className="flex w-full items-center justify-between gap-3">
                <span>{f.beschriftung}</span>
                <span className="text-xs opacity-70">
                  {f.mitarbeiter} · {f.bereich}
                </span>
              </span>
            </Schnellknopf>
          ))}
        </div>
      );

    case "frei":
      return (
        <div className={rahmen}>
          <Schnellknopf
            onClick={() =>
              onEreignis({ art: "status" }, { text: chatRahmen.knoepfe.status })
            }
          >
            {chatRahmen.knoepfe.status}
          </Schnellknopf>
          <Schnellknopf
            onClick={() =>
              onEreignis({ art: "rueckruf" }, { text: chatRahmen.knoepfe.rueckruf })
            }
          >
            {chatRahmen.knoepfe.rueckruf}
          </Schnellknopf>
          <Schnellknopf
            onClick={() =>
              onEreignis(
                { art: "neueMeldung" },
                { text: chatRahmen.knoepfe.neueMeldung },
              )
            }
          >
            {chatRahmen.knoepfe.neueMeldung}
          </Schnellknopf>
        </div>
      );
  }
}

function Schnellknopf({
  children,
  onClick,
  hervorgehoben,
  breit,
}: {
  children: React.ReactNode;
  onClick: () => void;
  hervorgehoben?: boolean;
  breit?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={hervorgehoben ? "marke" : "outline"}
      onClick={onClick}
      className={
        breit
          ? "h-auto w-full justify-start rounded-lg bg-white py-2.5 text-left whitespace-normal"
          : "rounded-full bg-white"
      }
    >
      {children}
    </Button>
  );
}

/** Wird von der Demo-Seite gebraucht, um die Szenarienzahl anzuzeigen. */
export const szenarienAnzahl = szenarien.length;
