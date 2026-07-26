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
import {
  istKleinreparatur,
  kleinreparaturen,
  selbsthilfeFuer,
  videoLink,
} from "@config/kleinreparaturen";
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
    selbsthilfeAngeboten: false,
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

/** Die Einstufungskarte – sieht der Mieter in jedem Fall. */
function klassifizierung(szenario: Szenario): Ausgabe {
  return {
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
  };
}

/**
 * Nach der Einstufung: Fällt der Fall unter die Kleinreparaturklausel und
 * gibt es einen gefahrlosen Selbsthilfe-Tipp, wird er angeboten.
 *
 * Für den Mieter heißt das: keine Kosten. Für die Verwaltung: kein
 * Handwerkereinsatz. Das ist einer der wenigen Punkte, an denen beide Seiten
 * gewinnen – und deshalb im Verkaufsgespräch stark.
 *
 * Angeboten wird nur, niemals aufgefordert: Die Klausel überträgt die Kosten,
 * nicht die Pflicht zu reparieren. Siehe config/kleinreparaturen.ts
 */
function selbsthilfeMoeglich(szenario: Szenario): boolean {
  if (szenario.prioritaet === "notfall") return false;
  if (!selbsthilfeFuer(szenario.id)) return false;
  if (szenario.kostenschaetzungEuro < kleinreparaturen.mindestbetragFuerTippEuro) {
    return false;
  }
  return istKleinreparatur(szenario.kostenschaetzungEuro, kleinreparaturen.grenzeEuro);
}

function selbsthilfeAnbieten(
  zustand: ChatZustand,
  szenario: Szenario,
): SchrittErgebnis {
  const tipp = selbsthilfeFuer(szenario.id)!;

  return {
    zustand: {
      ...zustand,
      phase: "selbsthilfe",
      angebot: { art: "selbsthilfe" },
      meldungen: meldungErgaenzen(zustand, {}, "Als Kleinreparatur eingestuft"),
    },
    ausgabe: [
      klassifizierung(szenario),
      {
        nachricht: {
          text: chatRahmen.kleinreparaturHinweis(
            szenario.kostenschaetzungEuro,
            kleinreparaturen.grenzeEuro,
          ),
          karte: {
            art: "kleinreparatur",
            kostenEuro: szenario.kostenschaetzungEuro,
            grenzeEuro: kleinreparaturen.grenzeEuro,
          },
        },
        tippdauer: tippenLang,
      },
      sagen(chatRahmen.selbsthilfeFrage(tipp.dauerMinuten), tippenKurz),
    ],
  };
}

/**
 * Der gemeinsame Abschluss: Weiterleitung und Terminfrage. Wird erreicht,
 * wenn keine Selbsthilfe in Frage kommt oder der Mieter sie ablehnt.
 */
function beauftragen(
  zustand: ChatZustand,
  szenario: Szenario,
  umgebung: Umgebung,
  mitKlassifizierung = true,
): SchrittErgebnis {
  const betrieb = betriebFuer(umgebung, szenario.gewerk);
  const notfall = szenario.prioritaet === "notfall";
  const ausgabe: Ausgabe[] = [];

  if (mitKlassifizierung) ausgabe.push(klassifizierung(szenario));

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
      // erteilt. Erst die Freigabe im Dashboard schiebt ihn weiter.
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

/** Weiche nach der verfeinerten Diagnose. */
function weiterleiten(
  zustand: ChatZustand,
  szenario: Szenario,
  umgebung: Umgebung,
): SchrittErgebnis {
  return selbsthilfeMoeglich(szenario)
    ? selbsthilfeAnbieten(zustand, szenario)
    : beauftragen(zustand, szenario, umgebung);
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
    // Selbsthilfe: Der Mieter entscheidet, ob er den Tipp will.
    case "selbsthilfe": {
      if (!szenario) return { zustand, ausgabe: [] };

      if (!ereignis.annehmen) {
        // Ablehnen ist völlig in Ordnung und wird auch so beantwortet.
        const nachher = beauftragen(zustand, szenario, umgebung, false);
        return {
          zustand: nachher.zustand,
          ausgabe: [
            sagen(chatRahmen.selbsthilfeAbgelehnt, tippenKurz),
            ...nachher.ausgabe,
          ],
        };
      }

      const tipp = selbsthilfeFuer(szenario.id)!;
      return {
        zustand: {
          ...zustand,
          phase: "selbsthilfeErgebnis",
          selbsthilfeAngeboten: true,
          angebot: { art: "selbsthilfeErgebnis" },
          meldungen: meldungErgaenzen(
            zustand,
            {},
            "Anleitung zur Selbsthilfe erhalten",
          ),
        },
        ausgabe: [
          {
            nachricht: {
              text: "Gern, so gehen Sie vor:",
              karte: {
                art: "anleitung",
                titel: tipp.titel,
                dauerMinuten: tipp.dauerMinuten,
                material: tipp.material,
                schritte: tipp.schritte,
                videoUrl: videoLink(tipp.videoSuche),
                abbruchHinweis: tipp.abbruchHinweis,
              },
            },
            tippdauer: tippenLang,
          },
          sagen(chatRahmen.selbsthilfeErfolgFrage, tippenKurz),
        ],
      };
    }

    case "selbsthilfeErfolg": {
      if (!szenario) return { zustand, ausgabe: [] };

      if (ereignis.geklappt) {
        return {
          zustand: {
            ...zustand,
            phase: "frei",
            angebot: { art: "frei" },
            meldungen: meldungErgaenzen(
              zustand,
              { status: "erledigt" },
              "Vom Mieter selbst behoben – kein Handwerkereinsatz nötig",
            ),
          },
          ausgabe: [sagen(chatRahmen.selbsthilfeGeklappt, tippenKurz)],
        };
      }

      const nachher = beauftragen(zustand, szenario, umgebung, false);
      return {
        zustand: nachher.zustand,
        ausgabe: [
          sagen(chatRahmen.selbsthilfeNichtGeklappt, tippenKurz),
          ...nachher.ausgabe,
        ],
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
