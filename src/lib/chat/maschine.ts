/**
 * Die Zustandsmaschine des Mieter-Chats.
 *
 * DEMO: Hier steckt keine künstliche Intelligenz. Die Maschine ist eine reine
 * Funktion – Zustand plus Ereignis ergibt neuen Zustand plus auszugebende
 * Nachrichten. Welche Diagnose "erkannt" wird, hängt allein davon ab, welche
 * Kachel im Foto-Dialog angetippt wurde.
 *
 * Der Ablauf ist generisch, die Inhalte kommen aus config/scenarios.ts und
 * config/chat-rahmen.ts. Ein neues Szenario braucht deshalb keine Änderung an
 * dieser Datei.
 *
 *   begruessung
 *        v
 *   eingabe ....... Freitext (Stichwortsuche) oder Foto
 *        v
 *   bestaetigung .. "Ist das korrekt?"  -> nein: zurück zu eingabe
 *        v
 *      Notfall? -> Sofortmaßnahme einblenden
 *        v
 *   zweitfoto ..... der entscheidende Moment: Nachfrage nach Kontext
 *        v
 *   Verfeinerung, Erkenntnis-Karte, Klassifizierung, Weiterleitung
 *        v
 *   terminwahl -> frei
 *
 * Ab "frei" jederzeit: Status abfragen, Rückruf buchen, neue Meldung.
 */

import { chatRahmen } from "@config/chat-rahmen";
import { demoKonfiguration } from "@config/demo";
import { szenarioAusText, szenarioNach, type Szenario } from "@config/scenarios";
import { grundNach, zeitwunschNach } from "@config/rueckruf-gruende";

import type { HandwerkerVorlage } from "@/lib/daten/typen";
import { handwerkerfenster } from "./termine";
import type {
  Ausgabe,
  ChatEreignis,
  ChatZustand,
  Meldung,
  SchrittErgebnis,
  Terminfenster,
} from "./typen";

const { tippenKurz, tippenLang, bildAnalyse } = demoKonfiguration.chat;

/** Was die Maschine über den Mandanten wissen muss. */
export type Umgebung = {
  firma: string;
  handwerker: HandwerkerVorlage[];
  /** Bezugszeitpunkt – als Parameter, damit Tests reproduzierbar sind. */
  jetzt?: Date;
};

export function anfangszustand(): ChatZustand {
  return {
    phase: "begruessung",
    nachrichten: [],
    angebot: { art: "keins" },
    szenarioId: null,
    betrieb: null,
    meldungen: [],
    zweitanfahrtVermieden: false,
    zweitfotoFehlversuche: 0,
    gewaehlterTermin: null,
    rueckruf: null,
  };
}

function betriebFuer(umgebung: Umgebung, gewerk: string): string {
  return (
    umgebung.handwerker.find((h) => h.gewerk === gewerk)?.firma ??
    umgebung.handwerker[0]?.firma ??
    "unseren Partnerbetrieb"
  );
}

function sagen(text: string, tippdauer: number = tippenKurz): Ausgabe {
  return { nachricht: { text }, tippdauer };
}

function meldungErgaenzen(
  zustand: ChatZustand,
  aenderung: Partial<Meldung>,
  schritt?: string,
): Meldung[] {
  const meldungen = [...zustand.meldungen];
  const letzte = meldungen[meldungen.length - 1];
  if (!letzte) return meldungen;

  meldungen[meldungen.length - 1] = {
    ...letzte,
    ...aenderung,
    schritte: schritt
      ? [...letzte.schritte, { was: schritt, zeit: new Date().toISOString() }]
      : letzte.schritte,
  };
  return meldungen;
}

/**
 * Der gemeinsame Abschluss aller Szenarien: Klassifizierung, Weiterleitung,
 * Terminfrage. Wird sowohl nach dem zweiten Foto erreicht als auch dann, wenn
 * der Mieter keines schickt.
 */
