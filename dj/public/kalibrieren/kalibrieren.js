// Den Beamer einmessen.
//
// Drei Schritte, und zwischen ihnen liegt ein Foto:
//
//   1. Der Beamer wirft ein Testbild mit vier nummerierten Ecken.
//   2. Jemand fotografiert die Wand - von dort, wo abends die Gaeste stehen.
//   3. Auf dem Foto werden die vier Ecken angeklickt, und danach die
//      Architektur nachgezeichnet: Fenster, Tueren, Kanten, Totzonen.
//
// Aus den vier Ecken folgt die projektive Abbildung zwischen Beamerbild und
// Foto. Weil die Fassade auf demselben Foto steht, ist sie damit automatisch
// in derselben Rechnung - wo die Kamera stand, kuerzt sich heraus.
//
// --- Die Selbstkontrolle ----------------------------------------------------
//
// Der wichtigste Teil dieser Seite ist nicht die Rechnung, sondern das
// Pruefraster: Sobald die vier Ecken sitzen, wird das *ganze* Testbild - alle
// Rasterlinien, nicht nur die Ecken - in das Foto zurueckgerechnet und
// darueber gelegt. Deckt es sich mit dem echten Raster auf der Wand, stimmt
// die Messung. Deckt es sich nicht, hat jemand danebengeklickt.
//
// Das ist wichtig, weil ein Fehler hier sonst erst abends auffiele, wenn die
// Mandalas neben den Fenstern landen. Vier Ecken legen die Abbildung
// *exakt* fest - sie gehen also immer durch, egal wie falsch sie sind. Erst
// die *fuenfte* Information, das Raster dazwischen, kann widersprechen.

import { homographie, anwenden, umkehren, viereckPruefen, imVieleck } from '/gemeinsam/homographie.js';

const $ = (id) => document.getElementById(id);

/* --- Zustand -------------------------------------------------------------- */

const stand = {
  beamer: { breite: 1920, hoehe: 1080 },
  // Die vier Ecken, in Bildpunkten des Fotos.
  marken: [],
  // Die Bereiche: { art, name, punkte: [[x,y], ...] } in Foto-Bildpunkten.
  bereiche: [],
  // Der Bereich, an dem gerade gezeichnet wird.
  entwurf: null,
  modus: 'marken',
  foto: null,
  fotoBreite: 0,
  fotoHoehe: 0,
};

/*
 * Wo die Marken im Beamerbild sitzen, in Anteilen.
 *
 * Zehn Prozent Rand: nicht ganz am Bildrand, weil dort die Optik des Beamers
 * am unschaerfsten ist und die Ecke dann schwer genau anzuklicken waere. Und
 * nicht weiter innen, weil die vier Punkte moeglichst weit auseinanderliegen
 * sollen - je groesser das Viereck, desto weniger wirkt sich ein ungenauer
 * Klick aus.
 */
const MARKEN_ANTEIL = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]];
const MARKEN_NAMEN = ['1 oben links', '2 oben rechts', '3 unten rechts', '4 unten links'];

const ARTEN = {
  fenster: { farbe: '#4fa3ff', name: 'Fenster' },
  tuer: { farbe: '#ffb86b', name: 'Tür' },
  kante: { farbe: '#c48bff', name: 'Kante' },
  flaeche: { farbe: '#6bd98a', name: 'Fläche' },
  tot: { farbe: '#ff6b6b', name: 'Totzone' },
  /*
   * Der Gitterkasten.
   *
   * Die interessanteste Flaeche des ganzen Raumes und der Grund, warum es
   * diese Art ueberhaupt gibt. Ein Kasten voller Flaschen ist naemlich
   * dreierlei zugleich:
   *
   *   - ein *Raster*. Das Drahtgitter und die Flaschenboeden bilden ein
   *     regelmaessiges Feld - eine gebaute Punktmatrix, die man ansprechen
   *     kann wie eine Anzeigetafel.
   *   - eine *glaenzende* Flaeche. Verzinkter Stahl wirft Licht gerichtet
   *     zurueck, nicht diffus wie eine Wand. Ein kleiner heller Fleck darauf
   *     blitzt, wo derselbe Fleck auf der Holzwand nur ein Fleck waere.
   *   - *neutral grau*. Das ist der eigentliche Schatz in diesem Raum: Der
   *     Stahl gibt Farben ungefaelscht wieder, die orange Holzwand nicht.
   *
   * Deshalb braucht diese Art als einzige zwei Zusatzangaben: wie viele
   * Faecher der Kasten breit und hoch ist.
   */
  gitterbox: { farbe: '#7fe6d8', name: 'Gitterkasten', raster: true, ecken: 4 },
  /*
   * Ein Deckenbalken. Linear wie eine Kante, aber ueber Kopf und meist zu
   * mehreren parallel - eigene Art, damit ein Lauflicht sie der Reihe nach
   * nehmen kann statt alle zugleich.
   */
  balken: { farbe: '#ffd479', name: 'Balken' },
  /*
   * Eine Raumkante, an der die Flaeche knickt.
   *
   * Keine Flaeche, sondern eine Grenze: Was ueber sie hinweglaeuft, bricht
   * fuer jeden Betrachter sichtbar auseinander, weil dahinter eine andere
   * Ebene liegt. Die Homographie gilt immer nur fuer *eine* Ebene.
   */
  knick: { farbe: '#ff8ad4', name: 'Knick' },
};

