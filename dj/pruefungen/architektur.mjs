// Abnahme fuer die Architekturschicht.
//
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/architektur.mjs
//
// Geprueft wird an einer erfundenen Fassade mit zwei Fenstern, einer Tuer,
// einer Kante und einer Totzone - und zwar das, was sich messen laesst:
//
//   1. Ohne Einmessung passiert nichts. Wieder die wichtigste Eigenschaft.
//   2. Die Rahmen leuchten auf den Schlag, und zwar staerker auf der Eins.
//   3. Aus der Tuer kommt etwas, und es steigt nach oben.
//   4. Der Drop zuendet alles an - messbar heller als ein gewoehnlicher Schlag.
//   5. Die Welle laeuft von links nach rechts und nicht in Klickreihenfolge.
//   6. Totzonen bleiben schwarz. Auch mitten im Drop.
//   7. Es kostet fast nichts.

import { chromium } from 'playwright';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
const CHROM = process.env.CHROMIUM_PFAD;

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

const browser = await chromium.launch({ ...(CHROM ? { executablePath: CHROM } : {}) });
const seite = await browser.newPage({ viewport: { width: 900, height: 600 } });
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => { if (n.type() === 'error') konsole.push(n.text()); });

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });

  await seite.evaluate(async () => {
    const { buehnenbildBauen } = await import('/gemeinsam/buehnenbild.js');
    const { Architektur } = await import('/gemeinsam/architektur.js');

    /*
     * Eine Fassade mit bekannten Plaetzen. Die beiden Fenster liegen bewusst
     * *nicht* in Klickreihenfolge von links nach rechts - so faellt auf, wenn
     * die Welle der Reihenfolge im Datensatz folgt statt der Lage im Bild.
     */
    window.__MESSUNG = {
      fassung: 1,
      beamer: { breite: 1920, hoehe: 1080 },
      fotoSeitenverhaeltnis: 16 / 9,
      marken: [[0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95]],
      markenImBeamer: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]],
      bereiche: [
        { art: 'fenster', name: 'rechts', punkte: [[0.70, 0.25], [0.84, 0.25], [0.84, 0.45], [0.70, 0.45]] },
        { art: 'fenster', name: 'links', punkte: [[0.16, 0.25], [0.30, 0.25], [0.30, 0.45], [0.16, 0.45]] },
        { art: 'tuer', name: 'Tür', punkte: [[0.45, 0.62], [0.56, 0.62], [0.56, 0.92], [0.45, 0.92]] },
        { art: 'kante', name: 'Sims', punkte: [[0.10, 0.55], [0.90, 0.55], [0.90, 0.57], [0.10, 0.57]] },
        { art: 'tot', name: 'Totzone', punkte: [[0.02, 0.70], [0.20, 0.70], [0.20, 0.90], [0.02, 0.90]] },
      ],
    };

    const B = 640;
    const H = 360;
    const lein = document.createElement('canvas');
    lein.width = B; lein.height = H;
    const stift = lein.getContext('2d', { willReadFrequently: true });

    window.__probe = {
      Architektur, buehnenbildBauen, stift, lein, B, H,
      /**
       * Bilder rechnen und dabei die Helligkeit an bestimmten Stellen messen.
       * Gemessen wird auf der Leinwand, nicht am inneren Stand - was zaehlt,
       * ist, was ankommt.
       */
      lauf(bilder, messung, grund = {}, bei = null) {
        const bild = buehnenbildBauen(messung, 1920, 1080);
        const a = new Architektur(bild);
        const dt = 1 / 60;
        const proben = [];
        for (let i = 0; i < bilder; i++) {
          const beat = (i * dt * 124) / 60;
          const lage = {
            sekunden: dt,
            takt: {
              beat, bpm: 124, imBeat: beat - Math.floor(beat), nummer: Math.floor(beat),
              aufEins: Math.floor(beat) % 4 === 0, aufPhrase: Math.floor(beat) % 32 === 0,
            },
            wucht: 0.7, spannung: 0, abbau: 0, drop: false,
            /*
             * Die *echte* Form der Palette: ein Objekt mit `toene` und
             * `hell`, und Farben als rgb(r g b). Der erste Anlauf gab ein
             * Feld aus Hexfarben - dieselbe falsche Annahme, die auch im
             * Zeichner steckte, und deshalb hat die Abnahme sie bestaetigt
             * statt sie zu finden. Am Ende hat es erst der laufende Browser
             * gezeigt: hundert unlesbare Farben je Sekunde.
             */
            palette: {
              name: 'Pruefpalette', grundton: 250, akzent: 200, baender: 5,
              toene: ['rgb(70 80 200)', 'rgb(90 60 210)', 'rgb(60 180 220)', 'rgb(40 60 160)'],
              hell: 'rgb(220 235 255)',
            },
            ...grund,
          };
          if (bei) bei(lage, i, beat);
          stift.clearRect(0, 0, B, H);
          a.zeichnen(stift, B, H, lage);
          proben.push({ i, beat, ...a.stand(), helligkeit: window.__probe.messen() });
        }
        return { proben, arch: a };
      },
      /** Mittlere Helligkeit in einem Kasten, in Anteilen. */
      hell(x0, y0, x1, y1) {
        const d = stift.getImageData(
          Math.round(x0 * B), Math.round(y0 * H),
          Math.max(1, Math.round((x1 - x0) * B)), Math.max(1, Math.round((y1 - y0) * H)),
        ).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) * (d[i + 3] / 255);
        return s / (d.length / 4) / 3 / 255;
      },
      messen() {
        return {
          ganz: window.__probe.hell(0, 0, 1, 1),
          fensterLinks: window.__probe.hell(0.15, 0.24, 0.31, 0.46),
          fensterRechts: window.__probe.hell(0.69, 0.24, 0.85, 0.46),
          ueberDerTuer: window.__probe.hell(0.44, 0.40, 0.57, 0.60),
          totzone: window.__probe.hell(0.04, 0.72, 0.18, 0.88),
        };
      },
    };
  });

  console.log('\nOhne Einmessung passiert nichts:');
  {
    const r = await seite.evaluate(() => {
      const { proben } = window.__probe.lauf(60, null);
      return { taetig: proben[0].taetig, hell: Math.max(...proben.map((p) => p.helligkeit.ganz)) };
    });
    pruefe('die Schicht ist untaetig', r.taetig === false);
    pruefe('und die Leinwand bleibt leer', r.hell < 1e-6, r.hell.toExponential(1));
  }

  console.log('\nDie Rahmen leuchten auf den Schlag:');
  {
    const r = await seite.evaluate(() => {
      const { proben } = window.__probe.lauf(240, window.__MESSUNG);
      // Je Bild: wie weit ist es seit dem letzten Schlag, und wie hell ist es?
      const nachEins = [];
      const nachAndere = [];
      for (const p of proben.slice(60)) {
        const bruch = p.beat - Math.floor(p.beat);
        if (bruch > 0.25) continue;
        (Math.floor(p.beat) % 4 === 0 ? nachEins : nachAndere).push(p.helligkeit.ganz);
      }
      const mit = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
      const alle = proben.slice(60).map((p) => p.helligkeit.ganz);
      return {
        eins: mit(nachEins), andere: mit(nachAndere),
        hoechst: Math.max(...alle), tiefst: Math.min(...alle),
      };
    });
    pruefe('es ist ueberhaupt etwas zu sehen', r.hoechst > 0.002, r.hoechst.toFixed(5));
    pruefe('und es pulsiert', r.hoechst > r.tiefst * 1.25,
      `${r.tiefst.toFixed(5)} bis ${r.hoechst.toFixed(5)}`);
    /*
     * Die Eins muss heller sein als die uebrigen Schlaege. Ohne diesen
     * Unterschied waere es ein gleichfoermiges Blinken - und genau das ist
     * beim Schatten-DJ zu Recht durchgefallen.
     */
    pruefe('die Eins ist heller als die anderen Schlaege', r.eins > r.andere * 1.08,
      `${r.eins.toFixed(5)} gegen ${r.andere.toFixed(5)}`);
  }

  console.log('\nAus der Tuer kommt etwas, und es steigt:');
  {
    const r = await seite.evaluate(() => {
      const { proben } = window.__probe.lauf(300, window.__MESSUNG, { wucht: 0.9 });
      const spaet = proben.slice(120);
      return {
        teilchen: Math.max(...proben.map((p) => p.teilchen)),
        ueberDerTuer: Math.max(...spaet.map((p) => p.helligkeit.ueberDerTuer)),
        // Und in Ruhe: bei wenig Wucht soll fast nichts kommen.
        ruhe: Math.max(...window.__probe.lauf(300, window.__MESSUNG, { wucht: 0.12, abbau: 0.8 })
          .proben.map((p) => p.teilchen)),
      };
    });
    pruefe('es kommen Teilchen heraus', r.teilchen > 5, `${r.teilchen} gleichzeitig`);
    pruefe('sie werden ueber der Tuer sichtbar', r.ueberDerTuer > 0.001, r.ueberDerTuer.toFixed(5));
    pruefe('im Breakdown bleibt es fast still', r.ruhe < r.teilchen * 0.4,
      `${r.ruhe} statt ${r.teilchen}`);
  }

  console.log('\nDer Drop zuendet die ganze Fassade an:');
  {
    const r = await seite.evaluate(() => {
      const ohne = window.__probe.lauf(180, window.__MESSUNG);
      const mit = window.__probe.lauf(180, window.__MESSUNG, {}, (lage, i) => {
        if (i === 90) lage.drop = true;
        if (i > 90) lage.wucht = 0.95;
      });
      return {
        ohne: Math.max(...ohne.proben.map((p) => p.helligkeit.ganz)),
        mit: Math.max(...mit.proben.slice(90, 130).map((p) => p.helligkeit.ganz)),
        teilchenVorher: mit.proben[89].teilchen,
        teilchenNachher: Math.max(...mit.proben.slice(90, 120).map((p) => p.teilchen)),
      };
    });
    pruefe('der Drop ist deutlich heller als ein Schlag', r.mit > r.ohne * 1.6,
      `${r.mit.toFixed(5)} gegen ${r.ohne.toFixed(5)}`);
    pruefe('und die Tuer stoesst dabei aus',
      r.teilchenNachher > r.teilchenVorher + 10,
      `${r.teilchenVorher} auf ${r.teilchenNachher}`);
  }

  console.log('\nDie Welle laeuft von links nach rechts:');
  {
    /*
     * Der eigentliche Punkt: In der Messung steht das *rechte* Fenster an
     * erster Stelle. Liefe die Welle in Klickreihenfolge, wuerde rechts vor
     * links aufleuchten - und niemand saehe eine Welle, sondern ein Springen.
     */
    const r = await seite.evaluate(() => {
      /*
       * Lang genug rechnen, dass die Phrasengrenze wirklich vorkommt.
       *
       * Der erste Anlauf nahm 320 Bilder - das sind bei 124 Schlaegen je
       * Minute aber nur elf Schlaege, und die Grenze liegt bei 32. Der Filter
       * lieferte eine leere Liste, und die Pruefung meldete brav "kein Licht".
       * Sie hatte recht: Es *war* keins da, weil der Lauf vorher zu Ende war.
       *
       * 1100 Bilder sind 18,3 Sekunden und damit 37 Schlaege.
       */
      const { proben } = window.__probe.lauf(1100, window.__MESSUNG, { wucht: 0.8 });
      const nachPhrase = proben.filter((p) => p.beat >= 32 && p.beat < 36);
      const spitze = (name) => {
        let besteZeit = null;
        let bester = 0;
        for (const p of nachPhrase) {
          if ((p.licht[name] ?? 0) > bester) { bester = p.licht[name]; besteZeit = p.beat; }
        }
        return { zeit: besteZeit, wert: bester };
      };
      return { links: spitze('links'), rechts: spitze('rechts') };
    });
    pruefe('beide Fenster werden von der Welle erwischt',
      r.links.wert > 0 && r.rechts.wert > 0,
      `links ${r.links.wert?.toFixed(3)}, rechts ${r.rechts.wert?.toFixed(3)}`);
    pruefe('und das linke Fenster zuerst - trotz umgekehrter Reihenfolge im Datensatz',
      r.links.zeit < r.rechts.zeit,
      `links bei Schlag ${r.links.zeit?.toFixed(2)}, rechts bei ${r.rechts.zeit?.toFixed(2)}`);
  }

  console.log('\nTotzonen bleiben schwarz:');
  {
    const r = await seite.evaluate(() => {
      const { proben } = window.__probe.lauf(180, window.__MESSUNG, { wucht: 1 }, (lage, i) => {
        if (i === 60) lage.drop = true;
        if (i > 60) lage.wucht = 1;
      });
      return Math.max(...proben.map((p) => p.helligkeit.totzone));
    });
    pruefe('auch mitten im Drop kommt dort nichts an', r < 1e-6, r.toExponential(1));
  }

  console.log('\nUnd es kostet fast nichts:');
  {
    const r = await seite.evaluate(() => {
      const bild = window.__probe.buehnenbildBauen(window.__MESSUNG, 1920, 1080);
      const a = new window.__probe.Architektur(bild);
      const lage = {
        sekunden: 1 / 60, wucht: 0.9, spannung: 0.5, abbau: 0, drop: false,
        takt: { beat: 8, bpm: 124, imBeat: 0, nummer: 8, aufEins: true, aufPhrase: false },
        /*
             * Die *echte* Form der Palette: ein Objekt mit `toene` und
             * `hell`, und Farben als rgb(r g b). Der erste Anlauf gab ein
             * Feld aus Hexfarben - dieselbe falsche Annahme, die auch im
             * Zeichner steckte, und deshalb hat die Abnahme sie bestaetigt
             * statt sie zu finden. Am Ende hat es erst der laufende Browser
             * gezeigt: hundert unlesbare Farben je Sekunde.
             */
            palette: {
              name: 'Pruefpalette', grundton: 250, akzent: 200, baender: 5,
              toene: ['rgb(70 80 200)', 'rgb(90 60 210)', 'rgb(60 180 220)', 'rgb(40 60 160)'],
              hell: 'rgb(220 235 255)',
            },
      };
      // Erst einschwingen lassen, damit Teilchen unterwegs sind.
      for (let i = 0; i < 300; i++) a.zeichnen(window.__probe.stift, 640, 360, lage);
      const start = performance.now();
      const n = 400;
      for (let i = 0; i < n; i++) a.zeichnen(window.__probe.stift, 640, 360, lage);
      return { ms: (performance.now() - start) / n, teilchen: a.teilchen.length };
    });
    /*
     * 0,8 ms ist dieselbe Grenze wie beim Schatten-DJ, und aus demselben
     * Grund: Ein 60-Hz-Bild hat 16,7 ms, davon gehoert der Loewenanteil dem
     * Mandala. Gemessen hier ohne Grafikkarte.
     */
    pruefe('unter 0,8 ms je Bild, hier ohne Grafikkarte gemessen', r.ms < 0.8,
      `${r.ms.toFixed(3)} ms bei ${r.teilchen} Teilchen`);
  }

  console.log('');
  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlles gruen.');
process.exit(fehler ? 1 : 0);
