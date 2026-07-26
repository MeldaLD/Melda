/**
 * Bausteine für den Mitarbeitenden, sobald der Assistent übergeben hat.
 *
 * DIESE DATEI IST ZUM SELBST BEARBEITEN GEDACHT.
 *
 * Der Gedanke dahinter: Die KI nimmt auf, fragt nach und bereitet vor. Ab
 * einem bestimmten Punkt hört sie auf zu entscheiden – dann übernimmt ein
 * Mensch. Damit dieser Übergang nicht in Arbeit ausartet, bekommt er alles
 * fertig in die Hand: die E-Mail an den Betrieb, den Leitfaden fürs Telefonat
 * und die Antwort an den Mieter.
 *
 * Warum ein Telefonleitfaden und nicht nur eine E-Mail: In diesem Marktsegment
 * werden Aufträge überwiegend telefonisch vergeben. Wer anruft, ohne die
 * richtigen Fragen parat zu haben, produziert genau die Rückfragen und
 * Zweitanfahrten, die wir vermeiden wollen. Die Punkte je Gewerk unten sind
 * die, die erfahrungsgemäß vergessen werden.
 *
 * Eine Anbindung an die Systeme der Handwerksbetriebe – Auftrag direkt in
 * deren Software, Terminvorschläge zurück – ist der nächste Schritt und
 * bewusst noch nicht Teil davon. Bis dahin gilt: kopieren, anrufen, fertig.
 */

import type { Gewerk } from "@/lib/daten/typen";

/** Angaben, aus denen die Bausteine gebaut werden. */
export type Bausteindaten = {
  firma: string;
  vorgangsnummer: number;
  titel: string;
  kategorie: string;
  gewerk: Gewerk;
  prioritaet: "notfall" | "dringend" | "routine";
  objekt: string;
  einheit: string;
  mieterName: string;
  mieterTelefon: string | null;
  betrieb: string | null;
  zusammenfassung: string | null;
  /** Was das zweite Foto zusätzlich gezeigt hat. Nur wenn vorhanden. */
  erkenntnis: string | null;
  kostenschaetzungEuro: number | null;
  ansprechpartner: string | null;
};

const DRINGLICHKEIT: Record<Bausteindaten["prioritaet"], string> = {
  notfall: "Notfall – bitte heute",
  dringend: "dringend – bitte innerhalb von zwei Werktagen",
  routine: "Routine – Termin nach Ihrer Planung",
};

// --- E-Mail an den Betrieb -------------------------------------------------

export function handwerkerEmail(daten: Bausteindaten): {
  betreff: string;
  text: string;
} {
  const betreff =
    `Auftrag ${daten.vorgangsnummer}: ${daten.titel} – ` +
    `${daten.objekt}, ${daten.einheit}`;

  const zeilen = [
    "Sehr geehrte Damen und Herren,",
    "",
    "bitte übernehmen Sie folgenden Auftrag:",
    "",
    `Objekt:      ${daten.objekt}`,
    `Wohnung:     ${daten.einheit}`,
    `Mieter:      ${daten.mieterName}${daten.mieterTelefon ? `, ${daten.mieterTelefon}` : ""}`,
    `Gewerk:      ${daten.kategorie}`,
    `Dringlichkeit: ${DRINGLICHKEIT[daten.prioritaet]}`,
    "",
    "Befund:",
    daten.zusammenfassung ?? daten.titel,
  ];

  // Der Kern des Nutzens: Was durch die Rückfrage schon feststeht, muss vor
  // Ort nicht mehr herausgefunden werden.
  if (daten.erkenntnis) {
    zeilen.push(
      "",
      "Bereits geklärt (Nachfrage beim Mieter, mit Foto belegt):",
      daten.erkenntnis,
    );
  }

  if (daten.kostenschaetzungEuro) {
    zeilen.push(
      "",
      `Kostenrahmen: bis ${daten.kostenschaetzungEuro} € ohne Rückfrage. ` +
        "Darüber bitten wir vorab um eine kurze Abstimmung.",
    );
  }

  zeilen.push(
    "",
    "Den Termin stimmen Sie bitte direkt mit dem Mieter ab und geben uns",
    "anschließend kurz Bescheid.",
    "",
    "Mit freundlichen Grüßen",
    daten.ansprechpartner ?? daten.firma,
    daten.ansprechpartner ? daten.firma : "",
  );

  return {
    betreff,
    text: zeilen
      .filter((z) => z !== undefined)
      .join("\n")
      .trimEnd(),
  };
}

// --- Antwort an den Mieter -------------------------------------------------

