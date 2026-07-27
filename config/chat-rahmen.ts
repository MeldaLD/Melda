/**
 * Die generischen Texte des Gesprächs.
 *
 * Alles, was unabhängig vom konkreten Schaden gesagt wird: Begrüßung,
 * Weiterleitung, Erreichbarkeit, Statusanzeige. Die schadensspezifischen Texte
 * stehen in config/scenarios.ts.
 *
 * Diese Trennung ist der Grund, warum ein neues Szenario ohne Programmierung
 * auskommt: Der Rahmen bleibt gleich, nur die Füllung wechselt.
 */

export const chatRahmen = {
  begruessung: (firma: string) =>
    `Guten Tag, hier ist der Serviceassistent der ${firma}. ` +
    `Sie erreichen mich rund um die Uhr – ganz normal per Nachricht, ohne App ` +
    `und ohne Anmeldung.`,

  /**
   * Der Einstieg fragt nach dem Anliegen, nicht nach einem Schaden.
   *
   * Wer nur "Schaden melden" anbietet, bekommt trotzdem alles andere – nur
   * unsortiert. Und die meisten Anliegen lassen sich hier abschließen, ohne
   * dass jemand telefonieren muss. Die Themen stehen in config/anliegen.ts.
   */
  anliegenFrage: "Worum geht es? Tippen Sie einfach an, was am besten passt.",

  aufforderung:
    "Beschreiben Sie mir kurz, worum es geht, oder senden Sie mir gleich ein Foto. " +
    "Mit einem Bild geht es meist deutlich schneller.",

  /** Nach einer Auskunft: Hat es gereicht? */
  auskunftNachfrage: "Hilft Ihnen das weiter?",

  auskunftGeholfen:
    "Freut mich. Sie erreichen mich jederzeit hier – ohne Wartezeit und ohne " +
    "Telefon.",

  /**
   * Der Rückruf ist die letzte Stufe, nicht die erste.
   *
   * Er wird angeboten, sobald die Auskunft nicht gereicht hat – aber erst
   * dann. Ein Knopf "Rückruf" gleich am Anfang würde die Hälfte der
   * Gespräche zu Telefonaten machen, die niemand braucht.
   */
  auskunftNichtGeholfen:
    "Verstanden, dann kümmert sich jemand persönlich darum. Sie können mir " +
    "hier schreiben, worum es genau geht – oder wir rufen Sie zurück.",

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

  /**
   * Rückfalltext, wenn ein Szenario kein zweites Foto braucht und selbst
   * keine Begründung mitbringt. Besser als Schweigen – der Mieter soll
   * merken, dass hier entschieden und nicht bloß abgehakt wurde.
   */
  keineWeitereFrage: "Das genügt mir, weitere Fotos brauche ich dafür nicht.",

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
    "ihn frei, danach fragen wir beim Betrieb nach möglichen Terminen.",

  weiterleitungNotfall: (betrieb: string) =>
    `Ich habe den Notdienst von ${betrieb} alarmiert und Ihre Hausverwaltung ` +
    "parallel per SMS benachrichtigt. Der Notdienst ist in etwa 45 Minuten bei Ihnen.",

  /**
   * Kleinreparatur: Kostenhinweis und Selbsthilfe-Angebot.
   *
   * Sprachlich sehr bewusst gewählt. Die Kleinreparaturklausel überträgt nur
   * die KOSTEN, nicht die Pflicht zu reparieren – eine Vornahmeklausel wäre
   * unwirksam. Deshalb wird hier angeboten, nie aufgefordert, und der Satz
   * "Sie müssen das natürlich nicht selbst machen" steht ausdrücklich dabei.
   */
  kleinreparaturHinweis: (kosten: number, grenze: number) =>
    `Ein Hinweis vorweg: Ein Handwerkereinsatz kostet hier erfahrungsgemäß ` +
    `etwa ${kosten} Euro. Reparaturen bis ${grenze} Euro tragen Mieter laut ` +
    "vielen Mietverträgen selbst – Ihr Mietvertrag enthält vermutlich eine " +
    "solche Kleinreparaturklausel.",

  selbsthilfeFrage: (dauer: number) =>
    `Das lässt sich in etwa ${dauer} Minuten selbst beheben, dann entstehen ` +
    "Ihnen gar keine Kosten. Soll ich Ihnen zeigen, wie das geht? Sie müssen " +
    "das natürlich nicht selbst machen – sagen Sie einfach Bescheid, dann " +
    "beauftragen wir den Betrieb.",

  selbsthilfeAbgelehnt: "Alles klar, dann kümmern wir uns darum.",

  selbsthilfeErfolgFrage:
    "Sagen Sie mir gern Bescheid, ob es geklappt hat. Falls nicht, beauftrage " +
    "ich sofort den Betrieb – Sie müssen nichts noch einmal erklären.",

  selbsthilfeGeklappt:
    "Sehr schön, dann schließe ich die Meldung. Ihre Hausverwaltung sieht, " +
    "dass sich die Sache erledigt hat. Melden Sie sich jederzeit wieder.",

  selbsthilfeNichtGeklappt:
    "Kein Problem, das war einen Versuch wert. Ich kümmere mich jetzt darum.",

  /**
   * Wann ist der Mieter erreichbar – und nichts weiter.
   *
   * Hier standen einmal drei konkrete Zeitfenster zur Auswahl. Das war
   * falsch, und zwar nicht nur in der Demo: In Deutschland nennt der
   * Handwerksbetrieb die Zeitpunkte, an denen er kann. Betriebe sind
   * ausgelastet; wer ihnen einen Termin vorsetzt, bekommt eine Absage oder
   * gar keine Antwort. Drei Fenster anzubieten, die wir uns aus Werktagen
   * und Öffnungszeiten gerechnet haben, wäre ein Versprechen gewesen, das
   * niemand gegeben hat.
   *
   * Die Erreichbarkeit ist trotzdem wertvoll: Sie geht mit der Anfrage an
   * den Betrieb, damit der Fenster vorschlägt, die überhaupt passen können.
   */
  erreichbarkeitFrage:
    "Die Zeitfenster nennt uns der Betrieb – dazu fragen wir ihn gleich an. " +
    "Damit er passende vorschlägt: Wann sind Sie grundsätzlich erreichbar?",

  erreichbarkeitNotiert: (zeit: string) =>
    `Notiert: ${zeit}. Das geben wir dem Betrieb mit. Sobald er uns ` +
    "Zeitfenster genannt hat, bekommen Sie sie hier zur Auswahl – Sie " +
    "müssen nichts weiter tun.",

  /**
   * Der Betrieb hat sich gemeldet und Zeitfenster genannt.
   *
   * Für den Mieter ist das der Moment, in dem sichtbar wird, dass jemand
   * gearbeitet hat, ohne dass er etwas tun musste – deshalb steht das
   * ausdrücklich in der Nachricht.
   */
  terminauswahlFrage: (titel: string) =>
    `Gute Nachrichten zu „${titel}": Der Betrieb hat uns Termine genannt. ` +
    "Welcher passt Ihnen am besten?",

  terminauswahlBestaetigt: (fenster: string) =>
    `${fenster} ist vorgemerkt. Ihre Hausverwaltung bestätigt den Termin, ` +
    "danach bekommen Sie von uns die verbindliche Zusage.",

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

  /** Das Thema stand schon am Anfang – nicht noch einmal fragen. */
  rueckrufUebernommen: (grund: string) =>
    `Gern, es geht um „${grund}". Wann erreichen wir Sie am besten?`,

  rueckrufZeitFrage: "Und wann erreichen wir Sie am besten?",

  rueckrufBestaetigt: (grund: string, zeit: string) =>
    `Notiert: Rückruf zum Thema „${grund}", Erreichbarkeit ${zeit.toLowerCase()}. ` +
    "Die Verwaltung meldet sich in der Regel innerhalb eines Werktags bei Ihnen.",

  statusEinleitung: "Hier der aktuelle Stand Ihrer Meldung:",

  statusEinleitungMehrere: (anzahl: number) =>
    `Sie haben ${anzahl} Meldungen bei uns. Hier der aktuelle Stand:`,

  /** Beschriftungen der Schnellantwort-Knöpfe. */
  knoepfe: {
    ja: "Ja, das stimmt",
    nein: "Nein, etwas anderes",
    foto: "Foto senden",
    status: "Status",
    rueckruf: "Rückruf",
    neueMeldung: "Neue Meldung",
    anleitung: "Ja, zeigen Sie mir das",
    lieberHandwerker: "Nein, bitte Handwerker",
    hatGeklappt: "Hat geklappt",
    hatNichtGeklappt: "Hat nicht geklappt",
    hilftWeiter: "Ja, danke",
    hilftNicht: "Nein, ich brauche jemanden",
  },
} as const;
