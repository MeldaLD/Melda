// Die Visualisierung.
//
// Der Unterschied zu jedem gewoehnlichen Visualizer: Dieser hier *weiss, was
// kommt*. Tempo, Beatraster und die Position des Drops stehen in der Analyse.
// Also muss er nicht nur auf Lautstaerke zappeln, sondern kann sich aufbauen -
// sechzehn Takte vor dem Drop zieht sich alles zusammen, und im richtigen
// Moment platzt es auf. Ein Mensch mit Lichtpult macht genau das.
//
// Vier Schichten, von hinten nach vorne:
//
//   1. Lava      grosse, langsame Farbblasen. Additiv gezeichnet, damit sie
//                ineinanderlaufen wie in einer Lampe.
//   2. Iris      ein Ring in der Mitte, dessen Rand vom Frequenzband verformt
//                wird. Das Herz des Bildes.
//   3. Puls      Ringe auf jedem Beat, staerker auf der Eins, am staerksten
//                auf der Phrasengrenze.
//   4. Ausbruch  Schockwellen und Funken beim Drop.
//
// Nichts davon wiederholt sich exakt: Jeder Track bekommt seine eigene Palette
// aus seiner Kennung, und die Bewegung laeuft ueber langsames Rauschen, das nie
// denselben Weg nimmt.

import { MODI, TAU } from './visualmodi.js';

// Die Reihenfolge, in der die Modi durchgewechselt werden. Nicht zufaellig
// gezogen, sondern reihum: So sieht man zwei gleiche nie hintereinander, und
// ueber einen Abend kommt jeder gleich oft dran.
const MODUSFOLGE = ['iris', 'tunnel', 'strahlen', 'wellen'];

// --- Zufall, der sich wiederholen laesst ----------------------------------

function streuung(startwert) {
  let z = startwert >>> 0;
  return () => {
    z = (z * 1664525 + 1013904223) >>> 0;
    return z / 4294967296;
  };
}

function ausText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Weiches Rauschen ueber die Zeit. Sorgt fuer Bewegung, die driftet statt zu
// zappeln - der Unterschied zwischen "lebendig" und "nervoes".
function rauschen(startwert) {
  const wuerfel = streuung(startwert);
  const stuetzen = Array.from({ length: 256 }, wuerfel);
  return (t) => {
    const i = Math.floor(t);
    const a = t - i;
    const v0 = stuetzen[i % 256];
    const v1 = stuetzen[(i + 1) % 256];
    // Glatte Ueberblendung, damit keine Knicke entstehen.
    const s = a * a * (3 - 2 * a);
    return v0 + (v1 - v0) * s;
  };
}

// --- Farben ---------------------------------------------------------------

// Jeder Track bekommt seine eigene Palette, aber keine zufaellige: Der
// Grundton kommt aus der Kennung, die uebrigen Toene stehen in festen
// Abstaenden dazu. So sieht jeder Track anders aus und trotzdem nie schlecht.
function palette(kennung, energie = 0.5) {
  const wuerfel = streuung(ausText(kennung || 'ohne'));
  const grundton = Math.floor(wuerfel() * 360);
  // Mit steigender Energie waermer und gesaettigter.
  const saettigung = 62 + energie * 30;
  const helligkeit = 48 + energie * 12;

  return {
    grundton,
    toene: [
      `hsl(${grundton} ${saettigung}% ${helligkeit}%)`,
      `hsl(${(grundton + 42) % 360} ${saettigung}% ${helligkeit - 6}%)`,
      `hsl(${(grundton + 318) % 360} ${saettigung - 8}% ${helligkeit + 6}%)`,
      `hsl(${(grundton + 180) % 360} ${saettigung - 14}% ${helligkeit}%)`,
    ],
    hell: `hsl(${grundton} 90% 72%)`,
  };
}

// --- Die Visualisierung ---------------------------------------------------

export class Visualisierung {
  constructor(leinwand) {
    this.leinwand = leinwand;
    this.stift = leinwand.getContext('2d');

    // Die Lava wird klein gerechnet und gross gezogen. Sie ist ohnehin
    // unscharf, und ein Viertel der Flaeche ist ein Viertel der Arbeit - das
    // ist der Unterschied zwischen fluessig und ruckelig auf einem iPad.
    this.lavaLeinwand = document.createElement('canvas');
    this.lavaStift = this.lavaLeinwand.getContext('2d');

    this.zeit = 0;
    this.letzterBeat = -1;
    this.ringe = [];
    this.funken = [];
    this.blasen = [];
    this.paletten = new Map();
    this.stossHalt = 0;
    this.letzterDrop = -1;

    // Ein Modus je Track. Vorher liefen alle Effekte gleichzeitig - das war
    // viel und trotzdem immer dasselbe. Einer nach dem anderen gibt jedem
    // Effekt Raum und dem Abend Abwechslung.
    this.modusFuerTrack = new Map();
    this.naechsterModus = 0;

    // Drei Rauschquellen, damit sich die Bewegungen nicht synchronisieren.
    this.n1 = rauschen(7919);
    this.n2 = rauschen(104729);
    this.n3 = rauschen(1299709);

    this.masseSetzen();
  }

