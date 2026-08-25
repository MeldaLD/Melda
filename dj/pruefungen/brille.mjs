// Abnahme der Brillenausrichtung.
//
//   npm run brillepruefen          (startet den Server selbst)
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/brille.mjs
//
// Anlass: Auf der Party hatten viele Gaeste einen roten Folienwedel in der
// Hand. Der ist kraeftiger rot als die getoenten Brillenglaeser, weil er das
// Licht spiegelt statt es zu filtern - und die Brillensuche allein hat auf
// vier echten Fotos dreimal ihn erwischt statt der Brille (Guete 0,35 / 0,00
// / 0,00 / 0,00).
//
// --- Was hier geprueft wird und was nicht ------------------------------------
//
// Nicht geprueft wird "die Guete ist hoch". Genau dieser Wert war naemlich das
// Problem: Er beurteilt Groesse, Form und Waagerechte des roten Flecks, aber
// nicht, *wo* der Fleck sitzt. Ein Fund mit Guete 0,63 lag ein Drittel eines
// Augenabstands daneben. Eine Abnahme gegen die Guete haette das durchgewinkt.
//
// Geprueft wird stattdessen die Eigenschaft, um die es wirklich geht:
//
//   Der Anker sitzt im Gesicht und nicht am Wedel.
//
// Das laesst sich hart pruefen, weil es dafuer ein zweites, unabhaengiges Mass
// gibt: die Augenlandmarken des Gesichtsmodells. Ein Wedelfund lag davon 1,52
// Augenabstaende entfernt, ein richtiger Fund 0,07 bis 0,17. Zwischen diesen
// beiden Gruppen liegt eine Luecke, in der die Schwelle stehen kann.
//
// Dazu kommt eine Gegenprobe in die andere Richtung: Mindestens die beiden
// Fotos, auf denen die Brille sauber gefunden wird, muessen die Nachbesserung
// auch wirklich ausloesen. Ohne diese zweite Zusage koennte man die Pruefung
// jederzeit bestehen, indem man die Brille gar nicht mehr zu Wort kommen
// laesst - und das waere genau der Verlust, um den es geht: Die Brille sitzt
// auf der Glasmitte, die Landmarke auf der Pupille.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROM = process.env.CHROMIUM_PFAD;

/*
 * Wenn keine Adresse vorgegeben ist, startet die Pruefung ihren eigenen
 * Server und raeumt ihn hinterher weg.
 *
 * Das ist kein Komfort, sondern der Unterschied zwischen einer Pruefung, die
 * gelaufen wird, und einer, die es nicht wird: Eine Abnahme, fuer die man
 * vorher in einem zweiten Fenster etwas starten muss, laeuft irgendwann nicht
 * mehr mit.
 */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DJ_PORT) || 3219;
let server = null;
if (!process.env.DJ_ADRESSE) {
  server = spawn(process.execPath, [path.join(HIER, '..', 'server', 'index.js')], {
    env: { ...process.env, DJ_PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let versuch = 0; versuch < 60; versuch++) {
    try {
      const antwort = await fetch(`http://localhost:${PORT}/brille/`);
      if (antwort.ok) break;
    } catch { /* noch nicht da */ }
    await new Promise((f) => setTimeout(f, 250));
  }
}
const ADRESSE = process.env.DJ_ADRESSE ?? `http://localhost:${PORT}`;

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

/*
 * Die Probefotos. Vier davon zeigen den Wedel, eines nicht.
 *
 * Sie liegen unter public/brille/proben/ und sind doppelt abgeschirmt:
 *
 *   NICHT_AUSLIEFERN in werkzeuge/verteilen.mjs  haelt sie von Vercel fern
 *   .gitignore                                   haelt sie aus dem Repository
 *
 * Das zweite ist das wichtigere und stand zuerst nicht da. Dieses Repository
 * ist oeffentlich - "wird nicht ausgeliefert" heisst dann eben nicht "steht
 * nicht im Netz". Es sind erkennbare Gesichter von Gaesten, und die haben
 * niemandem erlaubt, sie zu veroeffentlichen.
 *
 * Fuer die Abnahme heisst das: Die Wedelfotos liegen nur da, wo jemand sie
 * hingelegt hat. Fehlen sie, wird der Teil uebersprungen statt gemeldet -
 * eine Abnahme, die auf einem frischen Klon rot ist, wird abgeschaltet.
 */
const OHNE_WEDEL = 'beispiel';
const MIT_WEDEL = ['gast-64d071b9', 'gast-f9faf208', 'gast-664ebfb3', 'gast-31153039'];

/** Wie weit ein Fund von der Augenmitte weg sein darf, in Augenabstaenden. */
const VERSATZ_HOECHSTENS = 0.25;

/** Auf welchen Fotos die Brille die Augen nachbessern koennen muss. */
const NACHGEBESSERT_MINDESTENS = 2;

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--mute-audio'],
});
const seite = await browser.newPage({ viewport: { width: 900, height: 700 } });
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => {
  // MediaPipe meldet seinen XNNPACK-Start als "error" - das ist keiner.
  if (n.type() === 'error' && !/XNNPACK|TensorFlow/.test(n.text())) konsole.push(n.text());
});

