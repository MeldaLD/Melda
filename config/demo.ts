/**
 * Zentrale Stellschrauben der Demo.
 * Hier können Sie das Verhalten anpassen, ohne Komponenten anzufassen.
 */

export const demoKonfiguration = {
  /** Zeiten in Millisekunden – steuern, wie "menschlich" der Chat wirkt. */
  chat: {
    /** Wie lange der "tippt gerade…"-Indikator vor einer kurzen Antwort läuft. */
    tippenKurz: 900,
    /** Vor einer langen Antwort (Diagnose, Zusammenfassung). */
    tippenLang: 1800,
    /** Kunstpause zwischen zwei aufeinanderfolgenden KI-Nachrichten. */
    pauseZwischenNachrichten: 400,
    /** "Bild wird analysiert" – bewusst etwas länger, das wirkt nach Arbeit. */
    bildAnalyse: 2200,
  },

  /** Feature-Schalter. */
  flags: {
    /** Später: echte LLM-Aufrufe statt der Skript-Maschine. Heute immer false. */
    echteKiAntworten: false,
    /** Geführte Tour beim ersten Aufruf automatisch starten. */
    tourAutomatischStarten: true,
  },

  /**
   * Kaufmännische Annahmen für die Nutzenrechnung im Dashboard.
   *
   * DEMO: Frei gewählte, aber begründbare Werte – keine erhobene Statistik.
   * Diese Zahlen behaupten wir gegenüber dem Kunden sichtbar, Sie müssen sie
   * also verteidigen können. Die Herleitung steht deshalb jeweils dabei.
   */
  kennzahlen: {
    /** Anteil der Handwerkeraufträge mit vermeidbarer Zweitanfahrt. */
    anteilZweitanfahrten: 0.3,

    /** Kosten einer vermeidbaren Zweitanfahrt in Euro:
     *  Anfahrtspauschale plus eine angefangene Arbeitsstunde. */
    kostenZweitanfahrtEuro: 180,

    /** Minuten, die eine telefonisch aufgenommene Meldung die Verwaltung
     *  kostet: Anruf annehmen und notieren, Rückfragen, Handwerker briefen,
     *  Mieter zurückrufen. Konservativ gerechnet. */
    minutenProVorgang: 20,

    /** Zusätzliche Minuten Koordination je Zweitanfahrt: Rückmeldung des
     *  Betriebs, neuer Termin, erneute Absprache mit dem Mieter. */
    minutenProZweitanfahrt: 15,
  },
} as const;
