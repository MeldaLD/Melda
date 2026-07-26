/**
 * Die generischen Texte des Gesprächs.
 *
 * Alles, was unabhängig vom konkreten Schaden gesagt wird: Begrüßung,
 * Weiterleitung, Terminfrage, Statusanzeige. Die schadensspezifischen Texte
 * stehen in config/scenarios.ts.
 *
 * Diese Trennung ist der Grund, warum ein neues Szenario ohne Programmierung
 * auskommt: Der Rahmen bleibt gleich, nur die Füllung wechselt.
 */

export const chatRahmen = {
  begruessung: (firma: string) =>
    `Guten Tag, hier ist der Serviceassistent der ${firma}. ` +
    `Sie können mir hier rund um die Uhr Schäden melden – ganz normal per ` +
    `Nachricht, ohne App und ohne Anmeldung.`,

  aufforderung:
    "Beschreiben Sie mir kurz, worum es geht, oder senden Sie mir gleich ein Foto. " +
    "Mit einem Bild geht es meist deutlich schneller.",

  /** Hinweis im Foto-Dialog. Rechtlich sauber und wirkt professionell. */
  fotoHinweis: "Aus Datenschutzgründen arbeitet diese Demo mit Beispielbildern.",

  /** Freitext ohne erkennbares Stichwort. */
  nichtVerstanden:
    "Das habe ich noch nicht sicher zuordnen können. Am schnellsten geht es mit " +
    "einem Foto – tippen Sie dazu auf das Kamerasymbol.",

  /** Der Mieter verneint die erste Diagnose. */
  korrekturAngebot:
    "Danke für den Hinweis, dann schaue ich es mir anders an. Senden Sie mir " +
    "bitte noch ein Bild, dann ordne ich es neu ein.",

  /** Zweites Foto passt nicht – ein Versuch wird freundlich abgefangen. */
  zweitfotoUnpassend:
    "Auf diesem Bild erkenne ich den betroffenen Bereich leider nicht. Geht es " +
    "etwas weiter weg, sodass die Umgebung mit drauf ist?",

  /**
   * Wichtig für die Glaubwürdigkeit: Bei allem außer Notfällen wird der
   * Auftrag nur vorbereitet. Freigegeben wird er von der Verwaltung. Eine
   * Formulierung wie "habe ich beauftragt" würde dem Kernversprechen
   * widersprechen, dass die KI nichts allein entscheidet.
   */
  weiterleitung: (betrieb: string) =>
    `Ich habe den Auftrag für ${betrieb} vorbereitet. Ihre Hausverwaltung gibt ` +
    "ihn frei, anschließend meldet sich der Betrieb bei Ihnen zur Terminfindung.",

  weiterleitungNotfall: (betrieb: string) =>
    `Ich habe den Notdienst von ${betrieb} alarmiert und Ihre Hausverwaltung ` +
    "parallel per SMS benachrichtigt. Der Notdienst ist in etwa 45 Minuten bei Ihnen.",

  terminfrage: "Der Betrieb hat freie Zeitfenster. Welches passt Ihnen am besten?",

  terminBestaetigt: (fenster: string) =>
    `Ihr Termin am ${fenster} ist notiert. Der Betrieb bekommt die Bestätigung ` +
    "und meldet sich, falls sich etwas ändert.",

  abschluss:
    "Sie können mir jederzeit STATUS schreiben, dann zeige ich Ihnen den " +
    "aktuellen Stand. Für ein persönliches Gespräch mit der Verwaltung tippen " +
    "Sie auf Rückruf.",

  /**
   * Rückruf: Der Mieter nennt nur das Thema und seine Erreichbarkeit.
   * Wer zurückruft, entscheidet die Verwaltung im Dashboard – wir kennen die
   * interne Zuständigkeit und die Urlaubsvertretungen nicht.
   */
  rueckrufFrage:
    "Gern. Worum geht es? Dann landet Ihre Anfrage gleich bei der richtigen " +
    "Stelle in der Verwaltung.",

  rueckrufZeitFrage: "Und wann erreichen wir Sie am besten?",

  rueckrufBestaetigt: (grund: string, zeit: string) =>
    `Notiert: Rückruf zum Thema „${grund}", Erreichbarkeit ${zeit.toLowerCase()}. ` +
    "Die Verwaltung meldet sich in der Regel innerhalb eines Werktags bei Ihnen.",

  statusEinleitung: "Hier der aktuelle Stand Ihrer Meldung:",

  /** Beschriftungen der Schnellantwort-Knöpfe. */
  knoepfe: {
    ja: "Ja, das stimmt",
    nein: "Nein, etwas anderes",
    foto: "Foto senden",
    status: "Status",
    rueckruf: "Rückruf",
    neueMeldung: "Neue Meldung",
  },
} as const;