try {
  await seite.goto(`${ADRESSE}/brille/`, { waitUntil: 'networkidle' });

  // Erst nachsehen, welche Fotos ueberhaupt da sind.
  const vorhanden = [];
  for (const n of [OHNE_WEDEL, ...MIT_WEDEL]) {
    const antwort = await fetch(`${ADRESSE}/brille/proben/${n}.jpg`);
    if (antwort.ok) vorhanden.push(n);
  }
  const wedel = vorhanden.filter((n) => MIT_WEDEL.includes(n));
  if (!vorhanden.includes(OHNE_WEDEL)) {
    console.log(`\nKein einziges Probefoto unter public/brille/proben/ - nichts zu pruefen.`);
    await browser.close();
    server?.kill();
    process.exit(0);
  }
  if (wedel.length < 3) {
    console.log(`\nNur ${vorhanden.length} Probefoto(s) da, davon ${wedel.length} mit Wedel.`);
    console.log('Die Abnahme braucht mindestens drei Wedelfotos - sie sind bewusst nicht');
    console.log('im Repository (siehe .gitignore). Uebersprungen.');
    await browser.close();
    server?.kill();
    process.exit(0);
  }
  const FOTOS = vorhanden;

  const befund = await seite.evaluate(async (fotos) => {
    const { brilleFinden } = await import('../gemeinsam/brille.js');
    const { fundBestimmen, gesichtFinden } = await import('./gesichtssucher.js');
    const aus = [];
    for (const n of fotos) {
      const bild = new Image();
      bild.src = `proben/${n}.jpg`;
      await bild.decode();
      const B = 640;
      const H = Math.round(bild.naturalHeight * (B / bild.naturalWidth));
      const c = document.createElement('canvas');
      c.width = B;
      c.height = H;
      const s = c.getContext('2d', { willReadFrequently: true });
      s.drawImage(bild, 0, 0, B, H);
      const daten = s.getImageData(0, 0, B, H);
      const t0 = performance.now();
      const fund = await fundBestimmen(c, daten, brilleFinden);
      const ms = Math.round(performance.now() - t0);
      /*
       * Die Augen noch einmal getrennt holen. Das ist keine Doppelarbeit,
       * sondern der Kern der Pruefung: Der Fund wird gegen ein Mass gehalten,
       * das nicht aus ihm selbst stammt. Die erste Fassung dieser Pruefung
       * hat das ausgerichtete Bild noch einmal durch denselben Sucher
       * geschickt - derselbe Fehler zweimal hintereinander sieht aus wie
       * keiner.
       */
      const g = await gesichtFinden(c);
      // Die alte Fassung: Brillensuche im ganzen Bild, ohne Gesicht. Sie
      // laeuft hier als Kontrolle mit.
      const alt = brilleFinden(daten);
      let augenMitte = null;
      let abstand = null;
      if (g?.augen) {
        const [a, b] = g.augen;
        abstand = Math.hypot(b[0] - a[0], b[1] - a[1]);
        augenMitte = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      }
      const versatzVon = (f) => (f && augenMitte && abstand
        ? +(Math.hypot(f.mitte[0] - augenMitte[0], f.mitte[1] - augenMitte[1]) / abstand).toFixed(2)
        : null);
      aus.push({
        n,
        ms,
        da: !!fund,
        quelle: fund?.quelle ?? null,
        sicher: g ? +g.sicher.toFixed(2) : null,
        // Wie gross das gewaehlte Gesicht im Bild ist - damit eine Hand, die
        // faelschlich als Gesicht durchgeht, auffaellt.
        gesichtAnteil: g ? +((g.kasten.width * g.kasten.height) / (B * H)).toFixed(3) : null,
        versatz: versatzVon(fund),
        versatzAlt: versatzVon(alt),
      });
    }
    return aus;
  }, FOTOS);

  console.log('\nFoto               Quelle      Gesicht  Anteil  Versatz  (ohne Gesicht)   ms');
  for (const e of befund) {
    console.log(`  ${e.n.padEnd(16)} ${String(e.quelle ?? '-').padEnd(11)} `
      + `${String(e.sicher ?? '-').padStart(5)}  ${String(e.gesichtAnteil ?? '-').padStart(6)}  `
      + `${String(e.versatz ?? '-').padStart(7)}  ${String(e.versatzAlt ?? '-').padStart(14)}  ${String(e.ms).padStart(4)}`);
  }
  console.log('');

  pruefe('auf jedem Foto ein Fund', befund.every((e) => e.da),
    befund.filter((e) => !e.da).map((e) => e.n).join(', '));

  pruefe('auf jedem Foto ein Gesicht', befund.every((e) => e.quelle !== 'nurBrille'),
    befund.filter((e) => e.quelle === 'nurBrille').map((e) => e.n).join(', '));

  /*
   * Die eigentliche Zusage: kein Anker am Wedel.
   *
   * Ehrlicherweise: Fuer einen Fund aus den Augen ist dieser Wert null,
   * weil er *die* Augenmitte ist. Die Zusage traegt hier also nur die Fotos,
   * auf denen die Brille nachgebessert hat. Damit sie ueberhaupt etwas ueber
   * die anderen sagt, steht die Kontrolle daneben - und die zweite Pruefung
   * darunter ist die, die fuer alle fuenf gilt.
   */
  const daneben = befund.filter((e) => e.versatz === null || e.versatz > VERSATZ_HOECHSTENS);
  pruefe(`kein Anker weiter als ${VERSATZ_HOECHSTENS} Augenabstaende daneben`, daneben.length === 0,
    daneben.map((e) => `${e.n}=${e.versatz}`).join(', '));

  /*
   * Die Kontrolle - und ohne sie waere die Pruefung darueber wertlos.
   *
   * Wenn die alte Fassung (Brillensuche im ganzen Bild) auf denselben Fotos
   * *nicht* danebengreift, dann gibt es das Problem nicht mehr, das hier
   * geloest wird - und eine Pruefung, die ein verschwundenes Problem prueft,
   * bestaetigt nur sich selbst. Auf den vier Wedelfotos lag die alte Fassung
   * zwischen 0,5 und 3,7 Augenabstaenden daneben.
   */
  const altDaneben = befund.filter((e) => e.versatzAlt === null || e.versatzAlt > VERSATZ_HOECHSTENS);
  pruefe('die Kontrolle greift ohne Gesicht weiterhin daneben', altDaneben.length >= Math.min(3, wedel.length),
    `${altDaneben.length} von ${befund.length}: `
      + altDaneben.map((e) => `${e.n}=${e.versatzAlt}`).join(', '));

  /*
   * Gilt fuer alle fuenf: Das gewaehlte Gesicht muss ein Gesicht sein und
   * nicht eine Hand im Vordergrund. Fehlfunde auf Haenden lagen bei 0,42 bis
   * 0,51 Sicherheit, die richtigen Gesichter bei 0,83 bis 0,95.
   */
  const schwach = befund.filter((e) => !(e.sicher >= 0.7) || !(e.gesichtAnteil >= 0.02));
  pruefe('das gewaehlte Gesicht ist gross und sicher', schwach.length === 0,
    schwach.map((e) => `${e.n}: sicher=${e.sicher} anteil=${e.gesichtAnteil}`).join(', '));

  /*
   * Und die Gegenprobe: Die Brille darf nicht stillgelegt sein.
   */
  const nachgebessert = befund.filter((e) => e.quelle === 'brille');
  pruefe(`mindestens ${NACHGEBESSERT_MINDESTENS} Fotos ueber die Brille nachgebessert`,
    nachgebessert.length >= Math.min(NACHGEBESSERT_MINDESTENS, FOTOS.length - 1),
    `${nachgebessert.length}: ${nachgebessert.map((e) => e.n).join(', ')}`);

  pruefe('keine Fehler in der Konsole', konsole.length === 0, konsole.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server?.kill();
}

console.log(fehler ? `\n${fehler} Punkt(e) offen.` : '\nAlles in Ordnung.');
process.exit(fehler ? 1 : 0);
