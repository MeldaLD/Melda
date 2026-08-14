// Abnahme gegen das Wabern.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/wabern.mjs
//
// Der Fehler, um den es geht, war auf dem iPad zu sehen und liess sich an
// einer Bildschirmaufnahme beziffern: Das Bild wurde "in regelmaessigen
// Abstaenden auseinandergetrieben", und zwar nicht zum Beat. Gemessen an den
// Bild-zu-Bild-Unterschieden der Aufnahme lagen die Spitzen bei 0,100 s,
// 0,200 s, 0,300 s - exakt zehn Hertz. Bei sechzig Bildern je Sekunde ist das
// jedes sechste Bild, und im ganzen Zeichner gab es genau einen Vorgang mit
// dieser Periode: der Wachdienst holte sich das fertige Bild zurueck.
//
// Warum das weh tut: Ein Apple-Grafikchip rechnet kachelweise und verzoegert.
// Wer das fertige Bild zurueckliest, zwingt ihn, die Pipeline vorher
// leerlaufen zu lassen. Liegt das Bild ohnehin knapp im Takt, reisst genau
// dieses eine Bild ueber die Zeit; das naechste bekommt dann den doppelten
// Zeitschritt, und weil die Fahrt "Tiefe plus Tempo mal Zeitschritt" rechnet,
// springt der Zoom nach vorn. Zehnmal je Sekunde ein Sprung.
//
// Zwei Zusagen werden hier geprueft, und zwar beide ohne Zeitmessung:
//
//   1. Auf dem Weg ueber die Grafikkarte wird waehrend des Zeichnens gar nicht
//      mehr zurueckgegriffen. Eine Zeitmessung waere hier wertlos - in dieser
//      Umgebung rechnet ein Nachbau in Software, dort gibt es keine
//      Kachelpipeline, die leerlaufen koennte, und der Aufruf ist billig. Der
//      Fehler waere unsichtbar und die Pruefung gruen. Gezaehlt statt gemessen
//      ist deshalb nicht die schwaechere Pruefung, sondern die einzige, die
//      hier ueberhaupt etwas aussagt.
//   2. Ein einzelnes langes Bild reisst die Fahrt nicht nach vorn. Das ist die
//      zweite Haelfte: Auch ohne den Rueckgriff gibt es Aussetzer - die
//      Speicherbereinigung, eine andere App -, und ein Zeitschritt, der
//      ungedeckelt in die Fahrt geht, macht daraus jedes Mal einen Sprung.

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
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    // WebGL2 auch ohne Karte, sonst laeuft die Notfassung - und dort ist der
    // Rueckgriff richtig und noetig. Geprueft werden soll der andere Weg.
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const seite = await browser.newPage({ viewport: { width: 700, height: 460 } });
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => {
  if (n.type() === 'error') konsole.push(n.text());
});

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });
  await seite.click('#startDemo');
  await seite.waitForSelector('#konsole:not([hidden])', { timeout: 120000 });
  await seite.evaluate(async () => {
    const { gpuZwingen } = await import('/gemeinsam/visualmodi.js');
    gpuZwingen(true);
    window.__dj.bild.modusSetzen('mandelbrot');
  });
  await seite.waitForTimeout(8000);

  const aufGpu = await seite.evaluate(() => window.__mandel?.aufGpu === true);
  if (!aufGpu) {
    console.log(
      '\nNICHT GEPRUEFT: laeuft auf dem Hauptprozessor. Dort gehoert der' +
        ' Rueckgriff hin - die Notfassung urteilt danach, weil sie keine' +
        ' Bezugsbahn zum Nachrechnen hat.',
    );
  } else {
    console.log('\nDer Zeichenweg der Grafikkarte greift nicht aufs fertige Bild zurueck:');
    /*
     * Gezaehlt wird ueber die ganze Beobachtung, und am Ende wird nachgesehen,
     * ob wirklich die ganze Zeit ueber die Karte gerechnet wurde. Ein
     * Zwischenfall - der Notausgang zieht, die Notfassung uebernimmt - wuerde
     * sonst Aufrufe liefern, die voellig in Ordnung sind, und die Pruefung
     * schluege aus dem falschen Grund fehl. Genau das ist beim ersten Anlauf
     * passiert: neun Aufrufe, alle aus der Notfassung, und der Weg war schon
     * gewechselt, bevor ueberhaupt gezaehlt wurde.
     */
    const aus = await seite.evaluate(async () => {
      const echt = CanvasRenderingContext2D.prototype.getImageData;
      const spuren = new Map();
      CanvasRenderingContext2D.prototype.getImageData = function (...a) {
        const s = (new Error().stack || '').split('\n').slice(1, 3).join(' | ');
        spuren.set(s, (spuren.get(s) || 0) + 1);
        return echt.apply(this, a);
      };
      let immerGpu = true;
      for (let i = 0; i < 40; i++) {
        await new Promise((f) => setTimeout(f, 100));
        if (window.__mandel?.aufGpu !== true) immerGpu = false;
      }
      CanvasRenderingContext2D.prototype.getImageData = echt;
      return { spuren: [...spuren.entries()], immerGpu };
    });
    const gesamt = aus.spuren.reduce((a, [, n]) => a + n, 0);
    if (!aus.immerGpu) {
      console.log('    NICHT GEPRUEFT: der Weg hat waehrend der Messung gewechselt.');
    } else {
      pruefe('in vier Sekunden kein einziger Rueckgriff', gesamt === 0,
        gesamt ? aus.spuren.map(([s, n]) => `${n}x ${s}`).join(' ; ') : '0 Aufrufe');
    }

    /*
     * Und die Gegenprobe: Der Schalter muss auch etwas tun.
     *
     * Ohne sie waere die Zusage oben auch dann gruen, wenn ich den Wachdienst
     * versehentlich ganz entfernt haette - und die Werkzeuge, die das Bild
     * beurteilen, saessen still im Dunkeln.
     */
    console.log('\nEingeschaltet rechnet er wieder:');
    const mit = await seite.evaluate(async () => {
      const { streuungMessen } = await import('/gemeinsam/visualmodi.js');
      const echt = CanvasRenderingContext2D.prototype.getImageData;
      let zahl = 0;
      CanvasRenderingContext2D.prototype.getImageData = function (...a) {
        zahl++;
        return echt.apply(this, a);
      };
      streuungMessen(true);
      await new Promise((f) => setTimeout(f, 3000));
      streuungMessen(false);
      CanvasRenderingContext2D.prototype.getImageData = echt;
      return { zahl, streuung: window.__mandel?.streuung ?? null };
    });
    pruefe('mit streuungMessen(true) wird wieder zurueckgegriffen', mit.zahl > 0,
      `${mit.zahl} Aufrufe`);
    pruefe('und es kommt eine Zahl dabei heraus', typeof mit.streuung === 'number',
      String(mit.streuung));
  }

  /*
   * Der Deckel auf dem Zeitschritt.
   *
   * Geprueft wird am Verhalten, nicht am Code: Wie weit rueckt die Fahrt in
   * einem Bild vor? Waere der Zeitschritt ungedeckelt, koennte ein einzelnes
   * langes Bild beliebig weit springen. Mit Deckel ist der groesste Sprung
   * hoechstens doppelt so gross wie der uebliche.
   */
  console.log('\nEin einzelnes langes Bild reisst die Fahrt nicht nach vorn:');
  const spruenge = await seite.evaluate(async () => {
    const werte = [];
    let vor = window.__mandel?.tiefe ?? 0;
    for (let i = 0; i < 240; i++) {
      await new Promise((f) => requestAnimationFrame(f));
      const jetzt = window.__mandel?.tiefe ?? vor;
      const d = jetzt - vor;
      if (d > 0) werte.push(d);
      vor = jetzt;
      /*
       * Alle zwanzig Bilder ein kuenstlicher Aussetzer. Er ahmt genau das
       * nach, was der Rueckgriff verursacht hat - ein Bild, das viel zu lange
       * braucht -, und stellt die Frage, die zaehlt: Was macht die Fahrt
       * daraufhin?
       */
      if (i % 20 === 19) {
        const bis = performance.now() + 60;
        while (performance.now() < bis) { /* absichtlich blockieren */ }
      }
    }
    return werte;
  });
  const sortiert = [...spruenge].sort((a, b) => a - b);
  const mittlerer = sortiert[Math.floor(sortiert.length / 2)];
  const groesster = sortiert[sortiert.length - 1];
  pruefe(
    'der groesste Zoomschritt bleibt nah am ueblichen',
    groesster < mittlerer * 3.2,
    `üblich ${mittlerer.toExponential(2)}, größter ${groesster.toExponential(2)} ` +
      `(${(groesster / mittlerer).toFixed(1)}×)`,
  );

  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
