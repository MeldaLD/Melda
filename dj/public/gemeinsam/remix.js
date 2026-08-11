// Remixen: den Track umbauen, statt ihn nur abzuspielen.
//
// Der wichtigste Handgriff aus der DJ-Praxis ist der **Loop-Roll**: Kurz vor
// dem Drop wird eine Schleife fortlaufend halbiert - vier Beats, zwei, einer,
// ein halber. Das zieht die Spannung an wie eine Feder, und der Drop trifft
// danach haerter. Es funktioniert, weil das Ohr die Beschleunigung als
// Steigerung liest, obwohl nichts lauter wird.
//
// Umgesetzt ist das nicht ueber `loop` am AudioBufferSourceNode. Dessen
// Schleifenpunkte waehrend der Wiedergabe zu verkuerzen ist heikel: Steht der
// Abspielkopf schon hinter dem neuen Ende, laeuft die Quelle einfach weiter.
// Stattdessen wird jede Wiederholung als eigene, sample-genau geplante Quelle
// gestartet. Web Audio kann das auf die Abtastrate genau, und mit ein paar
// Millisekunden Ein- und Ausblendung knackt nichts.
//
// Der heikle Punkt ist danach: Ein Roll wiederholt Material, also laufen
// Musikzeit und Dateizeit auseinander. Deshalb wird das Deck danach
// ausdruecklich neu verankert - sonst stimmt jede spaetere Beatrechnung nicht
// mehr, und der naechste Uebergang sitzt daneben.

import { beatZeit, beatDauer, kontextZeitVonBeat } from './takt.js';

// Kurze Rampe an den Naht­stellen. Drei Millisekunden hoert niemand, ein
// harter Schnitt im Wellenverlauf dagegen knackt deutlich.
const NAHT = 0.003;

/**
 * Plant einen Loop-Roll, der auf einem bestimmten Beat endet.
 *
 * @param deck        das laufende Deck
 * @param zielBeat    Beat, auf dem der Track normal weiterlaufen soll (der Drop)
 * @param laengen     Schleifenlaengen in Beats, in der Reihenfolge des Ablaufs
 * @returns Beschreibung des Rolls oder null, wenn er nicht mehr passt
 */
// Summiert sich auf genau 16 Beats - vier Takte, eine halbe Phrase. Ein Roll
// muss ein musikalisches Mass ersetzen, sonst verschiebt er alles Folgende.
export const ROLL_STANDARD = [4, 4, 2, 2, 1, 1, 0.5, 0.5, 0.5, 0.5];

