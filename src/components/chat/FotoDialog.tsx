"use client";

import { InfoIcon } from "lucide-react";

import { szenarien } from "@config/scenarios";
import { chatRahmen } from "@config/chat-rahmen";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DemoFoto } from "./DemoFoto";

/**
 * Der Foto-Dialog.
 *
 * Zwei Betriebsarten:
 *  - ohne `optionen`: alle zehn Szenariobilder zur Auswahl (erste Meldung)
 *  - mit `optionen`: nur die Bilder, die als zweites Foto in Frage kommen
 */
export function FotoDialog({
  offen,
  onSchliessen,
  onAuswahl,
  optionen,
}: {
  offen: boolean;
  onSchliessen: () => void;
  onAuswahl: (datei: string, beschriftung: string) => void;
  optionen?: string[];
}) {
  const kacheln = optionen
    ? optionen.map((datei) => ({
        datei,
        beschriftung: beschriftungFuer(datei),
      }))
    : szenarien.map((s) => ({
        datei: s.foto,
        beschriftung: s.fotoBeschriftung,
      }));

  return (
    <Dialog open={offen} onOpenChange={(o) => !o && onSchliessen()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Foto senden</DialogTitle>
          <DialogDescription>
            {optionen
              ? "Wählen Sie das passende Bild aus."
              : "Wählen Sie aus, was Sie melden möchten."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {kacheln.map((kachel) => (
            <button
              key={kachel.datei}
              type="button"
              onClick={() => onAuswahl(kachel.datei, kachel.beschriftung)}
              className="group overflow-hidden rounded-md border border-border text-left transition-colors hover:border-marke focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <DemoFoto
                datei={kachel.datei}
                beschriftung={kachel.beschriftung}
                className="h-20 w-full"
              />
              <span className="block px-2 py-1.5 text-[11px] leading-tight font-medium text-slate-700">
                {kachel.beschriftung}
              </span>
            </button>
          ))}
        </div>

        <p className="flex items-start gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {chatRahmen.fotoHinweis}
        </p>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Beschriftung für ein Zweitfoto. Die Dateinamen sind sprechend aufgebaut
 * (motiv-perspektive.jpg), daraus lässt sich eine brauchbare Beschriftung
 * ableiten, ohne jede Kachel einzeln zu pflegen.
 */
function beschriftungFuer(datei: string): string {
  const basis = datei.replace(/\.[a-z]+$/i, "");
  const [motiv, perspektive] = basis.split("-");

  const motive: Record<string, string> = {
    silikonfuge: "Fuge",
    bad: "Bad",
    wand: "Wand",
    spuele: "Spüle",
    wasserhahn: "Wasserhahn",
    kueche: "Küche",
    thermostat: "Thermostat",
    heizkoerper: "Heizkörper",
    wohnzimmer: "Wohnzimmer",
    wasserfleck: "Wasserfleck",
    decke: "Decke",
    schimmel: "Schimmel",
    fenster: "Fenster",
    griffplatte: "Griffplatte",
    leuchte: "Leuchte",
    treppenhaus: "Treppenhaus",
    schalter: "Lichtschalter",
    siphon: "Siphon",
    dusche: "Dusche",
    kinderzimmer: "Kinderzimmer",
    klingeltableau: "Klingeltableau",
    hauseingang: "Hauseingang",
    flur: "Flur",
    muellraum: "Müllraum",
    hof: "Hof",
    container: "Container",
  };

  const perspektiven: Record<string, string> = {
    nah: "aus der Nähe",
    weit: "aus der Ferne",
    uebersicht: "Übersicht",
    detail: "Detail",
    gesamt: "gesamt",
    unterschrank: "Unterschrank",
    voll: "",
    dunkel: "",
  };

  const links = motive[motiv] ?? motiv;
  const rechts = perspektive ? (perspektiven[perspektive] ?? perspektive) : "";
  return rechts ? `${links} ${rechts}` : links;
}
