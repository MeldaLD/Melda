// Die Buehne: hier laeuft die Musik, hier sieht man beim Mischen zu, und hier
// dreht man waehrend der Entwicklung an allem, was sich einstellen laesst.
//
// Der Ablauf ist eine Schleife:
//   1. Server fragen, was als naechstes kommt
//   2. Den Track laden (oder erzeugen) und bereitlegen
//   3. Auf der naechsten Phrasengrenze ueberblenden
//   4. Dem Server melden, was jetzt laeuft
//
// Punkt 2 passiert mit Vorlauf, Punkt 3 haelt sich ans Raster.

import { Mixer, UEBERGAENGE } from '../gemeinsam/mixer.js';
import { demoBibliothek } from '../gemeinsam/demomusik.js';
import { leitungSuchen } from '../gemeinsam/leitung.js';

const $ = (id) => document.getElementById(id);

// Wie viel Vorlauf: bei dieser Restzeit wird der naechste Track geladen …
const LADEN_AB_REST = 45;
// … und bei dieser der Uebergang eingeplant.
const UEBERBLENDEN_AB_REST = 25;

const welt = {
  ctx: null,
  mixer: null,
  leitung: null,
  demo: false,
  // Nur der laufende und der naechste Puffer bleiben liegen. Ueber sechs
  // Stunden ist das der Unterschied zwischen laeuft und stirbt: ein
  // dekodierter Sechsminueter belegt rund 60 MB.
  puffer: new Map(),
  bibliothek: [],
  naechster: null,
  naechsterGrund: null,
  laedt: false,
  wechselLaeuft: false,
  verlauf: [],
  angleichAn: true,
  stilleSeit: null,
};

// --- Start ----------------------------------------------------------------

$('startDemo').addEventListener('click', () => starten(true));
$('startEcht').addEventListener('click', () => starten(false));

// Erst herausfinden, wo wir laufen: mit Server oder als reine Webseite.
welt.leitung = await leitungSuchen();

if (welt.leitung.art === 'allein') {
  // Ohne Server gibt es keine Musikdateien zum Ausliefern - der Pruefstand
  // ist dann die einzige Betriebsart, und das ist genau der Fall, fuer den er
  // gebaut ist.
  $('echtHinweis').textContent =
    'Braucht den lokalen Server. Diese Seite läuft ohne – nimm den Prüfstand.';
  $('startEcht').disabled = true;
} else {
  const tracks = await welt.leitung.bibliothek();
  $('echtHinweis').textContent = tracks.length
    ? `${tracks.length} Tracks aus musik/ – analysiert und bereit.`
    : 'Noch leer. Erst `npm run einlesen` laufen lassen.';
  $('startEcht').disabled = tracks.length === 0;
}

async function starten(demo) {
  welt.demo = demo;
  $('startDemo').disabled = true;
  $('startEcht').disabled = true;

  try {
    welt.ctx = new (window.AudioContext ?? window.webkitAudioContext)({ sampleRate: 44100 });
    await welt.ctx.resume();
    welt.mixer = new Mixer(welt.ctx);

    if (demo) {
      $('startDemo').querySelector('span').textContent = 'Musik wird erzeugt …';
      // Kurz Luft lassen, damit der Text noch gezeichnet wird, bevor der
      // Hauptstrang mit dem Rechnen beschaeftigt ist.
      await new Promise((f) => setTimeout(f, 50));
      const erzeugt = demoBibliothek(welt.ctx);
      welt.bibliothek = erzeugt.map((e) => e.track);
      for (const eintrag of erzeugt) welt.puffer.set(eintrag.track.id, eintrag.puffer);
      // Auch die Gegenstelle soll sie kennen - dann funktionieren Auswahl,
      // Wuensche und Abstimmung genauso wie spaeter mit echter Musik.
      await welt.leitung.bibliothekSetzen(welt.bibliothek);
      $('pruefstandMarke').textContent =
        welt.leitung.art === 'allein' ? 'Prüfstand · ohne Server' : 'Prüfstand';
      $('pruefstandMarke').hidden = false;
    } else {
      welt.bibliothek = await welt.leitung.bibliothek();
    }

    $('startschirm').hidden = true;
    $('konsole').hidden = false;
    leinwandAnpassen();

    const erster = await naechstenErfragen();
    const puffer = await pufferFuer(erster);
    welt.mixer.ersterTrack(erster, puffer);
    await laufendMelden(erster);
    aufraeumen(erster.id);

    await naechstenVorbereiten();
    schleife();
  } catch (fehler) {
    $('startFehler').hidden = false;
    $('startFehler').textContent = `Start fehlgeschlagen: ${fehler.message}`;
    $('startDemo').disabled = false;
    $('startEcht').disabled = false;
    throw fehler;
  }
}

