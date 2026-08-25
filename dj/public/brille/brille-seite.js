// Die Brillenseite.
//
// Ablauf: Bilder laden, Brille suchen, Reihenfolge festlegen, Video
// aufnehmen. Alles im Browser - die Fotos verlassen den Rechner nicht.

/*
 * Relativer Pfad und kein absoluter.
 *
 * Diese Seite laeuft unter zwei Adressen: beim Serverbetrieb unter
 * `/brille/`, in der gebauten Fassung auf Vercel unter `/dj/brille/`. Ein
 * absolutes `/gemeinsam/brille.js` trifft dort ins Leere, weil dort
 * `/dj/gemeinsam/brille.js` liegt - und der Fehler faellt beim Entwickeln
 * nicht auf, weil der eigene Server genau die Adresse bedient, die im Code
 * steht. Dieselbe Ueberlegung steht beim Messstand.
 */
import { brilleFinden, ausrichtungLegen, helligkeitMessen } from '../gemeinsam/brille.js';
import { fundBestimmen, gesichtssucherLaden } from './gesichtssucher.js';

const $ = (id) => document.getElementById(id);

/*
 * Bei welcher Breite gesucht wird.
 *
 * Nicht im Original: Ein Handyfoto hat 3000 bis 4000 Bildpunkte Breite, und
 * die Brille ist darauf ein paar hundert gross. Bei 640 ist sie immer noch
 * ueber zweihundert Punkte breit - mehr als genug fuer Mitte, Winkel und
 * Groesse -, und die Suche dauert Millisekunden statt einer halben Sekunde.
 */
const SUCH_BREITE = 640;

/** Alle geladenen Bilder. */
let bilder = [];
/** Auf welche Kachel gerade von Hand gesetzt wird. */
let setzen = null;

/* --- Laden ---------------------------------------------------------------- */

/*
 * Das Gesichtsmodell schon beim Oeffnen der Seite holen.
 *
 * Es sind 9,6 MB, und sie brauchen gemessen rund anderthalb Sekunden. Ohne
 * diesen Vorlauf faellt die Wartezeit auf das erste Bild - man waehlt dreissig
 * Fotos aus, und die Seite steht erst einmal still, ohne zu sagen warum.
 *
 * Fehlschlaege werden hier bewusst verschluckt: Ohne Modell laeuft die
 * Brillensuche allein weiter, und das ist schlechter, aber nicht kaputt.
 */
gesichtssucherLaden().catch((grund) => console.warn(`Gesichtsmodell: ${grund.message}`));

$('dateien').addEventListener('change', async (e) => {
  const dateien = [...(e.target.files ?? [])];
  if (!dateien.length) return;
  bilder = [];
  $('galerie').innerHTML = '';
  const such = document.createElement('canvas');
  such.width = SUCH_BREITE;
  const stift = such.getContext('2d', { willReadFrequently: true });

  for (let i = 0; i < dateien.length; i++) {
    const datei = dateien[i];
    $('ladeStand').textContent = `${i + 1} von ${dateien.length}: ${datei.name}`;
    // Zwischen den Bildern ans Fenster zurueckgeben, sonst friert die Seite
    // ein - dieselbe Falle wie bei der Musikmessung.
    await new Promise((f) => setTimeout(f, 0));
    try {
      const bild = await bildLaden(datei);
      such.height = Math.max(1, Math.round(bild.naturalHeight * (SUCH_BREITE / bild.naturalWidth)));
      stift.drawImage(bild, 0, 0, such.width, such.height);
      const daten = stift.getImageData(0, 0, such.width, such.height);
      const fund = await fundBestimmen(such, daten, brilleFinden);
      bilder.push({
        name: datei.name, bild, fund,
        suchBreite: such.width,
        // Mittlere Helligkeit des Suchbildes - fuer das Sortieren und fuer
        // den Helligkeitsausgleich.
        helligkeit: mittlereHelligkeit(daten),
      });
    } catch (grund) {
      console.warn(`${datei.name}: ${grund.message}`);
    }
  }
  const zaehle = (pruefe) => bilder.filter(pruefe).length;
  const ueberBrille = zaehle((b) => b.fund?.quelle === 'brille');
  const ueberAugen = zaehle((b) => b.fund?.quelle === 'augen');
  const ohneGesicht = zaehle((b) => b.fund?.quelle === 'nurBrille');
  const fehlt = zaehle((b) => !b.fund);
  $('ladeStand').textContent = `${bilder.length} Bilder · ${ueberBrille} über die Brille`
    + (ueberAugen ? ` · ${ueberAugen} über die Augen` : '')
    + (ohneGesicht ? ` · ${ohneGesicht} ohne Gesicht (gelb, bitte ansehen)` : '')
    + (fehlt ? ` · ${fehlt} nicht gefunden (rot)` : '');
  reihenfolgeSchreiben(bilder.map((_, i) => i));
  galerieBauen();
});

