// Aus fuenf gezeichneten Silhouetten die Teile fuer den Schatten-DJ machen.
//
//   node werkzeuge/schattenteile.mjs [quellordner]
//
// Die Quellbilder sind schwarze Formen auf weissem Grund. Gebraucht werden
// schwarze Formen auf *nichts* - und zwar so klein wie moeglich, denn sie
// landen als Text in der ausgelieferten Einzeldatei.
//
// Warum als Text und nicht als Datei daneben: Die Buehne laeuft in zwei
// Fassungen - aus einzelnen Modulen unter /buehne und als eine Datei unter
// /dj. Eine Bilddatei muesste in beiden Fassungen unter einem anderen Pfad
// liegen, und ein toter Bildpfad faellt erst am Abend auf. Als Zeichenkette
// im Modul gibt es diesen Fall nicht.
//
// Drei Schritte je Bild:
//
//   1. Weiss wird durchsichtig. Nicht mit einer harten Schwelle, sondern
//      ueber die Helligkeit: Deckung = 255 minus Helligkeit. Damit bleiben
//      die weichen Kanten der Zeichnung erhalten, statt zu einer Treppe zu
//      werden. Die Farbe selbst wird auf Schwarz gesetzt - ein Schatten hat
//      keine eigene Farbe.
//   2. Zugeschnitten auf das, was wirklich da ist. Die Zeichnungen haben viel
//      Luft; ohne Zuschnitt muesste jede Pose diese Luft mitrechnen, und die
//      Drehpunkte laegen irgendwo im Nichts.
//   3. Verkleinert. Die Figur nimmt am Bildschirm gut ein Viertel der Hoehe
//      ein; ein Kopf ist dort selten groesser als dreihundert Bildpunkte.
//      Alles darueber ist Ballast in einer Datei, die ueber Mobilfunk geladen
//      wird.

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
const CHROM = process.env.CHROMIUM_PFAD;
const QUELLE = path.resolve(process.argv[2] ?? 'werkzeuge/schattenquellen');
const ZIEL = path.resolve('public/gemeinsam/schattenteile.js');

/*
 * Die Teile, ihre Quelldatei und die groesste Kante nach dem Verkleinern.
 *
 * Die Zahlen sind nicht gleich, weil die Teile nicht gleich gross auf dem
 * Bildschirm landen: Das Pult ist so breit wie ein halbes Bild, ein Oberarm
 * so lang wie ein Kopf hoch ist.
 */
const TEILE = [
  { name: 'pult', datei: 'pult.jpeg', kante: 720 },
  { name: 'kopf', datei: 'kopf.jpeg', kante: 320 },
  { name: 'rumpf', datei: 'rumpf.jpeg', kante: 420 },
  { name: 'oberarm', datei: 'oberarm.png', kante: 260 },
  { name: 'unterarm', datei: 'unterarm.png', kante: 300 },
];

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage({ viewport: { width: 400, height: 300 } });

