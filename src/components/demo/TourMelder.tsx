"use client";

import { useEffect } from "react";

import { tourMelden } from "@/lib/tour/ereignisse";

/**
 * Meldet der Tour, dass eine Seite erreicht wurde.
 *
 * Für Stationen, deren Handlung das Öffnen selbst ist – etwa "öffnen Sie
 * Ihre Meldung". Dort gibt es kein Feld und keinen Knopf, an den sich ein
 * Ereignis hängen ließe, und ein künstlicher Bestätigungsklick wäre genau
 * der Weiter-Knopf, den diese Tour nicht haben soll.
 *
 * Ohne laufende Tour verpufft der Aufruf; die Seite weiß nichts von ihr.
 */
export function TourMelder({ was }: { was: string }) {
  useEffect(() => {
    tourMelden(was);
  }, [was]);

  return null;
}