/** Arten, die genau vier Ecken brauchen - sonst gibt es kein Raster. */
const VIERECKIG = Object.entries(ARTEN)
  .filter(([, a]) => a.ecken === 4).map(([k]) => k);

/* --- Das Testbild --------------------------------------------------------- */

/**
 * Das Testbild zeichnen.
 *
 * Was darauf steht, ist jeweils fuer eine bestimmte Frage da:
 *
 *   Vier nummerierte Ecken  die vier Punktpaare fuer die Abbildung
 *   Ein feines Raster       die Selbstkontrolle - deckt sich das Zurueck-
 *                           gerechnete damit, stimmt die Messung
 *   Randlinie               zeigt, was der Beamer ueberhaupt erreicht
 *   Kreuz in der Mitte      zum Ausrichten des Beamers
 *   Diagonalen              machen eine Drehung sofort sichtbar
 *
 * Alles in Weiss auf Schwarz: Ein Beamer ist im Dunkeln eine Lichtquelle,
 * und was er nicht beleuchtet, bleibt schwarz. Farbige Marken waeren auf
 * einer roten Ziegelwand schlechter zu erkennen als weisse.
 */
export function testbildZeichnen(stift, breite, hoehe) {
  stift.fillStyle = '#000';
  stift.fillRect(0, 0, breite, hoehe);

  const strich = Math.max(1, Math.round(Math.min(breite, hoehe) / 900));

  // Raster, alle fuenf Prozent.
  stift.strokeStyle = 'rgba(255,255,255,0.28)';
  stift.lineWidth = strich;
  stift.beginPath();
  for (let k = 1; k < 20; k++) {
    const x = (k / 20) * breite;
    const y = (k / 20) * hoehe;
    stift.moveTo(x, 0); stift.lineTo(x, hoehe);
    stift.moveTo(0, y); stift.lineTo(breite, y);
  }
  stift.stroke();

  // Jede zehnte Linie heller - sonst verzaehlt man sich beim Vergleichen.
  stift.strokeStyle = 'rgba(255,255,255,0.6)';
  stift.lineWidth = strich * 2;
  stift.beginPath();
  for (let k = 1; k < 4; k++) {
    stift.moveTo((k / 4) * breite, 0); stift.lineTo((k / 4) * breite, hoehe);
    stift.moveTo(0, (k / 4) * hoehe); stift.lineTo(breite, (k / 4) * hoehe);
  }
  stift.stroke();

  // Diagonalen: eine gekippte Projektion sieht man daran sofort.
  stift.strokeStyle = 'rgba(255,255,255,0.22)';
  stift.lineWidth = strich;
  stift.beginPath();
  stift.moveTo(0, 0); stift.lineTo(breite, hoehe);
  stift.moveTo(breite, 0); stift.lineTo(0, hoehe);
  stift.stroke();

  // Der Rand des Beamerbildes.
  stift.strokeStyle = 'rgba(255,255,255,0.85)';
  stift.lineWidth = strich * 3;
  stift.strokeRect(strich * 1.5, strich * 1.5, breite - strich * 3, hoehe - strich * 3);

  // Das Kreuz in der Mitte.
  const r = Math.min(breite, hoehe) * 0.06;
  stift.strokeStyle = '#fff';
  stift.lineWidth = strich * 2;
  stift.beginPath();
  stift.moveTo(breite / 2 - r, hoehe / 2); stift.lineTo(breite / 2 + r, hoehe / 2);
  stift.moveTo(breite / 2, hoehe / 2 - r); stift.lineTo(breite / 2, hoehe / 2 + r);
  stift.arc(breite / 2, hoehe / 2, r * 0.55, 0, Math.PI * 2);
  stift.stroke();

  /*
   * Die vier Marken.
   *
   * Ein Fadenkreuz in einem Ring, und die Ziffer *daneben* statt darin: Der
   * anzuklickende Punkt muss frei bleiben, sonst verdeckt die eigene Ziffer
   * genau die Stelle, auf die es ankommt.
   */
  const ring = Math.min(breite, hoehe) * 0.035;
  stift.font = `700 ${Math.round(ring * 1.1)}px system-ui, sans-serif`;
  MARKEN_ANTEIL.forEach(([ax, ay], i) => {
    const x = ax * breite;
    const y = ay * hoehe;
    stift.strokeStyle = '#fff';
    stift.lineWidth = strich * 2;
    stift.beginPath();
    stift.arc(x, y, ring, 0, Math.PI * 2);
    stift.moveTo(x - ring * 1.6, y); stift.lineTo(x + ring * 1.6, y);
    stift.moveTo(x, y - ring * 1.6); stift.lineTo(x, y + ring * 1.6);
    stift.stroke();
    stift.fillStyle = '#fff';
    stift.beginPath();
    stift.arc(x, y, strich * 2.5, 0, Math.PI * 2);
    stift.fill();
    stift.textAlign = ax < 0.5 ? 'left' : 'right';
    stift.textBaseline = ay < 0.5 ? 'top' : 'bottom';
    const vx = x + (ax < 0.5 ? ring * 2 : -ring * 2);
    const vy = y + (ay < 0.5 ? ring * 2 : -ring * 2);
    stift.fillText(String(i + 1), vx, vy);
  });
}

