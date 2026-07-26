import { demoKonfiguration } from "@config/demo";
import { istOffen, slaZustand } from "@/lib/dashboard/kennzahlen";
import type { Mandantenbestand, Vorgang } from "@/lib/daten/typen";

/**
 * Was der Hausverwaltung vorgelegt wird – und was nicht.
 *
 * Die Verwaltersicht arbeitet nach dem Grundsatz, mit dem in Betrieb und
 * Revision seit Jahrzehnten gesteuert wird: Auf den Tisch kommt, was
 * abweicht, nicht was läuft. Jede Abweichung hat einen Grund, eine
 * Dringlichkeit und einen Weg, sie loszuwerden.
 *
 * Warum das mehr ist als Bequemlichkeit: Der Verwalter darf die Ausführung
 * abgeben, seine Kontrollpflicht aber nicht. Eine Oberfläche, die ihm alles
 * zeigt, erfüllt sie nicht – sie macht Kontrolle nur teuer, und teure
 * Kontrolle unterbleibt. Eine Oberfläche, die ihm genau die Abweichungen
 * zeigt, macht sie bezahlbar.
 *
 * Die Kehrseite steht in docs/betriebsmodell.md und ist ernst gemeint:
 * Stille ist hier ein Versprechen. Was diese Datei nicht als Ausnahme
 * erkennt, sieht der Verwalter nicht.
 */

export type Dringlichkeit = "hoch" | "mittel";

export type Ausnahme = {
  id: string;
  dringlichkeit: Dringlichkeit;
  /** Was los ist – eine Zeile, ohne Fachjargon. */
  titel: string;
  /** Warum es hier steht und was wir schon getan haben. */
  begruendung: string;
  vorgangId: string | null;
  vorgangNummer: number | null;
  ort: string | null;
};

/** Ab welchem Betrag ein Auftrag der Verwaltung vorgelegt wird. */
export function kostengrenze(bestand: Mandantenbestand): number {
  return (
    bestand.mandant.einstellungen?.freigabe_ab_euro ??
    demoKonfiguration.verwalter.freigabeAbEuroStandard
  );
}

/**
 * Sammelt alles, was Aufmerksamkeit braucht.
 *
 * Bewusst wenige Regeln. Jede weitere Regel kostet Ruhe, und Ruhe ist das
 * Produkt – wer hier zehn Kategorien einbaut, hat wieder eine Vorgangsliste.
 */
export function ausnahmen(bestand: Mandantenbestand, jetzt = new Date()): Ausnahme[] {
  const grenze = kostengrenze(bestand);
  const gefunden: Ausnahme[] = [];

  const ort = (vorgang: Vorgang) => {
    const einheit = bestand.einheiten.find((e) => e.id === vorgang.einheit_id);
    const objekt = bestand.objekte.find((o) => o.id === einheit?.objekt_id);
    return [objekt?.name, einheit?.bezeichnung].filter(Boolean).join(", ") || null;
  };

  const eintrag = (
    vorgang: Vorgang,
    teil: Omit<Ausnahme, "id" | "vorgangId" | "vorgangNummer" | "ort">,
  ): Ausnahme => ({
    ...teil,
    id: `${vorgang.id}:${teil.titel}`,
    vorgangId: vorgang.id,
    vorgangNummer: vorgang.nummer,
    ort: ort(vorgang),
  });

  for (const vorgang of bestand.vorgaenge) {
    if (!istOffen(vorgang)) continue;

    // 1. Frist gerissen. Das ist die einzige Regel, die immer hoch ist:
    //    Hier hat unser Versprechen nicht gehalten.
    if (slaZustand(vorgang, jetzt) === "rot") {
      gefunden.push(
        eintrag(vorgang, {
          dringlichkeit: "hoch",
          titel: `Frist überschritten: ${vorgang.titel}`,
          begruendung:
            "Die zugesagte Reaktionszeit ist abgelaufen. Wir sind dran – " +
            "Sie sehen es hier, damit Sie es wissen, bevor der Mieter anruft.",
        }),
      );
      continue;
    }

    // 2. Über der Grenze, die der Verwalter selbst gesetzt hat.
    if (
      vorgang.kosten_schaetzung_euro &&
      vorgang.kosten_schaetzung_euro > grenze &&
      (vorgang.status === "neu" || vorgang.status === "in_pruefung")
    ) {
      gefunden.push(
        eintrag(vorgang, {
          dringlichkeit: "hoch",
          titel: `${vorgang.kosten_schaetzung_euro} € – über Ihrer Grenze von ${grenze} €`,
          begruendung:
            `${vorgang.titel}. Alles ist vorbereitet und wartet nur auf Ihr ` +
            "Ja. Darunter beauftragen wir ohne Rückfrage.",
        }),
      );
      continue;
    }

    // 3. Notfall, der noch nicht in Arbeit ist.
    if (vorgang.prioritaet === "notfall" && vorgang.status !== "in_arbeit") {
      gefunden.push(
        eintrag(vorgang, {
          dringlichkeit: "hoch",
          titel: `Notfall: ${vorgang.titel}`,
          begruendung:
            "Der Notdienst ist alarmiert. Zur Kenntnis, damit Sie bei einem " +
            "Anruf des Eigentümers sprechfähig sind.",
        }),
      );
      continue;
    }

    // 4. Liegt zu lange still. Kein Fehler, aber der Punkt, an dem sonst
    //    etwas untergeht.
    const stillTage = tageSeitLetzterBewegung(bestand, vorgang, jetzt);
    if (stillTage >= demoKonfiguration.verwalter.stilleTageBisHinweis) {
      gefunden.push(
        eintrag(vorgang, {
          dringlichkeit: "mittel",
          titel: `Seit ${stillTage} Tagen ohne Bewegung: ${vorgang.titel}`,
          begruendung:
            "Wir haken beim Betrieb nach. Falls Sie den Betrieb wechseln " +
            "möchten, sagen Sie uns Bescheid.",
        }),
      );
    }
  }

  // Hoch zuerst, danach das Jüngste – sonst versteckt sich Dringendes unten.
  const rang: Record<Dringlichkeit, number> = { hoch: 0, mittel: 1 };
  return gefunden.sort((a, b) => rang[a.dringlichkeit] - rang[b.dringlichkeit]);
}

