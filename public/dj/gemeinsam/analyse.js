// Echte Musik vermessen - im Browser, ohne Python, ohne ffmpeg.
//
// Beim Pruefstand ist alles bekannt, weil wir die Musik selbst erzeugen. Bei
// einem echten Track muss es herausgefunden werden, und zwar so genau, dass
// ein Uebergang auf der Phrasengrenze sitzt: Ein Beatraster, das um 30
// Millisekunden verrutscht ist, hoert man sofort als Eiern.
//
// Was hier herauskommt, hat dieselbe Form wie ein Pruefstand-Track. Deshalb
// muss der Mixer nichts davon wissen.
//
//   bpm          Tempo
//   raster       Sekunden bis zum ersten Downbeat
//   einstiegBeat erster Beat, an dem durchgehend eine Bassdrum laeuft
//   lufs         Lautheit nach EBU R128
//   angleichDb   was drauf muss, damit alle Tracks gleich laut sind
//   energie      0 bis 1, spaeter gegen die Bibliothek normiert
//   marken       Breakdown, Drop, Outro
//
// Die schweren Filter laufen ueber OfflineAudioContext - der Browser rechnet
// die um ein Vielfaches schneller als handgeschriebene Schleifen.

// Auf diese Lautheit wird alles gezogen. Clubniveau, mit genug Luft, damit
// zwei Tracks im Uebergang nicht in die Begrenzung laufen.
export const ZIEL_LUFS = -9;

// Aufloesung der Anschlagskurve. 5 ms statt 10: Bei 128 BPM ist ein Zehntel
// einer Sekunde schon ein Fuenfzigstel Beat, und dieser Rundungsfehler
// summiert sich ueber ein paar hundert Schlaege zu einem verschobenen Raster.
const HOPS_PRO_SEKUNDE = 200;
const BPM_VON = 70;
const BPM_BIS = 185;

/**
 * Vermisst einen dekodierten Track.
 * @param {AudioBuffer} puffer
 */
export async function analysiere(puffer, beiSchritt = () => {}) {
  const dauer = puffer.duration;

  beiSchritt('Lautheit');
  const lufs = await lautheitMessen(puffer);

  beiSchritt('Frequenzbaender');
  const baender = await baenderRendern(puffer);
  // Das Tiefband wird fuer Aufbau und Energie gebraucht. Es kommt aus
  // derselben Bank - ein eigener Rendervorgang dafuer waere verschenkt.
  const bass = baender[0];

  beiSchritt('Tempo');
  const { bpm, raster, vertrauen, anschlaege, hops } = rasterBestimmen(baender, puffer.sampleRate);
  const ohneRaster = vertrauen < VERTRAUENSSCHWELLE;

  beiSchritt('Aufbau');
  const takte = taktEnergien(bass, puffer.sampleRate, bpm, raster);
  const einstiegBeat = ohneRaster ? 0 : einstiegFinden(takte);
  const marken = ohneRaster ? [] : aufbauErkennen(takte, bpm, raster, einstiegBeat);

  beiSchritt('Energie');
  const hoehen = await bandRendern(puffer, 'highpass', 3000);
  const energie = energieSchaetzen(puffer, bass, hoehen, bpm, anschlaege, hops, vertrauen);

  beiSchritt('Verlauf');
  const profil = profilBauen(baender, anschlaege, hops, bpm, raster, puffer.sampleRate, ohneRaster);

  return {
    dauer,
    profil,
    bpm: Number(bpm.toFixed(2)),
    raster: Number(raster.toFixed(4)),
    // Wie sehr das Raster zu glauben ist, von 0 bis 1. Ohne diesen Wert meldet
    // die Messung bei Meeresrauschen 161 BPM - als Zahl nicht von einem echten
    // Tempo zu unterscheiden, und der Mixer wuerde blind darauf mischen.
    bpmVertrauen: Number(vertrauen.toFixed(3)),
    ohneRaster,
    einstiegBeat,
    lufs: Number(lufs.toFixed(1)),
    angleichDb: Number(angleichBegrenzen(ZIEL_LUFS - lufs).toFixed(2)),
    energie: Number(energie.toFixed(3)),
    marken,
  };
}

// Leises Material laesst sich nicht beliebig hochziehen. Eine Feldaufnahme bei
// -26 LUFS braeuchte +17 dB auf Clubpegel; damit kaeme das Rauschen der
// Aufnahme mit hoch und der Begrenzer haette dauernd zu tun. Ein DJ wuerde so
// ein Stueck leiser laufen lassen und es als Flaeche benutzen - genau das
// macht dieser Deckel.
const ANGLEICH_HOCH = 12;
const ANGLEICH_RUNTER = -12;

function angleichBegrenzen(db) {
  return Math.min(ANGLEICH_HOCH, Math.max(ANGLEICH_RUNTER, db));
}

// --- Der Verlauf ueber den Track ------------------------------------------
//
// Ein einziger Energiewert je Track sagt nur, welcher Track dran ist. Fuer
// einen Uebergang ist die falsche Frage - dort geht es darum, an *welcher
// Stelle* man einen Track verlaesst und an welcher man in den naechsten
// einsteigt. Ein Stueck mit zwei Minuten Ambient-Intro hat denselben
// Mittelwert wie eines, das sofort losgeht.
//
// Darum je Takt vier Zahlen. Das reicht, um ein Intro von einem Groove zu
// unterscheiden, und ist klein genug, um mit in die Datenbank zu gehen: Ein
// Sechsminueter hat rund 190 Takte.
//
//   e  Energie, auf den lautesten Takt des Tracks bezogen
//   b  Bassanteil - laeuft hier ein Fundament oder schwebt es nur?
//   h  Hoehenanteil - Hi-Hats und Percussion, das Kennzeichen von Fahrt
//   d  Anschlaege je Beat - wie dicht ist es hier?
function profilBauen(baender, anschlaege, hops, bpm, raster, rate, ohneRaster) {
  // Ohne Raster gibt es keine Takte. Dann wird in festen Zwei-Sekunden-
  // Abschnitten gerechnet, damit wenigstens der Verlauf stimmt.
  const taktSekunden = ohneRaster ? 2 : (60 / bpm) * 4;
  const versatz = ohneRaster ? 0 : raster;
  const laenge = baender[0].length;
  const takte = Math.floor((laenge / rate - versatz) / taktSekunden);
  if (!Number.isFinite(takte) || takte < 2) return [];

  const tief = [baender[0], baender[1]];
  const hoch = [baender[4], baender[5]];
  const effektiv = (felder, von, bis) => {
    let summe = 0;
    let zahl = 0;
    for (const feld of felder) {
      for (let i = von; i < bis; i += 4) {
        summe += feld[i] * feld[i];
        zahl++;
      }
    }
    return zahl > 0 ? Math.sqrt(summe / zahl) : 0;
  };

  const roh = [];
  for (let t = 0; t < takte; t++) {
    const von = Math.max(0, Math.floor((versatz + t * taktSekunden) * rate));
    const bis = Math.min(laenge, Math.floor((versatz + (t + 1) * taktSekunden) * rate));
    if (bis - von < rate * 0.05) break;

    const gesamt = effektiv(baender, von, bis);
    const unten = effektiv(tief, von, bis);
    const oben = effektiv(hoch, von, bis);

    // Anschlaege im selben Fenster zaehlen.
    let dichte = 0;
    const hVon = Math.floor(((versatz + t * taktSekunden) * hops));
    const hBis = Math.floor(((versatz + (t + 1) * taktSekunden) * hops));
    for (let i = Math.max(0, hVon); i < Math.min(anschlaege.length, hBis); i++) {
      if (anschlaege[i] > 0.08) dichte++;
    }

    roh.push({ gesamt, unten, oben, dichte: dichte / 4 });
  }

  let hoechste = 0;
  for (const r of roh) if (r.gesamt > hoechste) hoechste = r.gesamt;
  if (hoechste <= 0) return [];

  return roh.map((r) => ({
    e: Number((r.gesamt / hoechste).toFixed(3)),
    b: Number((r.gesamt > 0 ? r.unten / r.gesamt : 0).toFixed(3)),
    h: Number((r.gesamt > 0 ? r.oben / r.gesamt : 0).toFixed(3)),
    d: Number(r.dichte.toFixed(2)),
  }));
}

