"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Meldet, dass und wie lange die Demo angesehen wird.
 *
 * Rendert nichts. Läuft im Hintergrund mit und schickt alle 20 Sekunden die
 * bisherige Verweildauer – so geht die Information auch dann nicht verloren,
 * wenn der Tab einfach geschlossen wird.
 *
 * Speichert nichts im Browser außer einer zufälligen Sitzungskennung im
 * sessionStorage. Die verschwindet mit dem Tab; eine Wiedererkennung beim
 * nächsten Besuch gibt es bewusst nicht.
 */
export function Aufrufzaehler({ slug }: { slug: string }) {
  const pfad = usePathname();
  const beginn = useRef(Date.now());
  const erstkontaktGemeldet = useRef(false);

  useEffect(() => {
    let sitzung = sessionStorage.getItem("melda_sitzung");
    if (!sitzung) {
      sitzung = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("melda_sitzung", sitzung);
    }

    const melden = (pfadName: string, dauer: number) => {
      const inhalt = JSON.stringify({
        slug,
        sitzung,
        pfad: pfadName,
        dauer,
        verweis: document.referrer || undefined,
      });

      // sendBeacon überlebt das Schließen des Tabs, fetch nicht immer.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/tracking",
          new Blob([inhalt], { type: "application/json" }),
        );
      } else {
        void fetch("/api/tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: inhalt,
          keepalive: true,
        }).catch(() => {});
      }
    };

    // Einmal je Sitzung: Das ist der Aufruf, der im Admin gezählt wird.
    if (!erstkontaktGemeldet.current && !sessionStorage.getItem("melda_erstkontakt")) {
      sessionStorage.setItem("melda_erstkontakt", "1");
      erstkontaktGemeldet.current = true;
      melden("erstkontakt", 0);
    }

    const start = Date.now();
    const takt = setInterval(() => {
      melden(pfad, Math.round((Date.now() - beginn.current) / 1000));
    }, 20_000);

    const beimVerlassen = () => {
      melden(pfad, Math.round((Date.now() - beginn.current) / 1000));
    };
    document.addEventListener("visibilitychange", beimVerlassen);

    return () => {
      clearInterval(takt);
      document.removeEventListener("visibilitychange", beimVerlassen);
      // Beim Seitenwechsel die Zeit auf dieser Seite festhalten.
      melden(pfad, Math.round((Date.now() - start) / 1000));
    };
  }, [slug, pfad]);

  return null;
}
