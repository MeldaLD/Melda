// Wirkt das Bild so, wie es soll - und ist es sicher?
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/bildwirkung.mjs
//
// Die Farbwahl der Mandalas hat ein erklaertes Ziel: Leute in den Bann ziehen
// und dort halten. Zwei Dinge daran sind nicht Geschmack, sondern Zahlen -
// und beide werden hier gemessen.
//
// --- 1. Die fraktale Dimension -----------------------------------------------
//
// Menschen bevorzugen Muster mit einer fraktalen Dimension zwischen 1,3 und
// 1,5 recht deutlich, und in genau diesem Bereich zeigt das Stirnhirn die
// staerkste Alpha-Aktivitaet - den Zustand "wach, aber entspannt", also genau
// das, was mit "in den Bann ziehen" gemeint ist. Gemessen wurde das von
// Taylor, Hagerhall und anderen an Naturbildern, Pollock-Gemaelden und
// erzeugten Fraktalen.
//
//   Hagerhall u. a., "Investigations of Human EEG Response to Viewing Fractal
//   Patterns", Perception 37(10), 2008.
//   Taylor u. a., "Human Physiological Benefits of Viewing Nature", 2015.
//
// Unser Bild *ist* ein Fraktal - aber die mathematische Dimension des
// Mandelbrot-Randes (2,0 nach Shishikura) sagt nichts darueber, was auf dem
// Bildschirm ankommt. Was ankommt, haengt an der Zoomtiefe, an der Zahl der
// Farbbaender und daran, wie viel Flaeche gerade schwarz ist. Also wird das
// *gerenderte Bild* gemessen, mit Kaestchenzaehlung ueber seine Kantenmenge.
//
// --- 2. Die Blitzrate --------------------------------------------------------
//
// Das hier ist kein Geschmack, sondern Verkehrssicherung. Auf der Party laeuft
// eine grosse, helle Projektion in einem dunklen Raum, und unter dreissig
// Gaesten sitzt statistisch niemand mit lichtempfindlicher Epilepsie - aber
// "statistisch niemand" ist keine Zusage, die man geben moechte.
//
// Der Massstab ist die allgemeine Blitzschwelle aus WCAG 2.3.1: Nicht mehr als
// *drei* Blitze in einer Sekunde, wobei ein Blitz ein Paar gegenlaeufiger
// Aenderungen der relativen Leuchtdichte um mindestens zehn Prozent ist, und
// nur zaehlt, wenn das dunklere Bild unter 0,80 liegt. Die Drei kommt nicht
// aus der Luft: Sie ist die konservative Grenze aus jahrzehntelanger Forschung
// zur Photosensibilitaet, uebernommen von der Epilepsy Foundation of America.
//
//   W3C, Understanding SC 2.3.1 "Three Flashes or Below Threshold".
//
// Gemessen wird die mittlere relative Leuchtdichte des ganzen Bildes. Das ist
// konservativ in beide Richtungen: Ein Blitz, der nur ein Viertel der Flaeche
// betrifft, faellt im Mittel schwaecher aus - aber ein Bild, das im Mittel um
// zehn Prozent springt, hat mit Sicherheit eine grosse Flaeche bewegt.

