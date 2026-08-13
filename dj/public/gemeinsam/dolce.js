// La Dolce Trenta - das versteckte Bild.
//
// Alles andere in dieser Visualisierung ist abstrakt: Ringe, Strahlen, ein
// Fraktal. Das hier ist das Gegenteil - zehn gezeichnete Szenen aus dem Abend
// selbst, in den Farben der Einladung. Oliven fliegen, Wein laeuft ueber, die
// Sonne geht ueber dem Meer unter, eine Pizza dreht sich.
//
// Der Grundsatz bleibt derselbe wie ueberall hier: Nichts zappelt zur
// Lautstaerke. Jede Szene haengt an einer *anderen* Groesse der Musik, und die
// wichtigste Kopplung ist die zeitliche - was auf wenige Hundertstel mit dem
// Schlag zusammenfaellt, liest das Auge als dazugehoerig.
//
// Zwei Stellen machen sich das besonders zunutze, und sie sind der Kern:
//
//   Der Weintropfen faellt eine ganze Beatlaenge lang. Er startet auf einem
//   Schlag am Glasrand und trifft die Pfuetze genau auf dem naechsten. Der
//   Ring, der dann losfaehrt, *ist* der Beat - nicht ein Effekt dazu.
//
//   Die Zitronen springen mit der Beatlaenge als Sprungdauer. Der Aufprall
//   liegt damit auf dem Schlag, und zwar ohne jede Erkennung im Signal: Die
//   Flugbahn wird aus dem Raster gerechnet.
//
// Die Szenen wechseln auf Phrasengrenzen, nie mitten im Takt, und nie zweimal
// dieselbe hintereinander. Beim Drop wird gewechselt, egal wo man steht - der
// staerkste Moment der Musik ist auch im Bild ein Schnitt.

import { TAU } from './visualmodi.js';

/*
 * Die Farben kommen von der Einladung, nicht aus der Palette des Tracks.
 *
 * Alle anderen Modi wuerfeln ihre Farben aus der Trackkennung. Hier waere das
 * falsch: Der Wiedererkennungswert *ist* der Witz. Wer die Einladung auf dem
 * Telefon hat und das an der Wand sieht, soll es sofort erkennen.
 */
const DOLCE_F = {
  creme: '#f2ecda',
  cremeHell: '#faf6ea',
  oliv: '#3a4a26',
  olivTief: '#232d17',
  olivHell: '#5c6b3c',
  zitrone: '#e9c435',
  tomate: '#c8402f',
  tomateTief: '#8e2a1e',
  wein: '#7a1024',
  weinHell: '#b31f3a',
  basilikum: '#4a7a34',
  meer: '#1d4f63',
  meerTief: '#0d2733',
  sonne: '#f2a03d',
  abend: '#e0567c',
  nacht: '#2a1836',
  terrakotta: '#c96a3c',
  holz: '#3a2418',
};

// --- Kleinkram ------------------------------------------------------------

function dolceWuerfel(startwert) {
  let z = startwert >>> 0;
  return () => {
    z = (z * 1664525 + 1013904223) >>> 0;
    return z / 4294967296;
  };
}

/** Anteil des Bassbereichs, 0 bis 1. */
function dolceBass(spektrum) {
  if (!spektrum || spektrum.length === 0) return 0;
  const bis = Math.max(1, Math.floor(spektrum.length * 0.06));
  let s = 0;
  for (let i = 0; i < bis; i++) s += spektrum[i];
  return s / bis / 255;
}

/** Anteil der Hoehen - Hi-Hats, Percussion, alles Feine. */
function dolceHoehen(spektrum) {
  if (!spektrum || spektrum.length === 0) return 0;
  const von = Math.floor(spektrum.length * 0.18);
  const bis = Math.floor(spektrum.length * 0.45);
  let s = 0;
  for (let i = von; i < bis; i++) s += spektrum[i];
  return s / Math.max(1, bis - von) / 255;
}

/** Ein scharfer Anschlag: 1 auf dem Schlag, danach schnell weg. */
function dolceSchlag(takt, haerte = 7) {
  return takt ? Math.exp(-takt.imBeat * haerte) : 0;
}

function dolceMischen(a, b, t) {
  return a + (b - a) * t;
}

