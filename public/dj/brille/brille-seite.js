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
import { brilleFinden, glaeserFinden, ausrichtungLegen, helligkeitMessen } from '../gemeinsam/brille.js';
import { fundBestimmen, gesichtssucherLaden } from './gesichtssucher.js';
import { beatZeit, beatBei } from '../gemeinsam/takt.js';

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
      const fund = await fundBestimmen(such, daten, brilleFinden, glaeserFinden);
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
  /*
   * Die Zaehlung haengt an den Quellennamen, und die haben sich mit der
   * Feinausrichtung geaendert - 'glaeser' kam dazu. Beim ersten Lauf danach
   * stand hier "5 Bilder · 0 über die Brille", obwohl alle fünf sauber
   * ausgerichtet waren. Eine Anzeige, die stillschweigend null meldet, ist
   * schlimmer als gar keine.
   */
  const ueberGlaeser = zaehle((b) => b.fund?.quelle === 'glaeser');
  const grob = zaehle((b) => b.fund?.quelle === 'brille' || b.fund?.quelle === 'augen');
  const ohneGesicht = zaehle((b) => b.fund?.quelle === 'nurBrille');
  const fehlt = zaehle((b) => !b.fund);
  $('ladeStand').textContent = `${bilder.length} Bilder · ${ueberGlaeser} genau ausgerichtet`
    + (grob ? ` · ${grob} nur grob (gelb)` : '')
    + (ohneGesicht ? ` · ${ohneGesicht} ohne Gesicht (gelb, bitte ansehen)` : '')
    + (fehlt ? ` · ${fehlt} nicht gefunden (rot)` : '');
  reihenfolgeSchreiben(bilder.map((_, i) => i));
  galerieBauen();
  if (musik) unterteilungenFuellen();
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
      : b.fund.vonHand || b.fund.quelle === 'glaeser' ? ''
      : b.fund.quelle === 'nurBrille' && b.fund.guete < GUETE_FRAGLICH ? ' fraglich'
      : ' ohneGesicht';
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


/* --- Musik ----------------------------------------------------------------
 *
 * Die Analyse liegt schon da: `analysiere()` misst Tempo, Raster und
 * Phrasengrenzen, `beatZeit()` gibt die Sekunde jedes einzelnen Schlags. Sie
 * ist fuer den DJ gebaut und wird hier unveraendert benutzt - der Schnitt
 * eines Bildes und der Einsatz eines Uebergangs sind dasselbe Problem.
 *
 * Der Unterschied zum Regler "Tempo" von Hand ist nicht Bequemlichkeit,
 * sondern Genauigkeit ueber die Laenge. Eine getippte Zahl wie 128 stimmt am
 * Anfang und laeuft am Ende auseinander: Ist das Stueck in Wahrheit 127,6
 * BPM, sind das nach dreissig Sekunden schon ein Sechstel Schlag Versatz -
 * und die Bildwechsel sitzen sichtbar neben der Musik. `beatZeit()` rechnet
 * jeden Schlag einzeln aus dem gemessenen Raster.
 */

/** Der dekodierte Ton und seine Vermessung. */
let musik = null;

/** Welche Unterteilungen zur Wahl stehen, in Schlaegen je Bild. */
const UNTERTEILUNGEN = [
  { wert: 0.5, name: 'halber Schlag (doppelt so schnell)' },
  { wert: 1, name: '1 Schlag' },
  { wert: 2, name: '2 Schläge (halber Takt)' },
  { wert: 4, name: '4 Schläge (1 Takt)' },
  { wert: 8, name: '8 Schläge (2 Takte)' },
];

$('musik').addEventListener('change', async (e) => {
  const datei = e.target.files?.[0];
  if (!datei) return;
  musik = null;
  $('musikRegler').hidden = true;
  $('passung').textContent = '';
  $('musikStand').textContent = 'wird gelesen …';
  try {
    const roh = await datei.arrayBuffer();
    const hof = new AudioContext();
    $('musikStand').textContent = 'wird dekodiert …';
    await new Promise((f) => setTimeout(f, 0));
    const puffer = await hof.decodeAudioData(roh);
    await hof.close();
    const { analysiere } = await import('../gemeinsam/analyse.js');
    const befund = await analysiere(puffer, (schritt) => {
      $('musikStand').textContent = `${datei.name}: ${schritt}`;
    });
    musik = { name: datei.name, puffer, befund };
    /*
     * Die Messung von aussen erreichbar machen.
     *
     * Nicht als Bequemlichkeit, sondern damit die Abnahme den Schnittplan
     * gegen ein Tempo pruefen kann, das sie selbst erzeugt hat - sonst
     * bliebe ihr nur, die Messung gegen sich selbst zu halten. In der
     * Konsole ist es nebenbei nuetzlich: `brille.befund.marken` zeigt, was
     * die Analyse im Stueck gefunden hat.
     */
    window.brille = { befund, spur: { abschnitte: befund.abschnitte }, puffer };
    musikMelden();
    reglerVonHand(befund.ohneRaster);
  } catch (grund) {
    $('musikStand').textContent = `geht nicht: ${grund.message}`;
    musik = null;
    reglerVonHand(true);
  }
});

