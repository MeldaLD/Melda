// Abnahme des Remixens.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/remix.mjs
//
// Zwei Fragen, und die zweite ist die wichtige:
//
//   1. Staffelt sich die Regie ueber den Abend? (reine Rechnung)
//   2. Laeuft der Track nach einem Loop-Roll noch im Raster?
//
// Punkt 2 ist der Grund, warum es diese Pruefung gibt. Ein Roll wiederholt
// Material, also laufen Musikzeit und Dateizeit auseinander. Wird das Deck
// danach nicht sauber neu verankert, stimmt jede spaetere Beatrechnung nicht
// mehr - und der naechste Uebergang sitzt daneben, ohne dass man den
// Zusammenhang noch erkennen wuerde.

import { chromium } from 'playwright';
import { regieFuer, uebergangWaehlen } from '../public/gemeinsam/remix.js';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
const CHROM = process.env.CHROMIUM_PFAD;

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

// --- 1. Die Regie ueber den Abend -----------------------------------------

console.log('\nDie Regie staffelt sich mit der Energie:');
const stufen = [0.15, 0.45, 0.7, 0.95].map((e) => ({ e, r: regieFuer(e) }));
for (const { e, r } of stufen) {
  console.log(
    `    ${(e * 100).toFixed(0).padStart(3)} %  ${r.name.padEnd(11)} ` +
      `Roll ${r.rollJederNte === Infinity ? 'nie' : `jeder ${r.rollJederNte}.`}, ` +
      `${r.rollLaengen.length} Stufen, Outro ${r.outroVerlaengern ? 'laenger' : 'normal'}`,
  );
}
pruefe('frueh am Abend wird nicht gerollt', stufen[0].r.rollJederNte === Infinity);
pruefe('spaeter immer oefter', stufen[1].r.rollJederNte > stufen[3].r.rollJederNte);
pruefe('und immer schaerfer', stufen[3].r.rollLaengen.length > stufen[1].r.rollLaengen.length);
pruefe(
  'jeder Rollsatz ersetzt genau vier Takte',
  stufen.every((s) => Math.abs(s.rollLaengen ?? s.r.rollLaengen.reduce((a, b) => a + b, 0)) === 16 ||
    Math.abs(s.r.rollLaengen.reduce((a, b) => a + b, 0) - 16) < 1e-9),
);

console.log('\nDie Uebergangswahl folgt der Regie:');
// Mit festem Wuerfel laesst sich die Verteilung nachrechnen.
const zaehle = (energie) => {
  const treffer = {};
  for (let i = 0; i < 1000; i++) {
    const art = uebergangWaehlen({
      zielenergie: energie,
      tempoPasst: true,
      energiesprung: 0,
      wuerfel: () => (i + 0.5) / 1000,
    });
    treffer[art] = (treffer[art] ?? 0) + 1;
  }
  return treffer;
};
const frueh = zaehle(0.2);
const spaet = zaehle(0.95);
console.log(`    frueh: ${JSON.stringify(frueh)}`);
console.log(`    spaet: ${JSON.stringify(spaet)}`);
pruefe('frueh ueberwiegt die lange Blende', (frueh.blende ?? 0) > 600);
pruefe('frueh wird nie hart geschnitten', !frueh.schnitt);
pruefe('spaet kommen Schnitte dazu', (spaet.schnitt ?? 0) > 0);
pruefe('spaet ist die Blende in der Minderheit', (spaet.blende ?? 0) < 400);
pruefe(
  'ein Tempo, das nicht passt, erzwingt den Echo-Schnitt',
  uebergangWaehlen({ zielenergie: 0.2, tempoPasst: false, energiesprung: 0 }) === 'echo',
);

// --- 2. Der Roll im laufenden Betrieb -------------------------------------

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage();
seite.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });
  await seite.click('#startDemo');
  await seite.waitForSelector('#konsole:not([hidden])', { timeout: 120000 });
  await seite.waitForTimeout(3000);

  console.log('\nLoop-Roll im laufenden Betrieb:');
  const ergebnis = await seite.evaluate(async () => {
    const { loopRoll } = await import('/gemeinsam/remix.js');
    const welt = window.__dj;
    const deck = welt.mixer.laufendesDeck;
    const beatLaenge = 60 / deck.track.bpm;
    const beatVon = (s) => (s - (deck.track.raster ?? 0)) / beatLaenge;

    // Ein Ziel weit genug voraus, damit der Roll vollstaendig hineinpasst.
    const jetztBeat = beatVon(deck.stelle());
    const zielBeat = Math.ceil((jetztBeat + 24) / 4) * 4;

    const plan = loopRoll(deck, zielBeat);
    if (!plan) return { plan: null };

    // Waehrend des Rolls darf die Stelle nicht rueckwaerts laufen.
    const waehrend = [];
    const bisEnde = (plan.endeZeit - welt.ctx.currentTime) * 1000;
    const start = performance.now();
    while (performance.now() - start < bisEnde + 400) {
      waehrend.push(beatVon(deck.stelle()));
      await new Promise((f) => requestAnimationFrame(f));
    }

    const nachher = beatVon(deck.stelle());
    return {
      plan: { beats: plan.beats, startBeat: plan.startBeat, zielBeat: plan.zielBeat, stufen: plan.laengen.length },
      jetztBeat,
      nachher,
      rueckwaerts: waehrend.some((b, i) => i > 0 && b < waehrend[i - 1] - 0.5),
      laeuftNoch: deck.laeuft,
    };
  });

  if (!ergebnis.plan) {
    pruefe('der Roll laesst sich einplanen', false, 'loopRoll gab null zurueck');
  } else {
    const p = ergebnis.plan;
    console.log(`    geplant: Beat ${p.startBeat.toFixed(1)} bis ${p.zielBeat}, ${p.stufen} Stufen ueber ${p.beats} Beats`);
    console.log(`    danach steht das Deck bei Beat ${ergebnis.nachher.toFixed(2)} (Ziel war ${p.zielBeat})`);

    pruefe('der Roll ersetzt genau vier Takte', p.beats === 16);
    pruefe('das Deck laeuft danach weiter', ergebnis.laeuftNoch);
    pruefe('die Stelle laeuft waehrenddessen nie rueckwaerts', !ergebnis.rueckwaerts);

    // Der eigentliche Punkt: Nach dem Roll muss das Deck am Zielbeat stehen -
    // plus die Zeit, die seither vergangen ist. Ein halber Beat Toleranz deckt
    // die Verzoegerung zwischen Messung und Bildschirmauffrischung ab.
    const abweichung = ergebnis.nachher - p.zielBeat;
    console.log(`    Abweichung vom Raster: ${abweichung.toFixed(2)} Beats`);
    pruefe('der Track laeuft danach wieder im Raster', abweichung > -0.5 && abweichung < 3);
  }
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
