// Wie kommt man von einem Track in den naechsten?
//
// Vorher gab es dafuer vier fertige Ablaufplaene, und die Regie hat einen
// davon gezogen. Das Ergebnis war beliebig: Derselbe 32-Beat-Plan lief ueber
// ein ausklingendes Outro genauso wie ueber zwei volle Grooves, und in einem
// der beiden Faelle war er falsch.
//
// Hier wird der Plan stattdessen aus den beiden Tracks *gerechnet*. Drei
// Fragen, in dieser Reihenfolge:
//
//   1. Wo verlaesst man den Alten? Nicht "25 Sekunden vor Schluss", sondern
//      da, wo er aufhoert zu tragen.
//   2. Wo steigt man in den Neuen ein? Bei hoher Energie *nicht* im ruhigen
//      Intro - dann bricht die Stimmung genau in dem Moment ein, in dem sie
//      halten soll. Dann lieber direkt in den Groove.
//   3. Was passiert dazwischen? Laenge, Bass-Uebergabe und Entzerrerfahrt
//      folgen daraus, was an genau diesen beiden Stellen wirklich klingt.
//
// Alles hier sind reine Funktionen ohne Web Audio - nachrechenbar in Node,
// siehe pruefungen/uebergang.mjs. Timing ist die Fehlerquelle Nummer eins beim
// Mischen, und ein Fehler hier klingt nicht nach Fehler, sondern nur nach
// "irgendwie schlecht".

import { BEATS_PRO_TAKT, BEATS_PRO_PHRASE } from './takt.js';

// Wie tief der Bass gekappt wird, wenn ein Deck ihn abgeben muss.
export const BASS_AUS = -32;

// Ab dieser Zielenergie gilt: keine Intros mehr, direkt in den Groove.
const PARTY_AB = 0.55;
// Und ab hier wird auch das Ausklingen des Alten nicht mehr abgewartet.
const KEIN_AUSKLANG_AB = 0.65;

// --- Das Profil lesen ------------------------------------------------------
//
// Das Profil kommt aus der Analyse: je Takt Energie, Bassanteil, Hoehenanteil
// und Anschlagsdichte. Alles hier drin arbeitet in Takten und rechnet erst am
// Ende in Beats um.

/** Mittelwert eines Feldes ueber einen Taktbereich. */
function mittelwert(profil, von, bis, feld) {
  const a = Math.max(0, Math.floor(von));
  const b = Math.min(profil.length, Math.ceil(bis));
  if (b <= a) return 0;
  let summe = 0;
  for (let i = a; i < b; i++) summe += profil[i][feld] ?? 0;
  return summe / (b - a);
}

/**
 * Wo traegt der Track?
 *
 * Gesucht ist die Schwelle, ab der ein Takt als "voll dabei" gilt. Ein fester
 * Wert taugt dafuer nicht: Ein durchgehend hartes Stueck hat nie einen leisen
 * Takt, ein verspieltes hat viele. Deshalb wird die Schwelle aus dem Track
 * selbst genommen - drei Viertel dessen, was seine lautesten Takte erreichen.
 */
function kernSchwelle(profil) {
  if (profil.length === 0) return 0;
  const sortiert = profil.map((p) => p.e).sort((a, b) => b - a);
  const oberesViertel = sortiert.slice(0, Math.max(1, Math.floor(sortiert.length / 4)));
  const spitze = oberesViertel.reduce((a, b) => a + b, 0) / oberesViertel.length;
  return spitze * 0.75;
}

/**
 * Der erste Takt, ab dem der Track durchgehend traegt.
 *
 * "Durchgehend" ist der Punkt: Ein einzelner lauter Takt im Intro ist ein
 * Anspieler, kein Groove. Verlangt werden vier Takte am Stueck.
 */
export function kernAnfang(profil) {
  const schwelle = kernSchwelle(profil);
  let seit = -1;
  for (let i = 0; i < profil.length; i++) {
    if (profil[i].e >= schwelle) {
      if (seit < 0) seit = i;
      if (i - seit >= 3) return seit;
    } else {
      seit = -1;
    }
  }
  return 0;
}

/**
 * Der letzte Takt, an dem der Track noch traegt - danach kommt das Ausklingen.
 */