// Farbe mit Deckkraft, ohne jedes Mal einen String zusammenzubauen.
const dolceRgbSpeicher = new Map();
function dolceAlpha(hex, alpha) {
  let rgb = dolceRgbSpeicher.get(hex);
  if (!rgb) {
    rgb = [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    dolceRgbSpeicher.set(hex, rgb);
  }
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

/*
 * Farbverlaeufe werden gemerkt.
 *
 * createLinearGradient je Bild und Szene klingt harmlos und ist es nicht: Bei
 * zehn Szenen mit je zwei bis vier Verlaeufen sind das vierzig Objekte je
 * Bild, die alle wieder eingesammelt werden muessen. Gemerkt wird nach
 * Szenenname und Bildgroesse - beides aendert sich selten.
 */
const dolceVerlaufSpeicher = new Map();
function dolceVerlauf(stift, schluessel, breite, hoehe, bauen) {
  const voll = `${schluessel}|${breite}x${hoehe}`;
  let v = dolceVerlaufSpeicher.get(voll);
  if (!v) {
    v = bauen(stift);
    if (dolceVerlaufSpeicher.size > 40) dolceVerlaufSpeicher.clear();
    dolceVerlaufSpeicher.set(voll, v);
  }
  return v;
}

// --- Die Markise ----------------------------------------------------------
//
// Der gruen-creme gestreifte Bogenrand steht auf der Einladung ganz oben. Er
// laeuft hier durch *jede* Szene - so unterschiedlich die Bilder sind, sie
// haengen alle unter derselben Markise, und das haelt die Folge zusammen.

function markiseZeichnen(stift, breite, hoehe, tiefe, schwung = 0) {
  const bogen = Math.max(26, breite / 22);
  const zahl = Math.ceil(breite / bogen) + 1;
  const h = tiefe;

  stift.save();
  stift.beginPath();
  stift.moveTo(0, 0);
  stift.lineTo(breite, 0);
  stift.lineTo(breite, h);
  /*
   * Die Boegen haengen nach unten, sie werden nicht ausgeschnitten.
   *
   * Mit dem Gegenuhrzeigersinn kam die *obere* Haelfte jedes Kreises heraus -
   * die Boegen wurden aus dem Streifen herausgenommen, und uebrig blieben
   * Zacken nach unten. Auf der Einladung haengen dort Halbkreise.
   */
  for (let i = zahl; i >= 0; i--) {
    stift.arc(i * bogen - bogen / 2, h, bogen / 2, 0, Math.PI, false);
  }
  stift.lineTo(0, h);
  stift.closePath();
  stift.clip();

  stift.fillStyle = DOLCE_F.creme;
  stift.fillRect(0, 0, breite, h + bogen);
  stift.fillStyle = DOLCE_F.oliv;
  for (let i = 0; i < zahl; i += 2) {
    stift.fillRect(i * bogen + schwung, 0, bogen, h + bogen);
  }
  stift.restore();
}

// --- Szene: Der Wein ------------------------------------------------------
//
// Die Szene, um die es geht. Ein Glas wird eingeschenkt, laeuft ueber, und der
// Ueberlauf traegt den Takt.
//
// Der Kniff steckt in der Flugzeit des Tropfens: Er loest sich auf einem
// Schlag vom Rand und braucht genau eine Beatlaenge bis zur Pfuetze. Der
// Aufprall faellt damit auf den naechsten Schlag - nicht ungefaehr, sondern
// gerechnet. Was danach als Ring nach aussen laeuft, ist der Beat selbst.

function weinNeu() {
  return { fuellung: 0.15, tropfen: [], ringe: [], welle: 0, schleier: 0 };
}

function weinZeichnen(stift, l, s) {
  const { breite, hoehe, sekunden } = l;
  const mx = breite / 2;

  // Hintergrund: warmes Dunkelrot, zur Mitte hin heller.
  stift.fillStyle = dolceVerlauf(stift, 'wein', breite, hoehe, (c) => {
    const v = c.createRadialGradient(mx, hoehe * 0.45, 0, mx, hoehe * 0.45, breite * 0.7);
    v.addColorStop(0, '#3d0a16');
    v.addColorStop(1, '#150409');
    return v;
  });
  stift.fillRect(0, 0, breite, hoehe);

  // Masse des Glases.
  const kelchB = Math.min(breite * 0.24, hoehe * 0.34);
  const kelchH = kelchB * 1.25;
  const oben = hoehe * 0.24;
  const unten = oben + kelchH;
  const fussY = hoehe * 0.84;
  const pfuetzeY = fussY + 6;

  /*
   * Erst zuegig voll, dann lange ueberlaufen.
   *
   * Der erste Anlauf fuellte gleichmaessig langsam - nach zwanzig Sekunden war
   * das Glas halb voll, und der Ueberlauf, um den es in dieser Szene geht, kam
   * nie ins Bild. Jetzt sind es rund sechs Sekunden bis zur Kante; danach
   * steigt es nur noch kaum, und die Szene verbringt ihre Zeit dort, wo etwas
   * passiert.
   */
  const tempo = s.fuellung < 1 ? 0.17 + l.spannung * 0.08 : 0.012;
  s.fuellung += sekunden * tempo;
  if (l.drop) {
    s.fuellung = Math.max(s.fuellung, 1.05);
    s.welle = 1;
  }
  if (s.fuellung > 1.4) s.fuellung = 0.1;
  s.welle = Math.max(0, s.welle - sekunden * 1.4);

  const spiegel = unten - Math.min(1, s.fuellung) * kelchH;

  // --- Der Guss von oben ---
  const gussB = 3 + l.wucht * 7 + dolceBass(l.spektrum) * 6;
  stift.strokeStyle = dolceAlpha(DOLCE_F.weinHell, 0.85);
  stift.lineWidth = gussB;
  stift.lineCap = 'round';
  stift.beginPath();
  stift.moveTo(mx + Math.sin(l.zeit * 1.7) * 6, -10);
  stift.quadraticCurveTo(
    mx + Math.sin(l.zeit * 2.3) * 14,
    oben * 0.55,
    mx,
    spiegel > oben ? spiegel : oben + 4,
  );
  stift.stroke();

  // --- Das Glas ---
  const kelch = (versatz) => {
    stift.beginPath();
    stift.moveTo(mx - kelchB / 2 - versatz, oben);
    stift.bezierCurveTo(
      mx - kelchB / 2 - versatz, unten - kelchH * 0.1,
      mx - kelchB * 0.32 - versatz, unten,
      mx, unten,
    );
    stift.bezierCurveTo(
      mx + kelchB * 0.32 + versatz, unten,
      mx + kelchB / 2 + versatz, unten - kelchH * 0.1,
      mx + kelchB / 2 + versatz, oben,
    );
  };

  // Wein im Glas, an der Kelchform beschnitten.
  stift.save();
  kelch(0);
  stift.clip();
  stift.fillStyle = DOLCE_F.wein;
  const wellenH = 4 + l.wucht * 7 + s.welle * 22;
  stift.beginPath();
  stift.moveTo(mx - kelchB, unten + 10);
  stift.lineTo(mx - kelchB, spiegel);
  for (let x = -kelchB; x <= kelchB; x += kelchB / 8) {
    stift.lineTo(mx + x, spiegel + Math.sin(x * 0.06 + l.zeit * 5) * wellenH);
  }
  stift.lineTo(mx + kelchB, unten + 10);
  stift.closePath();
  stift.fill();
  // Ein hellerer Streifen an der Oberflaeche - das laesst es fluessig wirken.
  stift.fillStyle = dolceAlpha(DOLCE_F.weinHell, 0.5);
  stift.fillRect(mx - kelchB, spiegel, kelchB * 2, 3 + s.welle * 6);
  stift.restore();

  // Glaswand, Stiel, Fuss.
  stift.strokeStyle = dolceAlpha(DOLCE_F.cremeHell, 0.55);
  stift.lineWidth = Math.max(1.5, kelchB * 0.018);
  kelch(0);
  stift.stroke();
  stift.beginPath();
  stift.moveTo(mx, unten);
  stift.lineTo(mx, fussY - 4);
  stift.stroke();
  stift.beginPath();
  stift.ellipse(mx, fussY, kelchB * 0.32, kelchB * 0.075, 0, 0, TAU);
  stift.stroke();
  // Glanzlicht.
  stift.strokeStyle = dolceAlpha(DOLCE_F.cremeHell, 0.3);
  stift.lineWidth = Math.max(2, kelchB * 0.03);
  stift.beginPath();
  stift.moveTo(mx - kelchB * 0.3, oben + kelchH * 0.12);
  stift.quadraticCurveTo(mx - kelchB * 0.4, unten - kelchH * 0.3, mx - kelchB * 0.2, unten - 6);
  stift.stroke();

  /*
   * Der Ueberlauf.
   *
   * Ab Fuellstand 1 laeuft es ueber die Kante. Auf jedem Schlag loest sich ein
   * Tropfen - und seine Flugdauer ist genau eine Beatlaenge, damit er auf dem
   * naechsten Schlag ankommt.
   */
  if (s.fuellung >= 1) {
    const ueber = Math.min(1, (s.fuellung - 1) * 3);
    // Heller als der Wein im Glas: Aussen liegt duennes Nass auf Glas, und nur
    // so hebt es sich von der gefuellten Flaeche dahinter ab.
    stift.strokeStyle = dolceAlpha(DOLCE_F.weinHell, 0.95);
    stift.lineWidth = 3 + ueber * 6;
    for (const seite of [-1, 1]) {
      stift.beginPath();
      stift.moveTo(mx + (seite * kelchB) / 2, oben + 2);
      stift.quadraticCurveTo(
        mx + seite * kelchB * 0.62,
        (oben + unten) / 2,
        mx + seite * kelchB * 0.2,
        unten - 4,
      );
      stift.stroke();
    }

    if (l.neuerSchlag) {
      const seite = Math.random() < 0.5 ? -1 : 1;
      s.tropfen.push({ t: 0, x: mx + (seite * kelchB) / 2, gross: 3 + l.wucht * 4 });
    }
  }

  // Tropfen fliegen, und ihr Aufprall setzt den Ring.
  for (let i = s.tropfen.length - 1; i >= 0; i--) {
    const tr = s.tropfen[i];
    tr.t += sekunden * l.beatTempo;
    if (tr.t >= 1) {
      s.tropfen.splice(i, 1);
      s.ringe.push({ x: dolceMischen(tr.x, mx, 0.6), r: 2, kraft: 1 });
      continue;
    }
    // Wurfparabel vom Rand zur Pfuetze.
    const x = dolceMischen(tr.x, dolceMischen(tr.x, mx, 0.6), tr.t);
    const y = dolceMischen(oben + 2, pfuetzeY, tr.t * tr.t);
    stift.fillStyle = DOLCE_F.weinHell;
    stift.beginPath();
    stift.ellipse(x, y, tr.gross * 0.7, tr.gross * (1 + tr.t * 0.6), 0, 0, TAU);
    stift.fill();
  }

  // --- Die Pfuetze, und in ihr der Takt ---
  const pfuetzeB = breite * (0.16 + Math.min(0.3, (s.fuellung - 1) * 0.5));
  if (s.fuellung > 1) {
    stift.fillStyle = dolceAlpha(DOLCE_F.wein, 0.85);
    stift.beginPath();
    stift.ellipse(mx, pfuetzeY, pfuetzeB, pfuetzeB * 0.13, 0, 0, TAU);
    stift.fill();
  }

  for (let i = s.ringe.length - 1; i >= 0; i--) {
    const r = s.ringe[i];
    r.r += sekunden * breite * 0.5;
    r.kraft -= sekunden * 1.1;
    if (r.kraft <= 0) {
      s.ringe.splice(i, 1);
      continue;
    }
    stift.strokeStyle = dolceAlpha(DOLCE_F.weinHell, r.kraft * 0.75);
    stift.lineWidth = 1 + r.kraft * 3;
    stift.beginPath();
    stift.ellipse(r.x, pfuetzeY, r.r, r.r * 0.13, 0, 0, TAU);
    stift.stroke();
  }

  // Beim Drop schwappt es ueber das ganze Bild.
  if (s.welle > 0.01) {
    stift.fillStyle = dolceAlpha(DOLCE_F.wein, s.welle * 0.5);
    stift.beginPath();
    stift.moveTo(0, hoehe);
    for (let x = 0; x <= breite; x += breite / 24) {
      stift.lineTo(x, hoehe - s.welle * hoehe * 0.5 + Math.sin(x * 0.01 + l.zeit * 6) * 18);
    }
    stift.lineTo(breite, hoehe);
    stift.closePath();
    stift.fill();
  }
}

// --- Szene: Fliegende Oliven ----------------------------------------------

function olivenNeu() {
  const w = dolceWuerfel(20260822);
  return {
    stuecke: Array.from({ length: 34 }, () => ({
      x: w(),
      y: w(),
      vx: (w() - 0.5) * 0.22,
      vy: (w() - 0.5) * 0.22,
      dreh: w() * TAU,
      drehTempo: (w() - 0.5) * 4,
      gross: 0.5 + w() * 0.9,
      // Der Taumelphasenwinkel: Er macht aus einer Ellipse eine Olive, die
      // sich im Raum dreht, statt nur zu rotieren.
      taumel: w() * TAU,
    })),
    sog: 0,
  };
}

function olivenZeichnen(stift, l, s) {
  const { breite, hoehe, sekunden } = l;
  stift.fillStyle = dolceVerlauf(stift, 'oliven', breite, hoehe, (c) => {
    const v = c.createRadialGradient(breite / 2, hoehe / 2, 0, breite / 2, hoehe / 2, breite * 0.75);
    v.addColorStop(0, '#33421f');
    v.addColorStop(1, '#10160a');
    return v;
  });
  stift.fillRect(0, 0, breite, hoehe);

  // Spannung zieht die Oliven in einen kreisenden Ring zusammen, der Drop
  // sprengt ihn.
  s.sog = dolceMischen(s.sog, l.spannung, sekunden * 2);
  const stoss = l.drop ? 1 : 0;
  const puls = dolceSchlag(l.takt, 6);
  const mass = Math.min(breite, hoehe);

  for (const o of s.stuecke) {
    if (stoss) {
      const w = Math.atan2(o.y - 0.5, o.x - 0.5);
      o.vx += Math.cos(w) * 1.1;
      o.vy += Math.sin(w) * 1.1;
      o.drehTempo += (Math.random() - 0.5) * 9;
    }
    // Zum Ring hin.
    const zx = o.x - 0.5;
    const zy = o.y - 0.5;
    const weite = Math.hypot(zx, zy) || 1e-6;
    const ziel = 0.16 + (1 - s.sog) * 0.2;
    const zug = (ziel - weite) * s.sog * 3.5;
    o.vx += (zx / weite) * zug * sekunden * 6;
    o.vy += (zy / weite) * zug * sekunden * 6;
    // Und im Ring herum.
    o.vx += (-zy / weite) * s.sog * sekunden * 1.6;
    o.vy += (zx / weite) * s.sog * sekunden * 1.6;

    o.x += o.vx * sekunden;
    o.y += o.vy * sekunden;
    o.vx *= Math.pow(0.35, sekunden);
    o.vy *= Math.pow(0.35, sekunden);
    // Am Rand umkehren statt verschwinden.
    if (o.x < -0.1) o.x += 1.2;
    if (o.x > 1.1) o.x -= 1.2;
    if (o.y < -0.1) o.y += 1.2;
    if (o.y > 1.1) o.y -= 1.2;
    o.dreh += o.drehTempo * sekunden;
    o.taumel += sekunden * (1.4 + o.gross);
    o.drehTempo *= Math.pow(0.7, sekunden);

    const gr = mass * 0.028 * o.gross * (1 + puls * 0.22);
    // Der Taumel staucht die Olive - sie dreht sich dadurch scheinbar im Raum.
    const breit = Math.abs(Math.cos(o.taumel)) * 0.62 + 0.38;

    stift.save();
    stift.translate(o.x * breite, o.y * hoehe);
    stift.rotate(o.dreh);
    stift.fillStyle = '#7f9440';
    stift.beginPath();
    stift.ellipse(0, 0, gr * breit, gr * 1.35, 0, 0, TAU);
    stift.fill();
    // Glanz oben links, das macht sie rund.
    stift.fillStyle = dolceAlpha('#c3d488', 0.55);
    stift.beginPath();
    stift.ellipse(-gr * breit * 0.3, -gr * 0.45, gr * breit * 0.28, gr * 0.35, 0, 0, TAU);
    stift.fill();
    // Und die Paprika im Loch - nur wenn die Olive uns zugewandt ist.
    if (Math.cos(o.taumel) > 0.15) {
      stift.fillStyle = DOLCE_F.tomate;
      stift.beginPath();
      stift.ellipse(0, 0, gr * breit * 0.34, gr * 0.42, 0, 0, TAU);
      stift.fill();
    }
    stift.restore();
  }
}

// --- Szene: Meer und Sonnenuntergang --------------------------------------

function meerNeu() {
  return { sonne: 0.35, glanz: 0 };
}

function meerZeichnen(stift, l, s) {
  const { breite, hoehe, sekunden } = l;
  const horizont = hoehe * 0.52;

  stift.fillStyle = dolceVerlauf(stift, 'himmel', breite, hoehe, (c) => {
    const v = c.createLinearGradient(0, 0, 0, horizont);
    v.addColorStop(0, DOLCE_F.nacht);
    v.addColorStop(0.45, '#6d3a63');
    v.addColorStop(0.78, DOLCE_F.abend);
    v.addColorStop(1, DOLCE_F.sonne);
    return v;
  });
  stift.fillRect(0, 0, breite, horizont);

  // Die Sonne sinkt mit der Spannung und springt beim Drop zurueck nach oben -
  // der Abend faengt von vorne an.
  s.sonne = dolceMischen(s.sonne, 0.1 + (1 - l.spannung) * 0.5, sekunden * 0.7);
  if (l.drop) s.sonne = 0.62;
  const sy = horizont - hoehe * 0.34 * s.sonne;
  const sr = Math.min(breite, hoehe) * 0.15;

  // Sonnenscheibe mit waagerechten Schnitten - der Streifenlook, den jeder
  // kennt. Die Schnitte sitzen auf den Baendern des Spektrums.
  stift.save();
  stift.beginPath();
  stift.arc(breite / 2, sy, sr, 0, TAU);
  stift.clip();
  stift.fillStyle = dolceVerlauf(stift, 'sonne', breite, hoehe, (c) => {
    const v = c.createLinearGradient(0, sy - sr, 0, sy + sr);
    v.addColorStop(0, '#ffe9a8');
    v.addColorStop(0.5, DOLCE_F.zitrone);
    v.addColorStop(1, DOLCE_F.terrakotta);
    return v;
  });
  stift.fillRect(breite / 2 - sr, sy - sr, sr * 2, sr * 2);
  const baender = 7;
  for (let i = 0; i < baender; i++) {
    const anteil = l.spektrum?.length
      ? l.spektrum[Math.floor((i / baender) * l.spektrum.length * 0.4)] / 255
      : 0.3;
    const y = sy - sr + ((i + 0.6) / baender) * sr * 2;
    const dick = sr * 0.06 * (1.6 - anteil);
    stift.fillStyle = dolceAlpha(DOLCE_F.abend, 0.75);
    stift.fillRect(breite / 2 - sr, y, sr * 2, Math.max(1, dick));
  }
  stift.restore();

  // Meer.
  stift.fillStyle = dolceVerlauf(stift, 'meer', breite, hoehe, (c) => {
    const v = c.createLinearGradient(0, horizont, 0, hoehe);
    v.addColorStop(0, DOLCE_F.sonne);
    v.addColorStop(0.12, DOLCE_F.meer);
    v.addColorStop(1, DOLCE_F.meerTief);
    return v;
  });
  stift.fillRect(0, horizont, breite, hoehe - horizont);

  // Sechs Wellenbaender. Je weiter vorn, desto groesser und langsamer - das
  // allein macht die Tiefe.
  const bass = dolceBass(l.spektrum);
  const puls = dolceSchlag(l.takt, 5);
  for (let i = 0; i < 6; i++) {
    const t = (i + 1) / 6;
    const y = horizont + (hoehe - horizont) * t * t;
    const amp = (3 + t * 26) * (0.5 + bass * 1.4 + puls * 0.5);
    const tempo = 0.6 + t * 1.9;
    stift.fillStyle = dolceAlpha(i % 2 ? DOLCE_F.meerTief : DOLCE_F.meer, 0.55 + t * 0.35);
    stift.beginPath();
    stift.moveTo(0, hoehe);
    stift.lineTo(0, y);
    for (let x = 0; x <= breite; x += Math.max(8, breite / 60)) {
      stift.lineTo(
        x,
        y + Math.sin(x * (0.006 + t * 0.004) + l.zeit * tempo + i) * amp +
          Math.sin(x * 0.017 - l.zeit * tempo * 1.7) * amp * 0.35,
      );
    }
    stift.lineTo(breite, hoehe);
    stift.closePath();
    stift.fill();
  }

  /*
   * Der Lichtpfad unter der Sonne. Er flackert mit den Hoehen.
   *
   * Additiv gezeichnet, nicht deckend: Mit normaler Deckkraft ueber dunklem
   * Blau kam ein *graues* Band heraus statt eines goldenen. Licht auf Wasser
   * addiert sich zum Untergrund, es ersetzt ihn nicht - und genau das macht
   * "lighter".
   */
  const flimmern = dolceHoehen(l.spektrum);
  stift.save();
  stift.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) {
    const t = i / 18;
    const y = horizont + (hoehe - horizont) * t * t + Math.sin(l.zeit * 3 + i) * 3;
    const w = sr * (0.35 + t * 1.7) * (0.55 + Math.sin(l.zeit * 5 + i * 2) * 0.45);
    // Nach hinten heller, nach vorn breiter und weicher - so laeuft der Pfad
    // auf die Sonne zu, statt als Leiter dazuliegen.
    stift.fillStyle = dolceAlpha('#ffcf7a', (0.30 + flimmern * 0.4) * (1 - t * 0.55));
    const hoch = Math.max(1.5, 2 + t * 5);
    stift.beginPath();
    stift.ellipse(breite / 2, y, w / 2, hoch, 0, 0, TAU);
    stift.fill();
  }
  stift.restore();
}

// --- Szene: Pizza ---------------------------------------------------------

function pizzaNeu() {
  const w = dolceWuerfel(1908);
  return {
    dreh: 0,
    stuecke: Array.from({ length: 8 }, () => ({ weg: 0 })),
    /*
     * Der Belag liegt auf einer Spirale mit dem goldenen Winkel, nicht
     * gewuerfelt. Gewuerfelt kommen bei sechsundzwanzig Stuecken zwangslaeufig
     * Klumpen und leere Ecken heraus - so wie beim ersten Versuch, wo die
     * halbe Pizza leer blieb. Die Spirale verteilt gleichmaessig und sieht
     * trotzdem nicht nach Raster aus.
     */
    belag: Array.from({ length: 28 }, (_, i) => ({
      w: i * 2.39996,
      r: Math.sqrt((i + 0.5) / 28) * 0.9,
      art: w(),
      gross: 0.6 + w() * 0.7,
    })),
    naechstes: 0,
  };
}

function pizzaZeichnen(stift, l, s) {
  const { breite, hoehe, sekunden } = l;
  const mx = breite / 2;
  const my = hoehe / 2;
  const R = Math.min(breite, hoehe) * 0.36;

  stift.fillStyle = dolceVerlauf(stift, 'pizza', breite, hoehe, (c) => {
    const v = c.createRadialGradient(mx, my, R * 0.5, mx, my, breite * 0.8);
    v.addColorStop(0, '#4a2e1c');
    v.addColorStop(1, '#1a1009');
    return v;
  });
  stift.fillRect(0, 0, breite, hoehe);

  s.dreh += sekunden * (0.14 + l.spannung * 0.5);

  // Auf jedem Schlag hebt ein Stueck ab, reihum.
  if (l.neuerSchlag) {
    s.stuecke[s.naechstes % 8].weg = 1;
    s.naechstes++;
  }
  if (l.drop) for (const st of s.stuecke) st.weg = 1.6;

  for (let i = 0; i < 8; i++) {
    const st = s.stuecke[i];
    st.weg = Math.max(0, st.weg - sekunden * 2.2);
    const von = s.dreh + (i / 8) * TAU;
    const bis = von + TAU / 8;
    const mitte = (von + bis) / 2;
    const raus = st.weg * R * 0.28;

    stift.save();
    stift.translate(mx + Math.cos(mitte) * raus, my + Math.sin(mitte) * raus);

    // Teigrand.
    stift.fillStyle = '#e3b871';
    stift.beginPath();
    stift.moveTo(0, 0);
    stift.arc(0, 0, R, von, bis);
    stift.closePath();
    stift.fill();
    // Belagflaeche etwas kleiner - so bleibt der Rand stehen.
    stift.fillStyle = '#cf5233';
    stift.beginPath();
    stift.moveTo(0, 0);
    stift.arc(0, 0, R * 0.88, von + 0.02, bis - 0.02);
    stift.closePath();
    stift.fill();
    stift.restore();
  }

  // Belag - dreht mit, haengt aber nicht an einem einzelnen Stueck.
  for (const b of s.belag) {
    const w = b.w + s.dreh;
    const x = mx + Math.cos(w) * b.r * R * 0.85;
    const y = my + Math.sin(w) * b.r * R * 0.85;
    const gr = R * 0.075 * b.gross * (1 + dolceSchlag(l.takt, 9) * 0.18);
    if (b.art < 0.45) {
      // Salami.
      stift.fillStyle = '#a8322c';
      stift.beginPath();
      stift.arc(x, y, gr, 0, TAU);
      stift.fill();
      stift.fillStyle = '#7d211f';
      stift.beginPath();
      stift.arc(x - gr * 0.25, y + gr * 0.2, gr * 0.16, 0, TAU);
      stift.fill();
    } else if (b.art < 0.78) {
      // Mozzarella.
      stift.fillStyle = dolceAlpha('#fdf6e3', 0.9);
      stift.beginPath();
      stift.ellipse(x, y, gr * 1.1, gr * 0.85, w, 0, TAU);
      stift.fill();
    } else {
      // Basilikum.
      stift.fillStyle = DOLCE_F.basilikum;
      stift.save();
      stift.translate(x, y);
      stift.rotate(w * 2);
      stift.beginPath();
      stift.ellipse(0, 0, gr * 1.3, gr * 0.6, 0, 0, TAU);
      stift.fill();
      stift.restore();
    }
  }
}

// --- Szene: Fische --------------------------------------------------------

function fischeNeu() {
  const w = dolceWuerfel(77712);
  return {
    schwarm: Array.from({ length: 46 }, () => ({
      x: w(),
      y: w(),
      vx: 0.1,
      vy: 0,
      phase: w() * TAU,
      gross: 0.65 + w() * 0.7,
    })),
    zielX: 0.5,
    zielY: 0.5,
    schreck: 0,
  };
}

function fischeZeichnen(stift, l, s) {
  const { breite, hoehe, sekunden } = l;
  stift.fillStyle = dolceVerlauf(stift, 'fische', breite, hoehe, (c) => {
    const v = c.createLinearGradient(0, 0, 0, hoehe);
    v.addColorStop(0, '#2b7f92');
    v.addColorStop(0.55, DOLCE_F.meer);
    v.addColorStop(1, '#071a24');
    return v;
  });
  stift.fillRect(0, 0, breite, hoehe);

  // Lichtstrahlen von oben.
  const hell = dolceHoehen(l.spektrum);
  stift.save();
  stift.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const x = breite * (0.12 + i * 0.19) + Math.sin(l.zeit * 0.4 + i) * breite * 0.03;
    stift.fillStyle = dolceAlpha('#bfe9f2', 0.05 + hell * 0.08);
    stift.beginPath();
    stift.moveTo(x - breite * 0.035, 0);
    stift.lineTo(x + breite * 0.035, 0);
    stift.lineTo(x + breite * 0.12, hoehe);
    stift.lineTo(x - breite * 0.02, hoehe);
    stift.closePath();
    stift.fill();
  }
  stift.restore();

  // Das Ziel wandert gemaechlich; der Drop schreckt den Schwarm auf.
  s.zielX = 0.5 + Math.sin(l.zeit * 0.37) * 0.34;
  s.zielY = 0.5 + Math.cos(l.zeit * 0.29) * 0.26;
  if (l.drop) s.schreck = 1;
  s.schreck = Math.max(0, s.schreck - sekunden * 0.9);
  const puls = dolceSchlag(l.takt, 8);

  for (const f of s.schwarm) {
    const zx = s.zielX - f.x;
    const zy = s.zielY - f.y;
    const weite = Math.hypot(zx, zy) || 1e-6;
    // Hin zum Ziel - oder beim Schreck davon.
    const richtung = s.schreck > 0 ? -2.6 * s.schreck : 1;
    f.vx += (zx / weite) * sekunden * 1.5 * richtung;
    f.vy += (zy / weite) * sekunden * 1.5 * richtung;
    // Auf dem Schlag ein Schub nach vorn - der Schwarm zuckt im Takt.
    if (l.neuerSchlag) {
      const t = Math.hypot(f.vx, f.vy) || 1e-6;
      f.vx += (f.vx / t) * 0.16;
      f.vy += (f.vy / t) * 0.16;
    }
    f.x += f.vx * sekunden;
    f.y += f.vy * sekunden;
    f.vx *= Math.pow(0.5, sekunden);
    f.vy *= Math.pow(0.5, sekunden);
    if (f.x < 0.02 || f.x > 0.98) f.vx *= -1;
    if (f.y < 0.05 || f.y > 0.95) f.vy *= -1;
    f.x = Math.min(0.99, Math.max(0.01, f.x));
    f.y = Math.min(0.99, Math.max(0.01, f.y));
    f.phase += sekunden * 9;

    const gr = Math.min(breite, hoehe) * 0.022 * f.gross * (1 + puls * 0.12);
    const w = Math.atan2(f.vy, f.vx);
    stift.save();
    stift.translate(f.x * breite, f.y * hoehe);
    stift.rotate(w);
    stift.fillStyle = dolceAlpha('#f0d9a0', 0.92);
    stift.beginPath();
    stift.moveTo(gr * 1.6, 0);
    stift.quadraticCurveTo(0, -gr * 0.75, -gr, 0);
    stift.quadraticCurveTo(0, gr * 0.75, gr * 1.6, 0);
    stift.fill();
    // Schwanzflosse, die mitschlaegt.
    const schlag = Math.sin(f.phase) * gr * 0.5;
    stift.beginPath();
    stift.moveTo(-gr * 0.9, 0);
    stift.lineTo(-gr * 1.7, schlag - gr * 0.45);
    stift.lineTo(-gr * 1.7, schlag + gr * 0.45);
    stift.closePath();
    stift.fill();
    stift.fillStyle = '#26343a';
    stift.beginPath();
    stift.arc(gr * 0.85, -gr * 0.12, gr * 0.11, 0, TAU);
    stift.fill();
    stift.restore();
  }
}

