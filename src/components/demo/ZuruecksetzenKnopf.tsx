"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcwIcon } from "lucide-react";

/**
 * Setzt die Demo auf den Ausgangszustand zurück.
 *
 * Sitzt in der Demo-Leiste, damit er von jeder Seite aus erreichbar ist –
 * bei einer Vorführung will man nicht erst navigieren müssen.
 */
export function ZuruecksetzenKnopf({ slug }: { slug: string }) {
  const router = useRouter();
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [uebergang, starteUebergang] = useTransition();

  const zuruecksetzen = async () => {
    if (laeuft) return;
    setLaeuft(true);
    setMeldung(null);

    try {
      const antwort = await fetch("/api/demo/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const ergebnis = await antwort.json();

      if (ergebnis.zurueckgesetzt) {
        setMeldung("Zurückgesetzt");
        starteUebergang(() => router.refresh());
      } else if (ergebnis.grund === "keine-datenbank") {
        setMeldung("Ohne Datenbank nicht nötig");
      } else {
        setMeldung(ergebnis.fehler ?? "Fehlgeschlagen");
      }
    } catch {
      setMeldung("Fehlgeschlagen");
    } finally {
      setLaeuft(false);
      setTimeout(() => setMeldung(null), 4000);
    }
  };

  return (
    <button
      type="button"
      onClick={zuruecksetzen}
      disabled={laeuft || uebergang}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-50"
      title="Beispieldaten auf den Ausgangszustand zurücksetzen"
    >
      <RotateCcwIcon
        className={laeuft || uebergang ? "size-3 animate-spin" : "size-3"}
      />
      {meldung ?? (laeuft ? "Setzt zurück…" : "Zurücksetzen")}
    </button>
  );
}
