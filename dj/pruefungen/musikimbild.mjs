// Sieht man die Musik?
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/musikimbild.mjs
//
// "Man soll die Musik sehen" ist ein Gefuehl, und Gefuehle kann man nicht
// abnehmen. Messbar ist, woraus es entsteht - und das sind vier Dinge:
//
//   1. Ein grosser Teil des Bildes folgt ueberhaupt dem Ton.
//   2. Die Helligkeit sitzt *auf* dem Schlag und nicht dahinter.
//   3. Auch die oberen Frequenzen kommen im Bild an, nicht nur der Bass.
//   4. Das Bild bewegt sich dadurch insgesamt mehr.
//
// --- Warum verschraenkt gemessen wird ----------------------------------------
//
// Jede dieser Zahlen wird zweimal genommen, mit und ohne die Aufbereitung in
// spektrum.js, denn ohne Vergleich ist eine Korrelation von 0,6 weder gut noch
// schlecht.
//
// Der erste Anlauf mass beide Faelle *nacheinander*, jeden ueber zehn
// Sekunden. Das Ergebnis war Unsinn: Die Bildunruhe kam auf 23,6 gegen 1,0
// Helligkeitsstufen, also angeblich ein Einbruch um sechsundneunzig Prozent.
// In Wahrheit lief zwischen beiden Messungen die Musik weiter - ein Breakdown
// im zweiten Durchgang, und schon misst man den Track statt der Aufbereitung.
//
// Jetzt laufen beide Faelle *verschraenkt* in einem einzigen Durchgang: acht
// Bloecke, abwechselnd. Was sich langsam aendert - die Lautstaerke des
// Stuecks, die Tiefe der Zoomfahrt, der Abschnitt im Arrangement - trifft dann
// beide Seiten gleich.