// --- Zwei Anlaeufe, und der bessere gewinnt --------------------------------
//
// Es gibt nicht die eine richtige Anschlagskurve, und das ist keine
// Bequemlichkeit, sondern nachgemessen:
//
//   Nur das Tiefband  trifft Material mit klarer Bassdrum und ohne Bassline
//                     exakt - aber eine Bassline auf Sechzehnteln macht aus
//                     128 BPM gemessene 102,4.
//   Alle Baender      haelt der Bassline stand, verliert aber bei Material
//                     mit viel Percussion in den Hoehen den Viertelpuls.
//
// Statt mich fuer eine Seite zu entscheiden und die andere Haelfte der Musik
// zu verlieren, laufen beide - und danach entscheidet ein Mass, das mit der
// Frage nichts zu tun hat: Wie viel Anschlagsenergie faengt das fertige Raster
// wirklich ein, verglichen mit einem zufaellig verschobenen? Das ist dieselbe
// Rechnung, an der auch das Vertrauen haengt, und sie beantwortet genau die
// Frage, um die es geht - nicht "welche Kurve ist schoener", sondern "welches
// Raster passt auf diesen Track".
//
// Bewertet wird immer auf *beiden* Kurven. Sonst gewaenne jeder Anlauf auf
// seiner eigenen Kurve, und der Vergleich waere keiner.
function rasterBestimmen(baender, rate) {
  const breit = anschlagskurve(baender, rate, true);
  // Der zweite Anlauf ist bewusst das alte Verfahren: nur der Bassbereich,
  // roher Effektivwert. Es war jahrelang richtig und ist es bei Material mit
  // klarer Bassdrum immer noch - nur eben nicht bei allem.
  const tief = anschlagskurve([baender[0], baender[1]], rate, false);

  const anlauf = (kurve, hops) => {
    const grob = tempoFinden(kurve, hops);
    const grobesRaster = rasterFinden(kurve, grob.bpm, grob.phase, hops);
    const { bpm, raster } = ausgleichen(kurve, grob.bpm, grobesRaster, hops);
    const punkte =
      rasterVertrauen(breit.kurve, bpm, raster, breit.hops) +
      rasterVertrauen(tief.kurve, bpm, raster, tief.hops);
    return { bpm, raster, punkte };
  };

  const kandidaten = [anlauf(breit.kurve, breit.hops), anlauf(tief.kurve, tief.hops)];
  const sieger = kandidaten[0].punkte >= kandidaten[1].punkte ? kandidaten[0] : kandidaten[1];

  // Gemeldet wird der bessere der beiden Werte, nicht der der breiten Kurve.
  //
  // Die Frage lautet "faengt dieses Raster die Anschlaege ein?" - und wenn es
  // das in einer der beiden Darstellungen ueberzeugend tut, ist die Antwort
  // ja. Auf die breite Kurve allein bezogen kamen bei Pruefstandmusik mit
  // exakt getroffenem Tempo Werte von 48 bis 86 Prozent heraus; das war nicht
  // Unsicherheit ueber das Raster, sondern darueber, welche Kurve man ansieht.
  return {
    bpm: sieger.bpm,
    raster: sieger.raster,
    vertrauen: Math.max(
      rasterVertrauen(breit.kurve, sieger.bpm, sieger.raster, breit.hops),
      rasterVertrauen(tief.kurve, sieger.bpm, sieger.raster, tief.hops),
    ),
    anschlaege: breit.kurve,
    hops: breit.hops,
  };
}

// --- Wie sehr ist dem Raster zu trauen? -----------------------------------
//
// Gefragt wird genau das, worauf es ankommt: Faengt das gefundene Raster die
// Anschlaege wirklich ein? Dazu wird abgezaehlt, wie viel Anschlagsenergie auf
// den Beats liegt, und das mit sechs absichtlich verschobenen Rastern
// verglichen. Die liefern den Zufallspegel.
//
// Ein Mass, das zwei ganz verschiedene Fehler faengt: Material ohne Beat, und
// Material mit Beat, bei dem die Tempoerkennung danebenlag. In beiden Faellen
// ist das Raster unbrauchbar, und in beiden Faellen ist es besser, das
// zuzugeben, als darauf zu mischen.
//
// Nachgemessen an sechs Stuecken - die Trennung ist deutlich:
//
//   Meeresrauschen (kein Beat)            0.94
//   weisses Rauschen                      1.01
//   174er-Track, Tempo falsch als 71 BPM  1.02
//   ---------------------------------------------- Grenze
//   Pruefstandmusik 118 BPM               3.37
//   Pruefstandmusik 124 BPM               4.30
//   Pruefstandmusik 128 BPM               4.46
//   Pruefstandmusik 132 BPM               4.48
//
// Ein zweites Mass war zwischenzeitlich mit drin: wie hoch die Spitze der
// Autokorrelation ueber ihrem Mittel steht. Es ist wieder heraus, weil die
// Messung es widerlegt hat - ausgerechnet der 174er-Track mit dem falsch
// erkannten Tempo hatte davon am meisten (4.89), waehrend der saubere
// 118er-Track am wenigsten hatte (1.98). Das Mass beantwortet eben eine
// andere Frage: ob sich *irgendein* Puls abhebt, nicht ob *dieses* Raster
// stimmt. Als Minimum verrechnet hat es vier von fuenf richtig erkannten
// Tracks faelschlich abgestempelt.
const VERTRAUENSSCHWELLE = 0.35;
const RASTER_ZUFALL = [0.17, 0.31, 0.43, 0.57, 0.69, 0.83];
// Unter so vielen Anschlaegen ist die Stichprobe zu klein fuer eine Aussage.
const RASTER_MINDESTANSCHLAEGE = 16;

