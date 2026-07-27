/**
 * Welche Daten die Übersicht zeigt.
 *
 * Die Demo bringt einen fertigen Bestand mit: rund zwei Wochen Vorgänge,
 * Termine, Freigaben. Das ist nützlich, um zu zeigen, wie ein voller
 * Arbeitstag aussieht – aber es verdeckt genau die Sache, die den Unterschied
 * macht: dass eine WhatsApp-Nachricht des Mieters Sekunden später als Vorgang
 * in der Übersicht steht.
 *
 * Deshalb ist die Übersicht zunächst leer und füllt sich vor den Augen des
 * Betrachters. Wer danach sehen möchte, wie es mit Betrieb aussieht, lädt die
 * Beispieldaten dazu – am Ende der Tour oder über die Leiste über der Liste.
 *
 * Unterschieden wird an der Spalte ist_seed: Beispieldaten sind true, alles
 * live Entstandene ist false. Dieselbe Spalte benutzt schon das Zurücksetzen.
 */

export const ansichtKonfiguration = {
  /**
   * Beispieldaten beim ersten Aufruf ausblenden.
   *
   * Auf false setzen, wenn eine Vorführung direkt mit vollem Bestand
   * beginnen soll – dann verhält sich die Demo wie früher.
   */
  beispieleZunaechstAusblenden: true,

  /** Wie lange die Entscheidung "Beispieldaten laden" gilt (Stunden). */
  entscheidungGiltStunden: 8,
} as const;

export const ansichtTexte = {
  /** Nichts gemeldet, Beispiele ausgeblendet – der Normalfall zu Beginn. */
  leer: {
    titel: "Hier ist noch nichts – und das ist der Punkt.",
    text:
      "Diese Übersicht zeigt nur, was wirklich hereinkommt. Melden Sie im " +
      "Chat einen Schaden, als wären Sie Ihr Mieter: Der Vorgang erscheint " +
      "hier, während Sie noch schreiben.",
    zumChat: "Chat öffnen",
  },

  /** Eigene Vorgänge vorhanden, Beispiele weiterhin ausgeblendet. */
  fokus: {
    text: (eigene: number, ausgeblendet: number) =>
      `${eigene === 1 ? "Ein Vorgang" : `${eigene} Vorgänge`} aus dieser Demo. ` +
      `${ausgeblendet} Beispielvorgänge sind ausgeblendet, damit Sie sehen, ` +
      `was der Chat auslöst.`,
    laden: "Beispieldaten dazuladen",
  },

  /** Voller Bestand. */
  voll: {
    text: (eigene: number) =>
      eigene === 0
        ? "Sie sehen den vollständigen Beispielbestand dieser Demo."
        : `Beispieldaten und ${eigene === 1 ? "Ihr Vorgang" : `Ihre ${eigene} Vorgänge`} aus dem Chat.`,
    ausblenden: "Nur meine Vorgänge",
  },
} as const;