const fertig = [];
try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'domcontentloaded' });

  for (const teil of TEILE) {
    const roh = await fs.readFile(path.join(QUELLE, teil.datei));
    const art = teil.datei.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const quelle = `data:${art};base64,${roh.toString('base64')}`;

    const aus = await seite.evaluate(
      async ({ quelle, kante }) => {
        const bild = new Image();
        bild.src = quelle;
        await bild.decode();

        const a = document.createElement('canvas');
        a.width = bild.naturalWidth;
        a.height = bild.naturalHeight;
        const sa = a.getContext('2d', { willReadFrequently: true });
        sa.drawImage(bild, 0, 0);
        const feld = sa.getImageData(0, 0, a.width, a.height);
        const d = feld.data;

        /*
         * Weiss raus, Schwarz rein.
         *
         * Die Deckung kommt aus der Helligkeit, damit weiche Kanten weich
         * bleiben. Ganz unten wird abgeschnitten: JPEG-Bilder haben im
         * "weissen" Grund Werte um 250, und ohne Schwelle bliebe ein
         * flaechiger Schleier von zwei Prozent uebrig - auf einem hellen
         * Fraktal waere das ein sichtbarer grauer Kasten um die Figur.
         */
        let lx = a.width, ly = a.height, rx = -1, ry = -1;
        for (let i = 0; i < d.length; i += 4) {
          const hell = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
          let deckung = 255 - hell;
          if (deckung < 24) deckung = 0;
          else deckung = Math.min(255, Math.round((deckung - 24) * (255 / 231)));
          /*
           * In Stufen runden - und das ist kein Detail, sondern der
           * Unterschied zwischen 214 und 30 Kilobyte.
           *
           * Die Quellbilder sind JPEG. In ihren "schwarzen" Flaechen stehen
           * keine Nullen, sondern 1, 3, 2, 0, 4 - das Rauschen der
           * Kompression. Nach dem Umrechnen sind das lauter *verschiedene*
           * Deckungswerte, und PNG kann nichts davon zusammenfassen: Eine
           * Flaeche, die fuer das Auge einfarbig ist, kostet dann so viel wie
           * ein Foto.
           *
           * Also wird oben und unten hart gefangen und dazwischen in
           * Sechzehnerschritten gerundet. Sechzehn Stufen sind an einer
           * weichen Kante von zwei, drei Bildpunkten nicht zu unterscheiden.
           */
          if (deckung > 238) deckung = 255;
          else if (deckung < 18) deckung = 0;
          else deckung = Math.round(deckung / 16) * 16;
          d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = deckung;
          if (deckung > 8) {
            const p = i / 4;
            const x = p % a.width;
            const y = (p / a.width) | 0;
            if (x < lx) lx = x;
            if (x > rx) rx = x;
            if (y < ly) ly = y;
            if (y > ry) ry = y;
          }
        }
        if (rx < 0) return null;
        sa.putImageData(feld, 0, 0);

        // Zuschneiden und verkleinern in einem Zug.
        const bw = rx - lx + 1;
        const bh = ry - ly + 1;
        const f = Math.min(1, kante / Math.max(bw, bh));
        const b = document.createElement('canvas');
        b.width = Math.max(1, Math.round(bw * f));
        b.height = Math.max(1, Math.round(bh * f));
        const sb = b.getContext('2d');
        sb.imageSmoothingQuality = 'high';
        sb.drawImage(a, lx, ly, bw, bh, 0, 0, b.width, b.height);
        /*
         * Wo beim Pult die Platte anfaengt.
         *
         * Das Bild ist oben ausgefranst - die beiden Plattenteller ragen
         * ueber die Tischkante. Der Koerper des DJs muss aber genau an der
         * *Kante* abgeschnitten werden, nicht am hoechsten Punkt der Teller.
         * Gesucht ist also die erste Zeile, in der fast die ganze Breite
         * schwarz ist; das ist die Platte. Das hier auszurechnen ist
         * zuverlaessiger, als die Zahl im Zeichner zu raten - sie aendert
         * sich, sobald jemand ein anderes Pult zeichnet.
         */
        const sb2 = b.getContext('2d', { willReadFrequently: true });
        const fb = sb2.getImageData(0, 0, b.width, b.height).data;
        let deckel = 0;
        for (let y = 0; y < b.height; y++) {
          let voll = 0;
          for (let x = 0; x < b.width; x++) if (fb[(y * b.width + x) * 4 + 3] > 128) voll++;
          if (voll > b.width * 0.9) { deckel = y / b.height; break; }
        }

        /*
         * Wo beim Rumpf der Aermel aufhoert - also wo ein Arm weitergehen
         * muesste.
         *
         * Das hatte ich zuerst geschaetzt ("zweiundvierzig Prozent der
         * Breite"), und man sah es sofort: Die Arme hingen mitten an der
         * Brust statt an der Schulter. Eine geschaetzte Zahl gilt ausserdem
         * nur fuer *dieses* Bild - wer eine andere Figur zeichnet, muesste
         * sie neu raten.
         *
         * Gemessen ist es eindeutig. Die breiteste Zeile des Bildes ist die
         * Schulterlinie; von dort abwaerts laeuft der Aermel und wird
         * schmaler. Wo die Breite unter zweiundneunzig Prozent der groessten
         * faellt, ist der Aermel zu Ende - dort sitzt das Gelenk, an der
         * aeusseren Kante.
         */
        const zeilen = [];
        for (let y = 0; y < b.height; y++) {
          let l = -1, r = -1;
          for (let x = 0; x < b.width; x++) {
            if (fb[(y * b.width + x) * 4 + 3] > 128) { if (l < 0) l = x; r = x; }
          }
          zeilen.push({ l, r, w: r - l });
        }
        const breiteste = zeilen.reduce((a, z, i) => (z.w > zeilen[a].w ? i : a), 0);
        /*
         * Und hier war der zweite Anlauf noetig.
         *
         * "Nach unten laufen, bis die Breite faellt" klingt richtig und ist
         * es nicht: Der Rumpf ist an der Huefte fast so breit wie an den
         * Schultern, also lief die Suche bis in die Mitte des Bildes und
         * setzte das Gelenk dorthin.
         *
         * Das Aermelende ist keine Frage der Breite, sondern eine *Kante*:
         * An genau einer Stelle springt der aeussere Rand nach innen. Gesucht
         * ist deshalb die groesste Aenderung von einer Zeile zur naechsten,
         * und nur im oberen Drittel - weiter unten gibt es keinen Aermel mehr.
         */
        let ende = breiteste;
        let groessterSprung = 0;
        for (let y = breiteste; y < Math.min(b.height - 1, b.height * 0.45); y++) {
          const sprung = zeilen[y].r - zeilen[y + 1].r;
          if (sprung > groessterSprung) { groessterSprung = sprung; ende = y; }
        }
        const arm = { x: zeilen[ende].r / b.width, y: ende / b.height };

        return { daten: b.toDataURL('image/png'), breite: b.width, hoehe: b.height, deckel, arm };
      },
      { quelle, kante: teil.kante },
    );

    if (!aus) throw new Error(`${teil.datei}: nichts Schwarzes gefunden`);
    fertig.push({ ...teil, ...aus });
    console.log(
      `  ${teil.name.padEnd(9)} ${String(aus.breite).padStart(4)}x${String(aus.hoehe).padStart(4)}` +
        `  ${Math.round(aus.daten.length / 1024)} kB`,
    );
  }
} finally {
  await browser.close();
}

