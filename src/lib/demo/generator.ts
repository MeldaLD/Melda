/**
 * Beispieldaten-Generator.
 *
 * Erzeugt aus der Vorlage eines Mandanten einen vollständigen, in sich
 * stimmigen Datenbestand. Eine Funktion, drei Verwendungen:
 *
 *   1. Seed – die Datei supabase/seed/muster-hausverwaltung.sql entsteht daraus
 *   2. Zurücksetzen – nach dem Leeren wird derselbe Bestand neu geschrieben
 *   3. Rückfallbetrieb – ohne erreichbare Datenbank liefert er die Daten direkt
 *
 * Deterministisch: gleiche Vorlage, gleicher Bestand. Zeitangaben sind relativ
 * zum übergebenen Bezugszeitpunkt, damit das Dashboard immer aktuell wirkt.
 *
 * DEMO: Der gesamte Bestand ist erfunden. Nichts davon stammt aus einem
 * echten Verwaltungssystem.
 */

import { szenarien, type Szenario } from "@config/scenarios";
import { HAUSHALTSFORMEN, LAGEN, NACHNAMEN, VORNAMEN } from "@config/namen";
import { SLA_STANDARD, type MandantVorlage } from "@config/muster-mandant";

import type {
  Einheit,
  Fachbereich,
  Freigabe,
  Handwerker,
  Mandant,
  Mandantenbestand,
  Mitarbeiter,
  Nachricht,
  Objekt,
  Termin,
  Vorgang,
  VorgangVerlauf,
  Zeitfenster,
} from "@/lib/daten/typen";
import { stabileUuid, Zufall } from "./zufall";

/** Bauplan eines Beispielvorgangs. Die Mischung ist bewusst gesetzt, nicht
 *  gewürfelt: Das Dashboard soll bei jeder Vorführung dieselbe, gut erzählbare
 *  Lage zeigen – ein Notfall, einige Freigaben, ein paar überfällige Vorgänge. */
type VorgangsBauplan = {
  szenario: string;
  status: Vorgang["status"];
  /** Alter in Stunden zum Bezugszeitpunkt. */
  alterStunden: number;
  /** Wurde durch das zweite Foto eine Anfahrt gespart? */
  zweitanfahrt: boolean;
  /** Vollständiger Chatverlauf statt nur Eingangsnachricht. */
  vollerChat?: boolean;
};