// --- Nachschub ------------------------------------------------------------

async function naechstenErfragen() {
  const bpm = welt.mixer?.laufendesDeck?.effektivBpm() ?? null;
  const { track, grund, ziel } = await welt.leitung.naechster(bpm);
  welt.naechsterGrund = { grund, ziel };
  return track;
}

async function pufferFuer(track) {
  if (welt.puffer.has(track.id)) return welt.puffer.get(track.id);

  const antwort = await fetch(`/musik/${encodeURIComponent(track.datei)}`);
  const roh = await antwort.arrayBuffer();
  const puffer = await welt.ctx.decodeAudioData(roh);
  welt.puffer.set(track.id, puffer);
  return puffer;
}

// Alles freigeben ausser dem, was jetzt laeuft und was gleich kommt. Im
// Pruefstand bleiben die erzeugten Puffer liegen - die sind der Bestand.
function aufraeumen(...behalten) {
  if (welt.demo) return;
  for (const id of welt.puffer.keys()) {
    if (!behalten.includes(id)) welt.puffer.delete(id);
  }
}

async function naechstenVorbereiten() {
  if (welt.laedt || welt.naechster) return;
  welt.laedt = true;
  try {
    const track = await naechstenErfragen();
    await pufferFuer(track);
    welt.naechster = track;
  } catch (fehler) {
    console.error('Nachschub fehlgeschlagen', fehler);
  } finally {
    welt.laedt = false;
  }
}

async function laufendMelden(track) {
  await welt.leitung.laeuftMelden(track, welt.naechster);
}

// --- Uebergang ------------------------------------------------------------

async function ueberblenden(artWunsch = null) {
  if (welt.wechselLaeuft) return;
  if (!welt.naechster) {
    await naechstenVorbereiten();
    if (!welt.naechster) return;
  }
  welt.wechselLaeuft = true;

  const track = welt.naechster;
  welt.naechster = null;

  try {
    const puffer = welt.puffer.get(track.id) ?? (await pufferFuer(track));
    const angepasst = welt.angleichAn ? track : { ...track, angleichDb: 0 };
    const plan = welt.mixer.uebergang(angepasst, puffer, artWunsch || null);

    verlaufEintragen(plan);
    await laufendMelden(track);
    aufraeumen(track.id);

    // Nach dem Uebergang gleich den uebernaechsten vorbereiten.
    setTimeout(() => {
      welt.wechselLaeuft = false;
      naechstenVorbereiten();
    }, Math.max(500, (plan.endeZeit - welt.ctx.currentTime) * 1000));
  } catch (fehler) {
    console.error('Uebergang fehlgeschlagen', fehler);
    welt.wechselLaeuft = false;
  }
}

function verlaufEintragen(plan) {
  welt.verlauf.unshift({
    zeit: new Date(),
    art: plan.name,
    von: plan.vonTrack?.titel ?? '–',
    nach: plan.nachTrack?.titel ?? '–',
    hinweis: plan.grund
      ? plan.grund
      : plan.tempo?.art && plan.tempo.art !== 'direkt'
        ? `${plan.tempo.art}es Tempo`
        : `${Math.round((plan.tempo?.zug ?? 0) * 1000) / 10} % Zug`,
  });
  welt.verlauf = welt.verlauf.slice(0, 30);
  zeichneVerlauf();
}

// --- Bedienung ------------------------------------------------------------

$('jetztUeberblenden').addEventListener('click', () => ueberblenden($('artWahl').value));

$('angleichAn').addEventListener('change', (e) => {
  welt.angleichAn = e.target.checked;
});

$('energieRegler').addEventListener('input', async (e) => {
  await welt.leitung.handEnergie(Number(e.target.value) / 100);
});

// Tastenkuerzel - beim Entwickeln schneller als Klicken.
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === ' ') {
    e.preventDefault();
    ueberblenden($('artWahl').value);
  }
  const arten = { 1: 'blende', 2: 'aufzug', 3: 'echo', 4: 'schnitt' };
  if (arten[e.key]) ueberblenden(arten[e.key]);
});

// --- Zustand vom Server ---------------------------------------------------