function bildLaden(datei) {
  return new Promise((fertig, schief) => {
    const bild = new Image();
    bild.onload = () => fertig(bild);
    bild.onerror = () => schief(new Error('laesst sich nicht lesen'));
    bild.src = URL.createObjectURL(datei);
  });
}

function mittlereHelligkeit(daten) {
  const d = daten.data;
  let summe = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 64) {
    summe += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    n++;
  }
  return summe / Math.max(1, n);
}

/* --- Reihenfolge ----------------------------------------------------------
 *
 * Bewusst ein Textfeld und keine Zieh-und-Ablege-Oberflaeche.
 *
 * Eine Liste aus dreissig Zeilen laesst sich in jedem Texteditor der Welt in
 * Sekunden umsortieren: Zeile ausschneiden, woanders einfuegen, fertig. Eine
 * gebaute Sortieroberflaeche kann das nicht besser - sie kann es nur
 * huebscher, und dafuer muss man sie erst bedienen lernen.
 *
 * Was das Textfeld zusaetzlich kann und kein Ziehen koennte: eine Zeile mit
 * `#` auskommentieren. Damit fliegt ein Bild raus, ohne dass man es
 * verliert.
 */

function reihenfolgeSchreiben(folge) {
  $('reihenfolge').value = folge
    .map((i) => `${String(i).padStart(2, '0')}  ${bilder[i].name}`)
    .join('\n');
}

function reihenfolgeLesen() {
  const zeilen = $('reihenfolge').value.split('\n');
  const folge = [];
  for (const zeile of zeilen) {
    const roh = zeile.trim();
    if (!roh || roh.startsWith('#')) continue;
    const treffer = /^(\d+)/.exec(roh);
    if (!treffer) continue;
    const i = Number(treffer[1]);
    if (i >= 0 && i < bilder.length) folge.push(i);
  }
  return folge;
}

const sortieren = (schluessel) => {
  const folge = reihenfolgeLesen();
  folge.sort((a, b) => schluessel(bilder[a]) - schluessel(bilder[b]));
  reihenfolgeSchreiben(folge);
};

$('mischen').addEventListener('click', () => {
  const f = reihenfolgeLesen();
  for (let i = f.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [f[i], f[j]] = [f[j], f[i]];
  }
  reihenfolgeSchreiben(f);
});
$('umdrehen').addEventListener('click', () => reihenfolgeSchreiben(reihenfolgeLesen().reverse()));
$('nachGuete').addEventListener('click', () => sortieren((b) => -(b.fund?.guete ?? 0)));
$('nachHelligkeit').addEventListener('click', () => sortieren((b) => b.helligkeit));
/*
 * Nach Kopfneigung sortieren ist der interessanteste der vier: Laeuft die
 * Neigung von links nach rechts durch, kippt der Kopf ueber das ganze Video
 * langsam durch - eine Bewegung, die keines der Einzelbilder hat.
 */
$('nachNeigung').addEventListener('click', () => sortieren((b) => b.fund?.winkel ?? 0));
$('zurueck').addEventListener('click', () => reihenfolgeSchreiben(bilder.map((_, i) => i)));

