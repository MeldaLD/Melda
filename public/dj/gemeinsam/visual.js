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

import {
  MODI,
  GUETESTUFEN,
  gueteZuruecksetzen,
  dolceZuruecksetzen,
  oklabZuRgb,
  TAU,
} from './visualmodi.js';
import { beatBei } from './takt.js';
import { spektrumSchaerfen, spektrumZuruecksetzen } from './spektrum.js';
import { schattenZeichnen } from './schattendj.js';

// Die Reihenfolge, in der die Modi durchgewechselt werden. Nicht zufaellig
// gezogen, sondern reihum: So sieht man zwei gleiche nie hintereinander, und
// ueber einen Abend kommt jeder gleich oft dran.
const MODUSFOLGE = ['mandelbrot', 'iris', 'tunnel', 'strahlen'];

// Wie lang ein Breakdown hoechstens dauern darf - zweiunddreissig Takte.
// Die Begruendung steht bei abbauBei(); kurz: In Stundenmixen klaffen Luecken
// zwischen den Marken, und eine Luecke ist kein Breakdown.
const BREAKDOWN_HOECHSTENS = 128;
// Und wie weit der naechste Drop hoechstens weg sein darf, damit das Bild auf
// ihn hin schwarz werden darf. Weiter als achtundvierzig Takte heisst: Es
// kommt nichts, worauf sich das Warten lohnt.
const DROP_IN_SICHT = 192;

/**
 * Welcher Modus passt zu diesem Track?
 *
 * Reihum durchzuwechseln ist gerecht, aber nicht gut: Ein Strahlenkranz
 * braucht Percussion in den Hoehen, sonst steht er still, und eine Iris wirkt
 * auf einem Brett verloren. Also entscheidet, was der Track mitbringt - und
 * zwar aus denselben Zahlen, die auch die Uebergaenge planen.
 *
 * Der zuletzt gelaufene Modus wird ausgeschlossen. Zwei gleiche
 * hintereinander sehen aus wie ein Fehler, selbst wenn beide passen.
 */
function modusAusTrack(track, zuletzt) {
  const energie = track?.energie ?? 0.5;
  const profil = track?.profil ?? [];
  const mitte = profil.length ? profil[Math.floor(profil.length / 2)] : null;
  const hoehen = mitte?.h ?? 0.2;
  const dichte = mitte?.d ?? 2;

  const punkte = {
    // Das Fraktal traegt alles und wird mit der Energie nur intensiver. Es ist
    // die sichere Wahl und darf deshalb die hoechste Grundpunktzahl haben.
    mandelbrot: 0.6 + energie * 0.5,
    // Strahlen leben von Percussion in den Hoehen.
    strahlen: 0.2 + hoehen * 2.2 + Math.min(0.4, dichte * 0.12),
    // Der Tunnel braucht einen klaren Puls, keinen Teppich.
    tunnel: 0.35 + Math.max(0, 1 - Math.abs(dichte - 2.4) / 2.4) * 0.9,
    // Die Iris ist die ruhige Wahl.
    iris: 0.3 + Math.max(0, 0.7 - energie) * 1.4,
  };
  if (zuletzt) punkte[zuletzt] = -1;

  return Object.entries(punkte).sort((a, b) => b[1] - a[1])[0][0];
}

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

/*
 * Sechs Paletten statt eines beliebigen Grundtons.
 *
 * Vorher wuerfelte jeder Track einen Farbton zwischen 0 und 360 aus. Das ist
 * bequem und geht regelmaessig schief: Im Bereich zwischen Gelb und Oliv wird
 * jede gesaettigte Flaeche schmutzig statt leuchtend, und ueber eine ganze
 * Nacht kommt dieser Bereich sicher mehrmals dran.
 *
 * Was in dieser Musik funktioniert, folgt drei Regeln, und alle drei haben
 * einen Grund, der nichts mit Geschmack zu tun hat:
 *
 *   1. Ein *enger* Tonbereich plus genau ein Gegenton. Nicht der Regenbogen.
 *      Ein Bild aus zwei benachbarten Toenen wirkt wie ein Raum mit einer
 *      Lichtquelle; ein Bild aus sechs Toenen wirkt wie ein Aufkleberbogen.
 *      Der Gegenton kommt nur in den hellsten Baendern vor - er ist der
 *      Akzent, nicht der zweite Hauptdarsteller.
 *   2. Dunkler Grund. Auf einem Beamer in einem dunklen Raum leuchtet eine
 *      gesaettigte Farbe nur, wenn ringsum fast nichts ist. Dieselbe Farbe auf
 *      mittelhellem Grund ist einfach nur bunt. Deshalb traegt hier die
 *      *Helligkeit* den Kontrast und nicht der Farbton.
 *   3. Keine mittelhellen warmen Toene. Blau, Violett, Magenta, Tuerkis und
 *      Saeuregruen bleiben auch stark gesaettigt sauber. Gelb, Orange und
 *      Olivgruen kippen dort ins Schmutzige - Bernstein kommt deshalb nur als
 *      Akzent vor, nie als Grundton grosser Flaechen.
 *
 * Jede Palette ist ein Paar aus Grundton und Gegenton. Welche ein Track
 * bekommt, entscheidet seine Kennung - also immer dieselbe fuer denselben
 * Track, aber ueber den Abend verteilt.
 */
