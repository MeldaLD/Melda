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
import { Visualisierung } from '../gemeinsam/visual.js';
import { loopRoll, rollLohntSich, regieFuer } from '../gemeinsam/remix.js';
import { Maschine } from '../gemeinsam/maschine.js';

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
  zielenergie: 0.5,
  // Wie viele Drops seit dem letzten Roll vergangen sind. Ohne diesen Zaehler
  // wuerde vor jedem Drop gerollt, und aus einem Kniff wuerde eine Masche.
  seitLetztemRoll: 99,
  // Schon eingeplante Drops, damit derselbe nicht mehrfach bedient wird.
  bedienteDrops: new Set(),
  remixAn: true,
  // Das Schlagwerk. Laeuft nur, wenn es jemand einschaltet oder ein Track
  // ohne brauchbares Raster hochkommt.
  maschine: null,
  maschineLaeuft: false,
  maschineGrund: null,
  // Von Hand eingeschaltet? Dann bleibt sie an, auch wenn der naechste Track
  // ein sauberes Raster mitbringt.
  maschineVonHand: false,
  // Und umgekehrt: Fuer welchen Track hat jemand sie ausdruecklich
  // abgeschaltet? Ohne dieses Gedaechtnis wuerde die Nachfuehrung sie im
  // naechsten Bild wieder anwerfen, und der Knopf waere wirkungslos.
  maschineAbgelehnt: null,
};

// Zustand offenlegen. Zwei Gruende: Die Abnahme prueft damit die Engine statt
// der Beschriftung, und wenn am Partyabend etwas klemmt, sieht man in der
// Browserkonsole sofort nach, was die Decks wirklich tun.
window.__dj = welt;

// --- Start ----------------------------------------------------------------

$('startDemo').addEventListener('click', () => starten(true));
$('startEcht').addEventListener('click', () => starten(false));

// Erst herausfinden, wo wir laufen: mit Server oder als reine Webseite.
welt.leitung = await leitungSuchen();

if (welt.leitung.art === 'allein') {
  // Ohne Bibliothek ist der Pruefstand die einzige Betriebsart - und genau
  // dafuer ist er gebaut.
  $('echtHinweis').textContent =
    'Noch keine Musik da. Im Adminbereich unter /admin/dj hochladen.';
  $('startEcht').disabled = true;
} else {
  const tracks = await welt.leitung.bibliothek();
  $('echtHinweis').textContent = tracks.length
    ? `${tracks.length} Tracks, vermessen und bereit.`
    : 'Noch leer – unter /admin/dj hochladen.';
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
    bild = new Visualisierung($('visual'));
    // Auch das Bild offenlegen: Am Abend laesst sich damit in der Konsole der
    // Modus umstellen, wenn einer gerade nicht zum Raum passt.
    welt.bild = bild;

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

  // `quelle` ist eine fertige Adresse (Supabase), `datei` ein Name im
  // Musikordner des lokalen Servers. Die Buehne muss nicht wissen, welches
  // von beiden gerade der Fall ist.
  const adresse = track.quelle ?? `/musik/${encodeURIComponent(track.datei)}`;
  const antwort = await fetch(adresse);
  if (!antwort.ok) throw new Error(`${track.titel} liess sich nicht laden (${antwort.status})`);
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
    const plan = welt.mixer.uebergang(angepasst, puffer, artWunsch || null, welt.zielenergie);
    // Ein neuer Track bringt eigene Drops mit.
    welt.bedienteDrops.clear();

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

// --- Wiedergabe anhalten und weiterlaufen lassen ---------------------------
//
// iOS friert den Tonkontext ein, sobald man die App wechselt oder das Display
// sperrt, und gibt ihn nur nach einer Beruehrung wieder frei. Ohne das hier
// stuende die Buehne danach stumm da und saehe kaputt aus.

async function tonWeiter() {
  if (!welt.ctx) return;
  try {
    await welt.ctx.resume();
  } catch {
    // Beim naechsten Antippen nochmal.
  }
  tonZustandZeigen();
}

function tonZustandZeigen() {
  const laeuft = welt.ctx?.state === 'running';
  $('weiter').hidden = laeuft || !welt.ctx;
  $('wiedergabe').textContent = laeuft ? '⏸' : '▶';
}

$('weiter').addEventListener('click', tonWeiter);

$('wiedergabe').addEventListener('click', async () => {
  if (!welt.ctx) return;
  if (welt.ctx.state === 'running') await welt.ctx.suspend();
  else await welt.ctx.resume();
  tonZustandZeigen();
});

// Beim Zurueckkommen aus dem Hintergrund gleich nachsehen.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tonZustandZeigen();
});

