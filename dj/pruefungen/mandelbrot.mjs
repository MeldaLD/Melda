// Abnahme der Mandelbrot-Visualisierung.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/mandelbrot.mjs
//
// Es geht um zwei Eigenschaften, und die erste ist die wichtigere:
//
//   1. Der Zoom faehrt immer nur hinein. Eine erste Fassung kehrte um, sobald
//      die Genauigkeit am Ende war - und ein Zoom, der umkehrt, ist kein Sog
//      mehr. Das ist genau der Fehler, den diese Pruefung kuenftig verhindert.
//   2. Der Drop ist zu sehen. Wir wissen aus der Analyse auf den Beat genau,
//      wann er kommt; wenn im Bild dann nichts passiert, ist das Wissen
//      verschenkt.
//
// Gemessen wird am laufenden Bild, nicht an Absichten: Zoomtiefe und
// Rechenzeit kommen aus window.__mandel, die Helligkeit aus den Bildpunkten
// der Leinwand.

import { chromium } from 'playwright';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3200';
const CHROM = process.env.CHROMIUM_PFAD;
// Wie lange die Fahrt beobachtet wird. Lang genug, dass mindestens ein
// Stellenwechsel vorkommt.
const BEOBACHTUNG_MS = Number(process.env.DJ_MANDEL_DAUER ?? 60000);

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const ERWARTET = /\/api\/(zustand|dj\/track)|Failed to load resource/;
const konsolenfehler = [];
seite.on('pageerror', (e) => konsolenfehler.push(e.message));
seite.on('console', (n) => {
  if (n.type() === 'error' && !ERWARTET.test(n.text())) konsolenfehler.push(n.text());
});

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });
  await seite.click('#startDemo');
  await seite.waitForSelector('#konsole:not([hidden])', { timeout: 120000 });
  await seite.evaluate(() => window.__dj.bild.modusSetzen('mandelbrot'));
  // Warten, bis das erste Bild gerechnet ist.
  await seite.waitForFunction(() => window.__mandel !== undefined, { timeout: 30000 });

  // --- Die Fahrt beobachten ----------------------------------------------

  console.log(`\nDie Fahrt ueber ${(BEOBACHTUNG_MS / 1000).toFixed(0)} Sekunden:`);
  const verlauf = await seite.evaluate(async (dauer) => {
    const punkte = [];
    const leinwand = document.getElementById('visual');
    const stift = leinwand.getContext('2d');
    const bis = performance.now() + dauer;
    while (performance.now() < bis) {
      const m = window.__mandel;
      if (m) {
        /*
         * Das Bild nur selten und nur ausschnittsweise abtasten.
         *
         * getImageData ueber die volle Leinwand sind bei 1280x800 auf einem
         * Bildschirm mit doppelter Punktdichte 2560x1600 Punkte, die vom
         * Grafikspeicher zurueckgeholt werden muessen - das haelt den ganzen
         * Bildaufbau an. Nachgemessen war genau das die Ursache des
         * teuersten Bildes: Es lag bei der *kleinsten* Aufloesung, konnte
         * also nicht an der Rechnung liegen. Die Messung hat gemessen, was
         * sie selbst verursacht hat.
         *
         * Abgetastet wird ein *breiter Streifen* quer durch die Bildmitte,
         * nicht ein Quadrat in der Mitte.
         *
         * Das Quadrat war die falsche Form. 400x300 Bildschirmpunkte sind bei
         * einem Rechenbild von 130 Punkten Breite gerade einmal 40 mal 33
         * gerechnete Punkte - ein Achtel der Flaeche. Nachgemessen meldete es
         * 7,5 Helligkeitsstufen Streuung, waehrend im selben Bild 502 der 512
         * Farbstufen benutzt waren. Nicht das Bild war leer, sondern der
         * Ausschnitt lag in einem glatten Feld.
         *
         * Der Streifen ueber die volle Breite kostet dasselbe und sieht das
         * ganze Bild.
         */
        let hell = null;
        if (punkte.length % 6 === 0) {
          // Gemessen wird der *Kontrast*, nicht die Helligkeit.
          //
          // Der erste Versuch zaehlte Punkte ueber einer Helligkeitsschwelle.
          // Das war die falsche Frage: Ein tiefer Zoom hat zu Recht grosse
          // dunkle Flaechen, und die Palette ist absichtlich dunkel gehalten,
          // damit die Schrift darueber lesbar bleibt. Ein dunkles Bild mit
          // Zeichnung ist gut, ein gleichmaessiges Nichts ist schlecht - und
          // genau das unterscheidet die Streuung.
          const ay = Math.max(0, Math.round(leinwand.height / 2 - 40));
          const daten = stift.getImageData(0, ay, leinwand.width, 80).data;
          let summe = 0;
          let summeQuadrat = 0;
          let proben = 0;
          for (let i = 0; i < daten.length; i += 40) {
            const w = (daten[i] + daten[i + 1] + daten[i + 2]) / 3;
            summe += w;
            summeQuadrat += w * w;
            proben++;
          }
          const mittel = summe / proben;
          hell = Math.sqrt(Math.max(0, summeQuadrat / proben - mittel * mittel));
        }
        punkte.push({
          t: performance.now(),
          tiefe: m.tiefe,
          neu: m.neuangesetzt,
          blitz: m.blitz,
          dauerMs: m.dauerMs,
          breite: m.breite,
          muSpanne: m.muSpanne,
          vielfalt: m.vielfalt,
          kanten: m.kanten,
          frisch: m.frischePunkte,
          schritte: m.schritte,
          hell,
        });
      }
      /*
       * Alle 80 ms, nicht alle 250.
       *
       * Der Blitz halbiert sich rund alle 0,24 Sekunden. Mit einem Abstand von
       * 250 ms konnte ein Blitz, der voll auf 1,0 stand, bis zur naechsten
       * Messung auf 0,48 abgeklungen sein - und die Pruefung meldete einen
       * ungedeckten Sprung, obwohl es geblitzt hatte. Gemessen wurde der
       * Messabstand, nicht das Bild.
       */
      await new Promise((f) => setTimeout(f, 80));
    }
    return punkte;
  }, BEOBACHTUNG_MS);

  console.log(`    ${verlauf.length} Messpunkte`);

  // --- 1. Nie zurueck ------------------------------------------------------

  const rueckgaenge = [];
  let zuwachs = 0;
  for (let i = 1; i < verlauf.length; i++) {
    const vor = verlauf[i - 1];
    const jetzt = verlauf[i];
    const neuAngesetzt = jetzt.neu !== vor.neu;
    const schritt = jetzt.tiefe - vor.tiefe;
    if (schritt > 0) zuwachs += schritt;
    // Ein Rueckgang ist nur erlaubt, wenn im selben Schritt an einer neuen
    // Stelle neu begonnen wurde.
    if (schritt < -0.001 && !neuAngesetzt) rueckgaenge.push({ i, schritt, tiefe: jetzt.tiefe });
  }

  const wechsel = verlauf.at(-1).neu - verlauf[0].neu;
  const hoechsteTiefe = Math.max(...verlauf.map((p) => p.tiefe));

  console.log('\nDer Zoom faehrt immer nur hinein:');
  console.log(
    `    hoechste Tiefe ${hoechsteTiefe.toFixed(2)}, insgesamt ${zuwachs.toFixed(2)} Zehnerpotenzen zugelegt, ` +
      `${wechsel} Stellenwechsel`,
  );
  if (rueckgaenge.length) {
    const schlimmster = rueckgaenge.reduce((a, b) => (b.schritt < a.schritt ? b : a));
    console.log(`    schlimmster ungedeckter Rueckgang: ${schlimmster.schritt.toFixed(3)}`);
  }
  pruefe('kein Rueckwaertsfahren ohne Stellenwechsel', rueckgaenge.length === 0,
    `${rueckgaenge.length} Rueckgaenge`);
  pruefe('es geht wirklich tief hinein', zuwachs > 4, `${zuwachs.toFixed(2)} Zehnerpotenzen`);

  // --- 2. Jeder Wechsel ist von einem Blitz gedeckt ------------------------

  console.log('\nJeder Stellenwechsel ist von einem Blitz gedeckt:');
  let ungedeckt = 0;
  for (let i = 1; i < verlauf.length; i++) {
    if (verlauf[i].neu === verlauf[i - 1].neu) continue;
    // Im Messpunkt davor, dabei oder danach muss der Blitz hell gewesen sein.
    const umgebung = [verlauf[i - 1], verlauf[i], verlauf[i + 1]].filter(Boolean);
    const hell = Math.max(...umgebung.map((p) => p.blitz));
    console.log(`    Wechsel bei Messpunkt ${i}: hellster Blitz ${hell.toFixed(2)}`);
    if (hell <= 0.5) ungedeckt++;
  }
  if (wechsel === 0) {
    console.log('    (in dieser Zeit kein Wechsel – die Tiefe reicht noch)');
  }
  pruefe('kein nackter Sprung', ungedeckt === 0, `${ungedeckt} ungedeckt`);

  // --- 3. Rechenzeit -------------------------------------------------------

  // Wo genau liegt der teuerste Messpunkt? Ohne diese Angabe raet man an der
  // Ursache herum - ein Ausreisser beim Aufwaermen ist etwas anderes als
  // einer mitten im Betrieb.
  let schlimmsterIndex = 0;
  for (let i = 1; i < verlauf.length; i++) {
    if (verlauf[i].dauerMs > verlauf[schlimmsterIndex].dauerMs) schlimmsterIndex = i;
  }
  const schlimmster = verlauf[schlimmsterIndex];
  console.log(
    `    teuerstes Bild bei Messpunkt ${schlimmsterIndex} von ${verlauf.length} ` +
      `(${((schlimmsterIndex / verlauf.length) * 100).toFixed(0)} % der Beobachtung): ` +
      `${schlimmster.dauerMs.toFixed(1)} ms, Tiefe ${schlimmster.tiefe.toFixed(1)}, ` +
      `${schlimmster.breite} Punkte, ${schlimmster.schritte} Schritte`,
  );

  const zeiten = verlauf.map((p) => p.dauerMs).sort((a, b) => a - b);
  const mittel = zeiten.reduce((a, b) => a + b, 0) / zeiten.length;
  const median = zeiten[Math.floor(zeiten.length / 2)];
  console.log('\nDie Rechenzeit bleibt im Rahmen:');
  console.log(
    `    Mittel ${mittel.toFixed(1)} ms, Median ${median.toFixed(1)} ms, ` +
      `Hoechstwert ${zeiten.at(-1).toFixed(1)} ms`,
  );
  console.log(
    `    Aufloesung ${Math.min(...verlauf.map((p) => p.breite))} bis ` +
      `${Math.max(...verlauf.map((p) => p.breite))} Punkte, ` +
      `Schritte ${Math.min(...verlauf.map((p) => p.schritte))} bis ${Math.max(...verlauf.map((p) => p.schritte))}`,
  );
  pruefe('im Mittel unter 16 ms', mittel < 16, `${mittel.toFixed(1)} ms`);
  /*
   * Die Grenze fuer den Hoechstwert liegt bei 50 ms, nicht bei 16.
   *
   * Das ist bewusst so und keine nachtraeglich passend gemachte Schwelle. Die
   * Rechenzeit haengt am Bildinhalt: An manchen Stellen laeuft fast jeder
   * Bildpunkt bis zur Iterationsgrenze, an anderen entkommt er nach zwanzig
   * Schritten. Der Regler zieht die Aufloesung binnen ein bis zwei Bildern
   * nach, aber das erste Bild einer solchen Stelle ist teuer.
   *
   * Eine harte Zusicherung waere nur mit so wenig Aufloesung zu haben, dass
   * das Bild darunter litte. Ein einzelnes ausgelassenes Bild pro Minute
   * faellt in einem laufenden Zoom nicht auf - ein dauerhaft grobes Bild
   * schon. Deshalb zaehlt hier der Mittelwert als Guete und der Hoechstwert
   * nur als Deckel gegen echtes Ruckeln.
   */
  pruefe('kein Ruckler ueber 50 ms', zeiten.at(-1) < 50, `${zeiten.at(-1).toFixed(1)} ms`);

  // --- 4. Nie schwarz ------------------------------------------------------

  const gemessen = verlauf.map((p, i) => ({ ...p, i })).filter((p) => p.hell !== null);
  const flachsterPunkt = gemessen.reduce((a, b) => (b.hell < a.hell ? b : a));
  const streuungen = gemessen.map((p) => p.hell);
  const flachste = flachsterPunkt.hell;
  const mittlere = streuungen.reduce((a, b) => a + b, 0) / streuungen.length;
  console.log('\nEs steht nie ein leeres Bild da:');
  console.log(
    `    Kontrast im Mittel ${mittlere.toFixed(1)}, im flachsten Messpunkt ${flachste.toFixed(1)} ` +
      `(Helligkeitsstufen Streuung, 0 waere eine einfarbige Flaeche)`,
  );
  console.log(
    `    flachster Messpunkt ${flachsterPunkt.i}: Tiefe ${flachsterPunkt.tiefe.toFixed(2)}, ` +
      `Blitz ${flachsterPunkt.blitz.toFixed(2)}, ${flachsterPunkt.breite} Punkte, ` +
      `Wertespanne ${flachsterPunkt.muSpanne?.toFixed(1) ?? '?'}, ` +
      `${flachsterPunkt.vielfalt ?? '?'} Farbstufen, Kanten ${flachsterPunkt.kanten?.toFixed(1) ?? '?'}`,
  );
  const kanten = verlauf.map((p) => p.kanten).filter((k) => k !== undefined);
  console.log(
    `    Nachbarunterschied im Mittel ${(kanten.reduce((a, b) => a + b, 0) / Math.max(1, kanten.length)).toFixed(1)}, ` +
      `im niedrigsten Messpunkt ${Math.min(...kanten).toFixed(1)}`,
  );
  pruefe('immer Zeichnung im Bild', flachste > 8, `Streuung ${flachste.toFixed(1)}`);

  // --- 5. Der Drop tut sichtbar etwas --------------------------------------

  console.log('\nDer Drop schlaegt durch:');
  const dropMessung = await seite.evaluate(async () => {
    const leinwand = document.getElementById('visual');
    const stift = leinwand.getContext('2d');
    const ay = Math.max(0, Math.round(leinwand.height / 2 - 40));
    const helligkeit = () => {
      const daten = stift.getImageData(0, ay, leinwand.width, 80).data;
      let summe = 0;
      let proben = 0;
      for (let i = 0; i < daten.length; i += 40) {
        summe += daten[i] + daten[i + 1] + daten[i + 2];
        proben++;
      }
      return summe / proben / 3;
    };

    // Ruhewert ueber eine Sekunde.
    const ruhe = [];
    for (let i = 0; i < 12; i++) {
      ruhe.push(helligkeit());
      await new Promise((f) => setTimeout(f, 80));
    }
    const vorher = ruhe.reduce((a, b) => a + b, 0) / ruhe.length;
    const schwungVorher = window.__mandel.schwung;

    window.__dj.bild.dropAusloesen();

    let spitze = 0;
    let schwungNachher = 0;
    for (let i = 0; i < 14; i++) {
      await new Promise((f) => setTimeout(f, 60));
      spitze = Math.max(spitze, helligkeit());
      schwungNachher = Math.max(schwungNachher, window.__mandel.schwung);
    }
    return { vorher, spitze, schwungVorher, schwungNachher };
  });

  const zuwachsProzent = (dropMessung.spitze / Math.max(1e-6, dropMessung.vorher) - 1) * 100;
  console.log(
    `    Helligkeit ${dropMessung.vorher.toFixed(1)} -> ${dropMessung.spitze.toFixed(1)} ` +
      `(+${zuwachsProzent.toFixed(0)} %)`,
  );
  console.log(
    `    Zoomschub ${dropMessung.schwungVorher.toFixed(2)} -> ${dropMessung.schwungNachher.toFixed(2)}`,
  );
  pruefe('das Bild wird deutlich heller', zuwachsProzent > 40, `+${zuwachsProzent.toFixed(0)} %`);
  pruefe(
    'und der Zoom bekommt einen Schub',
    dropMessung.schwungNachher > Math.max(0.5, dropMessung.schwungVorher * 3),
    `${dropMessung.schwungVorher.toFixed(2)} -> ${dropMessung.schwungNachher.toFixed(2)}`,
  );

  console.log(
    konsolenfehler.length
      ? `\nKonsolenfehler:\n  ${konsolenfehler.slice(0, 5).join('\n  ')}`
      : '\nKeine Konsolenfehler.',
  );
  if (konsolenfehler.length) fehler++;
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
