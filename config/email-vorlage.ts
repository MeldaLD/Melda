/**
 * Das Anschreiben an den Interessenten.
 *
 * DIESE DATEI IST ZUM SELBST BEARBEITEN GEDACHT.
 *
 * Bewusst kurz gehalten. Ein Hausverwalter Ü50 mit vollem Postfach liest
 * keine zwei Bildschirmseiten – die Demo soll die Arbeit machen, nicht der
 * Text. Ein einziger Link, ein einziger Grund zu klicken.
 */

export type VorlagenDaten = {
  firma: string;
  ansprechpartner: string | null;
  stadt: string;
  link: string;
  /** Erstes Objekt des Mandanten, macht die Personalisierung greifbar. */
  erstesObjekt: string | null;
  absender: string;
};

export type EmailVorlage = {
  id: string;
  name: string;
  beschreibung: string;
  betreff: (d: VorlagenDaten) => string;
  text: (d: VorlagenDaten) => string;
};

function anrede(d: VorlagenDaten): string {
  if (!d.ansprechpartner) return "Sehr geehrte Damen und Herren,";
  // "Herr Peter Muster" -> "Sehr geehrter Herr Muster,"
  const teile = d.ansprechpartner.trim().split(/\s+/);
  const nachname = teile[teile.length - 1];
  if (/^Herr/i.test(d.ansprechpartner)) return `Sehr geehrter Herr ${nachname},`;
  if (/^Frau/i.test(d.ansprechpartner)) return `Sehr geehrte Frau ${nachname},`;
  return `Guten Tag ${d.ansprechpartner},`;
}

export const emailVorlagen: EmailVorlage[] = [
  {
    id: "erstkontakt",
    name: "Erstkontakt",
    beschreibung: "Kalte Ansprache. Kurz, ein Link, keine Anhänge.",
    betreff: (d) => `Schadensmeldungen per WhatsApp – kurz angesehen für ${d.firma}`,
    text: (d) => `${anrede(d)}

ich habe eine kurze Demonstration für Sie vorbereitet – mit ${
      d.erstesObjekt ? `Ihrer ${d.erstesObjekt}` : `Objekten aus ${d.stadt}`
    } als Beispiel.

Es geht um Schadensmeldungen: Ihre Mieter melden sie über WhatsApp, ohne App und ohne Anmeldung. Ein Assistent nimmt auf, fragt gezielt nach und bereitet den Handwerkerauftrag vor. Freigegeben wird nichts ohne Sie.

Der interessante Teil dauert zwei Minuten:
${d.link}

Warum das etwas bringt: Rund 30 Prozent aller Handwerkeraufträge brauchen eine zweite Anfahrt, weil bei der Aufnahme etwas gefehlt hat. Der Assistent fragt genau deshalb nach einem zweiten Foto. In der Demo sehen Sie, was das im Auftragstext ausmacht.

Wenn Sie mögen, telefonieren wir kurz darüber. Zwanzig Minuten reichen.

Mit freundlichen Grüßen
${d.absender}`,
  },

  {
    id: "nachfassen",
    name: "Nachfassen",
    beschreibung: "Nach einem Aufruf, der ohne Antwort blieb.",
    betreff: (d) => `Kurze Rückfrage zur Demo für ${d.firma}`,
    text: (d) => `${anrede(d)}

Sie hatten sich die Demo neulich angesehen – vielen Dank dafür.

Falls Sie eine Frage offen haben oder etwas nicht so aussah, wie es bei Ihnen laufen müsste: Sagen Sie es mir gern. Die Demo lässt sich an Ihre Abläufe anpassen, das ist eine Sache von Minuten.

Hier ist der Link noch einmal:
${d.link}

Und falls es gerade nicht passt, ist das auch eine Antwort – dann melde ich mich nicht weiter.

Mit freundlichen Grüßen
${d.absender}`,
  },

  {
    id: "empfehlung",
    name: "Über Empfehlung",
    beschreibung: "Wenn ein gemeinsamer Kontakt den Weg geebnet hat.",
    betreff: (d) => `Auf Empfehlung: Mieterkommunikation für ${d.firma}`,
    text: (d) => `${anrede(d)}

wir wurden einander empfohlen – deshalb komme ich gleich zur Sache.

Ich habe eine Demonstration für ${d.firma} vorbereitet, mit Beispielobjekten aus ${d.stadt}:
${d.link}

Es geht um Schadensmeldungen über WhatsApp. Kein Portal, keine App, keine Zugangsdaten für Ihre Mieter – genau das ist der Punkt, an dem die üblichen Lösungen scheitern.

Hätten Sie kommende Woche zwanzig Minuten?

Mit freundlichen Grüßen
${d.absender}`,
  },
];