function musikMelden() {
  const { befund, puffer } = musik;
  const sicher = befund.bpmVertrauen;
  $('musikStand').textContent = `${musik.name} · ${zeitText(puffer.duration)} · `
    + `${befund.bpm} BPM`
    + (befund.ohneRaster
      ? ' · kein sicherer Takt gefunden, die Bildwechsel laufen dann gleichmäßig'
      : ` · Takt sicher (${Math.round(sicher * 100)} %)`);

  /*
   * Startstellen: der Anfang der ersten Phrase, dazu die Marken aus der
   * Analyse. Die Marken sind dieselben, an denen der DJ seine Uebergaenge
   * setzt - meistens Drops. Auf einem davon anzufangen ist der billigste
   * Weg zu einem Video, das nicht mit einem Intro beginnt.
   */
  const stellen = [{ zeit: startZeitErstePhrase(), name: 'Anfang (erste Phrase)' }];
  /*
   * Die Marken der Analyse heissen `name` und `sekunde` - nicht `art` und
   * `zeit`. Der erste Anlauf hat geraten und "Marke bei –" in die Auswahl
   * geschrieben: eine Liste, die aussieht, als waere sie gefuellt, und in der
   * jeder Eintrag dasselbe Nichts sagt.
   */
  const BENENNUNG = { drop: 'Drop', breakdown: 'Breakdown', wechsel: 'Wechsel', outro: 'Outro' };
  for (const m of befund.marken ?? []) {
    if (!Number.isFinite(m.sekunde) || m.sekunde > puffer.duration - 3) continue;
    stellen.push({
      zeit: m.sekunde,
      name: `${BENENNUNG[m.name] ?? m.name} bei ${zeitText(m.sekunde)}`,
    });
  }
  // Nach Zeit sortiert und ohne Doppelte innerhalb einer Sekunde.
  stellen.sort((a, c) => a.zeit - c.zeit);
  for (let i = stellen.length - 1; i > 0; i--) {
    if (Math.abs(stellen[i].zeit - stellen[i - 1].zeit) < 1) stellen.splice(i, 1);
  }
  const anfang = startZeitErstePhrase();
  $('startStelle').innerHTML = stellen
    .map((s) => `<option value="${s.zeit}"${s.zeit === anfang ? ' selected' : ''}>${s.name}</option>`)
    .join('');
  $('musikRegler').hidden = false;
  unterteilungenFuellen();
}

/**
 * Wo die erste Achttaktphrase beginnt.
 *
 * Nicht bei Sekunde null: Fast jede Datei faengt mit etwas Stille oder einem
 * Anspieler an, und `raster` ist genau der gemessene Versatz dazu.
 */
function startZeitErstePhrase() {
  const { befund } = musik;
  if (befund.ohneRaster) return 0;
  const spur = { abschnitte: befund.abschnitte };
  try {
    return Math.max(0, beatZeit(spur, befund.phrasenVersatz ?? 0));
  } catch {
    return Math.max(0, befund.raster ?? 0);
  }
}

/**
 * Die Auswahl fuellen und die passendste Unterteilung vorschlagen.
 *
 * Vorgeschlagen wird die, deren Videolaenge der verbleibenden Musik am
 * naechsten kommt. Bei 45 Bildern und 128 BPM sind das zwei Schlaege je Bild:
 * 45 mal 0,94 Sekunden sind 42 Sekunden. Ein Schlag je Bild waere 21 - halb
 * so lang wie die Musik.
 */
function unterteilungenFuellen() {
  const folge = reihenfolgeLesen();
  const anzahl = folge.length || bilder.length;
  if (!musik || !anzahl) return;
  const uebrig = musik.puffer.duration - Number($('startStelle').value);
  const schlag = 60 / musik.befund.bpm;
  let beste = 0;
  let bestesMass = Infinity;
  $('jeBild').innerHTML = UNTERTEILUNGEN.map((u, i) => {
    const laenge = anzahl * u.wert * schlag;
    const mass = Math.abs(laenge - uebrig);
    if (mass < bestesMass) { bestesMass = mass; beste = i; }
    return `<option value="${u.wert}">${u.name} → ${zeitText(laenge)}</option>`;
  }).join('');
  $('jeBild').selectedIndex = beste;
  passungMelden();
}

