/*
 * Der Messstand.
 *
 * Die Frage, die er beantwortet, ist eine praktische: Was laesst sich auf
 * *diesem* Geraet zuverlaessig in guter Qualitaet abspielen? Auf der Buehne
 * ist sie nicht zu beantworten, und der Grund dafuer ist mir bei den
 * Mandala-Messungen selbst passiert: Dort aendern sich Tiefe, Aufloesung und
 * Mandala fortwaehrend, und jede gemessene Millisekunde ist eine Mischung aus
 * allen dreien. Meine erste Messreihe zeigte "Rosette 6: 46 ms, Linse 10: 3,5
 * ms" - und was sie in Wirklichkeit zeigte, war die Reihenfolge der Liste.
 *
 * Hier wird deshalb jede Groesse einzeln festgehalten:
 *
 *   Die Stelle    Immer dieselbe (Seepferdchental). Ein Stellenwechsel wirft
 *                 die Bezugsbahn weg, und die neu aufzubauen kostet Sekunden.
 *   Die Tiefe     Eine feste Leiter von 2 bis 16. Sie ist die wichtigste
 *                 Groesse ueberhaupt: Die Schrittzahl je Bildpunkt waechst mit
 *                 ihr, und die Schrittzahl ist die Arbeit.
 *   Die Schritte  Nicht frei gewaehlt, sondern so bestimmt, wie die Buehne sie
 *                 bestimmt - ueber die Stichprobe. Sonst misst der Messstand
 *                 eine Arbeit, die am Abend nie anfaellt.
 *   Die Flaeche   Drei Punktzahlen, abgeleitet aus dem wirklichen Bildschirm
 *                 dieses Geraets samt seiner Punktdichte.
 *   Das Mandala   Alle einundfuenfzig.
 *
 * Das volle Kreuzprodukt waere 51 x 8 x 3 = 1224 Messpunkte und dauerte eine
 * Dreiviertelstunde. Der kurze Durchgang misst stattdessen zwei Schnitte durch
 * den Wuerfel und setzt daraus ein Modell zusammen - und prueft es danach an
 * Punkten nach, die er nicht zum Bauen benutzt hat. Was dabei herauskommt,
 * steht als Fehler im Bericht. Ein Modell ohne diese Zahl waere eine
 * Behauptung.
 */

import {
  gpuBereit,
  gpuZeichnen,
  gpuAuskunft,
  gpuFarben,
  gpuProbe,
  gpuProbeVergessen,
  gpuZeitRoh,
  gpuAbwarten,
} from '../gemeinsam/mandelgpu.js';
import { MANDALAS, MANDEL_ZIELE, GUETESTUFEN, oklabZuRgb } from '../gemeinsam/visualmodi.js';

const $ = (id) => document.getElementById(id);

/* --- Der Plan ------------------------------------------------------------- */

// Die Tiefenleiter. Oben endet sie bei 16 - darueber traegt doppelte
// Genauigkeit auch mit Stoerungsrechnung nicht mehr weit genug, und die
// Buehne setzt vorher an einer neuen Stelle an.
const TIEFEN = [2, 4, 6, 8, 10, 12, 14, 16];
// Die beiden Tiefen, an denen alle Mandalas verglichen werden: eine flache und
// eine tiefe. Zwei genuegen, weil sich zeigen laesst (und im Bericht steht),
// dass der Aufwand eines Mandalas gegenueber der Rosette ueber die Tiefe
// nahezu konstant bleibt.
const VERGLEICHSTIEFEN = [6, 12];
// Das Mandala, gegen das alle anderen verrechnet werden. Die einfache Rosette
// ist die aelteste und die, die auf der Buehne am haeufigsten laeuft.
const BEZUG = MANDALAS.find((m) => m.id === 'rosette6') ?? MANDALAS[0];
// Wieviele Bilder je Messpunkt am Stueck gerechnet werden, und wie oft das
// wiederholt wird. Der Mittelwert waere anfaellig gegen einen einzelnen
// Aussetzer des Betriebssystems; genommen wird der Median der Wiederholungen.
const BILDER_JE_MESSUNG = 6;
const WIEDERHOLUNGEN = 3;
// Wieviel vom Bildtakt das Fraktal hoechstens verbrauchen darf. Der Rest geht
// fuer die Schrift darueber, das Zusammensetzen im Browser und die
// Tonanalyse drauf - gemessen auf der Buehne rund ein Viertel.
const BUDGETANTEIL = 0.7;

let abbruch = false;
let laeuft = false;

/* --- Werkzeug ------------------------------------------------------------- */