// --- Bedienung ------------------------------------------------------------

$('jetztUeberblenden').addEventListener('click', () => ueberblenden($('artWahl').value));

$('remixAn').addEventListener('change', (e) => {
  welt.remixAn = e.target.checked;
});

$('remixJetzt').addEventListener('click', () => maschineUmschalten());

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
  if (e.key === 'r' || e.key === 'R') maschineUmschalten();
});

// --- Zustand vom Server ---------------------------------------------------

welt.leitung.beiZustand((zustand) => {
  $('anlass').textContent = zustand.anlass ?? 'resident-dj';
  welt.zielenergie = zustand.zielenergie ?? 0.5;
  const prozent = Math.round(welt.zielenergie * 100);
  const regie = regieFuer(welt.zielenergie);
  $('energieWert').textContent = `${prozent} %`;
  $('stil').textContent = regie.name;
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

let bild = null;
let spektrumDaten = null;
let wellenDaten = null;
let letzteZeit = 0;

function leinwandAnpassen() {
  bild?.masseSetzen();
}
window.addEventListener('resize', leinwandAnpassen);

function schleife(jetzt = 0) {
  requestAnimationFrame(schleife);
  if (!welt.mixer) return;

  // Zeit zwischen zwei Bildern, gedeckelt: Nach einem Tabwechsel kaeme sonst
  // ein Riesensprung, und alle Bewegungen wuerden auf einmal durchrauschen.
  const sekunden = Math.min(0.05, (jetzt - letzteZeit) / 1000 || 0.016);
  letzteZeit = jetzt;

  const zustand = welt.mixer.zustand();

  if (!spektrumDaten) spektrumDaten = new Uint8Array(welt.mixer.messung.frequencyBinCount);
  // Die Wellenform ist doppelt so lang wie das Spektrum: fftSize Abtastwerte
  // im Zeitbereich gegen fftSize/2 Frequenzbaender. Der Modus "Wellen"
  // zeichnet sie unmittelbar, alle anderen ruehren sie nicht an.
  if (!wellenDaten) wellenDaten = new Float32Array(welt.mixer.messung.fftSize);
  welt.mixer.spektrum(spektrumDaten);
  welt.mixer.wellenform(wellenDaten);
  bild?.zeichne(zustand, spektrumDaten, sekunden, wellenDaten);

  zeichneDecks(zustand);
  zeichneUebergang(zustand);

  $('pegelBalken').style.width = `${Math.min(100, zustand.pegel * 260)}%`;
  $('uhr').textContent = new Date().toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const g = welt.naechsterGrund;
  $('naechsterGrund').textContent = welt.naechster
    ? `${g?.grund === 'wunsch' ? 'Gästewunsch' : 'Autopilot'} · Energie ${Math.round((welt.naechster.energie ?? 0) * 100)} %`
    : '';

  tonZustandZeigen();
  maschinePflegen();
  remixPruefen(zustand);
  nachschubPruefen();
  wachhund(zustand);
}

// --- Remix ----------------------------------------------------------------
//
// Vor jedem Drop wird geprueft, ob ein Loop-Roll hineinpasst und ob die Regie
// ihn gerade will. Die Regie haengt an der Zielenergie: frueh am Abend gar
// nicht, spaeter oft und schaerfer.

// --- Die Maschine ---------------------------------------------------------
//
// Der Grund, warum es sie gibt, stand eines Abends als Datei da: eine
// fuenfminuetige Aufnahme von Meeresrauschen. Kein Beat, nichts zum Anlegen,
// und die Tempoerkennung meldete pflichtbewusst 161 BPM. Ein Beatmatcher kann
// damit nichts anfangen.
//
// Ein DJ schon. Er wuerde eine Drum Machine daruntersetzen, dem Rauschen den
// Bass wegnehmen und es als Flaeche benutzen. Danach ist es Techno.

// Wenn die Quelle kein eigenes Tempo mitbringt, laeuft die Maschine hier.
// 128 ist die Mitte des Clubtempos und passt zu fast allem.
const MASCHINE_STANDARDTEMPO = 128;
// So weit wird der Musik der Bass weggenommen, solange die Maschine laeuft.
const MASCHINE_HOCHPASS = 165;

function maschineSichern() {
  if (!welt.maschine && welt.mixer) {
    welt.maschine = new Maschine(welt.ctx, welt.mixer.maschinenBus, (zeit, tiefe, dauer) =>
      welt.mixer.ducken(zeit, tiefe, dauer),
    );
  }
  return welt.maschine;
}

/**
 * Das Schlagwerk anwerfen.
 *
 * Tempo und Phase kommen vom laufenden Deck, wenn dessen Raster etwas taugt -
 * dann sitzt der Kick auf den Schlaegen der Musik. Taugt es nichts, setzt die
 * Maschine ihr eigenes Tempo, und die Quelle wird zur Flaeche darunter.
 */
function maschineStarten(grund = 'von Hand') {
  const maschine = maschineSichern();
  if (!maschine || welt.maschineLaeuft) return null;

  const deck = welt.mixer.laufendesDeck;
  const track = deck?.track;
  const traegt = deck?.laeuft && track && !track.ohneRaster && (track.bpmVertrauen ?? 1) >= 0.35;

  let bpm = MASCHINE_STANDARDTEMPO;
  let anker = welt.ctx.currentTime;
  if (traegt) {
    bpm = deck.effektivBpm() ?? MASCHINE_STANDARDTEMPO;
    // Die Kontextzeit von Beat 0 der Datei. Von dort aus rechnet die Maschine
    // selbst weiter - sie braucht das Deck danach nicht mehr.
    anker = deck.startZeit + ((track.raster ?? 0) - deck.startInDatei) / deck.tempo;
  }

  // Bei rasterlosem Material darf die Maschine auch Toene beisteuern. Bei
  // echter Musik nicht: Ein Stich in der falschen Tonart ist schlimmer als
  // gar keiner, und die Tonart kennen wir nicht.
  maschine.stiche = !traegt;
  maschine.zielenergie = welt.zielenergie;
  maschine.starten(bpm, anker);

  const jetzt = welt.ctx.currentTime;
  welt.mixer.maschinenPegel(jetzt, 1, 0.6);
  // Der Musik den Keller wegnehmen. Zwei Bassdrums uebereinander sind Matsch -
  // dieselbe Regel wie zwischen zwei Decks, hier zwischen Musik und Maschine.
  welt.mixer.musikHochpass(jetzt, MASCHINE_HOCHPASS, 1.5);

  welt.maschineLaeuft = true;
  welt.maschineGrund = traegt ? `auf ${bpm.toFixed(1)} BPM des Tracks` : `eigenes Tempo, ${grund}`;
  welt.verlauf.unshift({
    zeit: new Date(),
    art: 'Remix an',
    nach: track?.titel ?? '—',
    hinweis: welt.maschineGrund,
  });
  welt.verlauf = welt.verlauf.slice(0, 30);
  zeichneVerlauf();
  return maschine;
}

function maschineStoppen() {
  if (!welt.maschineLaeuft) return;
  const jetzt = welt.ctx.currentTime;
  // Erst ausblenden, dann den Planer abstellen - sonst bricht der Kick mitten
  // im Schlag ab.
  welt.mixer.maschinenPegel(jetzt, 0, 0.8);
  welt.mixer.musikHochpass(jetzt, 20, 1.2);
  setTimeout(() => welt.maschine?.stoppen(), 900);

  welt.maschineLaeuft = false;
  welt.maschineGrund = null;
  welt.verlauf.unshift({ zeit: new Date(), art: 'Remix aus', nach: '—', hinweis: '' });
  welt.verlauf = welt.verlauf.slice(0, 30);
  zeichneVerlauf();
}

function maschineUmschalten() {
  if (welt.maschineLaeuft) {
    welt.maschineVonHand = false;
    // Merken, dass es fuer diesen Track ausdruecklich nicht gewollt ist.
    welt.maschineAbgelehnt = welt.mixer?.laufendesDeck?.track?.id ?? null;
    maschineStoppen();
  } else {
    welt.maschineVonHand = true;
    welt.maschineAbgelehnt = null;
    maschineStarten('Knopf');
  }
}

/**
 * Muss die Maschine von allein anspringen?
 *
 * Ja, sobald ein Track laeuft, dessen Raster nichts taugt. Ohne Raster kann
 * der Mixer nicht mischen - er wuesste nicht, wo die Phrasengrenzen liegen -
 * und ohne Schlagwerk waere so ein Stueck auf einer Party einfach eine Pause.
 * Mit Schlagwerk ist es eine Flaeche, ueber der ein Beat laeuft.
 *
 * Umgekehrt: Hat der naechste Track wieder ein sauberes Raster, macht die
 * Maschine Platz - aber nur, wenn sie von allein angesprungen ist. Wer sie von
 * Hand eingeschaltet hat, will sie behalten.
 */
function maschineNachfuehren() {
  const deck = welt.mixer?.laufendesDeck;
  const track = deck?.track;
  if (!deck?.laeuft || !track) return;

  // Der Widerspruch gilt nur fuer den Track, bei dem er geaeussert wurde.
  // Kommt der naechste, faengt die Nachfuehrung wieder bei null an.
  if (welt.maschineAbgelehnt && welt.maschineAbgelehnt !== track.id) {
    welt.maschineAbgelehnt = null;
  }

  const braucht = track.ohneRaster === true || (track.bpmVertrauen ?? 1) < 0.35;

  if (braucht && !welt.maschineLaeuft && welt.maschineAbgelehnt !== track.id) {
    maschineStarten('kein Raster im Track');
    welt.maschineVonHand = false;
  } else if (!braucht && welt.maschineLaeuft && !welt.maschineVonHand) {
    maschineStoppen();
  }
}

// Jedes Bild: planen, was faellig ist, und die Anzeige nachziehen.
function maschinePflegen() {
  maschineNachfuehren();
  if (!welt.maschine) return;
  welt.maschine.zielenergie = welt.zielenergie;
  welt.maschine.tick();

  const knopf = $('remixJetzt');
  if (!knopf) return;
  if (welt.maschineLaeuft) {
    const m = welt.maschine.zustand();
    knopf.textContent = 'Remix stoppen';
    knopf.classList.add('an');
    $('maschineZeile').hidden = false;
    $('maschineTakt').textContent = `${m.taktImBlock + 1}/32`;
    $('maschineAbschnitt').textContent = m.abschnitt;
    $('maschineStufe').textContent = m.stufe;
    $('maschineStimmen').textContent = m.stimmen.join(' · ') || '—';
    $('maschineTempo').textContent = `${m.bpm.toFixed(1)} BPM`;
  } else {
    knopf.textContent = 'Remix starten';
    knopf.classList.remove('an');
    $('maschineZeile').hidden = true;
  }
}

function remixPruefen(zustand) {
  if (!welt.remixAn || welt.wechselLaeuft) return;

  const deck = welt.mixer.laufendesDeck;
  const drops = deck?.track?.marken?.filter((m) => m.name === 'drop') ?? [];
  if (drops.length === 0 || !deck.laeuft) return;

  const beatLaenge = 60 / deck.track.bpm;
  const jetztBeat = (deck.stelle() - (deck.track.raster ?? 0)) / beatLaenge;

  for (const drop of drops) {
    const schluessel = `${deck.track.id}:${drop.beat}`;
    if (welt.bedienteDrops.has(schluessel)) continue;

    const beatsBisZiel = drop.beat - jetztBeat;
    if (beatsBisZiel <= 0) {
      // Vorbei, ohne dass gerollt wurde - zaehlt trotzdem als Drop.
      welt.bedienteDrops.add(schluessel);
      welt.seitLetztemRoll++;
      continue;
    }

    if (!rollLohntSich({
      zielenergie: welt.zielenergie,
      seitLetztemRoll: welt.seitLetztemRoll,
      imUebergang: welt.wechselLaeuft,
      beatsBisZiel,
    })) continue;

    const regie = regieFuer(welt.zielenergie);
    const plan = loopRoll(deck, drop.beat, regie.rollLaengen);
    welt.bedienteDrops.add(schluessel);

    if (plan) {
      welt.seitLetztemRoll = 0;
      welt.verlauf.unshift({
        zeit: new Date(),
        art: `Roll (${regie.name})`,
        nach: deck.track.titel,
        hinweis: `${plan.laengen.length} Stufen auf ${plan.beats} Beats`,
      });
      welt.verlauf = welt.verlauf.slice(0, 30);
      zeichneVerlauf();
    }
    return;
  }
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
  // Angehalten ist keine Stoerung, sondern Absicht.
  if (welt.ctx?.state !== 'running') {
    welt.stilleSeit = null;
    return;
  }
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

// Links steht immer, was laeuft, rechts was kommt - unabhaengig davon,
// welches Deck der Mixer gerade benutzt. Fuer den, der davorsteht, ist "Deck
// B" bedeutungslos; "als naechstes" nicht.
function zeichneDecks(zustand) {
  const u = zustand.uebergang;
  let laufend;
  let anderes;

  if (u && u.fortschritt > 0) {
    // Waehrend einer Blende richtet sich die Anzeige nach dem Uebergang, nicht
    // nach der Deck-Zaehlung des Mixers: Der schaltet intern schon um, wenn
    // der Neue erst anfaengt hochzukommen. Zu hoeren ist da noch der Alte -
    // und links soll stehen, was man hoert.
    laufend = zustand.decks.find((d) => d.track?.id === u.vonTrack?.id && d.laeuft);
    anderes = zustand.decks.find((d) => d.track?.id === u.nachTrack?.id && d.laeuft);
  }

  laufend ??= zustand.decks.find((d) => d.aktiv && d.laeuft) ?? zustand.decks[0];
  anderes ??= zustand.decks.find((d) => d !== laufend && d.laeuft);

  fuelleSeite($('deckA'), laufend, true);

  if (anderes) {
    // Waehrend eines Uebergangs laeuft der Neue schon - dann zeigt die rechte
    // Seite ihn mitsamt seinen Reglern.
    fuelleSeite($('deckB'), anderes, true);
  } else if (welt.naechster) {
    // Sonst der vorbereitete Track, noch ohne Laufwerte.
    fuelleSeite($('deckB'), { track: welt.naechster, bpm: welt.naechster.bpm, tempo: 1,
                              stelle: 0, dauer: 0, blende: 0, tief: 0 }, false);
  } else {
    fuelleSeite($('deckB'), null, false);
  }
}

function fuelleSeite(knoten, daten, hervorheben) {
  knoten.classList.toggle('aktiv', !!daten && hervorheben);

  if (!daten?.track) {
    knoten.querySelector('.deck-titel').textContent = '–';
    knoten.querySelector('.deck-interpret').textContent = '';
    knoten.querySelector('.deck-bpm').textContent = '';
    knoten.querySelector('.fortschritt > i').style.width = '0%';
    return;
  }

  knoten.querySelector('.deck-titel').textContent = daten.track.titel ?? '–';
  knoten.querySelector('.deck-interpret').textContent = daten.track.interpret ?? '';
  knoten.querySelector('.deck-bpm').textContent = daten.bpm
    ? `${daten.bpm.toFixed(1)} BPM${Math.abs(daten.tempo - 1) > 0.001 ? ` · ${((daten.tempo - 1) * 100).toFixed(1)} %` : ''}`
    : '';

  const anteil = daten.dauer ? Math.min(1, daten.stelle / daten.dauer) : 0;
  knoten.querySelector('.fortschritt > i').style.width = `${anteil * 100}%`;
  zeichneMarken(knoten.querySelector('.fortschritt > u'), daten);

  knoten.querySelector('[data-regler="blende"]').style.width = `${daten.blende * 100}%`;
  // Bass: 0 dB = voll, -32 dB = weg.
  knoten.querySelector('[data-regler="tief"]').style.width =
    `${Math.max(0, 1 + daten.tief / 32) * 100}%`;
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

// --- Steuerung zeigen und verstecken --------------------------------------
//
// Auf einem Monitor im Raum soll nichts herumstehen, was niemand bedient.
// Jede Maus- oder Fingerbewegung holt die Leiste zurueck, danach verschwindet
// sie wieder.
let ruheZaehler = null;
function steuerungZeigen() {
  $('steuerung').classList.add('sichtbar');
  clearTimeout(ruheZaehler);
  ruheZaehler = setTimeout(() => {
    // Nicht wegblenden, solange jemand tatsaechlich an einem Regler haengt.
    if ($('steuerung').contains(document.activeElement)) return steuerungZeigen();
    $('steuerung').classList.remove('sichtbar');
  }, 3500);
}
for (const ereignis of ['mousemove', 'touchstart', 'keydown']) {
  window.addEventListener(ereignis, steuerungZeigen, { passive: true });
}

// Die Uebergangsarten aus der Engine in die Auswahlliste, damit beides nicht
// auseinanderlaeuft.
for (const [schluessel, plan] of Object.entries(UEBERGAENGE)) {
  const option = [...$('artWahl').options].find((o) => o.value === schluessel);
  if (option) option.title = plan.beschreibung;
}
