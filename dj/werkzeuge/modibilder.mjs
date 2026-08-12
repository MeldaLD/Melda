// Ein Bild von jedem Visualisierungs-Modus.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/werkzeuge/modibilder.mjs
//
// Kein Pruefstand, sondern ein Blick: Vier Modi wechseln sich ueber den Abend
// ab, und ob einer davon gut aussieht, entscheidet kein Zahlenwert. Das
// Werkzeug haelt jeden einmal an, macht ein Bild und legt es ab.

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3200';
const SEITE = process.env.DJ_SEITE ?? '/buehne';
const CHROM = process.env.CHROMIUM_PFAD;
const ZIEL = process.env.DJ_BILDER ?? path.join(process.cwd(), 'dj-bilder');

const MODI = ['iris', 'tunnel', 'strahlen', 'wellen'];

await fs.mkdir(ZIEL, { recursive: true });

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  await seite.goto(`${ADRESSE}${SEITE}`, { waitUntil: 'networkidle' });
  await seite.click('#startDemo');
  await seite.waitForSelector('#konsole:not([hidden])', { timeout: 120000 });
  // Der Tunnel baut sich erst ueber mehrere Takte auf, die Lava braucht auch
  // einen Moment. Vorher ist jedes Bild unfair.
  await seite.waitForTimeout(6000);

  for (const modus of MODI) {
    await seite.evaluate((m) => {
      // Die Zuordnung Track -> Modus fuer diesen Blick ueberschreiben.
      window.__dj.bild.modusFuer = () => m;
    }, modus);
    await seite.waitForTimeout(4000);

    const datei = path.join(ZIEL, `modus-${modus}.png`);
    await seite.locator('#visual').screenshot({ path: datei });
    console.log(`  ${modus.padEnd(9)} -> ${datei}`);
  }
} finally {
  await browser.close();
}