// --- Szene: Bruschetta ----------------------------------------------------

function brotNeu() {
  const w = dolceWuerfel(30303);
  return {
    scheiben: Array.from({ length: 5 }, (_, i) => ({
      x: 0.14 + i * 0.18,
      y: 0.62 + (w() - 0.5) * 0.06,
      dreh: (w() - 0.5) * 0.4,
      hupf: 0,
      wiege: w() * TAU,
    })),
    dolceWuerfel: [],
    naechste: 0,
  };
}

function brotZeichnen(stift, l, s) {
  const { breite, hoehe, sekunden } = l;
  stift.fillStyle = dolceVerlauf(stift, 'brot', breite, hoehe, (c) => {
    const v = c.createLinearGradient(0, 0, 0, hoehe);
    v.addColorStop(0, '#241c10');
    v.addColorStop(1, '#4a3a22');
    return v;
  });
  stift.fillRect(0, 0, breite, hoehe);

  // Auf jedem Schlag regnet ein Tomatenwuerfel auf die naechste Scheibe.
  if (l.neuerSchlag) {
    const ziel = s.scheiben[s.naechste % s.scheiben.length];
    // Die Scheibe, die gleich getroffen wird, hebt sich kurz an. Ohne das
    // steht das Brett vollkommen still, und die Szene wirkt wie ein Foto mit
    // ein paar fallenden Punkten davor.
    ziel.hupf = 1;
    s.naechste++;
    s.dolceWuerfel.push({
      x: ziel.x + (Math.random() - 0.5) * 0.05,
      y: -0.05,
      zielY: ziel.y - 0.02,
      t: 0,
      dreh: Math.random() * TAU,
      basilikum: Math.random() < 0.3,
    });
  }
  if (s.dolceWuerfel.length > 90) s.dolceWuerfel.splice(0, s.dolceWuerfel.length - 90);

  const mass = Math.min(breite, hoehe);

  // Die Scheiben. Sie wiegen sich langsam und heben sich auf ihrem Schlag.
  for (const b of s.scheiben) {
    b.hupf = Math.max(0, b.hupf - sekunden * 3.2);
    b.wiege += sekunden * 0.8;
    const heben = Math.sin(b.hupf * Math.PI) * mass * 0.035;
    stift.save();
    stift.translate(
      b.x * breite + Math.sin(b.wiege) * mass * 0.006,
      b.y * hoehe - heben + Math.cos(b.wiege * 0.7) * mass * 0.004,
    );
    stift.rotate(b.dreh + Math.sin(b.wiege) * 0.03);
    const bw = mass * 0.15;
    const bh = mass * 0.075;
    // Kruste.
    stift.fillStyle = '#b8813f';
    stift.beginPath();
    stift.ellipse(0, 0, bw, bh, 0, 0, TAU);
    stift.fill();
    // Krume.
    stift.fillStyle = '#f2e2bd';
    stift.beginPath();
    stift.ellipse(0, -bh * 0.12, bw * 0.88, bh * 0.72, 0, 0, TAU);
    stift.fill();
    // Poren - das macht aus einer Ellipse Weissbrot.
    const w = dolceWuerfel(Math.round(b.x * 1000));
    stift.fillStyle = dolceAlpha('#d9c49a', 0.85);
    for (let i = 0; i < 9; i++) {
      const px = (w() - 0.5) * bw * 1.5;
      const py = (w() - 0.5) * bh * 1.1;
      stift.beginPath();
      stift.arc(px, py, mass * 0.004 * (0.6 + w()), 0, TAU);
      stift.fill();
    }
    stift.restore();
  }

  // Und der Regen darauf.
  for (let i = s.dolceWuerfel.length - 1; i >= 0; i--) {
    const t = s.dolceWuerfel[i];
    if (t.t < 1) {
      t.t = Math.min(1, t.t + sekunden * l.beatTempo);
      t.y = dolceMischen(-0.05, t.zielY, t.t * t.t);
      t.dreh += sekunden * 6;
    }
    const gr = mass * 0.019 * (t.gross ?? 1);
    const drauf = s.scheiben[t.scheibe ?? 0];
    const mitHeben = t.t >= 1 && drauf ? Math.sin(drauf.hupf * Math.PI) * mass * 0.035 : 0;
    stift.save();
    stift.translate(
      t.x * breite + (t.t >= 1 && drauf ? Math.sin(drauf.wiege) * mass * 0.006 : 0),
      t.y * hoehe - mitHeben,
    );
    stift.rotate(t.dreh * (t.t < 1 ? 1 : 0));
    if (t.basilikum) {
      stift.fillStyle = DOLCE_F.basilikum;
      stift.beginPath();
      stift.ellipse(0, 0, gr * 1.4, gr * 0.6, 0.5, 0, TAU);
      stift.fill();
    } else {
      stift.fillStyle = DOLCE_F.tomate;
      stift.fillRect(-gr / 2, -gr / 2, gr, gr);
      stift.fillStyle = dolceAlpha('#e8735c', 0.8);
      stift.fillRect(-gr / 2, -gr / 2, gr * 0.45, gr * 0.45);
    }
    stift.restore();
  }
}

