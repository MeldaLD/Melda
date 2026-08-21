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
/*
 * Einmal ans Fenster zurueckgeben.
 *
 * Die Messung laeuft im Hauptstrang - sie muss, weil `OfflineAudioContext`
 * in einem Worker nicht zur Verfuegung steht. Eine Rechnung, die dort eine
 * Minute am Stueck laeuft, friert die Seite ein: kein Fortschrittsbalken,
 * keine Reaktion, und irgendwann bietet der Browser an, die Seite
 * abzuschiessen. Von aussen sieht das aus, als waere gar nichts passiert.
 *
 * `setTimeout(0)` und nicht `queueMicrotask` oder ein leeres `await`: Nur
 * ein echter Ausflug in die Ereignisschleife gibt dem Browser die
 * Gelegenheit, wirklich zu zeichnen. Eine Mikroaufgabe laeuft noch im selben
 * Durchgang und aendert nichts.
 */
const luftHolen = () => new Promise((f) => setTimeout(f, 0));

export async function analysiere(puffer, beiSchritt = () => {}) {
  const dauer = puffer.duration;

  // Ein einziger Durchgang durch den Ton, in Scheiben. Danach ist nur noch die
  // Huellkurve im Speicher, und alles Weitere rechnet auf ihr.
  const messung = await messungSammeln(puffer, beiSchritt);
  const { huellen, hops } = messung;

  beiSchritt('Lautheit');
  const lufs = lautheitAusBloecken(messung.blockLautheiten);

  /*
   * Das Raster ueber die ganze Datei - und das ist ein Block, der sich nicht
   * teilen laesst: `rasterBestimmen` vergleicht die Anschlagskurve gegen
   * hunderte Tempo-Schablonen, und das Ergebnis steht erst fest, wenn alle
   * durch sind. Bei einer Dreiviertelstunde kostet das gemessen rund neun
   * Sekunden am Stueck.
   *
   * Deshalb wenigstens die Meldung *davor* und eine Atempause dahinter: So
   * steht auf dem Balken "Tempo", bevor es still wird, statt dass die
   * Anzeige mitten in "Messen 99 %" einfriert.
   */
  beiSchritt('Tempo');
  await luftHolen();
  const gesamt = rasterBestimmen(huellen, hops);
  await luftHolen();
  const anschlaege = gesamt.anschlaege;
  const abschnitte = await tempoKarte(huellen, hops, dauer, gesamt,
    (anteil) => beiSchritt(`Tempo ${Math.round(anteil * 100)} %`));

  /*
   * Die gemeldeten Einzelwerte kommen aus dem *ersten* Abschnitt.
   *
   * Bei einem Track gibt es nur einen, und dann steht dort genau das, was
   * vorher dort stand. Bei einem Mix ist "das Tempo der Datei" keine sinnvolle
   * Groesse mehr - wer sie trotzdem braucht, bekommt den Anfang, und wer es
   * genau wissen will, fragt die Karte nach der Stelle.
   *
   * Das Vertrauen dagegen wird ueber die Laenge gemittelt. Das ist die
   * Aussage, auf die es ankommt: nicht "hat die ganze Stunde ein Tempo"
   * - hat sie nicht -, sondern "ist der Takt an den meisten Stellen bekannt".
   * Vorher fiel ein Mix hier durch und bekam gar keine Marken.
   */
  const bpm = abschnitte[0].bpm;
  const raster = abschnitte[0].raster;
  const vertrauen =
    abschnitte.reduce((s, a) => s + a.vertrauen * (a.bis - a.von), 0) /
    Math.max(1e-9, abschnitte.reduce((s, a) => s + (a.bis - a.von), 0));
  const ohneRaster = vertrauen < VERTRAUENSSCHWELLE;

  beiSchritt('Verlauf');
  /*
   * Verlauf und Marken abschnittsweise. Jeder Abschnitt bekommt seine eigenen
   * Taktgrenzen - sonst verwischt die Neuheitskurve, und genau aus ihr kommen
   * die Drops.
   */
  /*
   * Nacheinander und nicht mit `map`, weil `profilBauen` jetzt zwischendurch
   * Luft holt. Der Fortschritt laeuft ueber alle Abschnitte durch - bei
   * einem Stundenmix ist das oft ohnehin nur einer, und dann ist der
   * Balken innerhalb dieses einen die einzige Rueckmeldung, die es gibt.
   */
  const teile = [];
  for (let i = 0; i < abschnitte.length; i++) {
    const a = abschnitte[i];
    teile.push(await profilBauen(
      huellen,
      anschlaege,
      hops,
      a.bpm,
      a.raster,
      ohneRaster,
      a.von,
      a.bis,
      a.beatVersatz,
      (anteil) => beiSchritt(
        `Verlauf ${Math.round(((i + anteil) / abschnitte.length) * 100)} %`,
      ),
    ));
  }

  beiSchritt('Aufbau');
  const marken = [];
  let phrasenVersatz = 0;
  if (!ohneRaster) {
    abschnitte.forEach((a, i) => {
      if (teile[i].eintraege.length < 4) return;
      const erkannt = strukturErkennen(teile[i].eintraege, a.bpm, a.raster);
      // Die Marken zaehlen im Abschnitt ab null - hier kommen sie auf die
      // durchlaufende Zaehlung der ganzen Datei.
      for (const m of erkannt.marken) marken.push({ ...m, beat: m.beat + a.beatVersatz });
      if (i === 0) phrasenVersatz = erkannt.phrasenVersatz;
    });
  }

  /*
   * Fuer die Ablage werden die Teilverlaeufe wieder zusammengehaengt - und
   * dabei gemeinsam normiert. Jeder Teil ist auf seinen eigenen lautesten Takt
   * bezogen; aneinandergereiht waere sonst jedes Stueck im Mix gleich laut,
   * und die Auswahl der Ein- und Ausstiegsstellen haette nichts mehr zu
   * vergleichen.
   */
  const hoechsteGesamt = teile.reduce((h, t) => Math.max(h, t.hoechste), 0);
  const profil = [];
  for (const teil of teile) {
    const faktor = hoechsteGesamt > 0 ? teil.hoechste / hoechsteGesamt : 1;
    for (const e of teil.eintraege) {
      profil.push(faktor === 1 ? e : { ...e, e: Number((e.e * faktor).toFixed(3)) });
    }
  }

  const takte = taktEnergien(huellen[0], hops, bpm, raster);
  const einstiegBeat = ohneRaster ? 0 : einstiegFinden(takte);

  beiSchritt('Energie');
  const energie = energieSchaetzen(messung, bpm, anschlaege, vertrauen);

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
    // Auf welchem Takt eine Achttaktphrase beginnt. Das Raster kennt nur Beats
    // und die Eins eines Taktes - wo die musikalische Phrase anfaengt, steht
    // erst hier. Ohne diesen Wert sitzt ein Uebergang beatgenau und trotzdem
    // mitten in der Phrase.
    phrasenVersatz,
    lufs: Number(lufs.toFixed(1)),
    angleichDb: Number(angleichBegrenzen(ZIEL_LUFS - lufs).toFixed(2)),
    energie: Number(energie.toFixed(3)),
    marken,
    /*
     * Die Tempo-Karte. Bei einem Track genau ein Eintrag, der dasselbe sagt
     * wie bpm und raster daneben; bei einem Mix je Stueck einer.
     *
     * Alles, was in Beats rechnet, geht ueber diese Liste - siehe takt.js.
     */
    abschnitte: abschnitte.map((a) => ({
      von: Number(a.von.toFixed(3)),
      bis: Number(a.bis.toFixed(3)),
      bpm: Number(a.bpm.toFixed(2)),
      raster: Number(a.raster.toFixed(4)),
      vertrauen: Number(a.vertrauen.toFixed(3)),
      beatVersatz: a.beatVersatz,
    })),
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
//   t  Beatnummer, bei der dieser Takt beginnt
//
// Das t ist wegen der Mixe dazugekommen. Vorher war die Beatnummer eines
// Eintrags schlicht sein Index mal vier, und bei einem Track stimmt das auch
// weiterhin. Bei einem Mix aus mehreren Stuecken nicht mehr: Dort hat jeder
// Abschnitt sein eigenes Tempo und seinen eigenen Beatversatz, und die
// Zaehlung springt an den Grenzen. Wer dann Index mal vier rechnet, landet
// nach einer halben Stunde Minuten daneben.
/*
 * Wieviele Takte am Stueck gerechnet werden, bevor einmal Luft geholt wird.
 *
 * Gemessen laeuft diese Schleife mit rund einer Sekunde je Minute Musik;
 * ein Takt kostet also gut anderthalb Millisekunden. Bei 128 Takten sind
 * das rund zweihundert Millisekunden zwischen zwei Atempausen - kurz genug,
 * dass der Balken laeuft und der Browser die Seite nicht fuer tot haelt,
 * lang genug, dass die Pausen selbst nicht ins Gewicht fallen.
 */
const TAKTE_JE_ZUG = 128;

async function profilBauen(
  huellen,
  anschlaege,
  hops,
  bpm,
  raster,
  ohneRaster,
  vonS = 0,
  bisS = Infinity,
  beatVersatz = 0,
  beiFortschritt = null,
) {
  // Ohne Raster gibt es keine Takte. Dann wird in festen Zwei-Sekunden-
  // Abschnitten gerechnet, damit wenigstens der Verlauf stimmt.
  const taktSekunden = ohneRaster ? 2 : (60 / bpm) * 4;
  const versatz = ohneRaster ? Math.max(0, vonS) : raster;
  const laenge = Math.min(huellen[0].length, Math.ceil(bisS * hops));
  const takte = Math.floor((laenge / hops - versatz) / taktSekunden);
  if (!Number.isFinite(takte) || takte < 2) return { eintraege: [], hoechste: 0 };

  const tief = [huellen[0], huellen[1]];
  const hoch = [huellen[4], huellen[5]];
  const effektiv = (felder, von, bis) => {
    let summe = 0;
    let zahl = 0;
    for (const feld of felder) {
      for (let i = von; i < bis; i++) {
        summe += feld[i] * feld[i];
        zahl++;
      }
    }
    return zahl > 0 ? Math.sqrt(summe / zahl) : 0;
  };

  const roh = [];
  for (let t = 0; t < takte; t++) {
    /*
     * Die Atempause. Sie steht am Anfang des Durchgangs und nicht am Ende,
     * damit auch der allererste Balkenstand gezeichnet wird, bevor gerechnet
     * wird - sonst stuende die Anzeige die ersten zweihundert Millisekunden
     * auf null und sprae dann.
     */
    if (t > 0 && t % TAKTE_JE_ZUG === 0) {
      beiFortschritt?.(t / takte);
      await luftHolen();
    }
    const von = Math.max(0, Math.floor((versatz + t * taktSekunden) * hops));
    const bis = Math.min(laenge, Math.floor((versatz + (t + 1) * taktSekunden) * hops));
    if (bis - von < 2) break;

    const gesamt = effektiv(huellen, von, bis);
    const unten = effektiv(tief, von, bis);
    const oben = effektiv(hoch, von, bis);

    // Anschlaege im selben Fenster zaehlen - dieselbe Zeitachse, dieselben
    // Grenzen.
    let dichte = 0;
    for (let i = von; i < Math.min(anschlaege.length, bis); i++) {
      if (anschlaege[i] > 0.08) dichte++;
    }

    roh.push({ gesamt, unten, oben, dichte: dichte / 4, takt: t });
  }

  let hoechste = 0;
  for (const r of roh) if (r.gesamt > hoechste) hoechste = r.gesamt;
  if (hoechste <= 0) return { eintraege: [], hoechste: 0 };

  return {
    hoechste,
    eintraege: roh.map((r) => ({
      e: Number((r.gesamt / hoechste).toFixed(3)),
      b: Number((r.gesamt > 0 ? r.unten / r.gesamt : 0).toFixed(3)),
      h: Number((r.gesamt > 0 ? r.oben / r.gesamt : 0).toFixed(3)),
      d: Number(r.dichte.toFixed(2)),
      t: beatVersatz + r.takt * 4,
    })),
  };
}

// --- Aufbau erkennen: Neuheit auf der Selbstaehnlichkeit ------------------
//
// Die Frage "wo aendert sich etwas?" laesst sich sauber beantworten, und zwar
// so, wie es in der Musikinformatik seit Foote (2000) ueblich ist:
//
//   1. Jeder Takt wird zu einem Merkmalsvektor (Energie, Bass, Hoehen, Dichte).
//   2. Jeder Takt wird mit jedem verglichen - das ergibt eine
//      Aehnlichkeitsmatrix. Gleichartige Abschnitte bilden darin helle
//      Quadrate entlang der Diagonalen.
//   3. Ueber die Diagonale wird ein Schachbrettmuster geschoben. Wo zwei
//      verschiedene Quadrate aneinanderstossen, schlaegt es aus. Das ist die
//      Neuheitskurve, und ihre Spitzen sind die Abschnittsgrenzen.
//
// Warum das Vorherige nicht reichte: Es zaehlte Takte im Bassband unter einer
// festen Schwelle und nannte die Rueckkehr des Basses einen Drop. An "Bang
// Bang" von Neelix sassen damit zwei von vier Drops, und die beiden falschen
// lagen mitten im leisesten Teil des Tracks. Der erste Drop fehlte ganz -
// die Suche begann beim Einstiegsbeat, und der lag genau darauf.
//
// Die Neuheitskurve findet die Grenzen, ohne eine Schwelle zu brauchen. Was
// eine Grenze *ist*, entscheidet danach ein Vergleich der Energie davor und
// dahinter.

// Halbe Kantenlaenge des Schachbretts, in Takten. Acht Takte sind eine Phrase;
// mit dieser Groesse findet der Kern Grenzen zwischen Phrasengruppen und nicht
// jeden Hi-Hat-Wechsel.
const NEUHEIT_KERN = 8;

function neuheitskurve(profil) {
  const n = profil.length;
  if (n < NEUHEIT_KERN * 2 + 2) return new Float32Array(Math.max(0, n));

  // Merkmale, jedes auf 0..1 gebracht. Die Energie zaehlt doppelt: In
  // elektronischer Musik ist der Aufbau vor allem eine Energiegeschichte.
  let hoechsteDichte = 0;
  for (const p of profil) if (p.d > hoechsteDichte) hoechsteDichte = p.d;
  const dTeiler = hoechsteDichte || 1;
  const merkmale = profil.map((p) => [
    (p.e ?? 0) * 2,
    Math.min(1.5, p.b ?? 0),
    Math.min(1.5, p.h ?? 0),
    (p.d ?? 0) / dTeiler,
  ]);

  const abstand = (a, b) => {
    let summe = 0;
    for (let k = 0; k < a.length; k++) summe += (a[k] - b[k]) ** 2;
    return Math.sqrt(summe);
  };

  // Aehnlichkeit als abklingende Funktion des Abstands. Der Massstab kommt aus
  // dem Material selbst, damit ein Track mit wenig Kontrast nicht flach wird.
  let summeAbstand = 0;
  let zahl = 0;
  for (let i = 0; i < n; i += 2) {
    for (let j = i + 1; j < n; j += 2) {
      summeAbstand += abstand(merkmale[i], merkmale[j]);
      zahl++;
    }
  }
  const massstab = zahl > 0 ? summeAbstand / zahl : 1;
  const aehnlich = (i, j) => Math.exp(-abstand(merkmale[i], merkmale[j]) / (massstab || 1));

  // Das Schachbrett, mit Gauss-Fenster zu den Raendern hin.
  const L = NEUHEIT_KERN;
  const kern = [];
  for (let u = -L; u < L; u++) {
    const zeile = [];
    for (let v = -L; v < L; v++) {
      const vorzeichen = (u < 0 ? -1 : 1) * (v < 0 ? -1 : 1);
      const fenster = Math.exp(-((u / L) ** 2 + (v / L) ** 2) * 2);
      zeile.push(vorzeichen * fenster);
    }
    kern.push(zeile);
  }

  const kurve = new Float32Array(n);
  for (let i = L; i < n - L; i++) {
    let summe = 0;
    for (let u = -L; u < L; u++) {
      for (let v = -L; v < L; v++) {
        summe += aehnlich(i + u, i + v) * kern[u + L][v + L];
      }
    }
    kurve[i] = Math.max(0, summe);
  }

  let hoch = 0;
  for (const w of kurve) if (w > hoch) hoch = w;
  if (hoch > 0) for (let i = 0; i < n; i++) kurve[i] /= hoch;
  return kurve;
}

/**
 * Abschnittsgrenzen und was sie bedeuten.
 *
 * Zusaetzlich faellt hier der Phrasenversatz ab: In elektronischer Musik
 * liegen Abschnittswechsel fast immer auf Achttaktgrenzen. Wo genau diese
 * Grenzen liegen, verraet das Raster *nicht* - es kennt nur Beats und die Eins
 * eines Taktes. Sucht man den Versatz, bei dem die Neuheitskurve am staerksten
 * auf Achttaktgrenzen faellt, hat man ihn. Ohne ihn sitzt ein Uebergang zwar
 * beatgenau, aber mitten in der Phrase - beatgemischt und trotzdem falsch.
 */
function strukturErkennen(profil, bpm, raster) {
  if (!profil || profil.length < 20) return { marken: [], phrasenVersatz: 0 };

  const kurve = neuheitskurve(profil);
  const n = profil.length;
  const taktSekunden = (60 / bpm) * 4;

  // Spitzen der Neuheitskurve, mit Sperrzeit gegen Doppelzaehlung.
  const spitzen = [];
  const sperre = 6;
  for (let i = 1; i < n - 1; i++) {
    if (kurve[i] < 0.18) continue;
    if (kurve[i] < kurve[i - 1] || kurve[i] < kurve[i + 1]) continue;
    if (spitzen.length && i - spitzen.at(-1) < sperre) {
      if (kurve[i] > kurve[spitzen.at(-1)]) spitzen[spitzen.length - 1] = i;
      continue;
    }
    spitzen.push(i);
  }

  /*
   * Der Phrasenversatz wird aus den gefundenen Grenzen abgelesen, nicht aus
   * der Kurve als Ganzes.
   *
   * Ein frueherer Versuch summierte die Neuheitskurve ueber alle Achttakt-
   * grenzen und nahm den besten Versatz. Das ging daneben: Die Kurve ist breit,
   * und der Versatz kam als 0 heraus, obwohl die echten Abschnittswechsel bei
   * Takt 23, 46 und 95 lagen - also auf Versatz 7. Die Spitzen selbst sind das
   * genauere Zeugnis, denn sie *sind* die Grenzen.
   */
  const nachVersatz = new Array(8).fill(0);
  for (const t of spitzen) nachVersatz[((t % 8) + 8) % 8] += kurve[t];
  let besterVersatz = 0;
  for (let v = 1; v < 8; v++) if (nachVersatz[v] > nachVersatz[besterVersatz]) besterVersatz = v;

  /*
   * Die Grenzen selbst werden *nicht* auf dieses Raster gezogen.
   *
   * Ein Drop liegt da, wo er liegt. Wird er auf die naechste Achttaktgrenze
   * geschoben, landet er im schlechtesten Fall einen Takt zu spaet - und wer
   * dann "auf den Drop" einsteigt, verpasst genau dessen ersten Takt. An "Bang
   * Bang" waren das nachgemessen 1 bis 2 Takte, also bis zu 3,4 Sekunden
   * hinter dem Moment, auf den alle warten.
   *
   * Der Versatz oben wird trotzdem gebraucht - aber fuer die Uebergaenge, wo
   * es um Phrasengrenzen geht und nicht um einen einzelnen Einschlag.
   */
  const aufPhrase = (t) => Math.min(n - 1, Math.max(0, t));

  let spitzeE = 0;
  for (const p of profil) if (p.e > spitzeE) spitzeE = p.e;

  const mittelE = (von, bis) => {
    const a = Math.max(0, von);
    const b = Math.min(n, bis);
    if (b <= a) return 0;
    let s = 0;
    for (let i = a; i < b; i++) s += profil[i].e;
    return s / (b - a);
  };

  const marken = [];
  const gesehen = new Set();
  for (const roh of spitzen) {
    const t = aufPhrase(roh);
    if (gesehen.has(t)) continue;
    gesehen.add(t);

    const davor = mittelE(t - 4, t);
    const danach = mittelE(t, t + 4);

    // Ein Drop ist nicht "es wird lauter", sondern "es geht von deutlich
    // weniger auf beinahe alles". Beides muss zutreffen, sonst zaehlt jeder
    // Aufbauschritt als Drop.
    if (danach >= spitzeE * 0.72 && danach > davor * 1.5) {
      marken.push({ name: 'drop', beat: t * 4, sekunde: raster + t * taktSekunden });
    } else if (danach <= spitzeE * 0.5 && danach < davor * 0.6) {
      marken.push({ name: 'breakdown', beat: t * 4, sekunde: raster + t * taktSekunden });
    } else {
      // Kein Drop und kein Breakdown, aber trotzdem eine Grenze - genau die
      // Stellen, an denen sich ein Uebergang unauffaellig ansetzen laesst.
      marken.push({ name: 'wechsel', beat: t * 4, sekunde: raster + t * taktSekunden });
    }
  }

  // Outro: ab wo es dauerhaft unter der Haelfte bleibt.
  for (let t = n - 1; t > 8; t--) {
    if (profil[t].e >= spitzeE * 0.5) {
      if (t < n - 3) {
        marken.push({ name: 'outro', beat: (t + 1) * 4, sekunde: raster + (t + 1) * taktSekunden });
      }
      break;
    }
  }

  marken.sort((a, b) => a.beat - b.beat);
  return { marken, phrasenVersatz: besterVersatz };
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
function rasterBestimmen(huellen, hops, von = 0, bis = -1) {
  const breit = anschlagskurve(huellen, true, von, bis);
  // Der zweite Anlauf ist bewusst das alte Verfahren: nur der Bassbereich,
  // roher Effektivwert. Es war jahrelang richtig und ist es bei Material mit
  // klarer Bassdrum immer noch - nur eben nicht bei allem.
  const tief = anschlagskurve([huellen[0], huellen[1]], false, von, bis);

  const anlauf = (kurve) => {
    const grob = tempoFinden(kurve, hops);
    const grobesRaster = rasterFinden(kurve, grob.bpm, grob.phase, hops);
    const { bpm, raster } = ausgleichen(kurve, grob.bpm, grobesRaster, hops);
    const punkte =
      rasterVertrauen(breit, bpm, raster, hops) + rasterVertrauen(tief, bpm, raster, hops);
    return { bpm, raster, punkte };
  };

  const kandidaten = [anlauf(breit), anlauf(tief)];
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
      rasterVertrauen(breit, sieger.bpm, sieger.raster, hops),
      rasterVertrauen(tief, sieger.bpm, sieger.raster, hops),
    ),
    anschlaege: breit,
    hops,
  };
}