const gesamt = fertig.reduce((s, t) => s + t.daten.length, 0);

const kopf = `// Die Teile des Schatten-DJs - erzeugt, nicht von Hand geschrieben.
//
//   node werkzeuge/schattenteile.mjs
//
// Fuenf gezeichnete Silhouetten, weiss herausgerechnet, zugeschnitten und
// verkleinert. Sie stehen hier als Zeichenketten, damit die Buehne in beiden
// Fassungen laeuft - aus Modulen unter /buehne und als Einzeldatei unter /dj -
// ohne dass ein Bildpfad in einer der beiden ins Leere zeigt.
//
// Gesamt ${Math.round(gesamt / 1024)} kB. Wer die Quellbilder aendert, laesst
// das Werkzeug noch einmal laufen; von Hand hier zu editieren ist zwecklos.

`;

const leib = fertig
  .map((t) => `export const ${t.name.toUpperCase()} = {\n  breite: ${t.breite},\n  hoehe: ${t.hoehe},\n  deckel: ${t.deckel.toFixed(4)},\n  armX: ${t.arm.x.toFixed(4)},\n  armY: ${t.arm.y.toFixed(4)},\n  daten: '${t.daten}',\n};`)
  .join('\n\n');

await fs.writeFile(ZIEL, `${kopf}${leib}\n`);
console.log(`\n${ZIEL} – ${Math.round(gesamt / 1024)} kB gesamt\n`);
