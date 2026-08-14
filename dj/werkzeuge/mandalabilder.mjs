// Ein Bild von jedem Mandala - und daneben, was es gekostet hat.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/werkzeuge/mandalabilder.mjs
//
// Kein Pruefstand. Die Frage, die dieses Werkzeug beantwortet, ist die, die
// keine Zahl beantwortet: Sieht das gut aus? Sechsundzwanzig Varianten sind zu
// viele, um sie einzeln auf der Buehne abzuwarten - hier laeuft jede einmal
// vor die Linse, und danach kann man sie nebeneinanderlegen.
//
// Die Rechenzeit steht mit dabei, weil beides zusammen die eigentliche Frage
// ist: nicht "was kostet es" und nicht "wie sieht es aus", sondern ob das eine
// das andere wert ist. Was viel kostet und wenig zeigt, fliegt aus der
// Vorauswahl - abgeschaltet, nicht geloescht.
//
// Achtung bei der Zahl: Ohne Grafikkarte laeuft im Hintergrund die Fassung auf
// dem Hauptprozessor, und dann misst die Spalte den Nachbau statt die Karte.
// Das Werkzeug sagt oben, was von beidem der Fall war.

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3200';
const CHROM = process.env.CHROMIUM_PFAD;
const ZIEL = process.env.DJ_BILDER ?? path.join(process.cwd(), 'dj-bilder', 'mandalas');
// Wie lange jedes Mandala laufen darf, bevor das Bild faellt. Die Faltung
// steht sofort, aber die Fahrt braucht einen Moment, bis sie in einer
// interessanten Tiefe angekommen ist.
const HALTEN_MS = Number(process.env.DJ_HALTEN ?? 4500);
/*
 * Wie oft die ganze Liste durchlaeuft, bevor die Zeiten gelten.
 *
 * Ein Durchlauf reicht nicht, und der erste Versuch hat auch gleich gezeigt,
 * warum: Die Fahrt wird waehrenddessen immer tiefer, tiefer heisst mehr
 * Schritte je Punkt, und wer zufaellig weiter hinten in der Liste steht,
 * bekommt eine andere Tiefe als wer vorn steht. Gemessen war damit die
 * Reihenfolge, nicht die Faltung - "Rosette 6" kam auf 46 ms, "Linse 10" auf
 * 3,5, und beide Zahlen sagten ueber die Faltung nichts.
 *
 * Deshalb mehrere Durchlaeufe in wechselnder Reihenfolge. Der Mittelwert je
 * Mandala liegt danach ueber verschiedene Tiefen verteilt - so, wie er sich
 * ueber einen Abend auch einstellt.
 */
const RUNDEN = Number(process.env.DJ_RUNDEN ?? 3);

await fs.mkdir(ZIEL, { recursive: true });

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    /*
     * WebGL2 auch dort erzwingen, wo keine Karte steckt.
     *
     * Ohne diese Schalter liefert ein Rechner ohne Grafikkarte gar keinen
     * WebGL2-Kontext, die Buehne faellt auf die Fassung im Hauptprozessor
     * zurueck - und die kennt nur die eine, alte Faltung. Jedes Bild saehe
     * dann gleich aus, egal welches Mandala gefragt war.
     *
     * Angle mit SwiftShader rechnet denselben Schattierer, nur langsam. Die
     * Bilder stimmen damit; die Zeiten nicht, und das steht auch so dabei.
     */
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const seite = await browser.newPage({ viewport: { width: 1280, height: 800 } });
seite.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

