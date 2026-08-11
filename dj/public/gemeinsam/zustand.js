// Der Zustand des Abends. Bewusst nur im Arbeitsspeicher: Wenn der Server neu
// startet, faengt der Abend halt neu an - das ist in vier Stunden Party
// verschmerzbar und spart eine Datenbank, die auf einer Laptop-Party nur
// kaputtgehen kann.

import { konfiguration, jetztInMinuten, zielenergie } from './konfiguration.js';

export const zustand = {
  // Was gerade laeuft, gemeldet von der Buehne.
  laeuft: null, // { id, titel, interpret, bpm, energie, dauer, begonnen }
  alsNaechstes: null,

  // Reihenfolge der bereits gespielten Track-IDs, neuester zuletzt.
  gespielt: [],

  // trackId -> { stimmen: Set<geraetId>, erstellt: ms }
  wuensche: new Map(),

  // Richtungsstimmen: { geraetId, richtung: 'chilliger'|'haerter', zeit: ms }
  richtungen: [],

  // Zaehler, damit nicht jeder Track ein Gaestewunsch ist.
  seitLetztemWunsch: 99,

  // Handbetrieb: setzt der Gastgeber das, ignoriert der Autopilot die Kurve.
  handEnergie: null,
};

// --- Richtungsstimmen -----------------------------------------------------

// Nur Stimmen aus dem Zeitfenster zaehlen. Aeltere fallen still raus, damit
// die Stimmung von vor zwei Stunden nicht den Rest des Abends bestimmt.
export function frischeRichtungen(jetzt = Date.now()) {
  const fenster = konfiguration.abstimmung.stimmeGiltMinuten * 60_000;
  zustand.richtungen = zustand.richtungen.filter((r) => jetzt - r.zeit < fenster);
  return zustand.richtungen;
}

// Verschiebung der Zielenergie durch die Gaeste, begrenzt auf stimmenEinfluss.
export function stimmenVerschiebung(jetzt = Date.now()) {
  const stimmen = frischeRichtungen(jetzt);
  if (stimmen.length === 0) return 0;

  // Pro Geraet zaehlt nur die letzte Stimme - sonst gewinnt, wer am meisten tippt.
  const jeGeraet = new Map();
  for (const s of stimmen) jeGeraet.set(s.geraetId, s.richtung);

  let summe = 0;
  for (const richtung of jeGeraet.values()) {
    summe += richtung === 'haerter' ? 1 : -1;
  }

  // Der Ausschlag waechst mit der Einigkeit, nicht mit der reinen Anzahl:
  // 8 von 10 fuer haerter wiegt schwerer als 8 von 30.
  const anteil = summe / jeGeraet.size;
  return anteil * konfiguration.stimmenEinfluss;
}

// Die Zielenergie, an der sich die Auswahl orientiert.
export function aktuelleZielenergie(jetzt = Date.now()) {
  if (zustand.handEnergie !== null) return zustand.handEnergie;
  const basis = zielenergie(jetztInMinuten(new Date(jetzt)));
  const roh = basis + stimmenVerschiebung(jetzt);
  return Math.min(1, Math.max(0, roh));
}

// --- Wuensche -------------------------------------------------------------

export function wunschEintragen(trackId, geraetId) {
  let wunsch = zustand.wuensche.get(trackId);
  if (!wunsch) {
    wunsch = { stimmen: new Set(), erstellt: Date.now() };
    zustand.wuensche.set(trackId, wunsch);
  }
  wunsch.stimmen.add(geraetId);
  return wunsch;
}

export function wunschZuruecknehmen(trackId, geraetId) {
  const wunsch = zustand.wuensche.get(trackId);
  if (!wunsch) return;
  wunsch.stimmen.delete(geraetId);
  if (wunsch.stimmen.size === 0) zustand.wuensche.delete(trackId);
}

// Wie viele offene Wuensche ein Geraet gerade traegt.
export function wuenscheVon(geraetId) {
  let anzahl = 0;
  for (const wunsch of zustand.wuensche.values()) {
    if (wunsch.stimmen.has(geraetId)) anzahl++;
  }
  return anzahl;
}

// Wuensche nach Stimmen sortiert, bereits Gespieltes faellt raus.
export function wunschliste() {
  const gespielt = new Set(zustand.gespielt);
  return [...zustand.wuensche.entries()]
    .filter(([id]) => !gespielt.has(id))
    .map(([id, w]) => ({ id, stimmen: w.stimmen.size, erstellt: w.erstellt }))
    .sort((a, b) => b.stimmen - a.stimmen || a.erstellt - b.erstellt);
}

export function alsGespieltVermerken(trackId) {
  zustand.gespielt.push(trackId);
  zustand.wuensche.delete(trackId);
}
