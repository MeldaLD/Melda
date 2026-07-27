/**
 * Prüft die Sperren rund um das Sprachmodell.
 *
 * Läuft ohne Schlüssel, ohne Netz und ohne Browser:
 *   npx tsx scripts/ki-pruefen.ts
 *
 * Geprüft wird genau das, was nicht von der Antwort eines Modells abhängen
 * darf: dass Kontaktdaten vor dem Aufruf verschwinden, dass erfundene
 * Kennungen nicht durchkommen, und dass eine Antwort mit Kosten, Fristen oder
 * Rechtsauskunft verworfen wird. Der Aufruf selbst ist eine Zeile SDK; die
 * Regeln drumherum sind die Arbeit.
 */

import { bildurteilLesen, zuordnungLesen } from "../src/lib/ki/pruefen";
import { kuerzen, schwaerzen } from "../src/lib/ki/schwaerzen";
import { einsaetze, stufeNach } from "../config/ki-einsatz";
import { demoFotos, istDemoFoto, szenarien } from "../config/scenarios";
import { readFileSync } from "node:fs";

let fehler = 0;

function pruefe(was: string, bedingung: boolean) {
  console.log(`${bedingung ? "ok  " : "FEHL"}  ${was}`);
  if (!bedingung) fehler += 1;
}

// --- Schwärzung ------------------------------------------------------------
{
  const roh =
    "Hallo, hier ist Katrin Haas, erreichbar unter 0561 1234567 oder " +
    "k.haas@example.de. Die Miete geht von DE89 3704 0044 0532 0130 00 ab.";
  const { text, entfernt } = schwaerzen(roh);

  pruefe("Telefonnummer verschwindet", !text.includes("1234567"));
  pruefe("E-Mail-Adresse verschwindet", !text.includes("@example.de"));
  pruefe("IBAN verschwindet", !text.includes("3704 0044"));
  pruefe("Alle drei Arten werden benannt", entfernt.length === 3);
  pruefe("Der übrige Satz bleibt lesbar", text.includes("Die Miete geht von"));
}

{
  // Zweimal hintereinander muss dasselbe herauskommen. Ein globales Muster
  // merkt sich seine Position – ohne Zurücksetzen fände der zweite Aufruf
  // die erste Fundstelle nicht mehr.
  const eingabe = "Bitte melden unter 0561 1234567.";
  const a = schwaerzen(eingabe).text;
  const b = schwaerzen(eingabe).text;
  pruefe("Zweimal geschwärzt ergibt dasselbe", a === b && !b.includes("1234567"));
}

{
  const harmlos =
    "Der Heizkörper in Raum 12 wird seit 3 Tagen nicht warm, ca. 18 Grad.";
  const { text, entfernt } = schwaerzen(harmlos);
  pruefe("Ohne Kontaktdaten bleibt der Text unangetastet", text === harmlos);
  pruefe("Und es wird nichts gemeldet, was nicht war", entfernt.length === 0);
}

pruefe("Lange Eingaben werden gekürzt", kuerzen("x".repeat(5000)).length < 1300);

// --- Zuordnung von Freitext ------------------------------------------------
pruefe(
  "Bekanntes Szenario wird übernommen",
  zuordnungLesen('{"szenario": "heizung-kalt", "thema": null, "sicherheit": 0.9}')
    ?.szenarioId === "heizung-kalt",
);

pruefe(
  "Erfundene Kennung wird verworfen",
  zuordnungLesen('{"szenario": "aufzug-defekt", "thema": null, "sicherheit": 0.99}') ===
    null,
);

pruefe(
  "Unsicheres Raten wird verworfen",
  zuordnungLesen('{"szenario": "heizung-kalt", "thema": null, "sicherheit": 0.4}') ===
    null,
);

pruefe(
  "Ein Thema ohne Schaden wird übernommen",
  zuordnungLesen('{"szenario": null, "thema": "abrechnung", "sicherheit": 0.8}')
    ?.anliegenId === "abrechnung",
);

pruefe(
  "Beides zugleich: der Schadensfall gewinnt",
  zuordnungLesen(
    '{"szenario": "heizung-kalt", "thema": "abrechnung", "sicherheit": 0.8}',
  )?.anliegenId === null,
);

pruefe(
  "Geschwätz um das JSON herum stört nicht",
  zuordnungLesen(
    'Klar! {"szenario": "muellraum", "thema": null, "sicherheit": 0.7} – passt das?',
  )?.szenarioId === "muellraum",
);

pruefe("Kaputtes JSON wird verworfen", zuordnungLesen("{szenario: heizung") === null);
pruefe("Leere Antwort wird verworfen", zuordnungLesen("") === null);