const zeilen = [];

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });
  await seite.click('#startDemo');
  await seite.waitForSelector('#konsole:not([hidden])', { timeout: 120000 });
  await seite.evaluate(async () => {
    const { gpuZwingen } = await import('/gemeinsam/visualmodi.js');
    // Sonst zieht der Notausgang, sobald SwiftShader zu langsam wird - und
    // gezeichnet haette dann die Ersatzfassung ohne die neuen Faltungen.
    gpuZwingen(true);
    window.__dj.bild.modusSetzen('mandelbrot');
  });
  // Erst einmal in Fahrt kommen lassen. Ein Mandelbrot bei Tiefe null ist eine
  // schwarze Kugel und sagt ueber die Faltung gar nichts.
  await seite.waitForTimeout(12000);

  const auf = await seite.evaluate(() => window.__mandel?.aufGpu ?? null);
  console.log(
    auf === true
      ? '\nGerechnet auf der Grafikkarte - die Zeiten gelten fuer sie.'
      : auf === false
        ? '\nGerechnet auf dem Hauptprozessor (keine Karte gefunden). Die Zeiten' +
          ' zeigen den Nachbau, nicht die Karte.'
        : '\nUnklar, wer rechnet.',
  );

  const liste = await seite.evaluate(async () => {
    const { MANDALAS } = await import('/gemeinsam/visualmodi.js');
    return MANDALAS.map((m) => ({ id: m.id, name: m.name }));
  });

  for (let runde = 1; runde <= RUNDEN; runde++) {
    // Umgedrehte Reihenfolge in jeder zweiten Runde, damit nicht immer
    // dieselben Namen bei denselben Tiefen landen.
    const folge = runde % 2 === 0 ? [...liste].reverse() : liste;
    const letzte = runde === RUNDEN;
    console.log(`\nRunde ${runde} von ${RUNDEN}${letzte ? ' – mit Bildern' : ''}:`);
    for (const m of folge) {
      await messen(m, letzte);
    }
  }

  await seite.evaluate(async () => {
    const { mandalaZwingen } = await import('/gemeinsam/visualmodi.js');
    mandalaZwingen(null);
  });

  async function messen(m, mitBild) {
    await seite.evaluate(async (id) => {
      const { mandalaZwingen } = await import('/gemeinsam/visualmodi.js');
      mandalaZwingen(id);
    }, m.id);

    /*
     * Warten, bis wirklich etwas zu sehen ist.
     *
     * Beim ersten Durchlauf kam "Droste 6" als vollkommen schwarzes Bild
     * heraus, und ohne diese Pruefung haette ich daraus geschlossen, die
     * Faltung tauge nichts. Sie taugt; die Fahrt stand in dem Moment nur
     * gerade tief im Inneren der Menge, wo alles dunkel ist. Das trifft jede
     * Faltung irgendwann und hat mit ihr nichts zu tun.
     *
     * Gemessen wird die Streuung der Helligkeit, nicht ihr Mittelwert: Ein
     * gleichmaessig dunkles Bild ist tot, ein dunkles mit Struktur nicht.
     *
     * Die Zahl kommt aus der Buehne selbst (window.__mandel.streuung) und
     * nicht daher, dass dieses Werkzeug die Leinwand ausliest. Der Versuch
     * kostete einen halben Durchlauf: Von aussen gelesen kamen fuer zwanzig
     * von sechsundzwanzig Mandalas glatte Nullen heraus, obwohl die Bilder
     * daneben prachtvoll aussahen. Der Grund ist die Schichtung - das Fraktal
     * liegt in einer eigenen Leinwand (#fraktal) *unter* der 2D-Leinwand, und
     * auf der 2D-Leinwand liegt nur noch der Schleier fuer die Schrift. Wer
     * #visual ausliest, misst den Schleier.
     */
    let lebendigkeit = 0;
    // Nur wenn auch ein Bild fallen soll, lohnt das Warten. In den
    // Messrunden zaehlt jede Sekunde gleich viel, tot oder nicht.
    const bis = Date.now() + (mitBild ? HALTEN_MS + 25000 : 0);
    /*
     * Zweimal hintereinander lebendig, nicht einmal.
     *
     * Die Zahl wird in der Buehne nur in jedem sechsten Bild neu gerechnet,
     * und wo SwiftShader statt einer Karte rechnet, sind sechs Bilder ueber
     * eine Sekunde. Eine einzelne Abfrage kann also einen Stand von vorhin
     * melden - "Wabe" kam so zweimal als lebendig durch und lag auf dem Bild
     * trotzdem im Schwarzen, weil die Wache dazwischen neu angesetzt hatte.
     */
    let ruhig = 0;
    for (;;) {
      await seite.waitForTimeout(HALTEN_MS);
      lebendigkeit = await seite.evaluate(() => window.__mandel?.streuung ?? 0);
      ruhig = lebendigkeit > 6 ? ruhig + 1 : 0;
      if (ruhig >= 2 || Date.now() > bis) break;
    }

    const messung = await seite.evaluate(async () => {
      const { mandalaBericht } = await import('/gemeinsam/visualmodi.js');
      const jetzt = mandalaBericht().find((x) => x.laeuft);
      return { ms: jetzt?.ms ?? null, messungen: jetzt?.messungen ?? 0 };
    });

    if (!mitBild) {
      console.log(`  ${m.name.padEnd(16)} …`);
      return;
    }
    const datei = path.join(ZIEL, `${m.id}.png`);
    await seite.locator('#visual').screenshot({ path: datei });
    zeilen.push({ ...m, ...messung, lebendigkeit });
    console.log(
      `  ${m.name.padEnd(16)} ${(messung.ms === null ? '–' : `${messung.ms.toFixed(2)} ms`).padStart(9)}` +
        `  Struktur ${lebendigkeit.toFixed(1).padStart(5)}${lebendigkeit > 6 ? ' ' : ' (tot!)'}` +
        ` -> ${datei}`,
    );
  }
} finally {
  await browser.close();
}

// Eine Uebersicht zum Nebeneinanderlegen. Nach Aufwand sortiert, damit oben
// steht, was billig ist - dort wird zuerst geschaut, ob auch etwas zu sehen ist.
const nachAufwand = [...zeilen].sort((a, b) => (a.ms ?? 1e9) - (b.ms ?? 1e9));
const uebersicht = path.join(ZIEL, 'uebersicht.html');
await fs.writeFile(
  uebersicht,
  `<!doctype html><meta charset="utf-8"><title>Mandalas</title>
<style>
 body{background:#0b0b0d;color:#e8e6e1;font:14px/1.4 system-ui,sans-serif;margin:24px}
 .feld{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
 figure{margin:0} img{width:100%;display:block;border-radius:6px}
 figcaption{padding-top:6px;display:flex;justify-content:space-between}
 b{font-weight:600} span{opacity:.6;font-variant-numeric:tabular-nums}
</style>
<h1>Mandalas – nach Aufwand</h1>
<div class="feld">
${nachAufwand
  .map(
    (z) =>
      `<figure><img src="${z.id}.png" alt="${z.name}">` +
      `<figcaption><b>${z.name}</b><span>${z.ms === null ? '–' : `${z.ms.toFixed(2)} ms`}</span></figcaption></figure>`,
  )
  .join('\n')}
</div>
`,
  'utf8',
);
console.log(`\n  Uebersicht -> ${uebersicht}\n`);