function rasterVertrauen(kurve, bpm, raster, hops) {
  const periode = (hops * 60) / bpm;
  if (!Number.isFinite(periode) || periode < 2) return 0;

  let anschlaege = 0;
  for (const wert of kurve) if (wert > 0) anschlaege++;
  if (anschlaege < RASTER_MINDESTANSCHLAEGE) return 0;

  const einsammeln = (versatzBeats) => {
    let summe = 0;
    const start = raster * hops + versatzBeats * periode;
    for (let stelle = start; stelle < kurve.length; stelle += periode) {
      const mitte = Math.round(stelle);
      // Zwei Stuetzstellen Toleranz nach jeder Seite, also rund +-10 ms. Das
      // deckt die Restunschaerfe der Spitzenfindung ab, ohne so breit zu sein,
      // dass am Ende jedes Raster alles einsammelt.
      for (let d = -2; d <= 2; d++) summe += kurve[mitte + d] ?? 0;
    }
    return summe;
  };

  const aufDemRaster = einsammeln(0);
  let zufall = 0;
  for (const versatz of RASTER_ZUFALL) zufall += einsammeln(versatz);
  zufall /= RASTER_ZUFALL.length;
  if (zufall <= 0) return 0;

  // 1.3 bis 3.2 auf 0 bis 1. Die Schwelle von 0,35 liegt damit bei einer
  // Trefferquote von rund 1.97 - mitten in der Luecke zwischen 1.02 und 3.37.
  const trefferquote = aufDemRaster / zufall;
  return Math.min(1, Math.max(0, (trefferquote - 1.3) / 1.9));
}

// --- Lautheit nach EBU R128 -----------------------------------------------
//
// Der wichtigste Einzelwert. Uploads liegen zwischen -6 und -20 LUFS, und zwei
// Tracks mit zwoelf Dezibel Unterschied hintereinander sind haesslicher als
// jedes Codec-Artefakt.
//
// R128 misst nicht einfach die Leistung, sondern gewichtet vorher zwei Filter
// ein (die Ohren hoeren Baesse leiser) und laesst dann die stillen Stellen
// weg. Beides bilden wir nach - die Filter mit dem Browser, das Tor in JS.

async function lautheitMessen(puffer) {
  const ctx = new OfflineAudioContext(
    puffer.numberOfChannels,
    puffer.length,
    puffer.sampleRate,
  );
  const quelle = ctx.createBufferSource();
  quelle.buffer = puffer;

  // Stufe 1: Hochtonanhebung, die den Kopf des Hoerers nachbildet.
  const regal = ctx.createBiquadFilter();
  regal.type = 'highshelf';
  regal.frequency.value = 1681.97;
  regal.gain.value = 3.999;
  regal.Q.value = 0.7071;

  // Stufe 2: Hochpass, der die untersten Frequenzen herausnimmt.
  const hochpass = ctx.createBiquadFilter();
  hochpass.type = 'highpass';
  hochpass.frequency.value = 38.13;
  hochpass.Q.value = 0.5003;

  quelle.connect(regal).connect(hochpass).connect(ctx.destination);
  quelle.start();
  const gewichtet = await ctx.startRendering();

  // Bloecke von 400 ms mit 75 Prozent Ueberlappung, wie in der Norm.
  const rate = gewichtet.sampleRate;
  const blockLaenge = Math.round(0.4 * rate);
  const schritt = Math.round(blockLaenge / 4);
  const kanaele = [];
  for (let k = 0; k < gewichtet.numberOfChannels; k++) kanaele.push(gewichtet.getChannelData(k));

  const blockLautheiten = [];
  for (let start = 0; start + blockLaenge <= gewichtet.length; start += schritt) {
    let summe = 0;
    for (const daten of kanaele) {
      let teil = 0;
      for (let i = start; i < start + blockLaenge; i++) teil += daten[i] * daten[i];
      // Alle Kanaele mit Gewicht 1 - bei Stereo entspricht das der Norm.
      summe += teil / blockLaenge;
    }
    blockLautheiten.push(-0.691 + 10 * Math.log10(summe + 1e-12));
  }

  if (blockLautheiten.length === 0) return -70;

  // Erstes Tor: alles unter -70 LUFS ist Stille und zaehlt nicht.
  const ueberAbsolut = blockLautheiten.filter((l) => l > -70);
  if (ueberAbsolut.length === 0) return -70;

  // Zweites Tor: relativ zum Mittel, zehn Dezibel darunter abschneiden. Das
  // sorgt dafuer, dass leise Passagen einen lauten Track nicht kleinrechnen.
  const mittel = (werte) =>
    -0.691 +
    10 *
      Math.log10(
        werte.reduce((summe, l) => summe + 10 ** ((l + 0.691) / 10), 0) / werte.length + 1e-12,
      );

  const schwelle = mittel(ueberAbsolut) - 10;
  const uebrig = ueberAbsolut.filter((l) => l > schwelle);
  return uebrig.length > 0 ? mittel(uebrig) : mittel(ueberAbsolut);
}

// --- Ein Frequenzband herausrechnen ---------------------------------------

async function bandRendern(puffer, art, frequenz) {
  // Mono reicht und halbiert die Arbeit.
  const ctx = new OfflineAudioContext(1, puffer.length, puffer.sampleRate);
  const quelle = ctx.createBufferSource();
  quelle.buffer = puffer;

  // Zweimal filtern: eine einzelne Stufe laesst zu viel durch, und ein
  // weicher Uebergang verwischt genau die Kanten, die wir suchen.
  const a = ctx.createBiquadFilter();
  const b = ctx.createBiquadFilter();
  a.type = b.type = art;
  a.frequency.value = b.frequency.value = frequenz;
  a.Q.value = b.Q.value = 0.7071;

  quelle.connect(a).connect(b).connect(ctx.destination);
  quelle.start();
  const fertig = await ctx.startRendering();
  return fertig.getChannelData(0);
}

// --- Die Filterbank -------------------------------------------------------
//
// Sechs Baender auf einmal, in einem einzigen Rendervorgang. Jedes Band geht
// auf einen eigenen Kanal eines Merger-Knotens; danach liegen alle sechs als
// Kanaele desselben Puffers vor.
//
// Warum sechs Baender und nicht nur der Bass, wie vorher: Ein Kick ist
// breitbandig - er hat einen Klick oben und einen Koerper unten und taucht
// darum in mehreren Baendern gleichzeitig auf. Eine Bassnote ist schmalbandig
// und steht nur unten. Zaehlt man nur das Tiefband, sind beide nicht zu
// unterscheiden.
//
// Genau daran ist die Tempoerkennung an realistischem Material gescheitert:
// Mit einer Bassline auf Sechzehnteln wurden aus 128 BPM gemessene 102,4 -
// die Kurve war voller Anschlaege, die keine Beats waren.
const ANSCHLAG_BAENDER = [
  [20, 110],
  [110, 260],
  [260, 700],
  [700, 1800],
  [1800, 5000],
  [5000, 12000],
];