/* --- Seiten umschalten ---------------------------------------------------- */

const seiten = { Testbild: 'seiteTestbild', Vermessen: 'seiteVermessen', Fertig: 'seiteFertig' };
function seiteZeigen(name) {
  for (const [n, id] of Object.entries(seiten)) {
    $(id).hidden = n !== name;
    $(`tab${n}`).classList.toggle('an', n === name);
  }
  if (name === 'Fertig') berichtBauen();
}
for (const n of Object.keys(seiten)) $(`tab${n}`).addEventListener('click', () => seiteZeigen(n));

/* --- Testbild-Seite ------------------------------------------------------- */

function aufloesungLesen() {
  const w = $('aufloesung').value;
  if (w === 'eigen') {
    return { breite: window.screen.width * devicePixelRatio, hoehe: window.screen.height * devicePixelRatio };
  }
  const [b, h] = w.split('x').map(Number);
  return { breite: b, hoehe: h };
}

function vorschauZeichnen() {
  stand.beamer = aufloesungLesen();
  const c = $('testVorschau');
  c.height = Math.round((c.width * stand.beamer.hoehe) / stand.beamer.breite);
  testbildZeichnen(c.getContext('2d'), c.width, c.height);
  standSetzen();
}
$('aufloesung').addEventListener('change', vorschauZeichnen);

$('vollbild').addEventListener('click', async () => {
  const halter = $('vollbildschirm');
  halter.hidden = false;
  try { await halter.requestFullscreen?.(); } catch { /* Vollbild abgelehnt - egal */ }
  const c = $('testbild');
  /*
   * Die Leinwand bekommt so viele echte Bildpunkte, wie der Bildschirm hat.
   * Ohne devicePixelRatio waeren die Linien auf einem hochaufloesenden
   * Bildschirm weichgezeichnet - und eine weichgezeichnete Marke laesst sich
   * schlechter genau anklicken.
   */
  c.width = Math.round(halter.clientWidth * devicePixelRatio);
  c.height = Math.round(halter.clientHeight * devicePixelRatio);
  testbildZeichnen(c.getContext('2d'), c.width, c.height);
});

function vollbildBeenden() {
  $('vollbildschirm').hidden = true;
  if (document.fullscreenElement) document.exitFullscreen?.();
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('vollbildschirm').hidden) vollbildBeenden();
});
$('vollbildschirm').addEventListener('click', vollbildBeenden);

/* --- Die Farbe der Oberflaeche -------------------------------------------- */