export function kernEnde(profil) {
  const schwelle = kernSchwelle(profil);
  for (let i = profil.length - 1; i >= 0; i--) {
    if (profil[i].e >= schwelle) return i;
  }
  return Math.max(0, profil.length - 1);
}

// --- Einstieg: wo faengt der Neue an? --------------------------------------

/**
 * @param {object} track   mit profil, bpm, einstiegBeat, marken
 * @param {number} zielenergie 0..1 - die Stimmung, die gehalten werden soll
 * @returns {{beat:number, grund:string}}
 */
export function einstiegWaehlen(track, zielenergie) {
  const profil = track.profil ?? [];
  const natuerlich = Math.max(0, Math.round(track.einstiegBeat ?? 0));

  if (profil.length < 4) {
    return { beat: natuerlich, grund: 'kein Verlauf bekannt, natuerlicher Einstieg' };
  }

  const kern = kernAnfang(profil);
  const kernBeat = kern * BEATS_PRO_TAKT;

  // Frueh am Abend darf ein Intro ein Intro sein. Es gibt der Nacht Luft, und
  // niemand tanzt um zehn.
  if (zielenergie < PARTY_AB) {
    return {
      beat: aufPhrase(natuerlich, track.phrasenVersatz),
      grund: `Intro bleibt drin (Ziel ${(zielenergie * 100).toFixed(0)} %)`,
    };
  }

  // Ab hier zaehlt die Stimmung. Ein Intro von acht Takten ist ein Loch in der
  // Tanzflaeche - der Neue faengt da an, wo er wirklich losgeht.
  //
  // Eine Phrase davor, nicht exakt auf dem Kern: So kommt der Groove nicht aus
  // dem Nichts, sondern hat einen Takt Anlauf, und die Phrasengrenze stimmt.
  const vorlauf = zielenergie >= KEIN_AUSKLANG_AB ? 0 : BEATS_PRO_PHRASE;
  const ziel = Math.max(natuerlich, kernBeat - vorlauf);

  // Liegt kurz nach dem Kern ein Drop, ist der der bessere Einstieg - dann
  // faellt der Wechsel mit dem staerksten Moment des Tracks zusammen.
  const drop = (track.marken ?? [])
    .filter((m) => m.name === 'drop')
    .map((m) => m.beat)
    .find((b) => b >= kernBeat - BEATS_PRO_PHRASE && b <= kernBeat + BEATS_PRO_PHRASE * 4);

  if (drop !== undefined && zielenergie >= KEIN_AUSKLANG_AB) {
    return { beat: aufPhrase(drop, track.phrasenVersatz), grund: `direkt auf den Drop bei Beat ${Math.round(drop)}` };
  }

  const uebersprungen = Math.round((ziel - natuerlich) / BEATS_PRO_TAKT);
  return {
    beat: aufPhrase(ziel, track.phrasenVersatz),
    grund:
      uebersprungen > 1
        ? `${uebersprungen} Takte Intro uebersprungen, rein in den Groove`
        : 'gleich im Groove',
  };
}

// --- Ausstieg: wo verlaesst man den Alten? ---------------------------------

/**
 * @param {object} track   mit profil, dauer, bpm, raster
 * @param {number} zielenergie
 * @param {number} fruehestensBeat  vor diesem Beat nicht aussteigen
 */
export function ausstiegWaehlen(track, zielenergie, fruehestensBeat = 0) {
  const profil = track.profil ?? [];
  const beatDauer = 60 / (track.bpm || 128);
  const letzterBeat = Math.max(0, ((track.dauer ?? 0) - (track.raster ?? 0)) / beatDauer);

  if (profil.length < 4) {
    const beat = aufPhrase(Math.max(fruehestensBeat, letzterBeat - BEATS_PRO_PHRASE * 2), track.phrasenVersatz);
    return { beat, grund: 'kein Verlauf bekannt, kurz vor Schluss' };
  }

  const ende = kernEnde(profil);
  const endeBeat = (ende + 1) * BEATS_PRO_TAKT;

  // Bei hoher Zielenergie wird das Ausklingen nicht abgewartet. Ein Outro, das
  // sich ueber acht Takte verabschiedet, ist genau die Stelle, an der die
  // Tanzflaeche sich leert.
  if (zielenergie >= KEIN_AUSKLANG_AB) {
    const beat = aufPhrase(Math.max(fruehestensBeat, endeBeat - BEATS_PRO_PHRASE), track.phrasenVersatz);
    return {
      beat: Math.min(beat, aufPhrase(letzterBeat, track.phrasenVersatz)),
      grund: 'raus vor dem Ausklingen',
    };
  }

  // Sonst darf der Alte ausklingen - aber nicht bis zur Stille.
  const beat = aufPhrase(Math.max(fruehestensBeat, endeBeat), track.phrasenVersatz);
  return { beat: Math.min(beat, aufPhrase(letzterBeat, track.phrasenVersatz)), grund: 'nach dem letzten vollen Teil' };
}

