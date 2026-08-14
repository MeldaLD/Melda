// Abnahme des Gleichlaufs von Ton und Bild.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/gleichlauf.mjs
//
// Der Anlass ist eine Zahl aus der Recherche und ein Denkfehler, der bis
// heute drinsteckte.
//
// ctx.currentTime ist die Zeit im Rechenwerk, nicht die im Raum. Der Ton, der
// gerade berechnet wird, verlaesst den Lautsprecher erst outputLatency
// spaeter - unter Windows nominell zehn Millisekunden, gemessen wurden auch
// zweiundzwanzig. Wer das Bild nach ctx.currentTime zeichnet, zeigt die
// Zukunft.
//
// Dagegen steht ein zweiter Versatz: Das jetzt gezeichnete Bild erscheint
// erst beim naechsten Bildwechsel. Beide sind aehnlich gross und heben sich
// fast auf - deshalb war es bisher zufaellig fast richtig. "Fast richtig aus
// Zufall" ist genau der Zustand, der auf einem anderen Geraet auffliegt: ein
// 145-Hz-Bildschirm hat sechs Millisekunden Bildperiode gegen zwanzig
// Millisekunden Tonverzoegerung, und dann bleiben vierzehn uebrig.
//
// Zwei Zusagen, und die zweite ist die wichtigere:
//
//   1. Die Anzeige rechnet mit der hoerbaren Zeit.
//   2. Die *Planung* tut es nicht. Wann ein Uebergang startet, wann ein Deck
//      einsetzt - das gehoert in die Rechenwerkzeit, denn dort wird
//      geplant. Beides zu vermischen verschoebe jeden Uebergang um den
//      Versatz und waere schlimmer als der Fehler, den es behebt.

