// Musik aus dem Nichts, damit man den DJ hoeren kann, bevor es eine Bibliothek
// gibt.
//
// Das ist kein Ersatz fuer echte Tracks - es ist ein Pruefstand. Der Vorteil
// gegenueber echter Musik ist, dass hier *alles bekannt ist*: Tempo, Raster,
// Downbeats, Struktur, Energie. Damit laesst sich die Mischmaschine gegen
// perfekte Daten testen. Klingt ein Uebergang schlecht, liegt es dann am
// Mischen und nicht an einer verrutschten Beaterkennung - diese beiden Fehler
// auseinanderzuhalten ist sonst muehsam.
//
// Aufgebaut wie ein Clubtrack: Intro, Aufbau, Hauptteil, Breakdown, Drop, Outro.

import { BEATS_PRO_TAKT } from './takt.js';

const TAKTE = 64;

// Ein Moll-Grundton je Track, damit nicht alles gleich klingt.
const GRUNDTOENE = [55, 58.27, 61.74, 65.41, 69.3, 73.42, 49, 51.91];

const ABSCHNITTE = [
  { name: 'intro', vonTakt: 0, bisTakt: 8 },
  { name: 'aufbau', vonTakt: 8, bisTakt: 16 },
  { name: 'haupt', vonTakt: 16, bisTakt: 32 },
  { name: 'breakdown', vonTakt: 32, bisTakt: 40 },
  { name: 'drop', vonTakt: 40, bisTakt: 56 },
  { name: 'outro', vonTakt: 56, bisTakt: 64 },
];

// Kleiner, reproduzierbarer Zufall - derselbe Startwert ergibt denselben Track.
function wuerfel(startwert) {
  let zustand = startwert >>> 0;
  return () => {
    zustand = (zustand * 1664525 + 1013904223) >>> 0;
    return zustand / 4294967296;
  };
}

function abschnittBei(takt) {
  return ABSCHNITTE.find((a) => takt >= a.vonTakt && takt < a.bisTakt) ?? ABSCHNITTE[0];
}

/**
 * Erzeugt einen vollstaendigen Demo-Track.
 * Gibt die Beschreibung (wie sie sonst aus der Analyse kaeme) und den Klang zurueck.
 */
export function erzeugeTrack(ctx, { nummer, bpm, energie, titel }) {
  const zufall = wuerfel(nummer * 7919 + 13);
  const rate = ctx.sampleRate;
  const beatSekunden = 60 / bpm;
  const gesamtBeats = TAKTE * BEATS_PRO_TAKT;
  const dauer = gesamtBeats * beatSekunden + 1;
  const laenge = Math.ceil(dauer * rate);

  const puffer = ctx.createBuffer(2, laenge, rate);
  const links = puffer.getChannelData(0);
  const rechts = puffer.getChannelData(1);

  const grundton = GRUNDTOENE[nummer % GRUNDTOENE.length];

  // Absichtlich unterschiedlich laut abmischen. So laesst sich hoeren, was der
  // Lautheitsangleich tut - mit Angleich klingt der Abend wie aus einem Guss,
  // ohne springt jeder Wechsel.
  const versatzDb = -8 + zufall() * 10;
  const versatz = 10 ** (versatzDb / 20);

  for (let beat = 0; beat < gesamtBeats; beat++) {
    const takt = Math.floor(beat / BEATS_PRO_TAKT);
    const imTakt = beat % BEATS_PRO_TAKT;
    const abschnitt = abschnittBei(takt).name;
    const zeit = beat * beatSekunden;
    const start = Math.floor(zeit * rate);

    const bass = abschnitt !== 'intro' && abschnitt !== 'breakdown';
    const treibend = abschnitt === 'haupt' || abschnitt === 'drop';
    const wucht = abschnitt === 'drop' ? 1 : abschnitt === 'haupt' ? 0.85 : 0.6;

    // --- Bassdrum: das Rueckgrat, vier auf den Boden --------------------
    if (bass) {
      kick(links, rechts, start, rate, (0.85 + energie * 0.15) * wucht);
    } else if (abschnitt === 'intro' && takt >= 4 && imTakt === 0) {
      // Im Intro nur die Eins - so hat der Mixer schon einen Anker.
      kick(links, rechts, start, rate, 0.5);
    }

    // --- Clap auf zwei und vier -----------------------------------------
    if (treibend && (imTakt === 1 || imTakt === 3)) {
      clap(links, rechts, start, rate, 0.4 * wucht);
    }

    // --- Hihats: die Dichte macht die Energie ----------------------------
    const hutDichte = abschnitt === 'breakdown' ? 1 : treibend ? (energie > 0.5 ? 4 : 2) : 2;
    for (let i = 0; i < hutDichte; i++) {
      const versetzt = start + Math.floor(((i * beatSekunden) / hutDichte) * rate);
      const offbeat = i % 2 === 1;
      hut(links, rechts, versetzt, rate, (offbeat ? 0.22 : 0.12) * wucht, zufall());
    }

    // --- Bass: geduckt, damit die Kick durchkommt ------------------------
    if (bass) {
      const stufe = [0, 0, 3, 0, 5, 0, 3, -2][beat % 8];
      const freq = grundton * 2 ** (stufe / 12);
      bassTon(links, rechts, start, rate, beatSekunden, freq, 0.5 * wucht, energie);
    }

    // --- Flaeche und Stabs ------------------------------------------------
    if (abschnitt === 'breakdown' || abschnitt === 'intro') {
      if (imTakt === 0) {
        flaeche(links, rechts, start, rate, beatSekunden * 4, grundton * 4, 0.16);
      }
    } else if (treibend && imTakt === 2) {
      stab(links, rechts, start + Math.floor(beatSekunden * 0.5 * rate), rate, grundton * 4, 0.2 * wucht);
    }
  }

  // Gesamtpegel setzen und gegen Uebersteuern sichern.
  for (let i = 0; i < laenge; i++) {
    links[i] = weich(links[i] * versatz);
    rechts[i] = weich(rechts[i] * versatz);
  }

  const marken = ABSCHNITTE.map((a) => ({
    name: a.name,
    beat: a.vonTakt * BEATS_PRO_TAKT,
    sekunde: a.vonTakt * BEATS_PRO_TAKT * beatSekunden,
  }));

  return {
    track: {
      id: `demo-${nummer}`,
      titel,
      interpret: 'Pruefstand',
      bpm,
      // Wir erzeugen die Datei selbst, der erste Downbeat liegt also exakt auf null.
      raster: 0,
      // Nicht bei null einsteigen: Das Intro traegt nur Flaeche und Hihats, da
      // gibt es nichts, worauf sich mischen liesse. Der erste brauchbare
      // Downbeat ist der, an dem die Bassdrum durchlaeuft - Takt 8. Die
      // Analyse echter Tracks wird spaeter denselben Wert liefern.
      einstiegBeat: 8 * BEATS_PRO_TAKT,
      dauer,
      energie,
      note: 1,
      // Genau der Wert, der den absichtlichen Pegelversatz wieder aufhebt.
      angleichDb: Number((-versatzDb).toFixed(2)),
      versatzDb: Number(versatzDb.toFixed(2)),
      marken,
      demo: true,
    },
    puffer,
  };
}