/*
 * Acht Paletten - und diesmal nicht nach Gefuehl, sondern nach dem, was zu
 * Farbpraeferenz tatsaechlich untersucht ist.
 *
 * Drei Befunde tragen die Auswahl:
 *
 *   1. Die gemittelte Vorliebe ueber den Farbkreis ist nicht flach. Sie hat
 *      ein deutliches Hoch im Blau-Cyan-Bereich und ein ebenso deutliches
 *      Tief bei dunklem Gelb und Oliv (Palmer/Schloss). Die Erklaerung, die
 *      sie dafuer geben, ist die "oekologische Valenz": Vorliebe folgt dem,
 *      womit die Farbe in der Welt verbunden ist - klarer Himmel und sauberes
 *      Wasser auf der einen Seite, Faeulnis auf der anderen. Deshalb ist hier
 *      *jede* Palette kuehl grundiert, und Gelb kommt nur als heller Akzent
 *      vor, nie als dunkle Flaeche.
 *   2. Zwei Farben werden als stimmiger beurteilt, wenn sie im Farbton nah
 *      beieinander liegen, sich aber in der Helligkeit deutlich unterscheiden
 *      (Ou/Luo, Schloss/Palmer zu Farbpaaren). Genau so sind die Paare
 *      gebaut: kleiner Tonabstand, grosser Helligkeitsabstand. Der Kontrast
 *      kommt aus dem Licht, nicht aus dem Streit zweier Toene.
 *   3. Eine Tabelle, die im Kreis gelesen wird, braucht eine zyklische
 *      Kennlinie und gleiche wahrgenommene Schritte, sonst entstehen Kanten,
 *      die in den Daten nicht stehen (Kovesi zu Farbskalen). Deshalb Oklab
 *      und ein Kosinus ueber ganze Perioden.
 *
 * Die Tonwerte sind Oklab-Winkel, nicht HSL-Grade - sie sehen anders aus als
 * die gewohnten Zahlen und meinen auch etwas anderes.
 *
 * "baender" ist die Zahl der Hell-Dunkel-Perioden ueber einen Durchlauf. Sie
 * unterscheidet die Paletten nicht in der Farbe, sondern im *Rhythmus*: eine
 * mit drei breiten Baendern wirkt ruhig, eine mit fuenf schmalen treibend.
 */
const PALETTEN = [
  // Das Hoch der Praeferenzkurve, beide Toene mittendrin.
  { name: 'Tiefsee', grundton: 250, akzent: 200, baender: 3 },
  { name: 'Eisblau', grundton: 232, akzent: 168, baender: 4 },
  // Violett-Blau: knapp neben dem Hoch, dunkel sehr traegfaehig.
  { name: 'Nachtviolett', grundton: 300, akzent: 262, baender: 3 },
  { name: 'Amethyst', grundton: 318, akzent: 278, baender: 5 },
  // Gruen-Cyan: die zweite Spitze, kuehl genug fuer grosse Flaechen.
  { name: 'Polarlicht', grundton: 168, akzent: 208, baender: 4 },
  { name: 'Giftgruen', grundton: 142, akzent: 190, baender: 5 },
  // Magenta mit violettem Nachbarn - der einzige warme Grundton, und er liegt
  // auf der kuehlen Seite von Rot.
  { name: 'Magenta', grundton: 344, akzent: 300, baender: 3 },
  // Blau ins Violette - der ruhigste der acht, fuer lange Passagen.
  { name: 'Zwielicht', grundton: 272, akzent: 322, baender: 4 },
];


