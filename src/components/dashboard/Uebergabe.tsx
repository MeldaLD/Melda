"use client";

import { useState, useTransition } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  CopyIcon,
  MailIcon,
  MessageSquareIcon,
  PhoneIcon,
} from "lucide-react";

import {
  handwerkerEmail,
  mieterNachricht,
  telefonleitfaden,
  type Bausteindaten,
} from "@config/bausteine";
import {
  notizEintragen,
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
}: {
  slug: string;
  vorgangId: string;
  status: VorgangStatus;
  daten: Bausteindaten;
  betriebTelefon: string | null;
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