  masseSetzen() {
    const dichte = Math.min(window.devicePixelRatio || 1, 2);
    this.breite = this.leinwand.clientWidth;
    this.hoehe = this.leinwand.clientHeight;
    this.leinwand.width = this.breite * dichte;
    this.leinwand.height = this.hoehe * dichte;
    this.stift.setTransform(dichte, 0, 0, dichte, 0, 0);

    this.lavaLeinwand.width = Math.max(1, Math.round(this.breite / 3));
    this.lavaLeinwand.height = Math.max(1, Math.round(this.hoehe / 3));
  }

  modusFuer(track) {
    const schluessel = track?.id ?? track?.titel ?? 'leer';
    if (!this.modusFuerTrack.has(schluessel)) {
      this.modusFuerTrack.set(schluessel, MODUSFOLGE[this.naechsterModus % MODUSFOLGE.length]);
      this.naechsterModus++;
    }
    return this.modusFuerTrack.get(schluessel);
  }

  paletteFuer(track) {
    if (!track) return palette('leer', 0.3);
    const schluessel = track.id ?? track.titel ?? 'leer';
    if (!this.paletten.has(schluessel)) {
      this.paletten.set(schluessel, palette(schluessel, track.energie ?? 0.5));
    }
    return this.paletten.get(schluessel);
  }

  /**
   * Ein Bild zeichnen.
   * @param {object} zustand   Momentaufnahme des Mixers
   * @param {Uint8Array} spektrum
   * @param {number} sekunden  Zeit seit dem letzten Bild
   * @param {Float32Array|null} welle  Zeitbereich, nur vom Modus "Wellen" genutzt
   */
  zeichne(zustand, spektrum, sekunden, welle = null) {
    this.zeit += sekunden;
    const { stift, breite, hoehe } = this;

    const aktiv = zustand.decks.find((d) => d.aktiv && d.laeuft) ?? zustand.decks[0];
    const zweit = zustand.decks.find((d) => d !== aktiv && d.laeuft);
    const uebergang = zustand.uebergang?.fortschritt > 0 ? zustand.uebergang : null;

    const takt = this.taktLage(aktiv);
    const spannung = this.spannungBis(aktiv, takt);
    const wucht = this.pegelWucht(spektrum);

    // Beim Drop: alles auf einmal.
    if (takt && this.dropErreicht(aktiv, takt)) this.ausbruch(spannung);
    if (takt) this.beatPruefen(takt, wucht);

    stift.clearRect(0, 0, breite, hoehe);

    // Die Lava bleibt immer im Hintergrund - sie ist die Stimmung im Raum,
    // kein Effekt. Davor laeuft genau ein Modus, und der wechselt je Track.
    this.lavaZeichnen(aktiv, zweit, uebergang, spannung, wucht);

    const modus = MODI[this.modusFuer(aktiv?.track)] ?? MODI.iris;
    this.letzterModusName = modus.name;
    modus.zeichne(stift, {
      breite,
      hoehe,
      zeit: this.zeit,
      sekunden,
      spektrum,
      welle: welle ?? new Float32Array(0),
      takt,
      spannung,
      wucht,
      palette: this.paletteFuer(aktiv?.track),
      paletteB: zweit ? this.paletteFuer(zweit.track) : null,
      anteilB: uebergang ? uebergang.fortschritt : 0,
    });

    this.ringeZeichnen(sekunden);
    this.funkenZeichnen(sekunden);
    this.spannungZeigen(spannung, aktiv);

    if (this.stossHalt > 0) {
      // Kurzes Aufblitzen nach dem Drop.
      stift.globalCompositeOperation = 'lighter';
      stift.fillStyle = `rgba(255,255,255,${this.stossHalt * 0.5})`;
      stift.fillRect(0, 0, breite, hoehe);
      stift.globalCompositeOperation = 'source-over';
      this.stossHalt = Math.max(0, this.stossHalt - sekunden * 3.5);
    }
  }

  // --- Wo stehen wir im Takt? ---------------------------------------------

