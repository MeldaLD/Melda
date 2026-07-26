/**
 * Der Assistent im Verwalter-Dashboard.
 *
 * DEMO: Kein Sprachmodell. Die Absicht wird über Schlüsselwörter und
 * reguläre Ausdrücke erkannt, die Angaben werden aus dem Satz herausgelesen.
 * Das reicht für eine Vorführung vollkommen und ist im Gegensatz zu einem
 * echten Modell reproduzierbar – bei einer Demo will man keine Überraschungen.
 *
 * Beim echten System übernimmt hier ein Modell mit Werkzeugaufrufen; die
 * Absichten und Bestätigungskarten unten bleiben dabei dieselben.
 *
 * Grundsatz, der auch im Echtbetrieb gilt: Jede schreibende Aktion wird
 * zuerst als Karte gezeigt und muss bestätigt werden. Der Assistent führt
 * nichts allein aus.
 */

import type { Einheit, Mandantenbestand, Objekt, Vorgang } from "@/lib/daten/typen";
import { istOffen, nachDringlichkeit } from "@/lib/dashboard/kennzahlen";

export type AssistentKarte =
  | {
      art: "neuerMieter";
      objekt: Objekt | null;
      lage: string | null;
      name: string | null;
      telefon: string | null;
      /** Was noch fehlt, damit angelegt werden kann. */
      fehlt: string[];
    }
  | { art: "vorgang"; vorgang: Vorgang; einheit: Einheit | null; objekt: Objekt | null }
  | { art: "liste"; vorgaenge: Vorgang[]; ueberschrift: string }
  | { art: "notiz"; vorgang: Vorgang; text: string }
  | { art: "hilfe" };

export type AssistentAntwort = {
  text: string;
  karte?: AssistentKarte;
};

const LAGE_MUSTER =
  /\b((?:EG|DG|\d\.\s*(?:OG|Obergeschoss)|Souterrain))\s*(links|rechts|mitte)?\b/i;

const TELEFON_MUSTER = /(\+49[\d\s/-]{6,}|0\d[\d\s/-]{6,})/;

const NAME_MUSTER =
  /(?:Familie|Fam\.|Herr|Frau)\s+([A-ZÄÖÜ][\wäöüßA-Za-z-]+)|hei(?:ßen|ßt)\s+(?:die\s+)?([A-ZÄÖÜ][\wäöüßA-Za-z-]+)/;

function lageNormalisieren(treffer: RegExpMatchArray): string {
  const geschoss = treffer[1]
    .replace(/\s+/g, " ")
    .replace(/Obergeschoss/i, "OG")
    .trim();
  const seite = treffer[2];
  const grossOG = geschoss
    .replace(/og/i, "OG")
    .replace(/eg/i, "EG")
    .replace(/dg/i, "DG");
  return seite ? `${grossOG} ${seite.toLowerCase()}` : grossOG;
}

/** Findet ein Objekt, dessen Straßenname im Text vorkommt. */
function objektAusText(text: string, objekte: Objekt[]): Objekt | null {
  const klein = text.toLowerCase();
  for (const objekt of objekte) {
    // Straßenname ohne Hausnummer – "Wilhelmshöher Allee 112" -> "wilhelmshöher allee"
    const strasse = objekt.name.replace(/\s*\d+\s*[a-z]?$/i, "").toLowerCase();
    if (strasse.length > 3 && klein.includes(strasse)) return objekt;
  }
  return null;
}

function vorgangAusText(text: string, vorgaenge: Vorgang[]): Vorgang | null {
  // Zuerst nach Vorgangsnummer suchen – das ist eindeutig.
  const nummer = text.match(/\b(1\d{3})\b/);
  if (nummer) {
    const gefunden = vorgaenge.find((v) => v.nummer === Number(nummer[1]));
    if (gefunden) return gefunden;
  }

  // Sonst über Wörter aus dem Titel.
  const klein = text.toLowerCase();
  const kandidaten = vorgaenge
    .map((v) => {
      const woerter = v.titel
        .toLowerCase()
        .split(/[\s,–-]+/)
        .filter((w) => w.length > 4);
      return { vorgang: v, treffer: woerter.filter((w) => klein.includes(w)).length };
    })
    .filter((k) => k.treffer > 0)
    .sort((a, b) => b.treffer - a.treffer);

  // Bei gleicher Trefferzahl gewinnt der jüngste offene Vorgang.
  const beste = kandidaten.filter((k) => k.treffer === kandidaten[0]?.treffer);
  const offen = beste.find((k) => istOffen(k.vorgang));
  return (offen ?? beste[0])?.vorgang ?? null;
}

