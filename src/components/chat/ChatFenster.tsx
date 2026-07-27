"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeftIcon, CameraIcon, ChevronDownIcon, SendIcon } from "lucide-react";
import Link from "next/link";

import { anliegen } from "@config/anliegen";
import { chatRahmen } from "@config/chat-rahmen";
import { szenarien } from "@config/scenarios";
import { rueckrufGruende, zeitwuensche } from "@config/rueckruf-gruende";
import { useChat } from "@/lib/chat/useChat";
import type { Umgebung } from "@/lib/chat/maschine";
import type { Taetigkeit } from "@/lib/chat/typen";
import type { Mandant } from "@/lib/daten/typen";
import { Button } from "@/components/ui/button";
import { AuswertungsIndikator, Blase, TippIndikator } from "./Blase";
import { KiLegende } from "./KiMarke";
import { TECHNIK_PARAMETER } from "@/components/demo/TechnikSchalter";
import { FotoDialog } from "./FotoDialog";
import { NutzerAuswahl, type ChatNutzer } from "./NutzerAuswahl";
import { tourMelden } from "@/lib/tour/ereignisse";

export function ChatFenster({
  mandant,
  nutzer,
  start,
}: {
  mandant: Mandant;
  nutzer: ChatNutzer[];
  /** Wer schreibt, wenn niemand etwas anderes wählt. Kommt vom Server. */
  start: ChatNutzer;
}) {
  const [gewaehlt, setGewaehlt] = useState<ChatNutzer>(start);
  const [wechseln, setWechseln] = useState(false);

  // Das Gespräch beginnt sofort. Wer davor eine Auswahlseite sieht, muss erst
  // etwas entscheiden, bevor er versteht, worum es geht – bei einer geführten
  // Vorführung steht das im Weg. Gewechselt wird über die Kopfzeile.
  if (wechseln) {
    return (
      <NutzerAuswahl
        mandant={mandant}
        nutzer={nutzer}
        aktuell={gewaehlt.einheitId}
        onWaehlen={(neu) => {
          setGewaehlt(neu);
          setWechseln(false);
        }}
        onAbbrechen={() => setWechseln(false)}
      />
    );
  }

  return (
    // Der Schlüssel setzt das Gespräch beim Wechsel zurück: Ein anderer Mieter
    // hat einen eigenen Verlauf und eigene Meldungen.
    <Gespraech
      key={gewaehlt.einheitId}
      mandant={mandant}
      nutzer={gewaehlt}
      onWechseln={() => setWechseln(true)}
    />
  );
}