const BAUPLAENE: VorgangsBauplan[] = [
  // --- Aktuell offen ------------------------------------------------------
  {
    szenario: "wasserfleck-decke",
    status: "an_handwerker",
    alterStunden: 2,
    zweitanfahrt: true,
    vollerChat: true,
  },
  {
    szenario: "silikonfuge",
    status: "in_pruefung",
    alterStunden: 5,
    zweitanfahrt: true,
    vollerChat: true,
  },
  {
    szenario: "heizung-kalt",
    status: "in_pruefung",
    alterStunden: 20,
    zweitanfahrt: true,
    vollerChat: true,
  },
  {
    szenario: "abfluss-verstopft",
    status: "in_pruefung",
    alterStunden: 30,
    zweitanfahrt: true,
  },
  { szenario: "treppenhauslicht", status: "neu", alterStunden: 3, zweitanfahrt: false },
  // Überfällig – erzeugt die rote SLA-Ampel
  {
    szenario: "schimmel-wand",
    status: "an_handwerker",
    alterStunden: 96,
    zweitanfahrt: true,
  },
  {
    szenario: "klingelanlage",
    status: "termin_vereinbart",
    alterStunden: 52,
    zweitanfahrt: true,
  },
  {
    szenario: "fensterschloss",
    status: "termin_vereinbart",
    alterStunden: 70,
    zweitanfahrt: false,
  },
  { szenario: "muellraum", status: "in_arbeit", alterStunden: 44, zweitanfahrt: true },

  // --- Abgeschlossen, für Kennzahlen und Diagramm -------------------------
  {
    szenario: "wasserhahn-tropft",
    status: "erledigt",
    alterStunden: 120,
    zweitanfahrt: true,
  },
  {
    szenario: "treppenhauslicht",
    status: "erledigt",
    alterStunden: 168,
    zweitanfahrt: true,
  },
  {
    szenario: "silikonfuge",
    status: "erledigt",
    alterStunden: 196,
    zweitanfahrt: false,
  },
  {
    szenario: "abfluss-verstopft",
    status: "erledigt",
    alterStunden: 240,
    zweitanfahrt: true,
  },
  {
    szenario: "heizung-kalt",
    status: "erledigt",
    alterStunden: 310,
    zweitanfahrt: true,
  },
  {
    szenario: "klingelanlage",
    status: "erledigt",
    alterStunden: 360,
    zweitanfahrt: false,
  },
  {
    szenario: "wasserhahn-tropft",
    status: "erledigt",
    alterStunden: 420,
    zweitanfahrt: true,
  },
  { szenario: "muellraum", status: "erledigt", alterStunden: 480, zweitanfahrt: false },
  {
    szenario: "fensterschloss",
    status: "erledigt",
    alterStunden: 530,
    zweitanfahrt: true,
  },
  {
    szenario: "wasserfleck-decke",
    status: "erledigt",
    alterStunden: 600,
    zweitanfahrt: true,
  },
  {
    szenario: "schimmel-wand",
    status: "erledigt",
    alterStunden: 660,
    zweitanfahrt: true,
  },
  {
    szenario: "silikonfuge",
    status: "erledigt",
    alterStunden: 720,
    zweitanfahrt: true,
  },
  {
    szenario: "treppenhauslicht",
    status: "erledigt",
    alterStunden: 800,
    zweitanfahrt: false,
  },
  {
    szenario: "abfluss-verstopft",
    status: "erledigt",
    alterStunden: 890,
    zweitanfahrt: true,
  },
  {
    szenario: "wasserhahn-tropft",
    status: "erledigt",
    alterStunden: 960,
    zweitanfahrt: true,
  },
  {
    szenario: "heizung-kalt",
    status: "erledigt",
    alterStunden: 1010,
    zweitanfahrt: false,
  },
];

