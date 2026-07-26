"use client";

import { useState, useTransition } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MailIcon,
  MessageSquareIcon,
  PhoneIcon,
  SendIcon,
} from "lucide-react";

import {
  handwerkerEmail,
  mieterNachricht,
  telefonleitfaden,
  type Bausteindaten,
} from "@config/bausteine";
import {
  demoBetriebAntwortenLassen,
  notizEintragen,
  terminanfrageStellen,
  vorgangWeiterschieben,
  type Ergebnis,
} from "@/app/demo/[slug]/dashboard/aktionen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { VorgangStatus } from "@/lib/daten/typen";

type Reiter = "email" | "telefon" | "mieter";

/**
 * Die Übergabe vom Assistenten an den Mitarbeitenden.
 *
 * Ab hier entscheidet kein Automat mehr. Der Assistent hat aufgenommen,
 * nachgefragt und den Umfang geklärt – was daraus wird, macht ein Mensch.
 * Damit dieser Übergang keine Arbeit erzeugt, liegt alles fertig bereit:
 * die E-Mail an den Betrieb, der Leitfaden fürs Telefonat und die Antwort an
 * den Mieter. Kopieren, anrufen, vermerken.
 *
 * DEMO: Es wird nichts versendet. "E-Mail öffnen" übergibt an das
 * Mailprogramm des Rechners, "Anrufen" an das Telefon. Eine Anbindung an die
 * Systeme der Handwerksbetriebe kommt später; bis dahin ist genau das der
 * Weg, den diese Betriebe ohnehin gehen.
 */
