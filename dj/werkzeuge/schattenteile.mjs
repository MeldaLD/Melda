// Aus der gezeichneten Silhouette des Pultes das Bild fuer den Schatten-DJ
// machen.
//
//   node werkzeuge/schattenteile.mjs [quellordner]
//
// Hier stand einmal eine Gliederpuppe aus fuenf Teilen - Pult, Kopf, Rumpf,
// Oberarm, Unterarm. Die Figur kommt jetzt aus *einer* Zeichnung und wird als
// Umriss an einem Skelett verformt (werkzeuge/schattenumriss.mjs); von den
// fuenf Bildern bleibt nur das Pult, weil es sich nicht bewegt und deshalb
// kein Skelett braucht. Das spart nebenbei 60 kB in der Einzeldatei.
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

// Nur noch ein Teil - aber die Schleife bleibt, weil ein zweites Moebel
// (eine Box, ein Kabel) hier ohne Umbau danebenpasst.
const TEILE = [{ name: 'pult', datei: 'pult.jpeg', kante: 720 }];

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
         * Wo die Plattenteller stehen - dorthin gehoeren die Haende.
         *
         * Vorher stand im Zeichner "ein Viertel der Pultbreite nach aussen",
         * geraten. Die Folge war ein zu kurzer Griff: Der Arm musste sich fuer
         * eine Reichweite von 128 Bildpunkten auf 194 zusammenfalten, der
         * Ellenbogen klappte vor die Brust, und die Figur sah aus, als
         * verschraenke sie die Arme.
         *
         * Gemessen ist es eindeutig. Ueber der Tischkante steht nur Gestell:
         * links ein Teller, rechts ein Teller, dazwischen der Mischer. Der
         * Der linke Teller ist die erste zusammenhaengende Spaltengruppe von
         * links; seine Mitte ist gesucht. Der Schwerpunkt der ganzen linken
         * Haelfte waere falsch - der Mischer in der Mitte zieht ihn nach
         * innen, gemessen 0,236 statt 0,305.
         */
        const streifen = Math.max(1, Math.floor(deckel * b.height));
        const tinte = [];
        for (let x = 0; x < b.width; x++) {
          let n = 0;
          for (let y = 0; y < streifen; y++) if (fb[(y * b.width + x) * 4 + 3] > 128) n++;
          tinte.push(n);
        }
        let links = -1;
        let rechts = -1;
        for (let x = 0; x < b.width / 2; x++) {
          if (tinte[x] > 0) { if (links < 0) links = x; rechts = x; }
          else if (links >= 0) break;
        }
        const teller = links < 0 ? 0.25 : 0.5 - (links + rechts) / 2 / b.width;

        return { daten: b.toDataURL('image/png'), breite: b.width, hoehe: b.height, deckel, teller };
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
// Das Pult, weiss herausgerechnet, zugeschnitten und verkleinert. Es steht
// hier als Zeichenkette, damit die Buehne in beiden Fassungen laeuft - aus
// Modulen unter /buehne und als Einzeldatei unter /dj - ohne dass ein
// Bildpfad in einer der beiden ins Leere zeigt.
//
// 'deckel' ist die Tischkante, 'teller' die Mitte des linken Plattentellers,
// beide als Anteil - dorthin schneidet der Zeichner die Figur ab und dorthin
// legt er die Haende.
//
// Gesamt ${Math.round(gesamt / 1024)} kB. Wer die Quellbilder aendert, laesst
// das Werkzeug noch einmal laufen; von Hand hier zu editieren ist zwecklos.

`;

const leib = fertig
  .map((t) => `export const ${t.name.toUpperCase()} = {\n  breite: ${t.breite},\n  hoehe: ${t.hoehe},\n  deckel: ${t.deckel.toFixed(4)},\n  teller: ${t.teller.toFixed(4)},\n  daten: '${t.daten}',\n};`)
  .join('\n\n');

await fs.writeFile(ZIEL, `${kopf}${leib}\n`);
console.log(`\n${ZIEL} – ${Math.round(gesamt / 1024)} kB gesamt\n`);