async function baenderRendern(puffer) {
  const rate = puffer.sampleRate;
  const hoechste = rate * 0.47; // knapp unter Nyquist, sonst rechnet der Filter Unsinn
  const ctx = new OfflineAudioContext(ANSCHLAG_BAENDER.length, puffer.length, rate);
  const quelle = ctx.createBufferSource();
  quelle.buffer = puffer;

  const verteiler = ctx.createChannelMerger(ANSCHLAG_BAENDER.length);

  ANSCHLAG_BAENDER.forEach(([von, bis], nummer) => {
    const stufe = (art, hz) => {
      const f = ctx.createBiquadFilter();
      f.type = art;
      f.frequency.value = Math.min(hz, hoechste);
      f.Q.value = 0.7071;
      return f;
    };
    // Je zwei Stufen pro Flanke - eine einzelne laesst zu viel vom Nachbarband
    // durch, und dann waere die Trennung wertlos.
    const kette = [stufe('highpass', von), stufe('highpass', von), stufe('lowpass', bis), stufe('lowpass', bis)];
    let letzter = quelle;
    for (const knoten of kette) letzter = letzter.connect(knoten);
    letzter.connect(verteiler, 0, nummer);
  });

  verteiler.connect(ctx.destination);
  quelle.start();
  const fertig = await ctx.startRendering();
  return ANSCHLAG_BAENDER.map((_, i) => fertig.getChannelData(i));
}

// --- Anschlagskurve -------------------------------------------------------
//
// Wo faengt ein Schlag an? Nicht der laute Teil zaehlt, sondern der *Anstieg*.
// Deshalb wird die Lautstaerke pro Zeitfenster gemessen und davon nur
// behalten, was gegenueber dem Fenster davor zugenommen hat.

/**
 * Anschlagskurve aus einer Reihe von Baendern.
 *
 * @param {Float32Array[]} baender
 * @param {number} rate
 * @param {boolean} logarithmisch
 *        true  - jedes Band auf den gemeinsamen Mittelwert bezogen und
 *                logarithmiert. Bringt leise Baender ueberhaupt erst zur
 *                Geltung; noetig, damit eine Bassline nicht das Tempo kapert.
 *        false - roher Effektivwert, ohne Umrechnung. Das lauteste Band
 *                bestimmt die Kurve. Genau so hat es vor der Filterbank
 *                gerechnet, und fuer Material mit klarer Bassdrum ist es bis
 *                heute das treffsicherere Verfahren.
 */
function anschlagskurve(baender, rate, logarithmisch = true) {
  // Die Fensterlaenge muss eine ganze Zahl von Abtastwerten sein, also ist die
  // tatsaechliche Aufloesung nie genau HOPS_PRO_SEKUNDE. Bei 44,1 kHz sind es
  // 220 statt 220,5 Abtastwerte - und damit 200,45 statt 200 Punkte je
  // Sekunde. Wer weiter mit dem Sollwert rechnet, misst jedes Tempo um 0,23
  // Prozent zu hoch. Deshalb wird die echte Rate zurueckgegeben und ueberall
  // sie benutzt.
  const fenster = Math.round(rate / HOPS_PRO_SEKUNDE);
  const hops = rate / fenster;
  const anzahl = Math.floor(baender[0].length / fenster);
  const kurve = new Float32Array(anzahl);
  const huellen = [];
  const mittelwerte = [];

  for (const band of baender) {
    // Effektivwert je Fenster.
    const huelle = new Float32Array(anzahl);
    let mittel = 0;
    for (let i = 0; i < anzahl; i++) {
      let summe = 0;
      const von = i * fenster;
      for (let j = von; j < von + fenster; j++) summe += band[j] * band[j];
      huelle[i] = Math.sqrt(summe / fenster);
      mittel += huelle[i];
    }
    mittel = mittel / anzahl || 1e-12;

    huellen.push(huelle);
    mittelwerte.push(mittel);
  }

  // Der Bezugswert ist der Mittelwert *aller* Baender, nicht der des eigenen.
  //
  // Das ist ein Zielkonflikt, und beide Enden sind nachgemessen falsch:
  //
  //   Bezieht man jedes Band auf sich selbst, wird ein leises Hi-Hat genauso
  //   wichtig wie ein Kick. Dann passt jedes Raster gleich gut, und aus
  //   128 BPM wurden gemessene 85,1 - der Schaetzer rastete auf dem
  //   Halbbeat-Gitter aus Kick und Hi-Hat ein.
  //
  //   Zaehlt man gar nichts um, uebertoent das Bassband alles, und eine
  //   Bassline auf Sechzehnteln macht aus 128 BPM gemessene 102,4.
  //
  // Der gemeinsame Bezug haelt die Mitte: Alle Baender kommen vor, aber ein
  // lautes bleibt lauter als ein leises.
  const gesamtMittel = mittelwerte.reduce((a, b) => a + b, 0) / mittelwerte.length || 1e-12;

  for (const huelle of huellen) {
    // Logarithmieren, weil das Ohr Verhaeltnisse hoert und keine Differenzen:
    // Ein Hi-Hat, der von 0,01 auf 0,04 springt, ist derselbe Anschlag wie ein
    // Kick von 0,1 auf 0,4.
    let vorher = 0;
    for (let i = 0; i < anzahl; i++) {
      const jetzt = logarithmisch ? Math.log(1 + huelle[i] / gesamtMittel) : huelle[i];
      kurve[i] += Math.max(0, jetzt - vorher);
      vorher = jetzt;
    }
  }

  // Auf den Hoechstwert normieren, damit die Schwellen unabhaengig von der
  // Aussteuerung des Tracks gelten.
  let hoechster = 0;
  for (const wert of kurve) if (wert > hoechster) hoechster = wert;
  if (hoechster > 0) for (let i = 0; i < kurve.length; i++) kurve[i] /= hoechster;

  return { kurve: zuspitzen(kurve), hops };
}

// Eine Bassdrum ist im Tiefband kein Nadelstich, sondern ein breiter Huegel -
// der Anstieg zieht sich ueber mehrere Fenster. Fuer alles Weitere zaehlt aber
// nur der *eine* Zeitpunkt, an dem der Schlag beginnt. Also von jedem Huegel
// nur die Spitze behalten und den Rest auf null setzen.
//
// Das ist der Unterschied zwischen "irgendwo hier ungefaehr" und einem
// Beatraster, auf das sich ein Uebergang legen laesst.
function zuspitzen(kurve) {
  const spitz = new Float32Array(kurve.length);
  const umgebung = 3;

  for (let i = umgebung; i < kurve.length - umgebung; i++) {
    const wert = kurve[i];
    if (wert < 0.04) continue;
    let istSpitze = true;
    for (let j = -umgebung; j <= umgebung; j++) {
      if (j === 0) continue;
      // Bei Gleichstand gewinnt der fruehere Punkt - der Anschlag beginnt
      // vorne, nicht hinten.
      if (kurve[i + j] > wert || (j < 0 && kurve[i + j] === wert)) {
        istSpitze = false;
        break;
      }
    }
    if (istSpitze) spitz[i] = wert;
  }
  return spitz;
}

// --- Tempo ----------------------------------------------------------------
//
// Ein Kamm aus gleichmaessigen Zinken wird ueber die Anschlagskurve geschoben.
// Das Tempo, bei dem die Zinken die meisten Anschlaege treffen, gewinnt.
// Fuer Vierviertel-Musik mit durchlaufender Bassdrum ist das sehr zuverlaessig.