/*
 * Warum das ueberhaupt gemessen wird.
 *
 * Ein Beamer *addiert* Licht zu dem, was die Flaeche ohnehin zurueckwirft.
 * Auf einer weissen Leinwand ist das egal. Auf einer Grobspanplatte nicht:
 * Die wirft warmes Orange zurueck und schluckt Blau fast vollstaendig. Ein
 * blauer Kegel darauf wird nicht blau, sondern schmutzig grau.
 *
 * Die Forschung dazu heisst radiometrische Kompensation und rechnet je
 * Bildpunkt gegen: Man misst, was die Flaeche mit jedem Kanal macht, und
 * verstaerkt vorher das, was sie schluckt. Das funktioniert - und es kostet
 * genau das, was es verspricht: Helligkeit. Wer Blau auf Orange durchsetzen
 * will, muss Rot und Gruen herunterziehen, und uebrig bleibt ein dunkles
 * Bild. Ausserdem laeuft die Rechnung aus dem Bereich, den der Beamer
 * ueberhaupt darstellen kann, und clippt dann sichtbar.
 *
 * Deshalb wird hier *gemessen, aber nicht kompensiert*. Die Farbe geht in
 * die Messung, und die Bildseite entscheidet damit die viel wirksamere
 * Frage: Welche Farben soll man auf dieser Flaeche ueberhaupt zeigen? Siehe
 * oberflaeche.js.
 *
 * Gemessen wird der *Median* je Kanal und nicht der Mittelwert. Eine
 * Holzwand hat helle Spaene und dunkle Fugen, ein Gitterkasten hat blitzende
 * Draehte vor schwarzem Glas - ein Mittelwert liesse sich von wenigen sehr
 * hellen Punkten verziehen, der Median nicht.
 */
let fotoStift = null;

function fotoInsRaster() {
  const bild = $('foto');
  if (!bild.naturalWidth) return null;
  if (fotoStift && fotoStift.canvas.dataset.quelle === bild.src) return fotoStift;
  const c = document.createElement('canvas');
  // Klein reicht: Gesucht ist eine Farbe, keine Textur.
  const grosse = 640;
  const f = Math.min(1, grosse / bild.naturalWidth);
  c.width = Math.max(1, Math.round(bild.naturalWidth * f));
  c.height = Math.max(1, Math.round(bild.naturalHeight * f));
  c.dataset.quelle = bild.src;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bild, 0, 0, c.width, c.height);
  fotoStift = g;
  return g;
}

/**
 * Die Medianfarbe innerhalb eines Vielecks (Punkte in Foto-Bildpunkten).
 * Ohne Vieleck: das ganze Foto.
 */
function oberflaecheMessen(punkte = null) {
  const g = fotoInsRaster();
  if (!g) return null;
  const { width: B, height: H } = g.canvas;
  const d = g.getImageData(0, 0, B, H).data;
  const anteilig = punkte
    ? punkte.map(([x, y]) => [x / stand.fotoBreite, y / stand.fotoHoehe])
    : null;
  const r = [];
  const gr = [];
  const bl = [];
  // Hoechstens rund 4000 Proben - mehr aendert am Median nichts.
  const schritt = Math.max(1, Math.round(Math.sqrt((B * H) / 4000)));
  for (let y = 0; y < H; y += schritt) {
    for (let x = 0; x < B; x += schritt) {
      if (anteilig && !imVieleck([x / B, y / H], anteilig)) continue;
      const k = (y * B + x) * 4;
      r.push(d[k]); gr.push(d[k + 1]); bl.push(d[k + 2]);
    }
  }
  if (r.length < 8) return null;
  const mitte = (a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; };
  return [mitte(r), mitte(gr), mitte(bl)];
}

/* --- Foto laden ----------------------------------------------------------- */

$('fotoWahl').addEventListener('change', (e) => {
  const datei = e.target.files?.[0];
  if (!datei) return;
  const bild = $('foto');
  bild.onload = () => {
    stand.fotoBreite = bild.naturalWidth;
    stand.fotoHoehe = bild.naturalHeight;
    bild.hidden = false;
    stand.marken = [];
    stand.bereiche = [];
    stand.entwurf = null;
    fotoStift = null;
    stand.grundfarbe = oberflaecheMessen();
    neuZeichnen();
    const f = stand.grundfarbe;
    melden(`Foto geladen, ${bild.naturalWidth} × ${bild.naturalHeight}.`
      + (f ? ` Oberflaeche gemessen: rgb(${f.join(' ')}).` : '')
      + ' Jetzt die vier Ecken des Testbildes anklicken – 1, 2, 3, 4.');
  };
  bild.src = URL.createObjectURL(datei);
});

/* --- Klicken -------------------------------------------------------------- */

/*
 * Ein Klick wird in *Foto*-Bildpunkte umgerechnet und nicht in Bildschirm-
 * punkte gespeichert. Sonst haenge die ganze Messung daran, wie breit das
 * Browserfenster gerade war - und beim naechsten Oeffnen waere alles
 * verschoben.
 */
function klickPunkt(ereignis) {
  const c = $('markierung');
  const r = c.getBoundingClientRect();
  const x = ((ereignis.clientX - r.left) / r.width) * stand.fotoBreite;
  const y = ((ereignis.clientY - r.top) / r.height) * stand.fotoHoehe;
  return [x, y];
}