import { chromium } from 'playwright';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
const CHROM = process.env.CHROMIUM_PFAD;

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage();
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => {
  if (n.type() === 'error') konsole.push(n.text());
});

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });
  await seite.click('#startDemo');
  await seite.waitForSelector('#konsole:not([hidden])', { timeout: 120000 });
  await seite.waitForTimeout(4000);

  console.log('\nDer Versatz wird ausgerechnet, nicht geraten:');
  const lage = await seite.evaluate(() => {
    const m = window.__dj.mixer;
    return {
      versatz: m.anzeigeVersatz(),
      bildperiode: m.bildperiode,
      ausgabe: Number.isFinite(m.ctx.outputLatency) ? m.ctx.outputLatency : null,
      basis: m.ctx.baseLatency ?? null,
    };
  });
  console.log(
    `    Bildperiode ${(lage.bildperiode * 1000).toFixed(1)} ms · ` +
      `Tonausgabe ${lage.ausgabe === null ? 'unbekannt' : `${(lage.ausgabe * 1000).toFixed(1)} ms`} · ` +
      `Versatz ${(lage.versatz * 1000).toFixed(1)} ms`,
  );
  pruefe(
    'die Bildperiode ist gemessen und plausibel',
    lage.bildperiode > 0.002 && lage.bildperiode < 0.2,
    `${(lage.bildperiode * 1000).toFixed(1)} ms`,
  );
  /*
   * Die Groesse des Versatzes wird nicht vorgeschrieben - sie haengt am
   * Geraet, und das ist der Sinn der Sache. Geprueft wird, dass er in einer
   * Groessenordnung liegt, die zu Bildschirmen und Tonkarten passt: mehr als
   * eine Zehntelsekunde waere keine Latenz mehr, sondern ein Fehler.
   */
  pruefe(
    'und der Versatz bleibt in einer vernuenftigen Groesse',
    Math.abs(lage.versatz) < 0.1,
    `${(lage.versatz * 1000).toFixed(1)} ms`,
  );

  console.log('\nDie Anzeige folgt der hoerbaren Zeit:');
  const anzeige = await seite.evaluate(() => {
    const m = window.__dj.mixer;
    const deck = m.decks.find((d) => d.laeuft);
    if (!deck) return null;
    const jetzt = m.ctx.currentTime;
    return {
      ausZustand: m.zustand().decks.find((d) => d.name === deck.name).stelle,
      beiRechenzeit: deck.stelle(jetzt),
      beiHoerzeit: deck.stelle(jetzt + m.anzeigeVersatz()),
      versatz: m.anzeigeVersatz(),
    };
  });
  if (!anzeige) {
    console.log('    NICHT GEPRUEFT: kein laufendes Deck.');
  } else {
    /*
     * Verglichen wird gegen die *Hoerzeit*, nicht gegen die Rechenzeit. Der
     * Unterschied ist winzig - wenige Millisekunden -, deshalb wird nicht auf
     * Gleichheit geprueft, sondern darauf, welcher der beiden naeher liegt.
     * Eine absolute Schranke waere hier bedeutungslos: Zwischen dem Aufruf
     * von zustand() und dem Vergleich vergeht ohnehin Zeit.
     */
    const zuHoer = Math.abs(anzeige.ausZustand - anzeige.beiHoerzeit);
    const zuRechen = Math.abs(anzeige.ausZustand - anzeige.beiRechenzeit);
    pruefe(
      'die gemeldete Stelle liegt naeher an der Hoerzeit als an der Rechenzeit',
      Math.abs(anzeige.versatz) < 0.0005 || zuHoer < zuRechen,
      `${(zuHoer * 1000).toFixed(2)} ms gegen ${(zuRechen * 1000).toFixed(2)} ms`,
    );
  }

  /*
   * Und jetzt die Gegenprobe, auf die es ankommt.
   *
   * Ein Uebergang wird auf eine Phrasengrenze gelegt. Die Rechnung dafuer
   * muss in Rechenwerkzeit laufen - sonst startet jeder Uebergang um den
   * Versatz verschoben, und aus einer Korrektur an der Anzeige waere ein
   * Fehler im Ton geworden. Geprueft wird, dass der geplante Startzeitpunkt
   * sich nicht aendert, wenn man den Versatz kuenstlich gross macht.
   */
  console.log('\nDie Planung bleibt in der Rechenwerkzeit:');
  const planung = await seite.evaluate(async () => {
    const m = window.__dj.mixer;
    const alt = m.bildperiode;
    const messen = () => {
      const deck = m.decks.find((d) => d.laeuft);
      if (!deck) return null;
      // Der naechste Phrasenbeginn in der Datei - die Groesse, auf der jede
      // Uebergangsplanung aufsetzt.
      return deck.stelle(m.ctx.currentTime);
    };
    const normal = messen();
    // Ein absurd grosser Versatz: Wenn die Planung ihn sieht, faellt es auf.
    m.bildperiode = 0.5;
    const verstellt = messen();
    const ausZustandVerstellt = m.zustand().decks.find((d) => d.laeuft)?.stelle ?? null;
    m.bildperiode = alt;
    return { normal, verstellt, ausZustandVerstellt };
  });
  if (!planung.normal) {
    console.log('    NICHT GEPRUEFT: kein laufendes Deck.');
  } else {
    /*
     * Die Stelle laeuft waehrend der Messung weiter - verglichen wird also
     * gegen den natuerlichen Fortschritt und nicht gegen Gleichheit. Ein
     * halbe-Sekunde-Versatz waere um Groessenordnungen groesser.
     */
    const gewandert = Math.abs(planung.verstellt - planung.normal);
    pruefe(
      'ein halbe Sekunde grosser Versatz verschiebt die Planung nicht',
      gewandert < 0.05,
      `Stelle wanderte um ${(gewandert * 1000).toFixed(1)} ms`,
    );
    pruefe(
      'waehrend er in der Anzeige sehr wohl ankommt',
      planung.ausZustandVerstellt !== null &&
        planung.ausZustandVerstellt - planung.verstellt > 0.3,
      `Anzeige lag ${((planung.ausZustandVerstellt - planung.verstellt) * 1000).toFixed(0)} ms voraus`,
    );
  }

  console.log('\nDer Drop bleibt auf dem Schlag:');
  /*
   * Die eigentliche Zusage des Abends. Der Zeitpunkt eines Drops steht in der
   * Analyse; das Bild muss innerhalb eines Bildes darauf reagieren. Geprueft
   * wird an der Reaktion selbst - dem Aufblitzen nach dem Drop -, nicht an
   * einer Zwischengroesse.
   */
  const drop = await seite.evaluate(async () => {
    const bild = window.__dj.bild;
    bild.modusSetzen('mandelbrot');
    await new Promise((f) => setTimeout(f, 1500));
    const vorher = window.__mandel?.schwung ?? 0;
    bild.dropVonHand = true;
    // Ein einziges Bild abwarten - mehr darf es nicht brauchen.
    await new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
    return { vorher, nachher: window.__mandel?.schwung ?? 0 };
  });
  pruefe(
    'das Bild reagiert innerhalb eines Bildes auf den Drop',
    drop.nachher > drop.vorher + 0.1,
    `Schwung ${drop.vorher.toFixed(2)} -> ${drop.nachher.toFixed(2)}`,
  );

  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