// --- Die Tempo-Karte ------------------------------------------------------
//
// Eine Zahl fuer das Tempo reicht fuer einen Track. Fuer einen DJ-Mix von
// einer Stunde ist sie falsch, und zwar nicht ungenau, sondern sinnlos: Da
// laufen zwanzig Stuecke hintereinander, jedes mit eigenem Tempo und eigenem
// Beginn. Gemessen kam bei so einem Mix "128,01 BPM, Vertrauen 0 Prozent"
// heraus - das Verfahren hat voellig richtig gemeldet, dass es auf die
// gestellte Frage keine Antwort gibt.
//
// Also wird die Frage geaendert. Statt "welches Tempo hat diese Datei?" heisst
// sie "welches Tempo hat diese Datei *hier*?" - fensterweise gefragt, und
// benachbarte Fenster mit derselben Antwort zu einem Abschnitt
// zusammengefasst.
//
// Ein Abschnitt hat:
//
//   von, bis      Sekunden
//   bpm, raster   wie beim Track, nur eben fuer dieses Stueck
//   vertrauen     0 bis 1
//   beatVersatz   die Beatnummer, bei der dieser Abschnitt in der
//                 durchlaufenden Zaehlung beginnt (siehe unten)
//
// Der beatVersatz ist der Kniff, mit dem alles Uebrige unveraendert
// weiterlaeuft. Buehne und Mixer rechnen in Beatnummern, nicht in Sekunden -
// die Farbwanderung, die Phrasengrenzen, die Marken. Mit einem Versatz je
// Abschnitt bleibt eine einzige, durchlaufende Beatzaehlung ueber die ganze
// Stunde bestehen; nur die Schrittweite aendert sich beim Uebergang.
//
// Er wird auf ein Vielfaches einer Phrase aufgerundet. Aufgerundet, damit die
// Zaehlung nie rueckwaerts springt - eine rueckwaerts laufende Beatnummer
// wuerde jede Suche nach "der naechsten Marke" durcheinanderbringen. Und auf
// eine Phrase, damit Takt- und Phrasengrenzen des neuen Abschnitts auf seinen
// eigenen Downbeats sitzen und nicht auf denen des vorigen.