export function loopRoll(deck, zielBeat, laengen = ROLL_STANDARD) {
  if (!deck?.laeuft || !deck.track?.bpm || !deck.quelle?.buffer) return null;

  const ctx = deck.ctx;
  const gesamtBeats = laengen.reduce((a, b) => a + b, 0);
  const startBeat = zielBeat - gesamtBeats;

  const beatKontext = beatDauer(deck.track.bpm) / deck.tempo;
  const startZeit = kontextZeitVonBeat(deck, startBeat);

  // Es muss noch Zeit zum Einplanen bleiben. Ein Roll, der vor einer
  // Zehntelsekunde haette anfangen sollen, wird nicht nachgeholt.
  if (startZeit < ctx.currentTime + 0.1) return null;

  // Wiederholt wird das, was *vor* dem Ziel liegt - beim Drop also die letzten
  // Takte des Aufbaus. Der Ausschnitt beginnt eine Schleifenlaenge vor dem
  // jeweiligen Zeitpunkt und ist damit musikalisch an der richtigen Stelle.
  const puffer = deck.quelle.buffer;
  const abschnitte = [];
  let beat = startBeat;

  for (const laenge of laengen) {
    const inDatei = beatZeit(deck.track, startBeat);
    const dauerDatei = laenge * beatDauer(deck.track.bpm);
    if (inDatei < 0 || inDatei + dauerDatei > puffer.duration) return null;

    abschnitte.push({
      zeit: kontextZeitVonBeat(deck, beat),
      inDatei,
      dauer: dauerDatei,
      laenge,
    });
    beat += laenge;
  }

  // Die laufende Quelle endet dort, wo der Roll beginnt.
  deck.quelle.stop(startZeit);

  for (const abschnitt of abschnitte) {
    const quelle = ctx.createBufferSource();
    quelle.buffer = puffer;
    quelle.playbackRate.value = deck.tempo;

    // Eigener Regler je Wiederholung, nur fuer die Naht. Die Lautstaerke des
    // Decks bleibt davon unberuehrt.
    const naht = ctx.createGain();
    naht.gain.setValueAtTime(0, abschnitt.zeit);
    naht.gain.linearRampToValueAtTime(1, abschnitt.zeit + NAHT);
    const endeKontext = abschnitt.zeit + abschnitt.dauer / deck.tempo;
    naht.gain.setValueAtTime(1, endeKontext - NAHT);
    naht.gain.linearRampToValueAtTime(0, endeKontext);

    quelle.connect(naht).connect(deck.angleich);
    quelle.start(abschnitt.zeit, abschnitt.inDatei, abschnitt.dauer);
    quelle.stop(endeKontext + 0.01);
  }

  // Nach dem Roll geht es beim Ziel weiter. Das Deck wird dabei neu verankert,
  // damit `stelle()` und alle Beatrechnungen wieder stimmen.
  const zielZeit = kontextZeitVonBeat(deck, zielBeat);
  const zielInDatei = beatZeit(deck.track, zielBeat);

  const weiter = ctx.createBufferSource();
  weiter.buffer = puffer;
  weiter.playbackRate.value = deck.tempo;
  weiter.connect(deck.angleich);
  weiter.start(zielZeit, Math.max(0, zielInDatei));

  deck.quelle = weiter;
  // Erst ab dem Zielzeitpunkt umhaengen. Wuerde der Anker sofort gesetzt,
  // rechnete das Deck waehrend des Rolls mit einem Start in der Zukunft -
  // Fortschrittsbalken und Visualisierung liefen rueckwaerts.
  deck.verankernAb(zielZeit, zielZeit, zielInDatei);

  return {
    art: 'roll',
    startZeit,
    endeZeit: zielZeit,
    startBeat,
    zielBeat,
    laengen,
    beats: gesamtBeats,
    sekunden: gesamtBeats * beatKontext,
  };
}

/**
 * Verlängert eine Stelle, indem sie mehrfach wiederholt wird.
 *
 * Damit trägt ein Outro eine lange Blende, statt sie zu hetzen. Dieselbe
 * Mechanik wie der Roll, nur mit gleichbleibender Länge.
 */
export function verlaengern(deck, abBeat, laenge = 16, wiederholungen = 1) {
  return loopRoll(deck, abBeat + laenge * wiederholungen, Array(wiederholungen).fill(laenge));
}

/**
 * Lohnt sich hier ein Roll?
 *
 * Nicht vor jedem Drop - sonst wird aus einem Kniff eine Masche, und nach dem
 * dritten Mal hört niemand mehr hin. Ausserdem braucht ein Roll Anlauf: Vor
 * dem ersten Drop eines Tracks, kurz nach einem Uebergang oder wenn der Raum
 * noch leer ist, ist er fehl am Platz.
 */
export function rollLohntSich({ zielenergie, seitLetztemRoll, imUebergang, beatsBisZiel }) {
  if (imUebergang) return false;
  // Der Roll muss vollstaendig hineinpassen und noch planbar sein.
  if (beatsBisZiel < 16 || beatsBisZiel > 64) return false;
  // Im leisen Teil des Abends wirkt die Steigerung aufdringlich.
  if (zielenergie < 0.45) return false;
  // Höchstens jeder dritte Drop.
  return seitLetztemRoll >= 3;
}