// --- Szene: Springende Zitronen -------------------------------------------
//
// Die zweite Stelle, an der die Zeit gerechnet und nicht erkannt wird: Die
// Sprungdauer *ist* die Beatlaenge. Der Aufprall liegt damit auf dem Schlag,
// und zwar bei jeder Zitrone, egal wie hoch sie springt.

function zitronenNeu() {
  const w = dolceWuerfel(2208);
  return {
    stuecke: Array.from({ length: 9 }, (_, i) => ({
      x: 0.08 + i * 0.105,
      versatz: w(),
      hoehe: 0.24 + w() * 0.3,
      dreh: w() * TAU,
      gross: 0.75 + w() * 0.5,
    })),
  };
}

function zitronenZeichnen(stift, l, s) {
  const { breite, hoehe } = l;
  stift.fillStyle = dolceVerlauf(stift, 'zitronen', breite, hoehe, (c) => {
    const v = c.createLinearGradient(0, 0, 0, hoehe);
    v.addColorStop(0, DOLCE_F.olivTief);
    v.addColorStop(1, '#4d5b2c');
    return v;
  });
  stift.fillRect(0, 0, breite, hoehe);

  const bodenY = hoehe * 0.82;
  // Der Boden als angedeutete Tischkante.
  stift.fillStyle = dolceAlpha(DOLCE_F.creme, 0.12);
  stift.fillRect(0, bodenY, breite, hoehe - bodenY);

  const beat = l.takt ? l.takt.beat : l.zeit * 2;
  const mass = Math.min(breite, hoehe);

  for (const z of s.stuecke) {
    // Bruchteil des eigenen Sprungs. Der Versatz verteilt die Zitronen ueber
    // den Takt, damit sie nicht alle gleichzeitig aufkommen.
    const p = (beat + z.versatz) % 1;
    // Wurfparabel: 0 am Boden, 1 oben, 0 am Boden.
    const flug = 4 * p * (1 - p);
    const y = bodenY - flug * hoehe * z.hoehe;
    // Beim Aufprall gestaucht - das verkauft den Aufschlag.
    const nahBoden = Math.max(0, 1 - p * 6) + Math.max(0, 1 - (1 - p) * 6);
    const stauch = 1 - Math.min(0.45, nahBoden * 0.4);

    const gr = mass * 0.052 * z.gross;
    stift.save();
    stift.translate(z.x * breite, y);
    stift.rotate(z.dreh + beat * 0.7);
    stift.scale(1 / stauch, stauch);

    stift.fillStyle = DOLCE_F.zitrone;
    stift.beginPath();
    stift.ellipse(0, 0, gr, gr * 0.78, 0, 0, TAU);
    stift.fill();
    // Die beiden Zipfel.
    stift.beginPath();
    stift.ellipse(gr * 0.95, 0, gr * 0.16, gr * 0.13, 0, 0, TAU);
    stift.ellipse(-gr * 0.95, 0, gr * 0.16, gr * 0.13, 0, 0, TAU);
    stift.fill();
    // Glanz.
    stift.fillStyle = dolceAlpha('#fff3b0', 0.6);
    stift.beginPath();
    stift.ellipse(-gr * 0.3, -gr * 0.3, gr * 0.3, gr * 0.16, -0.5, 0, TAU);
    stift.fill();
    // Blatt.
    stift.fillStyle = DOLCE_F.basilikum;
    stift.beginPath();
    stift.ellipse(gr * 0.5, -gr * 0.65, gr * 0.4, gr * 0.16, -0.7, 0, TAU);
    stift.fill();
    stift.restore();

    // Schatten, der beim Aufkommen klein und dunkel wird.
    stift.fillStyle = dolceAlpha('#000000', 0.28 * (1 - flug * 0.7));
    stift.beginPath();
    stift.ellipse(z.x * breite, bodenY + 4, gr * (1 - flug * 0.4), gr * 0.16, 0, 0, TAU);
    stift.fill();
  }
}