// Wie lang ein Fenster ist, in dem nach einem Tempo gesucht wird. Dreissig
// Sekunden sind bei 130 BPM rund fuenfundsechzig Schlaege - genug fuer eine
// belastbare Autokorrelation, kurz genug, dass ein Stueck von vier Minuten in
// mehrere Fenster faellt.
const KARTE_FENSTER_S = 30;
const KARTE_SCHRITT_S = 15;
// Unter dieser Laenge lohnt die Fragerei nicht - das ist ein Track, kein Mix.
const KARTE_AB_SEKUNDEN = 150;
// Zwei Fenster gehoeren zusammen, wenn Tempo und Beatphase zusammenpassen.
const KARTE_BPM_TOLERANZ = 0.006;
const KARTE_PHASE_TOLERANZ_S = 0.02;
// Kuerzere Abschnitte werden geschluckt. Ein Stueck in einem Mix dauert
// Minuten; alles unter einer halben Minute ist ein Uebergang oder ein
// Messausrutscher, kein eigenes Stueck.
const KARTE_MINDESTLAENGE_S = 30;
const BEATS_PRO_PHRASE = 32;

// Der Abstand zweier Beatraster, gemessen in Sekunden und ringfoermig: Ein
// Raster, das um fast eine ganze Periode verschoben ist, ist dasselbe Raster.
function phasenAbstand(rasterA, rasterB, periode) {
  const roh = (((rasterA - rasterB) % periode) + periode) % periode;
  return Math.min(roh, periode - roh);
}

