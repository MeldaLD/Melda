// Abnahme fuer lange DJ-Mixe - die Betriebsart des Partyabends.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/langmix.mjs
//
// Fuenf fertige Sets von je einer Stunde statt einzelner Tracks: Das ist ein
// anderer Fall als alles, was die uebrigen Pruefungen abdecken, und er ist
// gleich an drei Stellen gescheitert.
//
//   1. Der Speicher. Die Filterbank legte sechs Kanaele ueber die volle
//      Laenge - bei einer Stunde 1,9 GB, dazu zwei weitere Vollpaesse. Das
//      ist keine Frage des Geraets, sondern der Bauart: Der Bedarf waechst
//      mit der Laenge.
//   2. Das Tempo. Gemeldet wurde "128,01 BPM, Vertrauen 0 Prozent" - voellig
//      richtig, denn die Frage "welches Tempo hat diese Datei" hat bei zwanzig
//      Stuecken hintereinander keine Antwort. Weil das Vertrauen unter der
//      Schwelle lag, galt der Mix als Flaeche und bekam keine einzige Marke.
//   3. Damit stand auf der Buehne eine Stunde Musik, zu der sich im Bild
//      nichts bewegte.
//
// Geprueft wird deshalb an einem gebauten Mix mit *bekannten* Tempowechseln:
// ob jedes Stueck sein Tempo bekommt, ob die Grenzen ungefaehr sitzen, ob
// Marken ueber die ganze Laenge entstehen - und ob das Beatraster nach einer
// halben Stunde noch stimmt. Das Letzte ist der Wert, an dem am meisten
// haengt: Ein Raster, das nach zwanzig Minuten um einen halben Schlag
// verrutscht ist, sieht man sofort als Eiern.

import { chromium } from 'playwright';
import { beatBei, beatZeit, bpmBei } from '../public/gemeinsam/takt.js';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
const CHROM = process.env.CHROMIUM_PFAD;
// Eine halbe Stunde reicht, um alle drei Fehler zu treffen, und dauert halb so
// lang wie eine ganze. Mit DJ_MIX_MINUTEN laesst sich das hochdrehen.
const MINUTEN = Number(process.env.DJ_MIX_MINUTEN ?? 30);

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--enable-precise-memory-info', '--mute-audio'],
});
const seite = await browser.newPage();
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => {
  if (n.type() === 'error') konsole.push(n.text());
});

let ergebnis;
try {
  await seite.goto(`${ADRESSE}/`, { waitUntil: 'domcontentloaded' });

  console.log(`\nEinen Mix von ${MINUTEN} Minuten bauen und vermessen …`);
  ergebnis = await seite.evaluate(async (minuten) => {
    const { erzeugeTrack } = await import('/gemeinsam/demomusik.js');
    const { analysiere } = await import('/gemeinsam/analyse.js');

    const rate = 22050;
    const gesamt = Math.round(minuten * 60 * rate);
    const bau = new OfflineAudioContext(2, rate, rate);

    // Stuecke mit verschiedenem Tempo, hart aneinandergesetzt. Ein echter Mix
    // blendet ueber; hart geschnitten ist der schwerere Fall fuer die
    // Grenzsuche, weil es keine Uebergangszone gibt, in der beides passt.
    const tempi = [128, 140, 132, 145, 136, 150];
    const stuecke = tempi.map((bpm, i) =>
      erzeugeTrack(bau, { nummer: i, bpm, energie: 0.6, titel: `T${i}` }),
    );

    const lang = bau.createBuffer(2, gesamt, rate);
    const ziele = [lang.getChannelData(0), lang.getChannelData(1)];
    const stellen = [];
    let schreib = 0;
    let welches = 0;
    while (schreib < gesamt) {
      const { puffer } = stuecke[welches % stuecke.length];
      stellen.push({ sekunde: schreib / rate, bpm: tempi[welches % tempi.length] });
      for (let k = 0; k < 2; k++) {
        const quelle = puffer.getChannelData(Math.min(k, puffer.numberOfChannels - 1));
        ziele[k].set(quelle.subarray(0, Math.min(quelle.length, gesamt - schreib)), schreib);
      }
      schreib += puffer.length;
      welches++;
    }

    const vorher = performance.memory?.usedJSHeapSize ?? 0;
    let spitze = vorher;
    const wacht = setInterval(() => {
      const jetzt = performance.memory?.usedJSHeapSize ?? 0;
      if (jetzt > spitze) spitze = jetzt;
    }, 50);

    const begonnen = performance.now();
    let befund = null;
    let absturz = null;
    try {
      befund = await analysiere(lang);
    } catch (grund) {
      absturz = String(grund?.message ?? grund);
    }
    clearInterval(wacht);

    return {
      absturz,
      dauerMs: performance.now() - begonnen,
      stellen,
      tonMb: (gesamt * 2 * 4) / 1048576,
      vorherMb: vorher / 1048576,
      spitzeMb: spitze / 1048576,
      befund,
    };
  }, MINUTEN);
} finally {
  await browser.close();
}