function passungMelden() {
  if (!musik) { $('passung').textContent = ''; return; }
  const anzahl = reihenfolgeLesen().length;
  const uebrig = musik.puffer.duration - Number($('startStelle').value);
  const laenge = videoLaenge();
  const rest = uebrig - laenge;
  const wie = musik.befund.ohneRaster
    ? `${anzahl} Bilder gleichmäßig`
    : `${anzahl} Bilder × ${$('jeBild').value} Schläge`;
  $('passung').textContent = `${wie} = `
    + `${zeitText(laenge)} · Musik ab Start ${zeitText(uebrig)} · `
    + (rest >= 0
      ? `${zeitText(rest)} Musik bleibt übrig (wird ausgeblendet)`
      : `${zeitText(-rest)} zu wenig Musik – das Video wird an der Musik gekürzt`);
}

/** Die Videolaenge, die sich aus Musik und Bildzahl ergibt. */
function videoLaenge() {
  const anzahl = reihenfolgeLesen().length;
  if (musik.befund.ohneRaster) {
    return anzahl * (60 / zahl('bpm') / Number($('proSchlag').value));
  }
  return anzahl * Number($('jeBild').value) * (60 / musik.befund.bpm);
}

$('startStelle').addEventListener('change', unterteilungenFuellen);
$('jeBild').addEventListener('change', passungMelden);
/*
 * Die Reihenfolge bestimmt die Bildzahl und damit die Laenge. Wer eine Zeile
 * auskommentiert, soll sofort sehen, was das mit der Passung macht - sonst
 * stimmt die Anzeige stillschweigend nicht mehr.
 */
$('reihenfolge').addEventListener('input', () => { if (musik) unterteilungenFuellen(); });

/**
 * Die Regler von Hand stilllegen, sobald Musik da ist.
 *
 * Sie werden dann nicht mehr gelesen - das Raster kommt aus der Messung. Sie
 * weiter bedienbar stehen zu lassen waere die unangenehmste Sorte Fehler:
 * Man dreht daran, und nichts passiert.
 */
function reglerVonHand(an) {
  for (const id of ['bpm', 'proSchlag']) {
    $(id).disabled = !an;
    $(id).closest('label').style.opacity = an ? '' : '0.45';
  }
  $('vonHandHinweis').hidden = an;
  /*
   * Umgekehrt gilt dasselbe: Ohne sicheres Raster hat "Schläge je Bild"
   * nichts zu sagen, denn dann rechnet der Schnittplan gleichmaessig. Der
   * Regler bleibt sichtbar, damit man sieht, dass es ihn gibt - aber
   * stillgelegt, damit niemand daran dreht und sich wundert.
   */
  $('jeBild').disabled = an;
  $('jeBild').closest('label').style.opacity = an ? '0.45' : '';
}