// Fenster fuer die Grenzsuche. Zehn Sekunden sind bei 130 BPM rund
// zweiundzwanzig Schlaege - genug, dass rasterVertrauen ueberhaupt eine
// Aussage macht (es verlangt sechzehn Anschlaege), und kurz genug, um die
// Grenze auf ein paar Sekunden einzukreisen.
const GRENZE_FENSTER_S = 16;
const GRENZE_SCHRITT_S = 2;

/*
 * Die Grenze zwischen zwei Abschnitten scharfstellen.
 *
 * Aus dem Zusammenfassen kommt sie nur so genau, wie die Fenster breit sind:
 * Ein Fenster von dreissig Sekunden gehoert dem Tempo, das darin ueberwiegt,
 * und die Grenze landet am Ende des letzten Fensters, das noch dem alten
 * Tempo gehoerte. Nachgemessen an einem gebauten Mix lag sie dadurch
 * durchgehend rund vierzehn Sekunden zu spaet.
 *
 * Das ist keine Kleinigkeit. Vierzehn Sekunden lang liefe das Bild noch auf
 * dem Raster des vorigen Stuecks, und bei 128 gegen 140 BPM ist die Phase
 * nach zwei Sekunden schon hin. Es waere genau das Eiern, das man sofort
 * sieht.
 *
 * Also wird nachgefragt, und zwar genau danach, was eine Grenze ausmacht:
 * Fuer jeden Zeitpunkt in Schritten von zwei Sekunden - wie gut faengt das
 * *alte* Raster die zehn Sekunden davor ein, und wie gut das *neue* die zehn
 * Sekunden danach? Wo diese Summe am groessten ist, liegt der Wechsel.
 *
 * Ein erster Versuch fragte nur vorwaerts: ab wann passt das neue Raster
 * besser? Das ist die falsche Frage - sie kann schon Sekunden vorher mit ja
 * beantwortet werden, wenn die beiden Raster dort zufaellig zusammenfallen.
 * Nachgemessen blieb davon ein Fehler von bis zu neun Sekunden uebrig, mit
 * dem beidseitigen Vergleich sind es noch zwei.
 */
