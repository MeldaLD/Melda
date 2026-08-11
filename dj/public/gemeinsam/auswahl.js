// Wer kommt als naechstes? Diese Datei ist der eigentliche DJ-Kopf.
//
// Grundsatz: Es wird *immer* ein Track zurueckgegeben. Stille ist auf einer
// Party der einzige echte Fehler, den dieses System machen kann. Lieber ein
// mittelmaessiger Uebergang als drei Sekunden nichts.

import { konfiguration } from './konfiguration.js';
import { zustand, aktuelleZielenergie, wunschliste } from './zustand.js';

// Gewichte der Bewertung. Energie dominiert, weil sie den Bogen des Abends
// traegt; das Tempo ist eher Handwerk und wird beim Mischen ohnehin angeglichen.
const GEWICHT = {
  energie: 0.5,
  tempo: 0.25,
  frische: 0.15,
  stimmen: 0.1,
};

// Ab welcher Zielenergie ein Track mit dieser Note ueberhaupt in Frage kommt.
// Der laute Raum spaeter am Abend deckt zu, was um neun aufgefallen waere.
export function benoetigteEnergie(note) {
  const { guteNote, maxAnforderung, annahmeOhneMessung } = konfiguration.klang;
  const wert = typeof note === 'number' ? note : annahmeOhneMessung;
  if (wert >= guteNote) return 0;
  const spanne = guteNote - 0.35; // 0.35 ist die Untergrenze beim Einlesen
  const wieSchlecht = Math.min(1, (guteNote - wert) / spanne);
  return wieSchlecht * maxAnforderung;
}

export function naechsterTrack(bibliothek, aktuellerBpm = null) {
  if (!bibliothek || bibliothek.length === 0) return null;

  const ziel = aktuelleZielenergie();
  const gesperrt = neulichGespielt();

  // 1. Darf ein Gaestewunsch dran? -----------------------------------------
  const wunsch = faelligerWunsch(bibliothek, aktuellerBpm, gesperrt, ziel);
  if (wunsch) {
    zustand.seitLetztemWunsch = 0;
    return { track: wunsch, grund: 'wunsch', ziel };
  }

  // 2. Sonst entscheidet die Bewertung --------------------------------------
  // Ist nach Sperre und Qualitaetsschranke nichts mehr uebrig, muss eine der
  // beiden fallen. Welche, haengt vom Raum ab: Im leisen Raum hoert man eine
  // dumpfe Aufnahme sofort, eine Wiederholung nach anderthalb Stunden kaum.
  // Spaeter ist es umgekehrt - da faellt Wiederholung auf und Dumpfheit geht
  // im Pegel unter.
  const frei = bibliothek.filter((t) => !gesperrt.has(t.id));
  const hoerbar = frei.filter((t) => benoetigteEnergie(t.note) <= ziel + 1e-6);

  let menge = hoerbar;
  if (menge.length === 0) {
    const leiserRaum = ziel < 0.5;
    const trotzSperre = bibliothek.filter((t) => benoetigteEnergie(t.note) <= ziel + 1e-6);
    menge = leiserRaum
      ? // Qualitaet halten, Wiederholung in Kauf nehmen.
        (trotzSperre.length > 0 ? trotzSperre : frei)
      : // Frische halten, dumpferes Material zulassen.
        (frei.length > 0 ? frei : trotzSperre);
  }
  if (menge.length === 0) menge = bibliothek;

  const stimmen = stimmenNachTrack();
  let bester = null;
  let besteBewertung = -Infinity;

  for (const track of menge) {
    const bewertung =
      GEWICHT.energie * energiePassung(track.energie, ziel) +
      GEWICHT.tempo * tempoPassung(track.bpm, aktuellerBpm) +
      GEWICHT.frische * frische(track.id) +
      GEWICHT.stimmen * (stimmen.get(track.id) ?? 0) +
      // Bei sonst gleicher Passung gewinnt die bessere Aufnahme.
      konfiguration.klang.gewicht * (track.note ?? konfiguration.klang.annahmeOhneMessung) +
      // Ein Hauch Zufall, damit zwei aehnliche Abende nicht identisch klingen
      // und der Autopilot nicht immer denselben Lieblingstrack zieht.
      Math.random() * 0.05;

    if (bewertung > besteBewertung) {
      besteBewertung = bewertung;
      bester = track;
    }
  }

  zustand.seitLetztemWunsch++;
  return { track: bester, grund: 'autopilot', ziel };
}

// --- Teilbewertungen ------------------------------------------------------

// 1 bei perfekter Passung, 0 bei maximalem Abstand.
function energiePassung(energie, ziel) {
  if (typeof energie !== 'number') return 0.5;
  return 1 - Math.abs(energie - ziel);
}

// Innerhalb des Fensters voll, ausserhalb faellt es steil ab. Ohne laufenden
// Track ist jedes Tempo recht.
function tempoPassung(bpm, aktuellerBpm) {
  if (!aktuellerBpm || !bpm) return 1;
  const abweichung = Math.abs(bpm - aktuellerBpm) / aktuellerBpm;
  const fenster = konfiguration.mix.bpmFenster;
  if (abweichung <= fenster) return 1 - abweichung / fenster / 4;

  // Halbes oder doppeltes Tempo passt musikalisch oft trotzdem (128 zu 64).
  const halb = Math.abs(bpm * 2 - aktuellerBpm) / aktuellerBpm;
  const doppelt = Math.abs(bpm / 2 - aktuellerBpm) / aktuellerBpm;
  if (Math.min(halb, doppelt) <= fenster) return 0.6;

  return Math.max(0, 1 - abweichung * 3);
}

// 1, wenn der Track heute noch nicht lief.
function frische(id) {
  const stelle = zustand.gespielt.lastIndexOf(id);
  if (stelle === -1) return 1;
  const her = zustand.gespielt.length - stelle;
  return Math.min(1, her / (konfiguration.mix.sperreNachTracks * 2));
}

function neulichGespielt() {
  return new Set(zustand.gespielt.slice(-konfiguration.mix.sperreNachTracks));
}

// Stimmen auf 0..1 normiert, damit ein Track mit 8 Stimmen nicht alles kippt.
function stimmenNachTrack() {
  const liste = wunschliste();
  const karte = new Map();
  if (liste.length === 0) return karte;
  const hoechste = liste[0].stimmen || 1;
  for (const eintrag of liste) {
    karte.set(eintrag.id, eintrag.stimmen / hoechste);
  }
  return karte;
}

// --- Gaestewuensche -------------------------------------------------------

// Der meistgewaehlte Wunsch, aber nur wenn er dran ist und tempomaessig nicht
// voellig aus dem Rahmen faellt. Ein Wunsch, der den Abend zerlegt, wartet auf
// den naechsten passenden Moment statt abgelehnt zu werden.
function faelligerWunsch(bibliothek, aktuellerBpm, gesperrt, ziel) {
  if (zustand.seitLetztemWunsch < konfiguration.abstimmung.wunschJederNteTrack) {
    return null;
  }

  const nachId = new Map(bibliothek.map((t) => [t.id, t]));
  for (const eintrag of wunschliste()) {
    const track = nachId.get(eintrag.id);
    if (!track || gesperrt.has(track.id)) continue;
    if (tempoPassung(track.bpm, aktuellerBpm) < 0.5) continue;
    // Ein dumpfer YouTube-Wunsch wird nicht abgelehnt, sondern wartet auf den
    // lauten Teil des Abends. Der Gast bekommt ihn - nur eben spaeter.
    if (benoetigteEnergie(track.note) > ziel + 1e-6) continue;
    return track;
  }
  return null;
}
