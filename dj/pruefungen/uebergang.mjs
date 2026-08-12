// Abnahme der Uebergangsplanung.
//
//   node dj/pruefungen/uebergang.mjs
//
// Reine Rechnung, kein Browser. Geprueft wird die eine Frage, um die es geht:
// Passt der Plan zu *diesen beiden* Tracks - oder ist es wieder derselbe Plan
// wie immer?
//
// Dafuer werden Tracks mit bekanntem Verlauf gebaut: einer mit langem Intro,
// einer der sofort losgeht, einer der ausklingt, einer der bis zum Schluss
// draufhaelt. Was der Planer daraus macht, laesst sich dann nachzaehlen.

import {
  uebergangPlanen,
  einstiegWaehlen,
  ausstiegWaehlen,
  kernAnfang,
  kernEnde,
} from '../public/gemeinsam/uebergang.js';

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

// --- Testtracks mit bekanntem Verlauf --------------------------------------
//
// Ein Profil ist eine Liste von Takten. Hier wird sie aus Abschnitten gebaut,
// damit im Test steht, was der Track *tut*, und nicht eine Zahlenwueste.
function bauen(titel, abschnitte, extra = {}) {
  const profil = [];
  for (const [takte, e, b, h, d] of abschnitte) {
    for (let i = 0; i < takte; i++) profil.push({ e, b, h, d });
  }
  return {
    id: titel,
    titel,
    bpm: 128,
    raster: 0,
    dauer: profil.length * 4 * (60 / 128),
    einstiegBeat: 0,
    marken: [],
    profil,
    ...extra,
  };
}

//                        Takte  e     b     h     d
const langesIntro = bauen('Langes Intro', [
  [16, 0.22, 0.25, 0.06, 0.4], // zwei Phrasen Flaeche
  [8, 0.55, 0.5, 0.14, 1.4], // Aufbau
  [40, 0.95, 0.72, 0.24, 2.6], // Groove
  [8, 0.4, 0.3, 0.1, 0.8], // Outro
], { einstiegBeat: 32 });

const sofortLos = bauen('Sofort los', [
  [4, 0.8, 0.7, 0.2, 2.2],
  [56, 0.97, 0.75, 0.26, 2.8],
  [4, 0.9, 0.7, 0.24, 2.5],
], { einstiegBeat: 0 });

const langesOutro = bauen('Langes Outro', [
  [8, 0.6, 0.5, 0.15, 1.5],
  [40, 0.95, 0.74, 0.22, 2.7],
  [24, 0.3, 0.2, 0.08, 0.5], // sechs Phrasen Ausklingen
]);

const duennerEinstieg = bauen('Duenner Einstieg', [
  [16, 0.35, 0.2, 0.05, 0.6], // Pad, kaum Anschlaege
  [48, 0.9, 0.7, 0.2, 2.4],
], { einstiegBeat: 16 });

console.log('\nDie Tracks, die geprueft werden:');
for (const t of [langesIntro, sofortLos, langesOutro, duennerEinstieg]) {
  console.log(
    `    ${t.titel.padEnd(18)} ${t.profil.length} Takte, ` +
      `Kern von Takt ${kernAnfang(t.profil)} bis ${kernEnde(t.profil)}`,
  );
}

// --- Kern finden -----------------------------------------------------------

console.log('\nDer Kern eines Tracks wird richtig gefunden:');
pruefe('das lange Intro wird als Intro erkannt', kernAnfang(langesIntro.profil) === 24,
  `Kern ab Takt ${kernAnfang(langesIntro.profil)}, erwartet 24`);
pruefe('ein Track ohne Intro faengt bei null an', kernAnfang(sofortLos.profil) === 0);
pruefe('das lange Outro zaehlt nicht mehr zum Kern', kernEnde(langesOutro.profil) === 47,
  `Kern bis Takt ${kernEnde(langesOutro.profil)}, erwartet 47`);

// --- Einstieg: das Kernstueck der Anforderung ------------------------------

console.log('\nBei hoher Energie wird das Intro uebersprungen:');
const frueh = einstiegWaehlen(langesIntro, 0.25);
const spaet = einstiegWaehlen(langesIntro, 0.8);
console.log(`    bei 25 %: Beat ${frueh.beat} – ${frueh.grund}`);
console.log(`    bei 80 %: Beat ${spaet.beat} – ${spaet.grund}`);
pruefe('frueh am Abend bleibt das Intro drin', frueh.beat <= 32, `Beat ${frueh.beat}`);
pruefe('spaet wird direkt im Groove eingestiegen', spaet.beat >= 96, `Beat ${spaet.beat}`);
pruefe('und zwar spaeter als frueh am Abend', spaet.beat > frueh.beat);
pruefe('der Einstieg sitzt auf einer Phrasengrenze', spaet.beat % 32 === 0);

