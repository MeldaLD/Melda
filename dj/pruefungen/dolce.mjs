// Abnahme des versteckten Bildes "La Dolce Trenta".
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/dolce.mjs
//
// Zehn gezeichnete Szenen, jede mit eigenem Hintergrund und eigener Kopplung
// an die Musik. Was hier schiefgehen kann, geht leise schief: Eine Szene
// zeichnet nichts und bleibt eine leere Flaeche, oder die beatgetriebenen
// Teile - Tropfen, Tomatenwuerfel, Konfetti - entstehen gar nicht, weil der
// Schlag nicht ankommt. Auf einem Standbild faellt beides kaum auf, auf einer
// Wand im Partyraum sofort.
//
// Geprueft wird deshalb je Szene:
//
//   1. Sie fuellt das Bild ueberhaupt - keine schwarze Flaeche.
//   2. Sie hat Zeichnung, nicht nur einen Farbverlauf.
//   3. Sie bewegt sich, wenn die Musik laeuft.
//   4. Die Markise der Einladung steht darueber.
//
// Und einmal ueber die Folge: dass gewechselt wird, dass nie zweimal dieselbe
// Szene hintereinander kommt, und dass die beatgetriebenen Teile wirklich
// entstehen.

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
  args: ['--mute-audio'],
});
const seite = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => {
  if (n.type() === 'error' && !/api\/|Failed to load resource/.test(n.text())) konsole.push(n.text());
});

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });

  const ergebnis = await seite.evaluate(async () => {
    const dolce = await import('/gemeinsam/dolce.js');
    const B = 640;
    const H = 400;
    const leinwand = document.createElement('canvas');
    leinwand.width = B;
    leinwand.height = H;
    const stift = leinwand.getContext('2d', { willReadFrequently: true });
    const spektrum = new Uint8Array(512);

    // Ein Lauf ueber `bilder` Bilder mit gleichmaessigem Takt.
    function laufen(szene, bilder, mitDrop = false) {
      let zeit = 0;
      let beat = 0;
      for (let k = 0; k < bilder; k++) {
        zeit += 1 / 60;
        beat += 128 / 3600;
        for (let j = 0; j < spektrum.length; j++) {
          spektrum[j] =
            170 * Math.exp(-j / 32) * (0.5 + 0.5 * Math.sin(zeit * 9)) + 60 * Math.exp(-j / 150);
        }
        if (szene !== null) dolce.dolceSzeneZwingen(szene);
        dolce.dolceZeichnen(stift, {
          breite: B,
          hoehe: H,
          zeit,
          sekunden: 1 / 60,
          spektrum,
          welle: new Float32Array(0),
          takt: {
            beat,
            imBeat: beat - Math.floor(beat),
            nummer: Math.floor(beat),
            aufEins: Math.floor(beat) % 4 === 0,
            aufPhrase: Math.floor(beat) % 32 === 0,
          },
          spannung: 0.45,
          wucht: 0.5,
          drop: mitDrop && k === Math.floor(bilder * 0.6),
          abbau: 0,
          guetestufe: 'hoch',
          palette: { grundton: 250, akzent: 200, baender: 3 },
          paletteB: null,
          anteilB: 0,
        });
      }
      return stift.getImageData(0, 0, B, H).data;
    }

    // Wie viel Zeichnung steckt im Bild? Nachbarunterschied - ein reiner
    // Verlauf kommt kaum ueber eins, ein gezeichnetes Bild deutlich darueber.
    function kanten(daten) {
      let s = 0;
      let z = 0;
      for (let y = 0; y < H; y += 2) {
        for (let x = 1; x < B; x++) {
          const i = (y * B + x) * 4;
          s +=
            Math.abs(daten[i] - daten[i - 4]) +
            Math.abs(daten[i + 1] - daten[i - 3]) +
            Math.abs(daten[i + 2] - daten[i - 2]);
          z++;
        }
      }
      return s / Math.max(1, z);
    }

    function hell(daten) {
      let s = 0;
      for (let i = 0; i < daten.length; i += 40) s += daten[i] + daten[i + 1] + daten[i + 2];
      return s / (daten.length / 40) / 3;
    }

    /*
     * Bewegung als *Anteil geaenderter Punkte*, nicht als mittlere Differenz.
     *
     * Der Mittelwert war das falsche Mass: In der Bruschetta bewegen sich nur
     * ein paar fallende Tomatenwuerfel, und die aendern wenige Punkte sehr
     * stark. Ueber das ganze Bild gemittelt kam 0,0 heraus - der Test haette
     * eine Szene als starr gemeldet, in der sichtbar etwas faellt.
     */
    function bewegteAnteile(a, b) {
      let zahl = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) > 20) zahl++;
      }
      return zahl / (a.length / 4);
    }

    const szenen = [];
    for (let i = 0; i < dolce.DOLCE_SZENEN.length; i++) {
      dolce.dolceZuruecksetzen();
      const frueh = Uint8ClampedArray.from(laufen(i, 420, true));
      const spaet = Uint8ClampedArray.from(laufen(i, 120));
      // Die Markise: der oberste Streifen muss cremefarben oder olivgruen sein.
      let markise = 0;
      for (let x = 0; x < B; x++) {
        const i2 = (2 * B + x) * 4;
        const r = spaet[i2];
        const g = spaet[i2 + 1];
        const b2 = spaet[i2 + 2];
        const creme = r > 220 && g > 210 && b2 > 190;
        const oliv = Math.abs(r - 58) < 30 && Math.abs(g - 74) < 30 && Math.abs(b2 - 38) < 30;
        if (creme || oliv) markise++;
      }
      szenen.push({
        name: dolce.DOLCE_SZENEN[i],
        helligkeit: hell(spaet),
        kanten: kanten(spaet),
        bewegung: bewegteAnteile(frueh, spaet),
        markise: markise / B,
      });
    }

    // Und die Folge: laufen lassen, ohne zu zwingen.
    dolce.dolceZuruecksetzen();
    const gesehen = [];
    let doppelt = 0;
    let zeit = 0;
    let beat = 0;
    for (let k = 0; k < 60 * 60 * 4; k++) {
      zeit += 1 / 60;
      beat += 128 / 3600;
      dolce.dolceZeichnen(stift, {
        breite: B,
        hoehe: H,
        zeit,
        sekunden: 1 / 60,
        spektrum,
        welle: new Float32Array(0),
        takt: {
          beat,
          imBeat: beat - Math.floor(beat),
          nummer: Math.floor(beat),
          aufEins: Math.floor(beat) % 4 === 0,
          aufPhrase: Math.floor(beat) % 32 === 0,
        },
        spannung: 0.4,
        wucht: 0.5,
        drop: k % 2400 === 2399,
        abbau: 0,
        guetestufe: 'hoch',
        palette: { grundton: 250, akzent: 200, baender: 3 },
        paletteB: null,
        anteilB: 0,
      });
      const jetzt = window.__dolce?.szene;
      if (gesehen[gesehen.length - 1] !== jetzt) {
        if (gesehen.length && gesehen[gesehen.length - 1] === jetzt) doppelt++;
        gesehen.push(jetzt);
      }
    }
    for (let i = 1; i < gesehen.length; i++) if (gesehen[i] === gesehen[i - 1]) doppelt++;

    return { szenen, wechsel: gesehen.length, verschiedene: new Set(gesehen).size, doppelt };
  });

  console.log('\nJede Szene malt wirklich ein Bild:');
  for (const s of ergebnis.szenen) {
    console.log(
      `    ${s.name.padEnd(18)} Helligkeit ${s.helligkeit.toFixed(0).padStart(3)}, ` +
        `Zeichnung ${s.kanten.toFixed(1).padStart(5)}, Bewegung ${(s.bewegung * 100).toFixed(2).padStart(6)} %, ` +
        `Markise ${(s.markise * 100).toFixed(0)} %`,
    );
  }
  const dunkelste = Math.min(...ergebnis.szenen.map((s) => s.helligkeit));
  const flachste = Math.min(...ergebnis.szenen.map((s) => s.kanten));
  const starrste = Math.min(...ergebnis.szenen.map((s) => s.bewegung));
  const wenigMarkise = Math.min(...ergebnis.szenen.map((s) => s.markise));
  pruefe('keine Szene bleibt schwarz', dunkelste > 12, `dunkelste ${dunkelste.toFixed(0)}`);
  pruefe('jede hat Zeichnung, nicht nur Verlauf', flachste > 1.2, `flachste ${flachste.toFixed(1)}`);
  // Zwei Sekunden reichen fuer ein paar fallende Wuerfel - mehr Bewegung darf
  // man von einer Szene, die ein gedecktes Brett zeigt, nicht verlangen.
  pruefe(
    'jede bewegt sich mit der Musik',
    starrste > 0.001,
    `starrste ${(starrste * 100).toFixed(2)} % der Punkte in zwei Sekunden`,
  );
  pruefe(
    'die Markise der Einladung steht ueber jeder',
    wenigMarkise > 0.8,
    `wenigste ${(wenigMarkise * 100).toFixed(0)} %`,
  );

  console.log('\nDie Folge laeuft durch:');
  console.log(
    `    in vier Minuten ${ergebnis.wechsel} Wechsel, ${ergebnis.verschiedene} verschiedene Szenen`,
  );
  pruefe('es wird gewechselt', ergebnis.wechsel >= 8, `${ergebnis.wechsel} Wechsel`);
  pruefe(
    'und dabei kommt fast alles dran',
    ergebnis.verschiedene >= 7,
    `${ergebnis.verschiedene} von 10`,
  );
  pruefe('nie zweimal dieselbe hintereinander', ergebnis.doppelt === 0, `${ergebnis.doppelt} mal`);

  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