function weiterleiten(
  zustand: ChatZustand,
  szenario: Szenario,
  umgebung: Umgebung,
): SchrittErgebnis {
  const betrieb = betriebFuer(umgebung, szenario.gewerk);
  const notfall = szenario.prioritaet === "notfall";
  const ausgabe: Ausgabe[] = [];

  ausgabe.push({
    nachricht: {
      text: "Ich habe die Meldung eingeordnet:",
      karte: {
        art: "klassifizierung",
        prioritaet: szenario.prioritaet,
        gewerk: szenario.gewerk,
        kategorie: szenario.kategorie,
      },
    },
    tippdauer: tippenKurz,
  });

  ausgabe.push(
    sagen(
      notfall
        ? chatRahmen.weiterleitungNotfall(betrieb)
        : chatRahmen.weiterleitung(betrieb),
      tippenLang,
    ),
  );

  // Beim Notfall wird nicht nach Wunschterminen gefragt – der Notdienst fährt.
  if (notfall) {
    ausgabe.push(sagen(chatRahmen.abschluss, tippenKurz));
    return {
      zustand: {
        ...zustand,
        phase: "frei",
        betrieb,
        // Beim Notfall faehrt der Notdienst sofort – hier ist der Auftrag
        // wirklich raus, ohne Freigabe.
        meldungen: meldungErgaenzen(
          zustand,
          { status: "an_handwerker", betrieb },
          `Notdienst von ${betrieb} alarmiert`,
        ),
        angebot: { art: "frei" },
      },
      ausgabe,
    };
  }

  ausgabe.push(sagen(chatRahmen.terminfrage, tippenKurz));

  return {
    zustand: {
      ...zustand,
      phase: "terminwahl",
      betrieb,
      // Wichtig: NICHT "an_handwerker". Der Auftrag ist vorbereitet, nicht
      // erteilt. Erst die Freigabe im Dashboard schiebt ihn weiter – sonst
      // verspricht der Chat dem Mieter etwas, das noch gar nicht passiert ist.
      meldungen: meldungErgaenzen(
        zustand,
        { status: "in_pruefung", betrieb },
        `Auftrag für ${betrieb} vorbereitet, wartet auf Freigabe`,
      ),
      angebot: { art: "termin", fenster: handwerkerfenster(umgebung.jetzt) },
    },
    ausgabe,
  };
}

/** Diagnose eines erkannten Szenarios – erste Reaktion auf das Foto. */
function diagnostizieren(zustand: ChatZustand, szenario: Szenario): SchrittErgebnis {
  const neue: Meldung = {
    id: `m${zustand.meldungen.length + 1}`,
    szenarioId: szenario.id,
    titel: szenario.titel,
    nummer: null,
    status: "neu",
    prioritaet: szenario.prioritaet,
    betrieb: null,
    schritte: [{ was: "Meldung aufgenommen", zeit: new Date().toISOString() }],
  };

  return {
    zustand: {
      ...zustand,
      phase: "bestaetigung",
      szenarioId: szenario.id,
      meldungen: [...zustand.meldungen, neue],
      angebot: { art: "bestaetigung" },
    },
    ausgabe: [sagen(szenario.erkennung, bildAnalyse)],
  };
}