// --- Bildauswertung --------------------------------------------------------
{
  const gut =
    '{"erkennung": "Ich sehe eine gelöste Silikonfuge in der Dusche mit dunklen ' +
    'Verfärbungen an der Wandseite. Trifft das zu?", "zweitfoto": true}';
  const gelesen = bildurteilLesen(gut);
  pruefe("Saubere Bildantwort kommt durch", gelesen?.brauchtZweitfoto === true);
  pruefe(
    "Und der Text ist der des Modells",
    Boolean(gelesen?.erkennung.startsWith("Ich sehe eine gelöste")),
  );
}

const verboten: [string, string][] = [
  ["Kostenangabe", "Die Reparatur kostet etwa 180 € und dauert kurz. Trifft das zu?"],
  ["Terminzusage", "Ein Betrieb kommt morgen und hat das erledigt. Ist das korrekt?"],
  [
    "Rechtsauskunft",
    "Das ist ein Mangel nach § 536 BGB und berechtigt zur Mietminderung. Korrekt?",
  ],
  [
    "Sicherheitsanweisung",
    "Schalten Sie bitte sofort die Sicherung aus, bevor etwas passiert. Zutreffend?",
  ],
];

for (const [name, satz] of verboten) {
  pruefe(
    `Bildantwort mit ${name} wird verworfen`,
    bildurteilLesen(JSON.stringify({ erkennung: satz, zweitfoto: false })) === null,
  );
}

pruefe(
  "Zu kurze Bildantwort wird verworfen",
  bildurteilLesen('{"erkennung": "Ein Rohr.", "zweitfoto": false}') === null,
);

// --- Welche Bilder das Haus verlassen dürfen -------------------------------
{
  // Jedes Bild der Vorführung muss erkannt werden – beim ersten Foto wie
  // beim Nachfragebild. Ein einziges übersehenes ginge sonst an ein Modell.
  const uebersehen = szenarien.flatMap((s) =>
    [s.foto, ...(s.zweitfoto?.optionen ?? [])].filter((d) => !istDemoFoto(d)),
  );
  pruefe(
    `Alle ${demoFotos.size} Vorführungsbilder sind als solche erkannt`,
    uebersehen.length === 0,
  );

  pruefe(
    "Ein unbekanntes Bild gilt nicht als Vorführungsbild",
    !istDemoFoto("foto-vom-mieter-2026-07-27.jpg"),
  );

  // Hauptbilder müssen eindeutig sein: Aus ihnen wird auf das Szenario
  // geschlossen, und zwei Szenarien mit derselben Kachel wären nicht
  // unterscheidbar. Nachfragebilder dürfen sich dagegen wiederholen –
  // wand-detail.jpg ist in drei Fällen dieselbe plausible Fehlauswahl.
  const haupt = szenarien.map((s) => s.foto);
  pruefe(
    "Jedes Szenario hat sein eigenes Hauptbild",
    haupt.length === new Set(haupt).size,
  );
}

// --- Prompts und Konfiguration müssen dieselbe Liste meinen ----------------
{
  // Wer die Bilder erzeugt, arbeitet nach docs/foto-prompts.md. Steht dort
  // eine Datei zu viel, ist die Arbeit umsonst; fehlt eine, bleibt eine
  // Kachel für immer ein Platzhalter. Beides ist schon passiert, als
  // Szenarien ihre Nachfrage verloren haben.
  const doku = new Set(
    [...readFileSync("docs/foto-prompts.md", "utf8").matchAll(/`([\w-]+\.jpg)`/g)].map(
      (t) => t[1],
    ),
  );
  const fehlt = [...demoFotos].filter((d) => !doku.has(d));
  const zuviel = [...doku].filter((d) => !demoFotos.has(d));

  pruefe(
    `Jedes benötigte Bild hat einen Prompt${fehlt.length ? ` (fehlt: ${fehlt.join(", ")})` : ""}`,
    fehlt.length === 0,
  );
  pruefe(
    `Kein Prompt beschreibt ein Bild, das niemand zeigt${zuviel.length ? ` (zu viel: ${zuviel.join(", ")})` : ""}`,
    zuviel.length === 0,
  );
}

// --- Die Konfiguration selbst ---------------------------------------------
for (const einsatz of einsaetze) {
  const stufe = stufeNach.get(einsatz.stufe);
  pruefe(`Stufe von "${einsatz.id}" existiert`, Boolean(stufe));
  if (einsatz.aktiv) {
    pruefe(
      `"${einsatz.id}" ist aktiv und hat ein Modell`,
      Boolean(stufe?.modell) && einsatz.stand === "vorlaeufig",
    );
  }
}

pruefe(
  "Ohne Schlüssel meldet sich die Anbindung als nicht verfügbar",
  !process.env.ANTHROPIC_API_KEY,
);

console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : "\nAlles grün.");
process.exit(fehler ? 1 : 0);