// Acht Tracks ueber die ganze Spannweite: chillig und langsam bis hart und schnell.
export function demoBibliothek(ctx, beiFortschritt = () => {}) {
  const vorgaben = [
    { bpm: 118, energie: 0.12, titel: 'Erstes Licht' },
    { bpm: 120, energie: 0.25, titel: 'Langsam voll' },
    { bpm: 122, energie: 0.38, titel: 'Erste Bewegung' },
    { bpm: 124, energie: 0.5, titel: 'Es traegt' },
    { bpm: 126, energie: 0.62, titel: 'Kein Zurueck' },
    { bpm: 128, energie: 0.74, titel: 'Vollgas' },
    { bpm: 130, energie: 0.86, titel: 'Brett' },
    { bpm: 132, energie: 0.95, titel: 'Letzte Runde' },
  ];

  const fertig = [];
  for (const [nummer, vorgabe] of vorgaben.entries()) {
    beiFortschritt(nummer, vorgaben.length, vorgabe.titel);
    fertig.push(erzeugeTrack(ctx, { nummer, ...vorgabe }));
  }
  beiFortschritt(vorgaben.length, vorgaben.length, null);
  return fertig;
}

// --- Klangerzeuger --------------------------------------------------------

// Bassdrum: Sinus, dessen Tonhoehe schnell nach unten faellt. Der Klick am
// Anfang gibt ihr die Durchsetzungskraft.
function kick(links, rechts, start, rate, staerke) {
  const laenge = Math.floor(0.4 * rate);
  let phase = 0;
  for (let i = 0; i < laenge; i++) {
    const stelle = start + i;
    if (stelle >= links.length) break;
    const t = i / rate;
    const freq = 48 + 110 * Math.exp(-t / 0.022);
    phase += (2 * Math.PI * freq) / rate;
    const huelle = Math.exp(-t / 0.11);
    const klick = i < 40 ? (1 - i / 40) * 0.35 : 0;
    const wert = (Math.sin(phase) * huelle + klick) * staerke;
    links[stelle] += wert;
    rechts[stelle] += wert;
  }
}