export function schritt(
  zustand: ChatZustand,
  ereignis: ChatEreignis,
  umgebung: Umgebung,
): SchrittErgebnis {
  const szenario = zustand.szenarioId
    ? szenarioNach.get(zustand.szenarioId)
    : undefined;

  switch (ereignis.art) {
    // -----------------------------------------------------------------------
    case "start":
      return {
        zustand: { ...zustand, phase: "eingabe", angebot: { art: "eingabe" } },
        ausgabe: [
          sagen(chatRahmen.begruessung(umgebung.firma), tippenKurz),
          sagen(chatRahmen.aufforderung, tippenKurz),
        ],
      };

    // -----------------------------------------------------------------------
    case "text": {
      const text = ereignis.text.trim();

      // "Status" funktioniert jederzeit, sobald eine Meldung existiert.
      if (/^status\b/i.test(text) && zustand.meldungen.length) {
        return schritt(zustand, { art: "status" }, umgebung);
      }
      if (/r(ü|ue)ckruf/i.test(text) && zustand.phase === "frei") {
        return schritt(zustand, { art: "rueckruf" }, umgebung);
      }

      if (zustand.phase === "eingabe") {
        const gefunden = szenarioAusText(text);
        if (gefunden) return diagnostizieren(zustand, gefunden);
        return {
          zustand: { ...zustand, angebot: { art: "eingabe" } },
          ausgabe: [sagen(chatRahmen.nichtVerstanden, tippenKurz)],
        };
      }

      // Freitext in anderen Phasen: freundlich zurück zum Ablauf führen.
      return {
        zustand,
        ausgabe: [
          sagen(
            zustand.phase === "frei"
              ? chatRahmen.abschluss
              : "Danke. Bitte nutzen Sie kurz die Schaltflächen unten, dann geht es schneller.",
            tippenKurz,
          ),
        ],
      };
    }

    // -----------------------------------------------------------------------
    case "foto": {
      // Erstes Foto: Szenario bestimmt sich aus der gewählten Kachel.
      if (zustand.phase === "eingabe" || zustand.phase === "begruessung") {
        const gefunden = [...szenarioNach.values()].find(
          (s) => s.foto === ereignis.datei,
        );
        if (!gefunden) {
          return {
            zustand,
            ausgabe: [sagen(chatRahmen.nichtVerstanden, tippenKurz)],
          };
        }
        return diagnostizieren(zustand, gefunden);
      }

      // Zweites Foto
      if (zustand.phase === "zweitfoto" && szenario) {
        const passt = ereignis.datei === szenario.zweitfoto.korrekt;

        // Ein Fehlversuch wird abgefangen, danach wird jedes Bild akzeptiert.
        // Sonst bliebe ein Interessent, der allein durch die Demo klickt,
        // im Zweifel hängen – und klickt weg.
        if (!passt && zustand.zweitfotoFehlversuche === 0) {
          return {
            zustand: {
              ...zustand,
              zweitfotoFehlversuche: 1,
              angebot: { art: "zweitfoto", optionen: szenario.zweitfoto.optionen },
            },
            ausgabe: [sagen(chatRahmen.zweitfotoUnpassend, tippenKurz)],
          };
        }

        const nachher = weiterleiten(
          { ...zustand, zweitanfahrtVermieden: true },
          szenario,
          umgebung,
        );

        return {
          zustand: nachher.zustand,
          ausgabe: [
            sagen(szenario.verfeinerung, bildAnalyse),
            {
              nachricht: {
                text: "Das erspart dem Betrieb voraussichtlich eine zweite Anfahrt.",
                karte: {
                  art: "erkenntnis",
                  vorher: szenario.erkenntnis.vorher,
                  nachher: szenario.erkenntnis.nachher,
                },
              },
              tippdauer: tippenKurz,
            },
            ...nachher.ausgabe,
          ],
        };
      }

      return { zustand, ausgabe: [] };
    }

    // -----------------------------------------------------------------------
    case "bestaetigung": {
      if (!szenario) return { zustand, ausgabe: [] };

      if (!ereignis.ja) {
        return {
          zustand: {
            ...zustand,
            phase: "eingabe",
            szenarioId: null,
            // Die gerade begonnene Meldung wieder verwerfen – sie war falsch.
            meldungen: zustand.meldungen.slice(0, -1),
            angebot: { art: "eingabe" },
          },
          ausgabe: [sagen(chatRahmen.korrekturAngebot, tippenKurz)],
        };
      }

      const ausgabe: Ausgabe[] = [];

      // Notfall: erst die Sofortmaßnahme, dann alles Weitere.
      if (szenario.sofortmassnahme) {
        ausgabe.push({
          nachricht: {
            text: szenario.sofortmassnahme,
            karte: { art: "sofortmassnahme", text: szenario.sofortmassnahme },
          },
          tippdauer: tippenKurz,
        });
      }

      ausgabe.push(sagen(szenario.zweitfoto.frage, tippenLang));

      return {
        zustand: {
          ...zustand,
          phase: "zweitfoto",
          angebot: { art: "zweitfoto", optionen: szenario.zweitfoto.optionen },
        },
        ausgabe,
      };
    }

    // -----------------------------------------------------------------------
    case "termin": {
      if (zustand.angebot.art !== "termin") return { zustand, ausgabe: [] };
      const gewaehlt: Terminfenster = zustand.angebot.fenster[ereignis.index];

      return {
        zustand: {
          ...zustand,
          phase: "frei",
          gewaehlterTermin: gewaehlt,
          meldungen: meldungErgaenzen(
            zustand,
            {},
            `Wunschtermin gewählt: ${gewaehlt.beschriftung}`,
          ),
          angebot: { art: "frei" },
        },
        ausgabe: [
          sagen(chatRahmen.terminBestaetigt(gewaehlt.beschriftung), tippenKurz),
          sagen(chatRahmen.abschluss, tippenKurz),
        ],
      };
    }

    // -----------------------------------------------------------------------
    // Rückruf in zwei Schritten: erst das Thema, dann die Erreichbarkeit.
    // Bewusst kein fester Termin bei einer namentlich genannten Person –
    // die Zuordnung macht die Verwaltung im Dashboard.
    case "rueckruf":
      return {
        zustand: {
          ...zustand,
          phase: "rueckrufGrund",
          rueckruf: {},
          angebot: { art: "rueckrufGrund" },
        },
        ausgabe: [sagen(chatRahmen.rueckrufFrage, tippenKurz)],
      };

    case "rueckrufGrund": {
      const grund = grundNach.get(ereignis.grundId);
      if (!grund) return { zustand, ausgabe: [] };

      return {
        zustand: {
          ...zustand,
          phase: "rueckrufZeit",
          rueckruf: { grundId: grund.id, grundBezeichnung: grund.bezeichnung },
          angebot: { art: "rueckrufZeit" },
        },
        ausgabe: [sagen(chatRahmen.rueckrufZeitFrage, tippenKurz)],
      };
    }

    case "rueckrufZeit": {
      const zeit = zeitwunschNach.get(ereignis.zeitwunschId);
      if (!zeit || !zustand.rueckruf?.grundBezeichnung) {
        return { zustand, ausgabe: [] };
      }

      return {
        zustand: {
          ...zustand,
          phase: "frei",
          angebot: { art: "frei" },
          rueckruf: {
            ...zustand.rueckruf,
            zeitwunschId: zeit.id,
            zeitwunschBezeichnung: zeit.bezeichnung,
          },
        },
        ausgabe: [
          sagen(
            chatRahmen.rueckrufBestaetigt(
              zustand.rueckruf.grundBezeichnung,
              zeit.bezeichnung,
            ),
            tippenKurz,
          ),
        ],
      };
    }

    // -----------------------------------------------------------------------
    case "status":
      if (!zustand.meldungen.length) {
        return {
          zustand,
          ausgabe: [
            sagen("Sie haben aktuell keine offene Meldung bei uns.", tippenKurz),
          ],
        };
      }
      return {
        zustand,
        ausgabe: [
          {
            nachricht: {
              text:
                zustand.meldungen.length === 1
                  ? chatRahmen.statusEinleitung
                  : chatRahmen.statusEinleitungMehrere(zustand.meldungen.length),
              karte: { art: "status", meldungen: zustand.meldungen },
            },
            tippdauer: tippenKurz,
          },
        ],
      };

    // -----------------------------------------------------------------------
    case "neueMeldung":
      return {
        zustand: {
          ...anfangszustand(),
          phase: "eingabe",
          nachrichten: zustand.nachrichten,
          // Bestehende Meldungen bleiben erhalten – der Mieter kann mehrere
          // Sachen gleichzeitig laufen haben.
          meldungen: zustand.meldungen,
          angebot: { art: "eingabe" },
        },
        ausgabe: [sagen(chatRahmen.aufforderung, tippenKurz)],
      };
  }
}