export function bestandErzeugen(
  vorlage: MandantVorlage,
  bezug: Date = new Date(),
): Mandantenbestand {
  const zufall = new Zufall(`bestand:${vorlage.slug}`);
  const tenantId = stabileUuid(`mandant:${vorlage.slug}`);

  /** Zeitpunkt vor N Stunden, als ISO-Zeichenkette. */
  const vorStunden = (stunden: number): string =>
    new Date(bezug.getTime() - stunden * 3600_000).toISOString();
  /**
   * Termin in N Stunden, aber auf eine glatte Uhrzeit gesetzt.
   * Ein Handwerkertermin um 17:31 Uhr verrät sofort, dass die Daten
   * ausgerechnet und nicht vereinbart wurden.
   */
  const anTagUm = (stundenVoraus: number, stunde: number, minute = 0): string => {
    const tag = new Date(bezug.getTime() + stundenVoraus * 3600_000);
    tag.setHours(stunde, minute, 0, 0);
    return tag.toISOString();
  };

  // --- Mandant -------------------------------------------------------------
  const mandant: Mandant = {
    id: tenantId,
    slug: vorlage.slug,
    firma: vorlage.firma,
    logo_url: null,
    primaerfarbe: vorlage.primaerfarbe,
    sekundaerfarbe: vorlage.sekundaerfarbe,
    ansprechpartner: vorlage.ansprechpartner,
    stadt: vorlage.stadt,
    objekt_namen: vorlage.objektNamen,
    mitarbeiter: vorlage.mitarbeiter,
    handwerker: vorlage.handwerker,
    einstellungen: {
      sla_stunden: { ...SLA_STANDARD },
      notfall_telefon: "0561 9000000",
      hinweis: "Demo-Konfiguration. Werte können jederzeit angepasst werden.",
    },
    ablaufdatum: null,
    aufrufe: 0,
    ist_aktiv: true,
    erstellt_am: vorStunden(24 * 30),
  };

  // --- Objekte und Einheiten ----------------------------------------------
  const objekte: Objekt[] = [];
  const einheiten: Einheit[] = [];

  vorlage.objektNamen.forEach((bezeichnung, index) => {
    const objektId = stabileUuid(`objekt:${vorlage.slug}:${index}`);
    const anzahl = zufall.zahl(8, 12);

    objekte.push({
      id: objektId,
      tenant_id: tenantId,
      name: bezeichnung,
      strasse: bezeichnung,
      plz: vorlage.plz,
      ort: vorlage.stadt,
      einheiten_anzahl: anzahl,
      sortierung: index,
    });

    const lagen = zufall.mischen(LAGEN).slice(0, anzahl);
    lagen.forEach((lage, nr) => {
      const nachname = zufall.wahl(NACHNAMEN);
      const haushalt = zufall.wahl(HAUSHALTSFORMEN);
      const name = haushalt
        ? `${haushalt}${nachname}`
        : `${zufall.wahl(VORNAMEN)} ${nachname}`;

      einheiten.push({
        id: stabileUuid(`einheit:${vorlage.slug}:${index}:${nr}`),
        tenant_id: tenantId,
        objekt_id: objektId,
        bezeichnung: lage,
        mieter_name: name,
        // DEMO: erfundene, aber formal gültige Mobilnummer
        mieter_telefon: `+49 151 ${zufall.zahl(1000000, 9999999)}`,
      });
    });
  });

  // --- Mitarbeitende -------------------------------------------------------
  const mitarbeiter: Mitarbeiter[] = vorlage.mitarbeiter.map((m, index) => ({
    id: stabileUuid(`mitarbeiter:${vorlage.slug}:${index}`),
    tenant_id: tenantId,
    name: m.name,
    initialen: m.name
      .split(" ")
      .map((teil) => teil[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    rolle: m.rolle,
    bereich: m.bereich,
    sortierung: index,
  }));

  const technik = mitarbeiter.find((m) => m.bereich === "technik") ?? mitarbeiter[0];

  // --- Rückruf-Zeitfenster -------------------------------------------------
  // Montag bis Freitag, vormittags und nachmittags – so, wie eine kleine
  // Verwaltung ihre Sprechzeiten tatsächlich legt.
  const zeitfenster: Zeitfenster[] = [];
  mitarbeiter.forEach((m, mi) => {
    [1, 2, 3, 4, 5].forEach((tag) => {
      const bloecke =
        m.bereich === "buchhaltung"
          ? [["09:00", "12:00"]]
          : [
              ["08:30", "11:30"],
              ["14:00", "16:30"],
            ];
      bloecke.forEach(([von, bis], bi) => {
        zeitfenster.push({
          id: stabileUuid(`zeitfenster:${vorlage.slug}:${mi}:${tag}:${bi}`),
          tenant_id: tenantId,
          mitarbeiter_id: m.id,
          wochentag: tag,
          von,
          bis,
        });
      });
    });
  });

  // --- Handwerksbetriebe ---------------------------------------------------
  const gesehen = new Set<string>();
  const handwerker: Handwerker[] = vorlage.handwerker.map((h, index) => {
    const erster = !gesehen.has(h.gewerk);
    gesehen.add(h.gewerk);
    return {
      id: stabileUuid(`handwerker:${vorlage.slug}:${index}`),
      tenant_id: tenantId,
      firma: h.firma,
      gewerk: h.gewerk,
      telefon: `0561 ${zufall.zahl(200000, 899999)}`,
      reaktionszeit_h: h.reaktionszeit_h ?? 24,
      bewertung: h.bewertung ?? 4.3,
      ist_standard: erster,
    };
  });

  const handwerkerFuer = (gewerk: string) =>
    handwerker.find((h) => h.gewerk === gewerk && h.ist_standard) ?? handwerker[0];

  // --- Vorgänge mit Chatverlauf -------------------------------------------
  const vorgaenge: Vorgang[] = [];
  const nachrichten: Nachricht[] = [];
  const verlauf: VorgangVerlauf[] = [];
  const freigaben: Freigabe[] = [];
  const termine: Termin[] = [];

  const szenarioNach = new Map(szenarien.map((s) => [s.id, s]));

  BAUPLAENE.forEach((plan, index) => {
    const szenario = szenarioNach.get(plan.szenario);
    if (!szenario) return;

    const schluessel = `${vorlage.slug}:${index}`;
    const vorgangId = stabileUuid(`vorgang:${schluessel}`);
    const einheit = einheiten[zufall.zahl(0, einheiten.length - 1)];
    const betrieb = handwerkerFuer(szenario.gewerk);
    const slaStunden = SLA_STANDARD[szenario.prioritaet];

    vorgaenge.push({
      id: vorgangId,
      tenant_id: tenantId,
      nummer: 1000 + index,
      einheit_id: einheit.id,
      szenario_id: szenario.id,
      titel: szenario.titel,
      kategorie: szenario.kategorie,
      gewerk: szenario.gewerk,
      prioritaet: szenario.prioritaet,
      status: plan.status,
      ki_zusammenfassung: szenario.kiZusammenfassung,
      quelle: "whatsapp",
      mitarbeiter_id: technik.id,
      handwerker_id:
        plan.status === "neu" || plan.status === "in_pruefung" ? null : betrieb.id,
      sla_frist: vorStunden(plan.alterStunden - slaStunden),
      zweitanfahrt_vermieden: plan.zweitanfahrt,
      ist_seed: true,
      erstellt_am: vorStunden(plan.alterStunden),
      erledigt_am:
        plan.status === "erledigt"
          ? vorStunden(
              plan.alterStunden - bearbeitungsdauer(szenario.prioritaet, zufall),
            )
          : null,
    });

    nachrichten.push(
      ...chatverlauf({
        tenantId,
        vorgangId,
        einheit,
        szenario,
        plan,
        betrieb: betrieb.firma,
        schluessel,
        vorStunden,
      }),
    );

    verlauf.push(
      ...verlaufseintraege({
        tenantId,
        vorgangId,
        plan,
        betrieb: betrieb.firma,
        bearbeiter: technik.name,
        schluessel,
        vorStunden,
      }),
    );

    // Offene Freigaben: Auftrag und Mieterantwort warten auf den Verwalter
    if (plan.status === "in_pruefung") {
      freigaben.push({
        id: stabileUuid(`freigabe:auftrag:${schluessel}`),
        tenant_id: tenantId,
        vorgang_id: vorgangId,
        typ: "handwerkerauftrag",
        titel: `Auftrag an ${betrieb.firma}`,
        begruendung:
          `Gewerk ${szenario.gewerk} ist im Objekt ${einheit.bezeichnung} betroffen. ` +
          `${betrieb.firma} ist der hinterlegte Standardbetrieb für dieses Gewerk ` +
          `und hat eine durchschnittliche Reaktionszeit von ${betrieb.reaktionszeit_h} Stunden.`,
        entwurf_text:
          `Sehr geehrte Damen und Herren,\n\nbitte übernehmen Sie folgenden Auftrag:\n\n` +
          `Objekt: ${einheit.bezeichnung}\nMieter: ${einheit.mieter_name}\n` +
          `Meldung: ${szenario.titel}\n\n${szenario.kiZusammenfassung}\n\n` +
          `Bitte stimmen Sie den Termin direkt mit dem Mieter ab.\n\n` +
          `Mit freundlichen Grüßen\n${vorlage.firma}`,
        empfaenger: betrieb.firma,
        status: "offen",
        entschieden_am: null,
        entschieden_von: null,
        regel_automatisch: false,
        ist_seed: true,
        erstellt_am: vorStunden(plan.alterStunden - 0.2),
      });

      freigaben.push({
        id: stabileUuid(`freigabe:antwort:${schluessel}`),
        tenant_id: tenantId,
        vorgang_id: vorgangId,
        typ: "mieter_antwort",
        titel: `Antwort an ${einheit.mieter_name}`,
        begruendung:
          "Der Mieter hat eine Eingangsbestätigung erhalten, aber noch keine " +
          "Rückmeldung zum weiteren Vorgehen. Entwurf beruht auf der Kategorie " +
          `"${szenario.kategorie}".`,
        entwurf_text: szenario.mieterAntwortEntwurf,
        empfaenger: einheit.mieter_name,
        status: "offen",
        entschieden_am: null,
        entschieden_von: null,
        regel_automatisch: false,
        ist_seed: true,
        erstellt_am: vorStunden(plan.alterStunden - 0.3),
      });
    }

    // Handwerkertermine für alles, was bereits terminiert ist
    if (plan.status === "termin_vereinbart" || plan.status === "in_arbeit") {
      const start = zufall.zahl(24, 120);
      const stunde = zufall.wahl([8, 9, 10, 13, 14, 15]);
      termine.push({
        id: stabileUuid(`termin:handwerk:${schluessel}`),
        tenant_id: tenantId,
        vorgang_id: vorgangId,
        typ: "handwerkertermin",
        titel: `${szenario.titel} – ${betrieb.firma}`,
        mitarbeiter_id: null,
        handwerker_id: betrieb.id,
        einheit_id: einheit.id,
        beginn: anTagUm(start, stunde),
        ende: anTagUm(start, stunde + 2),
        status: "bestaetigt",
        grund: null,
        zeitwunsch: null,
        bereich_vorschlag: null,
        ist_seed: true,
      });
    }
  });

  // --- Weitere offene Freigaben, die nicht aus dem Chat stammen ------------
  const buchhaltung =
    mitarbeiter.find((m) => m.bereich === "buchhaltung") ?? mitarbeiter[0];
  const zahlungsEinheit = einheiten[3] ?? einheiten[0];

  freigaben.push({
    id: stabileUuid(`freigabe:zahlung:${vorlage.slug}`),
    tenant_id: tenantId,
    vorgang_id: null,
    typ: "zahlungserinnerung",
    titel: `Zahlungserinnerung an ${zahlungsEinheit.mieter_name}`,
    begruendung:
      "Die Miete für den laufenden Monat ist seit 12 Tagen offen. Bisher keine " +
      "Mahnung versandt, bisheriges Zahlungsverhalten unauffällig. Deshalb " +
      "freundliche Erinnerung statt Mahnung.",
    entwurf_text:
      `Guten Tag ${zahlungsEinheit.mieter_name},\n\nvermutlich ist es Ihnen ` +
      "entgangen: Die Mietzahlung für den laufenden Monat ist bei uns noch " +
      "nicht eingegangen. Falls sich das überschnitten hat, betrachten Sie " +
      "diese Nachricht bitte als gegenstandslos.\n\nMit freundlichen Grüßen",
    empfaenger: zahlungsEinheit.mieter_name,
    status: "offen",
    entschieden_am: null,
    entschieden_von: null,
    regel_automatisch: false,
    ist_seed: true,
    erstellt_am: vorStunden(6),
  });

  // --- Rückrufwünsche -----------------------------------------------------
  // Der Mieter nennt nur Thema und Erreichbarkeit. Zwei davon sind bereits
  // zugeordnet und terminiert, zwei warten auf die Zuordnung durch die
  // Verwaltung – genau die Arbeit, die das Dashboard sichtbar machen soll.
  const rueckrufwuensche: {
    grund: string;
    thema: string;
    zeitwunsch: string;
    bereich: Fachbereich;
    zugeordnet: Mitarbeiter | null;
    inStundenAb: number | null;
    stunde: number;
  }[] = [
    {
      grund: "abrechnung",
      thema: "Nebenkosten- oder Heizkostenabrechnung",
      zeitwunsch: "vormittag",
      bereich: "buchhaltung",
      zugeordnet: buchhaltung,
      inStundenAb: 26,
      stunde: 10,
    },
    {
      grund: "schaden",
      thema: "Frage zu einer Reparatur oder Meldung",
      zeitwunsch: "nachmittag",
      bereich: "technik",
      zugeordnet: technik,
      inStundenAb: 50,
      stunde: 14,
    },
    {
      grund: "vertrag",
      thema: "Mietvertrag, Kündigung oder Nachmieter",
      zeitwunsch: "egal",
      bereich: "allgemein",
      zugeordnet: null,
      inStundenAb: null,
      stunde: 9,
    },
    {
      grund: "zahlung",
      thema: "Miete, Zahlung oder Mahnung",
      zeitwunsch: "vormittag",
      bereich: "buchhaltung",
      zugeordnet: null,
      inStundenAb: null,
      stunde: 9,
    },
  ];

  rueckrufwuensche.forEach((wunsch, index) => {
    const einheit = einheiten[(index + 5) % einheiten.length];
    termine.push({
      id: stabileUuid(`termin:rueckruf:${vorlage.slug}:${index}`),
      tenant_id: tenantId,
      vorgang_id: null,
      typ: "rueckruf",
      titel: `${wunsch.thema} – ${einheit.mieter_name}`,
      mitarbeiter_id: wunsch.zugeordnet?.id ?? null,
      handwerker_id: null,
      einheit_id: einheit.id,
      beginn:
        wunsch.inStundenAb === null ? null : anTagUm(wunsch.inStundenAb, wunsch.stunde),
      ende:
        wunsch.inStundenAb === null
          ? null
          : anTagUm(wunsch.inStundenAb, wunsch.stunde, 15),
      status: wunsch.zugeordnet ? "bestaetigt" : "geplant",
      grund: wunsch.grund,
      zeitwunsch: wunsch.zeitwunsch,
      bereich_vorschlag: wunsch.bereich,
      ist_seed: true,
    });
  });

  // --- Postfach: Nachrichten ohne Vorgang ----------------------------------
  // Zeigt, dass alle Kanäle in einer Inbox zusammenlaufen – das ist der Kern
  // dessen, was die etablierten Anbieter verkaufen.
  const postfach: [Nachricht["kanal"], string, number][] = [
    [
      "email",
      "Anfrage zur Nebenkostenabrechnung 2025: In Position 7 taucht ein Betrag auf, den ich nicht zuordnen kann. Können Sie das aufschlüsseln?",
      4,
    ],
    [
      "telefon",
      "Telefonnotiz: Mieterin meldet, dass die Haustür morgens nicht sauber schließt. Wollte keine förmliche Meldung, nur zur Kenntnis.",
      9,
    ],
    [
      "email",
      "Untervermietung: Bitte um Genehmigung, ein Zimmer befristet an eine Studentin unterzuvermieten.",
      27,
    ],
    ["whatsapp", "Kurze Frage: Wann wird die Heizkostenabrechnung verschickt?", 33],
  ];

  postfach.forEach(([kanal, text, stunden], index) => {
    const einheit = einheiten[(index + 11) % einheiten.length];
    nachrichten.push({
      id: stabileUuid(`postfach:${vorlage.slug}:${index}`),
      tenant_id: tenantId,
      vorgang_id: null,
      einheit_id: einheit.id,
      richtung: "mieter",
      kanal,
      text,
      foto_id: null,
      meta: null,
      ist_seed: true,
      gesendet_am: vorStunden(stunden),
      gelesen_am: index > 1 ? vorStunden(stunden - 1) : null,
    });
  });

  return {
    mandant,
    objekte,
    einheiten,
    mitarbeiter,
    handwerker,
    zeitfenster,
    vorgaenge,
    nachrichten,
    verlauf,
    freigaben,
    termine,
  };
}

// ---------------------------------------------------------------------------
// Chatverlauf
// ---------------------------------------------------------------------------

type ChatEingabe = {
  tenantId: string;
  vorgangId: string;
  einheit: Einheit;
  szenario: Szenario;
  plan: VorgangsBauplan;
  betrieb: string;
  schluessel: string;
  vorStunden: (stunden: number) => string;
};

/**
 * Baut den Chatverlauf eines Vorgangs aus den Szenariotexten.
 * Bewusst generisch: Neue Szenarien bekommen automatisch einen passenden
 * Verlauf, ohne dass hier etwas ergänzt werden muss.
 */
function chatverlauf(e: ChatEingabe): Nachricht[] {
  const { tenantId, vorgangId, einheit, szenario, plan, betrieb, schluessel } = e;
  const start = plan.alterStunden;
  const liste: Nachricht[] = [];
  let lfd = 0;

  const push = (
    richtung: Nachricht["richtung"],
    text: string,
    minutenNachStart: number,
    extra?: Partial<Nachricht>,
  ) => {
    liste.push({
      id: stabileUuid(`nachricht:${schluessel}:${lfd++}`),
      tenant_id: tenantId,
      vorgang_id: vorgangId,
      einheit_id: einheit.id,
      richtung,
      kanal: "whatsapp",
      text,
      foto_id: null,
      meta: null,
      ist_seed: true,
      gesendet_am: e.vorStunden(start - minutenNachStart / 60),
      gelesen_am: e.vorStunden(start - (minutenNachStart + 1) / 60),
      ...extra,
    });
  };

  push("mieter", "Guten Tag, ich möchte einen Schaden melden.", 0);
  push("mieter", "[Foto]", 1, { foto_id: szenario.foto });
  push("ki", szenario.erkennung, 2);

  if (!plan.vollerChat && !plan.zweitanfahrt) {
    // Kurzfassung für ältere Vorgänge – hält die Datenmenge überschaubar.
    push("mieter", "Ja, genau.", 3);
    push(
      "ki",
      `Vielen Dank. Ich habe die Meldung an ${betrieb} weitergeleitet. ` +
        "Der Betrieb meldet sich zur Terminfindung.",
      4,
    );
    return liste;
  }

  push("mieter", "Ja, das stimmt.", 3);

  if (szenario.sofortmassnahme) {
    push("ki", szenario.sofortmassnahme, 4, {
      meta: { art: "sofortmassnahme" },
    });
  }

  push("ki", szenario.zweitfoto.frage, 5);
  push("mieter", "[Foto]", 7, { foto_id: szenario.zweitfoto.korrekt });
  push("ki", szenario.verfeinerung, 8);

  // Die Karte, die das Verkaufsargument sichtbar macht
  push("ki", "Das erspart dem Betrieb voraussichtlich eine zweite Anfahrt.", 9, {
    meta: {
      art: "erkenntnis",
      vorher: szenario.erkenntnis.vorher,
      nachher: szenario.erkenntnis.nachher,
    },
  });

  push("ki", `Einstufung: ${szenario.kategorie}`, 10, {
    meta: {
      art: "klassifizierung",
      prioritaet: szenario.prioritaet,
      gewerk: szenario.gewerk,
    },
  });

  push(
    "ki",
    `Ich habe die Meldung an ${betrieb} weitergeleitet. Der Betrieb meldet sich ` +
      "zur Terminfindung. Sie können mir jederzeit STATUS schreiben, dann zeige " +
      "ich Ihnen den aktuellen Stand.",
    11,
  );

  return liste;
}

// ---------------------------------------------------------------------------
// Verlaufshistorie
// ---------------------------------------------------------------------------

type VerlaufEingabe = {
  tenantId: string;
  vorgangId: string;
  plan: VorgangsBauplan;
  betrieb: string;
  bearbeiter: string;
  schluessel: string;
  vorStunden: (stunden: number) => string;
};

function verlaufseintraege(e: VerlaufEingabe): VorgangVerlauf[] {
  const { tenantId, vorgangId, plan, betrieb, bearbeiter, schluessel } = e;
  const eintraege: VorgangVerlauf[] = [];
  let lfd = 0;

  const push = (
    ereignis: string,
    beschreibung: string,
    akteur: string,
    stunden: number,
  ) => {
    eintraege.push({
      id: stabileUuid(`verlauf:${schluessel}:${lfd++}`),
      tenant_id: tenantId,
      vorgang_id: vorgangId,
      ereignis,
      beschreibung,
      akteur,
      ist_seed: true,
      zeitpunkt: e.vorStunden(stunden),
    });
  };

  const a = plan.alterStunden;
  push("eingegangen", "Meldung über WhatsApp eingegangen", "Mieter", a);
  push(
    "klassifiziert",
    "Kategorie, Gewerk und Priorität automatisch bestimmt",
    "KI-Assistent",
    a - 0.2,
  );

  if (plan.zweitanfahrt) {
    push(
      "nachgefasst",
      "Zweites Foto angefordert und ausgewertet – Diagnose verfeinert",
      "KI-Assistent",
      a - 0.15,
    );
  }

  const nachStatus: Record<Vorgang["status"], () => void> = {
    neu: () => {},
    in_pruefung: () =>
      push(
        "vorbereitet",
        "Handwerkerauftrag zur Freigabe vorgelegt",
        "KI-Assistent",
        a - 0.3,
      ),
    an_handwerker: () => {
      push("freigegeben", "Auftrag freigegeben", bearbeiter, a - 0.5);
      push("beauftragt", `Auftrag an ${betrieb} übermittelt`, "KI-Assistent", a - 0.6);
    },
    termin_vereinbart: () => {
      push("freigegeben", "Auftrag freigegeben", bearbeiter, a - 0.5);
      push("beauftragt", `Auftrag an ${betrieb} übermittelt`, "KI-Assistent", a - 0.6);
      push("terminiert", "Termin mit dem Mieter abgestimmt", betrieb, a - 4);
    },
    in_arbeit: () => {
      push("freigegeben", "Auftrag freigegeben", bearbeiter, a - 0.5);
      push("beauftragt", `Auftrag an ${betrieb} übermittelt`, "KI-Assistent", a - 0.6);
      push("begonnen", "Arbeiten begonnen", betrieb, a - 8);
    },
    erledigt: () => {
      push("freigegeben", "Auftrag freigegeben", bearbeiter, a - 0.5);
      push("beauftragt", `Auftrag an ${betrieb} übermittelt`, "KI-Assistent", a - 0.6);
      push(
        "erledigt",
        "Arbeiten abgeschlossen und vom Mieter bestätigt",
        betrieb,
        a - 30,
      );
    },
    storniert: () => push("storniert", "Vorgang storniert", bearbeiter, a - 2),
  };

  nachStatus[plan.status]();
  return eintraege;
}

/**
 * Wie lange ein Vorgang von der Meldung bis zur Erledigung gebraucht hat.
 *
 * Bewusst je nach Dringlichkeit unterschiedlich und mit Streuung: Wären alle
 * Vorgänge exakt gleich schnell erledigt, wäre die Durchschnittsdauer im
 * Dashboard eine glatte Zahl – und damit sofort als erfunden erkennbar.
 */
function bearbeitungsdauer(prioritaet: Vorgang["prioritaet"], zufall: Zufall): number {
  const [von, bis] = {
    notfall: [3, 9],
    dringend: [11, 34],
    routine: [26, 96],
  }[prioritaet];
  return zufall.zahl(von, bis);
}
