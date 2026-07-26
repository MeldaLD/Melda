/**
 * Kleinreparaturen und Selbsthilfe-Tipps.
 *
 * Viele deutsche Mietverträge enthalten eine Kleinreparaturklausel: Kosten
 * kleiner Reparaturen trägt der Mieter bis zu einem Höchstbetrag. Bei genau
 * diesen Fällen lohnt sich ein Hinweis, wie sich der Schaden in wenigen
 * Minuten selbst beheben lässt – der Mieter spart Geld, die Verwaltung spart
 * einen Handwerkereinsatz.
 *
 * RECHTLICHER RAHMEN – bitte beim Anpassen beachten:
 *
 *   1. Die Klausel darf nur die KOSTEN übertragen, nicht die Reparatur
 *      selbst. Eine Klausel, die den Mieter zur Ausführung verpflichtet
 *      ("Vornahmeklausel"), ist unwirksam (BGH, 06.05.1992, VIII ZR 129/91).
 *      Der Mieter schuldet Geld, keine Handarbeit.
 *      -> Deshalb ist jeder Tipp hier ein ANGEBOT, nie eine Aufforderung.
 *         Die Formulierungen unten sind entsprechend gewählt.
 *
 *   2. Zulässig ist ein Höchstbetrag je Einzelfall zwischen etwa 80 und
 *      150 Euro; gängig sind 100 bis 120 Euro. Zusätzlich braucht es eine
 *      Jahresobergrenze von etwa 8 Prozent der Jahreskaltmiete. Fehlt eine
 *      der beiden Grenzen oder ist sie zu hoch, ist die ganze Klausel
 *      unwirksam – und der Vermieter trägt alles.
 *
 *   3. Die Klausel greift nur bei Teilen, auf die der Mieter häufig direkt
 *      zugreift: Armaturen, Schalter, Griffe, Verschlüsse. Nicht bei
 *      Leitungen in der Wand, Heizungsanlage oder Bausubstanz.
 *
 * DEMO: Ob im konkreten Mietvertrag überhaupt eine wirksame Klausel steht,
 * weiß diese Anwendung nicht. Im Echtbetrieb käme das aus dem Vertrag im ERP.
 */

export const kleinreparaturen = {
  /** Höchstbetrag je Einzelfall in Euro. Im Dashboard je Mandant anpassbar. */
  grenzeEuro: 100,

  /** Jahresobergrenze als Anteil der Jahreskaltmiete. */
  jahresgrenzeAnteil: 0.08,

  /**
   * Untergrenze für ein Selbsthilfe-Angebot. Bei sehr kleinen Beträgen lohnt
   * die Erklärung nicht, da schickt man besser gleich jemanden vorbei.
   */
  mindestbetragFuerTippEuro: 20,
} as const;

export type Selbsthilfe = {
  /** Überschrift der Anleitung im Chat. */
  titel: string;
  /** Realistische Dauer für einen ungeübten Menschen. */
  dauerMinuten: number;
  /** Was gebraucht wird. Leer, wenn nichts nötig ist. */
  material: string[];
  schritte: string[];
  /**
   * Suchbegriff für ein Erklärvideo. Bewusst eine Suche und kein fester
   * Link: Einzelne Videos verschwinden, eine gute Suche bleibt gültig.
   */
  videoSuche: string;
  /** Wann der Tipp NICHT gegeben werden darf. Erscheint als Warnhinweis. */
  abbruchHinweis?: string;
};

/**
 * Selbsthilfe-Anleitungen je Szenario aus config/scenarios.ts.
 *
 * Nur für Fälle, die ein Laie gefahrlos beheben kann. Bewusst nichts an
 * Strom, Gas, Heizungsanlage oder Bausubstanz – dort ist der Tipp nicht nur
 * rechtlich heikel, sondern gefährlich.
 */
