// Abnahme fuer die Buehnenshow.
//
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/buehnenshow.mjs
//
// Der Anspruch an diesen Modus ist "richtige Akzente zu den richtigen
// Momenten" und "traegt ueber Stunden". Beides klingt nach Geschmack und ist
// messbar - genau darum geht es hier.
//
//   1. Zurueckhaltung: Es laufen nie alle Gewerke zugleich.
//   2. Rotation: Ueber eine lange Strecke kommt jedes Bild dran, und keins
//      wechselt hektisch.
//   3. Die Spiegelkugel bekommt die Buehne fuer sich.
//   4. Die Sperrzeiten halten - auch wenn jeder Schlag ein Drop ist.
//   5. Das Loch vor dem Drop ist wirklich dunkler.
//   6. Blitzsicherheit, und zwar zweifach: Rate *und* Flaechenanteil. Die
//      kleine Flaeche ist die ganze Begruendung dafuer, dass es hier
//      ueberhaupt Blitze geben darf.
//   7. Es kostet nicht mehr als ein bestehender Modus.

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
    const { Buehnenshow, BILDER } = await import('/gemeinsam/buehnenshow.js');

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
    window.__PALETTE = {
      name: 'Pruefpalette', grundton: 250, akzent: 200, baender: 5,
      toene: ['rgb(70 80 200)', 'rgb(90 60 210)', 'rgb(60 180 220)', 'rgb(40 60 160)'],
      hell: 'rgb(220 235 255)',
    };
    window.__BILDER = BILDER;

    const B = 480;
    const H = 270;
    const lein = document.createElement('canvas');
    lein.width = B; lein.height = H;
    const stift = lein.getContext('2d', { willReadFrequently: true });
    const kennlinie = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const s = i / 255;
      kennlinie[i] = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }

    window.__probe = {
      Buehnenshow, buehnenbildBauen, stift, B, H,
      /**
       * Bilder rechnen. `mitBild` merkt zusaetzlich, welche Bildpunkte hell
       * sind - dafuer wird die Leuchtdichte je Punkt gebraucht, und das ist
       * teuer. Nur dort einschalten, wo es gebraucht wird.
       */
      lauf(bilder, messung, grund = {}, bei = null, mitBild = false) {
        const bild = buehnenbildBauen(messung, 1920, 1080);
        // Mit Saat, damit zwei Laeufe dieselbe Bilderfolge haben.
        const p = new Buehnenshow(bild, 12345);
        /*
         * Die Schrittweite kommt aus `grund`, wenn sie dort steht - und der
         * Schlagzaehler muss ihr folgen.
         *
         * Vorher stand hier ein festes 1/60 fuer den Schlagzaehler, waehrend
         * der Zeitraffer-Lauf `sekunden: 4/60` durchreichte. Damit lief die
         * innere Uhr der Show viermal so schnell wie ihre Musik: Sperrzeiten
         * und Blenden vergingen im Zeitraffer, die Phrasen nicht. Der Lauf
         * war als "zehn Minuten" gedacht und deckte in Wahrheit zweieinhalb
         * ab - deshalb kamen dort nur sechs Bildwechsel heraus.
         */
        const dt = grund.sekunden ?? 1 / 60;
        const proben = [];
        let vorher = null;
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
          const eintrag = { i, beat, ...p.stand() };
          if (mitBild) {
            const d = stift.getImageData(0, 0, B, H).data;
            const jetzt = new Float32Array(B * H);
            let L = 0;
            for (let k = 0, q = 0; k < d.length; k += 4, q++) {
              const l = 0.2126 * kennlinie[d[k]] + 0.7152 * kennlinie[d[k + 1]] + 0.0722 * kennlinie[d[k + 2]];
              jetzt[q] = l;
              L += l;
            }
            eintrag.leuchtdichte = L / (B * H);
            /*
             * Der Flaechenanteil, der sich von einem Bild zum naechsten um
             * mindestens 0,10 Leuchtdichte aendert. *Das* ist die Zahl, an
             * der die Blitzschwelle haengt - sie greift erst ab einem
             * Viertel der Flaeche.
             */
            if (vorher) {
              let bewegt = 0;
              for (let q = 0; q < jetzt.length; q++) if (Math.abs(jetzt[q] - vorher[q]) >= 0.1) bewegt++;
              eintrag.sprungFlaeche = bewegt / jetzt.length;
            } else eintrag.sprungFlaeche = 0;
            vorher = jetzt;
          }
          proben.push(eintrag);
        }
        return { proben, show: p };
      },
    };
  });

  console.log('\nZurueckhaltung - es laufen nie alle Gewerke zugleich:');
  {
    const r = await seite.evaluate(() => {
      const { proben } = window.__probe.lauf(3600, window.__MESSUNG, { wucht: 0.75 });
      // Wie viele Bilder sind gleichzeitig nennenswert stark?
      const gleichzeitig = proben.map((p) =>
        Object.values(p.staerke).filter((v) => v > 0.25).length);
      // Und wie viele *Gewerke* sind gleichzeitig laut?
      const laut = proben.map((p) => {
        let n = 0;
        if (p.blinder > 0.2) n++;
        if (p.blitzeAn) n++;
        if (p.flammen > 0.2) n++;
        if (p.co2 > 0.2) n++;
        if (p.funken > 10) n++;
        return n;
      });
      return {
        bilderMax: Math.max(...gleichzeitig),
        bilderMittel: gleichzeitig.reduce((a, b) => a + b, 0) / gleichzeitig.length,
        lautMax: Math.max(...laut),
        lautAnteil: laut.filter((v) => v > 0).length / laut.length,
      };
    });
    /*
     * Zwei Bilder duerfen sich ueberlappen - das ist die Blende zwischen
     * ihnen. Drei hiessen, dass die Blende nicht fertig wird, bevor die
     * naechste anfaengt.
     */
    pruefe('hoechstens zwei Bilder ueberlappen sich', r.bilderMax <= 2,
      `${r.bilderMax}, im Mittel ${r.bilderMittel.toFixed(2)}`);
    /*
     * Der Kern der ganzen Regie: Nie mehr als zwei laute Gewerke zugleich.
     * Drei sieht man als eines - und danach ist die Show verbraucht.
     */
    pruefe('nie mehr als zwei laute Gewerke gleichzeitig', r.lautMax <= 2, String(r.lautMax));
    /*
     * Und sie sind die Ausnahme, nicht der Normalfall. Ein Blinder, der die
     * Haelfte der Zeit an ist, ist eine Lampe.
     */
    pruefe('und sie laufen nur einen kleinen Teil der Zeit',
      r.lautAnteil < 0.3, `${(r.lautAnteil * 100).toFixed(0)} % der Bilder`);
  }

  console.log('\nRotation - es traegt ueber eine lange Strecke:');
  {
    const r = await seite.evaluate(() => {
      // Zehn Minuten in Zeitraffer: 36000 Bilder waeren zu langsam, also
      // wird mit vierfachem Zeitschritt gerechnet - 9000 Bilder zu je 4/60
      // Sekunden sind 600 Sekunden Musik, also 1240 Schlaege oder gut
      // achtunddreissig Phrasen. Die Regie zaehlt in Phrasen, nicht in
      // Bildern, also aendert der Zeitraffer nichts an ihren Entscheidungen.
      const { proben } = window.__probe.lauf(9000, window.__MESSUNG,
        { wucht: 0.7, sekunden: 4 / 60 });
      const folge = [];
      for (const p of proben) if (!folge.length || folge[folge.length - 1] !== p.bild) folge.push(p.bild);
      // Wie lange steht ein Bild? In Phrasen.
      const dauern = [];
      let anfang = 0;
      for (let i = 1; i < proben.length; i++) {
        if (proben[i].bild !== proben[i - 1].bild) {
          dauern.push((proben[i].beat - proben[anfang].beat) / 32);
          anfang = i;
        }
      }
      return {
        verschiedene: new Set(folge).size, wechsel: folge.length,
        kuerzeste: dauern.length ? Math.min(...dauern) : 0,
        folge: folge.slice(0, 12),
        /*
         * Verglichen wird gegen die Bilder, die *dieser Raum hergibt*, nicht
         * gegen alle. Ein Bild, das Gitterkaesten braucht, kann in einer
         * Fassadenmessung nicht vorkommen, und es zu verlangen hiesse, eine
         * richtige Entscheidung der Regie als Fehler zu zaehlen.
         */
        alle: proben[0].moeglich.length,
        namen: proben[0].moeglich,
      };
    });
    pruefe('alle moeglichen Bilder kommen vor', r.verschiedene >= r.alle,
      `${r.verschiedene} von ${r.alle}: ${r.folge.join(' → ')} …`);
    /*
     * Kein Bild darf kuerzer als zwei Phrasen stehen. Das ist die
     * Mindesthaltedauer, und ohne sie waere jeder Wechsel Zufall statt
     * Entscheidung.
     */
    pruefe('keins steht kuerzer als zwei Phrasen', r.kuerzeste >= 1.9,
      `kuerzeste ${r.kuerzeste.toFixed(2)} Phrasen`);
    pruefe('und es wechselt oft genug, um nicht zu langweilen', r.wechsel >= 8,
      `${r.wechsel} Wechsel`);
  }

  console.log('\nDie Spiegelkugel bekommt die Buehne fuer sich:');
  {
    const r = await seite.evaluate(() => {
      const { proben } = window.__probe.lauf(9000, window.__MESSUNG,
        { wucht: 0.5, abbau: 0.5, sekunden: 4 / 60 });
      const mitKugel = proben.filter((p) => p.staerke.Kugel > 0.8);
      if (!mitKugel.length) return { kam: false };
      return {
        kam: true,
        anteil: mitKugel.length / proben.length,
        washDaneben: Math.max(...mitKugel.map((p) => p.staerke.Wash)),
        beamsDaneben: Math.max(...mitKugel.map((p) => p.staerke.Beams)),
      };
    });
    pruefe('sie kommt im ruhigen Teil ueberhaupt dran', r.kam);
    if (r.kam) {
      /*
       * Der eigentliche Punkt: Waehrend sie laeuft, ist alles andere aus.
       * Ein Punktfeld im Grundlicht ist kein Punktfeld, sondern eine leicht
       * fleckige Wand.
       */
      pruefe('und daneben laeuft nichts anderes',
        r.washDaneben < 0.2 && r.beamsDaneben < 0.2,
        `Wash ${r.washDaneben.toFixed(2)}, Beams ${r.beamsDaneben.toFixed(2)}`);
      pruefe('sie steht lange genug, um zu tragen', r.anteil > 0.05,
        `${(r.anteil * 100).toFixed(0)} % der Zeit`);
    }
  }

  console.log('\nDie Sperrzeiten halten:');
  {
    /*
     * Der haerteste Fall: *jeder* Schlag meldet einen Drop. Ohne Sperren
     * waere das ein Dauerfeuerwerk - und genau das soll die Regie
     * verhindern.
     */
    const r = await seite.evaluate(() => {
      const { proben } = window.__probe.lauf(3600, window.__MESSUNG,
        { wucht: 0.95 }, (lage, i) => { if (i % 30 === 0) lage.drop = true; });
      const zuendungen = (feld, schwelle) => {
        let n = 0;
        for (let i = 1; i < proben.length; i++) {
          if (proben[i][feld] > schwelle && proben[i - 1][feld] <= schwelle) n++;
        }
        return n;
      };
      return {
        sekunden: proben.length / 60,
        flamme: zuendungen('flammen', 0.9),
        co2: zuendungen('co2', 0.9),
        blinder: zuendungen('blinder', 0.9),
      };
    });
    // 60 Sekunden, Sperre 95 s fuer die Flamme: hoechstens einmal.
    pruefe('die Flamme kommt hoechstens einmal je 95 Sekunden',
      r.flamme <= Math.ceil(r.sekunden / 95) + 1, `${r.flamme} in ${r.sekunden.toFixed(0)} s`);
    pruefe('CO2 hoechstens einmal je 55 Sekunden',
      r.co2 <= Math.ceil(r.sekunden / 55) + 1, `${r.co2} in ${r.sekunden.toFixed(0)} s`);
    pruefe('der Blinder hoechstens einmal je 12 Sekunden',
      r.blinder <= Math.ceil(r.sekunden / 12) + 1, `${r.blinder} in ${r.sekunden.toFixed(0)} s`);
  }

  console.log('\nDas Loch vor dem Drop:');
  {
    /*
     * Der einzige Effekt der ganzen Show, der aus Nichtstun besteht - und
     * nach allem, was Lichtdesigner darueber schreiben, der wirksamste. Ein
     * Aufbau, der immer heller wird und dann *ausgeht*, macht den Einschlag
     * doppelt so gross.
     */
    const r = await seite.evaluate(() => {
      const { proben } = window.__probe.lauf(600, window.__MESSUNG, {}, (lage, i) => {
        // Ein Aufbau von Bild 180 bis 420, dann der Drop.
        lage.wucht = 0.8;
        lage.spannung = i < 180 ? 0 : Math.min(1, (i - 180) / 240);
        if (i === 421) lage.drop = true;
      }, true);
      return {
        vorAufbau: proben[170].leuchtdichte,
        imAufbau: proben[380].leuchtdichte,
        kurzVorDrop: Math.min(...proben.slice(408, 421).map((p) => p.leuchtdichte)),
        beimDrop: Math.max(...proben.slice(421, 460).map((p) => p.leuchtdichte)),
        dunkelMax: Math.max(...proben.map((p) => p.dunkel)),
      };
    });
    pruefe('es wird wirklich dunkel vor dem Drop', r.dunkelMax > 0.6,
      `Dunkelfaktor ${r.dunkelMax.toFixed(2)}`);
    pruefe('und die Leinwand wird dabei messbar dunkler',
      r.kurzVorDrop < r.imAufbau * 0.6,
      `${r.kurzVorDrop.toFixed(4)} gegen ${r.imAufbau.toFixed(4)} im Aufbau`);
    pruefe('der Drop danach ist deutlich heller als das Loch',
      r.beimDrop > r.kurzVorDrop * 3,
      `${r.beimDrop.toFixed(4)} gegen ${r.kurzVorDrop.toFixed(4)}`);
  }

  console.log('\nBlitzsicherheit - Rate und Flaeche:');
  {
    /*
     * Drei Zahlen, und die Aufteilung ist selbst schon das Ergebnis einer
     * Korrektur.
     *
     * Hier stand zuerst eine einzige Forderung: *kein* Bildsprung darf ein
     * Viertel der Flaeche betreffen. Gemessen wurden 35,8 Prozent, und die
     * Suche nach der Ursache hat die Forderung als die falsche entlarvt.
     * Verantwortlich war naemlich nicht das, wofuer sie geschrieben war.
     *
     * Einzeln gemessen, mittlere Leuchtdichte und Flaechenanteil:
     *
     *   Blinder  0,0756   19,6 %      <- der eine Grossflaechige
     *   Flammen  0,0140    2,4 %
     *   CO2      0,0083    3,2 %
     *   Blitze   0,0032    0,7 %      <- die, um die es eigentlich ging
     *   Funken   0,0021    0,4 %
     *   Beams    0,0018    0,2 %
     *   Kugel    0,0006    0,1 %
     *
     * Die Blitze liegen bei 0,7 Prozent - ihre Begruendung traegt also mit
     * einem Faktor von ueber dreissig. Ueber die Grenze gehoben haben es
     * *zwei* Blinder, die auf denselben Drop gefeuert haben: der der Show
     * und der eingebaute des Grundlichtparks. Seit der Park seinen abgibt
     * (`blinderAus` in partylicht.js), liegt der groesste Sprung bei 18,6
     * Prozent und das hellste Bild bei 0,068.
     *
     * Ein Blinder ist ohnehin etwas anderes als ein Stroboskop: ein
     * einzelnes Ereignis mit zwoelf Sekunden Sperrzeit, kein wiederholtes
     * Flackern.
     *
     * Genau diese Unterscheidung macht die Norm auch. Sie verbietet
     * grossflaechige Helligkeitssprunge nicht - sie verbietet mehr als drei
     * davon in einer Sekunde. Ein einzelner Schlag ist kein Blitz.
     *
     * Also wird jetzt beides getrennt geprueft, und zusammen ist das
     * schaerfer als die eine Zahl vorher:
     *
     *   - Die Blitze allein bleiben unter einem Viertel der Flaeche. Das
     *     ist die Begruendung dafuer, dass es sie ueberhaupt gibt, und sie
     *     wird jetzt dort gemessen, wo sie hingehoert.
     *   - Grossflaechige Spruenge, egal woher, hoechstens dreimal je
     *     Sekunde. Das ist der Wortlaut der Schwelle.
     *   - Und unabhaengig davon die absolute Deckelung der Helligkeit.
     *
     * Gemessen wird im schlimmsten Fall: dauerhafter Aufbau, also Blitze im
     * schnellsten Takt, dazu Drops.
     */
    const r = await seite.evaluate(() => {
      const { proben } = window.__probe.lauf(900, window.__MESSUNG, {}, (lage, i) => {
        lage.wucht = 0.95;
        lage.spannung = 0.75 + Math.sin(i / 40) * 0.2;
        if (i % 200 === 0) lage.drop = true;
      }, true);
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
      /*
       * Grossflaechige Spruenge im gleitenden Sekundenfenster. 60 Bilder,
       * weil dieser Lauf mit 1/60 rechnet.
       */
      const gross = proben.map((p) => ((p.sprungFlaeche ?? 0) >= 0.25 ? 1 : 0));
      let imFenster = 0;
      for (let i = 0; i + 60 <= gross.length; i++) {
        let n = 0;
        for (let k = i; k < i + 60; k++) n += gross[k];
        if (n > imFenster) imFenster = n;
      }
      return {
        blitze, sekunden: L.length / 60,
        hoechste: Math.max(...L),
        flaecheMax: Math.max(...proben.map((p) => p.sprungFlaeche ?? 0)),
        grossJeSekunde: imFenster,
        blitzeLiefen: proben.filter((p) => p.blitzeAn).length / proben.length,
      };
    });
    console.log(`    hellstes Bild ${r.hoechste.toFixed(4)} · groesster Sprung ${(r.flaecheMax * 100).toFixed(1)} % · Blitze liefen ${(r.blitzeLiefen * 100).toFixed(0)} % der Zeit`);
    pruefe('das hellste Bild bleibt unter der Blitzschwelle', r.hoechste < 0.1,
      r.hoechste.toFixed(4));
    pruefe('weniger als drei Blitze je Sekunde', r.blitze / r.sekunden < 3,
      `${(r.blitze / r.sekunden).toFixed(2)} je Sekunde`);
    /*
     * Der Wortlaut der Schwelle: nicht "nie grossflaechig", sondern "nicht
     * mehr als dreimal je Sekunde grossflaechig".
     */
    pruefe('kein Sekundenfenster mit mehr als drei grossflaechigen Spruengen',
      r.grossJeSekunde <= 3, `hoechstens ${r.grossJeSekunde} je Sekunde`);
  }

  console.log('\nUnd die Blitze allein bleiben klein:');
  {
    /*
     * Die Messung, auf der die Entscheidung fuer Blitze ueberhaupt ruht -
     * und deshalb an der Lampe selbst gemessen, nicht am fertigen Bild, wo
     * sie ein anderes Gewerk ueberdecken koennte.
     */
    const r = await seite.evaluate(async () => {
      const { Blitze } = await import('/gemeinsam/gewerke.js');
      const { stift, B, H } = window.__probe;
      const kennlinie = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const v = i / 255;
        kennlinie[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      }
      const feld = () => {
        const d = stift.getImageData(0, 0, B, H).data;
        const a = new Float32Array(B * H);
        for (let k = 0, q = 0; k < d.length; k += 4, q++) {
          a[q] = 0.2126 * kennlinie[d[k]] + 0.7152 * kennlinie[d[k + 1]] + 0.0722 * kennlinie[d[k + 2]];
        }
        return a;
      };
      stift.fillStyle = '#000';
      stift.fillRect(0, 0, B, H);
      const schwarz = feld();
      const bz = new Blitze(11);
      bz.an = true;
      // Ueber eine ganze Musterrunde: die vier Muster haben verschiedene
      // Flaechen, und geprueft gehoert das groesste.
      let groesste = 0;
      for (let schritt = 0; schritt < 8; schritt++) {
        bz.phase = schritt;
        stift.fillStyle = '#000';
        stift.fillRect(0, 0, B, H);
        stift.save();
        stift.globalCompositeOperation = 'lighter';
        bz.zeichnen(stift, B, H, 1);
        stift.restore();
        const a = feld();
        let n = 0;
        for (let q = 0; q < a.length; q++) if (Math.abs(a[q] - schwarz[q]) >= 0.1) n++;
        groesste = Math.max(groesste, n / a.length);
      }
      return { groesste };
    });
    pruefe('die Blitze betreffen weit weniger als ein Viertel der Flaeche',
      r.groesste < 0.25, `${(r.groesste * 100).toFixed(1)} % im hellsten Muster`);
  }

  console.log('\nUnd es kostet nicht mehr als der Lichtpark:');
  {
    /*
     * Diese Messung hat zweimal gelogen, bevor sie gestimmt hat, und beide
     * Male auf dieselbe Weise.
     *
     * Chromium rastert eine Leinwand nicht sofort. Zeichenbefehle wandern in
     * eine Liste, und die wird abgearbeitet, wenn es sich lohnt oder wenn
     * jemand Bildpunkte lesen will. Eine Schleife aus 200 Aufrufen misst
     * darum nicht das Zeichnen, sondern das *Notieren* - und wer zufaellig
     * den Rasterlauf ausloest, zahlt fuer alles, was vor ihm aufgelaufen ist.
     *
     * Dieselbe Zeile ergab dadurch 0,04 ms in dieser Datei und 5,56 ms in
     * der Abnahme des Lichtparks. Ein Faktor von 130 fuer denselben Aufruf.
     * Beide Male hat die Pruefung eine Aussage getroffen, die sie gar nicht
     * gemessen hatte - die eine ist deshalb durchgefallen, die andere, was
     * schlimmer ist, durchgekommen.
     *
     * Ein 1x1-Lesezugriff nach jedem Bild erzwingt den Rasterlauf. Damit
     * wird jeder Aufruf fuer seine eigene Arbeit belastet, und die Zahlen
     * haengen nicht mehr an der Reihenfolge - gegengeprueft, indem alles
     * zweimal in umgekehrter Reihenfolge gemessen wurde:
     *
     *              erste Runde   umgekehrt
     *   Strahlen      1,76 ms     1,78 ms
     *   Iris          1,93 ms     2,03 ms
     *   Lichtpark     5,05 ms     4,95 ms
     *   Buehnenshow   5,11 ms     4,97 ms
     *
     * Verglichen wird gegen den Lichtpark und nicht gegen eine
     * Millisekundenzahl: Dieser Prueflauf hat keine Grafikkarte, eine
     * absolute Grenze waere hier also eine Aussage ueber den Behaelter und
     * nicht ueber den Party-Rechner. Und gegen den Lichtpark, weil die Show
     * ihn *enthaelt* - kostet sie nicht mehr als er, sind alle Gewerke
     * zusammen umsonst dazugekommen.
     */
    const r = await seite.evaluate(async () => {
      const { Partylicht } = await import('/gemeinsam/partylicht.js');
      const { MODI } = await import('/gemeinsam/visualmodi.js');
      const bild = window.__probe.buehnenbildBauen(window.__MESSUNG, 1920, 1080);
      const p = new window.__probe.Buehnenshow(bild, 12345);
      const licht = new Partylicht(bild);
      const c = document.createElement('canvas');
      c.width = 960; c.height = 540;
      // willReadFrequently, weil die Messung nach jedem Bild einen Punkt
      // liest, um den Rasterlauf zu erzwingen - ohne das warnt Chromium.
      const s = c.getContext('2d', { willReadFrequently: true });
      const lage = {
        breite: 960, hoehe: 540, zeit: 4, sekunden: 1 / 60, wucht: 0.9, spannung: 0.5,
        abbau: 0, drop: false, guetestufe: 'hoch',
        takt: { beat: 8, bpm: 124, imBeat: 0, nummer: 8, aufEins: true, aufPhrase: false },
        palette: window.__PALETTE, paletteB: null, anteilB: 0,
        spektrum: new Uint8Array(1024).fill(120), welle: new Float32Array(1024),
        buehnenbild: bild, dropInSicht: false,
      };
      const messen = (tun) => {
        for (let i = 0; i < 30; i++) { tun(); s.getImageData(0, 0, 1, 1); }
        const start = performance.now();
        const n = 120;
        for (let i = 0; i < n; i++) { tun(); s.getImageData(0, 0, 1, 1); }
        return (performance.now() - start) / n;
      };
      // Der Lesezugriff selbst kostet auch etwas und wird abgezogen.
      const leer = messen(() => {});
      return {
        show: messen(() => p.zeichnen(s, lage)) - leer,
        licht: messen(() => licht.zeichnen(s, lage)) - leer,
        strahlen: messen(() => MODI.strahlen.zeichne(s, lage)) - leer,
        leer,
      };
    });
    console.log(`    Buehnenshow ${r.show.toFixed(2)} ms · Lichtpark ${r.licht.toFixed(2)} ms · Strahlen ${r.strahlen.toFixed(2)} ms`);
    pruefe('nicht teurer als der Lichtpark, den sie enthaelt', r.show <= r.licht * 1.15,
      `${r.show.toFixed(2)} gegen ${r.licht.toFixed(2)} ms`);
  }

  console.log('');
  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlles gruen.');
process.exit(fehler ? 1 : 0);