function palette(kennung, energie = 0.5) {
  const wuerfel = streuung(ausText(kennung || 'ohne'));
  const gewaehlt = PALETTEN[Math.floor(wuerfel() * PALETTEN.length) % PALETTEN.length];
  // Ein kleiner Versatz, damit zwei Tracks derselben Palette nicht identisch
  // aussehen. Klein genug, dass der Charakter bleibt.
  const versatz = Math.round((wuerfel() - 0.5) * 16);
  const grundton = (gewaehlt.grundton + versatz + 360) % 360;
  const akzent = (gewaehlt.akzent + versatz + 360) % 360;
  // Mit steigender Energie gesaettigter, aber nicht heller: Helligkeit ist auf
  // einer Leinwand im Dunkeln das knappe Gut.

  // Fuer die uebrigen Modi, die fertige Farbstrings erwarten. Auch sie kommen
  // jetzt aus Oklab - dieselbe Palette, dieselbe Gleichmaessigkeit.
  const rgb = (L, C, ton) => `rgb(${oklabZuRgb(L, C, ton).join(' ')})`;
  const bunt = 0.09 + energie * 0.05;
  return {
    name: gewaehlt.name,
    grundton,
    akzent,
    baender: gewaehlt.baender,
    toene: [
      rgb(0.5, bunt, grundton),
      rgb(0.42, bunt, grundton + 14),
      rgb(0.62, bunt * 0.9, akzent),
      rgb(0.36, bunt * 0.8, grundton - 16),
    ],
    hell: rgb(0.82, bunt * 0.8, akzent),
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
    // null = automatisch. Sonst der Name eines Modus, von Hand gewaehlt.
    this.modusZwang = null;
    this.zuletztGewaehlt = null;
    // Von Hand ausgeloester Drop - fuer die Abnahme und zum Vorfuehren.
    this.dropVonHand = false;

    /*
     * Die Bildguete.
     *
     * Der Regler im Fraktal passt sich zwar von allein an die gemessene Zeit
     * an, aber er kann nur eine Sache: kleiner rechnen und wieder groesser.
     * Was er nicht kann, ist die Leinwand selbst kleiner machen - und genau
     * die ist auf einem Tablet der grosse Posten. Ein iPad meldet die
     * doppelte Punktdichte, also viermal so viele Punkte, und zwar fuer
     * *alle* Schichten: Lava, Fraktal, Ringe, Schrift.
     *
     * Deshalb hier eine Stufe von Hand. Sie senkt beides zugleich - die
     * Punktdichte der Leinwand und die Obergrenze, bis zu der das Fraktal
     * rechnen darf.
     */
    this.guetestufe = 'hoch';
    try {
      const gemerkt = window.localStorage?.getItem('dj-bildguete');
      if (gemerkt && GUETESTUFEN[gemerkt]) this.guetestufe = gemerkt;
    } catch {
      // Kein Speicher, kein Problem - dann eben jedes Mal von vorn.
    }
    // Geglaettete Bildzeit, damit man auf dem Geraet sieht, was die Stufe tut.
    this.bildMs = 16;
    // Geglaetteter Abstand zwischen zwei Bildern - die Zahl, die zaehlt.
    this.abstandMs = 16.7;

    // Drei Rauschquellen, damit sich die Bewegungen nicht synchronisieren.
    this.n1 = rauschen(7919);
    this.n2 = rauschen(104729);
    this.n3 = rauschen(1299709);

    this.masseSetzen();
  }

  masseSetzen() {
    const stufe = GUETESTUFEN[this.guetestufe] ?? GUETESTUFEN.hoch;
    const dichte = Math.min(window.devicePixelRatio || 1, stufe.dichte);
    this.breite = this.leinwand.clientWidth;
    this.hoehe = this.leinwand.clientHeight;
    this.leinwand.width = Math.max(1, Math.round(this.breite * dichte));
    this.leinwand.height = Math.max(1, Math.round(this.hoehe * dichte));
    this.stift.setTransform(dichte, 0, 0, dichte, 0, 0);

    this.lavaLeinwand.width = Math.max(1, Math.round(this.breite / stufe.lava));
    this.lavaLeinwand.height = Math.max(1, Math.round(this.hoehe / stufe.lava));
  }

  /** Die Bildguete umstellen. Wirkt sofort und wird gemerkt. */
  gueteSetzen(name) {
    if (!GUETESTUFEN[name]) return;
    this.guetestufe = name;
    try {
      window.localStorage?.setItem('dj-bildguete', name);
    } catch {
      // s.o.
    }
    this.masseSetzen();
    gueteZuruecksetzen();
    // Den Messwert mit zuruecksetzen. Sonst zeigt die Anzeige nach dem
    // Umschalten noch sekundenlang die Zeit der alten Stufe - samt der Spitze,
    // die der neue Versuch auf der Grafikkarte kurz verursacht.
    this.bildMs = 16;
    // Geglaetteter Abstand zwischen zwei Bildern - die Zahl, die zaehlt.
    this.abstandMs = 16.7;
  }

  static guetestufen() {
    return Object.entries(GUETESTUFEN).map(([schluessel, g]) => ({ schluessel, name: g.name }));
  }

  modusFuer(track) {
    if (this.modusZwang && MODI[this.modusZwang]) return this.modusZwang;

    const schluessel = track?.id ?? track?.titel ?? 'leer';
    if (!this.modusFuerTrack.has(schluessel)) {
      const gewaehlt = modusAusTrack(track, this.zuletztGewaehlt);
      this.modusFuerTrack.set(schluessel, gewaehlt);
      this.zuletztGewaehlt = gewaehlt;
      this.naechsterModus++;
    }
    return this.modusFuerTrack.get(schluessel);
  }

  /**
   * Einen Drop von Hand ausloesen.
   *
   * Am Abend braucht das niemand, aber ohne diesen Griff laesst sich die
   * Wirkung eines Drops nicht messen: Man muesste warten, bis im Track einer
   * kommt, und haette dann keinen definierten Zeitpunkt.
   */
  dropAusloesen() {
    this.dropVonHand = true;
  }

  /** Von Hand festlegen, oder mit null zurueck auf automatisch. */
  modusSetzen(name) {
    this.modusZwang = name && MODI[name] ? name : null;
    // Die Huellkurven des Spektrums mit zuruecksetzen: Sie tragen den
    // Massstab der letzten Sekunden, und der gehoert zum vorigen Bild.
    spektrumZuruecksetzen();
    // Die Szenenfolge faengt von vorne an. Ohne das stuende beim Aufrufen
    // noch die Szene von vorhin im Bild, mitten in ihrer Bewegung.
    if (this.modusZwang === 'dolce') dolceZuruecksetzen();
  }

  /** Die Namen aller Modi - fuer die Auswahl auf der Buehne. */
  /*
   * Die Modi fuer die Auswahl auf der Buehne.
   *
   * Geheime bleiben draussen, solange sie nicht freigeschaltet sind. Ein
   * Easter Egg, das in einer Auswahlliste steht, ist keines - und der Sinn
   * dieses einen ist, dass jemand es findet.
   */
  static modusnamen(mitGeheimen = false) {
    return Object.entries(MODI)
      .filter(([, m]) => mitGeheimen || !m.geheim)
      .map(([schluessel, m]) => ({ schluessel, name: m.name }));
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
    const abbau = this.abbauBei(aktiv, takt);
    /*
     * Die Wucht kommt aus dem *rohen* Spektrum, das Bild aus dem
     * aufbereiteten.
     *
     * Der Unterschied ist wichtig: Die Aufbereitung normiert jedes Band auf
     * das, was es zuletzt hergegeben hat. Fuer das Bild ist das genau
     * richtig - man sieht dann auch ein Becken. Fuer ein Mass, das "wie laut
     * ist es gerade" heissen soll, waere es falsch, denn nach der Normierung
     * ist jede Passage gleich laut.
     */
    const wucht = this.pegelWucht(spektrum);
    if (spektrum) {
      if (!this.spektrumScharf || this.spektrumScharf.length !== spektrum.length) {
        this.spektrumScharf = new Uint8Array(spektrum.length);
      }
      spektrum = spektrumSchaerfen(spektrum, this.spektrumScharf, sekunden);
    }

    // Beim Drop: alles auf einmal. Das Signal geht auch an den Modus - das
    // Mandelbrot kehrt dabei seine Flugrichtung um, und damit hat der
    // staerkste Moment der Musik auch im Bild seinen staerksten Moment.
    const dropJetzt = Boolean(takt && this.dropErreicht(aktiv, takt)) || this.dropVonHand;
    this.dropVonHand = false;
    if (dropJetzt) this.ausbruch(spannung);
    if (takt) this.beatPruefen(takt, wucht);

    stift.clearRect(0, 0, breite, hoehe);

    const modus = MODI[this.modusFuer(aktiv?.track)] ?? MODI.iris;
    // Die Lava bleibt im Hintergrund - sie ist die Stimmung im Raum, kein
    // Effekt. Bringt ein Modus seine eigene Ebene mit, liegt sie unter dieser
    // Ebene und waere unsichtbar; dann wird sie gar nicht erst gerechnet.
    if (!modus.eigeneEbene) this.lavaZeichnen(aktiv, zweit, uebergang, spannung, wucht);
    const bildBegonnen = performance.now();
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
      drop: dropJetzt,
      abbau,
      // Ob ueberhaupt noch ein Drop kommt, auf den das Bild hinarbeiten kann.
      dropInSicht: this.dropVoraus(aktiv, takt) <= DROP_IN_SICHT,
      guetestufe: this.guetestufe,
      palette: this.paletteFuer(aktiv?.track),
      paletteB: zweit ? this.paletteFuer(zweit.track) : null,
      anteilB: uebergang ? uebergang.fortschritt : 0,
    });

    /*
     * Der Schatten-DJ - vor dem Bild, hinter der Schrift.
     *
     * Die Stelle ist gewaehlt und nicht zufaellig. Vor dem Modus stuende er
     * hinter dem Fraktal und waere unsichtbar; nach dem Schleier laege er
     * ueber der Schrift. Hier steht er da, wo ein echter DJ auch steht:
     * zwischen der Projektion und dem Publikum.
     *
     * Er bekommt dieselben Zahlen wie der Modus. Damit bewegt er sich zu
     * *dieser* Musik und nicht zu einem Zufallsgenerator - und im Breakdown
     * hoert er wirklich den naechsten Track vor, waehrend die Buehne ihn
     * wirklich laedt.
     */
    schattenZeichnen(stift, breite, hoehe, {
      sekunden,
      takt,
      spannung,
      abbau,
      wucht,
      drop: dropJetzt,
      anteilB: uebergang ? uebergang.fortschritt : 0,
      palette: this.paletteFuer(aktiv?.track),
      guetestufe: this.guetestufe,
    });

    // Ringe, Funken, Spannungsbogen und das Aufblitzen nach dem Drop gehoeren
    // zu den Modi, die von Bewegung im Bild leben. Ein Modus darf sie abwaehlen
    // - siehe die Begruendung beim Mandelbrot in visualmodi.js.
    if (modus.schmuck !== false) {
      this.ringeZeichnen(sekunden);
      this.funkenZeichnen(sekunden);
      this.spannungZeigen(spannung, aktiv);

      if (this.stossHalt > 0) {
        // Kurzes Aufblitzen nach dem Drop.
        stift.globalCompositeOperation = 'lighter';
        stift.fillStyle = `rgba(255,255,255,${this.stossHalt * 0.5})`;
        stift.fillRect(0, 0, breite, hoehe);
        stift.globalCompositeOperation = 'source-over';
      }
    } else {
      // Aufgeraeumt wird trotzdem, sonst stauen sich Ringe und Funken an und
      // stehen beim naechsten Moduswechsel alle auf einmal im Bild.
      this.ringe.length = 0;
      this.funken.length = 0;
    }
    if (this.stossHalt > 0) this.stossHalt = Math.max(0, this.stossHalt - sekunden * 3.5);

    // Wie lange ein Bild wirklich braucht. Traege geglaettet, damit die
    // Anzeige lesbar bleibt statt zu zappeln.
    const gebraucht = performance.now() - bildBegonnen;
    this.bildMs = this.bildMs * 0.9 + gebraucht * 0.1;
    /*
     * Der *Bildabstand* ist die ehrliche Zahl, nicht die Zeichendauer.
     *
     * Seit das Fraktal auf einer eigenen Ebene liegt, misst die Zeichendauer
     * nur noch den Ueberzug - Schleier und Schrift - und meldet deshalb
     * Traumwerte: auf dem Telefon 0,9 ms und 1088 Bilder je Sekunde. Das ist
     * keine Leistung, sondern eine Luecke in der Messung. Was der Zuschauer
     * sieht, ist der Abstand zwischen zwei Bildern, und der enthaelt alles:
     * die Grafikkarte, den Ueberzug und das Zusammensetzen der Ebenen.
     */
    this.abstandMs = this.abstandMs * 0.9 + Math.min(200, sekunden * 1000) * 0.1;
  }

  // --- Wo stehen wir im Takt? ---------------------------------------------

  taktLage(deck) {
    if (!deck?.laeuft || !deck.track?.bpm) return null;
    /*
     * Ueber die Tempo-Karte, nicht linear.
     *
     * Hier stand die alte Rechnung "(Stelle - Raster) / Beatdauer" - und die
     * gilt nur, wenn die ganze Datei ein Tempo hat. Bei einem Stundenmix aus
     * zwanzig Stuecken laeuft das Bild damit nach dem ersten Wechsel neben der
     * Musik, und zwar immer weiter daneben. Die Marken kommen aus derselben
     * Zaehlung wie beatBei; wer sie hier anders ausrechnet, sucht Drops auf
     * einer anderen Zeitachse, als sie eingetragen sind.
     */
    const beat = beatBei(deck.track, deck.stelle);
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

  /*
   * Der Breakdown - die Gegenbewegung zur Spannung.
   *
   * Bisher kannte das Bild nur das Anziehen vor dem Drop. Ein Stueck besteht
   * aber aus beidem, und der Breakdown ist die Stelle, an der die Leute Luft
   * holen. Wenn das Bild da genauso weitertreibt wie vorher, laeuft es gegen
   * die Musik - und die Zuschauer merken es, ohne sagen zu koennen, woran.
   *
   * Die Analyse hat die Stelle laengst gefunden und als Marke abgelegt; sie
   * lag nur ungenutzt herum. Der Wert steht auf 1, sobald ein Breakdown
   * beginnt, und faellt bis zur naechsten Marke wieder auf null.
   */
  abbauBei(deck, takt) {
    if (!takt || !deck?.track?.marken?.length) return 0;
    const marken = deck.track.marken;
    let laufend = null;
    let naechste = null;
    for (const m of marken) {
      if (m.beat <= takt.beat && (!laufend || m.beat > laufend.beat)) laufend = m;
      if (m.beat > takt.beat && (!naechste || m.beat < naechste.beat)) naechste = m;
    }
    if (!laufend || laufend.name !== 'breakdown') return 0;
    const ende = naechste ? naechste.beat : laufend.beat + 64;
    /*
     * Nach oben begrenzt - und das ist keine Vorsicht, sondern ein Fehler, den
     * die Stundenmixe sichtbar gemacht haben.
     *
     * In einem Stueck folgt auf eine Marke bald die naechste, und der Abstand
     * ist die Laenge des Breakdowns. In einem einstuendigen Mix findet die
     * Analyse stellenweise minutenlang keine Marke mehr - dann waere "die
     * Laenge bis zur naechsten Marke" ploetzlich vierhundert Beats, und das
     * Bild bliebe drei Minuten lang im Breakdown haengen. Mit der
     * Schwarzblende heisst das: drei Minuten Schwarz.
     *
     * Zweiunddreissig Takte sind das Laengste, was in dieser Musik ein
     * Breakdown ist. Was darueber hinausgeht, ist keine Atempause mehr,
     * sondern eine Luecke in den Marken - und eine Luecke soll nichts
     * ausloesen. Was dort wirklich still ist, faengt ohnehin die gemessene
     * Flaute ab (siehe FLAUTE_UNTER in visualmodi.js); die misst den Ton,
     * statt sich auf eine fehlende Marke zu verlassen.
     */
    const laenge = Math.min(BREAKDOWN_HOECHSTENS, Math.max(8, ende - laufend.beat));
    const gelaufen = (takt.beat - laufend.beat) / laenge;
    // Voll da, solange der Abschnitt laeuft, und zum Ende hin ausklingend -
    // dann zieht die Spannung ohnehin schon wieder an.
    return Math.max(0, Math.min(1, 1 - gelaufen * gelaufen));
  }

  /*
   * Wie weit ist der naechste Drop, in Beats? Unendlich, wenn keiner kommt.
   *
   * Das Bild braucht diese Zahl, um zu entscheiden, ob es im Breakdown ganz
   * auf Schwarz gehen darf. Der harte Einschlag lebt davon, dass danach etwas
   * kommt; ohne Drop ist er nur ein Bild, das ausgegangen ist.
   */
  dropVoraus(deck, takt) {
    if (!takt || !deck?.track?.marken?.length) return Infinity;
    let naechster = Infinity;
    for (const m of deck.track.marken) {
      if (m.name === 'drop' && m.beat > takt.beat) {
        naechster = Math.min(naechster, m.beat - takt.beat);
      }
    }
    return naechster;
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
