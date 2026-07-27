/**
 * Prüft die Entscheidung, welche Daten die Übersicht zeigt.
 *
 * Läuft ohne Datenbank und ohne Browser: `npx tsx scripts/ansicht-pruefen.ts`.
 * Der Rest der Kette (Cookie lesen, Seite neu rendern) hängt an Supabase und
 * wird über die Playwright-Läufe abgedeckt.
 */

import { ansichtWaehlen, ohneBeispiele } from "../src/lib/demo/ansicht";
import type { Mandantenbestand } from "../src/lib/daten/typen";

let fehler = 0;

function pruefe(was: string, bedingung: boolean) {
  console.log(`${bedingung ? "ok  " : "FEHL"}  ${was}`);
  if (!bedingung) fehler += 1;
}

/** Minimaler Bestand: zwei Beispielvorgänge, einer aus dem Chat. */
function bestand(): Mandantenbestand {
  const zeile = (id: string, seed: boolean) => ({ id, ist_seed: seed });
  return {
    mandant: { id: "m1" },
    objekte: [zeile("o1", true)],
    einheiten: [zeile("e1", true)],
    mitarbeiter: [zeile("ma1", true)],
    handwerker: [zeile("h1", true)],
    zeitfenster: [zeile("z1", true)],
    vorgaenge: [zeile("v1", true), zeile("v2", true), zeile("v3", false)],
    nachrichten: [zeile("n1", true), zeile("n2", false)],
    verlauf: [zeile("l1", true), zeile("l2", false)],
    freigaben: [zeile("f1", true)],
    termine: [zeile("t1", true), zeile("t2", false)],
    // Der Prüfbestand trägt nur die Felder, die die Filterung anfasst.
  } as unknown as Mandantenbestand;
}

// --- Filtern ---------------------------------------------------------------
const gefiltert = ohneBeispiele(bestand());
pruefe("Nur der Vorgang aus dem Chat bleibt", gefiltert.vorgaenge.length === 1);
pruefe("Der bleibende Vorgang ist der echte", gefiltert.vorgaenge[0].id === "v3");
pruefe(
  "Nachrichten, Verlauf und Termine ebenso",
  gefiltert.nachrichten.length === 1 &&
    gefiltert.verlauf.length === 1 &&
    gefiltert.termine.length === 1,
);
pruefe("Beispielfreigaben verschwinden", gefiltert.freigaben.length === 0);
pruefe(
  "Stammdaten bleiben vollständig",
  gefiltert.objekte.length === 1 &&
    gefiltert.einheiten.length === 1 &&
    gefiltert.handwerker.length === 1 &&
    gefiltert.mitarbeiter.length === 1 &&
    gefiltert.zeitfenster.length === 1,
);

// --- Entscheiden -----------------------------------------------------------
const standard = ansichtWaehlen(bestand(), {
  umschaltbar: true,
  beispieleGewuenscht: false,
  ausblendenVoreingestellt: true,
});
pruefe("Voreinstellung blendet die Beispiele aus", standard.ansicht.nurEigene);
pruefe(
  "Gezählt wird: 1 eigener, 2 ausgeblendete",
  standard.ansicht.eigene === 1 && standard.ansicht.ausgeblendet === 2,
);
pruefe("Die Liste ist gefiltert", standard.bestand.vorgaenge.length === 1);

const dazugeladen = ansichtWaehlen(bestand(), {
  umschaltbar: true,
  beispieleGewuenscht: true,
  ausblendenVoreingestellt: true,
});
pruefe("Nach dem Dazuladen ist alles da", dazugeladen.bestand.vorgaenge.length === 3);
pruefe("Der Umschalter bleibt sichtbar", dazugeladen.ansicht.umschaltbar);
pruefe("Und weiß, dass nichts ausgeblendet ist", !dazugeladen.ansicht.nurEigene);

const ohneDatenbank = ansichtWaehlen(bestand(), {
  umschaltbar: false,
  beispieleGewuenscht: false,
  ausblendenVoreingestellt: true,
});
pruefe(
  "Ohne Schreibrecht wird nichts ausgeblendet",
  !ohneDatenbank.ansicht.nurEigene && ohneDatenbank.bestand.vorgaenge.length === 3,
);
pruefe("Und der Umschalter bleibt weg", !ohneDatenbank.ansicht.umschaltbar);

const detailseite = ansichtWaehlen(bestand(), {
  umschaltbar: true,
  beispieleGewuenscht: false,
  ausblendenVoreingestellt: true,
  alleDaten: true,
});
pruefe(
  "Detailseiten sehen auch Beispielvorgänge",
  detailseite.bestand.vorgaenge.length === 3 && !detailseite.ansicht.umschaltbar,
);

const abgeschaltet = ansichtWaehlen(bestand(), {
  umschaltbar: true,
  beispieleGewuenscht: false,
  ausblendenVoreingestellt: false,
});
pruefe(
  "Abgeschaltet verhält sich die Demo wie früher",
  !abgeschaltet.ansicht.nurEigene &&
    !abgeschaltet.ansicht.umschaltbar &&
    abgeschaltet.bestand.vorgaenge.length === 3,
);

console.log(fehler === 0 ? "\nAlles grün." : `\n${fehler} Prüfung(en) fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