$('markierung').addEventListener('click', (e) => {
  if (!stand.fotoBreite) return melden('Erst ein Foto laden.');
  const p = klickPunkt(e);
  if (stand.modus === 'marken') {
    if (stand.marken.length >= 4) {
      return melden('Alle vier Ecken sitzen. Zum Ändern "Zurück" drücken.');
    }
    stand.marken.push(p);
    if (stand.marken.length === 4) {
      const klage = viereckPruefen(stand.marken);
      if (klage) {
        melden(`${klage}. Mit "Zurück" die letzte Ecke wegnehmen.`);
      } else {
        melden('Alle vier Ecken sitzen. Deckt sich das grüne Prüfraster mit dem ' +
          'echten Raster auf der Wand? Dann stimmt die Messung.', true);
      }
    } else {
      melden(`Jetzt Ecke ${MARKEN_NAMEN[stand.marken.length]} anklicken.`);
    }
  } else {
    if (!stand.entwurf) stand.entwurf = { art: $('bereichsart').value, name: '', punkte: [] };
    stand.entwurf.punkte.push(p);
    $('bereichFertig').disabled = stand.entwurf.punkte.length < 3;
    melden(`${stand.entwurf.punkte.length} Punkte. Bei mindestens drei lässt sich der Bereich schließen.`);
  }
  neuZeichnen();
});

$('modusMarken').addEventListener('click', () => moduswechsel('marken'));
$('modusBereich').addEventListener('click', () => moduswechsel('bereich'));
function moduswechsel(m) {
  stand.modus = m;
  $('modusMarken').classList.toggle('an', m === 'marken');
  $('modusBereich').classList.toggle('an', m === 'bereich');
  melden(m === 'marken' ? 'Die vier Ecken des Testbildes anklicken.'
    : 'Bereich umfahren: klicken, klicken, klicken – dann schließen.');
}

$('bereichFertig').addEventListener('click', () => {
  if (!stand.entwurf || stand.entwurf.punkte.length < 3) return;
  /*
   * Ein Gitterkasten muss vier Ecken haben, sonst gibt es keine Abbildung
   * vom Einheitsquadrat auf ihn - und ohne die kein Raster. Lieber hier
   * abfangen als spaeter ein Feld, das nur ungefaehr sitzt.
   */
  if (VIERECKIG.includes(stand.entwurf.art) && stand.entwurf.punkte.length !== 4) {
    return melden(`${ARTEN[stand.entwurf.art].name}: genau vier Ecken setzen, `
      + `im Uhrzeigersinn ab oben links (gerade ${stand.entwurf.punkte.length}).`);
  }
  if (ARTEN[stand.entwurf.art].raster) {
    stand.entwurf.spalten = Math.max(1, Math.round(Number($('rasterSpalten').value) || 10));
    stand.entwurf.reihen = Math.max(1, Math.round(Number($('rasterReihen').value) || 6));
  }
  // Jeder Bereich bekommt seine eigene gemessene Farbe. Ein Gitterkasten ist
  // grau, die Wand daneben orange - ein Wert fuer beides waere fuer keinen
  // von beiden richtig.
  stand.entwurf.farbe = oberflaecheMessen(stand.entwurf.punkte);
  const art = ARTEN[stand.entwurf.art].name;
  const zahl = stand.bereiche.filter((b) => b.art === stand.entwurf.art).length + 1;
  stand.entwurf.name = `${art} ${zahl}`;
  stand.bereiche.push(stand.entwurf);
  stand.entwurf = null;
  $('bereichFertig').disabled = true;
  listeBauen();
  neuZeichnen();
  melden('Bereich gespeichert.', true);
});

$('rueckgaengig').addEventListener('click', () => {
  if (stand.entwurf?.punkte.length) {
    stand.entwurf.punkte.pop();
    if (!stand.entwurf.punkte.length) stand.entwurf = null;
    $('bereichFertig').disabled = !stand.entwurf || stand.entwurf.punkte.length < 3;
  } else if (stand.modus === 'marken' && stand.marken.length) {
    stand.marken.pop();
  } else if (stand.bereiche.length) {
    stand.bereiche.pop();
    listeBauen();
  }
  neuZeichnen();
});

$('allesLoeschen').addEventListener('click', () => {
  stand.marken = [];
  stand.bereiche = [];
  stand.entwurf = null;
  listeBauen();
  neuZeichnen();
  melden('Alles gelöscht.');
});

$('rasterZeigen').addEventListener('change', neuZeichnen);
$('bereichsart').addEventListener('change', () => {
  rasterFelderZeigen();
  moduswechsel('bereich');
});

/** Die zwei Zahlenfelder gibt es nur fuer Arten, die ein Raster haben. */
function rasterFelderZeigen() {
  const art = ARTEN[$('bereichsart').value];
  $('rasterFelder').hidden = !art?.raster;
}
rasterFelderZeigen();

