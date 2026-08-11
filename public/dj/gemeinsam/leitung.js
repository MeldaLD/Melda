// Woher kommt der Zustand - vom Server oder aus dem Browser selbst?
//
// Zwei Betriebsarten, eine Schnittstelle:
//
//   Alleinbetrieb  Alles laeuft im Browser. Kein Server, keine Installation.
//                  Damit funktioniert die Buehne als reine statische Seite -
//                  auf Vercel, auf einem iPad, im Flugzeug. Keine Gaeste,
//                  keine Wuensche, aber die ganze Mischmaschine.
//
//   Serverbetrieb  Wie am Partyabend: der Server haelt Bibliothek, Wuensche
//                  und Abstimmung, mehrere Geraete sehen denselben Stand.
//
// Wichtig ist, dass beide *dieselbe* Auswahllogik benutzen. Deshalb liegen
// auswahl.js und zustand.js hier in gemeinsam/ und nicht im Server: Was du im
// Alleinbetrieb hoerst, entscheidet am Partyabend derselbe Code.

import { konfiguration } from './konfiguration.js';
import { naechsterTrack } from './auswahl.js';
import {
  zustand,
  aktuelleZielenergie,
  alsGespieltVermerken,
  wunschliste,
  frischeRichtungen,
} from './zustand.js';

// --- Serverbetrieb --------------------------------------------------------

class ServerLeitung {
  constructor() {
    this.art = 'server';
    this.beschreibung = 'mit Server';
  }

  async bibliothek() {
    const { tracks } = await (await fetch('/api/bibliothek')).json();
    return tracks ?? [];
  }

  async bibliothekSetzen(tracks) {
    await fetch('/api/bibliothek', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks }),
    });
  }

  async naechster(bpm) {
    const antwort = await fetch(`/api/naechster?bpm=${bpm ?? ''}`);
    if (!antwort.ok) throw new Error('Der Server hat keinen naechsten Track');
    return antwort.json();
  }

  async laeuftMelden(track, alsNaechstes) {
    await fetch('/api/laeuft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track, alsNaechstes }),
    }).catch(() => {});
  }

  async handEnergie(energie) {
    await fetch('/api/hand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ energie }),
    });
  }

  beiZustand(rueckruf) {
    const strom = new EventSource('/api/strom');
    strom.onmessage = (nachricht) => rueckruf(JSON.parse(nachricht.data));
    return () => strom.close();
  }
}

// --- Alleinbetrieb --------------------------------------------------------

class EigenLeitung {
  constructor() {
    this.art = 'allein';
    this.beschreibung = 'ohne Server';
    this.tracks = [];
    this.zuhoerer = [];
    // Die Zielenergie wandert mit der Uhr, auch wenn niemand etwas tut.
    this.takt = setInterval(() => this.melden(), 5000);
  }

  async bibliothek() {
    return this.tracks;
  }

  async bibliothekSetzen(tracks) {
    this.tracks = tracks;
    this.melden();
  }

  async naechster(bpm) {
    const wahl = naechsterTrack(this.tracks, bpm);
    if (!wahl) throw new Error('Bibliothek ist leer');
    zustand.alsNaechstes = wahl.track;
    this.melden();
    return wahl;
  }

  async laeuftMelden(track, alsNaechstes) {
    zustand.laeuft = { ...track, begonnen: Date.now() };
    if (track?.id) alsGespieltVermerken(track.id);
    zustand.alsNaechstes = alsNaechstes ?? null;
    this.melden();
  }

  async handEnergie(energie) {
    zustand.handEnergie = energie === null ? null : Math.min(1, Math.max(0, energie));
    this.melden();
  }

  beiZustand(rueckruf) {
    this.zuhoerer.push(rueckruf);
    rueckruf(this.bild());
    return () => {
      this.zuhoerer = this.zuhoerer.filter((z) => z !== rueckruf);
    };
  }

  melden() {
    const bild = this.bild();
    for (const zuhoerer of this.zuhoerer) zuhoerer(bild);
  }

  bild() {
    const jeGeraet = new Map();
    for (const r of frischeRichtungen()) jeGeraet.set(r.geraetId, r.richtung);
    let chilliger = 0;
    let haerter = 0;
    for (const richtung of jeGeraet.values()) {
      if (richtung === 'haerter') haerter++;
      else chilliger++;
    }

    const nachId = new Map(this.tracks.map((t) => [t.id, t]));
    return {
      anlass: konfiguration.anlass,
      laeuft: zustand.laeuft,
      alsNaechstes: zustand.alsNaechstes,
      zielenergie: aktuelleZielenergie(),
      handbetrieb: zustand.handEnergie !== null,
      wuensche: wunschliste()
        .slice(0, 12)
        .map((e) => ({
          id: e.id,
          stimmen: e.stimmen,
          titel: nachId.get(e.id)?.titel ?? e.id,
          interpret: nachId.get(e.id)?.interpret ?? '',
        })),
      richtungen: { chilliger, haerter },
      bibliotheksgroesse: this.tracks.length,
      alleinbetrieb: true,
    };
  }
}

// --- Bibliothek aus dem Netz ----------------------------------------------
//
// Der Mittelweg: Die Musik liegt bei Supabase und wird ueber eine Adresse der
// Anwendung geholt, die Auswahl trifft aber weiter der Browser. Damit laeuft
// der DJ mit echter Musik, ohne dass irgendwo ein Rechner stehen muss - genau
// das, was man unterwegs zum Ausprobieren braucht.

class WebLeitung extends EigenLeitung {
  constructor(tracks) {
    super();
    this.art = 'web';
    this.beschreibung = 'Bibliothek aus dem Netz';
    this.tracks = tracks;
  }

  // Die Bibliothek kommt vom Server und wird nicht von hier aus geaendert;
  // hochgeladen wird im Adminbereich.
  async bibliothekSetzen(tracks) {
    this.tracks = tracks;
    this.melden();
  }
}

// --- Auswahl --------------------------------------------------------------

/**
 * Sucht sich die passende Betriebsart, von der reichhaltigsten abwaerts:
 *
 *   1. lokaler DJ-Server - alles inklusive Gaestewuenschen
 *   2. Bibliothek aus dem Netz - echte Musik, Auswahl im Browser
 *   3. allein - nur der Pruefstand
 *
 * Keine davon ist ein Fehlerfall. Welche es wird, haengt nur daran, wo die
 * Seite gerade laeuft.
 */
export async function leitungSuchen() {
  try {
    const antwort = await fetch('/api/zustand', { signal: AbortSignal.timeout(2500) });
    if (antwort.ok) return new ServerLeitung();
  } catch {
    // Kein lokaler Server - der Normalfall im Netz.
  }

  try {
    const antwort = await fetch('/api/dj/track', { signal: AbortSignal.timeout(4000) });
    if (antwort.ok) {
      const { tracks } = await antwort.json();
      if (Array.isArray(tracks) && tracks.length > 0) return new WebLeitung(tracks);
    }
  } catch {
    // Keine Bibliothek erreichbar - dann eben nur der Pruefstand.
  }

  return new EigenLeitung();
}