export function mieterNachricht(daten: Bausteindaten): string {
  const betrieb = daten.betrieb ?? "unser Partnerbetrieb";
  const zeit =
    daten.prioritaet === "notfall"
      ? "Der Notdienst ist unterwegs."
      : daten.prioritaet === "dringend"
        ? "Der Betrieb meldet sich innerhalb von zwei Werktagen bei Ihnen."
        : "Der Betrieb meldet sich zur Terminabstimmung bei Ihnen.";

  return (
    `Guten Tag ${daten.mieterName},\n\n` +
    `vielen Dank für Ihre Meldung (Vorgang ${daten.vorgangsnummer}).\n\n` +
    `Wir haben ${betrieb} beauftragt. ${zeit}\n\n` +
    `Ihre Angaben und Fotos liegen dem Betrieb bereits vor – Sie müssen nichts ` +
    `noch einmal erklären.\n\n` +
    `Mit freundlichen Grüßen\n${daten.firma}`
  );
}

// --- Telefonleitfaden ------------------------------------------------------

export type Leitfadenabschnitt = {
  ueberschrift: string;
  punkte: string[];
};

/**
 * Was je Gewerk am Telefon zu klären ist.
 *
 * Bewusst kurz gehalten: Eine Liste mit zwölf Punkten liest im Gespräch
 * niemand. Drei bis vier, die wirklich Zweitanfahrten verhindern.
 */
export const gewerkPunkte: Record<Gewerk, string[]> = {
  sanitaer: [
    "Muss das Wasser für die Wohnung oder den Strang abgestellt werden?",
    "Sind Fliesen betroffen – gibt es passendes Ersatzmaterial im Haus?",
    "Wird ein Trockengerät gebraucht, und wer stellt es?",
  ],
  heizung: [
    "Anlagentyp und Baujahr – hat der Betrieb die Anlage schon einmal gesehen?",
    "Ist der Heizungskeller frei zugänglich oder braucht es einen Schlüssel?",
    "Betrifft es nur eine Wohnung oder den ganzen Strang?",
  ],
  elektro: [
    "Ist der betroffene Stromkreis abgeschaltet?",
    "Zählerschrank zugänglich – wer hat den Schlüssel?",
    "Sind Allgemeinflächen betroffen (Beleuchtung, Klingel, Türöffner)?",
  ],
  schluesseldienst: [
    "Ist eine Person eingeschlossen? Dann Notfall, sofort losfahren lassen.",
    "Schließanlage oder Einzelschloss – muss die ganze Anlage nachgezogen werden?",
    "Wer ist vor Ort und kann die Berechtigung bestätigen?",
  ],
  maler: [
    "Muss vorher getrocknet oder saniert werden?",
    "Farbton und Struktur – gibt es Reste aus der letzten Renovierung?",
    "Muss der Mieter Möbel räumen, und schafft er das bis zum Termin?",
  ],
  schreiner: [
    "Reparatur oder Austausch – wie alt ist das Bauteil?",
    "Maße und Beschlag: Braucht der Betrieb vorab ein Foto der Beschriftung?",
    "Ist ein zweiter Termin für die Montage nach Lieferung einzuplanen?",
  ],
  reinigung: [
    "Einmalige Reinigung oder wiederkehrend?",
    "Werden Container, Wasser oder Strom vor Ort gebraucht?",
    "Wer schließt auf – Hausmeister oder Mieter?",
  ],
  dach: [
    "Wird ein Gerüst oder eine Hubbühne gebraucht? Stellfläche vorhanden?",
    "Ist der Dachboden zugänglich, um von innen zu prüfen?",
    "Reicht eine Notabdichtung bis zum regulären Termin?",
  ],
  sonstiges: [
    "Was genau soll der Betrieb vor Ort tun?",
    "Braucht er Zugang zu Allgemeinflächen?",
    "Reicht ein Termin oder sind zwei nötig?",
  ],
};

export function telefonleitfaden(daten: Bausteindaten): Leitfadenabschnitt[] {
  const betrieb = daten.betrieb ?? "dem Betrieb";

  return [
    {
      ueberschrift: "Einstieg",
      punkte: [
        `Vorgang ${daten.vorgangsnummer}, ${daten.objekt}, ${daten.einheit}.`,
        `${daten.titel} – ${DRINGLICHKEIT[daten.prioritaet]}.`,
        daten.erkenntnis
          ? `Umfang steht schon fest: ${daten.erkenntnis}`
          : "Fotos und Beschreibung des Mieters liegen vor, ich schicke sie gleich mit.",
      ],
    },
    {
      ueberschrift: "Klären",
      punkte: gewerkPunkte[daten.gewerk],
    },
    {
      ueberschrift: "Festhalten",
      punkte: [
        "Wann kommt der Betrieb – Datum und Zeitfenster.",
        daten.mieterTelefon
          ? `Nummer des Mieters durchgeben: ${daten.mieterTelefon}`
          : "Wie erreicht der Betrieb den Mieter?",
        daten.kostenschaetzungEuro
          ? `Kostenrahmen bestätigen: bis ${daten.kostenschaetzungEuro} € ohne Rückfrage.`
          : "Kostenrahmen festlegen und bestätigen lassen.",
        `Zusage von ${betrieb} anschließend hier als Notiz vermerken.`,
      ],
    },
  ];
}