/* --- Zeichnen ------------------------------------------------------------- */

function neuZeichnen() {
  const c = $('markierung');
  if (!stand.fotoBreite) { c.width = 1; c.height = 1; return; }
  c.width = stand.fotoBreite;
  c.height = stand.fotoHoehe;
  const s = c.getContext('2d');
  const dick = Math.max(2, stand.fotoBreite / 500);

  // Das Pruefraster: das ganze Testbild, ins Foto zurueckgerechnet.
  if (stand.marken.length === 4 && $('rasterZeigen').checked && !viereckPruefen(stand.marken)) {
    rasterZeichnen(s, dick);
  }

  // Die Bereiche.
  for (const b of [...stand.bereiche, ...(stand.entwurf ? [stand.entwurf] : [])]) {
    const farbe = ARTEN[b.art].farbe;
    s.strokeStyle = farbe;
    s.fillStyle = `${farbe}22`;
    s.lineWidth = dick;
    s.beginPath();
    b.punkte.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    if (b !== stand.entwurf) s.closePath();
    s.fill();
    s.stroke();
    for (const [x, y] of b.punkte) {
      s.fillStyle = farbe;
      s.beginPath();
      s.arc(x, y, dick * 1.6, 0, Math.PI * 2);
      s.fill();
    }
    if (b.name) {
      const mx = b.punkte.reduce((a, p) => a + p[0], 0) / b.punkte.length;
      const my = b.punkte.reduce((a, p) => a + p[1], 0) / b.punkte.length;
      s.fillStyle = '#fff';
      s.font = `600 ${Math.round(dick * 7)}px system-ui, sans-serif`;
      s.textAlign = 'center';
      s.textBaseline = 'middle';
      s.fillText(b.name, mx, my);
    }
  }

  // Die vier Ecken, zuletzt - sie sollen ueber allem liegen.
  stand.marken.forEach(([x, y], i) => {
    s.strokeStyle = '#ffdf5d';
    s.lineWidth = dick;
    s.beginPath();
    s.arc(x, y, dick * 5, 0, Math.PI * 2);
    s.moveTo(x - dick * 9, y); s.lineTo(x + dick * 9, y);
    s.moveTo(x, y - dick * 9); s.lineTo(x, y + dick * 9);
    s.stroke();
    s.fillStyle = '#ffdf5d';
    s.font = `700 ${Math.round(dick * 8)}px system-ui, sans-serif`;
    s.textAlign = 'left';
    s.textBaseline = 'top';
    s.fillText(String(i + 1), x + dick * 6, y + dick * 6);
  });

  $('markenZahl').textContent = `${stand.marken.length}/4`;
  standSetzen();
}

/**
 * Das Pruefraster.
 *
 * Hier steckt der eigentliche Wert dieser Seite. Vier Punktpaare legen eine
 * Homographie *exakt* fest - sie geht immer durch alle vier hindurch, egal
 * wie falsch geklickt wurde. Ein Passfehler waere also immer null und saegte
 * nichts aus.
 *
 * Die Rasterlinien dazwischen sind dagegen Information, die in der Rechnung
 * *nicht* steckt. Legt man sie ueber das Foto und sie decken sich mit dem
 * echten Raster auf der Wand, dann war nicht nur die Rechnung richtig,
 * sondern auch das Anklicken. Deckt es sich nicht, sieht man es sofort - und
 * nicht erst abends.
 */
function rasterZeichnen(s, dick) {
  const B = stand.beamer;
  const H = homographie(
    MARKEN_ANTEIL.map(([x, y]) => [x * B.breite, y * B.hoehe]),
    stand.marken,
  );
  if (!H) return;
  const p = (x, y) => anwenden(H, [x, y]);

  s.strokeStyle = 'rgba(80,255,140,0.55)';
  s.lineWidth = dick * 0.7;
  s.beginPath();
  for (let k = 0; k <= 20; k++) {
    const a = p((k / 20) * B.breite, 0);
    const b = p((k / 20) * B.breite, B.hoehe);
    s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]);
    const c = p(0, (k / 20) * B.hoehe);
    const d = p(B.breite, (k / 20) * B.hoehe);
    s.moveTo(c[0], c[1]); s.lineTo(d[0], d[1]);
  }
  s.stroke();

  // Der Rand des Beamerbildes, kraeftiger: Was ausserhalb liegt, erreicht der
  // Beamer nicht - dort hat es keinen Sinn, etwas zu planen.
  s.strokeStyle = 'rgba(80,255,140,0.95)';
  s.lineWidth = dick * 1.6;
  s.beginPath();
  [[0, 0], [B.breite, 0], [B.breite, B.hoehe], [0, B.hoehe]].forEach(([x, y], i) => {
    const q = p(x, y);
    if (i) s.lineTo(q[0], q[1]); else s.moveTo(q[0], q[1]);
  });
  s.closePath();
  s.stroke();
}