function tageSeitLetzterBewegung(
  bestand: Mandantenbestand,
  vorgang: Vorgang,
  jetzt: Date,
): number {
  const letzte = bestand.verlauf
    .filter((v) => v.vorgang_id === vorgang.id)
    .map((v) => new Date(v.zeitpunkt).getTime())
    .sort((a, b) => b - a)[0];

  const bezug = letzte ?? new Date(vorgang.erstellt_am).getTime();
  return Math.floor((jetzt.getTime() - bezug) / 86_400_000);
}

/**
 * Was wir im Zeitraum erledigt haben – die Rechenschaft.
 *
 * Der Beauftragte schuldet dem Auftraggeber nicht nur Auskunft auf Nachfrage,
 * sondern Rechenschaft (§ 666 BGB). Praktisch heißt das: eine Aufstellung,
 * die der Verwalter unverändert an den Eigentümer weitergeben kann.
 */
export type Nachweis = {
  vonIso: string;
  bisIso: string;
  eingegangen: number;
  erledigt: number;
  ohneRueckfrage: number;
  vorgelegt: number;
  notfaelle: number;
  /** Mittlere Zeit bis zur ersten Reaktion, in Minuten. */
  reaktionMinuten: number;
  dauerSchnittStunden: number;
  zweitanfahrtenVermieden: number;
  selbsthilfeErfolge: number;
  ersparnisEuro: number;
  gesparteStunden: number;
};

export function nachweis(
  bestand: Mandantenbestand,
  tage = 30,
  jetzt = new Date(),
): Nachweis {
  const von = new Date(jetzt.getTime() - tage * 86_400_000);
  const grenze = kostengrenze(bestand);
  const imZeitraum = bestand.vorgaenge.filter((v) => new Date(v.erstellt_am) >= von);

  const erledigte = imZeitraum.filter((v) => v.status === "erledigt" && v.erledigt_am);
  const dauern = erledigte.map(
    (v) =>
      (new Date(v.erledigt_am!).getTime() - new Date(v.erstellt_am).getTime()) /
      3600_000,
  );

  const vorgelegt = imZeitraum.filter(
    (v) => (v.kosten_schaetzung_euro ?? 0) > grenze,
  ).length;
  const vermieden = imZeitraum.filter((v) => v.zweitanfahrt_vermieden).length;
  const selbsthilfe = imZeitraum.filter((v) => v.selbsthilfe_erfolgreich);

  const { kostenZweitanfahrtEuro, minutenProVorgang, minutenProZweitanfahrt } =
    demoKonfiguration.kennzahlen;

  return {
    vonIso: von.toISOString(),
    bisIso: jetzt.toISOString(),
    eingegangen: imZeitraum.length,
    erledigt: erledigte.length,
    ohneRueckfrage: imZeitraum.length - vorgelegt,
    vorgelegt,
    notfaelle: imZeitraum.filter((v) => v.prioritaet === "notfall").length,
    // DEMO: Der Assistent antwortet sofort – die Reaktionszeit ist deshalb
    // eine Konstante und keine Messung. Im Echtbetrieb wird sie gemessen.
    reaktionMinuten: demoKonfiguration.verwalter.reaktionMinuten,
    dauerSchnittStunden: dauern.length
      ? Math.round(dauern.reduce((a, b) => a + b, 0) / dauern.length)
      : 0,
    zweitanfahrtenVermieden: vermieden,
    selbsthilfeErfolge: selbsthilfe.length,
    ersparnisEuro:
      vermieden * kostenZweitanfahrtEuro +
      selbsthilfe.reduce((summe, v) => summe + (v.kosten_schaetzung_euro ?? 0), 0),
    gesparteStunden: Math.round(
      (imZeitraum.length * minutenProVorgang + vermieden * minutenProZweitanfahrt) / 60,
    ),
  };
}
