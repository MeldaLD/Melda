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
 *   erreichbarkeit  Wann sind Sie erreichbar? - KEIN Termin. Die Zeitfenster
 *        v          nennt der Betrieb, siehe config/abstimmung.ts.
 *   frei
 *
 * Ab "frei" jederzeit: Status abfragen, Rückruf buchen, neue Meldung.
 */

import { anliegenNach } from "@config/anliegen";
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
import type {
  Ausgabe,
  ChatEreignis,
  ChatZustand,
  Meldung,
  SchrittErgebnis,
} from "./typen";

const { tippenKurz, tippenLang, bildAnalyse } = demoKonfiguration.chat;

/** Was die Maschine über den Mandanten wissen muss. */
export type Umgebung = {
  firma: string;
  handwerker: HandwerkerVorlage[];
  /**
   * Höchstbetrag der Kleinreparaturklausel dieses Mandanten. Wird in den
   * Einstellungen des Dashboards gepflegt; ohne Angabe gilt der Standard.
   */
  kleinreparaturGrenzeEuro?: number;
  /** Bezugszeitpunkt – als Parameter, damit Tests reproduzierbar sind. */
  jetzt?: Date;
};

function grenze(umgebung: Umgebung): number {
  return umgebung.kleinreparaturGrenzeEuro ?? kleinreparaturen.grenzeEuro;
}

export function anfangszustand(): ChatZustand {
  return {
    phase: "begruessung",
    nachrichten: [],
    angebot: { art: "keins" },
    anliegenId: null,
    szenarioId: null,
    betrieb: null,
    meldungen: [],
    zweitanfahrtVermieden: false,
    zweitfotoFehlversuche: 0,
    erreichbarkeitId: null,
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

/**
 * Eine Nachricht des Assistenten.
 *
 * Der dritte Parameter markiert, welcher Schritt aus config/ki-einsatz.ts
 * diese Zeile erzeugt hat. Er ist nur für die zuschaltbare Technikansicht
 * da – der Mieter sieht davon nichts. Bleibt er leer, gilt der Schritt als
 * hinterlegter Text ohne Besonderheit.
 */
function sagen(
  text: string,
  tippdauer: number = tippenKurz,
  kiSchritt?: string,
): Ausgabe {
  return { nachricht: { text, kiSchritt }, tippdauer };
}

/**
 * Antwort auf ein Foto.
 *
 * Sieht aus wie sagen(), sagt der Oberfläche aber, dass hier ein Bild
 * ausgewertet wird. Der Mieter sieht dann nicht "tippt gerade", sondern
 * "wertet das Bild aus" – und wartet dieselben zwei Sekunden deutlich
 * geduldiger, weil er weiß, worauf.
 */
function auswerten(text: string): Ausgabe {
  return {
    nachricht: { text, kiSchritt: "bild" },
    tippdauer: bildAnalyse,
    taetigkeit: "auswerten",
  };
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
      kiSchritt: "bild",
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
function selbsthilfeMoeglich(szenario: Szenario, umgebung: Umgebung): boolean {
  if (szenario.prioritaet === "notfall") return false;
  if (!selbsthilfeFuer(szenario.id)) return false;
  if (szenario.kostenschaetzungEuro < kleinreparaturen.mindestbetragFuerTippEuro) {
    return false;
  }
  return istKleinreparatur(szenario.kostenschaetzungEuro, grenze(umgebung));
}

function selbsthilfeAnbieten(
  zustand: ChatZustand,
  szenario: Szenario,
  umgebung: Umgebung,
): SchrittErgebnis {
  const tipp = selbsthilfeFuer(szenario.id)!;
  const grenzeEuro = grenze(umgebung);

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
            grenzeEuro,
          ),
          kiSchritt: "kleinreparatur",
          karte: {
            art: "kleinreparatur",
            kostenEuro: szenario.kostenschaetzungEuro,
            grenzeEuro,
          },
        },
        tippdauer: tippenLang,
      },
      sagen(
        chatRahmen.selbsthilfeFrage(tipp.dauerMinuten),
        tippenKurz,
        "kleinreparatur",
      ),
    ],
  };
}