function tempoFinden(kurve, hops) {
  // Zwei Stufen, und die erste ist bewusst keine Kammsuche.
  //
  // Ein Kamm allein taugt nicht zur Grobsuche: Eine Bassdrum ist im Tiefband
  // kein Nadelstich, sondern ein breiter Huegel, und dann trifft ein Kamm bei
  // fast jedem Tempo irgendetwas. Gemessen an einem echten 128er-Track lagen
  // 85,5 und 128 BPM nur fuenf Prozent auseinander - reiner Zufall, welches
  // gewinnt.
  //
  // Die Autokorrelation fragt stattdessen: In welchem Abstand aehnelt sich die
  // Kurve selbst? Darauf gibt es bei einem durchlaufenden Beat genau eine
  // Antwort. Der Kamm kommt erst danach, um das Tempo scharf zu stellen.
  const grob = periodeSchaetzen(kurve, hops);
  const bpmGrob = (hops * 60) / grob;

  const fein = kammSuche(
    kurve,
    Math.max(BPM_VON, bpmGrob - 2),
    Math.min(BPM_BIS + 40, bpmGrob + 2),
    0.02,
    hops,
  );
  return oktaveKlaeren(kurve, fein, hops);
}

// Autokorrelation: Wie sehr aehnelt die Anschlagskurve sich selbst, wenn man
// sie um `lag` verschiebt? Beim Beatabstand ist die Aehnlichkeit am groessten.
function autokorrelation(kurve, hoechsterLag) {
  const R = new Float32Array(hoechsterLag + 1);
  for (let lag = 1; lag <= hoechsterLag; lag++) {
    const n = kurve.length - lag;
    if (n <= 0) break;
    let summe = 0;
    for (let i = 0; i < n; i++) summe += kurve[i] * kurve[i + lag];
    R[lag] = summe / n;
  }
  return R;
}

function periodeSchaetzen(kurve, hops) {
  const lagVon = Math.floor((hops * 60) / BPM_BIS);
  const lagBis = Math.ceil((hops * 60) / BPM_VON);
  const R = autokorrelation(kurve, Math.min(kurve.length - 2, lagBis * 4 + 2));

  let besterLag = Math.round((hops * 60) / 128);
  let bestePunkte = -1;
  for (let lag = lagVon; lag <= lagBis; lag++) {
    // Auch den doppelten und vierfachen Abstand mitzaehlen: Ein echter Puls
    // wiederholt sich auch ueber zwei und vier Schlaege, ein zufaelliger
    // Nebenmaximum nicht. Das haelt Zwischenwerte wie zwei Drittel des
    // Tempos zuverlaessig heraus.
    const roh = R[lag] + 0.5 * (R[2 * lag] ?? 0) + 0.25 * (R[4 * lag] ?? 0);
    const punkte = roh * tempoErwartung((hops * 60) / lag);
    if (punkte > bestePunkte) {
      bestePunkte = punkte;
      besterLag = lag;
    }
  }
  return besterLag;
}

// --- Was ist ueberhaupt ein plausibles Tempo? ------------------------------
//
// Ohne diese Gewichtung bleibt eine Luecke offen, die sich rein aus dem Signal
// nicht schliessen laesst. Kick auf den Vierteln, Hi-Hat auf den Achteln: Der
// Abstand von anderthalb Beats korreliert dann fast genauso gut wie der von
// einem, weil dort immer *etwas* liegt. Gemessen kamen bei 128er-Material
// darum 85,3 heraus (zwei Drittel) und 102,2 (vier Fuenftel) - beides sind
// echte Selbstaehnlichkeiten des Signals, keine Rechenfehler.
//
// Entscheiden laesst sich das nur mit Wissen, das nicht im Signal steht: Diese
// Anlage spielt Clubmusik. 128 ist die Mitte, 120 bis 140 die Regel, alles
// darunter und darueber die Ausnahme. Genau das steht hier - als Gewicht, das
// den Punktestand verschiebt, nicht als harte Grenze. Ein echter 100er-Track
// gewinnt weiterhin, er muss nur deutlicher gewinnen als ein Artefakt.
const TEMPO_MITTE = 128;
// Breite in Oktaven. 0,32 heisst: Bei halbem oder doppeltem Tempo ist das
// Gewicht auf rund ein Zehntel gefallen, bei 100 oder 164 BPM auf zwei Drittel.
const TEMPO_BREITE = 0.32;

function tempoErwartung(bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0;
  const oktaven = Math.log2(bpm / TEMPO_MITTE);
  return Math.exp(-0.5 * (oktaven / TEMPO_BREITE) ** 2);
}

// Halbes oder doppeltes Tempo trifft den Kamm genauso gut: Wer jeden zweiten
// Schlag anvisiert, liegt auf jedem davon richtig. Ein 174er-Track wird so
// leicht als 87er gemessen - und dann waere eine Phrase doppelt so lang wie
// gedacht und jeder Uebergang saesse falsch.
//
// Entschieden wird es nicht am Punktestand, sondern an der Frage: Liegt
// *zwischen* den gefundenen Schlaegen auch etwas? Wenn ja, ist das Tempo in
// Wahrheit doppelt so hoch.
function oktaveKlaeren(kurve, gefunden, hops) {
  const periode = (hops * 60) / gefunden.bpm;

  const mittelAuf = (start, abstand) => {
    let summe = 0;
    let zinken = 0;
    for (let stelle = start; stelle < kurve.length; stelle += abstand) {
      summe += kurve[Math.round(stelle)] ?? 0;
      zinken++;
    }
    return zinken > 0 ? summe / zinken : 0;
  };

  const aufDemRaster = mittelAuf(gefunden.phase, periode);
  const dazwischen = mittelAuf(gefunden.phase + periode / 2, periode);

  // Sind die Zwischenschlaege fast so kraeftig wie die auf dem Raster, dann
  // gehoeren sie dazu. Die Grenze liegt hoch, damit ein Offbeat-Hihat oder
  // eine Synkope das Tempo nicht faelschlich verdoppelt.
  const verdoppeln = dazwischen > aufDemRaster * 0.7 && gefunden.bpm * 2 <= BPM_BIS + 20;
  if (!verdoppeln) return gefunden;

  return { bpm: gefunden.bpm * 2, phase: gefunden.phase, punkte: gefunden.punkte };
}

// Zwischen den Stuetzstellen ablesen. Das ist der entscheidende Unterschied
// zum Runden: Ein gerundeter Kamm springt beim Durchstimmen des Tempos in
// Stufen, viele Tempi ergeben denselben Punktestand, und welches davon
// gewinnt, ist Zufall. Mit Interpolation wird der Punktestand eine glatte
// Kurve ueber dem Tempo - und das echte Tempo gewinnt eindeutig.
function ablesen(kurve, stelle) {
  if (stelle < 0 || stelle >= kurve.length - 1) return 0;
  const unten = Math.floor(stelle);
  const anteil = stelle - unten;
  return kurve[unten] * (1 - anteil) + kurve[unten + 1] * anteil;
}

