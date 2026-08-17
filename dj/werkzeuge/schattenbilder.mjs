// Standbilder vom Schatten-DJ - eine Lage je Bild.
//
//   node werkzeuge/schattenbilder.mjs [ordner]
//
// Eine Abnahme sagt, ob die Hand dort ist, wo sie sein soll. Ob die Figur
// dabei wie ein Mensch aussieht, sagt sie nicht - das sieht man nur. Dieses
// Werkzeug legt fuer jede Haltung ein Bild ab, mit dem Fraktal als
// Platzhalter dahinter, damit der Gegenlicht-Eindruck stimmt.

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
const CHROM = process.env.CHROMIUM_PFAD;
const ZIEL = path.resolve(process.argv[2] ?? 'werkzeuge/schattenbilder');

// Je Bild: Name, Lage, und wieviele Bilder vorher gerechnet werden. Das
// Vorlaufen ist noetig, weil die Haende ihren Zielen nachlaufen - ein
// einzelnes Bild zeigte immer die Ruhehaltung.
const LAGEN = [
  ['01-ruhe', {}, 120],
  ['02-aufbau-halb', { spannung: 0.6, wucht: 0.6 }, 120],
  ['03-aufbau-voll', { spannung: 1, wucht: 0.85 }, 120],
  ['04-drop', { spannung: 0.9, wucht: 1, drop: true }, 120],
  ['05-breakdown', { abbau: 0.85, wucht: 0.15 }, 160],
  ['06-uebergang-mitte', { anteilB: 0.5, wucht: 0.5 }, 140],
  ['07-uebergang-fertig', { anteilB: 0.95, wucht: 0.5 }, 140],
];

await fs.mkdir(ZIEL, { recursive: true });

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage({ viewport: { width: 1280, height: 720 } });

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });

  for (const [name, grund, bilder] of LAGEN) {
    const daten = await seite.evaluate(
      async ({ grund, bilder }) => {
        const m = await import('/gemeinsam/schattendj.js');
        // Ohne das bleibt das Bild leer: Die Teile kommen ueber onload, und die
        // Schleife unten laeuft synchron durch.
        await m.schattenLaden();
        const lein = document.createElement('canvas');
        lein.width = 1280;
        lein.height = 720;
        const stift = lein.getContext('2d');

        /*
         * Ein Platzhalter fuer das Fraktal: konzentrische Ringe in den Farben
         * der Palette. Ohne etwas Helles dahinter ist eine schwarze
         * Silhouette auf schwarzem Grund nicht zu beurteilen - und genau der
         * Kontrast ist ja der Zweck der Figur.
         */
        const v = stift.createRadialGradient(640, 300, 20, 640, 300, 700);
        v.addColorStop(0, '#ffd9a0');
        v.addColorStop(0.35, '#e0663c');
        v.addColorStop(0.7, '#3b2a6b');
        v.addColorStop(1, '#0a0a18');
        stift.fillStyle = v;
        stift.fillRect(0, 0, 1280, 720);
        for (let r = 60; r < 760; r += 46) {
          stift.strokeStyle = 'rgba(255,255,255,0.10)';
          stift.lineWidth = 10;
          stift.beginPath();
          stift.arc(640, 300, r, 0, Math.PI * 2);
          stift.stroke();
        }
        const hintergrund = stift.getImageData(0, 0, 1280, 720);

        m.schattenZuruecksetzen();
        m.schattenSetzen(true);
        const dt = 1 / 60;
        for (let i = 0; i < bilder; i++) {
          const beat = (i * dt * 128) / 60;
          stift.putImageData(hintergrund, 0, 0);
          m.schattenZeichnen(stift, 1280, 720, {
            sekunden: dt,
            takt: {
              beat,
              imBeat: beat - Math.floor(beat),
              nummer: Math.floor(beat),
              aufEins: Math.floor(beat) % 4 === 0,
              aufPhrase: Math.floor(beat) % 32 === 0,
            },
            spannung: 0,
            abbau: 0,
            wucht: 0.5,
            // Der Drop soll im vorletzten Bild ausgeloest werden, nicht in
            // jedem - sonst steht dropHalt dauerhaft auf eins.
            drop: grund.drop ? i === bilder - 12 : false,
            anteilB: 0,
            palette: ['#2b1b4d', '#7a3ba8', '#e0663c', '#ffd9a0'],
            guetestufe: 'hoch',
            ...grund,
            ...(grund.drop ? { drop: i === bilder - 12 } : {}),
          });
        }
        return lein.toDataURL('image/png');
      },
      { grund, bilder },
    );
    const roh = Buffer.from(daten.split(',')[1], 'base64');
    await fs.writeFile(path.join(ZIEL, `${name}.png`), roh);
    console.log(`  ${name}.png – ${Math.round(roh.length / 1024)} kB`);
  }
} finally {
  await browser.close();
}

console.log(`\n${LAGEN.length} Bilder in ${ZIEL}\n`);