// --- Szene: Caprese-Schachbrett -------------------------------------------

function capreseNeu() {
  return { welle: 0 };
}

function capreseZeichnen(stift, l, s) {
  const { breite, hoehe, sekunden } = l;
  stift.fillStyle = DOLCE_F.creme;
  stift.fillRect(0, 0, breite, hoehe);

  const spalten = 9;
  const zeilen = Math.max(4, Math.round((spalten * hoehe) / breite));
  const bw = breite / spalten;
  const bh = (hoehe * 0.86) / zeilen;
  const oben = hoehe * 0.09;

  // Auf jedem Schlag laeuft eine Klappwelle diagonal durch das Feld.
  if (l.neuerSchlag) s.welle = 0;
  s.welle += sekunden * 2.6;
  if (l.drop) s.welle = 0;

  for (let zy = 0; zy < zeilen; zy++) {
    for (let zx = 0; zx < spalten; zx++) {
      const diagonale = (zx + zy) / (spalten + zeilen);
      // Wie weit die Welle an dieser Kachel ist.
      const t = Math.max(0, Math.min(1, (s.welle - diagonale) * 3));
      // Klappen heisst: in der Hoehe auf null und wieder zurueck.
      const klapp = Math.abs(Math.cos(t * Math.PI));
      const rot = (zx + zy) % 2 === 0;

      const x = zx * bw + bw / 2;
      const y = oben + zy * bh + bh / 2;
      const r = Math.min(bw, bh) * 0.42;

      stift.save();
      stift.translate(x, y);
      stift.scale(1, Math.max(0.04, klapp));
      if (rot) {
        stift.fillStyle = DOLCE_F.tomate;
        stift.beginPath();
        stift.arc(0, 0, r, 0, TAU);
        stift.fill();
        // Die helle Mitte der Tomatenscheibe.
        stift.fillStyle = dolceAlpha('#e8917c', 0.75);
        stift.beginPath();
        stift.arc(0, 0, r * 0.42, 0, TAU);
        stift.fill();
      } else {
        stift.fillStyle = DOLCE_F.cremeHell;
        stift.beginPath();
        stift.arc(0, 0, r * 0.94, 0, TAU);
        stift.fill();
        stift.strokeStyle = dolceAlpha('#d9d2bd', 0.9);
        stift.lineWidth = 1.5;
        stift.stroke();
      }
      stift.restore();
    }
  }

  // Ein paar Basilikumblaetter obenauf, damit es nicht nach Tapete aussieht.
  const w = dolceWuerfel(4242);
  for (let i = 0; i < 7; i++) {
    const x = w() * breite;
    const y = oben + w() * (hoehe * 0.86);
    const gr = Math.min(breite, hoehe) * 0.035;
    stift.save();
    stift.translate(x, y + Math.sin(l.zeit * 1.6 + i) * 5);
    stift.rotate(w() * TAU + l.zeit * 0.2);
    stift.fillStyle = DOLCE_F.basilikum;
    stift.beginPath();
    stift.ellipse(0, 0, gr, gr * 0.45, 0, 0, TAU);
    stift.fill();
    stift.restore();
  }
}