function listeBauen() {
  const ol = $('bereichsliste');
  ol.innerHTML = '';
  $('listeLeer').hidden = stand.bereiche.length > 0;
  stand.bereiche.forEach((b, i) => {
    const li = document.createElement('li');
    const punkt = document.createElement('span');
    punkt.className = 'marke-art';
    punkt.style.background = ARTEN[b.art].farbe;
    li.append(punkt, document.createTextNode(`${b.name} (${b.punkte.length})`));
    const weg = document.createElement('button');
    weg.textContent = '×';
    weg.title = 'Diesen Bereich löschen';
    weg.addEventListener('click', () => {
      stand.bereiche.splice(i, 1);
      listeBauen();
      neuZeichnen();
    });
    li.append(weg);
    ol.append(li);
  });
}

function melden(text, gut = false) {
  $('melde').textContent = text;
  $('melde').classList.toggle('gut', gut);
}

function standSetzen() {
  const teile = [`${stand.beamer.breite}×${stand.beamer.hoehe}`];
  if (stand.fotoBreite) teile.push(`Foto ${stand.fotoBreite}×${stand.fotoHoehe}`);
  teile.push(`${stand.marken.length}/4 Ecken`);
  if (stand.bereiche.length) teile.push(`${stand.bereiche.length} Bereiche`);
  $('stand').textContent = teile.join(' · ');
}

/* --- Ergebnis ------------------------------------------------------------- */

/**
 * Die Kalibrierung, wie die Buehne sie braucht.
 *
 * Alles in *Anteilen* und nicht in Bildpunkten. Damit ueberlebt die Messung
 * eine andere Bildschirmgroesse, ein anderes Foto und eine andere
 * Beameraufloesung - was zaehlt, ist die Geometrie, nicht die Zahl der
 * Bildpunkte, mit der jemand sie zufaellig aufgenommen hat.
 */
export function kalibrierungBauen(s = stand) {
  if (s.marken.length !== 4) return null;
  const anteilig = s.marken.map(([x, y]) => [x / s.fotoBreite, y / s.fotoHoehe]);
  return {
    fassung: 1,
    erstellt: new Date().toISOString(),
    beamer: { ...s.beamer },
    fotoSeitenverhaeltnis: s.fotoBreite / s.fotoHoehe,
    // Wo die Marken des Beamerbildes im Foto liegen, in Anteilen des Fotos.
    marken: anteilig,
    markenImBeamer: MARKEN_ANTEIL,
    bereiche: s.bereiche.map((b) => ({
      art: b.art,
      name: b.name,
      punkte: b.punkte.map(([x, y]) => [x / s.fotoBreite, y / s.fotoHoehe]),
      ...(b.spalten ? { spalten: b.spalten, reihen: b.reihen } : {}),
      ...(b.farbe ? { farbe: b.farbe } : {}),
    })),
    // Die gemessene Farbe der Hauptflaeche - siehe oberflaecheMessen().
    grundfarbe: s.grundfarbe ?? null,
  };
}