/* --- Galerie und Nachbessern ---------------------------------------------- */

/*
 * Ab welcher Trefferqualitaet eine Kachel als "bitte ansehen" gilt.
 *
 * Nicht gefunden ist der offensichtliche Fall - der interessantere ist
 * *schlecht* gefunden. Gemessen an dreissig kuenstlich verzerrten Fassungen
 * des Beispielfotos liegt der mittlere Fehler der Brillenmitte bei 4 Prozent
 * der Brillenbreite, die schlechtesten aber bei ueber 30 Prozent - und
 * ausgerechnet die faellt im fertigen Video auf, weil dort ein Kopf
 * verrutscht, waehrend alle anderen stehen.
 *
 * Solche Faelle melden sich nicht von selbst: Der Sucher findet ja etwas.
 * Deshalb bekommen sie eine eigene Farbe, statt unter "gefunden" zu
 * verschwinden.
 */
const GUETE_FRAGLICH = 0.45;

function galerieBauen() {
  const g = $('galerie');
  g.innerHTML = '';
  bilder.forEach((b, i) => {
    const kachel = document.createElement('div');
    /*
     * Was gelb wird, hat sich mit der Gesichtserkennung geaendert.
     *
     * Vorher entschied allein die Guete der Brillensuche - und die weiss
     * nichts darueber, *wo* sie gesucht hat. Ein Wedel neben dem Kopf konnte
     * eine glatte Eins bekommen. Jetzt entscheidet die Quelle:
     *
     *   'brille'     Augen und Brille sind sich einig - das Beste, was es gibt
     *   'augen'      nur die Augen; richtig ausgerichtet, aber unbestaetigt
     *   'nurBrille'  gar kein Gesicht gefunden - hier lohnt ein Blick
     */
    const stand = !b.fund ? ' fehlt'
      : b.fund.vonHand ? ''
      : b.fund.quelle === 'nurBrille' && b.fund.guete < GUETE_FRAGLICH ? ' fraglich'
      : b.fund.quelle === 'nurBrille' ? ' ohneGesicht'
      : '';
    kachel.className = `kachel${stand}`;
    kachel.dataset.nummer = String(i);
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 120;
    vorschauZeichnen(c.getContext('2d'), b, 120, 120);
    const n = document.createElement('span');
    n.className = 'nummer';
    n.textContent = String(i).padStart(2, '0');
    kachel.append(c, n);
    kachel.addEventListener('click', () => vonHandSetzen(i, kachel));
    g.appendChild(kachel);
  });
}

function vorschauZeichnen(stift, eintrag, breite, hoehe) {
  stift.fillStyle = '#000';
  stift.fillRect(0, 0, breite, hoehe);
  stift.save();
  if (eintrag.fund) {
    ausrichtungLegen(stift, eintrag.fund, eintrag.suchBreite,
      eintrag.bild.naturalWidth, breite, hoehe, 1);
  } else {
    // Ohne Fund: einfach einpassen, damit man das Bild ueberhaupt sieht.
    const s = Math.max(breite / eintrag.bild.naturalWidth, hoehe / eintrag.bild.naturalHeight);
    stift.translate(breite / 2, hoehe / 2);
    stift.scale(s, s);
    stift.translate(-eintrag.bild.naturalWidth / 2, -eintrag.bild.naturalHeight / 2);
  }
  stift.drawImage(eintrag.bild, 0, 0);
  stift.restore();
}

/*
 * Von Hand nachsetzen.
 *
 * Zwei Klicks auf die Linsenmitten - links, dann rechts. Daraus ergeben sich
 * dieselben drei Groessen, die der Sucher sonst selbst bestimmt: Mitte,
 * Winkel und Laenge. Die Laenge wird dabei mit 1,4 gestreckt, weil zwei
 * Linsenmitten enger beieinander liegen als die vier Standardabweichungen,
 * mit denen der Sucher rechnet - ohne diesen Ausgleich waeren von Hand
 * gesetzte Bilder groesser als die gefundenen.
 */