// --- Szene: Spritz --------------------------------------------------------

function spritzNeu() {
  return { blasen: [], schaum: 0 };
}

function spritzZeichnen(stift, l, s) {
  const { breite, hoehe, sekunden } = l;
  const mx = breite / 2;
  stift.fillStyle = dolceVerlauf(stift, 'spritz', breite, hoehe, (c) => {
    const v = c.createRadialGradient(mx, hoehe * 0.5, 0, mx, hoehe * 0.5, breite * 0.7);
    v.addColorStop(0, '#5a2a10');
    v.addColorStop(1, '#180a04');
    return v;
  });
  stift.fillRect(0, 0, breite, hoehe);

  const glasB = Math.min(breite * 0.2, hoehe * 0.3);
  const oben = hoehe * 0.26;
  const unten = hoehe * 0.74;

  // Glas (schlichter Becher, oben leicht weiter).
  const wand = (dx) => {
    stift.beginPath();
    stift.moveTo(mx - glasB / 2 - dx, oben);
    stift.lineTo(mx - glasB * 0.42 - dx, unten);
    stift.quadraticCurveTo(mx, unten + glasB * 0.12, mx + glasB * 0.42 + dx, unten);
    stift.lineTo(mx + glasB / 2 + dx, oben);
  };

  stift.save();
  wand(0);
  stift.closePath();
  stift.clip();

  // Der Aperol.
  stift.fillStyle = dolceVerlauf(stift, 'aperol', breite, hoehe, (c) => {
    const v = c.createLinearGradient(0, oben, 0, unten);
    v.addColorStop(0, '#ff8a2b');
    v.addColorStop(1, '#d63d12');
    return v;
  });
  stift.fillRect(mx - glasB, oben + glasB * 0.16, glasB * 2, unten - oben);

  // Blasen. Auf dem Schlag ein Schwung, dazwischen nach Hoehenanteil.
  const hell = dolceHoehen(l.spektrum);
  const wieviele = (l.neuerSchlag ? 9 : 0) + (Math.random() < hell * 0.9 ? 2 : 0);
  for (let i = 0; i < wieviele; i++) {
    s.blasen.push({
      x: mx + (Math.random() - 0.5) * glasB * 0.8,
      y: unten - 4,
      v: 0.12 + Math.random() * 0.3,
      r: 1.5 + Math.random() * 3.5,
    });
  }
  if (s.blasen.length > 220) s.blasen.splice(0, s.blasen.length - 220);
  stift.fillStyle = dolceAlpha('#ffe0b0', 0.65);
  for (let i = s.blasen.length - 1; i >= 0; i--) {
    const b = s.blasen[i];
    b.y -= b.v * hoehe * sekunden;
    b.x += Math.sin(b.y * 0.06) * 0.4;
    if (b.y < oben + glasB * 0.1) {
      s.blasen.splice(i, 1);
      continue;
    }
    stift.beginPath();
    stift.arc(b.x, b.y, b.r, 0, TAU);
    stift.fill();
  }

  // Eiswuerfel.
  for (let i = 0; i < 3; i++) {
    const y = oben + glasB * 0.4 + i * glasB * 0.34 + Math.sin(l.zeit * 1.3 + i) * 4;
    stift.save();
    stift.translate(mx + Math.sin(l.zeit * 0.7 + i * 2) * glasB * 0.2, y);
    stift.rotate(Math.sin(l.zeit * 0.5 + i) * 0.35);
    stift.fillStyle = dolceAlpha('#ffffff', 0.28);
    stift.fillRect(-glasB * 0.16, -glasB * 0.16, glasB * 0.32, glasB * 0.32);
    stift.strokeStyle = dolceAlpha('#ffffff', 0.45);
    stift.lineWidth = 1.5;
    stift.strokeRect(-glasB * 0.16, -glasB * 0.16, glasB * 0.32, glasB * 0.32);
    stift.restore();
  }
  stift.restore();

  // Glasrand.
  stift.strokeStyle = dolceAlpha(DOLCE_F.cremeHell, 0.6);
  stift.lineWidth = Math.max(1.5, glasB * 0.02);
  wand(0);
  stift.stroke();

  // Orangenscheibe am Rand.
  const or = glasB * 0.3;
  const ox = mx + glasB * 0.46;
  const oy = oben + or * 0.2;
  stift.fillStyle = '#f79a2e';
  stift.beginPath();
  stift.arc(ox, oy, or, 0, TAU);
  stift.fill();
  stift.strokeStyle = dolceAlpha('#ffd9a0', 0.9);
  stift.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const w = (i / 8) * TAU;
    stift.beginPath();
    stift.moveTo(ox, oy);
    stift.lineTo(ox + Math.cos(w) * or * 0.85, oy + Math.sin(w) * or * 0.85);
    stift.stroke();
  }
}