function grenzeScharfstellen(huellen, hops, vorher, nachher, grob) {
  const von = Math.max(vorher.von + GRENZE_FENSTER_S, grob - KARTE_FENSTER_S * 1.5);
  const bis = Math.min(nachher.bis - GRENZE_FENSTER_S, grob + KARTE_FENSTER_S * 0.5);
  if (!(bis > von)) return grob;

  const gueteVon = (abschnitt, tVon, tBis) => {
    const a = Math.round(tVon * hops);
    const b = Math.round(tBis * hops);
    if (a < 0 || b > huellen[0].length || b <= a) return 0;
    const kurve = anschlagskurve(huellen, true, a, b);
    return rasterVertrauen(kurve, abschnitt.bpm, abschnitt.raster - tVon, hops);
  };

  let bester = grob;
  let bestePunkte = -1;
  for (let t = von; t <= bis; t += GRENZE_SCHRITT_S) {
    const punkte =
      gueteVon(vorher, t - GRENZE_FENSTER_S, t) + gueteVon(nachher, t, t + GRENZE_FENSTER_S);
    if (punkte > bestePunkte) {
      bestePunkte = punkte;
      bester = t;
    }
  }
  return bestePunkte > 0 ? bester : grob;
}

function passenZusammen(a, b) {
  if (!a || !b) return false;
  if (Math.abs(a.bpm - b.bpm) / Math.max(a.bpm, b.bpm) > KARTE_BPM_TOLERANZ) return false;
  return phasenAbstand(a.raster, b.raster, 60 / a.bpm) <= KARTE_PHASE_TOLERANZ_S;
}

/**
 * Die Tempo-Karte einer Datei.
 *
 * Kurze Dateien und solche, die durchgehend dasselbe Tempo haben, bekommen
 * genau einen Abschnitt - dann ist das Ergebnis dasselbe wie vorher.
 */
/*
 * Wieviele Fenster der Tempo-Karte am Stueck gerechnet werden, bevor einmal
 * Luft geholt wird.
 *
 * Diese Schleife ist der teuerste Teil der ganzen Messung, und das war lange
 * nicht sichtbar: Ein Fenster kostet gemessen rund 165 Millisekunden, und
 * bei einer Dreiviertelstunde Musik sind das hundertachtzig Fenster - dreissig
 * Sekunden am Stueck, in denen der Hauptstrang nicht ans Fenster zurueckgibt.
 * Von aussen sah das aus, als wuerde die Messung gar nicht erst starten.
 *
 * Acht Fenster sind gut anderthalb Sekunden. Das ist die grobste Koernung,
 * die der Browser noch als lebendige Seite durchgehen laesst.
 */
const KARTE_FENSTER_JE_ZUG = 8;

