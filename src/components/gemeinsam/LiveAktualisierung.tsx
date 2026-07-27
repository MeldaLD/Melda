"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRightIcon, BellIcon, XIcon } from "lucide-react";

import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Hält das Dashboard live.
 *
 * Abonniert über Supabase Realtime die Tabellen, die sich während einer
 * Vorführung ändern können. Kommt ein Ereignis, wird die Seite serverseitig
 * neu gerendert (router.refresh) – dadurch bleibt die ganze Datenbeschaffung
 * in den Server Components und muss nicht im Browser nachgebaut werden.
 *
 * Zusätzlich erscheint ein Hinweis, wenn ein neuer Vorgang eingeht. Ohne den
 * würde der Moment untergehen: Die Zahlen ändern sich still, und der
 * Betrachter merkt nicht, dass gerade seine eigene Chat-Meldung angekommen ist.
 */
export function LiveAktualisierung({
  tenantId,
  basis,
}: {
  tenantId: string;
  /** Basispfad des Dashboards, für den Sprung zum neuen Vorgang. */
  basis: string;
}) {
  const router = useRouter();
  const [neuerVorgang, setNeuerVorgang] = useState<{
    id: string;
    titel: string;
  } | null>(null);
  // Ohne Datenbank gibt es nichts zu abonnieren.
  const aktiv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const letzteAktualisierung = useRef(0);

  useEffect(() => {
    if (!aktiv) return;

    const supabase = supabaseBrowser();

    /** Mehrere Ereignisse kurz hintereinander lösen nur eine Aktualisierung aus. */
    const aktualisieren = () => {
      const jetzt = Date.now();
      if (jetzt - letzteAktualisierung.current < 600) return;
      letzteAktualisierung.current = jetzt;
      router.refresh();
    };

    const kanal = supabase
      .channel(`dashboard:${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vorgaenge",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (ereignis) => {
          if (ereignis.eventType === "INSERT") {
            const neu = ereignis.new as { id?: string; titel?: string };
            if (neu?.id) {
              setNeuerVorgang({ id: neu.id, titel: neu.titel ?? "Neue Meldung" });
            }
          }
          aktualisieren();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "freigaben",
          filter: `tenant_id=eq.${tenantId}`,
        },
        aktualisieren,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "nachrichten",
          filter: `tenant_id=eq.${tenantId}`,
        },
        aktualisieren,
      )
      // Rückrufwünsche aus dem Chat landen hier – sie
      // erscheinen unter "Rückrufe & Termine" und sollen dort nicht auf ein
      // manuelles Neuladen warten müssen.
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "termine",
          filter: `tenant_id=eq.${tenantId}`,
        },
        aktualisieren,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(kanal);
    };
  }, [aktiv, tenantId, router]);

  if (!neuerVorgang) return null;

  return (
    <div className="fixed top-14 left-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-marke-rand bg-white py-1.5 pr-1.5 pl-4 shadow-lg">
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-marke opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-marke" />
        </span>
        <BellIcon className="size-4 shrink-0 text-marke" aria-hidden />

        {/* Anklickbar: führt direkt zum eben eingegangenen Vorgang. */}
        <Link
          href={`${basis}/vorgaenge/${neuerVorgang.id}`}
          onClick={() => setNeuerVorgang(null)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block text-sm leading-tight font-medium">
            Neue Meldung eingegangen
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {neuerVorgang.titel} · ansehen
          </span>
        </Link>

        <ArrowRightIcon className="size-3.5 shrink-0 text-marke" aria-hidden />
        <button
          type="button"
          onClick={() => setNeuerVorgang(null)}
          aria-label="Hinweis schließen"
          className="shrink-0 rounded-full p-1.5 text-slate-400 hover:text-slate-700"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