// --- Szene: Die Titelkarte ------------------------------------------------

function titelNeu() {
  return { konfetti: [], zeit: 0 };
}

function titelZeichnen(stift, l, s) {
  const { breite, hoehe, sekunden } = l;
  s.zeit += sekunden;
  stift.fillStyle = DOLCE_F.creme;
  stift.fillRect(0, 0, breite, hoehe);

  // Konfetti aus Zitronen und Oliven.
  if (l.neuerSchlag) {
    for (let i = 0; i < 3; i++) {
      s.konfetti.push({
        x: Math.random(),
        y: -0.05,
        v: 0.06 + Math.random() * 0.14,
        dreh: Math.random() * TAU,
        drehTempo: (Math.random() - 0.5) * 5,
        zitrone: Math.random() < 0.6,
        gross: 0.6 + Math.random() * 0.7,
      });
    }
  }
  if (s.konfetti.length > 110) s.konfetti.splice(0, s.konfetti.length - 160);
  const mass = Math.min(breite, hoehe);
  for (let i = s.konfetti.length - 1; i >= 0; i--) {
    const k = s.konfetti[i];
    k.y += k.v * sekunden;
    k.dreh += k.drehTempo * sekunden;
    if (k.y > 1.08) {
      s.konfetti.splice(i, 1);
      continue;
    }
    stift.save();
    stift.translate(k.x * breite, k.y * hoehe);
    stift.rotate(k.dreh);
    const gr = mass * 0.018 * k.gross;
    stift.fillStyle = k.zitrone ? DOLCE_F.zitrone : '#7f9440';
    stift.beginPath();
    stift.ellipse(0, 0, gr, gr * 0.72, 0, 0, TAU);
    stift.fill();
    stift.restore();
  }

  // Der Schriftzug. Er atmet mit dem Schlag, sonst steht er still - Schrift,
  // die dauernd wackelt, liest niemand.
  const puls = 1 + dolceSchlag(l.takt, 8) * 0.035;
  stift.save();
  stift.translate(breite / 2, hoehe * 0.46);
  stift.scale(puls, puls);
  stift.textAlign = 'center';
  stift.textBaseline = 'middle';

  stift.fillStyle = DOLCE_F.olivHell;
  stift.font = `600 ${Math.round(mass * 0.045)}px system-ui, -apple-system, sans-serif`;
  stift.letterSpacing = `${Math.round(mass * 0.012)}px`;
  stift.fillText('LA DOLCE TRENTA', 0, -mass * 0.22);

  stift.fillStyle = DOLCE_F.oliv;
  stift.font = `400 ${Math.round(mass * 0.36)}px Georgia, "Times New Roman", serif`;
  stift.letterSpacing = '0px';
  stift.fillText('30', 0, 0);

  // Die Zitrone an der Null - das Zeichen der Einladung.
  const zx = mass * 0.215;
  const zy = -mass * 0.155;
  const zr = mass * 0.05;
  stift.fillStyle = DOLCE_F.zitrone;
  stift.beginPath();
  stift.ellipse(zx, zy, zr, zr * 0.78, -0.3, 0, TAU);
  stift.fill();
  stift.fillStyle = DOLCE_F.basilikum;
  stift.beginPath();
  stift.ellipse(zx + zr * 0.5, zy - zr * 0.62, zr * 0.42, zr * 0.17, -0.7, 0, TAU);
  stift.fill();

  stift.fillStyle = DOLCE_F.oliv;
  stift.font = `400 ${Math.round(mass * 0.062)}px Georgia, "Times New Roman", serif`;
  stift.fillText('Florian wird drei\u00dfig', 0, mass * 0.25);
  stift.restore();
}

