// Abnahme der Mandala-Auswahl.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/mandalas.mjs
//
// Sechsundzwanzig Faltungen, und welche davon laufen duerfen, entscheidet
// nicht der Code, sondern wer davorsteht. Das ist der Sinn der Auswahl: sich
// mit der eigenen Hardware herantasten, ohne dass jemand vorher etwas
// geloescht hat.
//
// Damit haengt an dieser Liste mehr als an einem Bedienelement:
//
//   * Wer abwaehlt, will das nach dem naechsten Start immer noch so haben.
//     Die Wahl liegt deshalb im Browser - sie gehoert zum Geraet, nicht zum
//     Abend. Was das iPad nicht schafft, schafft der Partyrechner vielleicht.
//   * Alles abwaehlen darf nicht gehen. Ohne Faltung bliebe die Symmetrie
//     einfach aus, und das sieht nicht nach Einstellung aus, sondern nach
//     Defekt.
//   * Und die Zahl daneben muss gemessen sein. Eine geschaetzte Zahl waere
//     hier schlimmer als gar keine: Man wuerde nach ihr aussortieren.

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
    // Ohne Grafikkarte gaebe es keinen WebGL2-Kontext und damit auch keine
    // Faltungen zu pruefen. Angle mit SwiftShader rechnet denselben
    // Schattierer, nur langsam - fuer diese Fragen reicht das.
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const seite = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => {
  if (n.type() === 'error') konsole.push(n.text());
});

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });
  await seite.click('#startDemo');
  await seite.waitForSelector('#konsole:not([hidden])', { timeout: 120000 });

  console.log('\nDer Katalog selbst:');
  const katalog = await seite.evaluate(async () => {
    const { MANDALAS } = await import('/gemeinsam/visualmodi.js');
    return MANDALAS;
  });
  pruefe('es sind mehr als die acht Rosetten von frueher', katalog.length >= 20,
    `${katalog.length} Eintraege`);
  pruefe(
    'jede Kennung kommt nur einmal vor',
    new Set(katalog.map((m) => m.id)).size === katalog.length,
  );
  const arten = new Set(katalog.map((m) => m.art));
  pruefe('und es sind wirklich verschiedene Faltungen, nicht nur Achsenzahlen',
    arten.size >= 10, `${arten.size} Faltungsarten`);

  console.log('\nDie Auswahl auf der Buehne:');
  await seite.keyboard.press('m');
  await seite.waitForSelector('#mandalas:not([hidden])');
  const zeilen = await seite.$$eval('#mandalaListe label', (ls) =>
    ls.map((l) => ({
      id: l.dataset.id,
      an: l.querySelector('input').checked,
    })),
  );
  pruefe('die Taste M oeffnet sie', true);
  pruefe('sie listet jedes Mandala', zeilen.length === katalog.length,
    `${zeilen.length} Zeilen zu ${katalog.length} Mandalas`);
  pruefe('und am Anfang ist alles an', zeilen.every((z) => z.an));

  console.log('\nAbwaehlen wirkt und haelt:');
  await seite.click('#mandalaListe label[data-id="wabe"] input');
  await seite.waitForTimeout(200);
  const nachAbwahl = await seite.evaluate(async () => {
    const { mandalasAktive } = await import('/gemeinsam/visualmodi.js');
    return {
      aktiv: mandalasAktive(),
      gemerkt: JSON.parse(localStorage.getItem('djMandalas') ?? '[]'),
    };
  });
  pruefe('das Abgewaehlte laeuft nicht mehr mit',
    !nachAbwahl.aktiv.includes('wabe'), `${nachAbwahl.aktiv.length} aktiv`);
  pruefe('und die Wahl liegt im Browser, nicht nur im Kopf',
    !nachAbwahl.gemerkt.includes('wabe') && nachAbwahl.gemerkt.length === katalog.length - 1,
    `${nachAbwahl.gemerkt.length} gemerkt`);

  /*
   * Der Neustart ist der eigentliche Punkt. Eine Auswahl, die beim naechsten
   * Aufmachen wieder auf Anfang steht, ist keine - dann taste ich mich jeden
   * Abend von vorn heran.
   */
  await seite.evaluate(() =>
    localStorage.setItem('djMandalas', JSON.stringify(['stern12', 'linse6'])),
  );
  await seite.reload({ waitUntil: 'networkidle' });
  await seite.click('#startDemo');
  await seite.waitForSelector('#konsole:not([hidden])', { timeout: 120000 });
  const nachNeustart = await seite.evaluate(async () => {
    const { mandalasAktive } = await import('/gemeinsam/visualmodi.js');
    return mandalasAktive();
  });
  pruefe('nach dem Neuladen steht die Wahl noch',
    nachNeustart.length === 2 && nachNeustart.includes('stern12'),
    nachNeustart.join(', '));

  console.log('\nGanz leer geht nicht:');
  const leer = await seite.evaluate(async () => {
    const { mandalasSetzen, mandalasAktive } = await import('/gemeinsam/visualmodi.js');
    mandalasSetzen([]);
    return mandalasAktive();
  });
  pruefe('wer alles abwaehlt, behaelt eines', leer.length === 1, leer.join(', '));

  console.log('\nJede Faltung wird auch wirklich gezeichnet:');
  /*
   * Nicht "sie stuerzt nicht ab", sondern "sie sieht anders aus".
   *
   * Vierzehn Zweige im Schattierer, und ein vertippter Zweig faellt nicht auf:
   * Er zeichnet dann eben die Rosette, und die sieht gut aus. Verglichen wird
   * deshalb Bild gegen Bild - zwei Faltungen, die dasselbe liefern, waeren ein
   * Fehler, auch wenn beide huebsch sind.
   */
  await seite.evaluate(async () => {
    const { gpuZwingen, mandalasSetzen, streuungMessen } = await import('/gemeinsam/visualmodi.js');
    gpuZwingen(true);
    streuungMessen(true);
    mandalasSetzen((await import('/gemeinsam/visualmodi.js')).MANDALAS.map((m) => m.id));
    window.__dj.bild.modusSetzen('mandelbrot');
  });
  await seite.waitForTimeout(10000);

  const aufGpu = await seite.evaluate(() => window.__mandel?.aufGpu === true);
  if (!aufGpu) {
    console.log('    NICHT GEPRUEFT: kein WebGL2 in dieser Umgebung – die Faltungen' +
      ' leben nur im Schattierer, und ohne ihn gibt es nichts zu vergleichen.');
  } else {
    const abdruecke = [];
    for (const m of katalog) {
      /*
       * Erst warten, bis ueberhaupt etwas zu sehen ist.
       *
       * Die Fahrt geraet regelmaessig in eine Stelle tief im Inneren der
       * Menge, wo alles gleichmaessig dunkel ist - die Wache erkennt das und
       * setzt neu an, aber das dauert ein paar Sekunden. Wer in dieser Zeit
       * einen Abdruck nimmt, bekommt Schwarz, und zwei Mal Schwarz sind
       * natuerlich gleich. Genau so kam beim ersten Anlauf eine
       * zusammenhaengende Kette von zehn "identischen" Paaren heraus - kein
       * Fehler an den Faltungen, sondern eine dunkle Stelle der Fahrt.
       */
      const abdruck = await seite.evaluate(async (id) => {
        const { mandalaZwingen, mandelAbdruck } = await import('/gemeinsam/visualmodi.js');
        mandalaZwingen(id);
        const streuung = (feld) => {
          const mittel = feld.reduce((a, b) => a + b, 0) / feld.length;
          const q = feld.reduce((a, b) => a + (b - mittel) * (b - mittel), 0) / feld.length;
          return Math.sqrt(q);
        };
        const bis = Date.now() + 20000;
        let letzter = null;
        for (;;) {
          await new Promise((f) => setTimeout(f, 900));
          letzter = mandelAbdruck();
          if (!letzter) return null;
          if (streuung(letzter) > 3 || Date.now() > bis) break;
        }
        return { feld: letzter, lebendig: streuung(letzter) > 3 };
      }, m.id);
      abdruecke.push({ id: m.id, ...(abdruck ?? { feld: null, lebendig: false }) });
    }
    await seite.evaluate(async () => {
      const { mandalaZwingen } = await import('/gemeinsam/visualmodi.js');
      mandalaZwingen(null);
    });

    const fehlend = abdruecke.filter((a) => !a.feld);
    pruefe('von jeder Faltung kommt ein Bild an', fehlend.length === 0,
      fehlend.map((a) => a.id).join(', '));
    const tot = abdruecke.filter((a) => a.feld && !a.lebendig);
    pruefe(
      'und bei fast allen ist auch etwas darauf zu sehen',
      tot.length <= Math.ceil(abdruecke.length * 0.15),
      tot.length ? `${tot.length} landeten in einer dunklen Stelle: ${tot.map((a) => a.id).join(', ')}` : 'alle',
    );

    /*
     * Verglichen wird nur mit dem direkten Vorgaenger, nicht jeder mit jedem.
     *
     * Zwei Faltungen duerfen sich an einer bestimmten Stelle der Fahrt sehr
     * wohl aehneln - eine Rosette mit acht Achsen und eine mit zwoelf sind an
     * einer symmetrischen Stelle kaum zu unterscheiden. Was nicht vorkommen
     * darf, ist Bild fuer Bild dasselbe: Das hiesse, der Zweig im Schattierer
     * greift gar nicht.
     */
    const gleiche = [];
    for (let i = 1; i < abdruecke.length; i++) {
      // Nur lebendige Paare. Zwei dunkle Stellen sind gleich, und das sagt
      // ueber die Faltung nichts.
      if (!abdruecke[i - 1].lebendig || !abdruecke[i].lebendig) continue;
      const a = abdruecke[i - 1].feld;
      const b = abdruecke[i].feld;
      if (!a || !b) continue;
      let abweichung = 0;
      for (let k = 0; k < a.length; k++) abweichung += Math.abs(a[k] - b[k]);
      if (abweichung / a.length < 1) {
        gleiche.push(`${abdruecke[i - 1].id}=${abdruecke[i].id}`);
      }
    }
    pruefe('und keine zwei aufeinanderfolgenden liefern dasselbe Bild',
      gleiche.length === 0, gleiche.join(', '));
  }

  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