/**
 * Der gemeinsame Abschluss: Weiterleitung und die Frage nach der
 * Erreichbarkeit. Wird erreicht, wenn keine Selbsthilfe in Frage kommt oder
 * der Mieter sie ablehnt.
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
      "mieterantwort",
    ),
  );

  // Arbeiten ohne Zutritt zur Wohnung – Leerung, Treppenhaus, Hauseingang.
  // Nach einem Zeitfenster zu fragen, das niemand braucht, ist Leerlauf.
  if (szenario.ohneTermin) {
    ausgabe.push(sagen(szenario.ohneTermin, tippenKurz));
    return {
      zustand: {
        ...zustand,
        phase: "frei",
        betrieb,
        meldungen: meldungErgaenzen(
          zustand,
          { status: "an_handwerker", betrieb },
          `An ${betrieb} übermittelt`,
        ),
        angebot: { art: "frei" },
      },
      ausgabe,
    };
  }

  // Beim Notfall wird gar nicht erst nach Zeiten gefragt – der Notdienst fährt.
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

  ausgabe.push(sagen(chatRahmen.erreichbarkeitFrage, tippenKurz, "zusagen"));

  return {
    zustand: {
      ...zustand,
      phase: "erreichbarkeit",
      betrieb,
      // Wichtig: NICHT "an_handwerker". Der Auftrag ist vorbereitet, nicht
      // erteilt. Erst die Freigabe im Dashboard schiebt ihn weiter.
      meldungen: meldungErgaenzen(
        zustand,
        { status: "in_pruefung", betrieb },
        `Auftrag für ${betrieb} vorbereitet, wartet auf Freigabe`,
      ),
      angebot: { art: "erreichbarkeit" },
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
  return selbsthilfeMoeglich(szenario, umgebung)
    ? selbsthilfeAnbieten(zustand, szenario, umgebung)
    : beauftragen(zustand, szenario, umgebung);
}

/** Diagnose eines erkannten Szenarios – erste Reaktion auf das Foto. */
function diagnostizieren(zustand: ChatZustand, szenario: Szenario): SchrittErgebnis {
  const neue: Meldung = {
    id: `m${zustand.meldungen.length + 1}`,
    szenarioId: szenario.id,
    titel: szenario.titel,
    nummer: null,
    vorgangId: null,
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
    ausgabe: [auswerten(szenario.erkennung)],
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
        zustand: { ...zustand, phase: "anliegen", angebot: { art: "anliegen" } },
        ausgabe: [
          sagen(chatRahmen.begruessung(umgebung.firma), tippenKurz, "einstieg"),
          sagen(chatRahmen.anliegenFrage, tippenKurz, "einstieg"),
        ],
      };

    // -----------------------------------------------------------------------
    // Der Einstieg. Zu jedem Thema kommt zuerst eine Antwort, mit der es
    // meistens erledigt ist – der Rückruf steht erst dahinter.
    case "anliegen": {
      const gewaehlt = anliegenNach.get(ereignis.anliegenId);
      if (!gewaehlt) return { zustand, ausgabe: [] };

      if (gewaehlt.istSchaden) {
        return {
          zustand: { ...zustand, phase: "eingabe", angebot: { art: "eingabe" } },
          ausgabe: [sagen(chatRahmen.aufforderung, tippenKurz, "einstieg")],
        };
      }

      // Nach dem Stand einer Meldung fragt man nicht lange – zeigen.
      if (gewaehlt.id === "stand") {
        return schritt(zustand, { art: "status" }, umgebung);
      }

      // "Etwas anderes" hat keine Schritte: Da hilft nur zuhören.
      if (!gewaehlt.schritte?.length) {
        return {
          zustand: {
            ...zustand,
            phase: "frei",
            anliegenId: gewaehlt.id,
            angebot: { art: "frei" },
          },
          ausgabe: [
            sagen(gewaehlt.auskunft ?? chatRahmen.aufforderung, tippenLang, "auskunft"),
          ],
        };
      }

      return {
        zustand: {
          ...zustand,
          phase: "auskunft",
          anliegenId: gewaehlt.id,
          angebot: { art: "auskunft" },
        },
        ausgabe: [
          {
            nachricht: {
              text: gewaehlt.auskunft ?? "",
              kiSchritt: "auskunft",
              karte: {
                art: "auskunft",
                titel: gewaehlt.bezeichnung,
                schritte: gewaehlt.schritte,
              },
            },
            tippdauer: tippenLang,
          },
          sagen(chatRahmen.auskunftNachfrage, tippenKurz, "auskunft"),
        ],
      };
    }

    case "auskunft": {
      if (ereignis.geholfen) {
        return {
          zustand: { ...zustand, phase: "frei", angebot: { art: "frei" } },
          ausgabe: [sagen(chatRahmen.auskunftGeholfen, tippenKurz)],
        };
      }
      // Erst jetzt kommt das Telefon ins Spiel.
      return {
        zustand: { ...zustand, phase: "frei", angebot: { art: "frei" } },
        ausgabe: [sagen(chatRahmen.auskunftNichtGeholfen, tippenKurz)],
      };
    }

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

      // Auch im Einstieg: Wer gleich lostippt, statt ein Thema anzutippen,
      // soll verstanden werden. Ihn auf die Knöpfe zu verweisen wäre genau
      // die Bevormundung, die wir den Portalen vorwerfen.
      if (zustand.phase === "eingabe" || zustand.phase === "anliegen") {
        const gefunden = szenarioAusText(text);
        if (gefunden) return diagnostizieren(zustand, gefunden);
        return {
          zustand: { ...zustand, phase: "eingabe", angebot: { art: "eingabe" } },
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
            ausgabe: [sagen(chatRahmen.nichtVerstanden, tippenKurz, "freitext")],
          };
        }
        return diagnostizieren(zustand, gefunden);
      }

      // Zweites Foto
      const zweitfoto = szenario?.zweitfoto;
      if (zustand.phase === "zweitfoto" && szenario && zweitfoto) {
        const passt = ereignis.datei === zweitfoto.korrekt;

        // Ein Fehlversuch wird abgefangen, danach wird jedes Bild akzeptiert.
        // Sonst bliebe ein Interessent, der allein durch die Demo klickt,
        // im Zweifel hängen – und klickt weg.
        if (!passt && zustand.zweitfotoFehlversuche === 0) {
          return {
            zustand: {
              ...zustand,
              zweitfotoFehlversuche: 1,
              angebot: { art: "zweitfoto", optionen: zweitfoto.optionen },
            },
            ausgabe: [sagen(chatRahmen.zweitfotoUnpassend, tippenKurz, "zweitfoto")],
          };
        }

        const nachher = weiterleiten(
          { ...zustand, zweitanfahrtVermieden: true },
          szenario,
          umgebung,
        );

        const erkenntnis = szenario.erkenntnis;
        return {
          zustand: nachher.zustand,
          ausgabe: [
            auswerten(szenario.verfeinerung ?? chatRahmen.keineWeitereFrage),
            ...(erkenntnis
              ? [
                  {
                    nachricht: {
                      text: "Das erspart dem Betrieb voraussichtlich eine zweite Anfahrt.",
                      kiSchritt: "zweitfoto",
                      karte: {
                        art: "erkenntnis" as const,
                        vorher: erkenntnis.vorher,
                        nachher: erkenntnis.nachher,
                      },
                    },
                    tippdauer: tippenKurz,
                  },
                ]
              : []),
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
            kiSchritt: "sofortmassnahme",
            karte: { art: "sofortmassnahme", text: szenario.sofortmassnahme },
          },
          tippdauer: tippenKurz,
        });
      }

      // Nicht jede Meldung verdient eine Nachfrage. Wo kein Betrieb fährt
      // oder zuerst ein Selbsthilfe-Tipp dran ist, sagt der Assistent das
      // und macht weiter. Siehe die Regel in config/scenarios.ts – dass er
      // auch mal nicht nachfragt, macht die übrigen Nachfragen glaubwürdig.
      if (!szenario.zweitfoto) {
        ausgabe.push(
          sagen(
            szenario.ohneZweitfoto ?? chatRahmen.keineWeitereFrage,
            tippenKurz,
            "zweitfoto",
          ),
        );
        const weiter = weiterleiten(zustand, szenario, umgebung);
        return { zustand: weiter.zustand, ausgabe: [...ausgabe, ...weiter.ausgabe] };
      }

      ausgabe.push(sagen(szenario.zweitfoto.frage, tippenLang, "zweitfoto"));

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
    // Die Erreichbarkeit ist eine Angabe, kein Termin. Sie geht mit der
    // Anfrage an den Betrieb; die Zeitfenster nennt dann er.
    case "erreichbarkeit": {
      const zeit = zeitwunschNach.get(ereignis.zeitwunschId);
      if (!zeit) return { zustand, ausgabe: [] };

      return {
        zustand: {
          ...zustand,
          phase: "frei",
          erreichbarkeitId: zeit.id,
          meldungen: meldungErgaenzen(
            zustand,
            {},
            `Erreichbarkeit: ${zeit.bezeichnung}`,
          ),
          angebot: { art: "frei" },
        },
        ausgabe: [
          sagen(
            chatRahmen.erreichbarkeitNotiert(zeit.bezeichnung),
            tippenKurz,
            "zusagen",
          ),
          sagen(chatRahmen.abschluss, tippenKurz),
        ],
      };
    }

    // -----------------------------------------------------------------------
    // Rückruf in zwei Schritten: erst das Thema, dann die Erreichbarkeit.
    // Bewusst kein fester Termin bei einer namentlich genannten Person –
    // die Zuordnung macht die Verwaltung im Dashboard.
    case "rueckruf": {
      // Wer am Anfang schon gesagt hat, worum es geht, soll nicht dieselbe
      // Frage zweimal beantworten. Die Themen des Einstiegs und die
      // Rückrufgründe tragen absichtlich dieselben Schlüssel.
      const ausAnliegen = zustand.anliegenId
        ? grundNach.get(zustand.anliegenId)
        : undefined;

      if (ausAnliegen) {
        return {
          zustand: {
            ...zustand,
            phase: "rueckrufZeit",
            rueckruf: {
              grundId: ausAnliegen.id,
              grundBezeichnung: ausAnliegen.bezeichnung,
            },
            angebot: { art: "rueckrufZeit" },
          },
          ausgabe: [
            sagen(chatRahmen.rueckrufUebernommen(ausAnliegen.bezeichnung), tippenKurz),
          ],
        };
      }

      return {
        zustand: {
          ...zustand,
          phase: "rueckrufGrund",
          rueckruf: {},
          angebot: { art: "rueckrufGrund" },
        },
        ausgabe: [sagen(chatRahmen.rueckrufFrage, tippenKurz)],
      };
    }

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
    case "status": {
      if (!zustand.meldungen.length) {
        return {
          zustand,
          ausgabe: [
            sagen("Sie haben aktuell keine offene Meldung bei uns.", tippenKurz),
          ],
        };
      }

      const ausgabe: Ausgabe[] = [
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
      ];

      // Hat ein Betrieb inzwischen Zeitfenster genannt, ist das die
      // wichtigste Nachricht des Tages – deshalb direkt hinter dem Status
      // und nicht irgendwo im Verlauf vergraben.
      const offen = zustand.meldungen.find(
        (m) => m.terminauswahl && m.terminauswahl.vorschlaege.length,
      );
      if (offen?.terminauswahl) {
        ausgabe.push(
          sagen(chatRahmen.terminauswahlFrage(offen.titel), tippenKurz, "zusagen"),
        );
        return {
          zustand: {
            ...zustand,
            angebot: {
              art: "terminauswahl",
              token: offen.terminauswahl.token,
              fenster: offen.terminauswahl.vorschlaege,
            },
          },
          ausgabe,
        };
      }

      return { zustand, ausgabe };
    }

    // -----------------------------------------------------------------------
    case "terminauswahl": {
      if (zustand.angebot.art !== "terminauswahl") return { zustand, ausgabe: [] };
      const { token } = zustand.angebot;
      const gewaehlt = zustand.angebot.fenster[ereignis.index];
      if (!gewaehlt) return { zustand, ausgabe: [] };

      return {
        zustand: {
          ...zustand,
          phase: "frei",
          angebot: { art: "frei" },
          // Die Auswahl ist erledigt – sie soll beim nächsten Status nicht
          // erneut angeboten werden.
          meldungen: zustand.meldungen.map((m) =>
            m.terminauswahl?.token === token
              ? {
                  ...m,
                  terminauswahl: null,
                  schritte: [
                    ...m.schritte,
                    {
                      was: `Termin gewählt: ${gewaehlt.beschriftung}`,
                      zeit: new Date().toISOString(),
                    },
                  ],
                }
              : m,
          ),
        },
        ausgabe: [
          sagen(
            chatRahmen.terminauswahlBestaetigt(gewaehlt.beschriftung),
            tippenKurz,
            "zusagen",
          ),
        ],
      };
    }

    // -----------------------------------------------------------------------
    case "neueMeldung":
      return {
        zustand: {
          ...anfangszustand(),
          // Der Knopf heißt "Neue Meldung" – dann geht es auch direkt in die
          // Schadensaufnahme und nicht noch einmal durch die Themenauswahl.
          phase: "eingabe",
          nachrichten: zustand.nachrichten,
          // Bestehende Meldungen bleiben erhalten – der Mieter kann mehrere
          // Sachen gleichzeitig laufen haben.
          meldungen: zustand.meldungen,
          angebot: { art: "eingabe" },
        },
        ausgabe: [sagen(chatRahmen.aufforderung, tippenKurz, "einstieg")],
      };
  }
}