  taktLage(deck) {
    if (!deck?.laeuft || !deck.track?.bpm) return null;
    const beatLaenge = 60 / deck.track.bpm;
    const beat = (deck.stelle - (deck.track.raster ?? 0)) / beatLaenge;
    return {
      beat,
      // Nachkommastelle: 0 direkt auf dem Schlag, 1 kurz davor.
      imBeat: beat - Math.floor(beat),
      nummer: Math.floor(beat),
      aufEins: Math.floor(beat) % 4 === 0,
      aufPhrase: Math.floor(beat) % 32 === 0,
    };
  }

  // Wie nah ist der naechste Drop? 0 = weit weg, 1 = jetzt gleich.
  //
  // Das ist der Wert, der diese Visualisierung von einem Pegelzappler
  // unterscheidet. Sechzehn Takte vorher fangen wir an, uns zusammenzuziehen.
  spannungBis(deck, takt) {
    if (!takt || !deck?.track?.marken?.length) return 0;
    const drops = deck.track.marken.filter((m) => m.name === 'drop');
    const kommend = drops.find((m) => m.beat > takt.beat);
    if (!kommend) return 0;

    const abstand = kommend.beat - takt.beat;
    const anlauf = 64; // sechzehn Takte
    if (abstand > anlauf) return 0;
    const roh = 1 - abstand / anlauf;
    // Hinten steiler: die letzten Takte sollen sich deutlich anders anfuehlen.
    return roh * roh;
  }

  dropErreicht(deck, takt) {
    const drops = deck.track?.marken?.filter((m) => m.name === 'drop') ?? [];
    for (const drop of drops) {
      if (takt.beat >= drop.beat && takt.beat < drop.beat + 1 && this.letzterDrop !== drop.beat) {
        this.letzterDrop = drop.beat;
        return true;
      }
    }
    return false;
  }

  pegelWucht(spektrum) {
    if (!spektrum) return 0;
    // Nur das untere Achtel: Bass und Kick tragen die Wucht.
    let summe = 0;
    const bis = Math.floor(spektrum.length / 8);
    for (let i = 0; i < bis; i++) summe += spektrum[i];
    return Math.min(1, summe / bis / 200);
  }

  beatPruefen(takt, wucht) {
    if (takt.nummer === this.letzterBeat) return;
    this.letzterBeat = takt.nummer;

    const staerke = takt.aufPhrase ? 1 : takt.aufEins ? 0.6 : 0.28;
    this.ringe.push({
      radius: 0,
      staerke: staerke * (0.5 + wucht),
      tempo: 320 + staerke * 500,
      dicke: 1 + staerke * 4,
    });
    if (this.ringe.length > 24) this.ringe.shift();
  }

  ausbruch(spannung) {
    this.stossHalt = 0.5 + spannung * 0.5;
    // Zwei Schockwellen kurz hintereinander wirken wuchtiger als eine.
    this.ringe.push({ radius: 0, staerke: 2.2, tempo: 1500, dicke: 10 });
    this.ringe.push({ radius: 0, staerke: 1.4, tempo: 900, dicke: 5 });

    const mitte = { x: this.breite / 2, y: this.hoehe / 2 };
    for (let i = 0; i < 90; i++) {
      const winkel = Math.random() * TAU;
      const tempo = 200 + Math.random() * 900;
      this.funken.push({
        x: mitte.x,
        y: mitte.y,
        vx: Math.cos(winkel) * tempo,
        vy: Math.sin(winkel) * tempo,
        leben: 0.7 + Math.random() * 0.9,
        alter: 0,
      });
    }
  }

  // --- Schicht 1: Lava ----------------------------------------------------