welt.leitung.beiZustand((zustand) => {
  $('anlass').textContent = zustand.anlass ?? 'resident-dj';
  const prozent = Math.round((zustand.zielenergie ?? 0) * 100);
  $('energieWert').textContent = `${prozent} %`;
  if (document.activeElement !== $('energieRegler')) {
    $('energieRegler').value = prozent;
  }
  $('energieQuelle').textContent = zustand.handbetrieb
    ? 'von Hand gesetzt'
    : `nach Uhrzeit${zustand.richtungen?.haerter || zustand.richtungen?.chilliger ? ` · Gäste: ${zustand.richtungen.chilliger} chilliger, ${zustand.richtungen.haerter} härter` : ''}`;

  // Der naechste Track wird lange im Voraus geholt. Verschiebt sich die
  // Zielenergie danach deutlich - weil jemand am Regler dreht oder die Gaeste
  // abstimmen - waere er von gestern. Dann lieber neu aussuchen, solange der
  // Uebergang noch nicht laeuft.
  const ziel = zustand.zielenergie ?? 0.5;
  if (
    welt.naechster &&
    !welt.wechselLaeuft &&
    welt.naechsterGrund?.ziel !== undefined &&
    Math.abs(ziel - welt.naechsterGrund.ziel) > 0.1
  ) {
    welt.naechster = null;
    naechstenVorbereiten();
  }
});

// --- Zeichnen -------------------------------------------------------------

const leinwand = $('spektrum');
const stift = leinwand.getContext('2d');
let spektrumDaten = null;

function leinwandAnpassen() {
  const dichte = window.devicePixelRatio || 1;
  leinwand.width = leinwand.clientWidth * dichte;
  leinwand.height = leinwand.clientHeight * dichte;
  stift.setTransform(dichte, 0, 0, dichte, 0, 0);
}
window.addEventListener('resize', leinwandAnpassen);

function schleife() {
  requestAnimationFrame(schleife);
  if (!welt.mixer) return;

  const zustand = welt.mixer.zustand();
  zeichneDecks(zustand);
  zeichneUebergang(zustand);
  zeichneSpektrum();

  $('pegelBalken').style.width = `${Math.min(100, zustand.pegel * 260)}%`;
  $('uhr').textContent = new Date().toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const naechster = welt.naechster;
  $('naechster').textContent = naechster ? `${naechster.interpret} – ${naechster.titel}` : 'wird geholt …';
  if (naechster) {
    const g = welt.naechsterGrund;
    $('naechsterGrund').textContent = `${g?.grund === 'wunsch' ? 'Gästewunsch' : 'Autopilot'} · ${Math.round(naechster.bpm)} BPM · Energie ${Math.round((naechster.energie ?? 0) * 100)} %`;
  } else {
    // Sonst bliebe die Begruendung des vorigen Tracks stehen und behauptet
    // etwas ueber einen, der schon gar nicht mehr ansteht.
    $('naechsterGrund').textContent = '';
  }

  nachschubPruefen();
  wachhund(zustand);
}

function nachschubPruefen() {
  const rest = welt.mixer.restSekunden();
  if (rest < LADEN_AB_REST) naechstenVorbereiten();
  if (rest < UEBERBLENDEN_AB_REST && !welt.wechselLaeuft && welt.naechster) {
    ueberblenden();
  }
}

// Stille ist der einzige Fehler, den dieses System nicht machen darf. Bleibt
// der Ausgang stumm, obwohl ein Deck laeuft, wird hart weitergeschaltet.
//
// Die Schwelle liegt bewusst sehr tief. Ein leises Intro oder ein Breakdown
// kann auf ein Tausendstel heruntergehen - wer da schon anschlaegt, zerschiesst
// genau die Stellen, die ein DJ absichtlich leise macht. Es geht nur um den
// Fall "wirklich nichts".
const STILL = 0.00005;
const STILLE_ERLAUBT_MS = 2500;

function wachhund(zustand) {
  const einDeckLaeuft = zustand.decks.some((d) => d.laeuft);
  if (!einDeckLaeuft || zustand.pegel >= STILL) {
    welt.stilleSeit = null;
    return;
  }
  // Direkt nach einem Start braucht die Messung einen Moment.
  if (welt.wechselLaeuft) {
    welt.stilleSeit = null;
    return;
  }
  if (welt.stilleSeit === null) {
    welt.stilleSeit = performance.now();
    return;
  }
  if (performance.now() - welt.stilleSeit > STILLE_ERLAUBT_MS) {
    console.warn('Wachhund: Stille erkannt, schalte hart weiter');
    welt.stilleSeit = null;
    welt.wechselLaeuft = false;
    ueberblenden('schnitt');
  }
}