/**
 * Auf die naechste Phrasengrenze *dieses Tracks*.
 *
 * Der Versatz ist der Punkt. Ein Vielfaches von 32 Beats ab Dateianfang ist
 * eine Phrasengrenze nur dann, wenn die Phrase auch dort beginnt - und das
 * weiss das Raster nicht, es kennt nur Beats und die Eins eines Taktes. Liegt
 * die Phrase in Wahrheit sieben Takte spaeter, sitzt ein Uebergang beatgenau
 * und trotzdem mitten im Satz. Genau so klingt "gemischt, aber irgendwie
 * falsch".
 */
function aufPhrase(beat, versatzTakte = 0) {
  const versatz = ((versatzTakte % 8) + 8) % 8 * BEATS_PRO_TAKT;
  return Math.max(0, Math.round((beat - versatz) / BEATS_PRO_PHRASE) * BEATS_PRO_PHRASE + versatz);
}

// --- Der Uebergang selbst --------------------------------------------------

/**
 * Beschreibt, was an einer Stelle im Track wirklich klingt. Genau davon haengt
 * ab, wie man dort mischen kann.
 */
function stelleBeschreiben(profil, abTakt, takte = 4) {
  if (!profil || profil.length === 0) {
    return { energie: 0.6, bass: 0.5, hoehen: 0.2, dichte: 1.5, leer: true };
  }
  return {
    energie: mittelwert(profil, abTakt, abTakt + takte, 'e'),
    bass: mittelwert(profil, abTakt, abTakt + takte, 'b'),
    hoehen: mittelwert(profil, abTakt, abTakt + takte, 'h'),
    dichte: mittelwert(profil, abTakt, abTakt + takte, 'd'),
    leer: false,
  };
}

/**
 * Den ganzen Uebergang planen.
 *
 * @param {object} a  laufender Track (profil, bpm, raster, dauer, marken)
 * @param {object} b  naechster Track
 * @param {object} lage  { zielenergie, tempoPasst, jetztBeat }
 * @returns {{ausstiegBeat, einstiegBeat, beats, bassBeiBeat, art, name,
 *            begruendung, schritte}}
 */
