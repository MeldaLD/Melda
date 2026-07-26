"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellIcon, XIcon } from "lucide-react";

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
export function LiveAktualisierung({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [neueMeldung, setNeueMeldung] = useState(false);
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
          if (ereignis.eventType === "INSERT") setNeueMeldung(true);
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
      .subscribe();

    return () => {
      void supabase.removeChannel(kanal);
    };
  }, [aktiv, tenantId, router]);

  if (!neueMeldung) return null;

  return (
    <div className="fixed top-14 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2.5 rounded-full border border-marke-rand bg-white py-2 pr-2 pl-4 shadow-lg">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-marke opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-marke" />
        </span>
        <BellIcon className="size-4 text-marke" aria-hidden />
        <span className="text-sm font-medium">Neue Meldung eingegangen</span>
        <button
          type="button"
          onClick={() => setNeueMeldung(false)}
          aria-label="Hinweis schließen"
          className="rounded-full p-1 text-slate-400 hover:text-slate-700"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