function Gespraech({
  mandant,
  nutzer,
  onWechseln,
}: {
  mandant: Mandant;
  nutzer: ChatNutzer;
  onWechseln: () => void;
}) {
  const umgebung: Umgebung = {
    firma: mandant.firma,
    handwerker: mandant.handwerker ?? [],
    kleinreparaturGrenzeEuro: mandant.einstellungen?.kleinreparatur_grenze_euro,
  };

  const { zustand, taetigkeit, beschaeftigt, ausloesen } = useChat(
    umgebung,
    mandant.slug,
    nutzer.einheitId,
  );
  const [entwurf, setEntwurf] = useState("");
  const [fotoOffen, setFotoOffen] = useState(false);
  // Nur für uns: siehe src/components/demo/TechnikSchalter.tsx
  const technik = useSearchParams().get(TECHNIK_PARAMETER) === "1";
  const ende = useRef<HTMLDivElement>(null);

  // Auch auf das Angebot hören: Die Knopfleiste erscheint erst, wenn die
  // Antwort fertig ist, und schiebt den Verlauf dann noch einmal nach oben.
  // Ohne diese Abhängigkeit bliebe die letzte Nachricht angeschnitten.
  useEffect(() => {
    ende.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [zustand.nachrichten.length, zustand.angebot, taetigkeit, beschaeftigt]);

  // Die Erkenntnis-Karte ist der Punkt, um den es in der Tour geht.
  useEffect(() => {
    if (zustand.nachrichten.some((n) => n.karte?.art === "erkenntnis")) {
      tourMelden("chat:erkenntnis");
    }
  }, [zustand.nachrichten]);

  const absenden = () => {
    const text = entwurf.trim();
    if (!text || beschaeftigt) return;
    setEntwurf("");
    void ausloesen({ art: "text", text }, { text });
  };

  const fotoWaehlen = (datei: string, beschriftung: string) => {
    setFotoOffen(false);
    tourMelden("chat:foto-gesendet");
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
      <Kopfzeile
        mandant={mandant}
        taetigkeit={taetigkeit}
        nutzer={nutzer}
        onWechseln={onWechseln}
      />

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3 sm:px-4">
        <Datumstrenner />
        {technik && <KiLegende />}
        {zustand.nachrichten.map((nachricht) => (
          <Blase key={nachricht.id} nachricht={nachricht} technik={technik} />
        ))}
        {taetigkeit === "tippen" && <TippIndikator />}
        {taetigkeit === "auswerten" && <AuswertungsIndikator />}
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

function Kopfzeile({
  mandant,
  taetigkeit,
  nutzer,
  onWechseln,
}: {
  mandant: Mandant;
  taetigkeit: Taetigkeit;
  nutzer: ChatNutzer;
  onWechseln: () => void;
}) {
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
        <p className="text-xs opacity-80">{kopfzeilenStand(taetigkeit)}</p>
      </div>

      {/* Wer hier schreibt – ohne diese Zeile weiß der Betrachter nicht, in
          wessen Rolle er gerade steckt. Zugleich der Weg zum Wechsel. */}
      <button
        type="button"
        onClick={onWechseln}
        title="Als anderen Mieter schreiben"
        // Auf dem Telefon steht nur ein Zeichen – ohne Beschriftung wüsste
        // niemand mit Screenreader, wessen Rolle er gerade hat.
        aria-label={`Sie schreiben als ${nutzer.name}, ${nutzer.objekt} ${nutzer.lage}. Mieter wechseln`}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-right transition-colors hover:bg-white/15"
      >
        {/* Auf dem Telefon nur das Zeichen – sonst bricht der Firmenname um,
            und der gehört in einem Mieter-Chat nach vorn. */}
        <span className="hidden max-w-[9rem] min-w-0 sm:block">
          <span className="block truncate text-xs leading-tight font-medium">
            {nutzer.name}
          </span>
          <span className="block truncate text-[11px] opacity-75">
            {nutzer.lage} · wechseln
          </span>
        </span>
        <span className="flex size-8 items-center justify-center rounded-full bg-white/15 sm:size-auto sm:bg-transparent">
          <ChevronDownIcon className="size-4 opacity-90 sm:size-3.5" aria-hidden />
        </span>
      </button>
    </header>
  );
}

/** Die Statuszeile unter dem Firmennamen. */
function kopfzeilenStand(taetigkeit: Taetigkeit): string {
  if (taetigkeit === "auswerten") return "wertet Ihr Bild aus…";
  if (taetigkeit === "tippen") return "tippt gerade…";
  return "Serviceassistent · antwortet sofort";
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
    // Der Einstieg: das Anliegen, nicht der Schaden. Bewusst ohne "Rückruf"
    // in der Liste – der kommt erst, wenn eine Auskunft nicht gereicht hat.
    case "anliegen":
      return (
        <div className="flex flex-col gap-2 px-3 pb-1 sm:px-4">
          {anliegen.map((a) => (
            <Schnellknopf
              key={a.id}
              breit
              hervorgehoben={a.istSchaden}
              // Die Tour markiert erst dieses Thema, danach den Foto-Knopf –
              // beide tragen dieselbe Kennung, sichtbar ist immer nur einer.
              tourZiel={a.istSchaden ? "foto-knopf" : undefined}
              onClick={() =>
                onEreignis(
                  { art: "anliegen", anliegenId: a.id },
                  { text: a.bezeichnung },
                )
              }
            >
              {a.bezeichnung}
            </Schnellknopf>
          ))}
        </div>
      );

    case "auskunft":
      return (
        <div className={rahmen}>
          <Schnellknopf
            hervorgehoben
            onClick={() =>
              onEreignis(
                { art: "auskunft", geholfen: true },
                { text: chatRahmen.knoepfe.hilftWeiter },
              )
            }
          >
            {chatRahmen.knoepfe.hilftWeiter}
          </Schnellknopf>
          <Schnellknopf
            onClick={() =>
              onEreignis(
                { art: "auskunft", geholfen: false },
                { text: chatRahmen.knoepfe.hilftNicht },
              )
            }
          >
            {chatRahmen.knoepfe.hilftNicht}
          </Schnellknopf>
        </div>
      );

    case "eingabe":
      return (
        <div className={rahmen} data-tour="foto-knopf">
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

    case "selbsthilfe":
      return (
        <div className={rahmen}>
          <Schnellknopf
            hervorgehoben
            onClick={() =>
              onEreignis(
                { art: "selbsthilfe", annehmen: true },
                { text: chatRahmen.knoepfe.anleitung },
              )
            }
          >
            {chatRahmen.knoepfe.anleitung}
          </Schnellknopf>
          <Schnellknopf
            onClick={() =>
              onEreignis(
                { art: "selbsthilfe", annehmen: false },
                { text: chatRahmen.knoepfe.lieberHandwerker },
              )
            }
          >
            {chatRahmen.knoepfe.lieberHandwerker}
          </Schnellknopf>
        </div>
      );

    case "selbsthilfeErgebnis":
      return (
        <div className={rahmen}>
          <Schnellknopf
            hervorgehoben
            onClick={() =>
              onEreignis(
                { art: "selbsthilfeErfolg", geklappt: true },
                { text: chatRahmen.knoepfe.hatGeklappt },
              )
            }
          >
            {chatRahmen.knoepfe.hatGeklappt}
          </Schnellknopf>
          <Schnellknopf
            onClick={() =>
              onEreignis(
                { art: "selbsthilfeErfolg", geklappt: false },
                { text: chatRahmen.knoepfe.hatNichtGeklappt },
              )
            }
          >
            {chatRahmen.knoepfe.hatNichtGeklappt}
          </Schnellknopf>
        </div>
      );

    // Grobe Erreichbarkeit, keine Termine: Welche Zeitpunkte moeglich sind,
    // weiss allein der Betrieb. Siehe config/chat-rahmen.ts.
    case "erreichbarkeit":
      return (
        <div className="flex flex-wrap gap-2 px-3 pb-1 sm:px-4">
          {zeitwuensche.map((zeit) => (
            <Schnellknopf
              key={zeit.id}
              onClick={() =>
                onEreignis(
                  { art: "erreichbarkeit", zeitwunschId: zeit.id },
                  { text: zeit.bezeichnung },
                )
              }
            >
              {zeit.bezeichnung}
            </Schnellknopf>
          ))}
        </div>
      );

    // Zeitfenster, die der Handwerksbetrieb selbst genannt hat.
    case "terminauswahl":
      return (
        <div className="flex flex-col gap-2 px-3 pb-1 sm:px-4">
          {angebot.fenster.map((f, index) => (
            <Schnellknopf
              key={f.beginn}
              breit
              onClick={() =>
                onEreignis(
                  { art: "terminauswahl", token: angebot.token, index },
                  { text: f.beschriftung },
                )
              }
            >
              {f.beschriftung}
            </Schnellknopf>
          ))}
        </div>
      );

    // Der Mieter wählt nur das Thema – nicht die Person und nicht die Uhrzeit.
    // Wer zurückruft, entscheidet die Verwaltung im Dashboard.
    case "rueckrufGrund":
      return (
        <div className="flex flex-col gap-2 px-3 pb-1 sm:px-4">
          {rueckrufGruende.map((grund) => (
            <Schnellknopf
              key={grund.id}
              breit
              onClick={() =>
                onEreignis(
                  { art: "rueckrufGrund", grundId: grund.id },
                  { text: grund.bezeichnung },
                )
              }
            >
              {grund.bezeichnung}
            </Schnellknopf>
          ))}
        </div>
      );

    case "rueckrufZeit":
      return (
        <div className={rahmen}>
          {zeitwuensche.map((zeit) => (
            <Schnellknopf
              key={zeit.id}
              onClick={() =>
                onEreignis(
                  { art: "rueckrufZeit", zeitwunschId: zeit.id },
                  { text: zeit.bezeichnung },
                )
              }
            >
              {zeit.bezeichnung}
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
  tourZiel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  hervorgehoben?: boolean;
  breit?: boolean;
  tourZiel?: string;
}) {
  // bg-white nur für die nicht hervorgehobenen Knöpfe. Sonst überschreibt es
  // die Markenfarbe des hervorgehobenen Knopfes, dessen Schrift weiß bleibt –
  // Ergebnis war weiß auf weiß, der wichtigste Knopf des Chats unlesbar.
  const form = breit
    ? "h-auto w-full justify-start rounded-lg py-2.5 text-left whitespace-normal"
    : "rounded-full";

  return (
    <Button
      type="button"
      size="sm"
      variant={hervorgehoben ? "marke" : "outline"}
      onClick={onClick}
      data-tour={tourZiel}
      className={hervorgehoben ? form : `${form} bg-white`}
    >
      {children}
    </Button>
  );
}

/** Wird von der Demo-Seite gebraucht, um die Szenarienzahl anzuzeigen. */
export const szenarienAnzahl = szenarien.length;
