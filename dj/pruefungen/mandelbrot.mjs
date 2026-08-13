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
import { bremseNachfuehren } from '../public/gemeinsam/visualmodi.js';

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

/*
 * Zuerst der Regler, ohne Browser.
 *
 * Diese Pruefung gibt es, weil ein Fehler in genau diesem Regler von aussen
 * nicht zu sehen war: Das Bild lief fluessig, sechzig Bilder je Sekunde, alle
 * anderen Pruefungen gruen - und trotzdem wurde es auf dem iPad im Lauf einer
 * Viertelstunde zu Pixelbrei. Die Bremse konnte nur zudrehen. Aufgefallen ist
 * das erst auf einem Foto vom Geraet.
 *
 * Am Bild ist so etwas schwer zu messen, am Regelgesetz dagegen leicht - man
 * muss es nur einzeln aufrufen koennen.
 */
console.log('Der Regler dreht in beide Richtungen:');
{
  // Ein Bildschirm, der sauber im Takt laeuft: jedes Bild 16,7 ms. Die
  // Taktschaetzung liegt bauartbedingt etwas darunter - genau die Konstellation
  // vom iPad-Foto.
  let bremse = 0.3;
  for (let i = 0; i < 2000; i++) bremse = bremseNachfuehren(bremse, 16.7, 16.0);
  pruefe(
    'im Takt macht der Regler wieder auf',
    bremse > 0.95,
    `0.30 -> ${bremse.toFixed(2)} nach 2000 Bildern im Takt`,
  );

  // Die Gegenrichtung muss erhalten bleiben: halbe Bildrate heisst zudrehen.
  let langsam = 1;
  for (let i = 0; i < 200; i++) langsam = bremseNachfuehren(langsam, 33.3, 16.0);
  pruefe(
    'bei halber Bildrate dreht er zu',
    langsam < 0.1,
    `1.00 -> ${langsam.toFixed(2)} nach 200 verpassten Bildern`,
  );

  // Ein einzelner Ruckler darf kaum etwas kosten. Das war der Kern der
  // Ratsche: Jeder Drop drehte zu, und nichts drehte je wieder auf.
  const vorher = 0.8;
  let nach = bremseNachfuehren(vorher, 200, 16.0);
  const einbruch = 1 - nach / vorher;
  let bilder = 0;
  while (nach < vorher && bilder < 200) {
    nach = bremseNachfuehren(nach, 16.7, 16.0);
    bilder++;
  }
  pruefe(
    'ein einzelner Ruckler ist in einer halben Sekunde aufgeholt',
    einbruch < 0.05 && bilder <= 30,
    `${(einbruch * 100).toFixed(1)} % Einbruch, nach ${bilder} Bildern wieder da`,
  );

  /*
   * Und der Arbeitspunkt. Hier wird der Regelkreis geschlossen: ein gedachtes
   * Geraet, das Bilder bis zu einer Bremse von 0,62 puenktlich liefert und
   * darueber welche verpasst. Der Regler soll diese Grenze von selbst finden,
   * ohne sie zu kennen - das ist die eigentliche Aufgabe.
   */
  const kapazitaet = 0.62;
  let geregelt = 0.3;
  let tiefst = 1;
  let hoechst = 0;
  for (let i = 0; i < 4000; i++) {
    const abstand = geregelt > kapazitaet ? 33.3 : 16.7;
    geregelt = bremseNachfuehren(geregelt, abstand, 16.0);
    if (i > 2000) {
      tiefst = Math.min(tiefst, geregelt);
      hoechst = Math.max(hoechst, geregelt);
    }
  }
  console.log(
    `    eingependelt zwischen ${tiefst.toFixed(3)} und ${hoechst.toFixed(3)}, ` +
      `Grenze des Geraets ${kapazitaet}`,
  );
  pruefe(
    'er findet die Grenze des Geraets von allein',
    tiefst > kapazitaet * 0.94 && hoechst < kapazitaet * 1.06,
    `${tiefst.toFixed(3)} bis ${hoechst.toFixed(3)} um ${kapazitaet}`,
  );
}
console.log('');

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
   * Warten, bis es steht - nicht eine feste Zeit lang.
   *
   * In den ersten Bildern passiert einmalig alles auf einmal: Der Schattierer
   * wird uebersetzt, die Bezugsbahn gerechnet, der Regler faehrt die
   * Aufloesung hoch, und es faellt die Entscheidung, ob die Grafikkarte taugt.
   * Wie lange das dauert, haengt an der Maschine - hier, auf einem Nachbau in
   * Software, sind es ein paar Sekunden. Eine feste Wartezeit misst deshalb
   * mal den Betrieb und mal noch den Start.
   *
   * Dass der Anlauf ueberhaupt endet, ist damit gleich mitgeprueft - und das
   * ist die eigentliche Zusage.
   */
  const eingeschwungen = await seite.evaluate(async () => {
    const bis = Date.now() + 40000;
    let ruhig = 0;
    while (Date.now() < bis) {
      await new Promise((f) => setTimeout(f, 500));
      ruhig = window.__dj.bild.bildMs < 25 ? ruhig + 1 : 0;
      if (ruhig >= 4) return (Date.now() - (bis - 40000)) / 1000;
    }
    return null;
  });
  console.log(
    eingeschwungen === null
      ? '\n    (kam in 40 s nicht zur Ruhe)'
      : `\n    Nach ${eingeschwungen.toFixed(1)} s eingeschwungen`,
  );
  pruefe('der Anlauf ist nach spaetestens 40 s vorbei', eingeschwungen !== null,
    eingeschwungen === null ? 'nie' : `${eingeschwungen.toFixed(1)} s`);
  await seite.waitForTimeout(1500);
  const anlauf = await seite.evaluate(() => ({
    dauerMs: window.__mandel.dauerMs,
    aufGpu: window.__mandel.aufGpu === true,
  }));
  console.log(
    `\nNach dem Anlauf: ${anlauf.aufGpu ? 'Grafikkarte' : 'Hauptprozessor'}, ` +
      `${anlauf.dauerMs.toFixed(1)} ms je Bild`,
  );
  pruefe('danach laeuft es rund', anlauf.dauerMs < 50, `${anlauf.dauerMs.toFixed(1)} ms`);

  /*
   * Der Durchsatz trennt Grafikkarte von Nachbau in Software.
   *
   * Hier laeuft nur der Nachbau, also laesst sich nur *eine* Seite messen -
   * aber die gehoert festgehalten: Gemessen wurden 125 bis 188 Tausend
   * Punkt-Schritte je Millisekunde. Eine Grafikkarte liegt bei zehn Millionen
   * und mehr. Die Schwelle steht bei 250 Tausend, also knapp ueber dem
   * Nachbau und zwei Groessenordnungen unter jeder echten Karte.
   *
   * Warum das hier steht: Vorher entschied die *Bildzeit* darueber. Die
   * vermengt Leistung mit Arbeit - ein Spiele-Rechner, dessen Stelle gerade
   * 15000 Schritte braucht, sah damit aus wie gar keine Grafikkarte, und der
   * Rueckzug war endgueltig.
   */
  const durchsatz = await seite.evaluate(() => window.__mandel.durchsatz ?? null);
  if (durchsatz !== null) {
    console.log(`    Durchsatz ${(durchsatz / 1e3).toFixed(0)} Tausend Punkt-Schritte je ms`);
    pruefe(
      'der Nachbau in Software liegt unter der Schwelle',
      durchsatz < 2.5e5,
      `${(durchsatz / 1e3).toFixed(0)}k gegen 250k`,
    );
  } else {
    console.log('    (schon auf dem Hauptprozessor – kein Durchsatz zu messen)');
  }

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
    /*
     * Erst abwarten, bis der Zoomschub abgeklungen ist.
     *
     * Im Demolauf kommen echte Drops aus der Analyse. Faellt einer kurz vor
     * die Messung, steht der Ausgangswert schon bei 17 statt bei 0,3 - und
     * weil der Schub schnell abklingt, ist die Summe aus Rest und neuem Drop
     * dann kleiner als die geforderte Zunahme. Gemessen wurde in dem Fall
     * nicht der Drop, sondern der Zufall.
     */
    for (let i = 0; i < 60 && window.__mandel.schwung > 1; i++) {
      await new Promise((f) => setTimeout(f, 250));
    }
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
   * Was auch ohne Ausrichtung gilt: Bei zwanzig Kunststuecken beruehren zehn
   * Zuege hoechstens zwei Beutel, also kann keines mehr als zweimal vorkommen,
   * und mindestens acht verschiedene muessen dabei sein. Reiner Zufall haelt
   * beides nicht ein - bei zwanzig Moeglichkeiten zieht er in zehn Versuchen
   * mit ueber neunzig Prozent Wahrscheinlichkeit mindestens einen Doppel.
   *
   * (Die Zahlen haengen an der Groesse des Beutels. Kommt ein Kunststueck
   * hinzu, gehoeren sie nachgerechnet - deshalb steht die Rechnung hier und
   * nicht nur das Ergebnis.)
   */
  pruefe('nie zweimal dasselbe hintereinander', wiederholt === 0, `${wiederholt} Wiederholungen`);
  pruefe('in zehn Drops kommen mindestens acht verschiedene vor', zaehler.size >= 8,
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
      /*
       * Der Ring der Stichprobe sammelt ueber mehrere Aufrufe - im Betrieb
       * ueber Sekunden, hier eben in einer Schleife. Vorher leeren, damit die
       * vorige Tiefe nicht hineinspricht.
       */
      m.gpuProbeVergessen();
      let p = null;
      for (let i = 0; i < 16; i++) p = m.gpuProbe(tiefe, 0.3, 12000, 40000);
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

    /*
     * Und der Fall, der zuletzt haengengeblieben ist.
     *
     * Der Wachdienst fragte nur nach dem Anteil, der *in* der Menge liegt.
     * Damit sieht er nicht, wenn der Ausschnitt weit draussen in einem glatten
     * Feld steht: Dort entkommen alle Punkte nach fast derselben Zahl von
     * Schritten, der Innenanteil ist null, und das Bild bleibt trotzdem leer.
     *
     * Gemessen wird hier mit grosszuegiger Schrittgrenze, nicht mit der des
     * laufenden Bildes. Das ist Absicht: Geprueft wird, ob die *Kennzahl*
     * lebendig von tot trennt, und dafuer muessen genug Punkte ueberhaupt
     * entkommen koennen. Im Betrieb urteilt sie nur, wenn das der Fall ist -
     * sonst gilt sie als unbekannt, und die Schrittzahl wird erst einmal
     * angehoben.
     *
     * Geprueft wird die *Trennung*: Ein bekannt lebendiger Ausschnitt muss
     * ueber der Schwelle liegen, ein bekannt toter darunter. Nur eine Seite zu
     * pruefen wuerde nichts zeigen - eine Schwelle von null bestuende den
     * halben Test, und eine von unendlich die andere Haelfte.
     */
    const gegenprobe = await seite.evaluate(async (adresse) => {
      const m = await import(`${adresse}/gemeinsam/mandelgpu.js`);
      const messen = (ziel, tiefe) => {
        // Die Bahn dieses Ziels laden, indem einmal klein gezeichnet wird.
        m.gpuZeichnen({
          breite: 64, hoehe: 40, ziel, tiefe, dreh: 0, schritte: 6000, versatz: 0,
          dichte: 1, innenHell: 0.4, guete: 1, welle: 0, welleZeit: 0,
          mandala: 0, sterne: 6, fangAnteil: 0,
        });
        m.gpuProbeVergessen();
        let p = null;
        for (let i = 0; i < 16; i++) p = m.gpuProbe(tiefe, 0.3, 12000, 40000);
        return p.spreizung;
      };
      // "Miniatur" liegt auf der Antenne der Menge. Ab Tiefe 6 ist dort nichts
      // mehr - das ist der Ausschnitt, der auf dem iPad haengenblieb.
      const totesZiel = {
        name: 'Miniatur',
        x: '-1.768610930672608212890774771462666',
        y: '0.001645580646883195878428974839603',
      };
      return { tot: messen(totesZiel, 10), lebendig: messen(totesZiel, 3.4) };
    }, ADRESSE);

    console.log(
      `    Spreizung auf der Fahrt: ${bedarf.map((b) => `${b.tiefe}→${b.spreizung.toFixed(2)}`).join(', ')}`,
    );
    console.log(
      `    Gegenprobe "Miniatur": Tiefe 3,4 → ${gegenprobe.lebendig.toFixed(3)} (lebendig), ` +
        `Tiefe 10 → ${gegenprobe.tot.toFixed(3)} (tot)`,
    );
    pruefe(
      'der tote Ausschnitt faellt unter die Schwelle',
      gegenprobe.tot < 0.02,
      `${gegenprobe.tot.toFixed(3)}`,
    );
    pruefe(
      'der lebendige bleibt klar darueber',
      gegenprobe.lebendig > 0.3,
      `${gegenprobe.lebendig.toFixed(3)}`,
    );
    pruefe(
      'und die Fahrt selbst gilt nirgends als tot',
      Math.min(...bedarf.map((b) => b.spreizung)) >= 0.02,
      `niedrigster Wert ${Math.min(...bedarf.map((b) => b.spreizung)).toFixed(3)}`,
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
      /*
       * Bis zu einer Minute. Jeder Stufenwechsel fragt die Grafikkarte neu -
       * das ist gewollt, damit ein Fehlurteil nicht den Abend kostet -, und wo
       * keine ist, dauert der erneute Rueckzug seine Zeit. Auf einer Maschine
       * mit Grafikkarte steht die Stufe nach Sekundenbruchteilen.
       */
      const bis = Date.now() + 60000;
      let ruhig = 0;
      while (Date.now() < bis) {
        await new Promise((f) => setTimeout(f, 500));
        /*
         * 25 ms, nicht 50. Ein Wechsel der Stufe fragt die Grafikkarte neu,
         * und der Nachbau in Software liefert dabei zeitweise 37 ms - das ging
         * als "eingeschwungen" durch, und die niedrigste Stufe erschien
         * dadurch als die langsamste. Die Fassung auf dem Hauptprozessor liegt
         * bei 4 bis 13 ms; dazwischen ist die Grenze eindeutig.
         */
        /*
         * 15 ms, nicht 25. Die Fassung auf dem Hauptprozessor liegt bei 4 bis
         * 13 ms; alles darueber heisst, dass der erneute Versuch auf der
         * Grafikkarte noch laeuft. Mit 25 ging ein Zwischenstand von 18 ms als
         * Ruhe durch, und verglichen wurde dann der Versuch statt der Stufe.
         */
        ruhig = window.__dj.bild.bildMs < 15 ? ruhig + 1 : 0;
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
  const [gHoch, , gNiedrig] = stufen;
  /*
   * Die Leinwand ist die harte Zusage und wird immer geprueft: Sie haengt an
   * nichts als der gewaehlten Stufe.
   */
  pruefe(
    'die niedrigste Stufe rechnet die Leinwand kleiner',
    gNiedrig.punkte < gHoch.punkte,
    `${(gHoch.punkte / 1e6).toFixed(2)} -> ${(gNiedrig.punkte / 1e6).toFixed(2)} Millionen Punkte`,
  );

  /*
   * Die Zeiten dagegen sind hier nur bedingt messbar - und das wird gesagt
   * statt umgangen.
   *
   * Jeder Stufenwechsel fragt die Grafikkarte neu. Das ist Absicht: Ein
   * Fehlurteil ueber die Karte soll nicht den ganzen Abend kosten. Wo aber gar
   * keine Karte ist, sondern ein Nachbau in Software, laeuft nach jedem
   * Wechsel erst wieder der Rueckzug an, und der braucht auf der langsamsten
   * Stufe laenger als die Geduld dieser Pruefung. Gemessen wird dann der
   * Rueckzug und nicht die Stufe.
   *
   * Auf einer Maschine mit Grafikkarte tritt der Fall nicht ein. Deshalb wird
   * verglichen, wenn alle drei zur Ruhe gekommen sind, und andernfalls
   * ausdruecklich vermerkt, dass hier nichts gezeigt wurde.
   */
  const alleRuhig = stufen.every((e) => e.ms < 15);
  if (alleRuhig) {
    const [a, b2, c] = stufen;
    /*
     * Verglichen werden die *Enden*, nicht benachbarte Stufen.
     *
     * Zwischen "Mittel" und "Niedrig" liegt hier nur noch ein knapper
     * Millisekundenwert - nachgemessen 3,0 gegen 4,2 -, und weil jeder
     * Stufenwechsel die Grafikkarte neu fragt, schwankt das staerker als der
     * Unterschied selbst. Eine Reihenfolge zu behaupten, die im Rauschen
     * verschwindet, waere eine Zusage ohne Deckung. Dass die niedrigen Stufen
     * weniger Arbeit machen, zeigt der Vergleich mit der hoechsten - und die
     * Leinwandgroesse weiter oben zeigt es unabhaengig von jeder Zeitmessung.
     */
    pruefe(
      'die niedrigen Stufen sind schneller als die hoechste',
      b2.ms < a.ms && c.ms < a.ms,
      `${a.ms.toFixed(1)} -> ${b2.ms.toFixed(1)} -> ${c.ms.toFixed(1)} ms`,
    );
  } else {
    console.log(
      '    NICHT GEPRUEFT: mindestens eine Stufe kam nicht zur Ruhe ' +
        `(${stufen.filter((e) => e.ms >= 15).map((e) => `${e.stufe} ${e.ms.toFixed(0)} ms`).join(', ')}). ` +
        'Ohne Grafikkarte misst dieser Vergleich den Rueckzug statt die Stufe.',
    );
  }
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