async function tempoKarte(huellen, hops, dauer, gesamt, beiFortschritt = null) {
  const einer = (mess) => [
    {
      von: 0,
      bis: dauer,
      bpm: mess.bpm,
      raster: mess.raster,
      vertrauen: mess.vertrauen,
      beatVersatz: 0,
    },
  ];

  if (dauer < KARTE_AB_SEKUNDEN) return einer(gesamt);

  // 1. Fensterweise fragen.
  const fensterHops = Math.round(KARTE_FENSTER_S * hops);
  const schrittHops = Math.round(KARTE_SCHRITT_S * hops);
  const laenge = huellen[0].length;
  const fenster = [];
  let zug = 0;
  for (let von = 0; von + fensterHops <= laenge; von += schrittHops) {
    if (zug > 0 && zug % KARTE_FENSTER_JE_ZUG === 0) {
      beiFortschritt?.(von / Math.max(1, laenge));
      await luftHolen();
    }
    zug++;
    const mess = rasterBestimmen(huellen, hops, von, von + fensterHops);
    fenster.push({
      von: von / hops,
      bis: (von + fensterHops) / hops,
      bpm: mess.bpm,
      // rasterBestimmen misst ab Fensteranfang - hier wird daraus eine Zeit
      // auf der Uhr der ganzen Datei.
      raster: von / hops + mess.raster,
      vertrauen: mess.vertrauen,
    });
  }
  if (fenster.length === 0) return einer(gesamt);

  // Stimmt das ganze Stueck ohnehin ueberein, bleibt es bei einem Abschnitt.
  const brauchbar = fenster.filter((f) => f.vertrauen >= VERTRAUENSSCHWELLE);
  if (brauchbar.length === 0) return einer(gesamt);
  if (
    gesamt.vertrauen >= VERTRAUENSSCHWELLE &&
    brauchbar.every((f) => passenZusammen(f, gesamt))
  ) {
    return einer(gesamt);
  }

  /*
   * 2. Zu Abschnitten zusammenfassen.
   *
   * Fenster ohne Vertrauen trennen nicht. In einem Breakdown steht das
   * Schlagwerk still; dort ist kein Tempo zu messen, aber das Stueck laeuft
   * weiter. Wer dort schneidet, zerlegt jeden Track in seine Teile.
   */
  const roh = [];
  for (const f of fenster) {
    const letzter = roh[roh.length - 1];
    if (f.vertrauen < VERTRAUENSSCHWELLE) {
      if (letzter) letzter.bis = f.bis;
      continue;
    }
    if (letzter && passenZusammen(letzter, f)) {
      letzter.bis = f.bis;
      if (f.vertrauen > letzter.vertrauen) {
        letzter.bpm = f.bpm;
        letzter.raster = f.raster;
        letzter.vertrauen = f.vertrauen;
      }
      continue;
    }
    roh.push({ ...f });
  }

  // 3. Zu kurze Abschnitte an den Nachbarn geben.
  const gefiltert = [];
  for (const a of roh) {
    const letzter = gefiltert[gefiltert.length - 1];
    if (letzter && a.bis - a.von < KARTE_MINDESTLAENGE_S) {
      letzter.bis = a.bis;
      continue;
    }
    gefiltert.push(a);
  }
  if (gefiltert.length === 0) return einer(gesamt);
  gefiltert[0].von = 0;
  gefiltert[gefiltert.length - 1].bis = dauer;
  for (let i = 1; i < gefiltert.length; i++) gefiltert[i].von = gefiltert[i - 1].bis;

  // 3b. Die Grenzen scharfstellen - siehe grenzeScharfstellen.
  for (let i = 1; i < gefiltert.length; i++) {
    const genau = grenzeScharfstellen(
      huellen,
      hops,
      gefiltert[i - 1],
      gefiltert[i],
      gefiltert[i].von,
    );
    // Nur uebernehmen, wenn dabei kein Abschnitt in sich zusammenfaellt.
    if (genau > gefiltert[i - 1].von + 5 && genau < gefiltert[i].bis - 5) {
      gefiltert[i - 1].bis = genau;
      gefiltert[i].von = genau;
    }
  }

  if (gefiltert.length === 1) {
    return [{ ...gefiltert[0], beatVersatz: 0 }];
  }

  /*
   * 4. Jeden Abschnitt noch einmal ueber seine volle Laenge nachmessen.
   *
   * Das Fenster hatte dreissig Sekunden; ein Abschnitt hat oft Minuten. Ueber
   * die laengere Strecke wird das Tempo deutlich genauer - und genau darauf
   * sitzt spaeter das Beatraster.
   */
  const fertig = [];
  for (const a of gefiltert) {
    const von = Math.max(0, Math.round(a.von * hops));
    const bis = Math.min(laenge, Math.round(a.bis * hops));
    let bpm = a.bpm;
    let raster = a.raster;
    let vertrauen = a.vertrauen;
    if (bis - von >= Math.round(KARTE_FENSTER_S * hops)) {
      const nach = rasterBestimmen(huellen, hops, von, bis);
      // Nur uebernehmen, wenn die Nachmessung nicht schlechter dasteht - sonst
      // hat sie ueber einen Uebergang hinweg gemittelt.
      if (nach.vertrauen >= a.vertrauen * 0.9) {
        bpm = nach.bpm;
        raster = von / hops + nach.raster;
        vertrauen = nach.vertrauen;
      }
    }
    fertig.push({ von: a.von, bis: a.bis, bpm, raster, vertrauen });
  }

  /*
   * 4b. Nachbarn zusammenlegen, die nach dem Nachmessen doch dasselbe sagen.
   *
   * Beim Zusammenfassen wurde auf grob geschaetzten Werten verglichen; nach
   * der genaueren Messung stellt sich mancher Schnitt als keiner heraus. Ohne
   * diesen Durchgang blieben Abschnitte stehen, die sich in nichts
   * unterscheiden - und jede ihrer Grenzen waere ein Sprung in der
   * Beatzaehlung, an dem musikalisch gar nichts passiert.
   */
  const verschmolzen = [];
  for (const a of fertig) {
    const letzter = verschmolzen[verschmolzen.length - 1];
    if (letzter && passenZusammen(letzter, a)) {
      letzter.bis = a.bis;
      if (a.vertrauen > letzter.vertrauen) letzter.vertrauen = a.vertrauen;
      continue;
    }
    verschmolzen.push(a);
  }
  fertig.length = 0;
  fertig.push(...verschmolzen);
  if (fertig.length === 1) return [{ ...fertig[0], beatVersatz: 0 }];

  /*
   * 5. Die durchlaufende Beatzaehlung.
   *
   * beatVersatz ist die Beatnummer, die auf dem *Raster* des Abschnitts liegt,
   * nicht an seinem Anfang. Nur so faellt Beat n wirklich auf einen Schlag:
   *
   *     beat(t) = beatVersatz + (t - raster) / Beatdauer
   *
   * Fuer den ersten Abschnitt ist er null - dann steht dort genau die
   * Rechnung, die vor der Karte galt, und ein einzelner Track zaehlt weiter
   * wie bisher.
   */
  const beatIm = (a, t) => a.beatVersatz + (t - a.raster) / (60 / a.bpm);
  fertig[0].beatVersatz = 0;
  for (let i = 1; i < fertig.length; i++) {
    const a = fertig[i];
    const weiter = beatIm(fertig[i - 1], a.von);
    // Aufrunden auf eine ganze Phrase: nie rueckwaerts, und Takt- wie
    // Phrasengrenzen sitzen auf den Downbeats *dieses* Abschnitts.
    const ohneVersatz = (a.von - a.raster) / (60 / a.bpm);
    a.beatVersatz =
      Math.ceil((weiter - ohneVersatz) / BEATS_PRO_PHRASE) * BEATS_PRO_PHRASE;
  }

  return fertig;
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

// Die K-Bewertung und die 400-ms-Bloecke stehen in messungSammeln - dort
// laeuft der Ton ohnehin scheibenweise vorbei. Hier bleibt nur die Torschaltung
// der Norm, und die rechnet auf der Liste der Bloecke, nicht auf dem Ton.
function lautheitAusBloecken(blockLautheiten) {
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

// --- Messen in Scheiben ---------------------------------------------------
//
// Warum ueberhaupt in Scheiben - und nicht, wie vorher, am Stueck:
//
// Die Filterbank legte einen OfflineAudioContext mit sechs Kanaelen ueber die
// *volle* Laenge. Bei einem Sechsminueter sind das 190 MB und niemandem faellt
// etwas auf. Bei einem Mix von einer Stunde sind es
//
//     3600 s * 22050 Hz * 4 Byte * 6 Kanaele = 1,9 GB,
//
// dazu der dekodierte Puffer und nochmal ein Vollpass fuer die Hoehen und
// einer fuer die Lautheit. Das ist kein Geraet-Problem, das ist Bauart: Der
// Bedarf waechst mit der Laenge, und ab etwa zwanzig Minuten ist Schluss.
//
// Der Ausweg liegt darin, was wir eigentlich brauchen. Kein Mensch braucht
// die gefilterten Abtastwerte - gebraucht wird die *Huellkurve*: ein
// Effektivwert je Fuenf-Millisekunden-Fenster. Das sind 200 Zahlen je Sekunde
// statt 22050, ein Zweihundertstel. Fuer eine Stunde und sieben Baender:
//
//     3600 s * 200 * 4 Byte * 7 = 20 MB.
//
// Also wird der Ton in Scheiben von dreissig Sekunden durch die Filterbank
// geschickt, jede Scheibe sofort zur Huellkurve eingedampft und der Ton
// weggeworfen. Der Bedarf haengt damit an der Scheibe, nicht an der Datei -
// eine Stunde kostet nicht mehr als eine Minute.
//
// Nebenbei faellt ein Vollpass weg: Hoehen und K-Bewertung fuer die Lautheit
// laufen als weitere Kanaele in derselben Scheibe mit. Wo vorher drei Mal
// ueber die ganze Datei gerechnet wurde, wird jetzt ein Mal darueber
// gegangen.
const SCHEIBE_SEKUNDEN = 30;
// Ein Vorlauf, den wir wieder wegwerfen. Ein Biquad-Filter hat ein Gedaechtnis;
// faengt eine Scheibe bei null Zustand an, schwingt er sich erst ein, und
// dieser Einschwinger sieht in der Huellkurve aus wie ein Anschlag. Eine
// Sekunde Vorlauf ist fuer jeden dieser Filter mehr als genug.
const VORLAUF_SEKUNDEN = 1;

// Ab hier gilt es als "Hoehen" - Hi-Hats, Percussion, verzerrte Synths.
const HOEHEN_AB = 3000;

// Kanalbelegung einer Scheibe.
const KANAL_HOEHEN = ANSCHLAG_BAENDER.length; // 6
const KANAL_LAUT = ANSCHLAG_BAENDER.length + 1; // 7 und 8
const KANAELE_JE_SCHEIBE = ANSCHLAG_BAENDER.length + 3;

/**
 * Eine Scheibe durch die Filterbank schicken.
 *
 * Gibt einen Puffer mit KANAELE_JE_SCHEIBE Kanaelen zurueck: sechs
 * Anschlagsbaender, ein Hochpass fuer die Helligkeit und zwei K-bewertete
 * Kanaele fuer die Lautheit.
 */
async function scheibeRendern(puffer, von, bis) {
  const rate = puffer.sampleRate;
  const laenge = bis - von;
  const hoechste = rate * 0.47; // knapp unter Nyquist, sonst rechnet der Filter Unsinn
  const ctx = new OfflineAudioContext(KANAELE_JE_SCHEIBE, laenge, rate);
  const quelle = ctx.createBufferSource();
  quelle.buffer = puffer;
  const verteiler = ctx.createChannelMerger(KANAELE_JE_SCHEIBE);

  const stufe = (art, hz, guete = 0.7071, verstaerkung = 0) => {
    const f = ctx.createBiquadFilter();
    f.type = art;
    f.frequency.value = Math.min(hz, hoechste);
    f.Q.value = guete;
    if (verstaerkung) f.gain.value = verstaerkung;
    return f;
  };
  const kette = (knoten, ziel) => {
    let letzter = quelle;
    for (const k of knoten) letzter = letzter.connect(k);
    return letzter.connect(verteiler, 0, ziel);
  };

  // Je zwei Stufen pro Flanke - eine einzelne laesst zu viel vom Nachbarband
  // durch, und dann waere die Trennung wertlos.
  ANSCHLAG_BAENDER.forEach(([vonHz, bisHz], nummer) => {
    kette(
      [stufe('highpass', vonHz), stufe('highpass', vonHz), stufe('lowpass', bisHz), stufe('lowpass', bisHz)],
      nummer,
    );
  });

  // Die Helligkeit. Zweimal filtern, aus demselben Grund.
  kette([stufe('highpass', HOEHEN_AB), stufe('highpass', HOEHEN_AB)], KANAL_HOEHEN);

  /*
   * Die K-Bewertung nach EBU R128 - Kopfnachbildung und Hochpass.
   *
   * Sie braucht die Kanaele einzeln, weil die Norm die Energie je Kanal
   * aufsummiert. Eine Mono-Summe waere etwas anderes: Bei breit abgemischtem
   * Material heben sich Anteile gegenseitig auf, und der Track kaeme leiser
   * heraus, als er ist.
   */
  const regal = stufe('highshelf', 1681.97, 0.7071, 3.999);
  const hochpass = stufe('highpass', 38.13, 0.5003);
  const teiler = ctx.createChannelSplitter(2);
  quelle.connect(regal).connect(hochpass).connect(teiler);
  teiler.connect(verteiler, 0, KANAL_LAUT);
  teiler.connect(verteiler, 1, KANAL_LAUT + 1);

  verteiler.connect(ctx.destination);
  quelle.start(0, von / rate, laenge / rate);
  return ctx.startRendering();
}

/**
 * Einmal ueber die ganze Datei, in Scheiben, und alles einsammeln, was danach
 * gebraucht wird. Der Ton selbst wird dabei nicht behalten.
 *
 * Zurueck kommt:
 *   hops            tatsaechliche Fenster je Sekunde (siehe anschlagskurve)
 *   huellen         je Anschlagsband ein Effektivwert pro Fenster
 *   hoehenHuelle    dasselbe fuer den Hochpass ueber 3 kHz
 *   blockLautheiten 400-ms-Bloecke nach EBU R128, ungefiltert
 *   rohEffektiv, rohSpitze   fuer den Scheitelfaktor in der Energie
 */
async function messungSammeln(puffer, beiSchritt = () => {}) {
  const rate = puffer.sampleRate;
  const laenge = puffer.length;
  // Die Fensterlaenge muss eine ganze Zahl von Abtastwerten sein, also ist die
  // tatsaechliche Aufloesung nie genau HOPS_PRO_SEKUNDE. Bei 44,1 kHz sind es
  // 220 statt 220,5 Abtastwerte - und damit 200,45 statt 200 Punkte je
  // Sekunde. Wer weiter mit dem Sollwert rechnet, misst jedes Tempo um 0,23
  // Prozent zu hoch. Deshalb wird die echte Rate zurueckgegeben und ueberall
  // sie benutzt.
  const fenster = Math.round(rate / HOPS_PRO_SEKUNDE);
  const hops = rate / fenster;
  const hopsGesamt = Math.floor(laenge / fenster);

  const huellen = ANSCHLAG_BAENDER.map(() => new Float32Array(hopsGesamt));
  const hoehenHuelle = new Float32Array(hopsGesamt);
  const blockLautheiten = [];

  /*
   * Der Rohwert fuer den Scheitelfaktor kommt direkt aus dem dekodierten
   * Puffer - ungefiltert, ohne Rendern. Jeder siebte Abtastwert reicht: Bei
   * 22 kHz sind das immer noch dreitausend Stichproben je Sekunde, und
   * gesucht ist eine Statistik ueber Minuten, kein Einzelereignis.
   */
  const roh = puffer.getChannelData(0);
  let rohSumme = 0;
  let rohZahl = 0;
  let rohSpitze = 0;
  for (let i = 0; i < laenge; i += 7) {
    const wert = roh[i];
    rohSumme += wert * wert;
    rohZahl++;
    const betrag = wert < 0 ? -wert : wert;
    if (betrag > rohSpitze) rohSpitze = betrag;
  }

  // Bloecke von 400 ms mit 75 Prozent Ueberlappung, wie in der Norm.
  const blockLaenge = Math.round(0.4 * rate);
  const blockSchritt = Math.round(blockLaenge / 4);
  const kanaeleEcht = Math.min(2, puffer.numberOfChannels);

  const hopsProScheibe = Math.max(1, Math.floor(SCHEIBE_SEKUNDEN * hops));
  const vorlauf = Math.round(VORLAUF_SEKUNDEN * rate);
  const scheiben = Math.max(1, Math.ceil(hopsGesamt / hopsProScheibe));

  for (let nummer = 0; nummer < scheiben; nummer++) {
    const hopVon = nummer * hopsProScheibe;
    const hopBis = Math.min(hopsGesamt, hopVon + hopsProScheibe);
    if (hopBis <= hopVon) break;

    const kernVon = hopVon * fenster;
    const kernBis = hopBis * fenster;
    // Der Vorlauf ist zum Einschwingen der Filter da, der Nachlauf, damit ein
    // Lautheitsblock, der in dieser Scheibe *beginnt*, auch vollstaendig in
    // ihr liegt.
    const von = Math.max(0, kernVon - vorlauf);
    const bis = Math.min(laenge, kernBis + blockLaenge);
    if (bis - von < fenster) break;

    beiSchritt(`Messen ${Math.round((nummer / scheiben) * 100)} %`);
    const scheibe = await scheibeRendern(puffer, von, bis);

    // Effektivwert je Fenster, fuer jedes Band.
    for (let band = 0; band <= ANSCHLAG_BAENDER.length; band++) {
      const daten = scheibe.getChannelData(band === ANSCHLAG_BAENDER.length ? KANAL_HOEHEN : band);
      const ziel = band === ANSCHLAG_BAENDER.length ? hoehenHuelle : huellen[band];
      for (let h = hopVon; h < hopBis; h++) {
        const start = h * fenster - von;
        let summe = 0;
        for (let i = start; i < start + fenster; i++) summe += daten[i] * daten[i];
        ziel[h] = Math.sqrt(summe / fenster);
      }
    }

    // Lautheitsbloecke, die in dieser Scheibe beginnen.
    const laut = [];
    for (let k = 0; k < kanaeleEcht; k++) laut.push(scheibe.getChannelData(KANAL_LAUT + k));
    const erster = Math.ceil(kernVon / blockSchritt);
    for (let m = erster; m * blockSchritt < kernBis; m++) {
      const start = m * blockSchritt;
      if (start + blockLaenge > laenge) break;
      const inScheibe = start - von;
      let summe = 0;
      for (const daten of laut) {
        let teil = 0;
        for (let i = inScheibe; i < inScheibe + blockLaenge; i++) teil += daten[i] * daten[i];
        // Alle Kanaele mit Gewicht 1 - bei Stereo entspricht das der Norm.
        summe += teil / blockLaenge;
      }
      blockLautheiten.push(-0.691 + 10 * Math.log10(summe + 1e-12));
    }
  }

  return {
    hops,
    huellen,
    hoehenHuelle,
    blockLautheiten,
    rohEffektiv: Math.sqrt(rohSumme / Math.max(1, rohZahl)),
    rohSpitze,
  };
}


// --- Anschlagskurve -------------------------------------------------------
//
// Wo faengt ein Schlag an? Nicht der laute Teil zaehlt, sondern der *Anstieg*.
// Deshalb wird die Lautstaerke pro Zeitfenster gemessen und davon nur
// behalten, was gegenueber dem Fenster davor zugenommen hat.

/**
 * Anschlagskurve aus den Huellkurven einer Reihe von Baendern.
 *
 * `von` und `bis` schneiden ein Stueck heraus - das braucht die Tempo-Karte,
 * die dieselbe Rechnung fensterweise ueber einen langen Mix laufen laesst. Der
 * Bezugsmittelwert wird dann nur aus dem Ausschnitt gebildet, und das ist auch
 * richtig so: Ein leiser Ambient-Teil soll nicht daran gemessen werden, wie
 * laut es zwanzig Minuten spaeter zugeht.
 *
 * @param {Float32Array[]} huellen  je Band ein Effektivwert pro Fenster
 * @param {boolean} logarithmisch
 *        true  - jedes Band auf den gemeinsamen Mittelwert bezogen und
 *                logarithmiert. Bringt leise Baender ueberhaupt erst zur
 *                Geltung; noetig, damit eine Bassline nicht das Tempo kapert.
 *        false - roher Effektivwert, ohne Umrechnung. Das lauteste Band
 *                bestimmt die Kurve. Genau so hat es vor der Filterbank
 *                gerechnet, und fuer Material mit klarer Bassdrum ist es bis
 *                heute das treffsicherere Verfahren.
 */
function anschlagskurve(huellen, logarithmisch = true, von = 0, bis = -1) {
  const ende = bis < 0 ? huellen[0].length : Math.min(bis, huellen[0].length);
  const anzahl = Math.max(0, ende - von);
  const kurve = new Float32Array(anzahl);
  const mittelwerte = [];

  for (const huelle of huellen) {
    let mittel = 0;
    for (let i = 0; i < anzahl; i++) mittel += huelle[von + i];
    mittelwerte.push(mittel / anzahl || 1e-12);
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
      const wert = huelle[von + i];
      const jetzt = logarithmisch ? Math.log(1 + wert / gesamtMittel) : wert;
      kurve[i] += Math.max(0, jetzt - vorher);
      vorher = jetzt;
    }
  }

  // Auf den Hoechstwert normieren, damit die Schwellen unabhaengig von der
  // Aussteuerung des Tracks gelten.
  let hoechster = 0;
  for (const wert of kurve) if (wert > hoechster) hoechster = wert;
  if (hoechster > 0) for (let i = 0; i < kurve.length; i++) kurve[i] /= hoechster;

  return zuspitzen(kurve);
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
// Der Effektivwert eines Taktes kommt jetzt aus der Huellkurve statt aus den
// Abtastwerten. Das ist keine Naeherung: Die Huelle *ist* der Effektivwert je
// Fenster, und der Effektivwert ueber mehrere Fenster ist die Wurzel aus ihrem
// mittleren Quadrat. Bei gleich langen Fenstern kommt exakt dasselbe heraus -
// nur eben aus zweihundert Zahlen je Sekunde statt aus zweiundzwanzigtausend.
function taktEnergien(bassHuelle, hops, bpm, raster) {
  const taktSekunden = (60 / bpm) * 4;
  const anzahl = Math.floor((bassHuelle.length / hops - raster) / taktSekunden);
  const werte = [];
  for (let t = 0; t < anzahl; t++) {
    const von = Math.max(0, Math.floor((raster + t * taktSekunden) * hops));
    const bis = Math.min(bassHuelle.length, Math.floor((raster + (t + 1) * taktSekunden) * hops));
    let summe = 0;
    for (let i = von; i < bis; i++) summe += bassHuelle[i] * bassHuelle[i];
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
function energieSchaetzen(messung, bpm, anschlaege, vertrauen = 1) {
  const { hops, huellen, hoehenHuelle, rohEffektiv, rohSpitze } = messung;
  const gesamt = rohEffektiv;
  const spitze = rohSpitze;

  const effektiv = (huelle) => {
    let s = 0;
    for (let i = 0; i < huelle.length; i++) s += huelle[i] * huelle[i];
    return Math.sqrt(s / Math.max(1, huelle.length));
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
  const hoehenAnteil = gesamt > 0 ? effektiv(hoehenHuelle) / gesamt : 0;
  const helligkeit = spanne(hoehenAnteil, 0.05, 0.45);

  // 4. Druck ueber den Scheitelfaktor. Ein totkomprimiertes Master hat wenig
  //    Abstand zwischen Spitze und Effektivwert - das ist genau der Klang, der
  //    als "hart" empfunden wird. Zwoelf Dezibel sind luftig, fuenf sind Brett.
  const scheitelDb = gesamt > 0 ? 20 * Math.log10(spitze / gesamt) : 14;
  const druck = 1 - spanne(scheitelDb, 5, 14);

  // Der Bass traegt, ist aber kein Unterscheidungsmerkmal - fast jeder
  // Clubtrack hat viel davon. Deshalb nur als leichter Zuschlag.
  const bassAnteil = gesamt > 0 ? effektiv(huellen[0]) / gesamt : 0;
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