export const selbsthilfeKatalog: Record<string, Selbsthilfe> = {
  "wasserhahn-tropft": {
    titel: "Tropfenden Wasserhahn selbst abdichten",
    dauerMinuten: 20,
    material: [
      "Ersatzkartusche oder Dichtung (Baumarkt, ca. 8 €)",
      "Innensechskantschlüssel",
      "Wasserpumpenzange",
    ],
    schritte: [
      "Eckventil unter der Spüle zudrehen und den Hahn kurz öffnen, bis kein Wasser mehr kommt.",
      "Abdeckkappe am Hebel abhebeln, Schraube darunter lösen, Hebel abnehmen.",
      "Überwurfmutter lösen und die Kartusche herausziehen.",
      "Neue Kartusche einsetzen, in umgekehrter Reihenfolge zusammenbauen.",
      "Eckventil langsam wieder öffnen und auf Dichtheit prüfen.",
    ],
    videoSuche: "Einhebelmischer Kartusche wechseln Anleitung",
    abbruchHinweis:
      "Wenn Wasser am Anschluss unter der Spüle austritt statt am Auslauf, bitte nicht selbst weitermachen – dann kommt der Betrieb.",
  },

  "abfluss-verstopft": {
    titel: "Verstopften Siphon selbst reinigen",
    dauerMinuten: 15,
    material: ["Eimer", "Haushaltshandschuhe", "eventuell eine alte Zahnbürste"],
    schritte: [
      "Eimer unter den Siphon stellen – dort steht immer Wasser.",
      "Die beiden Überwurfmuttern von Hand lösen, notfalls mit einer Zange nachhelfen.",
      "Unterteil abnehmen, Inhalt in den Eimer entleeren und ausspülen.",
      "Dichtungen auf Sitz prüfen, Siphon wieder handfest verschrauben.",
      "Wasser laufen lassen und auf undichte Stellen schauen.",
    ],
    videoSuche: "Siphon reinigen Waschbecken Anleitung",
    abbruchHinweis:
      "Bitte keine chemischen Rohrreiniger verwenden – die greifen die Dichtungen an und der Schaden wird größer.",
  },

  fensterschloss: {
    titel: "Lockeren Fenstergriff selbst festziehen",
    dauerMinuten: 5,
    material: ["Kreuzschlitz-Schraubendreher"],
    schritte: [
      "Die Abdeckung an der Griffplatte um 90 Grad drehen – darunter liegen zwei Schrauben.",
      "Beide Schrauben gleichmäßig nachziehen, nicht mit Gewalt.",
      "Abdeckung zurückdrehen und den Griff prüfen.",
    ],
    videoSuche: "Fenstergriff nachziehen locker Anleitung",
    abbruchHinweis:
      "Wenn sich der Griff weiterhin durchdreht oder das Fenster nicht mehr schließt, ist der Beschlag defekt – dann übernimmt das der Betrieb.",
  },

  "heizung-kalt": {
    titel: "Heizkörper selbst entlüften",
    dauerMinuten: 10,
    material: ["Entlüftungsschlüssel (Baumarkt, ca. 2 €)", "kleine Schüssel", "Lappen"],
    schritte: [
      "Thermostat ganz aufdrehen und etwa 30 Minuten warten.",
      "Schüssel unter das Entlüftungsventil oben seitlich am Heizkörper halten.",
      "Ventil mit dem Schlüssel eine Vierteldrehung öffnen – es zischt.",
      "Sobald gleichmäßig Wasser statt Luft kommt, Ventil wieder schließen.",
      "Nach einer Stunde prüfen, ob der Heizkörper gleichmäßig warm wird.",
    ],
    videoSuche: "Heizkörper entlüften Anleitung Schritt für Schritt",
    abbruchHinweis:
      "Wenn kein Wasser nachkommt oder mehrere Heizkörper kalt bleiben, fehlt Druck in der Anlage – das gehört in fachkundige Hände.",
  },

  muellraum: {
    titel: "Selbst schnell zu lösen",
    dauerMinuten: 5,
    material: [],
    schritte: [
      "Falls es sich um Sperrmüll handelt: Eine Abholung lässt sich beim örtlichen Entsorger meist kostenlos anmelden.",
      "Karton bitte flach zusammenfalten – dann passt oft das Doppelte in die Tonne.",
    ],
    videoSuche: "Sperrmüll anmelden Ablauf",
  },
};

/** Gibt es für dieses Szenario einen Selbsthilfe-Tipp? */
export function selbsthilfeFuer(szenarioId: string): Selbsthilfe | undefined {
  return selbsthilfeKatalog[szenarioId];
}

/**
 * Fällt der Fall voraussichtlich unter die Kleinreparaturklausel?
 * Reine Betragsprüfung – ob der Mietvertrag überhaupt eine wirksame Klausel
 * enthält, entscheidet die Verwaltung.
 */
export function istKleinreparatur(kostenEuro: number, grenzeEuro: number): boolean {
  return kostenEuro > 0 && kostenEuro <= grenzeEuro;
}

/** Fertige YouTube-Suche zu einer Anleitung. */
export function videoLink(suche: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(suche)}`;
}
