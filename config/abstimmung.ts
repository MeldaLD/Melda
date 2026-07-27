/**
 * Terminabstimmung zwischen Betrieb und Mieter.
 *
 * DIESE DATEI IST ZUM SELBST BEARBEITEN GEDACHT.
 *
 * Der Schritt hinter der Auftragsvergabe: Nicht das Beauftragen kostet Zeit,
 * sondern das Hin und Her, bis Betrieb und Mieter denselben Termin haben.
 * Drei Anrufe, zwei Rückrufe, ein Anrufbeantworter – und am Ende passt es
 * doch nicht.
 *
 * Der Weg drumherum:
 *
 *   1. Der Betrieb bekommt eine Nachricht mit einem Link.
 *   2. Hinter dem Link nennt er drei Zeitfenster. Ohne Anmeldung, ohne App,
 *      auf dem Telefon in zwanzig Sekunden erledigt.
 *   3. Der Mieter bekommt die drei Fenster im Chat und wählt eines.
 *   4. Die Verwaltung bestätigt – und nur dieser eine Schritt kostet sie Zeit.
 *
 * Voraussetzung ist die Zustimmung des Betriebs (handwerker.abstimmung_erlaubt).
 * Ohne sie geht keine Nachricht raus: Ein Handwerksbetrieb, dem ungefragt
 * Nachrichten eines fremden Systems ins Postfach laufen, ist als Partner
 * verloren.
 */

export type Abstimmungsdaten = {
  firma: string;
  vorgangsnummer: number;
  titel: string;
  objekt: string;
  einheit: string;
  mieterName: string;
  betrieb: string;
  ansprechpartner: string | null;
  /**
   * Wann der Mieter grundsätzlich erreichbar ist: "vormittag" | "nachmittag"
   * | "egal" | null.
   *
   * Ausdrücklich kein Terminwunsch. Welche Zeitpunkte möglich sind, weiß nur
   * der Betrieb – er ist ausgelastet, nicht wir. Diese Angabe hilft ihm
   * lediglich, Fenster vorzuschlagen, die überhaupt in Frage kommen.
   */
  erreichbarkeit: string | null;
  /** Frühester Einsatz laut hinterlegter Reaktionszeit. */
  reaktionszeitH: number;
  zusammenfassung: string | null;
  erkenntnis: string | null;
};

export type Fenster = { beginn: Date; ende: Date };

const ARBEITSBEGINN = 8;
const ARBEITSENDE = 16;
const FENSTERLAENGE_H = 2;

/** Nächster Werktag ab einem Zeitpunkt. */
function werktag(ab: Date): Date {
  const tag = new Date(ab);
  while (tag.getDay() === 0 || tag.getDay() === 6) {
    tag.setDate(tag.getDate() + 1);
    tag.setHours(ARBEITSBEGINN, 0, 0, 0);
  }
  return tag;
}

function fenster(tag: Date, stunde: number): Fenster {
  const beginn = new Date(tag);
  beginn.setHours(stunde, 0, 0, 0);
  return {
    beginn,
    ende: new Date(beginn.getTime() + FENSTERLAENGE_H * 3600_000),
  };
}

/**
 * Vorbelegung der drei Felder auf der Seite des Betriebs.
 *
 * Der Betrieb soll etwas Sinnvolles vorfinden und nur noch korrigieren
 * müssen – ein leeres Formular wird deutlich seltener ausgefüllt. Die
 * Vorschläge halten sich an die zugesagte Reaktionszeit.
 *
 * Wichtig ist, was das hier NICHT ist: kein Termin und keine Zusage, sondern
 * eine Schreibhilfe. Entschieden wird in dem Moment, in dem der Betrieb auf
 * Senden tippt. Ist die Erreichbarkeit des Mieters bekannt, liegen die
 * Vorschläge in der passenden Tageshälfte – sonst schlüge das Formular
 * Zeiten vor, an denen ohnehin niemand öffnet.
 */
export function vorschlaegeVorbelegen(
  daten: Abstimmungsdaten,
  jetzt = new Date(),
): Fenster[] {
  const fruehestens = new Date(jetzt.getTime() + daten.reaktionszeitH * 3600_000);
  const liste: Fenster[] = [];

  const brauchbar = (f: Fenster) =>
    f.beginn >= fruehestens &&
    f.beginn.getHours() >= ARBEITSBEGINN &&
    f.ende.getHours() <= ARBEITSENDE &&
    f.beginn.getDay() !== 0 &&
    f.beginn.getDay() !== 6;

  // Erreichbarkeit des Mieters bestimmt die Tageshälfte, nicht den Tag.
  const stunden =
    daten.erreichbarkeit === "vormittag"
      ? [ARBEITSBEGINN, 10]
      : daten.erreichbarkeit === "nachmittag"
        ? [13, 14]
        : [ARBEITSBEGINN, 13];

  const tag = werktag(new Date(Math.max(fruehestens.getTime(), jetzt.getTime())));
  let versuche = 0;
  while (liste.length < 3 && versuche < 14) {
    for (const stunde of stunden) {
      const kandidat = fenster(tag, stunde);
      if (
        brauchbar(kandidat) &&
        !liste.some((f) => f.beginn.getTime() === kandidat.beginn.getTime())
      ) {
        liste.push(kandidat);
      }
      if (liste.length >= 3) break;
    }
    tag.setDate(tag.getDate() + 1);
    werktag(tag);
    versuche += 1;
  }

  return liste.slice(0, 3);
}