function zeichneDecks(zustand) {
  for (const [i, daten] of zustand.decks.entries()) {
    const knoten = $(i === 0 ? 'deckA' : 'deckB');
    knoten.classList.toggle('aktiv', daten.laeuft);

    knoten.querySelector('.deck-bpm').textContent = daten.bpm
      ? `${daten.bpm.toFixed(1)} BPM${Math.abs(daten.tempo - 1) > 0.001 ? ` · ${((daten.tempo - 1) * 100).toFixed(1)} %` : ''}`
      : '';
    knoten.querySelector('.deck-titel').textContent = daten.track?.titel ?? '–';
    knoten.querySelector('.deck-interpret').textContent = daten.track?.interpret ?? '';

    const anteil = daten.dauer ? Math.min(1, daten.stelle / daten.dauer) : 0;
    knoten.querySelector('.fortschritt > i').style.width = `${anteil * 100}%`;
    zeichneMarken(knoten.querySelector('.fortschritt > u'), daten);

    knoten.querySelector('[data-regler="blende"]').style.width = `${daten.blende * 100}%`;
    // Bass: 0 dB = voll, -32 dB = weg.
    knoten.querySelector('[data-regler="tief"]').style.width =
      `${Math.max(0, 1 + daten.tief / 32) * 100}%`;
  }
}

// Die Strukturmarken als feine Striche im Fortschrittsbalken - so sieht man,
// ob der Uebergang wirklich am Outro sitzt.
function zeichneMarken(knoten, daten) {
  const marken = daten.track?.marken;
  if (!marken || !daten.dauer) return (knoten.style.backgroundImage = '');
  const striche = marken
    .filter((m) => m.name !== 'intro')
    .map((m) => {
      const p = ((m.sekunde / daten.dauer) * 100).toFixed(2);
      const farbe = m.name === 'drop' ? 'rgba(255,61,127,.9)' : 'rgba(255,255,255,.28)';
      return `linear-gradient(90deg, transparent ${p}%, ${farbe} ${p}%, ${farbe} calc(${p}% + 1px), transparent calc(${p}% + 1px))`;
    });
  knoten.style.backgroundImage = striche.join(',');
}

function zeichneUebergang(zustand) {
  const u = zustand.uebergang;
  $('uebergang').hidden = !u;
  $('wartend').hidden = !!u;
  if (!u) return;

  const wartet = u.startetIn > 0.05;
  $('uebergangName').textContent = wartet
    ? `${u.name} in ${u.startetIn.toFixed(1)} s`
    : u.name;
  $('uebergangFortschritt').style.width = `${u.fortschritt * 100}%`;
  $('uebergangGrund').textContent = wartet
    ? 'wartet auf die nächste Phrasengrenze'
    : (u.grund ?? u.beschreibung);
}

function zeichneSpektrum() {
  const breite = leinwand.clientWidth;
  const hoehe = leinwand.clientHeight;
  if (!spektrumDaten) spektrumDaten = new Uint8Array(welt.mixer.messung.frequencyBinCount);
  welt.mixer.spektrum(spektrumDaten);

  stift.clearRect(0, 0, breite, hoehe);
  // Nur das untere Drittel der Bins zeigen - darueber passiert bei Musik
  // optisch nichts mehr.
  const bins = Math.floor(spektrumDaten.length * 0.42);
  const balken = 84;
  const breitePro = breite / balken;

  for (let i = 0; i < balken; i++) {
    // Logarithmisch abgreifen, damit Baesse nicht die halbe Anzeige belegen.
    const von = Math.floor((i / balken) ** 1.7 * bins);
    const bis = Math.max(von + 1, Math.floor(((i + 1) / balken) ** 1.7 * bins));
    let hoechster = 0;
    for (let b = von; b < bis; b++) hoechster = Math.max(hoechster, spektrumDaten[b]);

    const h = (hoechster / 255) * hoehe;
    const farbton = 330 - (i / balken) * 90;
    stift.fillStyle = `hsl(${farbton} 90% ${35 + (hoechster / 255) * 25}%)`;
    stift.fillRect(i * breitePro, hoehe - h, breitePro - 1.5, h);
  }
}

function zeichneVerlauf() {
  $('verlauf').innerHTML = '';
  for (const eintrag of welt.verlauf) {
    const zeile = document.createElement('li');
    const zeit = eintrag.zeit.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    zeile.innerHTML = '<span></span><em></em><b></b><span></span>';
    const felder = zeile.children;
    felder[0].textContent = zeit;
    felder[1].textContent = eintrag.art;
    felder[2].textContent = eintrag.nach;
    felder[3].textContent = eintrag.hinweis;
    $('verlauf').append(zeile);
  }
}

// Die Uebergangsarten aus der Engine in die Auswahlliste, damit beides nicht
// auseinanderlaeuft.
for (const [schluessel, plan] of Object.entries(UEBERGAENGE)) {
  const option = [...$('artWahl').options].find((o) => o.value === schluessel);
  if (option) option.title = plan.beschreibung;
}