function kammSuche(kurve, von, bis, schrittweite, hops) {
  let bester = { bpm: 128, phase: 0, punkte: -1 };

  for (let bpm = von; bpm <= bis; bpm += schrittweite) {
    const periode = (hops * 60) / bpm;
    const zinken = Math.floor(kurve.length / periode);
    if (zinken < 8) continue;

    // Phasen in halben Stuetzstellen durchprobieren - feiner lohnt hier nicht,
    // die Feinlage kommt beim Raster.
    for (let phase = 0; phase < periode; phase += 0.5) {
      let punkte = 0;
      for (let k = 0; k < zinken; k++) {
        const stelle = phase + k * periode;
        if (stelle >= kurve.length - 1) break;
        // Auch die unmittelbaren Nachbarn zaehlen mit, damit ein leicht
        // schwankender Schlagzeuger nicht durchfaellt.
        punkte +=
          ablesen(kurve, stelle) +
          0.4 * ablesen(kurve, stelle - 1) +
          0.4 * ablesen(kurve, stelle + 1);
      }
      punkte /= zinken;
      if (punkte > bester.punkte) bester = { bpm, phase, punkte };
    }
  }
  return bester;
}

// Die Phase aus der Kammsuche ist auf 10 ms genau. Fuer ein Beatraster ist das
// zu grob, also wird um sie herum feiner gesucht - und gleichzeitig geklaert,
// welcher der vier Schlaege die Eins ist.
function rasterFinden(kurve, bpm, grobePhase, hops) {
  const periode = (hops * 60) / bpm;

  // Die volle Periode absuchen, nicht nur die Umgebung der groben Phase. Die
  // stammt aus der Tempo-Suche, wo das Tempo noch anders war - sie kann um
  // einen guten Teil eines Beats danebenliegen, und ein Raster, das ein
  // Drittel Beat verschoben ist, macht jeden Uebergang kaputt.
  let beste = { versatz: grobePhase, punkte: -1 };
  for (let versatz = 0; versatz < periode; versatz += 0.05) {
    let punkte = 0;
    let zinken = 0;
    for (let stelle = versatz; stelle < kurve.length - 1; stelle += periode) {
      punkte += ablesen(kurve, stelle);
      zinken++;
    }
    if (zinken > 0 && punkte / zinken > beste.punkte) {
      beste = { versatz, punkte: punkte / zinken };
    }
  }

  // Welcher Schlag ist die Eins? Der, auf dem ueber den ganzen Track die
  // meiste Bassenergie liegt.
  let besterTakt = 0;
  let bestePunkte = -1;
  for (let takt = 0; takt < 4; takt++) {
    let punkte = 0;
    let zinken = 0;
    for (let stelle = beste.versatz + takt * periode; stelle < kurve.length; stelle += periode * 4) {
      punkte += kurve[Math.round(stelle)] ?? 0;
      zinken++;
    }
    if (zinken > 0 && punkte / zinken > bestePunkte) {
      bestePunkte = punkte / zinken;
      besterTakt = takt;
    }
  }

  const versatzHops = beste.versatz + besterTakt * periode;
  return versatzHops / hops;
}

// --- Tempo und Raster zusammen ausgleichen --------------------------------
//
// Der Kamm findet das Tempo nur so genau, wie seine Schrittweite erlaubt. Zwei
// Zehntel BPM klingen nach nichts, sind aber ueber neunzig Sekunden schon
// hundertvierzig Millisekunden Versatz - und ueber einen Sechsminueter mehr als
// eine halbe Sekunde. Am Ende eines langen Uebergangs waere das Raster dann
// voellig neben der Musik.
//
// Deshalb der letzte Schritt: An jeder vorhergesagten Beatstelle wird der
// tatsaechliche Anschlag gesucht, und durch alle gefundenen Punkte wird eine
// Gerade gelegt. Ihre Steigung ist die echte Beatlaenge, ihr Achsenabschnitt
// das echte Raster. Das nutzt den ganzen Track als Hebel, statt sich auf eine
// Stelle zu verlassen.
function ausgleichen(kurve, bpm, raster, hops) {
  // Zuerst das Tempo ueber die volle Tracklaenge scharf stellen, dann das
  // Raster darauf neu setzen. Danach noch zweimal nachziehen - jeder Durchgang
  // startet naeher an der Wahrheit, also darf das Suchfenster enger werden.
  let ergebnis = { bpm: tempoUeberDieLaenge(kurve, bpm, hops), raster };

  for (const weite of [0.3, 0.15, 0.08]) {
    const naechstes = einmalAusgleichen(kurve, ergebnis.bpm, ergebnis.raster, weite, hops);
    if (!naechstes) break;
    ergebnis = naechstes;
  }
  return ergebnis;
}

/**
 * Das Tempo mit dem ganzen Track als Hebel bestimmen.
 *
 * Der Kamm findet das Tempo nur so genau, wie seine Schrittweite erlaubt, und
 * zwei Zehntel BPM sind ueber einen Sechsminueter schon mehr als eine halbe
 * Sekunde Versatz - ausgerechnet am Ende, wo die Uebergaenge stattfinden.
 *
 * Der Ausweg: die beste Beatlage einmal im ersten und einmal im letzten
 * Fuenftel bestimmen. Beide Werte mitteln ueber viele Schlaege und sind daher
 * belastbar. Der Abstand zwischen ihnen ist eine ganze Zahl von Beats - und
 * durch diese Zahl geteilt ergibt er die Beatlaenge auf Bruchteile genau.
 */
function tempoUeberDieLaenge(kurve, bpm, hops) {
  const periode = (hops * 60) / bpm;
  const fensterLaenge = Math.floor(kurve.length / 5);
  if (fensterLaenge < periode * 8) return bpm;

  const vorne = besteLage(kurve, 0, fensterLaenge, periode);
  const hinten = besteLage(kurve, kurve.length - fensterLaenge, kurve.length, periode);
  if (vorne === null || hinten === null) return bpm;

  const abstand = hinten - vorne;
  const beats = Math.round(abstand / periode);
  if (beats < 8) return bpm;

  const genauePeriode = abstand / beats;
  const neuesBpm = (hops * 60) / genauePeriode;

  // Mehr als zwei Prozent Abweichung heisst: eine der beiden Lagen sass auf
  // dem falschen Schlag. Dann lieber beim bisherigen Wert bleiben.
  return Math.abs(neuesBpm / bpm - 1) < 0.02 ? neuesBpm : bpm;
}

// Die Lage des ersten Beats innerhalb eines Ausschnitts, absolut gerechnet.
function besteLage(kurve, von, bis, periode) {
  let beste = null;
  let bestePunkte = 0;

  for (let versatz = 0; versatz < periode; versatz += 0.1) {
    let punkte = 0;
    let zinken = 0;
    for (let stelle = von + versatz; stelle < bis - 1; stelle += periode) {
      punkte += ablesen(kurve, stelle);
      zinken++;
    }
    if (zinken > 0 && punkte / zinken > bestePunkte) {
      bestePunkte = punkte / zinken;
      beste = von + versatz;
    }
  }
  return beste;
}