// --- Texte -----------------------------------------------------------------

export function fensterText(f: Fenster): string {
  const tag = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Berlin",
  }).format(f.beginn);
  const zeit = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  return `${tag}, ${zeit.format(f.beginn)}–${zeit.format(f.ende)} Uhr`;
}

/** Die Nachricht an den Betrieb. Kurz – sie wird auf dem Telefon gelesen. */
export function anfrageAnBetrieb(daten: Abstimmungsdaten, link: string): string {
  const anrede = daten.ansprechpartner
    ? `Guten Tag ${daten.ansprechpartner},`
    : "Guten Tag,";

  return [
    anrede,
    "",
    `hier ${daten.firma}, Auftrag ${daten.vorgangsnummer}.`,
    "",
    daten.titel,
    `${daten.objekt}, ${daten.einheit}`,
    daten.zusammenfassung ?? "",
    daten.erkenntnis ? `Bereits geklärt: ${daten.erkenntnis}` : "",
    erreichbarkeitText(daten.erreichbarkeit),
    "",
    "Bitte nennen Sie uns drei Zeitfenster, an denen Sie können:",
    link,
    "",
    "Das dauert keine Minute und braucht keine Anmeldung. Den Rest – Abstimmung",
    "mit dem Mieter und Bestätigung – übernehmen wir.",
  ]
    .filter((z) => z !== "")
    .join("\n");
}

/** Der Betreff, wenn der Betrieb per E-Mail angesprochen wird. */
export function anfrageBetreff(daten: Abstimmungsdaten): string {
  return (
    `Terminanfrage Auftrag ${daten.vorgangsnummer}: ${daten.titel} – ` +
    `${daten.objekt}, ${daten.einheit}`
  );
}

/**
 * Die Erreichbarkeit in einem Satz, wie sie beim Betrieb ankommt.
 *
 * Bewusst als Angabe formuliert und nicht als Bitte: Der Betrieb soll nicht
 * das Gefühl haben, dass ihm jemand seinen Kalender vorschreibt.
 */
export function erreichbarkeitText(erreichbarkeit: string | null): string {
  if (erreichbarkeit === "vormittag") return "Mieter ist vormittags erreichbar.";
  if (erreichbarkeit === "nachmittag") return "Mieter ist nachmittags erreichbar.";
  if (erreichbarkeit === "egal") return "Mieter ist ganztägig erreichbar.";
  return "";
}

/** Was der Mieter zu lesen bekommt, sobald der Betrieb geantwortet hat. */
export function auswahlAnMieter(daten: Abstimmungsdaten, anzahl: number): string {
  return (
    `${daten.betrieb} hat ${anzahl === 1 ? "einen Termin" : `${anzahl} Termine`} ` +
    `für „${daten.titel}“ angeboten. Welcher passt Ihnen am besten?`
  );
}

/** Bestätigung an den Mieter – geht erst nach Freigabe raus. */
export function bestaetigungAnMieter(
  daten: Abstimmungsdaten,
  gewaehlt: Fenster,
): string {
  return (
    `Guten Tag ${daten.mieterName},\n\n` +
    `Ihr Termin steht: ${daten.betrieb} kommt am ${fensterText(gewaehlt)}.\n\n` +
    `Bitte sorgen Sie dafür, dass jemand die Tür öffnen kann. Sollte etwas ` +
    `dazwischenkommen, schreiben Sie uns einfach hier.\n\n` +
    `Mit freundlichen Grüßen\n${daten.firma}`
  );
}

/** Worauf sich die Terminbestätigung im Freigabe-Center stützt. */
export function begruendung(daten: Abstimmungsdaten, gewaehlt: Fenster): string {
  return (
    `${daten.betrieb} hat über den Terminlink Fenster angeboten, ` +
    `${daten.mieterName} hat ${fensterText(gewaehlt)} gewählt. Beide Seiten haben ` +
    `zugestimmt; mit Ihrer Freigabe geht die Bestätigung raus.`
  );
}