export function uebergangPlanen(
  a,
  b,
  { zielenergie = 0.5, tempoPasst = true, jetztBeat = 0, letzteArt = null } = {},
) {
  const ziel = Math.min(1, Math.max(0, zielenergie));

  const einstieg = einstiegWaehlen(b, ziel);
  const ausstieg = ausstiegWaehlen(a, ziel, jetztBeat + BEATS_PRO_PHRASE);
  const bStelle = stelleBeschreiben(b.profil, einstieg.beat / BEATS_PRO_TAKT);

  /*
   * Der Ausstieg braucht Auslauf.
   *
   * Ein Track, der bis zum letzten Takt durchzieht, hat seinen letzten
   * tragenden Takt am Ende der Datei - und dort anzusetzen hiesse, den
   * Uebergang gegen Stille zu mischen. Der Alte muss noch so lange spielen,
   * wie der Uebergang dauert.
   *
   * Henne und Ei: Die Laenge haengt davon ab, was an der Ausstiegsstelle
   * klingt, und die Stelle haengt an der Laenge. Also erst mit dem
   * vorlaeufigen Ausstieg waehlen, dann zurueckschieben und noch einmal
   * waehlen. Ein Durchgang genuegt - die Laenge aendert sich dabei hoechstens
   * um eine Stufe.
   */
  const beatDauerA = 60 / (a.bpm || 128);
  const letzterBeatA = Math.max(0, ((a.dauer ?? 0) - (a.raster ?? 0)) / beatDauerA);
  const zurueckAufPhrase = (beat) => Math.max(0, Math.floor(beat / BEATS_PRO_PHRASE) * BEATS_PRO_PHRASE);

  let ausstiegBeat = ausstieg.beat;
  let aStelle = stelleBeschreiben(a.profil, ausstiegBeat / BEATS_PRO_TAKT);
  let wahl = artWaehlen({ aStelle, bStelle, ziel, tempoPasst, letzteArt });

  const platzMachen = (laenge) => zurueckAufPhrase(Math.min(ausstieg.beat, letzterBeatA - laenge));
  if (ausstiegBeat + wahl.beats > letzterBeatA) {
    ausstiegBeat = platzMachen(wahl.beats);
    aStelle = stelleBeschreiben(a.profil, ausstiegBeat / BEATS_PRO_TAKT);
    wahl = artWaehlen({ aStelle, bStelle, ziel, tempoPasst, letzteArt });
    // Nach der zweiten Wahl noch einmal deckeln, falls sie laenger ausfiel.
    if (ausstiegBeat + wahl.beats > letzterBeatA) ausstiegBeat = platzMachen(wahl.beats);
  }

  const beats = wahl.beats;

  // Wann wechselt das Fundament das Deck?
  //
  // Zwei Bassdrums uebereinander sind Matsch, also gehoert der Keller zu jedem
  // Zeitpunkt genau einem Deck. Der richtige Moment dafuer haengt daran, wer
  // gerade traegt: Kommt der Neue voll herein, darf er den Bass frueh haben.
  // Ist sein Einstieg duenn, behaelt ihn der Alte, bis der Neue steht.
  const frueh = bStelle.energie >= aStelle.energie * 0.9;
  const bassBeiBeat = Math.round(beats * (frueh ? 0.35 : 0.62));

  return {
    ausstiegBeat,
    einstiegBeat: einstieg.beat,
    beats,
    bassBeiBeat,
    art: wahl.art,
    name: wahl.name,
    begruendung: `${wahl.grund} · ${einstieg.grund} · Ausstieg: ${ausstieg.grund}`,
    schritte: schritteBauen({ beats, bassBeiBeat, art: wahl.art, aStelle, bStelle }),
  };
}

/**
 * Welche Art Uebergang traegt an diesen beiden Stellen?
 *
 * Die Reihenfolge ist bewusst: Erst die Faelle, in denen ueberhaupt nur eines
 * geht, dann die, in denen man waehlen kann.
 */