const { befund, stellen } = ergebnis;

console.log('\nEr laeuft ueberhaupt durch:');
pruefe('kein Absturz', !ergebnis.absturz, ergebnis.absturz ?? '');
if (!befund) {
  console.log('\nOhne Befund ist der Rest nicht pruefbar.\n');
  process.exit(1);
}
console.log(
  `    ${(befund.dauer / 60).toFixed(0)} Minuten Ton (${ergebnis.tonMb.toFixed(0)} MB), ` +
    `${(ergebnis.dauerMs / 1000).toFixed(1)} s Rechenzeit`,
);
console.log(
  `    Speicher: ${ergebnis.vorherMb.toFixed(0)} MB vorher, ${ergebnis.spitzeMb.toFixed(0)} MB in der Spitze`,
);

/*
 * Die Messung darf nicht mehr kosten als der Ton selbst.
 *
 * Das ist die Grenze, an der die alte Fassung gescheitert ist: Sechs Kanaele
 * ueber die volle Laenge sind das Dreifache des Tons, und dazu kamen noch zwei
 * Vollpaesse. Mit der Huellkurve ist der Aufschlag von der Laenge unabhaengig.
 */
const aufschlag = ergebnis.spitzeMb - ergebnis.vorherMb;
pruefe(
  'die Messung kostet weniger Speicher als der Ton selbst',
  aufschlag < ergebnis.tonMb,
  `${aufschlag.toFixed(0)} MB Aufschlag zu ${ergebnis.tonMb.toFixed(0)} MB Ton`,
);

console.log('\nJedes Stueck bekommt sein Tempo:');
const karte = befund.abschnitte ?? [];
console.log(`    ${stellen.length} Stuecke gebaut, ${karte.length} Abschnitte gefunden`);
pruefe(
  'die Karte hat ungefaehr so viele Abschnitte wie es Stuecke gibt',
  karte.length >= stellen.length - 2 && karte.length <= stellen.length + 2,
);

const abweichungen = [];
let temposchief = 0;
for (const stelle of stellen) {
  const naechster = karte.reduce((a, b) =>
    Math.abs(b.von - stelle.sekunde) < Math.abs(a.von - stelle.sekunde) ? b : a,
  );
  abweichungen.push(naechster.von - stelle.sekunde);
  // Gefragt wird nach dem Tempo *in* dem Stueck, nicht an seiner Kante - dort
  // ist die Grenze naturgemaess unscharf.
  const mitte = stelle.sekunde + 30;
  if (mitte < befund.dauer && Math.abs(bpmBei(befund, mitte) - stelle.bpm) > 1) temposchief++;
}
pruefe(
  'in der Mitte jedes Stuecks stimmt das Tempo',
  temposchief === 0,
  `${temposchief} von ${stellen.length} daneben`,
);