function einmalAusgleichen(kurve, bpm, raster, anteil, hops) {
  const periode = (hops * 60) / bpm;
  const start = raster * hops;
  // Nur in der naeheren Umgebung suchen, sonst zieht ein Nachbarschlag den
  // Punkt auf den falschen Beat.
  const suchweite = periode * anteil;

  const nummern = [];
  const zeiten = [];
  let k = 0;
  for (let ziel = start; ziel < kurve.length - 1; ziel += periode, k++) {
    let bester = -1;
    let bestePunkte = 0;
    for (let s = ziel - suchweite; s <= ziel + suchweite; s += 0.25) {
      const wert = ablesen(kurve, s);
      if (wert > bestePunkte) {
        bestePunkte = wert;
        bester = s;
      }
    }
    // Schwache Stellen weglassen: In einem Breakdown gibt es keinen Anschlag,
    // und ein erfundener Punkt wuerde die Gerade verbiegen.
    if (bester >= 0 && bestePunkte > 0.08) {
      nummern.push(k);
      zeiten.push(bester);
    }
  }

  // Zu wenige Stuetzpunkte - dann bleibt es beim bisherigen Ergebnis.
  if (nummern.length < 12) return null;

  const gerade = (ks, ts) => {
    const mittelK = ks.reduce((a, b) => a + b, 0) / ks.length;
    const mittelT = ts.reduce((a, b) => a + b, 0) / ts.length;
    let oben = 0;
    let unten = 0;
    for (let i = 0; i < ks.length; i++) {
      oben += (ks[i] - mittelK) * (ts[i] - mittelT);
      unten += (ks[i] - mittelK) ** 2;
    }
    if (unten === 0) return null;
    const m = oben / unten;
    return { steigung: m, abschnitt: mittelT - m * mittelK };
  };

  let anpassung = gerade(nummern, zeiten);
  if (!anpassung) return null;

  /*
   * Ausreisser hinauswerfen und noch einmal rechnen.
   *
   * Fehlt an einer Stelle der Kick - Breakdown, Synkope, ausgelassener Schlag -
   * dann greift die Suche oben nach dem naechstbesten Anschlag in der
   * Umgebung. Das ist oft eine Bassnote auf dem Achtel daneben, und die ist
   * stark genug, um die Schwelle zu nehmen. Ein solcher Punkt liegt einen
   * halben Beat neben der Wahrheit und verbiegt die Ausgleichsgerade.
   *
   * Nachgemessen war das der Unterschied zwischen einem stabilen Tempo und
   * 128,4 statt 128 - und 0,4 BPM reichen, damit das Raster ueber hundert
   * Sekunden um eine Drittelsekunde wegwandert und die Rasterpruefung den
   * ganzen Track als unbrauchbar abstempelt.
   */
  const grenze = periode * 0.15;
  const treueK = [];
  const treueT = [];
  for (let i = 0; i < nummern.length; i++) {
    const rest = zeiten[i] - (anpassung.abschnitt + anpassung.steigung * nummern[i]);
    if (Math.abs(rest) <= grenze) {
      treueK.push(nummern[i]);
      treueT.push(zeiten[i]);
    }
  }
  // Nur uebernehmen, wenn genug uebrig bleibt. Bleibt fast nichts uebrig, war
  // nicht der Punkt der Ausreisser, sondern die Gerade.
  if (treueK.length >= 12 && treueK.length >= nummern.length * 0.6) {
    anpassung = gerade(treueK, treueT) ?? anpassung;
  }

  const { steigung, abschnitt } = anpassung;

  const neuesBpm = (hops * 60) / steigung;
  // Ein Ausgleich, der das Tempo um mehr als zwei Prozent verschiebt, hat sich
  // an etwas anderem festgehalten als am Beat. Dann lieber das Bisherige.
  if (!Number.isFinite(neuesBpm) || Math.abs(neuesBpm / bpm - 1) > 0.02) {
    return null;
  }

  // Der Achsenabschnitt kann durch die Ausgleichsrechnung vor den Dateianfang
  // rutschen; um ganze Beats nach vorne holen.
  let neuesRaster = abschnitt / hops;
  const beat = 60 / neuesBpm;
  while (neuesRaster < 0) neuesRaster += beat;

  return { bpm: neuesBpm, raster: neuesRaster };
}

// --- Aufbau ---------------------------------------------------------------

// Bassenergie je Takt. Daran haengt alles Weitere: Wo faellt die Bassdrum weg
// (Breakdown), wo kommt sie schlagartig zurueck (Drop), wo hoert sie auf (Outro).
function taktEnergien(bass, rate, bpm, raster) {
  const taktSekunden = (60 / bpm) * 4;
  const anzahl = Math.floor((bass.length / rate - raster) / taktSekunden);
  const werte = [];
  for (let t = 0; t < anzahl; t++) {
    const von = Math.floor((raster + t * taktSekunden) * rate);
    const bis = Math.min(bass.length, Math.floor((raster + (t + 1) * taktSekunden) * rate));
    let summe = 0;
    for (let i = von; i < bis; i++) summe += bass[i] * bass[i];
    werte.push(Math.sqrt(summe / Math.max(1, bis - von)));
  }
  return werte;
}

function aufbauErkennen(takte, bpm, raster, einstiegBeat = 0) {
  if (takte.length < 8) return [];
  const median = mittelwert(takte);
  const taktSekunden = (60 / bpm) * 4;
  const marke = (name, takt) => ({
    name,
    beat: takt * 4,
    sekunde: raster + takt * taktSekunden,
  });

  const marken = [];
  const leise = takte.map((w) => w < median * 0.45);

  // Das Intro ist auch "leise", aber es ist kein Breakdown - da hat der Track
  // noch gar nicht angefangen. Wer das verwechselt, legt einen drop_swap auf
  // den Beginn der Datei statt auf den echten Drop.
  const abTakt = Math.floor(einstiegBeat / 4);

  // Breakdown: mindestens vier Takte am Stueck ohne Fundament.
  let lauf = 0;
  for (let t = abTakt; t < takte.length; t++) {
    if (leise[t]) {
      lauf++;
    } else {
      if (lauf >= 4) {
        marken.push(marke('breakdown', t - lauf));
        // Der Drop ist der Takt, in dem es zurueckkommt - der Moment, auf den
        // sich ein Uebergang legen laesst.
        marken.push(marke('drop', t));
      }
      lauf = 0;
    }
  }

  // Outro: ab wo es dauerhaft leise bleibt.
  for (let t = takte.length - 1; t > 4; t--) {
    if (!leise[t]) {
      if (t < takte.length - 3) marken.push(marke('outro', t + 1));
      break;
    }
  }

  return marken.sort((a, b) => a.beat - b.beat);
}

// Ab welchem Beat laeuft die Bassdrum durch? Davor ist Intro, und darauf
// laesst sich nicht mischen, weil es keinen Puls gibt.
function einstiegFinden(takte) {
  if (takte.length === 0) return 0;
  const median = mittelwert(takte);
  for (let t = 0; t < takte.length - 2; t++) {
    if (takte[t] > median * 0.6 && takte[t + 1] > median * 0.6) {
      // Auf eine Achtergruppe aufrunden - Uebergaenge sollen auf Phrasen sitzen.
      return Math.ceil(t / 8) * 8 * 4;
    }
  }
  return 0;
}

// --- Energie --------------------------------------------------------------