function zeitText(sekunden) {
  if (!Number.isFinite(sekunden)) return '–';
  const m = Math.floor(sekunden / 60);
  const s = sekunden - m * 60;
  return m ? `${m}:${s.toFixed(1).padStart(4, '0')} min` : `${s.toFixed(1)} s`;
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

/**
 * Die Zeitachse: wann welches Bild dran ist.
 *
 * Zwei Faelle, und der Unterschied ist mehr als Bequemlichkeit.
 *
 * **Ohne Musik** kommt ein fester Abstand aus der getippten BPM-Zahl. Der
 * reicht, solange niemand mitzaehlt.
 *
 * **Mit Musik** wird jeder Bildwechsel einzeln aus dem gemessenen Raster
 * gerechnet. Das ist nicht dasselbe wie "Abstand aus der gemessenen BPM":
 * Eine feste Zahl laeuft ueber die Laenge auseinander. Bei 127,6 statt 128
 * BPM sind das nach dreissig Sekunden ein Sechstel Schlag - genug, dass man
 * es sieht. `beatZeit()` folgt stattdessen der Tempokarte und trifft auch
 * den letzten Schlag noch.
 */
function drehbuchBauen() {
  const folge = reihenfolgeLesen();
  if (!folge.length) return null;

  if (musik && !musik.befund.ohneRaster) {
    const spur = { abschnitte: musik.befund.abschnitte };
    const jeBild = Number($('jeBild').value);
    // Auf einen ganzen Schlag einrasten: Die Startstellen aus den Marken
    // liegen nicht zwangslaeufig auf einem.
    const startBeat = Math.round(beatBei(spur, Number($('startStelle').value)));
    const startZeit = beatZeit(spur, startBeat);
    const zeiten = [];
    for (let k = 0; k <= folge.length; k++) {
      zeiten.push(beatZeit(spur, startBeat + k * jeBild) - startZeit);
    }
    /*
     * Reicht die Musik nicht bis zum letzten Bild, wird gekuerzt statt in
     * die Stille hinein weiterzulaufen. Lieber ein Bild weniger als ein
     * Video, das hinten ohne Ton dasteht.
     */
    const uebrig = musik.puffer.duration - startZeit;
    let anzahl = folge.length;
    while (anzahl > 1 && zeiten[anzahl] > uebrig) anzahl--;
    return {
      folge: folge.slice(0, anzahl),
      zeiten: zeiten.slice(0, anzahl + 1),
      dauer: zeiten[anzahl],
      musikStart: startZeit,
      gekuerzt: folge.length - anzahl,
    };
  }

  /*
   * Der gleichmaessige Weg - und er heisst ausdruecklich *nicht* "ohne Musik".
   *
   * Die erste Fassung hat beides in einem Zug entschieden: Kein sicheres
   * Raster hiess kein Tonanschluss, und damit lag die hochgeladene Musik
   * stillschweigend gar nicht im fertigen Video. Aufgefallen ist das an einer
   * Klickspur, deren Tempo auf 123,5 genau erkannt wurde, deren Vertrauen aber
   * unter der Schwelle blieb - die Datei kam ohne Ton heraus, ohne dass
   * irgendwo etwas dazu stand.
   *
   * Es sind zwei verschiedene Fragen: *Woher kommen die Schnittzeiten?* und
   * *Kommt der Ton mit?* Die zweite haengt nur daran, ob Musik da ist.
   */
  const proSchlag = Number($('proSchlag').value);
  const proBild = 60 / zahl('bpm') / proSchlag;
  const zeiten = folge.map((_, i) => i * proBild);
  zeiten.push(folge.length * proBild);
  const start = musik ? Number($('startStelle').value) || 0 : null;
  return {
    folge,
    zeiten,
    dauer: folge.length * proBild,
    musikStart: start,
    gekuerzt: 0,
  };
}

/** Welches Bild laeuft zur Zeit t, und wie weit ist es? */
function drehbuchMerken(drehbuch) {
  // Damit die Abnahme den *wirklich benutzten* Plan pruefen kann und nicht
  // eine Nachrechnung davon. Eine Pruefung, die den Plan selbst noch einmal
  // aufstellt, bestaetigt nur ihre eigene Arithmetik.
  window.brille = { ...(window.brille ?? {}), drehbuch };
  return drehbuch;
}

function stelleFinden(drehbuch, t) {
  const { zeiten } = drehbuch;
  let nummer = 0;
  // Vorwaerts suchen reicht: dreissig bis fuenfzig Eintraege, und der Aufruf
  // kommt einmal je Bild der Anzeige.
  while (nummer < zeiten.length - 2 && t >= zeiten[nummer + 1]) nummer++;
  const von = zeiten[nummer];
  const bis = zeiten[nummer + 1];
  return { nummer, imBild: bis > von ? (t - von) / (bis - von) : 0, dauer: bis - von };
}

/**
 * Ein Bild der Zeitachse zeichnen.
 *
 * @param {number} t  Zeit in Sekunden seit Anfang
 */
function bildZeichnen(stift, drehbuch, t, breite, hoehe) {
  const { folge } = drehbuch;
  const { nummer, imBild } = stelleFinden(drehbuch, t);
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

/**
 * Den Ton starten und eine Uhr zurueckgeben, die an ihm haengt.
 *
 * Die Uhr ist der Punkt. Zeichnet man nach `performance.now()` und spielt den
 * Ton daneben ab, laufen beide auseinander - der Bildschirm laesst ein Bild
 * aus, der Ton nicht, und nach einer halben Minute sitzt der Schnitt neben
 * dem Schlag. `AudioContext.currentTime` ist dagegen dieselbe Uhr, nach der
 * der Ton laeuft. Wer danach zeichnet, kann nicht wegdriften.
 *
 * Ohne Musik gibt es keinen Ton und also auch keine Tonuhr; dann bleibt es
 * bei `performance.now()`.
 *
 * @param {object} drehbuch
 * @param {boolean} fuerAufnahme  zusaetzlich einen Tonstrom bereitstellen
 */
function tonStarten(drehbuch, fuerAufnahme) {
  if (!musik || drehbuch.musikStart === null || (fuerAufnahme && !$('tonMit').checked)) {
    const start = performance.now();
    return { jetzt: () => (performance.now() - start) / 1000, stoppen: () => {}, spuren: [] };
  }
  const hof = new AudioContext();
  const quelle = hof.createBufferSource();
  quelle.buffer = musik.puffer;
  const regler = hof.createGain();
  quelle.connect(regler);

  /*
   * Am Ende ausblenden.
   *
   * Die Musik ist in aller Regel laenger als die Bilder - so soll es auch
   * sein -, und sie wird deshalb mitten im Stueck abgeschnitten. Ohne
   * Ausblendung ist das ein hoerbarer Knacks. Anderthalb Sekunden reichen,
   * um es als Schluss zu lesen, und sind kurz genug, dass das letzte Gesicht
   * nicht in Stille steht.
   */
  const AUSBLENDEN = 1.5;
  const ende = hof.currentTime + drehbuch.dauer;
  regler.gain.setValueAtTime(1, hof.currentTime);
  regler.gain.setValueAtTime(1, Math.max(hof.currentTime, ende - AUSBLENDEN));
  regler.gain.linearRampToValueAtTime(0.0001, ende);

  const spuren = [];
  if (fuerAufnahme) {
    const ziel = hof.createMediaStreamDestination();
    regler.connect(ziel);
    spuren.push(...ziel.stream.getAudioTracks());
    // Bei der Aufnahme *nicht* zusaetzlich auf die Lautsprecher: Sonst hoert
    // man das Video beim Rendern laut mit, und das ist beim zweiten Anlauf
    // nur noch laestig.
  } else {
    regler.connect(hof.destination);
  }
  const nullpunkt = hof.currentTime + 0.12;
  quelle.start(nullpunkt, drehbuch.musikStart);
  return {
    jetzt: () => hof.currentTime - nullpunkt,
    stoppen: () => { try { quelle.stop(); } catch { /* schon aus */ } hof.close(); },
    spuren,
  };
}

$('vorschau').addEventListener('click', () => {
  const drehbuch = drehbuchBauen();
  if (!drehbuch) return melden('Erst Bilder laden.');
  drehbuchMerken(drehbuch);
  if (laeuft) { laeuft = false; return; }
  laeuft = true;
  if (drehbuch.gekuerzt) {
    melden(`${drehbuch.gekuerzt} Bild(er) weggelassen – die Musik reicht nicht weiter.`);
  }
  const stift = $('buehne').getContext('2d');
  const { width: B, height: H } = $('buehne');
  const ton = tonStarten(drehbuch, false);
  const schleife = () => {
    if (!laeuft) { ton.stoppen(); return; }
    const t = ton.jetzt();
    if (t >= drehbuch.dauer) { laeuft = false; ton.stoppen(); return; }
    if (t >= 0) bildZeichnen(stift, drehbuch, t, B, H);
    requestAnimationFrame(schleife);
  };
  schleife();
});

$('rendern').addEventListener('click', async () => {
  const drehbuch = drehbuchBauen();
  if (!drehbuch) return melden('Erst Bilder laden.');
  drehbuchMerken(drehbuch);
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
  const ton = tonStarten(drehbuch, true);
  /*
   * Die Tonspur kommt in denselben Strom wie das Bild. Damit schneidet der
   * Rekorder beides in *eine* Datei, und zwar mit den Zeitstempeln, die er
   * beim Aufnehmen sieht - der Gleichlauf muss also nicht nachtraeglich
   * hergestellt werden, er entsteht beim Mitschnitt.
   */
  for (const spur of ton.spuren) strom.addTrack(spur);
  const mitTon = ton.spuren.length > 0;
  const art = (mitTon
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'])
    .find((a) => MediaRecorder.isTypeSupported(a));
  if (!art) { ton.stoppen(); return melden('Dieser Browser kann kein WebM aufnehmen.'); }
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
  await new Promise((fertigGezeichnet) => {
    const schleife = () => {
      const t = ton.jetzt();
      if (!laeuft || t >= drehbuch.dauer) return fertigGezeichnet();
      if (t >= 0) bildZeichnen(stift, drehbuch, t, B, H);
      melden(`${Math.max(0, t).toFixed(1)} von ${drehbuch.dauer.toFixed(1)} s`);
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
  ton.stoppen();
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
    + `${drehbuch.dauer.toFixed(1)} s${mitTon ? ', mit Ton' : ''})`;
  $('ergebnis').innerHTML = '';
  $('ergebnis').appendChild(a);
  melden('fertig');
});

function melden(text) {
  $('videoStand').textContent = text;
}