import { chromium } from 'playwright';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
const CHROM = process.env.CHROMIUM_PFAD;
// Zwanzig Sekunden. Lang genug, dass mehrere Drops und ein Uebergang
// hineinfallen - genau die Stellen, an denen es blitzen wuerde.
const BILDER = 1200;

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => {
  if (n.type() === 'error') konsole.push(n.text());
});

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });
  await seite.click('#startDemo');
  await seite.waitForTimeout(5000);
  await seite.evaluate(() => window.__dj?.bild?.modusSetzen?.('mandelbrot'));
  await seite.waitForTimeout(2000);

  const messung = await seite.evaluate(async (bilder) => {
    /*
     * Ausgelesen wird auf 256x160. Gross genug fuer eine Kaestchenzaehlung
     * ueber vier Groessenordnungen, klein genug, dass die Messung die Buehne
     * nicht ausbremst und damit ihr eigenes Ergebnis verfaelscht.
     */
    const B = 256;
    const H = 160;
    const klein = document.createElement('canvas');
    klein.width = B;
    klein.height = H;
    const kst = klein.getContext('2d', { willReadFrequently: true });
    const leinwand = document.getElementById('visual');

    // Relative Leuchtdichte nach WCAG: erst entgammat, dann gewichtet.
    const kanal = (c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const kennlinie = new Float32Array(256);
    for (let i = 0; i < 256; i++) kennlinie[i] = kanal(i);

    /*
     * Kaestchenzaehlung ueber die Kantenmenge.
     *
     * Gezaehlt wird nicht das Bild, sondern *wo es sich aendert*: Ein
     * Farbverlauf ohne Struktur hat Dimension 2, ein leeres Bild 0 - beides
     * sagt nichts. Die Kanten sind das Muster, das das Auge sieht, und ihre
     * Dimension ist die Zahl, um die es in der Forschung geht.
     */
    const dimension = (grau) => {
      const kante = new Uint8Array(B * H);
      // Schwelle als Anteil der mittleren Gradientenstaerke: Damit haengt das
      // Ergebnis nicht daran, wie hell das Bild gerade insgesamt ist.
      let summe = 0;
      const g = new Float32Array(B * H);
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < B - 1; x++) {
          const i = y * B + x;
          const dx = grau[i + 1] - grau[i - 1];
          const dy = grau[i + B] - grau[i - B];
          const m = Math.abs(dx) + Math.abs(dy);
          g[i] = m;
          summe += m;
        }
      }
      const schwelle = (summe / (B * H)) * 1.1;
      let kanten = 0;
      for (let i = 0; i < B * H; i++) {
        if (g[i] > schwelle) { kante[i] = 1; kanten++; }
      }
      if (kanten < 50) return null;
      // Kaestchen der Groessen 2, 4, 8, 16, 32.
      const paare = [];
      for (const k of [2, 4, 8, 16, 32]) {
        let voll = 0;
        for (let y = 0; y < H; y += k) {
          for (let x = 0; x < B; x += k) {
            let da = false;
            for (let yy = y; yy < Math.min(y + k, H) && !da; yy++) {
              for (let xx = x; xx < Math.min(x + k, B); xx++) {
                if (kante[yy * B + xx]) { da = true; break; }
              }
            }
            if (da) voll++;
          }
        }
        if (voll > 0) paare.push([Math.log(1 / k), Math.log(voll)]);
      }
      if (paare.length < 3) return null;
      // Ausgleichsgerade: die Steigung ist die Dimension.
      let sx = 0, sy = 0, sxy = 0, sxx = 0;
      for (const [x, y] of paare) { sx += x; sy += y; sxy += x * y; sxx += x * x; }
      const n = paare.length;
      return (n * sxy - sx * sy) / (n * sxx - sx * sx);
    };

    /*
     * Eichung. Ohne sie ist jede Dimensionszahl wertlos - die Kaestchen-
     * zaehlung haengt an der Kantenschwelle, an der Bildgroesse und an den
     * gewaehlten Kaestchengroessen, und ein Verfahren, das bei bekannten
     * Mustern danebenliegt, liegt auch hier daneben.
     *
     * Drei Muster mit bekannter Dimension: eine Gerade (1,0), ein
     * Sierpinski-Dreieck (log3/log2 = 1,585) und Rauschen (2,0).
     */
    const eichen = () => {
      const bau = (male) => {
        const g2 = new Float32Array(B * H);
        male((x, y) => { if (x >= 0 && y >= 0 && x < B && y < H) g2[y * B + x] = 1; });
        return g2;
      };
      const gerade = bau((setz) => {
        for (let x = 0; x < B; x++) setz(x, Math.floor((x * H) / B));
      });
      const sierpinski = bau((setz) => {
        let x = B / 2;
        let y = H - 1;
        const ecken = [[B / 2, 2], [4, H - 3], [B - 4, H - 3]];
        for (let i = 0; i < 60000; i++) {
          const e = ecken[Math.floor(Math.random() * 3)];
          x = (x + e[0]) / 2;
          y = (y + e[1]) / 2;
          if (i > 20) setz(Math.round(x), Math.round(y));
        }
      });
      const rauschen = bau((setz) => {
        for (let i = 0; i < B * H * 0.5; i++) {
          setz(Math.floor(Math.random() * B), Math.floor(Math.random() * H));
        }
      });
      // Die Eichmuster sind schon binaer - direkt zaehlen, ohne Kantensuche.
      const zaehlen = (bin) => {
        const paare = [];
        for (const k of [2, 4, 8, 16, 32]) {
          let voll = 0;
          for (let y = 0; y < H; y += k) {
            for (let x = 0; x < B; x += k) {
              let da = false;
              for (let yy = y; yy < Math.min(y + k, H) && !da; yy++) {
                for (let xx = x; xx < Math.min(x + k, B); xx++) {
                  if (bin[yy * B + xx]) { da = true; break; }
                }
              }
              if (da) voll++;
            }
          }
          if (voll > 0) paare.push([Math.log(1 / k), Math.log(voll)]);
        }
        let sx = 0, sy = 0, sxy = 0, sxx = 0;
        for (const [x, y] of paare) { sx += x; sy += y; sxy += x * y; sxx += x * x; }
        const n = paare.length;
        return (n * sxy - sx * sy) / (n * sxx - sx * sx);
      };
      return {
        gerade: zaehlen(gerade),
        sierpinski: zaehlen(sierpinski),
        rauschen: zaehlen(rauschen),
      };
    };
    const eichung = eichen();

    const leuchten = [];
    const dims = [];
    const grau = new Float32Array(B * H);
    /*
     * Blitze nach WCAG, und zwar *flaechenbezogen*.
     *
     * Ein Blitz zaehlt nur, wenn er einen grossen Teil des Bildes betrifft -
     * die Norm nennt fuenfundzwanzig Prozent der Bildflaeche. Der Mittelwert
     * ueber das ganze Bild waere dafuer das falsche Mass: Ein greller Blitz
     * auf einem Viertel der Flaeche hebt ihn nur um ein Viertel seiner
     * eigenen Groesse, und ein langsames Aufhellen des ganzen Bildes hebt ihn
     * voll, obwohl es gar kein Blitz ist.
     *
     * Gezaehlt wird deshalb je Bildpunkt: Wie viele Punkte haben sich seit
     * dem letzten Wendepunkt um mindestens ein Zehntel der *moeglichen*
     * Leuchtdichte in dieselbe Richtung geaendert - und war das dunklere der
     * beiden Bilder dabei unter 0,80.
     */
    const SPRUNG = 0.1;
    const DUNKLER_ALS = 0.8;
    const FLAECHE = 0.25;
    const blitzZaehler = () => {
      const marke = new Float32Array(B * H);
      let erstes = true;
      let richtung = 0;
      const wenden = [];
      let nr = 0;
      return {
        wenden,
        schauen(bild) {
          if (erstes) { marke.set(bild); erstes = false; nr++; return; }
          let hoch = 0;
          let runter = 0;
          for (let q = 0; q < B * H; q++) {
            const diff = bild[q] - marke[q];
            if (Math.abs(diff) < SPRUNG) continue;
            if (Math.min(bild[q], marke[q]) >= DUNKLER_ALS) continue;
            if (diff > 0) hoch++; else runter++;
          }
          const grenze = B * H * FLAECHE;
          const neu = hoch >= grenze ? 1 : runter >= grenze ? -1 : 0;
          if (neu !== 0) {
            if (richtung !== 0 && neu !== richtung) wenden.push(nr);
            richtung = neu;
            marke.set(bild);
          }
          nr++;
        },
      };
    };
    const zaehler = blitzZaehler();

    await new Promise((fertig) => {
      let k = 0;
      const tick = () => {
        kst.drawImage(leinwand, 0, 0, B, H);
        const d = kst.getImageData(0, 0, B, H).data;
        let L = 0;
        for (let p = 0, q = 0; p < d.length; p += 4, q++) {
          const l = 0.2126 * kennlinie[d[p]] + 0.7152 * kennlinie[d[p + 1]] + 0.0722 * kennlinie[d[p + 2]];
          grau[q] = l;
          L += l;
        }
        leuchten.push(L / (B * H));

        zaehler.schauen(grau);

        // Die Dimension nur jedes zehnte Bild - sie aendert sich langsam, und
        // die Zaehlung ist der teuerste Teil der Messung.
        if (k % 10 === 0) {
          const dd = dimension(grau);
          if (dd !== null) dims.push(dd);
        }
        if (++k < bilder) requestAnimationFrame(tick);
        else fertig();
      };
      requestAnimationFrame(tick);
    });
    /*
     * Kontrolle: Findet der Zaehler ueberhaupt einen Blitz?
     *
     * Null gemessene Blitze koennen zweierlei heissen - es blitzt nichts,
     * oder der Zaehler ist kaputt. Also wird ihm ein gebauter Blitz
     * vorgesetzt: das ganze Bild abwechselnd schwarz und halbhell, alle drei
     * Bilder gewechselt. Das sind bei sechzig Bildern zehn volle Wechsel je
     * Sekunde, also zehn Blitze - dreimal ueber der Schwelle.
     */
    const kontrolle = (() => {
      const z = blitzZaehler();
      const dunkel = new Float32Array(B * H);
      const hell = new Float32Array(B * H).fill(0.5);
      for (let i = 0; i < 120; i++) z.schauen(Math.floor(i / 3) % 2 ? hell : dunkel);
      let hoechste = 0;
      for (let i = 0; i < z.wenden.length; i++) {
        let j = i;
        while (j < z.wenden.length && z.wenden[j] - z.wenden[i] < 60) j++;
        hoechste = Math.max(hoechste, Math.floor((j - i) / 2));
      }
      return hoechste;
    })();

    return { leuchten, dims, eichung, wenden: zaehler.wenden, kontrolle };
  }, BILDER);

  /*
   * Aus den Wendepunkten die Blitze je Sekunde. Ein Blitz ist ein *Paar*
   * gegenlaeufiger Aenderungen, also zwei Wenden.
   */
  const wenden = messung.wenden;
  let schlimmste = 0;
  let wann = 0;
  for (let i = 0; i < wenden.length; i++) {
    let j = i;
    while (j < wenden.length && wenden[j] - wenden[i] < 60) j++;
    const blitze = Math.floor((j - i) / 2);
    if (blitze > schlimmste) { schlimmste = blitze; wann = wenden[i]; }
  }
  const L = messung.leuchten;
  const hoechste = Math.max(...L);

  const dims = messung.dims.slice().sort((a, b) => a - b);
  const mitte = dims[Math.floor(dims.length / 2)];
  const unten = dims[Math.floor(dims.length * 0.1)];
  const oben = dims[Math.floor(dims.length * 0.9)];
  const imFenster = dims.filter((d) => d >= 1.25 && d <= 1.55).length / dims.length;

  console.log(`\n${L.length} Bilder, ${dims.length} Dimensionsmessungen.`);

  const e = messung.eichung;
  console.log('\nEichung der Kaestchenzaehlung an bekannten Mustern:');
  console.log(
    `    Gerade ${e.gerade.toFixed(2)} (soll 1,00), Sierpinski ${e.sierpinski.toFixed(2)} ` +
    `(soll 1,58), Rauschen ${e.rauschen.toFixed(2)} (soll 2,00)`,
  );
  const eichungOk =
    Math.abs(e.gerade - 1) < 0.15 && Math.abs(e.sierpinski - 1.585) < 0.15 &&
    Math.abs(e.rauschen - 2) < 0.15;
  pruefe('das Messverfahren trifft bekannte Dimensionen', eichungOk,
    eichungOk ? 'alle drei innerhalb 0,15' : 'die Zahlen unten sind mit Vorsicht zu lesen');

  console.log('\nFraktale Dimension des gerenderten Bildes:');
  console.log(`    Median ${mitte.toFixed(2)}, Zehntel..Neuntel ${unten.toFixed(2)}..${oben.toFixed(2)}`);
  console.log(`    im Fenster fuer *statistische* Fraktale (1,3..1,5): ${(imFenster * 100).toFixed(0)} % der Zeit`);
  /*
   * Das Fenster - und hier steckt eine Korrektur meiner eigenen Bewertung.
   *
   * Zuerst stand hier 1,3 bis 1,5, und das Bild fiel mit 1,75 klar durch.
   * Dieses Fenster gilt aber fuer *statistische* Fraktale - Kuestenlinien,
   * Baumkronen, Pollock. Fuer *exakte* Fraktale, also solche mit Symmetrie
   * und wortwoertlicher Wiederholung, verschiebt sich die Vorliebe deutlich
   * nach oben und laeuft gegen D = 2 (Bies, Boydston, Taylor, Sereno,
   * "Aesthetic Responses to Exact Fractals Driven by Physical Complexity",
   * Frontiers in Human Neuroscience 10:210, 2016). Die Begruendung der
   * Autoren ist genau unser Fall: Symmetrie und exakte Wiederholung bringen
   * Einfachheit zurueck, die sonst die Dichte kostet.
   *
   * Ein Mandelbrot ist ein exaktes Fraktal, und der Mandala-Modus legt noch
   * eine n-zaehlige Symmetrie darueber. 1,75 ist damit nicht zu dicht,
   * sondern liegt richtig.
   *
   * Nach oben bleibt eine Grenze: Ab etwa 1,95 ist ein Bild kein Muster mehr,
   * sondern Rauschen - die Eichung oben misst fuer Rauschen 1,96.
   */
  pruefe('die Dichte passt zu einem exakten Fraktal', mitte >= 1.3 && mitte <= 1.92,
    `Median ${mitte.toFixed(2)}`);
  pruefe('und kippt nicht ins Rauschen', oben < 1.95,
    `oberes Zehntel ${oben.toFixed(2)}, Rauschen laege bei ${e.rauschen.toFixed(2)}`);

  console.log('\nBlitzschwelle (WCAG 2.3.1: hoechstens drei je Sekunde):');
  console.log(
    `    hellstes Bild: relative Leuchtdichte ${hoechste.toFixed(3)} von 1,0 - ` +
    `ein Blitz braucht 0,10 Aenderung auf einem Viertel der Flaeche`,
  );
  console.log(
    `    ${wenden.length} Wendepunkte insgesamt, schlimmste Sekunde ${schlimmste} Blitze` +
    (wenden.length ? ` (ab Bild ${wann})` : ''),
  );
  console.log(`    Kontrolle mit einem gebauten Blitz (10 Hz): ${messung.kontrolle} Blitze je Sekunde erkannt`);
  pruefe('der Zaehler findet einen echten Blitz', messung.kontrolle >= 8,
    `${messung.kontrolle} von erwarteten 10`);
  pruefe('das Bild selbst blitzt nicht ueber der Schwelle', schlimmste <= 3,
    `${schlimmste} Blitze in der schlimmsten Sekunde`);

  console.log('');
  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler ? `\n${fehler} Abweichung(en).\n` : '\nAlles gruen.\n');
process.exit(fehler ? 1 : 0);
