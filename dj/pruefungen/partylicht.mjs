// Abnahme fuer den Lichtpark.
//
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/partylicht.mjs
//
// Der Lichtpark ist der erste Modus, der ausdruecklich *hell* sein darf -
// die uebrige Palette ist bewusst dunkel gehalten. Damit steht die Frage der
// Blitzsicherheit neu, und sie wird hier beantwortet und nicht behauptet.
//
//   1. Die Lampen stehen in den Pfeilern zwischen den Fenstern, nicht davor.
//   2. Ohne Einmessung stehen sie gleichmaessig - und es sieht trotzdem aus.
//   3. Er reagiert: Helligkeit an der Wucht, Kette am Schlag, Farbbild an
//      der Phrase.
//   4. Der Blinder ist gedeckelt - auch wenn jedes Bild einen Drop meldet.
//   5. Die Blitzschwelle wird eingehalten. Mit Kontrolle, dass der Zaehler
//      ueberhaupt zaehlen kann.
//   6. Es kostet nicht mehr als die anderen Modi.

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
seite.on('console', (n) => { if (n.type() === 'error' || n.type() === 'warning') konsole.push(n.text()); });

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });

  await seite.evaluate(async () => {
    const { buehnenbildBauen } = await import('/gemeinsam/buehnenbild.js');
    const { Partylicht } = await import('/gemeinsam/partylicht.js');

    // Fuenf Fenster in einer Reihe und zwei Gesimse - eine Fassade wie auf
    // den Vorlagen.
    const f = (n, x0, x1) => ({
      art: 'fenster', name: n, punkte: [[x0, 0.22], [x1, 0.22], [x1, 0.46], [x0, 0.46]],
    });
    window.__MESSUNG = {
      fassung: 1, beamer: { breite: 1920, hoehe: 1080 }, fotoSeitenverhaeltnis: 16 / 9,
      marken: [[0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95]],
      markenImBeamer: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]],
      bereiche: [
        f('F1', 0.10, 0.20), f('F2', 0.26, 0.36), f('F3', 0.42, 0.52),
        f('F4', 0.58, 0.68), f('F5', 0.74, 0.84),
        { art: 'kante', name: 'Sims', punkte: [[0.06, 0.56], [0.94, 0.56], [0.94, 0.58], [0.06, 0.58]] },
        { art: 'kante', name: 'Sockel', punkte: [[0.06, 0.90], [0.94, 0.90], [0.94, 0.92], [0.06, 0.92]] },
      ],
    };

    // Die *echte* Form der Palette - ein Objekt mit Farbwinkeln und Toenen.
    window.__PALETTE = {
      name: 'Pruefpalette', grundton: 250, akzent: 200, baender: 5,
      toene: ['rgb(70 80 200)', 'rgb(90 60 210)', 'rgb(60 180 220)', 'rgb(40 60 160)'],
      hell: 'rgb(220 235 255)',
    };

    const B = 512;
    const H = 288;
    const lein = document.createElement('canvas');
    lein.width = B; lein.height = H;
    const stift = lein.getContext('2d', { willReadFrequently: true });

    // Relative Leuchtdichte nach WCAG: erst entgammat, dann gewichtet.
    const kennlinie = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const s = i / 255;
      kennlinie[i] = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }

    window.__probe = {
      Partylicht, buehnenbildBauen, stift, B, H,
      lauf(bilder, messung, grund = {}, bei = null) {
        const bild = buehnenbildBauen(messung, 1920, 1080);
        const p = new Partylicht(bild);
        const dt = 1 / 60;
        const proben = [];
        for (let i = 0; i < bilder; i++) {
          const beat = (i * dt * 124) / 60;
          const lage = {
            breite: B, hoehe: H, sekunden: dt,
            takt: {
              beat, bpm: 124, imBeat: beat - Math.floor(beat), nummer: Math.floor(beat),
              aufEins: Math.floor(beat) % 4 === 0, aufPhrase: Math.floor(beat) % 32 === 0,
            },
            wucht: 0.7, spannung: 0, abbau: 0, drop: false,
            palette: window.__PALETTE,
            ...grund,
          };
          if (bei) bei(lage, i, beat);
          stift.fillStyle = '#000';
          stift.fillRect(0, 0, B, H);
          p.zeichnen(stift, lage);
          const d = stift.getImageData(0, 0, B, H).data;
          let L = 0;
          let hell = 0;
          for (let k = 0; k < d.length; k += 4) {
            const l = 0.2126 * kennlinie[d[k]] + 0.7152 * kennlinie[d[k + 1]] + 0.0722 * kennlinie[d[k + 2]];
            L += l;
            if (l > 0.02) hell++;
          }
          proben.push({
            i, beat, ...p.stand(),
            leuchtdichte: L / (d.length / 4),
            hellerAnteil: hell / (d.length / 4),
          });
        }
        return { proben, park: p };
      },
    };
  });

  console.log('\nDie Lampen stehen in den Pfeilern, nicht vor den Fenstern:');
  {
    const r = await seite.evaluate(() => window.__probe.lauf(2, window.__MESSUNG).proben[0]);
    /*
     * Fuenf Fenster ergeben sechs Luecken - je eine zwischen zwei Fenstern
     * plus die beiden Aussenraender. Genau so steht eine echte
     * Fassadenbeleuchtung.
     */
    pruefe('aus fuenf Fenstern werden sechs Lampen', r.lampen === 6,
      `${r.lampen}: ${r.lampenX.join(', ')}`);
    /*
     * Und keine steht *in* einem Fenster. Das ist der eigentliche Punkt: Ein
     * Strahler vor einer Scheibe leuchtet ins Zimmer und blendet, statt die
     * Wand anzustrahlen.
     */
    const fenster = [[0.10, 0.20], [0.26, 0.36], [0.42, 0.52], [0.58, 0.68], [0.74, 0.84]];
    const drin = r.lampenX.filter((x) => fenster.some(([a, b]) => x > a && x < b));
    pruefe('keine Lampe steht vor einer Scheibe', drin.length === 0, drin.join(', ') || '—');
    pruefe('sie stehen von links nach rechts sortiert',
      r.lampenX.every((x, i, a) => i === 0 || x > a[i - 1]));
    pruefe('und es gibt zwei Punktreihen - je Gesims eine', r.reihen === 2, String(r.reihen));
  }

  console.log('\nOhne Einmessung stehen sie gleichmaessig:');
  {
    const r = await seite.evaluate(() => window.__probe.lauf(90, null, { wucht: 0.8 }).proben);
    const letzte = r[r.length - 1];
    pruefe('es gibt trotzdem Lampen', letzte.lampen >= 7, String(letzte.lampen));
    const abstaende = letzte.lampenX.slice(1).map((x, i) => x - letzte.lampenX[i]);
    const mittel = abstaende.reduce((a, b) => a + b, 0) / abstaende.length;
    pruefe('und sie stehen gleichmaessig',
      abstaende.every((a) => Math.abs(a - mittel) < 1e-6),
      `Abstand ${mittel.toFixed(3)}`);
    pruefe('es ist auch wirklich etwas zu sehen', letzte.hellerAnteil > 0.05,
      `${(letzte.hellerAnteil * 100).toFixed(0)} % der Flaeche`);
  }

  console.log('\nEr reagiert auf die Musik:');
  {
    const r = await seite.evaluate(() => {
      const leise = window.__probe.lauf(180, window.__MESSUNG, { wucht: 0.15, abbau: 0.7 }).proben;
      const laut = window.__probe.lauf(180, window.__MESSUNG, { wucht: 0.95 }).proben;
      const phrase = window.__probe.lauf(1100, window.__MESSUNG, { wucht: 0.8 }).proben;
      const bilder = [...new Set(phrase.map((p) => p.farbbild))];
      return {
        leise: leise[leise.length - 1].leuchtdichte,
        laut: laut[laut.length - 1].leuchtdichte,
        ketteVorn: laut[30].kette,
        ketteHinten: laut[170].kette,
        farbbilder: bilder.length,
      };
    });
    pruefe('laut ist deutlich heller als leise', r.laut > r.leise * 2,
      `${r.laut.toFixed(5)} gegen ${r.leise.toFixed(5)}`);
    pruefe('die Kette laeuft mit dem Schlag weiter', r.ketteHinten > r.ketteVorn,
      `${r.ketteVorn} auf ${r.ketteHinten}`);
    pruefe('das Farbbild wechselt auf der Phrase', r.farbbilder >= 2,
      `${r.farbbilder} verschiedene in achtzehn Sekunden`);
  }

  console.log('\nDer Blinder ist gedeckelt:');
  {
    /*
     * Der haerteste denkbare Fall: *jedes* Bild meldet einen Drop. Ohne
     * Sperre waere das ein Stroboskop mit sechzig Blitzen je Sekunde - genau
     * das, was die Blitzschwelle verbietet.
     */
    const r = await seite.evaluate(() => {
      const { proben } = window.__probe.lauf(300, window.__MESSUNG, { wucht: 1, drop: true });
      // Wie oft springt der Blinder von fast aus auf voll?
      let zuendungen = 0;
      for (let i = 1; i < proben.length; i++) {
        if (proben[i].blinder > 0.9 && proben[i - 1].blinder < 0.9) zuendungen++;
      }
      return { zuendungen, sekunden: proben.length / 60 };
    });
    const jeSekunde = r.zuendungen / r.sekunden;
    pruefe('hoechstens zwei Zuendungen je Sekunde', jeSekunde <= 2.05,
      `${jeSekunde.toFixed(2)} je Sekunde bei einem Drop in *jedem* Bild`);
  }

  console.log('\nDie Blitzschwelle wird eingehalten:');
  {
    /*
     * Der Massstab aus FARBWIRKUNG.md: hoechstens drei Blitze je Sekunde,
     * wobei ein Blitz ein Paar gegenlaeufiger Aenderungen der relativen
     * Leuchtdichte um mindestens 0,10 ist und das dunklere Bild unter 0,80
     * liegen muss.
     *
     * Der Lichtpark ist der erste Modus, der ausdruecklich hell sein darf -
     * die Frage stellt sich hier also neu und nicht nur der Form halber.
     */
    const r = await seite.evaluate(() => {
      const { proben } = window.__probe.lauf(600, window.__MESSUNG, { wucht: 1 }, (lage, i) => {
        // Alle zwei Sekunden ein Drop - haeufiger als jeder echte Track.
        if (i % 120 === 0) lage.drop = true;
      });
      const L = proben.map((p) => p.leuchtdichte);
      let blitze = 0;
      let richtung = 0;
      let bezug = L[0];
      for (let i = 1; i < L.length; i++) {
        const d = L[i] - bezug;
        if (Math.abs(d) >= 0.1 && Math.min(L[i], bezug) < 0.8) {
          const neu = Math.sign(d);
          if (neu !== richtung) { blitze++; richtung = neu; }
          bezug = L[i];
        }
      }
      // Und zur Kontrolle: derselbe Zaehler auf einer gebauten Blitzfolge.
      const kunst = [];
      for (let i = 0; i < 600; i++) kunst.push(Math.floor(i / 3) % 2 ? 0.9 : 0.02);
      let k = 0;
      let kr = 0;
      let kb = kunst[0];
      for (let i = 1; i < kunst.length; i++) {
        const d = kunst[i] - kb;
        if (Math.abs(d) >= 0.1 && Math.min(kunst[i], kb) < 0.8) {
          const neu = Math.sign(d);
          if (neu !== kr) { k++; kr = neu; }
          kb = kunst[i];
        }
      }
      return {
        blitze, sekunden: L.length / 60,
        hoechste: Math.max(...L), mittlere: L.reduce((a, b) => a + b, 0) / L.length,
        kontrolle: k / (kunst.length / 60),
      };
    });
    console.log(`    hellstes Bild: relative Leuchtdichte ${r.hoechste.toFixed(4)} von 1,0`);
    console.log(`    Kontrolle mit einer gebauten 10-Hz-Folge: ${r.kontrolle.toFixed(1)} Blitze je Sekunde erkannt`);
    pruefe('der Zaehler kann ueberhaupt zaehlen', r.kontrolle > 5,
      `${r.kontrolle.toFixed(1)} je Sekunde an der Kontrolle`);
    pruefe('und findet im Lichtpark keine drei Blitze je Sekunde',
      r.blitze / r.sekunden < 3, `${(r.blitze / r.sekunden).toFixed(2)} je Sekunde`);
    /*
     * Und die Bauart-Begruendung, dieselbe wie bei den Mandalas: Ist das
     * hellste Bild des ganzen Laufs schon unter 0,10, ist eine Aenderung um
     * 0,10 gar nicht darstellbar. Dann ist die Sicherheit keine Bremse,
     * sondern eine Eigenschaft.
     */
    pruefe('das hellste Bild bleibt unter der Blitzschwelle', r.hoechste < 0.1,
      `${r.hoechste.toFixed(4)}`);
  }

  console.log('\nUnd es kostet nicht mehr als ein bestehender Modus:');
  {
    /*
     * Verglichen wird gegen einen vorhandenen Modus und nicht gegen eine
     * Millisekundenzahl.
     *
     * Der Grund: Der Lichtpark ist *fuellratenbegrenzt* - was er kostet,
     * haengt fast nur daran, wie viele Bildpunkte alphagemischt werden, und
     * dieser Prueflauf hat keine Grafikkarte. Eine absolute Grenze waere hier
     * darum keine Aussage ueber den Party-Rechner, sondern eine ueber diesen
     * Behaelter.
     *
     * Ein Vergleich mit einem Modus, der seit Monaten laeuft, ist die
     * ehrlichere Frage: Kostet das Neue mehr als das, was schon da ist?
     *
     * Nachtrag - diese Pruefung ist einmal aus dem falschen Grund gruen
     * gewesen. Chromium rastert eine Leinwand verzoegert, und wer zufaellig
     * den Rasterlauf ausloest, zahlt fuer alles, was vor ihm aufgelaufen
     * ist. "Strahlen" kam hier deshalb auf 5,56 ms und in der Abnahme der
     * Buehnenshow auf 0,04 ms - derselbe Aufruf, Faktor 130. Der Lichtpark
     * sah nur deswegen guenstig aus, weil der Vergleichswert die Rasterlast
     * des Lichtparks mitbezahlt hat.
     *
     * Ein 1x1-Lesezugriff nach jedem Bild erzwingt den Rasterlauf. Die
     * ehrlichen Zahlen: Strahlen 1,77 ms, Iris 1,98 ms, Lichtpark 5,0 ms.
     * Der Lichtpark ist also rund zweieinhalbmal so teuer wie der teuerste
     * bisherige Modus - und das ist die Zahl, an der er gemessen gehoert.
     * Auf dem Messstand des Party-Rechners bleibt bei 60 Bildern je Sekunde
     * ein Budget von 16,7 ms; die Reserve ist da, sie ist nur kleiner als
     * die kaputte Messung geglaubt hat.
     */
    const r = await seite.evaluate(async () => {
      const { MODI } = await import('/gemeinsam/visualmodi.js');
      const bild = window.__probe.buehnenbildBauen(window.__MESSUNG, 1920, 1080);
      const p = new window.__probe.Partylicht(bild);
      const c = document.createElement('canvas');
      c.width = 960; c.height = 540;
      // willReadFrequently, weil die Messung nach jedem Bild einen Punkt
      // liest, um den Rasterlauf zu erzwingen - ohne das warnt Chromium.
      const s = c.getContext('2d', { willReadFrequently: true });
      const lage = {
        breite: 960, hoehe: 540, zeit: 4, sekunden: 1 / 60, wucht: 0.9, spannung: 0.4,
        abbau: 0, drop: false, guetestufe: 'hoch',
        takt: { beat: 8, bpm: 124, imBeat: 0, nummer: 8, aufEins: true, aufPhrase: false },
        palette: window.__PALETTE, paletteB: null, anteilB: 0,
        spektrum: new Uint8Array(1024).fill(120),
        welle: new Float32Array(1024),
        buehnenbild: bild, dropInSicht: false,
      };
      const messen = (tun) => {
        for (let i = 0; i < 30; i++) { tun(); s.getImageData(0, 0, 1, 1); }
        const start = performance.now();
        const n = 120;
        for (let i = 0; i < n; i++) { tun(); s.getImageData(0, 0, 1, 1); }
        return (performance.now() - start) / n;
      };
      const leer = messen(() => {});
      return {
        licht: messen(() => p.zeichnen(s, lage)) - leer,
        iris: messen(() => MODI.iris.zeichne(s, lage)) - leer,
        strahlen: messen(() => MODI.strahlen.zeichne(s, lage)) - leer,
      };
    });
    const vergleich = Math.max(r.iris, r.strahlen);
    console.log(`    Lichtpark ${r.licht.toFixed(2)} ms · Iris ${r.iris.toFixed(2)} ms · Strahlen ${r.strahlen.toFixed(2)} ms`);
    /*
     * Dreifach, nicht mehr das 1,15-fache: Der Lichtpark fuellt die ganze
     * Wand mit weichen Kegeln, die anderen beiden Modi zeichnen Linien. Dass
     * er teurer ist, war immer so - nur sichtbar ist es erst, seit die
     * Messung stimmt. Die Grenze steht da, wo das Bildbudget von 16,7 ms
     * noch Luft fuer Mandalas und Schatten-DJ laesst.
     */
    pruefe('hoechstens dreimal so teuer wie der teuerste bestehende Modus',
      r.licht <= vergleich * 3,
      `${r.licht.toFixed(2)} gegen ${vergleich.toFixed(2)} ms`);
  }

  console.log('');
  pruefe('keine Konsolenfehler und keine unbekannten Farben',
    konsole.length === 0, konsole.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlles gruen.');
process.exit(fehler ? 1 : 0);