export function Uebergabe({
  slug,
  vorgangId,
  status,
  daten,
  betriebTelefon,
  abstimmung,
}: {
  slug: string;
  vorgangId: string;
  status: VorgangStatus;
  daten: Bausteindaten;
  betriebTelefon: string | null;
  /** Stand der direkten Abstimmung mit dem Betrieb, falls er zugestimmt hat. */
  abstimmung: Abstimmungsstand;
}) {
  const [reiter, setReiter] = useState<Reiter>("email");
  const email = handwerkerEmail(daten);
  const leitfaden = telefonleitfaden(daten);
  const antwort = mieterNachricht(daten);

  return (
    <Card className="border-marke-rand">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2">Ihr nächster Schritt</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Der Assistent hat aufgenommen und den Umfang geklärt. Entschieden wird ab hier
          von Ihnen – die Texte sind fertig.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <Abstimmung slug={slug} vorgangId={vorgangId} stand={abstimmung} />
        <div className="flex flex-wrap gap-1.5" role="tablist">
          <ReiterKnopf
            aktiv={reiter === "email"}
            onClick={() => setReiter("email")}
            symbol={<MailIcon className="size-3.5" aria-hidden />}
          >
            E-Mail an {daten.betrieb ?? "den Betrieb"}
          </ReiterKnopf>
          <ReiterKnopf
            aktiv={reiter === "telefon"}
            onClick={() => setReiter("telefon")}
            symbol={<PhoneIcon className="size-3.5" aria-hidden />}
          >
            Telefonleitfaden
          </ReiterKnopf>
          <ReiterKnopf
            aktiv={reiter === "mieter"}
            onClick={() => setReiter("mieter")}
            symbol={<MessageSquareIcon className="size-3.5" aria-hidden />}
          >
            Antwort an den Mieter
          </ReiterKnopf>
        </div>

        {reiter === "email" && (
          <Textbaustein
            beschriftung={`Betreff: ${email.betreff}`}
            text={email.text}
            haupt={{
              beschriftung: "Im Mailprogramm öffnen",
              symbol: <MailIcon />,
              href: `mailto:?subject=${encodeURIComponent(email.betreff)}&body=${encodeURIComponent(email.text)}`,
            }}
          />
        )}

        {reiter === "telefon" && (
          <Leitfaden
            abschnitte={leitfaden}
            telefon={betriebTelefon}
            betrieb={daten.betrieb}
          />
        )}

        {reiter === "mieter" && (
          <Textbaustein
            beschriftung={`WhatsApp an ${daten.mieterName}`}
            text={antwort}
            haupt={
              daten.mieterTelefon
                ? {
                    beschriftung: "Nummer anrufen",
                    symbol: <PhoneIcon />,
                    href: `tel:${daten.mieterTelefon.replace(/\s/g, "")}`,
                  }
                : undefined
            }
          />
        )}

        <Abschluss slug={slug} vorgangId={vorgangId} status={status} daten={daten} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export type Abstimmungsstand =
  | { art: "nicht_erlaubt"; betrieb: string | null }
  | { art: "moeglich"; betrieb: string }
  | { art: "wartet"; betrieb: string; seit: string; link: string }
  | { art: "vorgeschlagen"; betrieb: string; anzahl: number }
  | { art: "gewaehlt"; betrieb: string; fenster: string };

/**
 * Der Weg, der der Verwaltung die eigentliche Arbeit abnimmt.
 *
 * Nicht das Beauftragen kostet Zeit, sondern das Hin und Her, bis Betrieb und
 * Mieter denselben Termin haben. Wo der Betrieb zugestimmt hat, übernimmt der
 * Assistent genau dieses Stück: Link an den Betrieb, drei Fenster zurück,
 * Auswahl durch den Mieter – und erst das Ergebnis kommt hierher zurück.
 */
function Abstimmung({
  slug,
  vorgangId,
  stand,
}: {
  slug: string;
  vorgangId: string;
  stand: Abstimmungsstand;
}) {
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();

  if (stand.art === "nicht_erlaubt") {
    return (
      <p className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {stand.betrieb ?? "Dieser Betrieb"} hat der direkten Terminabstimmung nicht
        zugestimmt – Sie rufen selbst an. Unter Handwerker &amp; Dienstleister lässt
        sich das umstellen, sobald der Betrieb einverstanden ist.
      </p>
    );
  }

  const rahmen =
    "space-y-2 rounded-md border border-marke-rand bg-marke-sanft px-3 py-2.5";

  if (stand.art === "wartet") {
    return (
      <div className={rahmen}>
        <p className="flex items-center gap-1.5 text-sm font-medium text-marke">
          <SendIcon className="size-3.5 shrink-0" aria-hidden />
          Terminlink an {stand.betrieb} verschickt
        </p>
        <p className="text-xs text-muted-foreground">
          {stand.seit} · Der Betrieb nennt uns drei Zeitfenster, danach wählt der
          Mieter. Sie hören erst wieder von uns, wenn ein Termin feststeht.
        </p>

        {/* DEMO: In einer Vorführung wartet niemand auf einen echten Betrieb.
            Beide Wege führen durch dieselbe Logik – der Link ist die Seite,
            die der Betrieb bekommt, der Knopf nimmt nur den Menschen vorweg. */}
        <div className="flex flex-wrap gap-2 border-t border-marke-rand pt-2">
          <Button asChild size="sm" variant="outline">
            <a href={stand.link} target="_blank" rel="noreferrer">
              <ExternalLinkIcon />
              Seite des Betriebs öffnen
            </a>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={laeuft}
            onClick={() =>
              starten(async () => {
                const ergebnis = await demoBetriebAntwortenLassen({ slug, vorgangId });
                if (ergebnis.fehlgeschlagen) {
                  setFehler(ergebnis.hinweis ?? "Hat nicht geklappt.");
                  return;
                }
                setFehler(null);
                setMeldung(ergebnis.hinweis ?? "Antwort eingegangen.");
              })
            }
          >
            {laeuft && <Loader2Icon className="animate-spin" />}
            Betrieb antworten lassen
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Für die Vorführung: Der Link führt zu der Seite, die der Betrieb per WhatsApp
          oder E-Mail bekommt – Sie können sie auf Ihrem Telefon selbst ausfüllen. Der
          Knopf daneben nimmt Ihnen das ab und legt drei Fenster an.
        </p>
        {meldung && (
          <p className="flex items-center gap-1.5 text-xs text-marke">
            <CheckIcon className="size-3.5 shrink-0" aria-hidden />
            {meldung}
          </p>
        )}
        {fehler && (
          <p className="flex items-start gap-1.5 text-xs text-prio-notfall">
            <AlertCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
            {fehler}
          </p>
        )}
      </div>
    );
  }

  if (stand.art === "vorgeschlagen") {
    return (
      <div className={rahmen}>
        <p className="flex items-center gap-1.5 text-sm font-medium text-marke">
          <CheckIcon className="size-3.5 shrink-0" aria-hidden />
          {stand.betrieb} hat {stand.anzahl} Zeitfenster genannt
        </p>
        <p className="text-xs text-muted-foreground">
          Der Mieter wählt gerade aus. Danach liegt die Bestätigung im Freigabe-Center.
        </p>
        {/* DEMO: Damit man den Kreis in einer Vorführung schließen kann, ohne
            zu suchen, wo der Mieter jetzt hinschauen müsste. */}
        <Button asChild size="sm" variant="outline">
          <a href={`/demo/${slug}/chat`} target="_blank" rel="noreferrer">
            <ExternalLinkIcon />
            Im Mieter-Chat ansehen
          </a>
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Der Mieter bekommt die Auswahl über WhatsApp. In der Demo tippen Sie im Chat
          auf „Status“, dann erscheinen die drei Fenster zum Antippen.
        </p>
      </div>
    );
  }

  if (stand.art === "gewaehlt") {
    return (
      <div className={rahmen}>
        <p className="flex items-center gap-1.5 text-sm font-medium text-marke">
          <CheckIcon className="size-3.5 shrink-0" aria-hidden />
          Termin abgestimmt: {stand.fenster}
        </p>
        <p className="text-xs text-muted-foreground">
          {stand.betrieb} und der Mieter sind sich einig. Die Bestätigung wartet im
          Freigabe-Center auf Sie.
        </p>
      </div>
    );
  }

  return (
    <div className={rahmen}>
      <p className="text-sm font-medium text-slate-800">
        {stand.betrieb} stimmt Termine direkt mit uns ab
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Wir schicken dem Betrieb einen Link, unter dem er drei Zeitfenster nennt – ohne
        Anmeldung, in zwanzig Sekunden auf dem Telefon erledigt. Der Mieter wählt eines
        aus, und Sie bekommen nur noch die Bestätigung vorgelegt.
      </p>
      <Button
        size="sm"
        variant="marke"
        disabled={laeuft}
        onClick={() =>
          starten(async () => {
            const ergebnis = await terminanfrageStellen({ slug, vorgangId });
            if (ergebnis.fehlgeschlagen) {
              setFehler(ergebnis.hinweis ?? "Hat nicht geklappt.");
              return;
            }
            setFehler(null);
            setMeldung(
              ergebnis.gespeichert
                ? (ergebnis.hinweis ?? "Link verschickt.")
                : "In dieser Vorschau nicht verschickt.",
            );
          })
        }
      >
        {laeuft ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
        Abstimmung übernehmen
      </Button>
      {meldung && (
        <p className="flex items-center gap-1.5 text-xs text-marke">
          <CheckIcon className="size-3.5 shrink-0" aria-hidden />
          {meldung}
        </p>
      )}
      {fehler && (
        <p className="flex items-start gap-1.5 text-xs text-prio-notfall">
          <AlertCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          {fehler}
        </p>
      )}
    </div>
  );
}

function ReiterKnopf({
  aktiv,
  onClick,
  symbol,
  children,
}: {
  aktiv: boolean;
  onClick: () => void;
  symbol: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={aktiv}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        aktiv
          ? "border-marke-rand bg-marke text-marke-kontrast"
          : "border-border bg-white text-slate-600 hover:border-marke-rand hover:text-marke",
      )}
    >
      {symbol}
      {children}
    </button>
  );
}

/** Bearbeitbarer Text mit Kopierknopf – bewusst kein starrer Baustein. */
function Textbaustein({
  beschriftung,
  text,
  haupt,
}: {
  beschriftung: string;
  text: string;
  haupt?: { beschriftung: string; symbol: React.ReactNode; href: string };
}) {
  const [inhalt, setInhalt] = useState(text);
  const [kopiert, setKopiert] = useState(false);

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(inhalt);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {
      // Ohne Zugriff auf die Zwischenablage bleibt der Text zum Markieren da.
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-700">{beschriftung}</p>
      <textarea
        value={inhalt}
        onChange={(e) => setInhalt(e.target.value)}
        rows={12}
        className="w-full rounded-md border border-input bg-white p-3 font-mono text-xs leading-relaxed focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="marke" onClick={kopieren}>
          {kopiert ? <CheckIcon /> : <CopyIcon />}
          {kopiert ? "Kopiert" : "Text kopieren"}
        </Button>
        {haupt && (
          <Button asChild size="sm" variant="outline">
            <a href={haupt.href}>
              {haupt.symbol}
              {haupt.beschriftung}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function Leitfaden({
  abschnitte,
  telefon,
  betrieb,
}: {
  abschnitte: { ueberschrift: string; punkte: string[] }[];
  telefon: string | null;
  betrieb: string | null;
}) {
  return (
    <div className="space-y-3">
      {telefon && (
        <Button asChild size="sm" variant="marke">
          <a href={`tel:${telefon.replace(/\s/g, "")}`}>
            <PhoneIcon />
            {betrieb ?? "Betrieb"} anrufen · {telefon}
          </a>
        </Button>
      )}

      {abschnitte.map((abschnitt) => (
        <div key={abschnitt.ueberschrift}>
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {abschnitt.ueberschrift}
          </p>
          <ul className="mt-1 space-y-1.5">
            {abschnitt.punkte.map((punkt) => (
              <li
                key={punkt}
                className="flex gap-2 text-sm leading-snug text-slate-700"
              >
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-marke" />
                {punkt}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Was danach passiert ist – in einem Zug festgehalten.
 *
 * Ohne diesen Abschluss bliebe die Übergabe eine Sackgasse: schöne Texte, und
 * der Vorgang steht danach genauso da wie vorher.
 */
function Abschluss({
  slug,
  vorgangId,
  status,
  daten,
}: {
  slug: string;
  vorgangId: string;
  status: VorgangStatus;
  daten: Bausteindaten;
}) {
  const [notiz, setNotiz] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();

  const melden = (ergebnis: Ergebnis, erfolg: string) => {
    if (ergebnis.fehlgeschlagen) {
      setFehler(ergebnis.hinweis ?? "Konnte nicht gespeichert werden.");
      return;
    }
    setFehler(null);
    setMeldung(
      ergebnis.gespeichert
        ? erfolg
        : `${erfolg} (in dieser Vorschau nicht gespeichert)`,
    );
  };

  const weiter = (neu: VorgangStatus, vermerk: string, erfolg: string) => {
    starten(async () => {
      melden(
        await vorgangWeiterschieben({ slug, vorgangId, status: neu, vermerk }),
        erfolg,
      );
    });
  };

  const vermerken = () => {
    const text = notiz.trim();
    if (!text) return;
    starten(async () => {
      const ergebnis = await notizEintragen({ slug, vorgangId, text });
      if (!ergebnis.fehlgeschlagen) setNotiz("");
      melden(ergebnis, "Vermerk in der Historie.");
    });
  };

  const offen = status === "neu" || status === "in_pruefung";

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs font-medium text-slate-700">Danach festhalten</p>

      <div className="flex flex-wrap gap-2">
        {offen && (
          <Button
            size="sm"
            variant="outline"
            disabled={laeuft}
            onClick={() =>
              weiter(
                "an_handwerker",
                `Auftrag an ${daten.betrieb ?? "den Partnerbetrieb"} erteilt`,
                "Auftrag erteilt.",
              )
            }
          >
            Auftrag erteilt
          </Button>
        )}
        {status !== "termin_vereinbart" && status !== "erledigt" && (
          <Button
            size="sm"
            variant="outline"
            disabled={laeuft}
            onClick={() =>
              weiter(
                "termin_vereinbart",
                "Termin mit dem Betrieb abgestimmt",
                "Termin vermerkt.",
              )
            }
          >
            Termin steht
          </Button>
        )}
        {status !== "erledigt" && (
          <Button
            size="sm"
            variant="outline"
            disabled={laeuft}
            onClick={() =>
              weiter("erledigt", "Vorgang abgeschlossen", "Abgeschlossen.")
            }
          >
            Erledigt
          </Button>
        )}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          rows={1}
          placeholder="Was war das Ergebnis? z. B. Betrieb kommt Donnerstag vormittag"
          className="max-h-24 min-h-9 flex-1 resize-none rounded-md border border-input px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-marke focus-visible:outline-none"
        />
        <Button
          size="sm"
          variant="marke"
          onClick={vermerken}
          disabled={laeuft || !notiz.trim()}
        >
          Vermerken
        </Button>
      </div>

      {meldung && (
        <p className="flex items-center gap-1.5 text-xs text-marke">
          <CheckIcon className="size-3.5 shrink-0" aria-hidden />
          {meldung}
        </p>
      )}
      {fehler && (
        <p className="flex items-start gap-1.5 text-xs text-prio-notfall">
          <AlertCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          {fehler}
        </p>
      )}
    </div>
  );
}