const duennSpaet = einstiegWaehlen(duennerEinstieg, 0.8);
console.log(`    duenner Einstieg bei 80 %: Beat ${duennSpaet.beat} – ${duennSpaet.grund}`);
pruefe('auch hier wird das Pad uebersprungen', duennSpaet.beat >= 64, `Beat ${duennSpaet.beat}`);

console.log('\nEin Drop kurz nach dem Kern wird als Einstieg genommen:');
const mitDrop = { ...sofortLos, profil: langesIntro.profil, einstiegBeat: 32, marken: [{ name: 'drop', beat: 128 }] };
const aufDrop = einstiegWaehlen(mitDrop, 0.85, 32);
console.log(`    Beat ${aufDrop.beat} – ${aufDrop.grund}`);
pruefe('der Drop bestimmt den Einstieg', /Drop/.test(aufDrop.grund), aufDrop.grund);
pruefe('und liegt auf der Phrase', aufDrop.beat % 32 === 0);
// Das Entscheidende: Der Einstieg liegt *vor* dem Drop, und zwar genau so
// weit, dass der Drop auf das Ende des Uebergangs faellt.
pruefe('der Einstieg liegt vor dem Drop', aufDrop.beat < 128, `Beat ${aufDrop.beat}`);
pruefe('und der Drop landet auf dem Ende des Uebergangs', aufDrop.beat + 32 === 128,
  `${aufDrop.beat} + 32 = ${aufDrop.beat + 32}, Drop bei 128`);

// --- Ausstieg --------------------------------------------------------------

console.log('\nBei hoher Energie wird das Ausklingen nicht abgewartet:');
const ausRuhig = ausstiegWaehlen(langesOutro, 0.3);
const ausHart = ausstiegWaehlen(langesOutro, 0.85);
console.log(`    bei 30 %: Beat ${ausRuhig.beat} – ${ausRuhig.grund}`);
console.log(`    bei 85 %: Beat ${ausHart.beat} – ${ausHart.grund}`);
pruefe('spaet wird frueher ausgestiegen', ausHart.beat < ausRuhig.beat,
  `${ausHart.beat} gegen ${ausRuhig.beat}`);
pruefe('und beides liegt vor dem Ende des Tracks', ausRuhig.beat < langesOutro.profil.length * 4);
pruefe('der Ausstieg sitzt auf einer Phrasengrenze', ausHart.beat % 32 === 0);

// --- Der ganze Plan --------------------------------------------------------

console.log('\nDer Plan richtet sich nach den beiden Stellen:');
const faelle = [
  { name: 'zwei volle Grooves, frueh', a: sofortLos, b: langesIntro, ziel: 0.45 },
  { name: 'zwei volle Grooves, spaet', a: sofortLos, b: sofortLos, ziel: 0.85 },
  { name: 'Alter klingt aus', a: langesOutro, b: sofortLos, ziel: 0.5 },
  { name: 'Neuer kommt duenn', a: sofortLos, b: duennerEinstieg, ziel: 0.45 },
  { name: 'Tempo passt nicht', a: sofortLos, b: sofortLos, ziel: 0.6, tempoPasst: false },
];

const plaene = {};
for (const f of faelle) {
  const plan = uebergangPlanen(f.a, f.b, {
    zielenergie: f.ziel,
    tempoPasst: f.tempoPasst ?? true,
  });
  plaene[f.name] = plan;
  console.log(
    `\n    ${f.name} (Ziel ${(f.ziel * 100).toFixed(0)} %)\n` +
      `      ${plan.name}, ${plan.beats} Beats, Bass wechselt bei Beat ${plan.bassBeiBeat}\n` +
      `      Ausstieg Beat ${plan.ausstiegBeat}, Einstieg Beat ${plan.einstiegBeat}\n` +
      `      ${plan.begruendung}`,
  );
}

console.log('');
pruefe(
  'ohne passendes Tempo wird nicht uebereinandergelegt',
  plaene['Tempo passt nicht'].art === 'echo',
);
pruefe(
  'spaet und beide voll: kurz und entschieden',
  plaene['zwei volle Grooves, spaet'].beats <= 8,
  `${plaene['zwei volle Grooves, spaet'].beats} Beats`,
);
pruefe(
  'ein ausklingender Alter bekommt keine lange Blende',
  plaene['Alter klingt aus'].beats <= 16,
  `${plaene['Alter klingt aus'].beats} Beats`,
);
pruefe(
  'ein duenner Neuer darf sich Zeit lassen',
  plaene['Neuer kommt duenn'].beats >= 24,
  `${plaene['Neuer kommt duenn'].beats} Beats`,
);
pruefe(
  'die Plaene unterscheiden sich wirklich',
  new Set(Object.values(plaene).map((p) => `${p.art}:${p.beats}`)).size >= 3,
  `${new Set(Object.values(plaene).map((p) => `${p.art}:${p.beats}`)).size} verschiedene`,
);