// Clap: mehrere kurze Rauschstoesse kurz hintereinander, dann ein Nachhall.
function clap(links, rechts, start, rate, staerke) {
  const laenge = Math.floor(0.22 * rate);
  let hp = 0;
  let vorher = 0;
  for (let i = 0; i < laenge; i++) {
    const stelle = start + i;
    if (stelle >= links.length) break;
    const t = i / rate;
    // Drei Anrisse, dann der Schwanz.
    const anriss = t < 0.03 ? (Math.floor(t / 0.009) % 2 === 0 ? 1 : 0.35) : Math.exp(-(t - 0.03) / 0.055);
    const roh = Math.random() * 2 - 1;
    hp = 0.86 * (hp + roh - vorher);
    vorher = roh;
    const wert = hp * anriss * staerke;
    links[stelle] += wert * 0.9;
    rechts[stelle] += wert;
  }
}

// Hihat: sehr kurzes, helles Rauschen. Leicht nach links/rechts gestreut.
function hut(links, rechts, start, rate, staerke, streuung) {
  const laenge = Math.floor(0.05 * rate);
  let hp = 0;
  let vorher = 0;
  const nachLinks = 0.5 + (streuung - 0.5) * 0.5;
  for (let i = 0; i < laenge; i++) {
    const stelle = start + i;
    if (stelle >= links.length) break;
    const huelle = Math.exp(-(i / rate) / 0.012);
    const roh = Math.random() * 2 - 1;
    hp = 0.93 * (hp + roh - vorher);
    vorher = roh;
    const wert = hp * huelle * staerke;
    links[stelle] += wert * nachLinks;
    rechts[stelle] += wert * (1 - nachLinks);
  }
}

// Bass: Saegezahn mit Tiefpass, der bei jeder Kick kurz zurueckgenommen wird.
// Dieses Ducken ist das, was Clubmusik nach Clubmusik klingen laesst.
function bassTon(links, rechts, start, rate, beatSekunden, freq, staerke, energie) {
  const laenge = Math.floor(beatSekunden * 0.95 * rate);
  let phase = 0;
  let tp = 0;
  const glaette = 0.12 + energie * 0.14;
  for (let i = 0; i < laenge; i++) {
    const stelle = start + i;
    if (stelle >= links.length) break;
    const t = i / rate;
    phase += freq / rate;
    if (phase > 1) phase -= 1;
    const saege = phase * 2 - 1;
    tp += glaette * (saege - tp);
    // Ducken: direkt nach der Kick leise, dann wieder hoch.
    const ducken = 1 - 0.75 * Math.exp(-t / 0.085);
    const huelle = Math.min(1, t / 0.005) * Math.exp(-t / (beatSekunden * 0.8));
    const wert = tp * ducken * huelle * staerke;
    links[stelle] += wert;
    rechts[stelle] += wert;
  }
}

// Stab: kurzer, harter Akkord auf dem Offbeat.
function stab(links, rechts, start, rate, freq, staerke) {
  const laenge = Math.floor(0.28 * rate);
  const stimmen = [1, 1.005, 1.498];
  const phasen = [0, 0, 0];
  let tp = 0;
  for (let i = 0; i < laenge; i++) {
    const stelle = start + i;
    if (stelle >= links.length) break;
    const t = i / rate;
    let summe = 0;
    for (let s = 0; s < stimmen.length; s++) {
      phasen[s] += (freq * stimmen[s]) / rate;
      if (phasen[s] > 1) phasen[s] -= 1;
      summe += phasen[s] * 2 - 1;
    }
    tp += 0.35 * (summe / stimmen.length - tp);
    const huelle = Math.min(1, t / 0.004) * Math.exp(-t / 0.09);
    const wert = tp * huelle * staerke;
    links[stelle] += wert;
    rechts[stelle] += wert * 0.85;
  }
}

// Flaeche: langsam anschwellender, dunkler Akkord fuer Intro und Breakdown.
function flaeche(links, rechts, start, rate, dauer, freq, staerke) {
  const laenge = Math.floor(dauer * rate);
  const stimmen = [0.5, 0.7515, 1, 1.003];
  const phasen = new Array(stimmen.length).fill(0);
  let tpL = 0;
  let tpR = 0;
  for (let i = 0; i < laenge; i++) {
    const stelle = start + i;
    if (stelle >= links.length) break;
    const t = i / rate;
    let summe = 0;
    for (let s = 0; s < stimmen.length; s++) {
      phasen[s] += (freq * stimmen[s]) / rate;
      if (phasen[s] > 1) phasen[s] -= 1;
      summe += phasen[s] * 2 - 1;
    }
    summe /= stimmen.length;
    // Zwei leicht verschiedene Tiefpaesse ergeben Breite.
    tpL += 0.06 * (summe - tpL);
    tpR += 0.055 * (summe - tpR);
    const huelle = Math.min(1, t / (dauer * 0.35)) * Math.min(1, (dauer - t) / (dauer * 0.4));
    links[stelle] += tpL * huelle * staerke;
    rechts[stelle] += tpR * huelle * staerke;
  }
}

// Weiche Begrenzung statt hartem Anschlag.
function weich(wert) {
  return Math.tanh(wert * 0.8);
}