const sortiert = abweichungen.map(Math.abs).sort((a, b) => a - b);
const median = sortiert[Math.floor(sortiert.length / 2)];
console.log(
  `    Grenzen: Median ${median.toFixed(1)} s, groesster Fehler ${Math.max(...sortiert).toFixed(1)} s`,
);
// Die Fensterbreite ist dreissig Sekunden; besser als die halbe Fensterbreite
// im Median waere Zufall, schlechter ein Rueckschritt.
pruefe('die Grenzen sitzen im Median auf unter zehn Sekunden', median < 10);

console.log('\nEs gibt wieder Marken:');
const drops = (befund.marken ?? []).filter((m) => m.name === 'drop');
console.log(
  `    Vertrauen ${befund.bpmVertrauen}, ${befund.marken.length} Marken davon ${drops.length} Drops`,
);
pruefe('der Mix gilt nicht als flaechig', befund.ohneRaster === false);
pruefe('das Vertrauen liegt hoch', befund.bpmVertrauen > 0.8, String(befund.bpmVertrauen));
pruefe(
  'ueber die ganze Laenge werden Drops gefunden',
  drops.length >= stellen.length * 0.5,
  `${drops.length} bei ${stellen.length} Stuecken`,
);
// Die Buehne sucht "die naechste Marke nach diesem Beat". Laufen die
// Beatnummern nicht aufsteigend, findet sie die falsche.
let unsortiert = 0;
for (let i = 1; i < befund.marken.length; i++) {
  if (befund.marken[i].beat < befund.marken[i - 1].beat) unsortiert++;
}
pruefe('die Marken laufen aufsteigend', unsortiert === 0, `${unsortiert} Rueckspruenge`);
const letzte = befund.marken[befund.marken.length - 1];
pruefe(
  'auch im letzten Viertel stehen noch welche',
  Boolean(letzte) && letzte.sekunde > befund.dauer * 0.75,
  letzte ? `letzte bei ${(letzte.sekunde / 60).toFixed(1)} min` : 'gar keine',
);

/*
 * Und der Wert, an dem am meisten haengt: Stimmt das Raster am Ende noch?
 *
 * Gerechnet wird mit demselben takt.js, das auch die Buehne benutzt. Ein
 * Raster, das nach zwanzig Minuten um einen halben Schlag verrutscht ist,
 * sieht man sofort - die Farbwanderung laeuft dann sichtbar neben der Musik.
 */
console.log('\nDas Beatraster haelt bis zum Schluss:');
let groessterRest = 0;
let rueckwaerts = 0;
let vorherBeat = -Infinity;
for (let s = 5; s < befund.dauer - 5; s += 3) {
  const beat = beatBei(befund, s);
  if (beat < vorherBeat) rueckwaerts++;
  vorherBeat = beat;
  groessterRest = Math.max(groessterRest, Math.abs(beatZeit(befund, beat) - s));
}
pruefe(
  'Hin- und Rueckrechnung heben sich ueber die ganze Stunde auf',
  groessterRest < 0.001,
  `groesster Rest ${(groessterRest * 1000).toFixed(3)} ms`,
);
pruefe('die Beatzaehlung laeuft nie rueckwaerts', rueckwaerts === 0, `${rueckwaerts} Rueckspruenge`);

// Und die Beats muessen auf den Schlaegen des jeweiligen Abschnitts sitzen,
// nicht irgendwo dazwischen.
let danebenSitzend = 0;
for (const a of karte) {
  const mitte = (a.von + a.bis) / 2;
  const beat = Math.round(beatBei(befund, mitte));
  const rest = Math.abs(beatZeit(befund, beat) - a.raster) % (60 / a.bpm);
  const abstand = Math.min(rest, 60 / a.bpm - rest);
  if (abstand > 0.001) danebenSitzend++;
}
pruefe(
  'ganze Beatnummern fallen auf echte Schlaege',
  danebenSitzend === 0,
  `${danebenSitzend} von ${karte.length} Abschnitten daneben`,
);

pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 3).join(' | '));

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
