import { demoKonfiguration } from "@config/demo";
import { SLA_STANDARD } from "@config/muster-mandant";
import type {
  Mandantenbestand,
  Prioritaet,
  Vorgang,
  VorgangStatus,
} from "@/lib/daten/typen";

/**
 * Auswertungen für das Dashboard.
 *
 * Reine Funktionen über dem geladenen Bestand – keine Datenbankabfragen.
 * Der Datenbestand einer Demo ist klein genug, dass Rechnen im Speicher
 * schneller ist als eine zweite Abfrage.
 */

const OFFEN: VorgangStatus[] = [
  "neu",
  "in_pruefung",
  "an_handwerker",
  "termin_vereinbart",
  "in_arbeit",
];

export function istOffen(vorgang: Vorgang): boolean {
  return OFFEN.includes(vorgang.status);
}

/** Zustand der SLA-Ampel eines Vorgangs. */
export type SlaZustand = "gruen" | "gelb" | "rot" | "erledigt";

export function slaZustand(vorgang: Vorgang, jetzt = new Date()): SlaZustand {
  if (!istOffen(vorgang)) return "erledigt";

  const frist = vorgang.sla_frist ? new Date(vorgang.sla_frist).getTime() : null;
  if (frist === null) return "gruen";

  const rest = frist - jetzt.getTime();
  if (rest < 0) return "rot";

  // Letztes Viertel der Frist: Warnung.
  const gesamt = SLA_STANDARD[vorgang.prioritaet] * 3600_000;
  return rest < gesamt * 0.25 ? "gelb" : "gruen";
}

/** Alter eines Vorgangs, kurz und lesbar. */
export function alterKurz(iso: string, jetzt = new Date()): string {
  const minuten = Math.max(
    0,
    Math.round((jetzt.getTime() - new Date(iso).getTime()) / 60_000),
  );
  if (minuten < 60) return `${minuten} Min.`;
  const stunden = Math.round(minuten / 60);
  if (stunden < 48) return `${stunden} Std.`;
  return `${Math.round(stunden / 24)} Tage`;
}

export type Kennzahlen = {
  offen: number;
  notfaelle: number;
  offeneFreigaben: number;
  ueberfaellig: number;
  /** Durchschnittliche Bearbeitungsdauer erledigter Vorgänge in Stunden. */
  dauerSchnittStunden: number;
  vorgaengeDieseWoche: number;
  automatischErledigt: number;
  zweitanfahrtenVermieden: number;
  ersparnisEuro: number;
  /** Durch Selbsthilfe des Mieters vollständig entfallene Einsätze. */
  selbsthilfeErfolge: number;
  selbsthilfeErsparnisEuro: number;
  gesparteStunden: number;
};

export function kennzahlen(bestand: Mandantenbestand, jetzt = new Date()): Kennzahlen {
  const wocheAb = jetzt.getTime() - 7 * 24 * 3600_000;
  const offene = bestand.vorgaenge.filter(istOffen);
  const dieseWoche = bestand.vorgaenge.filter(
    (v) => new Date(v.erstellt_am).getTime() >= wocheAb,
  );

  const erledigte = bestand.vorgaenge.filter(
    (v) => v.status === "erledigt" && v.erledigt_am,
  );
  const dauern = erledigte.map(
    (v) =>
      (new Date(v.erledigt_am!).getTime() - new Date(v.erstellt_am).getTime()) /
      3600_000,
  );

  const vermieden = dieseWoche.filter((v) => v.zweitanfahrt_vermieden).length;

  // Selbsthilfe zählt über den ganzen Bestand, nicht nur diese Woche: Es sind
  // wenige Fälle, und über eine Woche wäre die Zahl meist null.
  const selbstbehoben = bestand.vorgaenge.filter((v) => v.selbsthilfe_erfolgreich);
  const { kostenZweitanfahrtEuro, minutenProVorgang, minutenProZweitanfahrt } =
    demoKonfiguration.kennzahlen;

  return {
    offen: offene.length,
    notfaelle: offene.filter((v) => v.prioritaet === "notfall").length,
    offeneFreigaben: bestand.freigaben.filter((f) => f.status === "offen").length,
    ueberfaellig: offene.filter((v) => slaZustand(v, jetzt) === "rot").length,
    dauerSchnittStunden: dauern.length
      ? Math.round(dauern.reduce((a, b) => a + b, 0) / dauern.length)
      : 0,
    vorgaengeDieseWoche: dieseWoche.length,
    // DEMO: "Vollautomatisch" heißt hier: ohne Rückfrage der Verwaltung
    // aufgenommen, klassifiziert und weitergeleitet. Alle Meldungen aus dem
    // Chat erfüllen das; im Echtbetrieb wäre das eine echte Messgröße.
    automatischErledigt: dieseWoche.filter((v) => v.quelle === "whatsapp").length,
    zweitanfahrtenVermieden: vermieden,
    ersparnisEuro: vermieden * kostenZweitanfahrtEuro,
    selbsthilfeErfolge: selbstbehoben.length,
    // Gespart ist genau der Handwerkereinsatz, der nicht stattgefunden hat.
    selbsthilfeErsparnisEuro: selbstbehoben.reduce(
      (summe, v) => summe + (v.kosten_schaetzung_euro ?? 0),
      0,
    ),
    // Ersparnis = eingesparte Aufnahme je Meldung plus die Koordination,
    // die eine vermiedene Zweitanfahrt sonst zusätzlich gekostet hätte.
    gesparteStunden: Math.round(
      (dieseWoche.length * minutenProVorgang + vermieden * minutenProZweitanfahrt) / 60,
    ),
  };
}

export type Wochenwert = {
  beschriftung: string;
  gesamt: number;
  automatisch: number;
};

/** Vorgänge je Kalenderwoche, für das Balkendiagramm der Übersicht. */
export function wochenverlauf(
  bestand: Mandantenbestand,
  wochen = 6,
  jetzt = new Date(),
): Wochenwert[] {
  const ergebnis: Wochenwert[] = [];

  for (let i = wochen - 1; i >= 0; i--) {
    const bis = jetzt.getTime() - i * 7 * 24 * 3600_000;
    const von = bis - 7 * 24 * 3600_000;

    const imZeitraum = bestand.vorgaenge.filter((v) => {
      const t = new Date(v.erstellt_am).getTime();
      return t >= von && t < bis;
    });

    ergebnis.push({
      beschriftung: i === 0 ? "Diese Woche" : `vor ${i} Wo.`,
      gesamt: imZeitraum.length,
      automatisch: imZeitraum.filter((v) => v.quelle === "whatsapp").length,
    });
  }

  return ergebnis;
}

export const PRIORITAET_REIHENFOLGE: Record<Prioritaet, number> = {
  notfall: 0,
  dringend: 1,
  routine: 2,
};

/** Sortierung der Vorgangsliste: erst Dringlichkeit, dann Alter. */
export function nachDringlichkeit(a: Vorgang, b: Vorgang): number {
  const p = PRIORITAET_REIHENFOLGE[a.prioritaet] - PRIORITAET_REIHENFOLGE[b.prioritaet];
  if (p !== 0) return p;
  return new Date(a.erstellt_am).getTime() - new Date(b.erstellt_am).getTime();
}