// --- Die erzeugten Kurven --------------------------------------------------

console.log('\nDie Kurven sind in sich stimmig:');
for (const [name, plan] of Object.entries(plaene)) {
  const schritte = plan.schritte;

  // Jede Kurve braucht einen Startwert bei Beat 0, sonst macht der Browser
  // aus der Rampe einen Sprung.
  const kurven = new Map();
  for (const s of schritte) {
    const schluessel = `${s.deck}.${s.regler}`;
    if (!kurven.has(schluessel)) kurven.set(schluessel, []);
    kurven.get(schluessel).push(s);
  }
  const ohneStart = [...kurven.entries()].filter(([, punkte]) => !punkte.some((p) => p.beat === 0));
  pruefe(`${name}: jede Kurve beginnt bei Beat 0`, ohneStart.length === 0,
    ohneStart.map(([k]) => k).join(', '));

  // Nichts darf hinter das Ende des Uebergangs fallen.
  const zuSpaet = schritte.filter((s) => s.beat > plan.beats + 0.001);
  pruefe(`${name}: nichts liegt hinter dem Ende`, zuSpaet.length === 0);

  // Der Neue muss am Ende offen sein und der Alte zu.
  const letzter = (deck, regler) => {
    const punkte = kurven.get(`${deck}.${regler}`) ?? [];
    return punkte.length ? punkte.reduce((a, b) => (b.beat >= a.beat ? b : a)).wert : null;
  };
  pruefe(`${name}: der Neue steht am Ende offen`, letzter('neu', 'blende') === 1);
  pruefe(`${name}: der Alte ist am Ende zu`, letzter('alt', 'blende') === 0);
}

console.log('\nUeber einen Abend wiederholt sich der Zug nicht stur:');
{
  // Immer dieselbe Lage, immer hohe Energie - genau der Fall, in dem eine
  // Rangfolge ohne Gedaechtnis eine Stunde lang denselben Schnitt liefert.
  const folge = [];
  let letzteArt = null;
  for (let i = 0; i < 8; i++) {
    const p = uebergangPlanen(sofortLos, sofortLos, { zielenergie: 0.85, letzteArt });
    folge.push(p.art);
    letzteArt = p.art;
  }
  console.log(`    ${folge.join(' -> ')}`);
  let doppelt = 0;
  for (let i = 1; i < folge.length; i++) if (folge[i] === folge[i - 1]) doppelt++;
  pruefe('nie zweimal dieselbe Art hintereinander', doppelt === 0, `${doppelt} Wiederholungen`);
  pruefe('und es sind wirklich mehrere Arten', new Set(folge).size >= 2, `${new Set(folge).size} Arten`);
}

console.log('\nDer Alte hat nach dem Ausstieg noch genug Material:');
for (const [name, plan] of Object.entries(plaene)) {
  const a = faelle.find((f) => f.name === name).a;
  const letzterBeat = (a.dauer - a.raster) / (60 / a.bpm);
  const rest = letzterBeat - plan.ausstiegBeat;
  console.log(`    ${name.padEnd(26)} Ausstieg ${plan.ausstiegBeat}, noch ${rest.toFixed(0)} Beats bis Dateiende, Uebergang ${plan.beats}`);
  // Sonst mischt der Uebergang gegen Stille.
  pruefe(`${name}: der Uebergang passt noch in den Track`, rest >= plan.beats,
    `${rest.toFixed(0)} uebrig, ${plan.beats} gebraucht`);
}

console.log('\nDer Bass gehoert immer genau einem Deck:');
for (const [name, plan] of Object.entries(plaene)) {
  const punkte = plan.schritte.filter((s) => s.regler === 'tief');
  // An jedem Zeitpunkt nachsehen, ob beide Decks gleichzeitig Bass haben.
  const wertBei = (deck, beat) => {
    const eigene = punkte.filter((p) => p.deck === deck && p.beat <= beat + 1e-9);
    if (eigene.length === 0) return deck === 'alt' ? 0 : BASS_AUS_ERSATZ;
    return eigene.reduce((a, b) => (b.beat >= a.beat ? b : a)).wert;
  };
  let doppelt = 0;
  for (let beat = 0; beat <= plan.beats; beat += 0.5) {
    if (wertBei('alt', beat) > -6 && wertBei('neu', beat) > -6) doppelt++;
  }
  // Genau im Moment der Uebergabe ueberlappen die Rampen fuer einen Beat -
  // das ist gewollt, sonst entstuende ein Loch im Fundament.
  pruefe(`${name}: nie lange zwei Baesse`, doppelt <= 5, `${doppelt} Messpunkte`);
}

const BASS_AUS_ERSATZ = -32;

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