const HAND_STRECKUNG = 1.4;

function vonHandSetzen(i, kachel) {
  if (setzen && setzen.kachel !== kachel) setzen.kachel.classList.remove('setzen');
  const eintrag = bilder[i];
  const gross = document.createElement('canvas');
  const B = 560;
  const H = Math.round(eintrag.bild.naturalHeight * (B / eintrag.bild.naturalWidth));
  gross.width = B;
  gross.height = H;
  gross.style.cssText = 'position:fixed;inset:0;margin:auto;z-index:50;'
    + 'box-shadow:0 0 0 4px #ffd479;cursor:crosshair;max-height:92vh;object-fit:contain';
  const g = gross.getContext('2d');
  g.drawImage(eintrag.bild, 0, 0, B, H);
  const hinweis = document.createElement('div');
  hinweis.style.cssText = 'position:fixed;left:0;right:0;top:8px;text-align:center;'
    + 'z-index:51;font:600 14px system-ui;color:#ffd479';
  hinweis.textContent = 'Linke Linsenmitte anklicken (Esc bricht ab)';
  const punkte = [];
  const weg = () => { gross.remove(); hinweis.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') weg(); };
  document.addEventListener('keydown', esc);
  gross.addEventListener('click', (e) => {
    const r = gross.getBoundingClientRect();
    punkte.push([((e.clientX - r.left) / r.width) * B, ((e.clientY - r.top) / r.height) * H]);
    g.strokeStyle = '#0ff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(punkte.at(-1)[0], punkte.at(-1)[1], 8, 0, Math.PI * 2);
    g.stroke();
    if (punkte.length === 1) {
      hinweis.textContent = 'Rechte Linsenmitte anklicken';
      return;
    }
    const [a, c] = punkte;
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    eintrag.fund = {
      mitte: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2],
      winkel: Math.atan2(dy, dx),
      laenge: Math.hypot(dx, dy) * HAND_STRECKUNG,
      dicke: Math.hypot(dx, dy) * 0.4,
      guete: 1,
      vonHand: true,
    };
    // Die Handmarken sitzen im 560er Bild, nicht im 640er Suchbild.
    eintrag.suchBreite = B;
    weg();
    galerieBauen();
  });
  document.body.append(gross, hinweis);
}

/* --- Video ---------------------------------------------------------------- */

const zahl = (id) => Number($(id).value);

$('blende').addEventListener('input', () => {
  const v = zahl('blende');
  $('blendeWert').textContent = v === 0 ? 'hart' : `${v} %`;
});
$('zoom').addEventListener('input', () => { $('zoomWert').textContent = `${zahl('zoom')} %`; });
$('aufloesung').addEventListener('change', () => {
  const [b, h] = $('aufloesung').value.split('x').map(Number);
  $('buehne').width = b;
  $('buehne').height = h;
});

/** Die Zeitachse: wann welches Bild dran ist. */
function drehbuchBauen() {
  const folge = reihenfolgeLesen();
  if (!folge.length) return null;
  const proSchlag = Number($('proSchlag').value);
  const proBild = 60 / zahl('bpm') / proSchlag;
  return { folge, proBild, dauer: folge.length * proBild };
}

/**
 * Ein Bild der Zeitachse zeichnen.
 *
 * @param {number} t  Zeit in Sekunden seit Anfang
 */