function artWaehlen({ aStelle, bStelle, ziel, tempoPasst, letzteArt = null }) {
  // Ohne gemeinsames Tempo laufen zwei Beats gegeneinander. Dagegen hilft kein
  // Entzerrer - nur Ueberlappung vermeiden. Hier gibt es nichts zu waehlen.
  if (!tempoPasst) {
    return {
      art: 'echo',
      name: 'Echo-Schnitt',
      beats: 8,
      grund: 'Tempo passt nicht, also kein Uebereinander',
    };
  }

  const beideVoll = aStelle.energie > 0.6 && bStelle.energie > 0.6;
  const beideDicht = aStelle.dichte > 1.5 && bStelle.dichte > 1.5;
  const aehnlich = Math.abs(aStelle.hoehen - bStelle.hoehen) < 0.08 && aStelle.hoehen > 0.15;

  // Jede Moeglichkeit bekommt eine Eignung. Ein einzelnes if-Geflecht haette
  // immer genau eine Antwort - und damit ueber einen Abend immer dieselbe,
  // sobald die Lage sich nicht aendert. Mit einer Rangfolge gibt es eine
  // zweitbeste Wahl, und die wird unten gebraucht.
  const kandidaten = [
    {
      art: 'blende',
      name: 'Lange Blende',
      beats: beideVoll ? 32 : 24,
      grund: 'zwei laufende Grooves, in Ruhe uebergeben',
      // Lange Blenden brauchen zwei tragende Stellen und Zeit. Spaet am Abend
      // nehmen sie dem Moment die Kante.
      eignung: 0.6 + (beideVoll ? 0.25 : 0) - Math.max(0, ziel - KEIN_AUSKLANG_AB) * 1.6,
    },
    {
      art: 'blende',
      name: 'Lange Blende',
      beats: 32,
      grund: 'der Neue kommt duenn herein und darf sich legen',
      eignung: bStelle.energie < 0.5 && aStelle.energie > 0.55 ? 1.1 : 0,
    },
    {
      art: 'aufzug',
      name: 'Kurzer Aufzug',
      beats: 16,
      grund: 'der Alte traegt nicht mehr, der Neue schon',
      eignung: aStelle.energie < 0.45 && bStelle.energie > 0.6 ? 1.2 : 0.45,
    },
    {
      art: 'aufzug',
      name: 'Aufzug mit Trennung',
      beats: 16,
      grund: 'aehnliche Klangbilder, kurz halten statt Matsch',
      eignung: aehnlich && beideDicht ? 1.0 : 0,
    },
    {
      art: 'schnitt',
      name: 'Harter Schnitt auf die Phrase',
      beats: 4,
      // Ein Schnitt braucht auf beiden Seiten etwas, das traegt - sonst ist er
      // kein Zug, sondern ein Loch.
      grund: 'beide auf Anschlag, Schnitt haelt die Kante',
      eignung: beideVoll && beideDicht ? 0.35 + Math.max(0, ziel - PARTY_AB) * 2.2 : 0,
    },
    {
      art: 'echo',
      name: 'Echo-Schnitt',
      beats: 8,
      grund: 'kurz weggehallt statt lang gemischt',
      eignung: beideVoll ? 0.3 + Math.max(0, ziel - PARTY_AB) * 1.4 : 0.15,
    },
  ].filter((k) => k.eignung > 0);

  kandidaten.sort((x, y) => y.eignung - x.eignung);

  /*
   * Nicht zweimal hintereinander derselbe Zug.
   *
   * Das ist keine Kosmetik. Bei gleichbleibender Lage - und spaet am Abend ist
   * die Lage lange gleich - liefert eine Rangfolge immer denselben Sieger, und
   * dann besteht eine Stunde aus lauter harten Schnitten. Das hoert sich
   * genauso nach Maschine an wie eine Stunde aus lauter langen Blenden.
   *
   * Gewechselt wird nur, wenn die zweitbeste Wahl nicht deutlich schlechter
   * ist. Ein Uebergang, der nicht passt, ist schlimmer als eine Wiederholung.
   */
  const bester = kandidaten[0];
  if (letzteArt && bester && bester.art === letzteArt) {
    const anders = kandidaten.find((k) => k.art !== letzteArt && k.eignung >= bester.eignung * 0.7);
    if (anders) return { ...anders, grund: `${anders.grund} (nicht zweimal dasselbe)` };
  }
  return bester ?? {
    art: 'blende',
    name: 'Lange Blende',
    beats: 24,
    grund: 'Standard',
  };
}

/**
 * Aus dem Plan die Automationskurven bauen.
 *
 * Dieselbe Form wie frueher die festen Ablaufplaene - eine Liste von
 * Zielwerten auf einer Beat-Achse -, nur eben gerechnet statt abgeschrieben.
 * Jede Kurve muss bei Beat 0 ihren Ausgangswert nennen, sonst weiss der
 * Browser nicht, von wo aus er rampen soll, und macht aus jeder Blende einen
 * Sprung.
 */
