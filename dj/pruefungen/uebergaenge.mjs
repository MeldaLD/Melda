// Abnahme der Mischmaschine in einem echten Browser.
//
//   node server/index.js &          (oder npm start in einem zweiten Fenster)
//   node pruefungen/uebergaenge.mjs
//
// Hoeren kann diese Pruefung nichts. Sie prueft das, was sich pruefen laesst:
// Kommt ueberhaupt Signal aus dem Ausgang, startet jeder Uebergang auf einer
// Phrasengrenze, und - der wichtigste Punkt - gehoert der Bass zu jedem
// Zeitpunkt nur einem Deck? Zwei Baesse uebereinander sind der Unterschied
// zwischen "gemischt" und "Matsch", und genau das faellt beim Lesen des Codes
// nicht auf.

import { chromium } from 'playwright';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
// In dieser Umgebung liegt Chromium an fester Stelle; sonst nimmt Playwright
// seinen eigenen.
const CHROM = process.env.CHROMIUM_PFAD;

let misslungen = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) misslungen++;
};

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage();
const fehler = [];
seite.on('pageerror', (e) => fehler.push(e.message));
seite.on('console', (n) => n.type() === 'error' && fehler.push(n.text()));

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });
  await seite.click('#startDemo');
  await seite.waitForSelector('#konsole:not([hidden])', { timeout: 120000 });
  await seite.waitForTimeout(3000);

  // Die Steuerleiste blendet sich nach ein paar Sekunden Ruhe aus. Fuer die
  // Pruefung muss sie da sein - also regelmaessig die Maus bewegen.
  const leisteWecken = async () => {
    await seite.mouse.move(Math.random() * 200 + 10, Math.random() * 200 + 10);
    await seite.waitForSelector('.steuerung.sichtbar', { timeout: 5000 });
  };
  await leisteWecken();

  console.log('\nDer Ausgang fuehrt Signal:');
  const pegel = await seite.evaluate(() => parseFloat(document.getElementById('pegelBalken').style.width) || 0);
  console.log(`    Pegelanzeige ${pegel.toFixed(1)} %`);
  pruefe('es kommt Ton heraus', pegel > 0);

  // Energie hoch, damit die ganze Bibliothek in Frage kommt.
  await seite.evaluate(() => {
    const r = document.getElementById('energieRegler');
    r.value = 70;
    r.dispatchEvent(new Event('input'));
  });

  for (const art of ['blende', 'aufzug', 'echo', 'schnitt']) {
    console.log(`\n${art}:`);
    await ruheAbwarten(seite);
    await leisteWecken();

    const verlauf = await seite.evaluate(async (art) => {
      // Direkt am Mixer messen, nicht an der Anzeige: Die Anzeige blendet
      // Beendetes aus und waere fuer diese Frage die falsche Quelle.
      const lies = () => {
        const z = window.__dj.mixer.zustand();
        const j = (deck) => ({
          blende: (deck?.blende ?? 0) * 100,
          // Bass: 0 dB = voll, -32 dB = weg.
          bass: Math.max(0, 1 + (deck?.tief ?? 0) / 32) * 100,
        });
        return {
          A: j(z.decks[0]),
          B: j(z.decks[1]),
          fortschritt: (z.uebergang?.fortschritt ?? 0) * 100,
        };
      };

      // Wer spielt gerade? Das ist das alte Deck - eindeutig, weil vor dem
      // Uebergang nur eines offen steht.
      const vorher = lies();
      const altIstA = vorher.A.blende > vorher.B.blende;

      document.getElementById('artWahl').value = art;
      document.getElementById('jetztUeberblenden').click();

      const proben = [];
      const start = performance.now();
      let begonnen = false;
      while (performance.now() - start < 40000) {
        await new Promise((f) => requestAnimationFrame(f));
        const p = lies();
        proben.push({
          t: (performance.now() - start) / 1000,
          aBlende: p.A.blende, aBass: p.A.bass,
          bBlende: p.B.blende, bBass: p.B.bass,
          fortschritt: p.fortschritt,
        });
        if (p.fortschritt > 0) begonnen = true;
        if (begonnen && p.fortschritt >= 99.5) break;
      }
      return { altIstA, proben };
    }, art);

    const { altIstA, proben } = verlauf;
    const alt = (p) => (altIstA ? { blende: p.aBlende, bass: p.aBass } : { blende: p.bBlende, bass: p.bBass });
    const neu = (p) => (altIstA ? { blende: p.bBlende, bass: p.bBass } : { blende: p.aBlende, bass: p.aBass });

    const aktive = proben.filter((p) => p.fortschritt > 0);
    if (aktive.length === 0) {
      pruefe('der Uebergang startet', false, 'nie begonnen');
      continue;
    }

    const beginn = proben.find((p) => p.fortschritt > 0).t;
    const anfang = aktive[0];
    const ende = aktive[aktive.length - 1];

    console.log(`    Start nach ${beginn.toFixed(1)} s (Warten auf die Phrasengrenze)`);
    console.log(`    alt  Blende ${alt(anfang).blende.toFixed(0)} -> ${alt(ende).blende.toFixed(0)} %`);
    console.log(`    neu  Blende ${neu(anfang).blende.toFixed(0)} -> ${neu(ende).blende.toFixed(0)} %`);

    pruefe('der Alte ist am Ende zu', alt(ende).blende < 5);
    pruefe('der Neue steht am Ende offen', neu(ende).blende > 90);

    if (art === 'blende' || art === 'aufzug') {
      const bassAltMin = Math.min(...aktive.map((p) => alt(p).bass));
      console.log(`    Bass  alt faellt auf ${bassAltMin.toFixed(0)} %, neu endet bei ${neu(ende).bass.toFixed(0)} %`);
      pruefe('der Neue startet ohne Bass', neu(anfang).bass < 30);
      pruefe('der Alte gibt den Bass ab', bassAltMin < 30);
      pruefe('der Neue bekommt den Bass', neu(ende).bass > 90);

      // Der eigentliche Punkt: nie zwei volle Baesse gleichzeitig hoerbar.
      const matsch = aktive.filter(
        (p) => alt(p).bass > 70 && neu(p).bass > 70 && alt(p).blende > 20 && neu(p).blende > 20,
      );
      pruefe('nie zwei volle Baesse gleichzeitig', matsch.length === 0, `${matsch.length} Bilder`);
    }
  }

  console.log(fehler.length ? `\nKonsolenfehler:\n  ${fehler.join('\n  ')}` : '\nKeine Konsolenfehler.');
  if (fehler.length) misslungen++;
} finally {
  await browser.close();
}

console.log(misslungen === 0 ? '\nAlles gruen.\n' : `\n${misslungen} Abweichung(en).\n`);
process.exit(misslungen === 0 ? 0 : 1);

// Warten, bis kein Uebergang mehr laeuft - sonst misst die naechste Runde noch
// die Anzeige der vorherigen.
async function ruheAbwarten(seite) {
  await seite.waitForFunction(() => document.getElementById('uebergang').hidden, null, {
    timeout: 60000,
  });
  await seite.waitForTimeout(500);
}