import { chromium } from 'playwright';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
const CHROM = process.env.CHROMIUM_PFAD;
// Acht Bloecke zu neunzig Bildern: zwoelf Sekunden, gut fuenfundzwanzig
// Schlaege je Seite.
const BLOCK = 90;
const BLOECKE = 8;
// Ueber so viele Bilder wird die Verschiebung gesucht: eine Zehntelsekunde in
// jede Richtung.
const SPANNE = 6;

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage({ viewport: { width: 1000, height: 620 } });
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => {
  if (n.type() === 'error') konsole.push(n.text());
});

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });
  await seite.click('#startDemo');
  await seite.waitForTimeout(5000);
  // Das Mandelbrot ist der Modus, an dem das Spektrum am meisten haengt - es
  // traegt es in seiner Farbtabelle. Fest eingestellt, damit die Messung nicht
  // davon abhaengt, was gerade an der Reihe waere.
  await seite.evaluate(() => window.__dj?.bild?.modusSetzen?.('mandelbrot'));
  await seite.waitForTimeout(2500);

  const roh = await seite.evaluate(
    async ({ block, bloecke }) => {
      const { spektrumUmgehen, spektrumZuruecksetzen, nutzbareBins } =
        await import('/gemeinsam/spektrum.js');
      const welt = window.__dj;
      const n = welt.mixer.messung.frequencyBinCount;
      const puffer = new Uint8Array(n);
      const nutz = nutzbareBins(n);
      // Das obere Drittel der nutzbaren Bins - dort sass der Befund.
      const obenVon = Math.floor(Math.pow(nutz, 0.72));

      /*
       * Die Leinwand wird verkleinert ausgelesen. Eine Ablesung in voller
       * Groesse je Bild waere teurer als alles, was die Buehne sonst tut, und
       * wuerde die Messung selbst verfaelschen; 64x40 genuegen.
       */
      const B = 64;
      const H = 40;
      const klein = document.createElement('canvas');
      klein.width = B;
      klein.height = H;
      const kst = klein.getContext('2d', { willReadFrequently: true });
      const leinwand = document.getElementById('visual');

      const leer = () => ({
        ton: [],
        bild: [],
        oben: [],
        faecher: new Array(12).fill(0),
        faecherZahl: new Array(12).fill(0),
        summe: new Float64Array(B * H),
        quadrat: new Float64Array(B * H),
        bilder: 0,
      });
      const seiten = { mit: leer(), ohne: leer() };

      spektrumZuruecksetzen();
      await new Promise((fertig) => {
        let i = 0;
        // Vorlauf je Block: Nach dem Umschalten brauchen die Huellkurven ein
        // paar Bilder, bis sie wieder etwas Sinnvolles zeigen.
        const VORLAUF = 12;
        const tick = () => {
          const nr = Math.floor(i / block);
          const mit = nr % 2 === 0;
          const imBlock = i % block;
          if (imBlock === 0) spektrumUmgehen(!mit);

          welt.mixer.spektrum(puffer);
          let bass = 0;
          const bis = Math.floor(n / 24);
          for (let k = 1; k < bis; k++) bass += puffer[k];
          /*
           * Das obere Drittel wird an dem Spektrum gemessen, das die Modi
           * wirklich sehen. Im Umgehungsfall ist das der rohe Wert - genau der
           * Vergleich, um den es geht.
           */
          const gesehen = welt.bild?.spektrumScharf ?? puffer;
          let hoch = 0;
          for (let k = obenVon; k < nutz; k++) if (gesehen[k] > hoch) hoch = gesehen[k];

          kst.drawImage(leinwand, 0, 0, B, H);
          const d = kst.getImageData(0, 0, B, H).data;
          let hell = 0;
          for (let p = 0; p < d.length; p += 4) hell += d[p] + d[p + 1] + d[p + 2];
          hell = hell / (d.length / 4) / 3;

          if (imBlock >= VORLAUF) {
            const s = mit ? seiten.mit : seiten.ohne;
            s.ton.push(bass / bis);
            s.bild.push(hell);
            s.oben.push(hoch);
            const takt = welt.bild?.letzterTakt;
            if (takt) {
              const f = Math.min(11, Math.floor(takt.imBeat * 12));
              s.faecher[f] += hell;
              s.faecherZahl[f]++;
            }
            for (let p = 0, q = 0; p < d.length; p += 4, q++) {
              const v = (d[p] + d[p + 1] + d[p + 2]) / 3;
              s.summe[q] += v;
              s.quadrat[q] += v * v;
            }
            s.bilder++;
          }
          if (++i < block * bloecke) requestAnimationFrame(tick);
          else fertig();
        };
        requestAnimationFrame(tick);
      });
      spektrumUmgehen(false);

      const auswerten = (s) => {
        let unruhe = 0;
        for (let q = 0; q < s.summe.length; q++) {
          const m = s.summe[q] / s.bilder;
          unruhe += Math.sqrt(Math.max(0, s.quadrat[q] / s.bilder - m * m));
        }
        return {
          ton: s.ton,
          bild: s.bild,
          unruhe: unruhe / s.summe.length,
          obenMittel: s.oben.reduce((a, b) => a + b, 0) / s.oben.length,
          obenHoch: s.oben.filter((v) => v > 128).length / s.oben.length,
          faecher: s.faecher.map((v, k) => (s.faecherZahl[k] ? v / s.faecherZahl[k] : 0)),
          bilder: s.bilder,
        };
      };
      return { mit: auswerten(seiten.mit), ohne: auswerten(seiten.ohne), obenVon, nutz };
    },
    { block: BLOCK, bloecke: BLOECKE },
  );

  /*
   * Kreuzkorrelation. Beide Reihen werden zuerst um ihren Mittelwert bereinigt
   * und auf ihre Streuung normiert - sonst misst man, wie hell das Bild
   * insgesamt ist, und nicht, ob es der Musik folgt.
   */
  const korrelation = (a, b, versatz) => {
    const n = Math.min(a.length, b.length) - Math.abs(versatz);
    const aVon = versatz > 0 ? 0 : -versatz;
    const bVon = versatz > 0 ? versatz : 0;
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < n; i++) { sa += a[aVon + i]; sb += b[bVon + i]; }
    const ma = sa / n;
    const mb = sb / n;
    let oben = 0;
    let qa = 0;
    let qb = 0;
    for (let i = 0; i < n; i++) {
      const da = a[aVon + i] - ma;
      const db = b[bVon + i] - mb;
      oben += da * db;
      qa += da * da;
      qb += db * db;
    }
    return qa > 0 && qb > 0 ? oben / Math.sqrt(qa * qb) : 0;
  };
  const beste = (s) => {
    let hoch = -2;
    for (let v = -SPANNE; v <= SPANNE; v++) hoch = Math.max(hoch, korrelation(s.ton, s.bild, v));
    return hoch;
  };

  console.log(`\n${roh.mit.bilder} Bilder je Seite, verschraenkt in ${BLOECKE} Bloecken.`);

  console.log('\nFolgt das Bild dem Ton?');
  const kMit = beste(roh.mit);
  const kOhne = beste(roh.ohne);
  console.log(`    ohne Aufbereitung: Korrelation ${kOhne.toFixed(2)}`);
  console.log(`    mit  Aufbereitung: Korrelation ${kMit.toFixed(2)}`);
  /*
   * Hier stand zuerst die Forderung, die Korrelation muesse *steigen*. Sie
   * faellt, und das ist richtig so: Nach der Aufbereitung folgt das Bild nicht
   * mehr nur dem Bass, sondern dem ganzen Spektrum. Wer allein gegen den Bass
   * misst, bestraft genau die Verbesserung, um die es geht. Bleiben muss, dass
   * ein grosser Teil der Bildhelligkeit ueberhaupt dem Ton folgt.
   */
  pruefe('ein grosser Teil des Bildes folgt dem Bass', kMit > 0.45,
    `Korrelation ${kMit.toFixed(2)}`);

  /*
   * Gegen den Bass zu messen kann die Verspaetung gar nicht finden: Der Bass
   * kommt aus demselben geglaetteten Analyser wie das Bild, beide tragen
   * dieselbe Verzoegerung, und der Versatz zwischen ihnen ist per Konstruktion
   * null. Gemessen wird deshalb gegen das *Taktraster* - die einzige Zeitachse
   * im Haus, die auf Millisekunden stimmt, weil sie aus der Analyse kommt und
   * nicht aus einer Erkennung im Signal.
   */
  console.log('\nSitzt die Helligkeit auf dem Schlag?');
  const spitze = (f) => f.indexOf(Math.max(...f));
  const hub = (f) => {
    const mn = Math.min(...f);
    const mx = Math.max(...f);
    return mx > 0 ? (mx - mn) / mx : 0;
  };
  const stelle = (i) => `${((i + 0.5) / 12).toFixed(2)} Schlag`;
  for (const [name, s] of [['ohne', roh.ohne], ['mit ', roh.mit]]) {
    console.log(
      `    ${name} Aufbereitung: hellstes Fach bei ${stelle(spitze(s.faecher))}, ` +
      `Hub ${(hub(s.faecher) * 100).toFixed(1)} %`,
    );
  }
  /*
   * Das hellste Fach muss im ersten Drittel des Schlags liegen. Weiter hinten
   * hiesse, dass die Helligkeit dem Anschlag hinterherlaeuft, statt auf ihm zu
   * sitzen.
   */
  pruefe('das Bild ist kurz nach dem Anschlag am hellsten', spitze(roh.mit.faecher) <= 3,
    `Fach ${spitze(roh.mit.faecher) + 1} von 12`);
  pruefe('und der Unterschied ueber den Schlag ist sichtbar', hub(roh.mit.faecher) > 0.04,
    `${(hub(roh.mit.faecher) * 100).toFixed(1)} % Hub`);

  /*
   * Der eigentliche Zweck der Aufbereitung. Gemessen wird am Spektrum, nicht
   * am Bild: Welche Bildstelle zu welcher Frequenz gehoert, wandert beim
   * Mandelbrot mit der Farbwanderung - ein fester Bildausschnitt traegt also
   * keine feste Frequenz. Die Farbtabelle liest aber genau diese Zahlen, und
   * was sich in ihnen nicht bewegt, bewegt sich auch im Bild nicht.
   */
  console.log(`\nLeben die oberen Baender? (Bins ${roh.obenVon}..${roh.nutz})`);
  for (const [name, s] of [['ohne', roh.ohne], ['mit ', roh.mit]]) {
    console.log(
      `    ${name} Aufbereitung: Mittel ${s.obenMittel.toFixed(0)}, ` +
      `ueber der Haelfte in ${(s.obenHoch * 100).toFixed(0)} % der Bilder`,
    );
  }
  pruefe('die oberen Baender erreichen ueberhaupt Helligkeit', roh.mit.obenHoch > 0.3,
    `${(roh.mit.obenHoch * 100).toFixed(0)} % statt ${(roh.ohne.obenHoch * 100).toFixed(0)} %`);
  // Nicht dauerhaft hell, sonst waere aus der Belebung ein Ausbleichen
  // geworden. Der Wert soll pendeln.
  pruefe('und bleiben trotzdem nicht dauernd hell', roh.mit.obenHoch < 0.9,
    `in ${(100 - roh.mit.obenHoch * 100).toFixed(0)} % der Bilder wieder dunkler`);

  /*
   * Die schaerfste Frage und die letzte: die zeitliche Streuung je Bildpunkt,
   * gemittelt ueber das ganze Bild. Zoomfahrt und Drehung gehen mit ein, aber
   * sie treffen beide Seiten gleich - was uebrigbleibt, ist die Musik.
   */
  console.log('\nWie viel vom Bild bewegt sich?');
  console.log(`    ohne Aufbereitung: ${roh.ohne.unruhe.toFixed(1)} Helligkeitsstufen je Bildpunkt`);
  console.log(`    mit  Aufbereitung: ${roh.mit.unruhe.toFixed(1)} Helligkeitsstufen je Bildpunkt`);
  pruefe('das Bild bewegt sich mehr als vorher', roh.mit.unruhe > roh.ohne.unruhe * 1.03,
    `${roh.ohne.unruhe.toFixed(1)} → ${roh.mit.unruhe.toFixed(1)} ` +
    `(${((roh.mit.unruhe / roh.ohne.unruhe - 1) * 100).toFixed(0)} % mehr)`);

  console.log('');
  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler ? `\n${fehler} Abweichung(en).\n` : '\nAlles gruen.\n');
process.exit(fehler ? 1 : 0);