// --- Die Szenenfolge ------------------------------------------------------

const SZENEN = [
  { name: 'Der Wein', neu: weinNeu, zeichne: weinZeichnen },
  { name: 'Fliegende Oliven', neu: olivenNeu, zeichne: olivenZeichnen },
  { name: 'Meer und Sonne', neu: meerNeu, zeichne: meerZeichnen },
  { name: 'Pizza', neu: pizzaNeu, zeichne: pizzaZeichnen },
  { name: 'Fische', neu: fischeNeu, zeichne: fischeZeichnen },
  { name: 'Bruschetta', neu: brotNeu, zeichne: brotZeichnen },
  { name: 'Zitronen', neu: zitronenNeu, zeichne: zitronenZeichnen },
  { name: 'Caprese', neu: capreseNeu, zeichne: capreseZeichnen },
  { name: 'Spritz', neu: spritzNeu, zeichne: spritzZeichnen },
  { name: 'La Dolce Trenta', neu: titelNeu, zeichne: titelZeichnen },
];

export const DOLCE_SZENEN = SZENEN.map((s) => s.name);

// Wie lange eine Szene mindestens steht. Kuerzer wirkt hektisch - man soll
// sehen, was da passiert, nicht nur dass etwas passiert.
const MINDESTENS_S = 11;
const UEBERBLENDUNG_S = 0.7;

let jetzt = 0;
let vorher = -1;
let zustaende = [];
let seitWechsel = 0;
let blende = 1;
let letzterBeat = -1;
let tempoGemittelt = 2;
let letzteBeatZahl = null;
let reihenfolge = [];
// Nur fuer die Abnahme: haelt die Folge an - siehe dolceSzeneZwingen.
let gezwungen = false;

function naechsteSzene() {
  /*
   * Reihum aus einer gemischten Liste, nicht gewuerfelt.
   *
   * Gewuerfelt kaeme dieselbe Szene gelegentlich zweimal kurz hintereinander,
   * und ueber einen Abend blieben ein oder zwei ganz aus. Eine gemischte
   * Liste, die durchlaeuft und danach neu gemischt wird, zeigt jede Szene
   * gleich oft und trotzdem nie in derselben Reihenfolge.
   */
  if (reihenfolge.length === 0) {
    reihenfolge = SZENEN.map((_, i) => i);
    for (let i = reihenfolge.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [reihenfolge[i], reihenfolge[j]] = [reihenfolge[j], reihenfolge[i]];
    }
    if (reihenfolge[0] === jetzt && reihenfolge.length > 1) {
      [reihenfolge[0], reihenfolge[1]] = [reihenfolge[1], reihenfolge[0]];
    }
  }
  return reihenfolge.shift();
}

/*
 * Eine Szene festhalten. Nur fuer die Abnahme.
 *
 * Ohne das muesste ein Test warten, bis die Folge zufaellig bei der gesuchten
 * Szene ankommt - und daneben liegen, sobald ein Drop dazwischenkommt.
 */
export function dolceSzeneZwingen(nummer) {
  if (zustaende.length === 0) dolceZuruecksetzen();
  if (nummer !== jetzt) {
    jetzt = nummer;
    vorher = -1;
    blende = 1;
    zustaende[jetzt] = SZENEN[jetzt].neu();
  }
  /*
   * Und der Wechsel bleibt aus - auch beim Drop.
   *
   * Ohne die Sperre hat mich das eine Stunde gekostet: Der Drop im Testbild
   * liess die Folge weiterschalten, der naechste Aufruf zwang zurueck und
   * legte dabei den Zustand neu an. Auf dem Bild fehlten dann alle
   * Tomatenwuerfel und das ganze Konfetti - nicht weil sie nicht entstehen,
   * sondern weil sie eine halbe Sekunde vor der Aufnahme weggeraeumt wurden.
   */
  gezwungen = true;
  seitWechsel = Math.min(seitWechsel, MINDESTENS_S - 0.5);
}

/** Alles auf Anfang - beim Umschalten des Modus. */
export function dolceZuruecksetzen() {
  zustaende = SZENEN.map((s) => s.neu());
  jetzt = 0;
  vorher = -1;
  seitWechsel = 0;
  blende = 1;
  reihenfolge = [];
  letzteBeatZahl = null;
}

export function dolceZeichnen(stift, lage) {
  const { breite, hoehe, sekunden, takt } = lage;
  if (zustaende.length === 0) dolceZuruecksetzen();

  /*
   * Wie schnell laufen die Schlaege? Zwei Szenen rechnen ihre Flugbahnen
   * daraus - der Weintropfen und der Tomatenwuerfel muessen auf dem naechsten
   * Schlag ankommen, nicht ungefaehr dann.
   */
  if (takt) {
    if (letzteBeatZahl !== null && sekunden > 0) {
      const roh = (takt.beat - letzteBeatZahl) / sekunden;
      if (roh > 0.2 && roh < 20) tempoGemittelt = dolceMischen(tempoGemittelt, roh, 0.1);
    }
    letzteBeatZahl = takt.beat;
  }

  const neuerSchlag = Boolean(takt) && takt.nummer !== letzterBeat;
  if (takt) letzterBeat = takt.nummer;

  // --- Wechseln ---
  seitWechsel += sekunden;
  const langGenug = seitWechsel > MINDESTENS_S;
  const wechseln =
    !gezwungen && ((langGenug && takt?.aufPhrase && neuerSchlag) || (lage.drop && seitWechsel > 4));
  if (wechseln) {
    vorher = jetzt;
    jetzt = naechsteSzene();
    // Die neue Szene faengt frisch an - sonst stehen Tropfen und Blasen von
    // vor zwei Minuten im Bild.
    zustaende[jetzt] = SZENEN[jetzt].neu();
    seitWechsel = 0;
    blende = 0;
  }
  if (blende < 1) blende = Math.min(1, blende + sekunden / UEBERBLENDUNG_S);

  const l = { ...lage, neuerSchlag, beatTempo: tempoGemittelt };

  // Die abgehende Szene laeuft weiter, damit die Ueberblendung nicht in ein
  // Standbild geht.
  if (blende < 1 && vorher >= 0) {
    SZENEN[vorher].zeichne(stift, { ...l, neuerSchlag: false }, zustaende[vorher]);
    stift.globalAlpha = blende;
  }
  SZENEN[jetzt].zeichne(stift, l, zustaende[jetzt]);
  stift.globalAlpha = 1;

  // Die Markise ueber allem - sie haelt die zehn Bilder zusammen.
  markiseZeichnen(stift, breite, hoehe, Math.max(14, hoehe * 0.035));

  // Und unten, klein, der Name der Szene. Beim Wechsel kurz sichtbar, danach
  // verschwindet er - man soll das Bild ansehen, nicht die Beschriftung.
  const zeigen = Math.max(0, 1 - seitWechsel / 2.6);
  if (zeigen > 0.01) {
    stift.save();
    stift.globalAlpha = zeigen * 0.85;
    stift.fillStyle = DOLCE_F.cremeHell;
    stift.font = `600 ${Math.round(Math.min(breite, hoehe) * 0.026)}px system-ui, sans-serif`;
    stift.textAlign = 'center';
    stift.letterSpacing = `${Math.round(Math.min(breite, hoehe) * 0.006)}px`;
    stift.fillText(SZENEN[jetzt].name.toUpperCase(), breite / 2, hoehe - hoehe * 0.045);
    stift.restore();
  }

  gezwungen = false;

  if (typeof window !== 'undefined') {
    window.__dolce = { szene: SZENEN[jetzt].name, seitWechsel, beatTempo: tempoGemittelt };
  }
}
