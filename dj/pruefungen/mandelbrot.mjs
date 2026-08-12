// Abnahme der Mandelbrot-Visualisierung.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/mandelbrot.mjs
//
// Es geht um drei Eigenschaften:
//
//   1. Der Zoom faehrt immer nur hinein. Eine erste Fassung kehrte um, sobald
//      die Genauigkeit am Ende war - und ein Zoom, der umkehrt, ist kein Sog
//      mehr. Das ist genau der Fehler, den diese Pruefung kuenftig verhindert.
//   2. Es blitzt nicht. Der Stellenwechsel wurde frueher von einem weissen
//      Blitz gedeckt. Das war die falsche Loesung: Ein Blitz verbirgt zwar,
//      *was* springt, zeigt aber unuebersehbar, *dass* etwas springt. Jetzt
//      wird ueberblendet, und die Pruefung besteht darauf, dass das Bild dabei
//      nie weiss wird.
//   3. Der Drop ist zu sehen. Wir wissen aus der Analyse auf den Beat genau,
//      wann er kommt; wenn im Bild dann nichts passiert, ist das Wissen
//      verschenkt. Gemessen wird, wieviel sich im Bild *aendert* - nicht, wie
//      hell es wird. Helligkeit war das Mass des Blitzes, und der ist weg.
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
  /*
   * Drei Sekunden Anlauf, bevor gemessen wird.
   *
   * In den ersten Bildern passiert einmalig alles auf einmal: Der Schattierer
   * wird uebersetzt, die Bezugsbahn gerechnet, und der Regler entscheidet, ob
   * die Grafikkarte ueberhaupt taugt. Wer da schon misst, misst den Start und
   * nennt es Laufzeit. Dass der Anlauf *kurz* ist, wird gleich darauf eigens
   * geprueft - das ist die ehrliche Trennung der beiden Fragen.
   */
  await seite.waitForTimeout(3000);
  const anlauf = await seite.evaluate(() => ({
    dauerMs: window.__mandel.dauerMs,
    aufGpu: window.__mandel.aufGpu === true,
  }));
  console.log(
    `\nNach dem Anlauf: ${anlauf.aufGpu ? 'Grafikkarte' : 'Hauptprozessor'}, ` +
      `${anlauf.dauerMs.toFixed(1)} ms je Bild`,
  );
  pruefe('nach drei Sekunden laeuft es rund', anlauf.dauerMs < 50, `${anlauf.dauerMs.toFixed(1)} ms`);

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
          streuung: m.streuung,
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

  // --- 2. Der Stellenwechsel wird ueberblendet, nicht geblitzt -------------

  /*
   * Der Wechsel wird von aussen ausgeloest.
   *
   * Auf der Grafikkarte traegt die Stoerungsrechnung bis Tiefe 26; bei
   * ruhigem Zoom sind das gut acht Minuten bis zum ersten Wechsel. Eine
   * Pruefung, die eine Minute lang zusieht, bekommt ihn nie zu Gesicht - und
   * eine Eigenschaft, die nie geprueft wird, ist keine.
   */
  console.log('\nDer Stellenwechsel wird ueberblendet, nicht geblitzt:');
  const wechselMessung = await seite.evaluate(async () => {
    const leinwand = document.getElementById('visual');
    const stift = leinwand.getContext('2d');
    const ay = Math.max(0, Math.round(leinwand.height / 2 - 40));
    const streifen = () => stift.getImageData(0, ay, leinwand.width, 80).data;
    const mittelwert = (d) => {
      let s = 0;
      let p = 0;
      for (let i = 0; i < d.length; i += 40) { s += d[i] + d[i + 1] + d[i + 2]; p++; }
      return s / p / 3;
    };
    const unterschied = (a, b) => {
      let s = 0;
      let p = 0;
      for (let i = 0; i < a.length; i += 40) {
        s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        p++;
      }
      return s / p / 3;
    };

    let vorher = streifen();
    const ruhe = [];
    for (let i = 0; i < 8; i++) {
      await new Promise((f) => setTimeout(f, 60));
      const jetzt = streifen();
      ruhe.push(unterschied(vorher, jetzt));
      vorher = jetzt;
    }
    const vorNummer = window.__mandel.neuangesetzt;

    window.__mandelNeuAnsetzen();

    let hellste = 0;
    let groesster = 0;
    const spur = [];
    for (let i = 0; i < 30; i++) {
      await new Promise((f) => setTimeout(f, 60));
      const jetzt = streifen();
      const d = unterschied(vorher, jetzt);
      spur.push(d);
      groesster = Math.max(groesster, d);
      hellste = Math.max(hellste, mittelwert(jetzt));
      vorher = jetzt;
    }
    return {
      ruheSchritt: ruhe.reduce((a, b) => a + b, 0) / ruhe.length,
      groesster,
      hellste,
      gewechselt: window.__mandel.neuangesetzt > vorNummer,
    };
  });

  console.log(
    `    Bildaenderung je Messschritt: im Lauf ${wechselMessung.ruheSchritt.toFixed(1)}, ` +
      `beim Wechsel hoechstens ${wechselMessung.groesster.toFixed(1)} Helligkeitsstufen`,
  );
  console.log(`    hellstes Bild waehrend der Ueberblendung: ${wechselMessung.hellste.toFixed(1)} von 255`);
  pruefe('der Wechsel hat stattgefunden', wechselMessung.gewechselt);
  /*
   * Kein Schnitt heisst: Der groesste Sprung waehrend der Ueberblendung darf
   * nicht um Groessenordnungen ueber dem liegen, was die Fahrt ohnehin von
   * Messung zu Messung veraendert. Ein harter Wechsel taeuscht das nicht vor -
   * bei ihm steht von einem Bild zum naechsten ein voellig anderes Bild da.
   */
  pruefe(
    'kein harter Schnitt',
    wechselMessung.groesster < Math.max(14, wechselMessung.ruheSchritt * 3.5),
    `${wechselMessung.groesster.toFixed(1)} gegen ${wechselMessung.ruheSchritt.toFixed(1)} im Lauf`,
  );
  pruefe('kein Weissblitz', wechselMessung.hellste < 170, `hellstes Bild ${wechselMessung.hellste.toFixed(1)}`);
  if (wechsel === 0) {
    console.log('    (von allein kam in dieser Minute keiner – die Tiefe reicht lange)');
  }

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
  const kanten = verlauf.map((p) => p.kanten).filter((k) => typeof k === 'number');
  if (kanten.length) console.log(
    `    Nachbarunterschied im Mittel ${(kanten.reduce((a, b) => a + b, 0) / kanten.length).toFixed(1)}, ` +
      `im niedrigsten Messpunkt ${Math.min(...kanten).toFixed(1)}`,
  );
  pruefe('immer Zeichnung im Bild', flachste > 8, `Streuung ${flachste.toFixed(1)}`);

  // --- 5. Der Drop tut sichtbar etwas --------------------------------------

  /*
   * Gemessen wird die *Aenderung*, nicht die Helligkeit.
   *
   * Solange der Drop einen weissen Blitz ausloeste, war Helligkeit das
   * richtige Mass - der Blitz war ja die ganze Wirkung. Der Blitz ist weg, und
   * damit taugt das Mass nicht mehr: Ein Drop, der das Bild in Drehung,
   * Zoomtempo und Farbe reisst, muss nicht heller werden. Er muss anders
   * werden, und zwar deutlich mehr als das Bild sich ohnehin von Messung zu
   * Messung veraendert.
   */
  console.log('\nDer Drop schlaegt durch:');
  // Erst zur Ruhe kommen lassen. Direkt nach dem erzwungenen Stellenwechsel
  // laeuft noch die Ueberblendung, und der frische Ausschnitt aendert sich in
  // geringer Tiefe von Bild zu Bild stark - als Ruhewert waere das unbrauchbar.
  await seite.waitForTimeout(3000);
  const dropMessung = await seite.evaluate(async () => {
    const leinwand = document.getElementById('visual');
    const stift = leinwand.getContext('2d');
    const ay = Math.max(0, Math.round(leinwand.height / 2 - 40));
    const streifen = () => stift.getImageData(0, ay, leinwand.width, 80).data;
    const unterschied = (a, b) => {
      let s = 0;
      let p = 0;
      for (let i = 0; i < a.length; i += 40) {
        s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        p++;
      }
      return s / p / 3;
    };
    const mittelwert = (d) => {
      let s = 0;
      let p = 0;
      for (let i = 0; i < d.length; i += 40) { s += d[i] + d[i + 1] + d[i + 2]; p++; }
      return s / p / 3;
    };

    let vorher = streifen();
    const ruhe = [];
    for (let i = 0; i < 12; i++) {
      await new Promise((f) => setTimeout(f, 60));
      const jetzt = streifen();
      ruhe.push(unterschied(vorher, jetzt));
      vorher = jetzt;
    }
    const schwungVorher = window.__mandel.schwung;
    const drehVorher = window.__mandel.dreh;
    const versatzVorher = window.__mandel.versatz;

    window.__dj.bild.dropAusloesen();

    let spitze = 0;
    let hellste = 0;
    let schwungNachher = 0;
    let farbSprung = 0;
    for (let i = 0; i < 16; i++) {
      await new Promise((f) => setTimeout(f, 60));
      const jetzt = streifen();
      spitze = Math.max(spitze, unterschied(vorher, jetzt));
      hellste = Math.max(hellste, mittelwert(jetzt));
      schwungNachher = Math.max(schwungNachher, window.__mandel.schwung);
      // Der Farbversatz laeuft im Kreis - der Sprung wird ueber den Ring
      // gemessen, sonst zaehlt ein Durchlauf von 0,95 auf 0,05 als grosser
      // Ruecksprung statt als kleiner Schritt.
      if (i === 0) {
        let d = Math.abs(window.__mandel.versatz - versatzVorher);
        farbSprung = Math.min(d, 1 - d);
      }
      vorher = jetzt;
    }
    return {
      ruhe: ruhe.reduce((a, b) => a + b, 0) / ruhe.length,
      spitze,
      hellste,
      schwungVorher,
      schwungNachher,
      drehZuwachs: window.__mandel.dreh === null ? null : window.__mandel.dreh - drehVorher,
      farbSprung,
    };
  });

  console.log(
    `    Bildaenderung je Messschritt: im Lauf ${dropMessung.ruhe.toFixed(1)}, ` +
      `beim Drop ${dropMessung.spitze.toFixed(1)} Helligkeitsstufen ` +
      `(${(dropMessung.spitze / Math.max(0.1, dropMessung.ruhe)).toFixed(1)}-fach)`,
  );
  console.log(
    `    Zoomschub ${dropMessung.schwungVorher.toFixed(2)} -> ${dropMessung.schwungNachher.toFixed(2)}, ` +
      `${dropMessung.drehZuwachs === null ? 'ohne Drehung (Hauptprozessor)' : `Drehung um ${dropMessung.drehZuwachs.toFixed(2)} weiter`}`,
  );
  console.log(`    Farbsprung ${dropMessung.farbSprung.toFixed(2)} Durchlaeufe auf einen Schlag`);
  /*
   * Warum hier *nicht* auf die Bildaenderung geprueft wird.
   *
   * Der naheliegende Test waere: Beim Drop muss sich das Bild deutlich staerker
   * aendern als sonst. Nachgemessen taugt er nicht, und zwar aus zwei Gruenden,
   * die beide am Gegenstand liegen und nicht am Schwellwert.
   *
   * Erstens ist ein Fraktal selbstaehnlich. Ein Zoomschub bewegt das Bild
   * gewaltig, aber jeder einzelne Bildpunkt bekommt dabei einen Wert, der dem
   * seines Nachbarn aehnelt - der punktweise Unterschied bleibt klein, obwohl
   * die Bewegung gross ist. Der Wert misst Bewegung schlecht.
   *
   * Zweitens wandert die Farbe ohnehin dauernd, weil sie am Takt haengt. Das
   * ist gewollt und macht den Ruhewert gross: gemessen 18,7 Helligkeitsstufen
   * je Messschritt im Leerlauf gegen 23,4 beim Drop.
   *
   * Geprueft wird deshalb, was der Drop wirklich tut - Zoomschub und
   * Farbsprung. Das sind keine Ersatzgroessen, sondern die Groessen selbst;
   * das Bild ist ihre Folge. Die Bildaenderung steht oben als Angabe, nicht
   * als Bedingung.
   */
  pruefe(
    'die Farbe springt hoerbar mit',
    dropMessung.farbSprung > 0.15,
    `${dropMessung.farbSprung.toFixed(2)} Durchlaeufe`,
  );
  /*
   * Absolute Schranke statt Verhaeltnis.
   *
   * Das Verhaeltnis "dreimal so viel wie vorher" flatterte: Im Demolauf kommen
   * echte Drops aus der Analyse, und faellt einer in die Ruhemessung, steht
   * der Ausgangswert schon bei 6,8 statt bei 0,3 - dann waere das Dreifache
   * unerreichbar, obwohl der Drop genau das tat, was er soll.
   *
   * Ein Drop legt einen festen Betrag drauf, mindestens 12. Ein Schlag legt
   * hoechstens gut 1 drauf und klingt in einer halben Sekunde ab. Also wird
   * gefordert, was tatsaechlich gilt: ein Zuwachs, der ueber allem liegt, was
   * Schlaege je erreichen.
   */
  pruefe(
    'und der Zoom bekommt einen Schub',
    dropMessung.schwungNachher > Math.max(8, dropMessung.schwungVorher + 6),
    `${dropMessung.schwungVorher.toFixed(2)} -> ${dropMessung.schwungNachher.toFixed(2)}`,
  );
  // Der Drop darf alles - nur nicht wieder blitzen.
  pruefe('auch der Drop blitzt nicht', dropMessung.hellste < 170,
    `hellstes Bild ${dropMessung.hellste.toFixed(1)}`);

  // --- 5b. Es bleibt nie im Schwarzen haengen ------------------------------

  /*
   * Der Fehler, der das noetig gemacht hat: Die Fahrt zoomte irgendwann in
   * ein unendliches Schwarz und kam nicht wieder heraus.
   *
   * Die Ursache war nicht die Stelle, sondern die Schrittzahl. Je tiefer die
   * Fahrt, desto laenger braucht ein Punkt am Rand, bis er entkommt; reicht
   * die Obergrenze nicht mehr, gilt jeder Punkt als innen liegend und die
   * ganze Flaeche bekommt dieselbe Farbe. Der alte Schutz sass in der Fassung
   * auf dem Hauptprozessor - die Fassung auf der Grafikkarte kam dort nie
   * vorbei und hatte gar keinen.
   *
   * Geprueft wird deshalb die Eigenschaft, die der Gast gesehen hat: Eine
   * flache Flaeche darf vorkommen, aber sie darf nicht stehenbleiben.
   */
  console.log('\nEs bleibt nie im Schwarzen haengen:');
  const streuungen2 = verlauf.map((p) => p.streuung).filter((x) => typeof x === 'number');
  let laengsteFlaute = 0;
  let flaute = 0;
  for (let i = 1; i < verlauf.length; i++) {
    if (typeof verlauf[i].streuung !== 'number') continue;
    if (verlauf[i].streuung < 4) flaute += (verlauf[i].t - verlauf[i - 1].t) / 1000;
    else flaute = 0;
    laengsteFlaute = Math.max(laengsteFlaute, flaute);
  }
  console.log(
    `    Streuung im Bild: im Mittel ${(streuungen2.reduce((a, b) => a + b, 0) / Math.max(1, streuungen2.length)).toFixed(1)}, ` +
      `am flachsten ${Math.min(...streuungen2).toFixed(1)}`,
  );
  pruefe(
    'keine Flaeche bleibt laenger als anderthalb Sekunden stehen',
    laengsteFlaute < 1.5,
    `laengste Flaute ${laengsteFlaute.toFixed(1)} s`,
  );

  // --- 5c. Der Drop macht jedes Mal etwas anderes --------------------------

  /*
   * Gezogen wird ohne Zuruecklegen: Erst wenn alle fuenf Kunststuecke dran
   * waren, wird neu gemischt. Geprueft wird genau das - je fuenf
   * aufeinanderfolgende Drops muessen fuenf verschiedene sein. Reiner Zufall
   * wuerde hier durchfallen, und das ist der Sinn der Sache: Ein Kunststueck,
   * das dreimal hintereinander kommt, ist keines mehr.
   */
  console.log('\nDer Drop macht jedes Mal etwas anderes:');
  const gezogen = await seite.evaluate(async () => {
    const liste = [];
    for (let i = 0; i < 10; i++) {
      window.__dj.bild.dropAusloesen();
      await new Promise((f) => setTimeout(f, 700));
      liste.push(window.__mandel.kunststueck);
    }
    return liste;
  });
  console.log(`    ${gezogen.join(' ')}`);
  let wiederholt = 0;
  for (let i = 1; i < gezogen.length; i++) if (gezogen[i] === gezogen[i - 1]) wiederholt++;
  const zaehler = new Map();
  for (const k of gezogen) zaehler.set(k, (zaehler.get(k) ?? 0) + 1);
  const haeufigste = Math.max(...zaehler.values());

  /*
   * Warum nicht "je fuenf aufeinanderfolgende sind fuenf verschiedene":
   *
   * Das war mein erster Versuch, und er ist an der eigenen Annahme
   * gescheitert. Die Pruefung des Drops weiter oben zieht selbst schon aus dem
   * Beutel - die zehn Zuege hier fangen also mitten drin an, nicht an einer
   * Beutelgrenze. Ein Fenster von fuenf liegt dann ueber zwei Beuteln und darf
   * sehr wohl eine Wiederholung enthalten.
   *
   * Was auch ohne Ausrichtung gilt: Bei acht Kunststuecken beruehren zehn
   * Zuege hoechstens zwei Beutel, also kann keines mehr als zweimal vorkommen,
   * und mindestens sechs verschiedene muessen dabei sein. Reiner Zufall haelt
   * beides nicht ein - er zieht regelmaessig eines dreimal.
   *
   * (Die Zahlen haengen an der Groesse des Beutels. Kommt ein Kunststueck
   * hinzu, gehoeren sie nachgerechnet - deshalb steht die Rechnung hier und
   * nicht nur das Ergebnis.)
   */
  pruefe('nie zweimal dasselbe hintereinander', wiederholt === 0, `${wiederholt} Wiederholungen`);
  pruefe('in zehn Drops kommen mindestens sechs verschiedene vor', zaehler.size >= 6,
    `${zaehler.size} verschiedene`);
  pruefe('und keines haeuft sich', haeufigste <= 2, `haeufigstes ${haeufigste}-mal`);

  // --- 5d. Die Schrittzahl wird gezaehlt, nicht geschaetzt -----------------

  /*
   * Der Fehler, der das noetig gemacht hat: Die Fahrt zoomte in ein schwarzes
   * Nichts. Die Obergrenze der Iteration kam aus einer Formel in der Tiefe -
   * und die kann es nicht treffen, weil der Bedarf nicht an der Tiefe haengt,
   * sondern daran, *wo* man ist. Nachgemessen brauchte dieselbe Bahn bei Tiefe
   * 3 nur 231 Schritte und bei Tiefe 16 ganze 13254; die Formel gab dort 4660.
   * Reicht die Grenze nicht, entkommt kein Punkt mehr, alles gilt als innen,
   * und das Bild wird schwarz.
   *
   * Geprueft wird deshalb die Stichprobe selbst - sie laeuft auch ohne
   * Grafikkarte, weil sie auf dem Hauptprozessor rechnet.
   */
  console.log('\nDie Schrittzahl wird gezaehlt, nicht geschaetzt:');
  const bedarf = await seite.evaluate(async (adresse) => {
    const m = await import(`${adresse}/gemeinsam/mandelgpu.js`);
    if (!m.gpuBereit()) return null;
    const zeilen = [];
    for (const tiefe of [1.1, 3, 6, 9, 12, 16]) {
      const p = m.gpuProbe(tiefe, 0.3);
      if (p) zeilen.push({ tiefe, ...p });
    }
    return zeilen;
  }, ADRESSE);

  if (!bedarf) {
    console.log('    (kein WebGL2 – die Stichprobe braucht die Bezugsbahn)');
  } else {
    // Dieselbe Regel wie im Betrieb.
    const deckel = (b) => Math.min(15000, Math.max(700, b.schritteNoetig * 1.35, 500 + b.tiefe * 120));
    const alteFormel = (t) => Math.min(4600, 420 + t * 150);
    let zuKnapp = 0;
    let frueherZuKnapp = 0;
    for (const b of bedarf) {
      const jetzt = deckel(b);
      const frueher = alteFormel(b.tiefe);
      console.log(
        `    Tiefe ${String(b.tiefe).padEnd(4)} braucht ${String(b.schritteNoetig).padStart(6)}, ` +
          `bekommt ${String(Math.round(jetzt)).padStart(6)} (alte Formel: ${Math.round(frueher)})`,
      );
      if (jetzt < b.schritteNoetig) zuKnapp++;
      if (frueher < b.schritteNoetig) frueherZuKnapp++;
    }
    pruefe('die Grenze deckt ueberall den gemessenen Bedarf', zuKnapp === 0, `${zuKnapp} zu knapp`);
    // Ohne diese Zeile koennte die Pruefung gruen sein, weil der Bedarf
    // ueberall niedrig ist - dann haette sie nichts gezeigt.
    pruefe(
      'und der Fehler waere hier aufgefallen',
      frueherZuKnapp > 0,
      `die alte Formel war an ${frueherZuKnapp} von ${bedarf.length} Stellen zu knapp`,
    );
  }

  // --- 6. Die Bildguete laesst sich wirklich senken ------------------------

  /*
   * Warum das geprueft wird: An dieser Kette sind mir zwei Fehler
   * unterlaufen, und beide waren unsichtbar, solange nur gemessen wurde, ob
   * das Bild noch da ist.
   *
   * Der erste: Der Regler zielt auf ein Zeitbudget. Rechnet er kleiner,
   * frischt er einfach mehr auf und landet wieder bei derselben Zeit - alle
   * drei Stufen kamen auf dieselben 12 ms. Das Budget muss mitsinken.
   *
   * Der zweite: Die Bedingung fuer den Rueckfall auf den Hauptprozessor
   * verglich den Regler mit einer Schranke, die er nie erreichen konnte. Der
   * Rueckfall kam also nie, und die niedrigen Stufen waren die langsamsten.
   */
  console.log('\nDie Bildguete laesst sich senken:');
  const stufen = await seite.evaluate(async () => {
    const ergebnis = [];
    for (const stufe of ['hoch', 'mittel', 'niedrig']) {
      window.__dj.bild.gueteSetzen(stufe);
      /*
       * Warten, bis es steht - nicht eine feste Zeit lang.
       *
       * Ein Wechsel der Stufe fragt die Grafikkarte neu. Wo keine ist, dauert
       * es ein paar Bilder, bis der Rueckfall greift, und wie lange das ist,
       * haengt daran, wie langsam der Nachbau in Software gerade ist -
       * nachgemessen zwischen zwei und zwoelf Sekunden. Eine feste Wartezeit
       * misst deshalb mal die Stufe und mal noch den Versuch. Gewartet wird
       * jetzt auf den Zustand statt auf die Uhr; dass er ueberhaupt eintritt,
       * ist damit gleich mitgeprueft.
       */
      const bis = Date.now() + 30000;
      let ruhig = 0;
      while (Date.now() < bis) {
        await new Promise((f) => setTimeout(f, 500));
        ruhig = window.__dj.bild.bildMs < 50 ? ruhig + 1 : 0;
        // Vier ruhige Messungen hintereinander, damit ein einzelnes schnelles
        // Bild mitten im Versuch nicht als Ruhe durchgeht.
        if (ruhig >= 4) break;
      }
      await new Promise((f) => setTimeout(f, 2000));
      const leinwand = document.getElementById('visual');
      ergebnis.push({
        stufe,
        ms: window.__dj.bild.bildMs,
        punkte: leinwand.width * leinwand.height,
      });
    }
    return ergebnis;
  });
  for (const e of stufen) {
    console.log(
      `    ${e.stufe.padEnd(8)} ${e.ms.toFixed(1)} ms je Bild, ` +
        `Leinwand ${(e.punkte / 1e6).toFixed(2)} Millionen Punkte`,
    );
  }
  const [gHoch, gMittel, gNiedrig] = stufen;
  pruefe(
    'jede Stufe kommt zur Ruhe',
    stufen.every((e) => e.ms < 50),
    stufen.map((e) => `${e.stufe} ${e.ms.toFixed(0)} ms`).join(', '),
  );
  pruefe(
    'jede Stufe ist schneller als die darueber',
    gMittel.ms < gHoch.ms * 0.9 && gNiedrig.ms < gMittel.ms * 0.9,
    `${gHoch.ms.toFixed(1)} -> ${gMittel.ms.toFixed(1)} -> ${gNiedrig.ms.toFixed(1)} ms`,
  );
  pruefe(
    'die niedrigste Stufe rechnet auch die Leinwand kleiner',
    gNiedrig.punkte < gHoch.punkte,
    `${(gHoch.punkte / 1e6).toFixed(2)} -> ${(gNiedrig.punkte / 1e6).toFixed(2)} Millionen Punkte`,
  );
  await seite.evaluate(() => window.__dj.bild.gueteSetzen('hoch'));

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