  lavaZeichnen(aktiv, zweit, uebergang, spannung, wucht) {
    const { lavaStift: ls, lavaLeinwand: ll } = this;
    const b = ll.width;
    const h = ll.height;

    ls.globalCompositeOperation = 'source-over';
    ls.fillStyle = '#07070c';
    ls.fillRect(0, 0, b, h);
    ls.globalCompositeOperation = 'lighter';

    const paletteA = this.paletteFuer(aktiv?.track);
    const paletteB = zweit ? this.paletteFuer(zweit.track) : null;
    const anteilB = uebergang ? uebergang.fortschritt : 0;

    // Beim Aufbau ziehen sich die Blasen zur Mitte und werden kleiner - das
    // Bild wird enger, bevor es aufreisst.
    const zug = 1 - spannung * 0.55;
    const groesse = (0.42 - spannung * 0.14 + wucht * 0.07) * Math.min(b, h);

    const anzahl = 7;
    for (let i = 0; i < anzahl; i++) {
      const t = this.zeit * 0.09 + i * 13.7;
      // Drei Rauschquellen ergeben eine Bahn, die sich nie exakt wiederholt.
      const x = (0.5 + (this.n1(t) - 0.5) * 1.3 * zug) * b;
      const y = (0.5 + (this.n2(t + 40) - 0.5) * 1.3 * zug) * h;
      const r = groesse * (0.55 + this.n3(t + 80) * 0.75);

      // Waehrend eines Uebergangs mischen sich die Paletten beider Tracks -
      // man sieht, dass zwei Welten uebereinanderliegen, bevor man es hoert.
      const nimmB = paletteB && (i % 2 === 0 ? anteilB > 0.35 : anteilB > 0.65);
      const farbe = (nimmB ? paletteB : paletteA).toene[i % 4];

      const verlauf = ls.createRadialGradient(x, y, 0, x, y, r);
      verlauf.addColorStop(0, farbe);
      verlauf.addColorStop(0.45, farbe.replace(')', ' / 45%)').replace('hsl(', 'hsl('));
      verlauf.addColorStop(1, 'transparent');
      ls.globalAlpha = 0.5 + wucht * 0.35;
      ls.fillStyle = verlauf;
      ls.beginPath();
      ls.arc(x, y, r, 0, TAU);
      ls.fill();
    }
    ls.globalAlpha = 1;

    // Klein gerechnet, gross gezogen: Die Unschaerfe beim Hochskalieren ist
    // hier kein Makel, sondern genau der weiche Lampenlook.
    this.stift.imageSmoothingEnabled = true;
    this.stift.globalCompositeOperation = 'source-over';
    this.stift.drawImage(ll, 0, 0, this.breite, this.hoehe);
  }

  // --- Schicht 3: Puls ----------------------------------------------------

  ringeZeichnen(sekunden) {
    const { stift, breite, hoehe } = this;
    const mx = breite / 2;
    const my = hoehe / 2;
    const grenze = Math.hypot(breite, hoehe) * 0.6;

    stift.globalCompositeOperation = 'lighter';
    for (const ring of this.ringe) {
      ring.radius += ring.tempo * sekunden;
      const rest = 1 - ring.radius / grenze;
      if (rest <= 0) continue;
      stift.beginPath();
      stift.arc(mx, my, ring.radius, 0, TAU);
      stift.strokeStyle = `rgba(255,255,255,${rest * rest * ring.staerke * 0.35})`;
      stift.lineWidth = ring.dicke * rest;
      stift.stroke();
    }
    this.ringe = this.ringe.filter((r) => r.radius < grenze);
    stift.globalCompositeOperation = 'source-over';
  }

  // --- Schicht 4: Funken --------------------------------------------------

  funkenZeichnen(sekunden) {
    const { stift } = this;
    stift.globalCompositeOperation = 'lighter';
    for (const funke of this.funken) {
      funke.alter += sekunden;
      funke.x += funke.vx * sekunden;
      funke.y += funke.vy * sekunden;
      // Abbremsen, damit sie auslaufen statt davonzuschiessen.
      funke.vx *= 1 - 1.6 * sekunden;
      funke.vy *= 1 - 1.6 * sekunden;
      const rest = 1 - funke.alter / funke.leben;
      if (rest <= 0) continue;
      stift.fillStyle = `rgba(255,255,255,${rest * 0.85})`;
      stift.beginPath();
      stift.arc(funke.x, funke.y, 1.5 + rest * 2, 0, TAU);
      stift.fill();
    }
    this.funken = this.funken.filter((f) => f.alter < f.leben);
    stift.globalCompositeOperation = 'source-over';
  }

  // --- Der Countdown zum Drop ---------------------------------------------

  // Ein duenner Bogen, der sich schliesst. Nur wenn es wirklich gleich soweit
  // ist - sonst waere es Dauerdeko und wuerde nichts mehr bedeuten.
  spannungZeigen(spannung, aktiv) {
    if (spannung < 0.25) return;
    const { stift, breite, hoehe } = this;
    const mx = breite / 2;
    const my = hoehe / 2;
    const r = Math.min(breite, hoehe) * 0.36;
    const pal = this.paletteFuer(aktiv?.track);

    stift.globalCompositeOperation = 'lighter';
    stift.beginPath();
    stift.arc(mx, my, r, -Math.PI / 2, -Math.PI / 2 + TAU * spannung);
    stift.strokeStyle = pal.hell;
    stift.globalAlpha = (spannung - 0.25) * 1.1;
    stift.lineWidth = 2 + spannung * 6;
    stift.lineCap = 'round';
    stift.stroke();
    stift.globalAlpha = 1;
    stift.globalCompositeOperation = 'source-over';
  }
}