const median = (werte) => {
  const s = [...werte].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Dem Browser Luft lassen. Ohne das laeuft die Messung als ein einziger langer
// Block, die Seite friert ein, und das Betriebssystem faengt an, den Takt der
// Grafikkarte zu senken - was dann als Messergebnis erscheint.
const durchatmen = () => new Promise((f) => setTimeout(f, 0));

/**
 * Wie schnell frischt dieser Bildschirm auf?
 *
 * Nicht geraten. Ein 120-Hz-Telefon hat 8,3 ms, ein gewoehnlicher Monitor
 * 16,7, und ein Beamer mitunter 20 - und davon haengt ab, was "fluessig"
 * ueberhaupt heisst. Genommen wird der Median: Die ersten Bilder nach dem
 * Start sind regelmaessig zu lang.
 */
function bildtaktMessen() {
  return new Promise((fertig) => {
    const zeiten = [];
    let vorher = null;
    const schritt = (jetzt) => {
      if (vorher !== null) zeiten.push(jetzt - vorher);
      vorher = jetzt;
      if (zeiten.length < 60) requestAnimationFrame(schritt);
      else fertig(median(zeiten.slice(10)) ?? 16.7);
    };
    requestAnimationFrame(schritt);
  });
}

/**
 * Eine Farbtabelle, damit das Bild nicht grau ist.
 *
 * Auf die Rechenzeit hat sie keinen Einfluss - der Schattierer schlaegt in
 * jedem Fall genau einmal nach. Sie steht hier, weil ein Messstand, dessen
 * Bild aussieht wie ein Fehler, kein Vertrauen verdient.
 */
function farbenSetzen() {
  // Null bis 255, nicht null bis eins: gpuFarben schreibt die Werte direkt in
  // eine Bytetafel. Geteilt durch 255 waere die ganze Tabelle null und das
  // Bild schwarz - was an der gemessenen Zeit zwar nichts aendert, aber jeden
  // Zweifel an der Messung berechtigt aussehen liesse.
  const tabelle = new Float32Array(512 * 3);
  for (let i = 0; i < 512; i++) {
    const t = i / 511;
    const [r, g, b] = oklabZuRgb(0.2 + 0.62 * t, 0.13, 250 + t * 190);
    tabelle[i * 3] = r;
    tabelle[i * 3 + 1] = g;
    tabelle[i * 3 + 2] = b;
  }
  gpuFarben(tabelle);
}

/* --- Die Messung selbst --------------------------------------------------- */

const ZIEL = MANDEL_ZIELE[0];

function lageBauen(tiefe, punkte, schritte, mandala) {
  // Aus der Punktzahl ein Seitenverhaeltnis von 16:10 machen - dasselbe, in
  // dem die Buehne rechnet.
  const breite = Math.round(Math.sqrt(punkte * 1.6));
  const hoehe = Math.max(48, Math.round(breite / 1.6));
  return {
    breite,
    hoehe,
    ziel: ZIEL,
    tiefe,
    dreh: 0.37,
    schritte,
    versatz: 0.2,
    dichte: 1.2,
    innenHell: 0.4,
    // Die Flaeche steht schon in breite/hoehe; der Regler bleibt bei eins,
    // damit sie nicht ein zweites Mal skaliert wird.
    guete: 1,
    welle: 0,
    welleZeit: 0,
    // Volle Symmetrie - sonst waere die Faltung halb ausgeblendet und ihr
    // Aufwand nur halb gemessen.
    mandala: 1,
    sterne: mandala.achsen,
    faltArt: mandala.art,
    faltWert: mandala.wert ?? 0.5,
    fangAnteil: 0,
    reihe: true,
  };
}

/**
 * Die Bezugsbahn so weit wachsen lassen, wie die tiefste geplante Stelle sie
 * braucht.
 *
 * Sie waechst in Haeppchen, ein Haeppchen je Bild, und sie waechst auf dem
 * Hauptprozessor in Festkommaarithmetik - das ist die einzige wirklich teure
 * Vorbereitung. Einmal gemacht, gilt sie fuer den ganzen Durchgang, weil alle
 * Messpunkte dieselbe Stelle fahren.
 */
async function bahnAufbauen(schritte, melden) {
  /*
   * Auf der kleinstmoeglichen Flaeche, und das ist der Punkt.
   *
   * Die Bahn waechst um ein Haeppchen je Aufruf, und ein Aufruf ist ein
   * gerechnetes Bild. Wie gross dieses Bild ist, geht die Bahn nichts an -
   * sie haengt nur an der Zahl der Schritte. Zuerst stand hier eine
   * Viertelmillion Bildpunkte, weil es "realistisch" schien; auf der
   * Software-Nachbildung dauerte allein das Aufbauen dadurch vier Minuten,
   * bevor die erste Messung ueberhaupt anfing. Vierhundert Bilder, von denen
   * nur der Nebeneffekt gebraucht wird, rechnet man klein.
   *
   * 64 x 48 ist das Kleinste, was der Zeichner zulaesst.
   */
  const lage = lageBauen(TIEFEN[TIEFEN.length - 1], 64 * 48, schritte, BEZUG);
  const wunsch = Math.ceil(schritte * 1.3);
  let vorher = -1;
  for (let i = 0; i < 600; i++) {
    const bild = gpuZeichnen(lage);
    if (bild.bahnSchritte === vorher) break;
    vorher = bild.bahnSchritte;
    if (i % 10 === 0) {
      melden(`Bezugsbahn: ${bild.bahnSchritte} von rund ${wunsch} Schritten`);
      await durchatmen();
    }
  }
  gpuAbwarten();
  return vorher;
}

/**
 * Wieviele Schritte braucht diese Tiefe wirklich?
 *
 * Dieselbe Rechnung wie auf der Buehne, damit der Messstand die Arbeit misst,
 * die am Abend anfaellt, und nicht eine erfundene. Die Stichprobe arbeitet
 * ueber einen Ring der letzten achtzig Punkte, also wird sie mehrfach
 * aufgerufen, bis der Ring voll ist.
 */
async function schritteFuer(tiefe) {
  gpuProbeVergessen();
  let letzte = null;
  for (let i = 0; i < 30; i++) {
    letzte = gpuProbe(tiefe, 0.37, 15000, 200000);
    if (letzte && letzte.punkte >= 45) break;
    await durchatmen();
  }
  const noetig = letzte?.schritteNoetig ?? 0;
  // Die Formel der Buehne, ohne den Anteil, der vom Regler abhaengt: Der
  // Regler ist genau das, was hier bestimmt werden soll.
  return {
    schritte: Math.round(Math.min(15000, Math.max(700, noetig * 1.2, 400 + tiefe * 110))),
    noetig,
    innenAnteil: letzte?.innenAnteil ?? null,
  };
}

/**
 * Ein Messpunkt.
 *
 * Gemessen wird die Wanduhr um einen Stapel Bilder, abgeschlossen durch einen
 * Lesezugriff. Der Lesezugriff ist der Kern der Sache: Ohne ihn kehrt
 * drawArrays zurueck, sobald der Befehl in der Warteschlange steht, und
 * gemessen waere das Einreihen statt das Rechnen. Verteilt auf sechs Bilder
 * faellt seine eigene Wartezeit kaum ins Gewicht.
 *
 * Wo der Browser die Zeitmess-Erweiterung herausgibt, wird zusaetzlich die
 * Karte selbst gefragt. Safari tut das nicht - deshalb ist die Wanduhr die
 * fuehrende Zahl und die Karte die Gegenprobe.
 */
async function messpunkt(tiefe, punkte, schritte, mandala) {
  const lage = lageBauen(tiefe, punkte, schritte, mandala);

  // Aufwaermen: die Flaeche umstellen, die Reihe neu bauen, den Treiber
  // wachruetteln. Die ersten Bilder nach einem Wechsel sind immer die
  // langsamsten und gehoeren nicht in die Messung. Das letzte Aufwaermbild
  // wird mitgestoppt - daran haengt die Entscheidung, wie oft ueberhaupt
  // wiederholt wird.
  gpuZeichnen(lage);
  gpuZeichnen(lage);
  gpuAbwarten();
  const vorProbe = performance.now();
  gpuZeichnen(lage);
  gpuAbwarten();
  const probeMs = performance.now() - vorProbe;

  /*
   * Wie oft wiederholt wird, haengt davon ab, wie teuer ein Bild ist.
   *
   * Bei einem Bild von zwei Millisekunden ist die Messung Rauschen und
   * braucht Wiederholungen. Bei einem Bild von zweihundert steht die Antwort
   * nach dem ersten fest, und achtzehn weitere kosten nur Zeit - vier
   * Minuten fuer eine Zahl, deren erste Stelle sich nicht mehr aendert.
   */
  const teuer = probeMs > 120;
  const bilder = teuer ? 1 : BILDER_JE_MESSUNG;
  const runden = teuer ? 1 : WIEDERHOLUNGEN;

  const wandWerte = [probeMs];
  const kartenWerte = [];
  for (let w = 0; w < runden; w++) {
    if (abbruch) break;
    const vor = performance.now();
    for (let i = 0; i < bilder; i++) gpuZeichnen(lage);
    gpuAbwarten();
    wandWerte.push((performance.now() - vor) / bilder);
    const karte = gpuZeitRoh();
    if (karte.ms !== null) kartenWerte.push(karte.ms);
    await durchatmen();
  }

  return {
    tiefe,
    punkte,
    schritte,
    mandala: mandala.id,
    wandMs: median(wandWerte),
    kartenMs: kartenWerte.length ? median(kartenWerte) : null,
    grob: teuer,
  };
}

/*
 * Was zu teuer ist, wird nicht gemessen, sondern geschaetzt und vermerkt.
 *
 * Auf einem schwachen Geraet kostet ein Bild bei Tiefe 16 und vierfacher
 * Ueberabtastung leicht mehrere Sekunden. Es auszumessen dauerte dann
 * eine Viertelstunde und lieferte eine Zahl, die niemand braucht: Dass es
 * nicht geht, steht nach der ersten Sekunde fest.
 *
 * Also wird vorher hochgerechnet - aus dem Durchsatz, den die billigeren
 * Punkte desselben Durchgangs schon ergeben haben. Wer eine Zeile
 * "geschaetzt" im Bericht sieht, weiss, woran er ist; wer eine Zeile
 * "gemessen" sieht, auch. Was es nicht geben darf, ist eine geschaetzte
 * Zahl, die wie eine gemessene aussieht.
 */
const UEBERSPRINGEN_AB_MS = 2500;


/* --- Der Durchgang -------------------------------------------------------- */

function flaechenBestimmen() {
  /*
   * Die drei Punktzahlen kommen aus dem wirklichen Bildschirm, nicht aus einer
   * Tabelle. Eine feste Zahl waere auf dem Telefon etwas voellig anderes als
   * auf dem Beamer.
   *
   * Wichtig ist, welche Groesse hier gilt - ich hatte zuerst die falsche
   * genommen. Die Punktdichte des Geraets (devicePixelRatio) betrifft die
   * *Schriftebene*, die 2D-Leinwand darueber. Das Fraktal rechnet in einer
   * eigenen Leinwand, und deren Kantenlaenge ist Bildschirmkante mal
   * "fraktal" der Guetestufe - unabhaengig von der Punktdichte. Bei "Hoch"
   * steht dort eine 2, und das ist kein Tippfehler: Doppelte Kantenlaenge
   * heisst vierfache Punktzahl, also Ueberabtastung. Genau die braucht ein
   * Fraktal, dessen Baender in der Tiefe feiner werden als ein Bildpunkt.
   *
   * Wer stattdessen mit der Punktdichte rechnet, bekommt auf einem gewoehnlichen
   * Monitor fuer "Hoch" und "Mittel" fast dieselbe Flaeche heraus und misst
   * anschliessend, dass die Guetestufe nichts bringt.
   */
  const breite = window.innerWidth;
  const hoehe = window.innerHeight;
  return Object.entries(GUETESTUFEN).map(([schluessel, stufe]) => {
    const kante = stufe.fraktal;
    const punkte = Math.max(20000, Math.round(breite * hoehe * kante * kante));
    return { schluessel, name: stufe.name, punkte, kante, budget: stufe.budget };
  });
}

async function durchgang(gruendlich) {
  abbruch = false;
  laeuft = true;
  $('kurz').disabled = true;
  $('voll').disabled = true;
  $('abbrechen').hidden = false;
  $('laufAnzeige').hidden = false;
  $('ergebnis').hidden = true;

  const melden = (text, anteil = null) => {
    $('laufText').textContent = text;
    if (anteil !== null) $('balken').style.width = `${Math.round(anteil * 100)}%`;
  };

  const auskunft = gpuAuskunft();
  const taktMs = await bildtaktMessen();
  const flaechen = flaechenBestimmen();

  melden('Schrittzahlen bestimmen …', 0.02);
  const schrittPlan = new Map();
  for (const tiefe of TIEFEN) {
    schrittPlan.set(tiefe, await schritteFuer(tiefe));
    if (abbruch) break;
  }

  const tiefsteSchritte = Math.max(...[...schrittPlan.values()].map((s) => s.schritte));
  await bahnAufbauen(tiefsteSchritte, (t) => melden(t, 0.04));

  /*
   * Aufwaermen, und zwar richtig - der erste Messpunkt zahlt sonst fuer alle.
   *
   * Nachgemessen und zuerst nicht geglaubt: Bei der kleinsten Flaeche kostete
   * Tiefe 2 vierhundert Millisekunden und Tiefe 16 nur zweihundert. Die Kurve
   * lief also rueckwaerts, und das kann sie nicht - mehr Schritte je Bildpunkt
   * sind mehr Arbeit, immer.
   *
   * Die Erklaerung ist der Kaltstart. Der erste Messpunkt ist der billigste
   * (die Liste wird von billig nach teuer abgearbeitet), und genau er bezahlt
   * die einmaligen Kosten: Der Treiber uebersetzt den Schattierer fuer diese
   * Karte fertig, legt Puffer an, faehrt seinen Takt hoch. Verteilt auf drei
   * Aufwaermbilder war das immer noch der groessere Teil der Messung.
   *
   * Also vorher dreissig Bilder, deren Ergebnis niemand ansieht.
   */
  {
    const kleinste = flaechen.reduce((a, b) => (a.punkte <= b.punkte ? a : b));
    const lage = lageBauen(8, kleinste.punkte, schrittPlan.get(8).schritte, BEZUG);
    for (let i = 0; i < 30; i++) {
      if (abbruch) break;
      gpuZeichnen(lage);
      if (i % 6 === 5) {
        gpuAbwarten();
        melden('Warmlaufen …', 0.05 + 0.03 * (i / 30));
        await durchatmen();
      }
    }
    gpuAbwarten();
  }

  /*
   * Erst den ganzen Plan aufstellen, dann von billig nach teuer abarbeiten.
   *
   * Die Reihenfolge ist nicht Kosmetik. Sie erlaubt es, den Durchsatz des
   * Geraets schon aus den ersten Punkten zu kennen - und damit vor jedem
   * weiteren Punkt zu sagen, was er kosten wird. Was ueber der Grenze liegt,
   * wird uebersprungen und als Schaetzung vermerkt statt ausgesessen.
   *
   * Ohne das ist der Messstand auf schwacher Hardware unbenutzbar: Genau die
   * Geraete, die eine Antwort am dringendsten brauchen, muessten am laengsten
   * darauf warten.
   */
  const tiefenFuerMandalas = gruendlich ? TIEFEN : VERGLEICHSTIEFEN;
  const plan = [];
  for (const flaeche of flaechen) {
    for (const tiefe of TIEFEN) {
      plan.push({ art: 'kurve', tiefe, flaeche, mandala: BEZUG });
    }
  }
  /*
   * Die Mandalas werden auf der *kleinsten* Flaeche verglichen, nicht auf der
   * mittleren - und das ist kein Sparen an der falschen Stelle.
   *
   * Gesucht ist ein Verhaeltnis: Was kostet diese Faltung gegenueber der
   * Rosette? Ein Verhaeltnis braucht keine grosse Flaeche, es braucht nur
   * dieselbe Flaeche fuer beide. Auf der grossen gemessen war die Rechnung im
   * ersten Anlauf teuer genug, dass dreiunddreissig von einundfuenfzig
   * Mandalas uebersprungen wurden - und ohne Messwert gibt es keinen Faktor,
   * also stand die halbe Tabelle leer. Genau die Geraete, fuer die der
   * Messstand gebaut ist, haetten am wenigsten erfahren.
   *
   * Dass sich das Verhaeltnis auf die grossen Flaechen uebertragen laesst, ist
   * eine Annahme - und genau die prueft die Gegenprobe weiter unten nach.
   */
  const sparsam = flaechen.reduce((a, b) => (a.punkte <= b.punkte ? a : b));
  for (const m of MANDALAS) {
    for (const tiefe of tiefenFuerMandalas) {
      plan.push({ art: 'mandala', tiefe, flaeche: sparsam, mandala: m });
    }
  }
  /*
   * Die Gegenprobe geht ueber *andere* Flaechen als die, auf denen die
   * Faktoren entstanden sind. Sonst prueft sie die eine Annahme nicht, auf der
   * das ganze Modell steht.
   */
  {
    const gemischt = [...MANDALAS].sort(() => Math.random() - 0.5).slice(0, 6);
    let i = 0;
    for (const m of gemischt) {
      // Flache Tiefen: Die Gegenprobe soll auch auf einem schwachen Geraet
      // wirklich gemessen werden koennen. Was sie prueft, ist der Uebertrag
      // zwischen den Flaechen, nicht das Verhalten in der Tiefe - das steht
      // schon in der Kurve.
      const tiefe = [4, 6, 8, 10][i % 4];
      plan.push({ art: 'probe', tiefe, flaeche: flaechen[i % flaechen.length], mandala: m });
      i++;
    }
  }
  for (const eintrag of plan) {
    eintrag.schritte = schrittPlan.get(eintrag.tiefe).schritte;
    eintrag.arbeit = eintrag.flaeche.punkte * eintrag.schritte;
  }
  plan.sort((a, b) => a.arbeit - b.arbeit);

  const kurve = [];
  const mandalaPunkte = [];
  const probe = [];
  let durchsatzSchaetzung = null; // Punkt-Schritte je Millisekunde
  let uebersprungen = 0;

  for (let i = 0; i < plan.length; i++) {
    if (abbruch) break;
    const e = plan[i];
    melden(
      `${e.mandala.name}, Tiefe ${e.tiefe}, ${e.flaeche.name}` +
        (uebersprungen ? ` · ${uebersprungen} übersprungen` : ''),
      0.1 + 0.9 * (i / plan.length),
    );

    const geschaetztMs = durchsatzSchaetzung ? e.arbeit / durchsatzSchaetzung : 0;
    let punkt;
    if (geschaetztMs > UEBERSPRINGEN_AB_MS) {
      punkt = {
        tiefe: e.tiefe,
        punkte: e.flaeche.punkte,
        schritte: e.schritte,
        mandala: e.mandala.id,
        wandMs: geschaetztMs,
        kartenMs: null,
        geschaetzt: true,
      };
      uebersprungen++;
    } else {
      punkt = await messpunkt(e.tiefe, e.flaeche.punkte, e.schritte, e.mandala);
      if (punkt.wandMs > 0) {
        // Traege nachziehen: Ein einzelner Ausreisser soll die Schaetzung
        // nicht kippen, ein echter Trend aber schon.
        const jetzt = e.arbeit / punkt.wandMs;
        durchsatzSchaetzung =
          durchsatzSchaetzung === null ? jetzt : durchsatzSchaetzung * 0.6 + jetzt * 0.4;
      }
    }
    punkt.flaeche = e.flaeche.schluessel;
    if (e.art === 'kurve') kurve.push(punkt);
    else if (e.art === 'mandala') mandalaPunkte.push(punkt);
    else probe.push(punkt);
  }


  laeuft = false;
  $('kurz').disabled = false;
  $('voll').disabled = false;
  $('abbrechen').hidden = true;
  $('laufAnzeige').hidden = true;

  return {
    abgebrochen: abbruch,
    gruendlich,
    auskunft,
    taktMs,
    flaechen,
    // Die Flaeche, auf der die Mandalas untereinander verglichen wurden.
    sparsam,
    uebersprungen,
    schrittPlan: [...schrittPlan.entries()].map(([tiefe, s]) => ({ tiefe, ...s })),
    kurve,
    mandalaPunkte,
    probe,
    tiefenFuerMandalas,
  };
}

/* --- Auswertung ----------------------------------------------------------- */

function auswerten(roh) {
  const budgetMs = roh.taktMs * BUDGETANTEIL;

  // Die Tiefenkurve als Nachschlagewerk: Flaeche -> Tiefe -> ms.
  const kurve = new Map();
  const geschaetzt = new Map();
  for (const p of roh.kurve) {
    if (!kurve.has(p.flaeche)) {
      kurve.set(p.flaeche, new Map());
      geschaetzt.set(p.flaeche, new Map());
    }
    kurve.get(p.flaeche).set(p.tiefe, p.wandMs);
    geschaetzt.get(p.flaeche).set(p.tiefe, Boolean(p.geschaetzt));
  }
  // Der Bezug fuer die Mandala-Faktoren - nur die wirklich gemessenen Punkte.
  const bezugGemessen = new Map();
  for (const p of roh.kurve) {
    if (p.flaeche === roh.sparsam.schluessel && !p.geschaetzt) bezugGemessen.set(p.tiefe, p.wandMs);
  }

  /*
   * Der Faktor eines Mandalas.
   *
   * Gemessen an denselben Tiefen wie die Bezugsrosette, auf derselben Flaeche.
   * Genommen wird der Median ueber die Tiefen - stimmt die Annahme, dass der
   * Faktor tiefenunabhaengig ist, liegen die Einzelwerte nah beieinander, und
   * genau diese Streuung wird mit ausgewiesen. Ist sie gross, ist die Annahme
   * falsch, und das soll man sehen und nicht ueberlesen.
   */
  const faktoren = new Map();
  for (const m of MANDALAS) {
    /*
     * Nur gemessene Punkte, und nur gegen einen gemessenen Bezug.
     *
     * Ein geschaetzter Punkt kennt das Mandala gar nicht - er ist Arbeit
     * geteilt durch Durchsatz. Sein "Faktor" waere per Konstruktion genau
     * eins, und je mehr uebersprungen wird, desto naeher rueckten alle
     * Mandalas an eins heran. Das saehe nach einem Befund aus ("alle gleich
     * teuer") und waere doch nur das Echo der eigenen Schaetzung.
     */
    const eigene = roh.mandalaPunkte.filter((p) => p.mandala === m.id && !p.geschaetzt);
    const werte = eigene
      .map((p) => {
        const bezug = bezugGemessen.get(p.tiefe);
        return bezug ? p.wandMs / bezug : null;
      })
      .filter((x) => x !== null);
    if (!werte.length) continue;
    faktoren.set(m.id, {
      faktor: median(werte),
      streuung: werte.length > 1 ? (Math.max(...werte) - Math.min(...werte)) / median(werte) : 0,
      werte,
    });
  }

  const vorhersage = (mandalaId, tiefe, flaeche) => {
    const basis = kurve.get(flaeche)?.get(tiefe);
    const f = faktoren.get(mandalaId)?.faktor;
    return basis && f ? basis * f : null;
  };

  /*
   * Die Gegenprobe: Was sagt das Modell, was war wirklich?
   *
   * Geschaetzte Punkte fliegen raus. Sie wurden ja gerade *nicht* gemessen,
   * sondern aus dem Durchsatz hochgerechnet - ein Modell gegen eine Schaetzung
   * zu halten, die aus demselben Durchsatz stammt, ergaebe eine schoene kleine
   * Abweichung und keinerlei Erkenntnis.
   */
  const abweichungen = roh.probe
    .filter((p) => !p.geschaetzt)
    .map((p) => {
      const gesagt = vorhersage(p.mandala, p.tiefe, p.flaeche);
      return gesagt ? Math.abs(gesagt - p.wandMs) / p.wandMs : null;
    })
    .filter((x) => x !== null);

  /*
   * Bis zu welcher Tiefe traegt ein Mandala auf einer Flaeche?
   *
   * Zurueck kommt die tiefste Stufe der Leiter, die noch ins Budget passt.
   * "Unter der flachsten" heisst 0 - dann ist diese Guetestufe fuer dieses
   * Mandala auf diesem Geraet nichts.
   */
  const traegtBis = (mandalaId, flaeche) => {
    let letzte = 0;
    for (const tiefe of TIEFEN) {
      const ms = vorhersage(mandalaId, tiefe, flaeche);
      if (ms === null) return null;
      if (ms > budgetMs) break;
      letzte = tiefe;
    }
    return letzte;
  };

  const jeMandala = MANDALAS.map((m) => ({
    ...m,
    faktor: faktoren.get(m.id)?.faktor ?? null,
    streuung: faktoren.get(m.id)?.streuung ?? null,
    tiefen: Object.fromEntries(roh.flaechen.map((f) => [f.schluessel, traegtBis(m.id, f.schluessel)])),
  }));

  /*
   * Der Durchsatz - die eine Zahl, die sich vergleichen laesst.
   *
   * Millisekunden gelten nur fuer eine bestimmte Flaeche und Schrittzahl.
   * Punkt-Schritte je Millisekunde gelten fuer das Geraet. Damit laesst sich
   * das iPad mit dem Partyrechner vergleichen, ohne dass beide dasselbe
   * gemessen haben muessen.
   */
  // Nur gemessene Punkte. Ein geschaetzter Punkt ist aus dem Durchsatz
  // gerechnet - ihn zurueck in den Durchsatz zu stecken hiesse, die eigene
  // Annahme zu bestaetigen.
  const durchsaetze = roh.kurve
    .filter((p) => p.wandMs > 0 && !p.geschaetzt)
    .map((p) => (p.punkte * p.schritte) / p.wandMs / 1e6);
  const durchsatz = median(durchsaetze) ?? 0;

  return {
    budgetMs,
    kurve,
    geschaetzt,
    faktoren,
    jeMandala,
    abweichungen,
    durchsatz,
    vorhersage,
    traegtBis,
    // Wieviel von der Tabelle gemessen und wieviel hochgerechnet ist. Steht im
    // Urteil, damit niemand eine geschaetzte Zeile fuer eine gemessene haelt.
    geschaetzteAnteile: {
      kurve: roh.kurve.filter((p) => p.geschaetzt).length,
      kurveGesamt: roh.kurve.length,
      mandalas: roh.mandalaPunkte.filter((p) => p.geschaetzt).length,
      mandalasGesamt: roh.mandalaPunkte.length,
    },
  };
}

/* --- Anzeige -------------------------------------------------------------- */

function stufeFuer(ms, budgetMs) {
  if (ms === null) return '';
  if (ms <= budgetMs) return 'gut';
  if (ms <= budgetMs * 2) return 'mittel';
  return 'schlecht';
}

function tabelleTiefe(roh, aus) {
  const t = $('tiefeTabelle');
  t.innerHTML = '';
  const kopf = t.createTHead().insertRow();
  kopf.insertCell().textContent = 'Tiefe';
  for (const f of roh.flaechen) {
    const z = kopf.insertCell();
    z.outerHTML = `<th>${f.name}<br><span style="opacity:.6">${(f.punkte / 1e6).toFixed(2)} MP</span></th>`;
  }
  const schritte = kopf.insertCell();
  schritte.outerHTML = '<th>Schritte</th>';

  const koerper = t.createTBody();
  for (const tiefe of TIEFEN) {
    const zeile = koerper.insertRow();
    zeile.insertCell().textContent = String(tiefe);
    for (const f of roh.flaechen) {
      const ms = aus.kurve.get(f.schluessel)?.get(tiefe) ?? null;
      const nurGeschaetzt = aus.geschaetzt.get(f.schluessel)?.get(tiefe) ?? false;
      const zelle = zeile.insertCell();
      // Ein vorangestelltes Ungefaehr-Zeichen. Was hochgerechnet ist, soll
      // nicht aussehen wie das, was gemessen wurde.
      zelle.textContent = ms === null ? '–' : `${nurGeschaetzt ? '≈' : ''}${ms.toFixed(1)}`;
      zelle.className = stufeFuer(ms, aus.budgetMs);
      if (nurGeschaetzt) zelle.title = 'hochgerechnet – zu teuer zum Ausmessen';
    }
    const plan = roh.schrittPlan.find((s) => s.tiefe === tiefe);
    zeile.insertCell().textContent = plan ? String(plan.schritte) : '–';
  }
}

function tabelleMandalas(roh, aus) {
  const t = $('mandalaTabelle');
  t.innerHTML = '';
  const kopf = t.createTHead().insertRow();
  for (const name of ['Mandala', 'Faktor', 'Streuung', ...roh.flaechen.map((f) => `bis Tiefe · ${f.name}`)]) {
    const z = kopf.insertCell();
    z.outerHTML = `<th>${name}</th>`;
  }
  const koerper = t.createTBody();
  // Nach Aufwand sortiert - oben steht, was billig ist.
  for (const m of [...aus.jeMandala].sort((a, b) => (a.faktor ?? 9) - (b.faktor ?? 9))) {
    const zeile = koerper.insertRow();
    zeile.insertCell().textContent = m.name;
    zeile.insertCell().textContent = m.faktor === null ? '–' : `${m.faktor.toFixed(2)}×`;
    zeile.insertCell().textContent = m.streuung === null ? '–' : `${(m.streuung * 100).toFixed(0)} %`;
    for (const f of roh.flaechen) {
      const bis = m.tiefen[f.schluessel];
      const zelle = zeile.insertCell();
      zelle.textContent = bis === null ? '–' : bis === 0 ? 'gar nicht' : String(bis);
      zelle.className = bis === null ? '' : bis >= 12 ? 'gut' : bis >= 6 ? 'mittel' : 'schlecht';
    }
  }
}

function urteilBauen(roh, aus) {
  const saetze = [];
  const karte = roh.auskunft.karte || roh.auskunft.karteRoh || 'unbekannt';
  saetze.push(['gut', `${karte} · Bildtakt ${roh.taktMs.toFixed(1)} ms (${Math.round(1000 / roh.taktMs)} Hz)`]);
  saetze.push([
    'gut',
    `Durchsatz ${aus.durchsatz.toFixed(1)} Millionen Punkt-Schritte je Millisekunde. ` +
      'Das ist die Zahl, mit der sich Geräte vergleichen lassen.',
  ]);

  // Die Empfehlung: die beste Guetestufe, auf der genug Mandalas tief genug
  // tragen. "Genug" heisst hier drei Viertel bis mindestens Tiefe 10 - flacher
  // wird die Fahrt langweilig, und mit weniger als drei Vierteln fehlt die
  // Abwechslung.
  let empfehlung = null;
  for (const f of roh.flaechen) {
    const tragen = aus.jeMandala.filter((m) => (m.tiefen[f.schluessel] ?? 0) >= 10).length;
    if (tragen >= MANDALAS.length * 0.75) {
      empfehlung = { flaeche: f, tragen };
      break;
    }
  }
  if (empfehlung) {
    saetze.push([
      'gut',
      `Empfehlung: Bildgüte „${empfehlung.flaeche.name}". Dort halten ` +
        `${empfehlung.tragen} von ${MANDALAS.length} Mandalas die volle Tiefe im Bildtakt.`,
    ]);
  } else {
    const beste = roh.flaechen[roh.flaechen.length - 1];
    const tragen = aus.jeMandala.filter((m) => (m.tiefen[beste.schluessel] ?? 0) >= 10).length;
    saetze.push([
      'schlecht',
      `Auch auf der niedrigsten Stufe halten nur ${tragen} von ${MANDALAS.length} Mandalas ` +
        'die volle Tiefe. Hier lohnt es sich, in der Auswahl auszudünnen – ' +
        'die Spalte „bis Tiefe" sagt, welche.',
    ]);
  }

  const g = aus.geschaetzteAnteile;
  if (g.kurve + g.mandalas > 0) {
    saetze.push([
      'offen',
      `${g.kurve + g.mandalas} von ${g.kurveGesamt + g.mandalasGesamt} Punkten waren zu teuer ` +
        'zum Ausmessen und sind aus dem Durchsatz hochgerechnet (in der Tabelle mit ≈). ' +
        'Dass sie nicht ins Budget passen, steht damit trotzdem fest.',
    ]);
  }

  const fehler = aus.abweichungen.length ? median(aus.abweichungen) : null;
  if (fehler === null) {
    saetze.push(['offen', 'Keine Gegenprobe gelaufen – die Vorhersagen sind ungeprüft.']);
  } else if (fehler < 0.15) {
    saetze.push([
      'gut',
      `Gegenprobe: das Modell trifft ungemessene Punkte auf ${(fehler * 100).toFixed(0)} % genau.`,
    ]);
  } else {
    saetze.push([
      'schlecht',
      `Gegenprobe: ${(fehler * 100).toFixed(0)} % daneben. Die Spalten „bis Tiefe" sind ` +
        'damit grobe Richtwerte, keine Zusagen – für harte Zahlen den gründlichen Durchgang fahren.',
    ]);
  }

  if (!roh.auskunft.zeitmessung) {
    saetze.push([
      'offen',
      'Dieser Browser gibt die Zeitmessung der Grafikkarte nicht heraus (Safari tut das nie). ' +
        'Gemessen wurde mit der Wanduhr und einem erzwungenen Lesezugriff – etwas grober, ' +
        'aber für den Vergleich untereinander gültig.',
    ]);
  }

  const kasten = $('urteil');
  kasten.innerHTML = '';
  const zeichen = { gut: '✓', schlecht: '✗', offen: '·' };
  for (const [art, satz] of saetze) {
    const zeile = document.createElement('div');
    zeile.className = `satz ${art}`;
    const marke = document.createElement('b');
    marke.textContent = zeichen[art];
    const text = document.createElement('span');
    text.textContent = satz;
    zeile.append(marke, text);
    kasten.append(zeile);
  }
  return empfehlung;
}

function berichtBauen(roh, aus) {
  const zeilen = [];
  zeilen.push(`Messstand ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
  zeilen.push(`Durchgang: ${roh.gruendlich ? 'gründlich' : 'kurz'}${roh.abgebrochen ? ' (ABGEBROCHEN)' : ''}`);
  zeilen.push('');
  zeilen.push(`Karte      ${roh.auskunft.karte || roh.auskunft.karteRoh || '?'}`);
  zeilen.push(`Hersteller ${roh.auskunft.hersteller || roh.auskunft.herstellerRoh || '?'}`);
  zeilen.push(`Browser    ${navigator.userAgent}`);
  zeilen.push(`Bildschirm ${window.innerWidth}x${window.innerHeight} @ ${window.devicePixelRatio || 1}x`);
  zeilen.push(`Bildtakt   ${roh.taktMs.toFixed(2)} ms, Budget fürs Fraktal ${aus.budgetMs.toFixed(2)} ms`);
  zeilen.push(`Zeitmessung der Karte: ${roh.auskunft.zeitmessung ? 'ja' : 'nein (Wanduhr)'}`);
  zeilen.push(`Durchsatz  ${aus.durchsatz.toFixed(2)} Mio. Punkt-Schritte/ms`);
  zeilen.push('');
  zeilen.push('Tiefenkurve (ms je Bild, Bezugsmandala Rosette 6):');
  zeilen.push(
    `  Tiefe  ${roh.flaechen.map((f) => `${f.name} (${(f.punkte / 1e6).toFixed(2)} MP)`.padStart(20)).join('')}  Schritte`,
  );
  for (const tiefe of TIEFEN) {
    const spalten = roh.flaechen
      .map((f) => {
        const ms = aus.kurve.get(f.schluessel)?.get(tiefe);
        return (ms === undefined ? '–' : ms.toFixed(1)).padStart(20);
      })
      .join('');
    const plan = roh.schrittPlan.find((s) => s.tiefe === tiefe);
    zeilen.push(`  ${String(tiefe).padStart(5)}${spalten}  ${plan ? plan.schritte : '–'}`);
  }
  zeilen.push('');
  zeilen.push(
    `Mandalas – Faktor gegenüber Rosette 6, gemessen auf "${roh.sparsam.name}" ` +
      `(${(roh.sparsam.punkte / 1e6).toFixed(2)} MP) bei Tiefe ${roh.tiefenFuerMandalas.join(' und ')}.`,
  );
  zeilen.push('Dahinter: bis zu welcher Tiefe es je Gütestufe ins Bildbudget passt.');
  for (const m of [...aus.jeMandala].sort((a, b) => (a.faktor ?? 9) - (b.faktor ?? 9))) {
    const tiefen = roh.flaechen
      .map((f) => `${f.name} bis ${m.tiefen[f.schluessel] ?? '?'}`)
      .join(', ');
    zeilen.push(
      `  ${m.name.padEnd(20)} ${(m.faktor ?? 0).toFixed(2)}×  (±${((m.streuung ?? 0) * 100).toFixed(0)} %)  ${tiefen}`,
    );
  }
  zeilen.push('');
  const fehler = aus.abweichungen.length ? median(aus.abweichungen) : null;
  zeilen.push(
    fehler === null
      ? 'Gegenprobe: keine.'
      : `Gegenprobe an ${aus.abweichungen.length} ungemessenen Punkten: ${(fehler * 100).toFixed(0)} % Abweichung im Median.`,
  );
  return zeilen.join('\n');
}

function anzeigen(roh) {
  const aus = auswerten(roh);
  $('ergebnis').hidden = false;
  const empfehlung = urteilBauen(roh, aus);
  $('geraet').textContent = [
    `Karte        ${roh.auskunft.karte || roh.auskunft.karteRoh || '?'}`,
    `Hersteller   ${roh.auskunft.hersteller || roh.auskunft.herstellerRoh || '?'}`,
    `Fassung      ${roh.auskunft.fassung}`,
    `Bildschirm   ${window.innerWidth}x${window.innerHeight} bei Punktdichte ${window.devicePixelRatio || 1}`,
    `Bildtakt     ${roh.taktMs.toFixed(2)} ms – Budget fürs Fraktal ${aus.budgetMs.toFixed(2)} ms`,
    `Zeitmessung  ${roh.auskunft.zeitmessung ? 'Karte' : 'Wanduhr (Safari gibt die Karte nicht heraus)'}`,
  ].join('\n');
  tabelleTiefe(roh, aus);
  tabelleMandalas(roh, aus);

  const fehler = aus.abweichungen.length ? median(aus.abweichungen) : null;
  $('probeText').textContent =
    fehler === null
      ? 'Keine Gegenprobe gelaufen.'
      : `An ${aus.abweichungen.length} Punkten nachgemessen, die nicht ins Modell eingegangen sind. ` +
        `Abweichung im Median ${(fehler * 100).toFixed(0)} %, schlimmstenfalls ` +
        `${(Math.max(...aus.abweichungen) * 100).toFixed(0)} %.`;

  const bericht = berichtBauen(roh, aus);
  $('bericht').textContent = bericht;

  $('kopieren').onclick = async () => {
    try {
      await navigator.clipboard.writeText(bericht);
      $('kopieren').textContent = 'Kopiert';
      setTimeout(() => ($('kopieren').textContent = 'Bericht kopieren'), 1500);
    } catch {
      // Ohne Zwischenablage bleibt der Text unten stehen und laesst sich
      // von Hand markieren. Kein Grund fuer eine Fehlermeldung.
      $('kopieren').textContent = 'Bitte unten markieren';
    }
  };

  $('uebernehmen').onclick = () => {
    /*
     * Die Empfehlung in die Buehne schreiben.
     *
     * Dasselbe Fach im Browser, das die Buehne liest - beides laeuft auf
     * demselben Geraet, und darum geht es ja: Die Wahl gehoert zum Geraet.
     * Uebernommen wird, was bis mindestens Tiefe 10 traegt; flacher wird die
     * Fahrt langweilig, bevor sie ruckelt.
     */
    const stufe = empfehlung?.flaeche ?? roh.flaechen[roh.flaechen.length - 1];
    const gute = aus.jeMandala
      .filter((m) => (m.tiefen[stufe.schluessel] ?? 0) >= 10)
      .map((m) => m.id);
    const nehmen = gute.length ? gute : aus.jeMandala.slice(0, 8).map((m) => m.id);
    localStorage.setItem('djMandalas', JSON.stringify(nehmen));
    localStorage.setItem('dj-bildguete', stufe.schluessel);
    $('uebernehmen').textContent =
      `Übernommen: ${nehmen.length} Mandalas, Güte „${stufe.name}"`;
  };

  // Fuer die Abnahme und fuers Nachschauen in der Konsole.
  window.__messstand = { roh, aus, bericht };
}

/* --- Start ---------------------------------------------------------------- */

if (!gpuBereit()) {
  $('laufAnzeige').hidden = false;
  $('laufText').textContent =
    'Dieses Gerät gibt kein WebGL2 heraus. Ohne Grafikkarte gibt es nichts zu messen – ' +
    'die Bühne läuft dann in der Notfassung auf dem Hauptprozessor.';
  $('kurz').disabled = true;
  $('voll').disabled = true;
} else {
  farbenSetzen();
  $('kurz').addEventListener('click', async () => {
    if (laeuft) return;
    anzeigen(await durchgang(false));
  });
  $('voll').addEventListener('click', async () => {
    if (laeuft) return;
    anzeigen(await durchgang(true));
  });
  $('abbrechen').addEventListener('click', () => {
    abbruch = true;
  });
}