function berichtBauen() {
  const k = kalibrierungBauen();
  const b = $('bericht');
  b.innerHTML = '';
  const zeile = (was, wert) => {
    const dt = document.createElement('dt');
    dt.textContent = was;
    const dd = document.createElement('dd');
    dd.innerHTML = wert;
    b.append(dt, dd);
  };
  if (!k) {
    zeile('Stand', 'Noch keine vier Ecken gesetzt.');
    $('speichern').disabled = true;
    $('herunterladen').disabled = true;
    return;
  }
  $('speichern').disabled = false;
  $('herunterladen').disabled = false;

  const H = homographie(k.markenImBeamer, k.marken);
  const R = umkehren(H);
  /*
   * Wie viel des Fotos erreicht der Beamer ueberhaupt? Das ist die Zahl, die
   * abends darueber entscheidet, ob eine Idee umsetzbar ist: Ein Fenster
   * ausserhalb des Beamerbildes bleibt dunkel, egal wie schoen der Entwurf
   * ist.
   */
  let drin = 0;
  let gesamt = 0;
  for (let x = 0.005; x < 1; x += 0.01) {
    for (let y = 0.005; y < 1; y += 0.01) {
      gesamt++;
      const [u, v] = anwenden(R, [x, y]);
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) drin++;
    }
  }
  zeile('Beamer', `${k.beamer.breite} × ${k.beamer.hoehe}`);
  zeile('Vom Foto erreicht', `<b>${((drin / gesamt) * 100).toFixed(0)} %</b>`);
  zeile('Bereiche', k.bereiche.length
    ? Object.entries(k.bereiche.reduce((a, x) => ({ ...a, [x.art]: (a[x.art] ?? 0) + 1 }), {}))
      .map(([art, n]) => `${n}× ${ARTEN[art].name}`).join(', ')
    : '<em>keine</em>');

  // Jeden Bereich daraufhin ansehen, ob der Beamer ihn ueberhaupt trifft.
  const draussen = k.bereiche.filter((ber) => ber.punkte.some((p) => {
    const [u, v] = anwenden(R, p);
    return u < 0 || u > 1 || v < 0 || v > 1;
  }));
  if (draussen.length) {
    zeile('Achtung', `<b style="color:#ffb86b">${draussen.map((d) => d.name).join(', ')}</b> ` +
      'liegen ganz oder teilweise außerhalb des Beamerbildes.');
  }

  const c = $('ergebnisVorschau');
  const st = c.getContext('2d');
  c.height = Math.round((c.width * k.beamer.hoehe) / k.beamer.breite);
  st.fillStyle = '#000';
  st.fillRect(0, 0, c.width, c.height);
  // Die Bereiche, in Beamerkoordinaten - also so, wie sie das Bild verlassen.
  for (const ber of k.bereiche) {
    st.strokeStyle = ARTEN[ber.art].farbe;
    st.fillStyle = `${ARTEN[ber.art].farbe}33`;
    st.lineWidth = 2;
    st.beginPath();
    ber.punkte.forEach((p, i) => {
      const [u, v] = anwenden(R, p);
      const x = u * c.width;
      const y = v * c.height;
      if (i) st.lineTo(x, y); else st.moveTo(x, y);
    });
    st.closePath();
    st.fill();
    st.stroke();
  }
  st.strokeStyle = 'rgba(255,255,255,0.35)';
  st.lineWidth = 1;
  st.strokeRect(0.5, 0.5, c.width - 1, c.height - 1);
}

const SCHLUESSEL = 'djBeamerKalibrierung';

$('speichern').addEventListener('click', () => {
  const k = kalibrierungBauen();
  if (!k) return;
  localStorage.setItem(SCHLUESSEL, JSON.stringify(k));
  melden('Gespeichert. Die Bühne benutzt es beim nächsten Start.', true);
  $('speichern').textContent = 'Gespeichert ✓';
  setTimeout(() => { $('speichern').textContent = 'Auf diesem Gerät speichern'; }, 2500);
});

$('herunterladen').addEventListener('click', () => {
  const k = kalibrierungBauen();
  if (!k) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(k, null, 1)], { type: 'application/json' }));
  a.download = 'beamer-kalibrierung.json';
  a.click();
});

$('ladenWahl').addEventListener('change', async (e) => {
  const datei = e.target.files?.[0];
  if (!datei) return;
  try {
    const k = JSON.parse(await datei.text());
    if (k.fassung !== 1 || !Array.isArray(k.marken)) throw new Error('unbekanntes Format');
    stand.beamer = k.beamer;
    // Ohne Foto gibt es keine Bildpunkte - dann in Anteilen mal 1000 rechnen,
    // damit sich die Werte wenigstens ansehen und weiterreichen lassen.
    const B = stand.fotoBreite || 1000;
    const Hh = stand.fotoHoehe || Math.round(1000 / (k.fotoSeitenverhaeltnis || 1.5));
    stand.fotoBreite = B;
    stand.fotoHoehe = Hh;
    stand.marken = k.marken.map(([x, y]) => [x * B, y * Hh]);
    // Die gemessenen Farben kommen aus der Datei mit - ohne Foto liessen
    // sie sich hier auch gar nicht neu messen.
    stand.grundfarbe = k.grundfarbe ?? null;
    stand.bereiche = k.bereiche.map((b) => ({ ...b, punkte: b.punkte.map(([x, y]) => [x * B, y * Hh]) }));
    listeBauen();
    neuZeichnen();
    berichtBauen();
    melden('Datei geladen.', true);
  } catch (fehler) {
    melden(`Die Datei lässt sich nicht lesen: ${fehler.message}`);
  }
});

/* --- Los ------------------------------------------------------------------ */

vorschauZeichnen();
listeBauen();
// Eine schon gespeicherte Messung anbieten, statt sie stillschweigend zu
// ueberschreiben.
if (localStorage.getItem(SCHLUESSEL)) {
  melden('Auf diesem Gerät liegt schon eine Messung. Sie wird erst überschrieben, wenn hier gespeichert wird.');
}
