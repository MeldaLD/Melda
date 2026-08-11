// Die Rechnerei hinter jedem Uebergang: Wo ist die naechste Phrasengrenze, wann
// faellt Beat Nummer n, und wie weit darf ich am Tempo drehen?
//
// Bewusst reine Funktionen ohne Web Audio - so laesst sich das in Node
// nachrechnen (siehe pruefungen/takt.mjs). Timing ist die Fehlerquelle Nummer
// eins beim Mischen, und ein Fehler hier hoert sich nicht nach Fehler an,
// sondern nur nach "irgendwie schlecht".

// Elektronische Musik ist in Achtergruppen gebaut. Ein Uebergang auf dem
// richtigen Beat, aber mitten in der Phrase, klingt falsch - auch wenn das
// Tempo exakt stimmt. Das ist der groesste Hebel fuer Qualitaet ueberhaupt.
export const BEATS_PRO_TAKT = 4;
export const TAKTE_PRO_PHRASE = 8;
export const BEATS_PRO_PHRASE = BEATS_PRO_TAKT * TAKTE_PRO_PHRASE; // 32

// Sekunden pro Beat.
export function beatDauer(bpm) {
  return 60 / bpm;
}

// Wann faellt Beat n, in Sekunden ab Dateianfang?
// `raster` ist der Versatz des ersten Downbeats - fast nie exakt null, weil
// Dateien mit etwas Stille oder einem Anspieler beginnen.
export function beatZeit(track, beatNr) {
  return track.raster + beatNr * beatDauer(track.bpm);
}

// Umgekehrt: Auf welchem Beat stehen wir zum Zeitpunkt `sekunden`?
// Nicht gerundet - die Nachkommastelle ist die Position innerhalb des Beats.
export function beatBei(track, sekunden) {
  return (sekunden - track.raster) / beatDauer(track.bpm);
}

// Die naechste Phrasengrenze ab `sekunden`, als Beatnummer.
// `mindestensBeats` haelt Abstand, damit noch Zeit zum Vorbereiten bleibt -
// eine Grenze, die in 50 Millisekunden faellt, nuetzt niemandem.
export function naechstePhrase(track, sekunden, mindestensBeats = 2) {
  const jetzt = beatBei(track, sekunden) + mindestensBeats;
  const phrase = Math.ceil(jetzt / BEATS_PRO_PHRASE) * BEATS_PRO_PHRASE;
  // Bei negativem Raster kann die erste Grenze vor dem Dateianfang liegen.
  return Math.max(0, phrase);
}

// Und die naechste Taktgrenze - fuer Notfaelle, bei denen 32 Beats zu lange
// dauern und ein Schnitt auf die Eins reicht.
export function naechsterTakt(track, sekunden, mindestensBeats = 1) {
  const jetzt = beatBei(track, sekunden) + mindestensBeats;
  return Math.max(0, Math.ceil(jetzt / BEATS_PRO_TAKT) * BEATS_PRO_TAKT);
}

// Mit welcher Abspielgeschwindigkeit muss der *neue* Track laufen, damit er auf
// den laufenden passt? Rueckgabe 1 heisst: nicht angleichen, sondern schneiden.
//
// Ueber etwa sechs Prozent Zug klingt es nach Chipmunk, und das hoert jeder.
// Wir dehnen die Zeit nicht (kein Time-Stretch) - genau wie ein Plattenspieler
// verschiebt sich die Tonhoehe mit. Deshalb die enge Grenze.
export function tempoVerhaeltnis(laufendBpm, neuBpm, toleranz = 0.06) {
  if (!laufendBpm || !neuBpm) {
    return { verhaeltnis: 1, passt: false, grund: 'kein Tempo bekannt' };
  }

  const kandidaten = [
    // Der Normalfall: der Neue laeuft auf demselben Tempo.
    { verhaeltnis: laufendBpm / neuBpm, art: 'direkt' },
    // Halbes und doppeltes Tempo passen musikalisch trotzdem: ein 64er-Track
    // laeuft zu 128er-Beats, nur mit halb so vielen Schlaegen. Damit werden
    // Paarungen moeglich, die sonst als "zu weit" durchgefallen waeren.
    { verhaeltnis: laufendBpm / 2 / neuBpm, art: 'halb' },
    { verhaeltnis: (laufendBpm * 2) / neuBpm, art: 'doppelt' },
  ];

  let bester = null;
  for (const kandidat of kandidaten) {
    const zug = Math.abs(kandidat.verhaeltnis - 1);
    // Kleine Zugabe gegen Fliesskommastaub: 1.06 - 1 ergibt in Gleitkomma
    // knapp mehr als 0.06 und wuerde sonst genau an der Grenze durchfallen.
    if (zug <= toleranz + 1e-9 && (!bester || zug < bester.zug)) {
      bester = { ...kandidat, zug };
    }
  }

  if (!bester) {
    return {
      verhaeltnis: 1,
      passt: false,
      grund: `${Math.round(neuBpm)} auf ${Math.round(laufendBpm)} BPM ist zu weit`,
    };
  }
  return { verhaeltnis: bester.verhaeltnis, passt: true, art: bester.art, zug: bester.zug };
}

// Kontextzeit eines Beats auf einem laufenden Deck.
//
//   startZeit   wann die Wiedergabe begann (Zeitachse des AudioContext)
//   startInDatei  ab welcher Stelle der Datei gestartet wurde
//   tempo       Abspielgeschwindigkeit
//
// Weil die Datei schneller oder langsamer laeuft, ist die Zeit in der Datei
// nicht die Zeit im Raum - deshalb die Division durch das Tempo.
export function kontextZeitVonBeat(deck, beatNr) {
  const inDatei = beatZeit(deck.track, beatNr);
  return deck.startZeit + (inDatei - deck.startInDatei) / deck.tempo;
}

// Umgekehrt: Wo steht ein laufendes Deck jetzt in seiner Datei?
export function stelleInDatei(deck, kontextZeit) {
  return deck.startInDatei + (kontextZeit - deck.startZeit) * deck.tempo;
}