function bildZeichnen(stift, drehbuch, t, breite, hoehe) {
  const { folge, proBild } = drehbuch;
  const stelle = t / proBild;
  const nummer = Math.min(folge.length - 1, Math.floor(stelle));
  const imBild = stelle - nummer;
  const blende = zahl('blende') / 100;

  stift.fillStyle = '#000';
  stift.fillRect(0, 0, breite, hoehe);

  /*
   * Der langsame Zoom laeuft ueber das *ganze* Video und nicht je Bild.
   *
   * Das ist der Unterschied zwischen "die Bilder zoomen" und "das Video
   * faehrt hinein": Bei einem Zoom je Bild zuckt es dreissigmal zurueck,
   * bei einem durchgehenden waechst die Naehe ueber die ganze Laenge.
   */
  const fortschritt = drehbuch.dauer > 0 ? t / drehbuch.dauer : 0;
  const zoom = 1 + (zahl('zoom') / 100) * fortschritt;

  const eines = (index, deckung) => {
    const e = bilder[folge[index]];
    if (!e || !e.fund) return;
    stift.save();
    stift.globalAlpha = deckung;
    ausrichtungLegen(stift, e.fund, e.suchBreite, e.bild.naturalWidth, breite, hoehe, zoom);
    if ($('wackeln').checked) {
      /*
       * Ein winziger Versatz je Bild. Ohne ihn steht die Brille so exakt
       * still, dass die Abfolge steril wirkt; mit ihm bekommt sie das
       * Zittern einer Handkamera. Der Versatz haengt am Bildindex und ist
       * damit reproduzierbar, nicht gewuerfelt.
       */
      const w = ((index * 2654435761) % 1000) / 1000;
      const v = ((index * 40503) % 1000) / 1000;
      stift.translate((w - 0.5) * breite * 0.012, (v - 0.5) * hoehe * 0.012);
    }
    stift.drawImage(e.bild, 0, 0);
    stift.restore();
  };

  if (blende > 0 && nummer + 1 < folge.length) {
    // Die Blende sitzt am *Anfang* des neuen Bildes, nicht am Ende des
    // alten - sonst haengt der Schnitt hinter dem Schlag.
    const anteil = Math.min(1, imBild / Math.max(0.02, blende));
    eines(nummer, 1);
    if (anteil < 1) {
      // Waehrend der Blende liegt das vorige noch darunter.
      eines(nummer, 1 - anteil);
      eines(nummer + 1, anteil);
    }
  } else {
    eines(nummer, 1);
  }

  if ($('angleichen').checked) helligkeitAngleichen(stift, breite, hoehe);
}

/*
 * Helligkeit angleichen.
 *
 * Gemessen wird der mittlere Bereich des fertigen Bildes und dann mit einer
 * einzigen Deckschicht in Richtung Zielhelligkeit geschoben. Kein
 * Farbstich-Ausgleich, keine Gradationskurve - beides waere hier zu viel
 * und wuerde Gesichter verfaerben. Es geht nur darum, dass nicht jedes
 * zweite Bild aufblitzt.
 */
const ZIEL_HELLIGKEIT = 128;

function helligkeitAngleichen(stift, breite, hoehe) {
  const [r, g, b] = helligkeitMessen(stift, breite, hoehe);
  const ist = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (!Number.isFinite(ist) || ist < 1) return;
  const unterschied = ZIEL_HELLIGKEIT - ist;
  // Nur zur Haelfte ausgleichen: Ganz durchgezogen sehen alle Bilder gleich
  // flau aus, und ein dunkles Foto darf dunkel bleiben.
  const staerke = Math.max(-60, Math.min(60, unterschied * 0.5));
  if (Math.abs(staerke) < 2) return;
  stift.save();
  stift.globalCompositeOperation = staerke > 0 ? 'lighter' : 'multiply';
  const wert = staerke > 0 ? staerke : 255 + staerke;
  stift.fillStyle = `rgb(${wert} ${wert} ${wert})`;
  stift.fillRect(0, 0, breite, hoehe);
  stift.restore();
}

/* --- Abspielen und Aufnehmen ---------------------------------------------- */

let laeuft = false;

$('vorschau').addEventListener('click', () => {
  const drehbuch = drehbuchBauen();
  if (!drehbuch) return melden('Erst Bilder laden.');
  if (laeuft) { laeuft = false; return; }
  laeuft = true;
  const stift = $('buehne').getContext('2d');
  const { width: B, height: H } = $('buehne');
  const start = performance.now();
  const schleife = () => {
    if (!laeuft) return;
    const t = (performance.now() - start) / 1000;
    if (t >= drehbuch.dauer) { laeuft = false; return; }
    bildZeichnen(stift, drehbuch, t, B, H);
    requestAnimationFrame(schleife);
  };
  schleife();
});