// Wie treibend ist der Track? Drei Anteile, die zusammen gut mit dem
// uebereinstimmen, was man auf der Tanzflaeche als "geht ab" empfindet:
// Wucht im Bass, Anteil der Hoehen (Hihats, Percussion) und das Tempo.
// Wie treibend ist der Track?
//
// Vier Anteile, die zusammen gut mit dem uebereinstimmen, was auf der
// Tanzflaeche als "geht ab" ankommt. Wichtig ist, dass der Wert **fuer sich
// allein** aussagekraeftig ist: Frueher wurde er hinterher durch den Rang in
// der Bibliothek ersetzt, und bei zwei Tracks kamen dabei zwangslaeufig 0 und
// 100 Prozent heraus. Der Rang darf nachjustieren, nicht bestimmen.
function energieSchaetzen(puffer, bass, hoehen, bpm, anschlaege, hops, vertrauen = 1) {
  const daten = puffer.getChannelData(0);

  let summe = 0;
  let spitze = 0;
  for (let i = 0; i < daten.length; i += 7) {
    const wert = daten[i];
    summe += wert * wert;
    const betrag = Math.abs(wert);
    if (betrag > spitze) spitze = betrag;
  }
  const gesamt = Math.sqrt(summe / (daten.length / 7));

  const effektiv = (band) => {
    let s = 0;
    for (let i = 0; i < band.length; i += 7) s += band[i] * band[i];
    return Math.sqrt(s / (band.length / 7));
  };

  // 1. Tempo. Techno lebt zwischen 125 und 150.
  const tempo = spanne(bpm, 118, 150);

  // 2. Dichte: Wie viele Anschlaege kommen auf einen Beat? Ein Track mit
  //    durchlaufenden Sechzehnteln wirkt treibender als einer mit nacktem
  //    Viervierteltakt, auch bei gleichem Tempo.
  let anschlagZahl = 0;
  for (const wert of anschlaege) if (wert > 0.12) anschlagZahl++;
  const proBeat = anschlagZahl / Math.max(1, (anschlaege.length / hops) * (bpm / 60));
  const dichte = spanne(proBeat, 0.8, 3.5);

  // 3. Helligkeit: Hihats, Percussion, verzerrte Synths.
  const hoehenAnteil = gesamt > 0 ? effektiv(hoehen) / gesamt : 0;
  const helligkeit = spanne(hoehenAnteil, 0.05, 0.45);

  // 4. Druck ueber den Scheitelfaktor. Ein totkomprimiertes Master hat wenig
  //    Abstand zwischen Spitze und Effektivwert - das ist genau der Klang, der
  //    als "hart" empfunden wird. Zwoelf Dezibel sind luftig, fuenf sind Brett.
  const scheitelDb = gesamt > 0 ? 20 * Math.log10(spitze / gesamt) : 14;
  const druck = 1 - spanne(scheitelDb, 5, 14);

  // Der Bass traegt, ist aber kein Unterscheidungsmerkmal - fast jeder
  // Clubtrack hat viel davon. Deshalb nur als leichter Zuschlag.
  const bassAnteil = gesamt > 0 ? effektiv(bass) / gesamt : 0;
  const fundament = spanne(bassAnteil, 0.3, 0.9);

  // Tempo und Dichte haengen beide am erkannten Raster. Ist dem nicht zu
  // trauen, sind es zwei erfundene Zahlen - und weil sie zusammen ueber die
  // Haelfte des Gewichts tragen, haben sie Meeresrauschen auf 0,60 gehoben.
  // Also faellt bei niedrigem Vertrauen ihr Anteil weg und die drei Masse,
  // die ohne Raster auskommen, tragen allein.
  const rasterGewicht = Math.min(1, Math.max(0, vertrauen / VERTRAUENSSCHWELLE));
  const mitRaster = 0.3 * tempo + 0.25 * dichte;
  const ohneRasterAnteil = 0.2 * helligkeit + 0.15 * druck + 0.1 * fundament;
  // Ohne Raster tragen nur noch drei Masse mit zusammen 0,45 Gewicht. Geteilt
  // durch 0,45 fuellen sie wieder die volle Skala aus - sonst kaeme jedes
  // rasterlose Stueck allein durch die fehlenden Summanden nach unten.
  const roh =
    rasterGewicht * (mitRaster + ohneRasterAnteil) +
    (1 - rasterGewicht) * (ohneRasterAnteil / 0.45);

  // Kontrast nachziehen. Fuenf gemittelte Anteile landen fast immer in der
  // Mitte - selbst zwischen einem ruhigen und einem harten Track lagen nur
  // dreizehn Prozentpunkte. Damit koennte die Energiekurve nicht mehr
  // auswaehlen, und genau das war der sichtbare Fehler: alles bei knapp
  // ueber vierzig Prozent.
  //
  // Der realistische Bereich des Mittelwerts ist 0,28 bis 0,68; der wird auf
  // die volle Skala gezogen. Aussen wird nicht abgeschnitten, sondern flacher
  // weitergefuehrt, damit ein Ausreisser nicht einfach am Anschlag klebt.
  const gedehnt = (roh - 0.28) / 0.4;
  const mitRand = gedehnt < 0 ? gedehnt * 0.25 : gedehnt > 1 ? 1 + (gedehnt - 1) * 0.25 : gedehnt;

  // Nicht ganz bis an die Anschlaege: Genau 0 hiesse "ohne jede Energie" und
  // genau 1 "haerter geht nicht", und beides ist keine Messaussage, sondern
  // ein Ende der Skala. Die Auswahl braucht ausserdem Luft nach unten und
  // oben, sonst laesst sich der ruhigste Track des Abends nicht mehr vom
  // zweitruhigsten unterscheiden.
  return Math.min(0.98, Math.max(0.02, mitRand));
}

// Einen Messwert auf 0 bis 1 abbilden, mit Deckel an beiden Enden.
function spanne(wert, unten, oben) {
  if (!Number.isFinite(wert)) return 0.5;
  return Math.min(1, Math.max(0, (wert - unten) / (oben - unten)));
}

function mittelwert(werte) {
  const sortiert = [...werte].sort((a, b) => a - b);
  return sortiert[Math.floor(sortiert.length / 2)] || 0;
}

// --- Energie ueber die Bibliothek normieren -------------------------------
//
// Ein absoluter Energiewert sagt wenig: Eine Sammlung aus reinem Ambient
// haette sonst nirgends "hohe Energie", eine reine Hardtechno-Sammlung
// ueberall. Die Kurve ueber den Abend soll aber in *deiner* Sammlung
// funktionieren. Also zaehlt der Rang, nicht der Absolutwert.

export function energienNormieren(tracks) {
  if (tracks.length < 2) return tracks;

  const sortiert = [...tracks].sort((a, b) => (a.energie ?? 0) - (b.energie ?? 0));
  const rang = new Map();
  sortiert.forEach((track, i) => rang.set(track.id, i / (sortiert.length - 1)));

  // Wie stark der Rang mitredet, haengt an der Groesse der Sammlung. Bei drei
  // Tracks sagt eine Rangfolge nichts - da waere der Letzte zwangslaeufig bei
  // null Prozent, obwohl er ein Brett sein kann. Erst ab etwa einem Dutzend
  // wird die Verteilung aussagekraeftig, und selbst dann bleibt die Haelfte
  // beim gemessenen Wert.
  const gewicht = Math.min(0.5, Math.max(0, (tracks.length - 4) / 16));

  return tracks.map((track) => {
    const absolut = track.energie ?? 0.5;
    const gemischt = absolut * (1 - gewicht) + (rang.get(track.id) ?? 0.5) * gewicht;
    return { ...track, energie: Number(gemischt.toFixed(3)) };
  });
}