export function assistentAntwort(
  eingabe: string,
  bestand: Mandantenbestand,
): AssistentAntwort {
  const text = eingabe.trim();
  const klein = text.toLowerCase();

  if (!text) return { text: "", karte: { art: "hilfe" } };

  if (/^(hilfe|was kannst du|\?)$/i.test(text)) {
    return {
      text: "Das kann ich für Sie übernehmen:",
      karte: { art: "hilfe" },
    };
  }

  // --- Neuen Mieter anlegen -------------------------------------------------
  if (
    /neue[rn]?\s+mieter|neue\s+mieterin|zieht?\s+ein|einzug|mieterwechsel/i.test(klein)
  ) {
    const objekt = objektAusText(text, bestand.objekte);
    const lageTreffer = text.match(LAGE_MUSTER);
    const lage = lageTreffer ? lageNormalisieren(lageTreffer) : null;

    const nameTreffer = text.match(NAME_MUSTER);
    const nachname = nameTreffer?.[1] ?? nameTreffer?.[2] ?? null;
    const familie = /Familie|Fam\./i.test(text);
    const name = nachname ? (familie ? `Familie ${nachname}` : nachname) : null;

    const telefon = text.match(TELEFON_MUSTER)?.[1].replace(/\s+/g, " ").trim() ?? null;

    const fehlt: string[] = [];
    if (!objekt) fehlt.push("Objekt");
    if (!lage) fehlt.push("Lage der Wohnung");
    if (!name) fehlt.push("Name");
    if (!telefon) fehlt.push("Mobilnummer");

    return {
      text: fehlt.length
        ? `Ich habe folgendes verstanden. Es fehlt noch: ${fehlt.join(", ")}.`
        : "Ich habe folgendes verstanden. Bitte prüfen und bestätigen:",
      karte: { art: "neuerMieter", objekt, lage, name, telefon, fehlt },
    };
  }

  // --- Notiz zu einem Vorgang nachtragen -----------------------------------
  const notizTreffer = text.match(
    /(?:zu\s+)?vorgang\s*(1\d{3})\s*[:,]\s*(.+)$|^notiz\s*(?:zu\s*)?(1\d{3})?\s*[:,]?\s*(.+)$/i,
  );
  if (notizTreffer) {
    const nummer = notizTreffer[1] ?? notizTreffer[3];
    const inhalt = (notizTreffer[2] ?? notizTreffer[4] ?? "").trim();
    const vorgang = bestand.vorgaenge.find((v) => v.nummer === Number(nummer));

    if (vorgang && inhalt) {
      return {
        text: "Das trage ich als Verlaufseintrag nach:",
        karte: { art: "notiz", vorgang, text: inhalt },
      };
    }
    if (!vorgang && nummer) {
      return { text: `Einen Vorgang mit der Nummer ${nummer} finde ich nicht.` };
    }
  }

  // --- Offene Vorgänge auflisten -------------------------------------------
  if (
    /\b(offen|offene|liste|zeig|übersicht|was liegt an|notfall|notfälle|überfällig)\b/i.test(
      klein,
    )
  ) {
    const nurNotfall = /notfall|notfälle/i.test(klein);
    const objekt = objektAusText(text, bestand.objekte);

    let treffer = bestand.vorgaenge.filter(istOffen);
    if (nurNotfall) treffer = treffer.filter((v) => v.prioritaet === "notfall");
    if (objekt) {
      const einheitenIds = new Set(
        bestand.einheiten.filter((e) => e.objekt_id === objekt.id).map((e) => e.id),
      );
      treffer = treffer.filter((v) => v.einheit_id && einheitenIds.has(v.einheit_id));
    }

    const ueberschrift = [
      nurNotfall ? "Offene Notfälle" : "Offene Vorgänge",
      objekt ? `· ${objekt.name}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      text: treffer.length
        ? `${treffer.length} ${treffer.length === 1 ? "Vorgang" : "Vorgänge"} gefunden.`
        : "Dazu ist gerade nichts offen.",
      karte: treffer.length
        ? {
            art: "liste",
            vorgaenge: [...treffer].sort(nachDringlichkeit),
            ueberschrift,
          }
        : undefined,
    };
  }

  // --- Einzelnen Vorgang nachschlagen --------------------------------------
  const vorgang = vorgangAusText(text, bestand.vorgaenge);
  if (vorgang) {
    const einheit = bestand.einheiten.find((e) => e.id === vorgang.einheit_id) ?? null;
    const objekt = bestand.objekte.find((o) => o.id === einheit?.objekt_id) ?? null;
    return {
      text: `Vorgang ${vorgang.nummer}:`,
      karte: { art: "vorgang", vorgang, einheit, objekt },
    };
  }

  // --- Nichts erkannt -------------------------------------------------------
  return {
    text: "Das habe ich nicht sicher verstanden. Diese Dinge kann ich übernehmen:",
    karte: { art: "hilfe" },
  };
}

/** Beispielsätze, die im leeren Assistenten als Startpunkte angeboten werden. */
export const ASSISTENT_BEISPIELE = [
  "Neuer Mieter Holländische Straße 47, 2. OG links, Familie Brinkmann, 0151 2345678",
  "Was ist offen?",
  "Zeig mir die Notfälle",
  "Vorgang 1001: Handwerker war da, Ersatzteil ist bestellt",
];