$('rendern').addEventListener('click', async () => {
  const drehbuch = drehbuchBauen();
  if (!drehbuch) return melden('Erst Bilder laden.');
  if (laeuft) { laeuft = false; return; }
  const leinwand = $('buehne');
  const stift = leinwand.getContext('2d');
  const { width: B, height: H } = leinwand;

  /*
   * Aufgenommen wird in Echtzeit, und das ist eine bewusste Entscheidung
   * gegen den eleganteren Weg.
   *
   * Elegant waere `captureStream(0)` plus `requestFrame()`: Man rechnet ein
   * Bild, meldet es an, rechnet das naechste - unabhaengig davon, wie
   * schnell der Rechner ist, und mit exakt gleichen Zeitabstaenden. Genau
   * das stand hier zuerst.
   *
   * Herausgekommen ist eine Datei mit 110 Byte: ein Kopf ohne ein einziges
   * Bild. Der Rekorder hat die angemeldeten Bilder nicht angenommen.
   *
   * Echtzeit kann das nicht passieren: Der Strom liefert, was auf der
   * Leinwand steht, und der Rekorder schneidet mit. Der Preis ist, dass ein
   * langsamer Rechner Bilder auslaesst - bei ein paar Sekunden Video und
   * dreissig Standbildern faellt das nicht ins Gewicht, denn zu zeichnen
   * ist hier nichts als ein bis zwei Fotos je Bild.
   */
  const BILDRATE = 30;
  const strom = leinwand.captureStream(BILDRATE);
  const art = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((a) => MediaRecorder.isTypeSupported(a));
  if (!art) return melden('Dieser Browser kann kein WebM aufnehmen.');
  const stuecke = [];
  const rekorder = new MediaRecorder(strom, { mimeType: art, videoBitsPerSecond: 12_000_000 });
  rekorder.ondataavailable = (e) => { if (e.data.size) stuecke.push(e.data); };
  const fertig = new Promise((f) => { rekorder.onstop = f; });

  $('rendern').disabled = true;
  $('vorschau').disabled = true;
  laeuft = true;
  // Das erste Bild steht schon, bevor die Aufnahme laeuft - sonst faengt
  // das Video mit einer schwarzen Leinwand an.
  bildZeichnen(stift, drehbuch, 0, B, H);
  rekorder.start();
  const start = performance.now();
  await new Promise((fertigGezeichnet) => {
    const schleife = () => {
      const t = (performance.now() - start) / 1000;
      if (!laeuft || t >= drehbuch.dauer) return fertigGezeichnet();
      bildZeichnen(stift, drehbuch, t, B, H);
      melden(`${t.toFixed(1)} von ${drehbuch.dauer.toFixed(1)} s`);
      requestAnimationFrame(schleife);
    };
    requestAnimationFrame(schleife);
  });
  /*
   * Kurz nachlaufen lassen: Der Rekorder braucht einen Moment, bis das
   * letzte Bild wirklich im Strom ist. Ohne das fehlt am Ende ein
   * Sekundenbruchteil - und ausgerechnet das letzte Gesicht.
   */
  await new Promise((f) => setTimeout(f, 300));
  laeuft = false;
  rekorder.stop();
  await fertig;
  $('rendern').disabled = false;
  $('vorschau').disabled = false;

  const blob = new Blob(stuecke, { type: art });
  if (blob.size < 2000) {
    return melden('Die Aufnahme ist leer geblieben - bitte im normalen '
      + 'Browserfenster versuchen, nicht in einem Hintergrund-Tab.');
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'herzbrille.webm';
  a.textContent = `herzbrille.webm herunterladen (${(blob.size / 1048576).toFixed(1)} MB, `
    + `${drehbuch.dauer.toFixed(1)} s, ${stuecke.length} Stuecke)`;
  $('ergebnis').innerHTML = '';
  $('ergebnis').appendChild(a);
  melden('fertig');
});

function melden(text) {
  $('videoStand').textContent = text;
}