function schritteBauen({ beats, bassBeiBeat, art, aStelle, bStelle }) {
  const s = [];
  const bassVor = Math.max(0.5, bassBeiBeat - 1);
  const bassNach = Math.min(beats, bassBeiBeat + 1);

  if (art === 'schnitt') {
    s.push({ beat: 0, deck: 'neu', regler: 'blende', wert: 1 });
    s.push({ beat: 0, deck: 'neu', regler: 'tief', wert: 0 });
    s.push({ beat: 0, deck: 'alt', regler: 'blende', wert: 1 });
    // Nicht ganz hart: 30 Millisekunden verhindern das Knacken, hoerbar ist
    // der Unterschied zum Schnitt nicht.
    s.push({ beat: 0.05, deck: 'alt', regler: 'blende', wert: 0 });
    s.push({ beat: 0, deck: 'alt', regler: 'tief', wert: 0 });
    s.push({ beat: 0.05, deck: 'alt', regler: 'tief', wert: BASS_AUS });
    return s;
  }

  if (art === 'echo') {
    s.push({ beat: 0, deck: 'neu', regler: 'blende', wert: 1 });
    s.push({ beat: 0, deck: 'neu', regler: 'tief', wert: 0 });
    // Erst den Hall aufmachen, dann die Quelle wegnehmen - der Rest haengt
    // noch ein paar Schlaege in der Luft und loest sich auf.
    s.push({ beat: 0, deck: 'alt', regler: 'echo', wert: 0 });
    s.push({ beat: 0.5, deck: 'alt', regler: 'echo', wert: 0.6 });
    s.push({ beat: Math.min(2, beats / 4), deck: 'alt', regler: 'echo', wert: 0.6 });
    s.push({ beat: Math.min(4, beats / 2), deck: 'alt', regler: 'echo', wert: 0 });
    s.push({ beat: 0, deck: 'alt', regler: 'blende', wert: 1 });
    s.push({ beat: 1.5, deck: 'alt', regler: 'blende', wert: 1 });
    s.push({ beat: 2, deck: 'alt', regler: 'blende', wert: 0 });
    s.push({ beat: 0, deck: 'alt', regler: 'tief', wert: 0 });
    s.push({ beat: 2, deck: 'alt', regler: 'tief', wert: BASS_AUS });
    return s;
  }

  // --- Blende und Aufzug teilen sich das Grundgeruest ---------------------

  // Wie schnell der Neue aufgeht, haengt daran, wie voll er einsteigt. Ein
  // dichter Einstieg braucht Zeit, sonst ueberfaehrt er den Alten; eine
  // duenne Flaeche darf schneller da sein, sie stoert niemanden.
  const neuOffen = Math.round(beats * (bStelle.dichte > 2 ? 0.6 : 0.42));
  s.push({ beat: 0, deck: 'neu', regler: 'blende', wert: 0 });
  s.push({ beat: neuOffen, deck: 'neu', regler: 'blende', wert: 1 });

  // Der Neue kommt ohne Bass und bekommt ihn bei der Uebergabe.
  s.push({ beat: 0, deck: 'neu', regler: 'tief', wert: BASS_AUS });
  s.push({ beat: bassVor, deck: 'neu', regler: 'tief', wert: BASS_AUS });
  s.push({ beat: bassNach, deck: 'neu', regler: 'tief', wert: 0 });

  // Der Alte gibt ihn im selben Moment ab.
  s.push({ beat: 0, deck: 'alt', regler: 'tief', wert: 0 });
  s.push({ beat: bassVor, deck: 'alt', regler: 'tief', wert: 0 });
  s.push({ beat: bassNach, deck: 'alt', regler: 'tief', wert: BASS_AUS });

  // Der Alte haelt, bis der Neue steht, und geht dann.
  s.push({ beat: 0, deck: 'alt', regler: 'blende', wert: 1 });
  s.push({ beat: Math.round(beats * 0.62), deck: 'alt', regler: 'blende', wert: 1 });
  s.push({ beat: beats, deck: 'alt', regler: 'blende', wert: 0 });

  if (art === 'aufzug') {
    // Dem Alten wird von unten der Boden weggezogen, bis nur noch ein duenner
    // Rest ueber dem Neuen liegt.
    s.push({ beat: 0, deck: 'alt', regler: 'filter', wert: 20 });
    s.push({ beat: Math.round(beats * 0.25), deck: 'alt', regler: 'filter', wert: 120 });
    s.push({ beat: Math.round(beats * 0.75), deck: 'alt', regler: 'filter', wert: 900 });
    s.push({ beat: beats - 1, deck: 'alt', regler: 'filter', wert: 4000 });
  } else {
    // Bei der langen Blende wird der Alte gegen Ende in den Hoehen
    // zurueckgenommen. Wie stark, haengt davon ab, wie sehr sich die beiden
    // im Hochtonbereich ins Gehege kommen - sind beide hell, wird mehr
    // getrennt, sonst bleibt es unauffaellig.
    const gedraenge = Math.min(aStelle.hoehen, bStelle.hoehen);
    const absenkung = gedraenge > 0.18 ? -14 : gedraenge > 0.1 ? -9 : -5;
    s.push({ beat: 0, deck: 'alt', regler: 'hoch', wert: 0 });
    s.push({ beat: Math.round(beats * 0.6), deck: 'alt', regler: 'hoch', wert: 0 });
    s.push({ beat: Math.round(beats * 0.94), deck: 'alt', regler: 'hoch', wert: absenkung });
  }

  return s;
}
