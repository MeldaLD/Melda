// Abnahme fuer das Schachbrett.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/schachbrett.mjs
//
// Gerechnet wird nur die Haelfte der Bildpunkte, die andere Haelfte wird aus
// den vier Nachbarn ergaenzt. Zwischengespeichert wird dabei nicht die Farbe,
// sondern die Ausstiegszeit - die Farbe entsteht in jedem Bild neu, damit
// Palette, Farbversatz und Drop-Welle auf dem Schlag bleiben.
//
// Vier Zusagen:
//
//   1. Es wird wirklich halbiert. Ohne das ist alles andere gegenstandslos,
//      und "halb so viele Punkte" ist eine Zahl, die das Programm selbst
//      meldet - nicht eine Zeitmessung, die in dieser Umgebung ohnehin nichts
//      sagt (hier rechnet ein Nachbau in Software).
//   2. Das Bild bleibt erkennbar dasselbe. Nicht bitgleich - die ergaenzte
//      Haelfte ist gemittelt, das ist der Handel. Aber es darf nicht Grieß
//      werden, und deshalb wird der Unterschied beziffert statt behauptet.
//   3. Die Farbe lebt weiter. Das ist der eigentliche Zweck der Bauart: Wenn
//      das Schachbrett die Farbe einfrieren wuerde, waere die Musik aus dem
//      Bild heraus, und die Ersparnis waere den Preis nicht wert.
//   4. Umschalten mitten im Betrieb bricht nichts.

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
    console.log('\nNICHT GEPRUEFT: laeuft auf dem Hauptprozessor, dort gibt es kein Schachbrett.');
  } else {
    /*
     * Das Schachbrett braucht ein Gleitkomma-Ziel (EXT_color_buffer_float).
     * Fehlt es, bleibt der bisherige Weg - und das ist kein Fehler, sondern
     * der vorgesehene Rueckfall. Die Pruefung sagt dann, dass sie nicht
     * geprueft hat, statt gruen zu melden, was sie nicht gesehen hat.
     */
    const moeglich = await seite.evaluate(async () => {
      const { schachbrettSetzen } = await import('/gemeinsam/visualmodi.js');
      schachbrettSetzen(true);
      await new Promise((f) => setTimeout(f, 1200));
      return window.__mandel?.brett === true;
    });

    if (!moeglich) {
      console.log('\nNICHT GEPRUEFT: diese Karte kann keine Gleitkommaziele - der Rueckfall greift.');
    } else {
      console.log('\nEs wird wirklich halbiert:');
      const zahlen = await seite.evaluate(async () => {
        const { schachbrettSetzen } = await import('/gemeinsam/visualmodi.js');
        const messen = async () => {
          const proben = [];
          for (let i = 0; i < 25; i++) {
            await new Promise((f) => requestAnimationFrame(f));
            const m = window.__mandel;
            if (m?.punkte) proben.push({ punkte: m.punkte, breite: m.breite, hoehe: m.hoehe });
          }
          return proben[proben.length - 1];
        };
        schachbrettSetzen(false);
        await new Promise((f) => setTimeout(f, 1500));
        const ohne = await messen();
        schachbrettSetzen(true);
        await new Promise((f) => setTimeout(f, 1500));
        const mit = await messen();
        return { ohne, mit };
      });
      const anteil = zahlen.mit.punkte / (zahlen.mit.breite * zahlen.mit.hoehe);
      pruefe(
        'mit Schachbrett wird rund die Haelfte der Flaeche gerechnet',
        anteil > 0.45 && anteil < 0.55,
        `${(anteil * 100).toFixed(1)} % von ${zahlen.mit.breite}x${zahlen.mit.hoehe}`,
      );
      pruefe(
        'ohne Schachbrett die ganze',
        Math.abs(zahlen.ohne.punkte / (zahlen.ohne.breite * zahlen.ohne.hoehe) - 1) < 0.01,
      );

      console.log('\nDas Bild bleibt dasselbe Bild:');
      /*
       * Verglichen wird bei *stehender* Fahrt, sonst misst man die Fahrt und
       * nicht das Schachbrett. Genommen wird der interne Abzug - die
       * WebGL-Leinwand selbst ist nach dem Zusammensetzen leer.
       */
      const bilder = await seite.evaluate(async () => {
        const { schachbrettSetzen, mandelAbdruck, mandalaZwingen } =
          await import('/gemeinsam/visualmodi.js');
        mandalaZwingen('rosette6');
        // Ein Raster, das feiner ist als das gerechnete Bild: Dann faellt auf
        // jede Zelle hoechstens ein Bildpunkt, und verglichen wird punktweise
        // statt ueber Mittelwerte. Grieß wuerde in einem groben Raster
        // verschwinden - und genau danach wird hier gesucht.
        const holen = async () => {
          for (let i = 0; i < 6; i++) await new Promise((f) => requestAnimationFrame(f));
          return mandelAbdruck(240, 160);
        };
        const abstand = (a, x) => {
          if (!a || !x || a.length !== x.length) return null;
          // Leere Zellen zaehlen nicht mit - sie sind in beiden null und
          // wuerden den Unterschied nur verduennen.
          let summe = 0, arg = 0, punkte = 0;
          for (let i = 0; i < a.length; i++) {
            if (a[i] === 0 && x[i] === 0) continue;
            const d = Math.abs(a[i] - x[i]);
            summe += d;
            if (d > 40) arg++;
            punkte++;
          }
          return punkte ? { mittel: summe / punkte, argAnteil: arg / punkte, punkte } : null;
        };

        /*
         * Die Kontrolle, ohne die die ganze Messung wertlos waere.
         *
         * Zwischen zwei Abzuegen laeuft die Fahrt weiter - der Zoom rueckt
         * vor, die Palette wandert, die Drehung dreht. Ein Unterschied
         * zwischen "ohne" und "mit" enthaelt also beides: das Schachbrett und
         * die verstrichene Zeit. Deshalb wird zuerst gemessen, wieviel allein
         * die Zeit ausmacht - zwei Abzuege im selben Abstand, beide ohne
         * Schachbrett. Erst der Ueberschuss darueber gehoert dem Schachbrett.
         */
        schachbrettSetzen(false);
        await new Promise((f) => setTimeout(f, 900));
        const a1 = await holen();
        await new Promise((f) => setTimeout(f, 900));
        const a2 = await holen();
        const nurZeit = abstand(a1, a2);

        schachbrettSetzen(true);
        await new Promise((f) => setTimeout(f, 900));
        const mit = await holen();
        const zeitUndBrett = abstand(a2, mit);
        return { nurZeit, zeitUndBrett };
      });

      if (!bilder?.nurZeit || !bilder?.zeitUndBrett) {
        pruefe('vergleichbare Abzuege', false, 'keine bekommen');
      } else {
        const z = bilder.nurZeit, zb = bilder.zeitUndBrett;
        console.log(
          `  (Kontrolle: allein die verstrichene Zeit macht ${z.mittel.toFixed(1)} von 255 aus)`,
        );
        /*
         * Der Massstab ist nicht Gleichheit. Die ergaenzte Haelfte ist ein
         * Mittel aus vier Nachbarn - in den fein verzweigten Gegenden ist das
         * zwangslaeufig anders, und dort mittelt der Schattierer ohnehin
         * schon selbst. Was nicht passieren darf: dass das Schachbrett das
         * Bild staerker veraendert als eine ganze Sekunde Fahrt.
         */
        pruefe(
          'das Schachbrett aendert weniger als eine Sekunde Fahrt',
          zb.mittel < z.mittel * 1.6,
          `${zb.mittel.toFixed(1)} gegen ${z.mittel.toFixed(1)} von 255`,
        );
        pruefe(
          'und der Anteil stark abweichender Zellen bleibt in derselben Groessenordnung',
          zb.argAnteil < Math.max(0.08, z.argAnteil * 1.8),
          `${(zb.argAnteil * 100).toFixed(1)} % gegen ${(z.argAnteil * 100).toFixed(1)} %`,
        );
      }

      console.log('\nDas Bild bleibt ein Bild und wird keine Flaeche:');
      /*
       * Der Fehler, um den es hier geht, war auf einem iPad zu sehen: Mit
       * Schachbrett wurde das ganze Bild eine flache Farbflaeche, vom Mandala
       * blieb nichts uebrig. Die Ursache lag im halben Puffer - er blieb
       * leer, weil die Karte zwar EXT_color_buffer_float meldet, aber keinen
       * vollstaendigen Rahmenpuffer mit einem Gleitkommaziel zustande bringt.
       * Der Aufloesedurchgang liest dann ueberall Nullen, haelt jeden Punkt
       * fuer einen Innenpunkt und faerbt ihn mit der ersten Farbe der
       * Palette.
       *
       * Geprueft wird deshalb nicht "sieht aehnlich aus", sondern das
       * Einfachste, was diesen Fall ausschliesst: Steht ueberhaupt noch
       * Struktur im Bild? Eine Flaeche hat keine Streuung.
       */
      const streuung = await seite.evaluate(async () => {
        const { schachbrettSetzen, mandelAbdruck } = await import('/gemeinsam/visualmodi.js');
        const messen = async () => {
          for (let i = 0; i < 10; i++) await new Promise((f) => requestAnimationFrame(f));
          const a = mandelAbdruck(120, 80);
          if (!a) return null;
          const echte = a.filter((x) => x > 0);
          if (echte.length < 100) return null;
          const mittel = echte.reduce((s, x) => s + x, 0) / echte.length;
          const varianz = echte.reduce((s, x) => s + (x - mittel) ** 2, 0) / echte.length;
          return Math.sqrt(varianz);
        };
        schachbrettSetzen(false);
        await new Promise((f) => setTimeout(f, 1200));
        const ohne = await messen();
        schachbrettSetzen(true);
        await new Promise((f) => setTimeout(f, 1200));
        const mit = await messen();
        return { ohne, mit };
      });
      if (!streuung?.ohne || !streuung?.mit) {
        pruefe('Streuung messbar', false, 'kein brauchbarer Abzug');
      } else {
        pruefe(
          'mit Schachbrett steht noch Struktur im Bild',
          streuung.mit > streuung.ohne * 0.5,
          `Streuung ${streuung.mit.toFixed(1)} gegen ${streuung.ohne.toFixed(1)}`,
        );
      }

      console.log('\nDie Farbe lebt weiter - der eigentliche Zweck der Bauart:');
      /*
       * Das ist die Zusage, an der alles haengt. Wenn das Schachbrett die
       * Farbe mit einfriert, ist die Musik aus dem Bild heraus. Gemessen wird
       * bei *eingeschaltetem* Schachbrett, ob sich das Bild von einem Bild
       * zum naechsten ueberhaupt noch aendert - und zwar in derselben
       * Groessenordnung wie ohne.
       */
      const leben = await seite.evaluate(async () => {
        const { schachbrettSetzen, mandelAbdruck } = await import('/gemeinsam/visualmodi.js');
        const messen = async () => {
          const abzuege = [];
          for (let k = 0; k < 6; k++) {
            for (let i = 0; i < 3; i++) await new Promise((f) => requestAnimationFrame(f));
            const q = mandelAbdruck(120, 80);
            if (q) abzuege.push(q);
          }
          let summe = 0, paare = 0;
          for (let k = 1; k < abzuege.length; k++) {
            const a = abzuege[k - 1], b = abzuege[k];
            if (a.length !== b.length) continue;
            let s = 0;
            for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
            summe += s / a.length;
            paare++;
          }
          return paare ? summe / paare : 0;
        };
        schachbrettSetzen(false);
        await new Promise((f) => setTimeout(f, 900));
        const ohne = await messen();
        schachbrettSetzen(true);
        await new Promise((f) => setTimeout(f, 900));
        const mit = await messen();
        return { ohne, mit };
      });
      pruefe(
        'das Bild bewegt sich mit Schachbrett noch',
        leben.mit > 0.5,
        `${leben.mit.toFixed(2)} Stufen je Bild`,
      );
      pruefe(
        'und ungefaehr so stark wie ohne',
        leben.ohne <= 0 || leben.mit / leben.ohne > 0.5,
        `mit ${leben.mit.toFixed(2)} gegen ohne ${leben.ohne.toFixed(2)}`,
      );

      console.log('\nUmschalten im Betrieb bricht nichts:');
      const heil = await seite.evaluate(async () => {
        const { schachbrettSetzen } = await import('/gemeinsam/visualmodi.js');
        for (let i = 0; i < 6; i++) {
          schachbrettSetzen(i % 2 === 0);
          await new Promise((f) => setTimeout(f, 250));
        }
        schachbrettSetzen(false);
        await new Promise((f) => setTimeout(f, 400));
        return window.__mandel?.aufGpu === true;
      });
      pruefe('nach sechs Wechseln rechnet die Karte immer noch', heil);
    }
  }

  console.log('');
  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
