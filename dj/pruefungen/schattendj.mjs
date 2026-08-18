// Abnahme fuer den Schatten-DJ.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/schattendj.mjs
//
// Die Figur soll sich zu *dieser* Musik bewegen und nicht irgendwie zappeln.
// Der Unterschied ist von aussen nicht zu sehen - beides sieht nach Bewegung
// aus -, aber er ist messbar, und deshalb steht er hier:
//
//   1. Sie groovt auf dem *Takt* und klopft nicht auf jeden Schlag. Das ist
//      die Umkehrung der frueheren Pruefung, und sie steht hier, weil die
//      alte das Falsche verlangt hat: Die Figur hat sie bestanden und sah
//      trotzdem aus wie ein Metronom mit Armen.
//   2. Der Groove haengt am Tempo und nicht an der Uhr - eine Verlagerung
//      dauert acht Schlaege, bei jedem Tempo.
//   3. Ohne Takt kommt sie zur Ruhe. Sonst schaukelt sie auch bei Stille
//      weiter, und das sieht gespenstisch aus.
//   4. Der Drop hebt die Haende, und zwar messbar hoeher als im Ruhezustand.
//   5. Im Breakdown geht eine Hand ans Ohr - der Kopfhoerer. Das ist keine
//      Behauptung: Die Buehne bereitet in dieser Zeit wirklich den naechsten
//      Track vor.
//   6. Beim Uebergang wandert die Hand mit dem Regler. Am Schatten laesst sich
//      also ablesen, wie weit der Wechsel ist.
//   7. Es kostet fast nichts.
//
// Gerechnet wird gegen das Modul selbst, mit einer erfundenen Zeitachse. Das
// ist hier die schaerfere Pruefung: Auf einer laufenden Buehne haengt jede
// dieser Zahlen an der Musik, die gerade zufaellig laeuft.

import { chromium } from 'playwright';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
const CHROM = process.env.CHROMIUM_PFAD;

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage({ viewport: { width: 900, height: 600 } });
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => {
  if (n.type() === 'error') konsole.push(n.text());
});

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });

  // Ein Prueffeld: eine eigene Leinwand und eine erfundene Zeit. Damit laesst
  // sich jede Lage genau herstellen, statt auf sie zu warten.
  await seite.evaluate(async () => {
    const m = await import('/gemeinsam/schattendj.js');
    await m.schattenLaden();
    const lein = document.createElement('canvas');
    lein.width = 900;
    lein.height = 600;
    const stift = lein.getContext('2d');
    window.__probe = {
      m,
      stift,
      /*
       * Eine Reihe von Bildern rechnen, 60 je Sekunde, mit einer Tempokarte
       * von 128 Schlaegen je Minute. `bei` darf jede Lage veraendern - so
       * entsteht ein Drop, ein Breakdown oder ein Uebergang an genau der
       * Stelle, an der er gebraucht wird.
       */
      lauf(bilder, grund = {}, bei = null) {
        /*
         * Einschalten gehoert dazu: Seit die Vorgabe "aus" ist, schaltet die
         * Buehne beim Laden ab, und die Abnahme importiert dasselbe Modul.
         * Ohne diese Zeile zeichnet schattenZeichnen() gar nicht und alle
         * Messwerte sind null - was zuerst wie ein Fehler in der Geometrie
         * aussah.
         */
        m.schattenSetzen(true);
        m.schattenZuruecksetzen();
        const dt = 1 / 60;
        const proben = [];
        for (let i = 0; i < bilder; i++) {
          const zeit = i * dt;
          const beat = (zeit * 128) / 60;
          const lage = {
            sekunden: dt,
            takt: {
              beat,
              imBeat: beat - Math.floor(beat),
              nummer: Math.floor(beat),
              aufEins: Math.floor(beat) % 4 === 0,
              aufPhrase: Math.floor(beat) % 32 === 0,
            },
            spannung: 0,
            abbau: 0,
            wucht: 0.5,
            drop: false,
            anteilB: 0,
            palette: ['#123', '#456', '#789', '#8ad7ff'],
            guetestufe: 'hoch',
            ...grund,
          };
          if (bei) bei(lage, i, zeit, beat);
          m.schattenZeichnen(stift, 900, 600, lage);
          proben.push({ i, zeit, beat, ...m.schattenStand() });
        }
        return proben;
      },
    };
  });

  /* --- Groovt er, ohne zu klopfen? ---------------------------------------
   *
   * Diese Pruefung hat ihr Vorzeichen gewechselt, und das ist der wichtigste
   * Teil an ihr.
   *
   * Vorher stand hier: "Der Kopf nickt auf den Schlag" - gemessen als Spitze
   * der Auslenkung kurz nach jedem Schlag. Die Figur hat das bestanden, und
   * sie sah trotzdem falsch aus. Die Rueckmeldung von der Leinwand war
   * eindeutig: "dieses dauerhafte Klopfen passend zum Beat, zumindest bei
   * elektronischer Musik geht das nicht".
   *
   * Eine bestandene Pruefung, die das Falsche verlangt, ist schlimmer als
   * gar keine - sie haelt die Verbesserung auf. Also verlangt sie jetzt das
   * Gegenteil, und zwar an derselben Zahl.
   *
   * Gemessen wird die Hoehe des Kopfes ueber der Zeit, zerlegt nach
   * Schwingungen je Schlag:
   *
   *   1,000 je Schlag   - das Klopfen. Muss verschwinden.
   *   0,250 je Schlag   - einmal je Takt. Das ist der Groove.
   *   0,125 je Schlag   - alle zwei Takte, die Gewichtsverlagerung selbst.
   *
   * Zum Vergleich dieselbe Messung an der alten Fassung, 128 Schlaege je
   * Minute: je Schlag 3,62 Bildpunkte, je Takt 0,53. Genau andersherum.
   */
  console.log('\nEr groovt auf dem Takt und klopft nicht auf jeden Schlag:');
  const groove = await seite.evaluate(() => {
    const proben = window.__probe.lauf(1200, { wucht: 0.85 });
    // Die ersten fuenf Sekunden weg: Verlagerung und Feder muessen anlaufen.
    const r = proben.slice(300);
    const mittel = r.reduce((a, p) => a + p.nickPx, 0) / r.length;
    // Betrag der Fourierkomponente bei f Schwingungen je Schlag.
    const komp = (f) => {
      let re = 0;
      let im = 0;
      for (const p of r) {
        const w = 2 * Math.PI * f * p.beat;
        re += (p.nickPx - mittel) * Math.cos(w);
        im += (p.nickPx - mittel) * Math.sin(w);
      }
      return (2 * Math.hypot(re, im)) / r.length;
    };
    const ys = r.map((p) => p.nickPx);
    return {
      hub: Math.max(...ys) - Math.min(...ys),
      jeSchlag: komp(1),
      halbeSchlaege: komp(0.5),
      jeTakt: komp(0.25),
      zweiTakte: komp(0.125),
    };
  });
  pruefe('der Koerper bewegt sich sichtbar', groove.hub > 8,
    `${groove.hub.toFixed(1)} Bildpunkte bei 600 Hoehe`);
  pruefe('und zwar einmal je Takt', groove.jeTakt > 3,
    `${groove.jeTakt.toFixed(2)} Bildpunkte Amplitude`);
  /*
   * Die eigentliche Pruefung. Zwanzig zu eins ist kein knapp gesetzter
   * Grenzwert: Gemessen liegt das Verhaeltnis bei ueber vierzig, und die alte
   * Fassung lag bei 0,15 - also auf der anderen Seite um den Faktor 130.
   * Dazwischen ist so viel Platz, dass die Zahl eine Aussage trifft und nicht
   * nur den Ist-Zustand festschreibt.
   */
  pruefe('nichts davon haengt am einzelnen Schlag',
    groove.jeTakt > groove.jeSchlag * 20,
    `je Takt ${groove.jeTakt.toFixed(2)} gegen je Schlag ${groove.jeSchlag.toFixed(2)} Bildpunkte`);
  pruefe('auch nicht auf dem Achtel dazwischen',
    groove.jeTakt > groove.halbeSchlaege * 20,
    `je halbem Schlag ${groove.halbeSchlaege.toFixed(2)} Bildpunkte`);

  console.log('\nDer Groove haengt am Tempo, nicht an der Uhr:');
  /*
   * Der Fehler, um den es hier geht, ist der alte: Eine Bewegung, die nach
   * Sekunden laeuft statt nach Schlaegen, passt genau zu einem Tempo. Die
   * Verlagerung zaehlt deshalb in Schlaegen - acht je Durchgang, also zwei
   * Takte -, und das laesst sich pruefen: Ihre Dauer *in Sekunden* muss sich
   * umgekehrt zum Tempo verhalten.
   *
   * Bei 100 Schlaegen je Minute sind acht Schlaege 4,80 Sekunden, bei 175
   * nur 2,74. Eine Bewegung nach der Uhr haette ueberall dieselbe Dauer.
   */
  const tempi = await seite.evaluate(async () => {
    const aus = [];
    for (const bpm of [100, 140, 175]) {
      const m = window.__probe.m;
      m.schattenSetzen(true);
      m.schattenZuruecksetzen();
      const dt = 1 / 60;
      const proben = [];
      for (let i = 0; i < 900; i++) {
        const beat = (i * dt * bpm) / 60;
        m.schattenZeichnen(window.__probe.stift, 900, 600, {
          sekunden: dt,
          takt: {
            beat, imBeat: beat - Math.floor(beat), nummer: Math.floor(beat),
            aufEins: Math.floor(beat) % 4 === 0, aufPhrase: Math.floor(beat) % 32 === 0,
          },
          spannung: 0, abbau: 0, wucht: 0.85, drop: false, anteilB: 0,
          palette: ['#123', '#456', '#789', '#8ad7ff'], guetestufe: 'hoch',
        });
        proben.push({ zeit: i * dt, beat, ...m.schattenStand() });
      }
      const r = proben.slice(300);
      /*
       * Die Dauer eines Durchgangs aus der Verlagerung selbst: Abstand
       * zwischen zwei Nulldurchgaengen in derselben Richtung. Gemessen wird
       * am Ergebnis und nicht an der Phase, damit auch eine falsch
       * angewandte Phase auffiele.
       */
      const kreuz = [];
      for (let i = 1; i < r.length; i++) {
        if (r[i - 1].wiegen <= 0 && r[i].wiegen > 0) kreuz.push(r[i].zeit);
      }
      const dauern = [];
      for (let i = 1; i < kreuz.length; i++) dauern.push(kreuz[i] - kreuz[i - 1]);
      dauern.sort((a, b) => a - b);
      aus.push({ bpm, dauer: dauern.length ? dauern[Math.floor(dauern.length / 2)] : 0 });
    }
    return aus;
  });
  for (const t of tempi) {
    const soll = (8 * 60) / t.bpm;
    pruefe(
      `bei ${t.bpm} Schlaegen je Minute dauert eine Verlagerung acht Schlaege`,
      Math.abs(t.dauer - soll) < soll * 0.06,
      `${t.dauer.toFixed(2)} s gemessen, ${soll.toFixed(2)} s gerechnet`,
    );
  }

  console.log('\nDer Akzent kommt auf der Phrasengrenze, nicht dauernd:');
  /*
   * Das Klopfen ist weg, aber die Figur soll deshalb nicht gleichmuetig
   * werden. Was frueher jeden Schlag traf, trifft jetzt nur noch die
   * Phrasengrenze - alle 32 Schlaege einmal, bei 128 also alle fuenfzehn
   * Sekunden. Genau dadurch faellt es auf.
   *
   * Geprueft wird beides: dass es an der Grenze wirklich einen zusaetzlichen
   * Ausschlag gibt, und dass er dazwischen wieder ganz verschwunden ist.
   */
  const akzent = await seite.evaluate(() => {
    const proben = window.__probe.lauf(1200, { wucht: 0.85 });
    let anGrenze = 0;
    let dazwischen = 0;
    for (const p of proben.slice(300)) {
      const seitGrenze = p.beat % 32;
      // Die Feder ist nach gut einem halben Schlag durch.
      if (seitGrenze < 1) anGrenze = Math.max(anGrenze, Math.abs(p.nickX));
      else if (seitGrenze > 4) dazwischen = Math.max(dazwischen, Math.abs(p.nickX));
    }
    return { anGrenze, dazwischen };
  });
  pruefe('an der Phrasengrenze sackt er zusaetzlich ein', akzent.anGrenze > 0.12,
    `Federauslenkung ${akzent.anGrenze.toFixed(3)}`);
  pruefe('und dazwischen ruehrt sich die Feder nicht', akzent.dazwischen < 0.02,
    `Federauslenkung ${akzent.dazwischen.toFixed(3)}`);

  console.log('\nOhne Takt steht die Figur still:');
  /*
   * Gemessen wird nach dem Abschalten und nicht aus dem Stand: Aus dem Stand
   * ist alles null, und die Pruefung waere geschenkt. Der Fehler, den sie
   * finden soll, ist der andere - eine Verlagerung, die einmal angelaufen
   * ist und dann in der Stille weiterschaukelt.
   */
  const still = await seite.evaluate(() => {
    const proben = window.__probe.lauf(420, { wucht: 0.85 }, (lage, i) => {
      if (i >= 180) { lage.takt = null; lage.wucht = 0; }
    });
    const nach = proben.slice(300);
    return {
      feder: Math.max(...nach.map((p) => Math.abs(p.nickX))),
      senken: Math.max(...nach.map((p) => Math.abs(p.senken))),
      wiegen: Math.max(...nach.map((p) => Math.abs(p.wiegen))),
    };
  });
  pruefe('die Feder steht still', still.feder < 0.01, still.feder.toFixed(4));
  pruefe('die Verlagerung kommt zur Ruhe',
    still.senken < 0.02 && still.wiegen < 0.02,
    `Senken ${still.senken.toFixed(4)}, Wiegen ${still.wiegen.toFixed(4)}`);

  console.log('\nDer Drop hebt die Haende:');
  const drop = await seite.evaluate(() => {
    /*
     * Der Vergleichslauf braucht *wenig* Wucht, sonst vergleicht er den Drop
     * mit der Faustpumpe statt mit dem Ruhezustand. Bei der Vorgabe von 0,5
     * pumpt die Figur bereits zu 69 Prozent, und der Unterschied schrumpfte
     * dadurch von deutlich sichtbar auf 57 Bildpunkte.
     */
    const ruhe = window.__probe.lauf(240, { wucht: 0.2 });
    // Der Drop faellt in Bild 120; danach wird eine Sekunde lang gemessen.
    const mit = window.__probe.lauf(240, {}, (lage, i) => {
      if (i === 120) lage.drop = true;
      if (i > 120) lage.wucht = 0.9;
    });
    const hoehe = (p) => Math.min(p.handL?.y ?? 1e9, p.handR?.y ?? 1e9);
    return {
      ruhe: Math.min(...ruhe.slice(120).map(hoehe)),
      drop: Math.min(...mit.slice(120).map(hoehe)),
      halt: mit[150].dropHalt,
      spaeter: mit[239].dropHalt,
    };
  });
  // Kleineres y heisst weiter oben. Ein Drop, den man nicht sieht, ist keiner.
  pruefe('die Haende gehen deutlich hoeher als im Ruhezustand',
    drop.drop < drop.ruhe - 60, `${Math.round(drop.ruhe - drop.drop)} Bildpunkte hoeher`);
  pruefe('der Drop haelt eine halbe Sekunde spaeter noch an', drop.halt > 0.6,
    drop.halt.toFixed(2));
  pruefe('und ist nach zwei Sekunden vorbei', drop.spaeter < 0.05, drop.spaeter.toFixed(2));

  console.log('\nIm Breakdown geht der Kopfhoerer ans Ohr:');
  const breakdown = await seite.evaluate(() => {
    const ruhe = window.__probe.lauf(200);
    const mit = window.__probe.lauf(200, { abbau: 0.8, wucht: 0.15 });
    const letzteR = ruhe[ruhe.length - 1];
    const letzteB = mit[mit.length - 1];
    // Die Kopfposition kommt aus dem Modul selbst. Sie hier nachzurechnen
    // hiesse, die Geometrie an zwei Stellen zu pflegen - und beim naechsten
    // Umbau der Proportionen misst die Abnahme dann gegen einen Punkt, an dem
    // kein Kopf mehr ist.
    const ohrNah = (p) => Math.hypot(p.handL.x - p.kopf.x, p.handL.y - p.kopf.y);
    return { ruhe: ohrNah(letzteR), breakdown: ohrNah(letzteB) };
  });
  pruefe('die linke Hand kommt dem Kopf viel naeher',
    breakdown.breakdown < breakdown.ruhe * 0.5,
    `${Math.round(breakdown.breakdown)} statt ${Math.round(breakdown.ruhe)} Bildpunkte`);

  console.log('\nBeim Uebergang wandert die Hand mit dem Regler:');
  const regler = await seite.evaluate(() => {
    const stellen = [];
    /*
     * Gemessen wird *waehrend* des Uebergangs, also ab einem Stand knapp
     * ueber null. Der Ruhestand gehoert nicht in diese Reihe: Dort liegt die
     * Hand am Mischer und nicht am Regler, und dass sie beim Griff zum Regler
     * einmal springt, ist richtig so - ein DJ *greift* danach.
     */
    for (const anteil of [0.02, 0.25, 0.5, 0.75, 1]) {
      const p = window.__probe.lauf(200, { anteilB: anteil });
      stellen.push(p[p.length - 1].handR.x);
    }
    return stellen;
  });
  // Sie muss monoton nach rechts wandern - sonst ist es Zufall und keine
  // Anzeige des Reglerstands.
  let steigt = true;
  for (let i = 1; i < regler.length; i++) if (regler[i] <= regler[i - 1]) steigt = false;
  pruefe('die rechte Hand wandert mit dem Reglerstand nach rechts', steigt,
    regler.map((x) => Math.round(x)).join(' → '));
  pruefe('und legt dabei einen sichtbaren Weg zurueck',
    regler[4] - regler[0] > 60, `${Math.round(regler[4] - regler[0])} Bildpunkte`);

  console.log('\nDer Aufbau zieht den Arm hoch:');
  const aufbau = await seite.evaluate(() => {
    const hoehen = [];
    for (const s of [0, 0.4, 0.7, 1]) {
      const p = window.__probe.lauf(200, { spannung: s });
      hoehen.push(p[p.length - 1].handR.y);
    }
    return hoehen;
  });
  let hoeher = true;
  for (let i = 1; i < aufbau.length; i++) if (aufbau[i] >= aufbau[i - 1]) hoeher = false;
  pruefe('mit steigender Spannung geht die Hand hoeher', hoeher,
    aufbau.map((y) => Math.round(y)).join(' → '));

  /*
   * Die Figur muss *eine* Figur bleiben - auch mit erhobenen Armen.
   *
   * Diese Pruefung gibt es, weil genau hier zwei Fassungen gescheitert sind,
   * und zwar unsichtbar fuer jede andere Zahl: Die Haende gingen brav hoch,
   * die Feder stimmte, die Rechenzeit stimmte - und der Arm schwebte
   * abgerissen neben der Schulter. Erst der Blick auf ein Standbild zeigte
   * es.
   *
   * Messbar ist es als Zusammenhang: Von einem Punkt im Kopf aus werden alle
   * schwarzen Nachbarn eingefaerbt. Was danach noch schwarz und nicht
   * eingefaerbt ist, haengt nicht mit dem Koerper zusammen - ein losgeloester
   * Arm. Erlaubt sind nur Kruemel; die Aussparung im Kopfhoerer und die
   * weichen Kanten der Leinwand liefern immer ein paar.
   */
  /* --- Was ein Mensch kann, und was nicht ------------------------------
   *
   * Diese beiden Pruefungen gibt es, weil die Figur ueber Wochen Arme hatte,
   * die in echt gebrochen waeren, und weil niemand es an einer Zahl sehen
   * konnte. Erst ein Protokoll der Gelenkwinkel ueber zwei Schlaege zeigte
   * es: Der rechte Ellenbogen lief bei der Faustpumpe von -163 auf +149 Grad,
   * also durch die Streckung hindurch auf die andere Seite, und im
   * Ruhezustand wanderte er 125 Grad hin und her, obwohl nichts passierte.
   *
   * Gemessen wird deshalb ueber *alle* Haltungen und jedes Bild:
   *
   *   1. Kein Gelenk verlaesst seinen menschlichen Bereich. Der Ellenbogen
   *      beugt sich nur in eine Richtung, hoechstens 150 Grad weit, und ueber
   *      die Streckung hinaus fast nicht. Der Oberarm dreht sich nicht hinter
   *      den Koerper.
   *   2. Kein Gelenk springt. Ein Winkel, der sich in einer Sechzigstel-
   *      sekunde um mehr als ein paar Grad aendert, ist kein Bewegung mehr,
   *      sondern ein Umschalten - und genau so sah es aus.
   */
  console.log('\nDie Gelenke bleiben im menschlichen Bereich:');
  const gelenke = await seite.evaluate(() => {
    const { m, stift } = window.__probe;
    const lagen = {
      ruhe: { wucht: 0.2 },
      pumpe: { wucht: 0.95 },
      aufbau: { spannung: 1, wucht: 0.85 },
      drop: { spannung: 0.9, wucht: 1, drop: true },
      breakdown: { abbau: 0.85, wucht: 0.15 },
      uebergang: { anteilB: 0.5, wucht: 0.5 },
    };
    const aus = {};
    for (const [name, grund] of Object.entries(lagen)) {
      m.schattenZuruecksetzen();
      m.schattenSetzen(true);
      let schulterMin = 1e9, schulterMax = -1e9, beugMin = 1e9, beugMax = -1e9;
      let groessterSprung = 0;
      let vorher = null;
      for (let i = 0; i < 260; i++) {
        const beat = ((i / 60) * 128) / 60;
        m.schattenZeichnen(stift, 900, 600, {
          sekunden: 1 / 60,
          takt: {
            beat, imBeat: beat - Math.floor(beat), nummer: Math.floor(beat),
            aufEins: Math.floor(beat) % 4 === 0, aufPhrase: Math.floor(beat) % 32 === 0,
          },
          spannung: 0, abbau: 0, wucht: 0.5, anteilB: 0,
          palette: ['#123', '#456', '#789', '#8ad7ff'], guetestufe: 'hoch',
          ...grund, ...(grund.drop ? { drop: i === 200 } : {}),
        });
        const g = m.schattenStand().gelenke;
        // Die ersten Bilder ueberspringen: Da faehrt die Figur erst an.
        if (i < 20 || !g[0] || !g[1]) { vorher = g; continue; }
        for (const k of [0, 1]) {
          schulterMin = Math.min(schulterMin, g[k].schulter);
          schulterMax = Math.max(schulterMax, g[k].schulter);
          beugMin = Math.min(beugMin, g[k].beugung);
          beugMax = Math.max(beugMax, g[k].beugung);
          if (vorher && vorher[k]) {
            groessterSprung = Math.max(
              groessterSprung,
              Math.abs(g[k].schulter - vorher[k].schulter),
              Math.abs(g[k].beugung - vorher[k].beugung),
            );
          }
        }
        vorher = g;
      }
      aus[name] = { schulterMin, schulterMax, beugMin, beugMax, groessterSprung };
    }
    return aus;
  });
  let schlimmsteBeugung = 0;
  let schlimmsteSchulter = 0;
  let schlimmsterSprung = 0;
  for (const [name, w] of Object.entries(gelenke)) {
    schlimmsteBeugung = Math.max(schlimmsteBeugung, w.beugMax, -w.beugMin);
    schlimmsteSchulter = Math.max(schlimmsteSchulter, Math.abs(w.schulterMin), Math.abs(w.schulterMax));
    schlimmsterSprung = Math.max(schlimmsterSprung, w.groessterSprung);
    console.log(
      `    ${name.padEnd(10)} Schulter ${w.schulterMin.toFixed(0).padStart(5)}..` +
      `${w.schulterMax.toFixed(0).padEnd(5)} Ellenbogen ${w.beugMin.toFixed(0).padStart(5)}..` +
      `${w.beugMax.toFixed(0).padEnd(5)} groesster Schritt ${w.groessterSprung.toFixed(1)}°`,
    );
  }
  // Ein Grad Spiel auf die Grenzen: Die Glaettung laeuft ihnen minimal nach.
  const engste = Math.min(...Object.values(gelenke).map((w) => w.beugMin));
  pruefe('der Ellenbogen beugt sich nur in eine Richtung und nicht ueber 150°',
    schlimmsteBeugung <= 151 && engste >= -16,
    `Beugung ${engste.toFixed(0)}° bis ${schlimmsteBeugung.toFixed(0)}°`);
  pruefe('der Oberarm dreht nicht hinter den Koerper', schlimmsteSchulter <= 106,
    `hoechstens ${schlimmsteSchulter.toFixed(0)}° aus der Bindepose`);
  /*
   * 15 Grad je Bild sind 900 Grad je Sekunde. Der Zeichner deckelt bei 800;
   * die Reserve faengt ab, dass ein Bild einmal etwas laenger dauert.
   */
  pruefe('kein Gelenk springt von Bild zu Bild', schlimmsterSprung < 15,
    `groesster Schritt ${schlimmsterSprung.toFixed(1)}° je Bild, das sind ` +
    `${(schlimmsterSprung * 60).toFixed(0)}° je Sekunde`);

  console.log('\nAuch mit erhobenen Armen bleibt es eine Figur:');
  const zusammenhang = await seite.evaluate(() => {
    const { m, stift } = window.__probe;
    const b = 900;
    const h = 600;
    const messen = (grund) => {
      m.schattenZuruecksetzen();
      m.schattenSetzen(true);
      let stand = null;
      for (let i = 0; i < 240; i++) {
        stift.clearRect(0, 0, b, h);
        m.schattenZeichnen(stift, b, h, {
          sekunden: 1 / 60,
          takt: { beat: i / 30, imBeat: 0, nummer: Math.floor(i / 30), aufEins: true, aufPhrase: false },
          wucht: 1, palette: ['#123', '#456', '#789', '#8ad7ff'],
          ...grund,
          ...(grund.drop ? { drop: i === 200 } : {}),
        });
        stand = m.schattenStand();
      }
      const d = stift.getImageData(0, 0, b, h).data;
      /*
       * Die Schwelle liegt tief, und das ist Absicht.
       *
       * Bei 200 meldete die Pruefung zuverlaessig zwei "lose" Stuecke von je
       * 1500 Bildpunkten - und es waren nicht die Arme, sondern die
       * Plattenteller. Sie werden als Bildstreifen gezeichnet, der Block
       * darunter als Rechteck, und an der Naht liegt eine Reihe geglaetteter
       * Bildpunkte mit halber Deckung. Bei 40 ist die Naht geschlossen. Ein
       * wirklich abgerissener Arm steht dagegen in vollstaendig leerem Grund;
       * den findet die Pruefung bei jeder Schwelle.
       */
      const voll = new Uint8Array(b * h);
      let schwarz = 0;
      for (let p = 0; p < b * h; p++) {
        if (d[p * 4 + 3] > 40) { voll[p] = 1; schwarz++; }
      }
      // Startpunkt: der Kopf. Er gehoert immer zum Koerper.
      const sx = Math.round(stand.kopf.x);
      const sy = Math.round(stand.kopf.y);
      if (!voll[sy * b + sx]) return { schwarz, lose: schwarz };
      const stapel = [sy * b + sx];
      voll[sy * b + sx] = 2;
      let erreicht = 1;
      while (stapel.length) {
        const q = stapel.pop();
        const qx = q % b;
        for (const n of [q - 1, q + 1, q - b, q + b]) {
          if (n < 0 || n >= b * h || voll[n] !== 1) continue;
          if (Math.abs((n % b) - qx) > 1) continue;
          voll[n] = 2;
          erreicht++;
          stapel.push(n);
        }
      }
      return { schwarz, lose: schwarz - erreicht };
    };
    return {
      drop: messen({ spannung: 0.9, drop: true }),
      aufbau: messen({ spannung: 1 }),
    };
  });
  for (const [name, wert] of Object.entries(zusammenhang)) {
    const anteil = wert.lose / Math.max(1, wert.schwarz);
    pruefe(`${name}: kein losgeloestes Stueck`, anteil < 0.01,
      `${wert.lose} von ${wert.schwarz} Bildpunkten haengen nicht am Koerper`);
  }

  console.log('\nUnd es kostet fast nichts:');
  const kosten = await seite.evaluate(() => {
    const m = window.__probe.m;
    const stift = window.__probe.stift;
    const lage = {
      sekunden: 1 / 60,
      takt: { beat: 12.3, imBeat: 0.3, nummer: 12, aufEins: true, aufPhrase: false },
      spannung: 0.6, abbau: 0, wucht: 0.7, drop: false, anteilB: 0.3,
      palette: ['#123', '#456', '#789', '#8ad7ff'], guetestufe: 'hoch',
    };
    // Warmlaufen, sonst misst man den Uebersetzer.
    for (let i = 0; i < 200; i++) m.schattenZeichnen(stift, 900, 600, lage);
    const vor = performance.now();
    for (let i = 0; i < 600; i++) m.schattenZeichnen(stift, 900, 600, lage);
    return (performance.now() - vor) / 600;
  });
  /*
   * Die Schwelle steht bei 0,8 ms, und die Zahl braucht ihren Zusammenhang.
   *
   * Hier laeuft ein Chromium ohne Grafikkarte - die 2D-Leinwand wird in
   * Software gemalt. Was gemessen wird, ist also der schlechteste denkbare
   * Fall und nicht der Betrieb: Auf einem Geraet, auf dem die Leinwand von
   * der Karte kommt, kostet dasselbe einen Bruchteil davon. Die Zahl, die am
   * Abend zaehlt, steht in der Technikanzeige unter "Ueberzug zeichnen".
   *
   * Trotzdem eine Grenze, und sie hat schon einmal gegriffen: Die erste
   * Fassung mit gezeichneten Teilen lag bei 0,86 ms. Drei Dinge haben sie auf
   * 0,55 gebracht - die Teile werden in Zielgroesse zwischengelegt statt in
   * jedem Bild neu verkleinert, der Saum benutzt den schnellen Zeichenweg,
   * und das Pult wird unterhalb der Kante als Rechteck gefuellt statt als
   * Bild geblittet. Ohne eine Grenze faellt so etwas nie auf.
   */
  pruefe('unter 0,8 ms je Bild, hier ohne Grafikkarte gemessen', kosten < 0.8,
    `${kosten.toFixed(3)} ms`);

  console.log('\nAbschalten heisst abschalten:');
  const aus = await seite.evaluate(() => {
    const { m, stift } = window.__probe;
    m.schattenZuruecksetzen();
    const lein = stift.canvas;
    const lage = {
      sekunden: 1 / 60,
      takt: { beat: 4, imBeat: 0, nummer: 4, aufEins: true, aufPhrase: false },
      wucht: 1, palette: ['#123', '#456', '#789', '#8ad7ff'],
    };
    const gemalt = () => {
      stift.clearRect(0, 0, 900, 600);
      m.schattenZeichnen(stift, 900, 600, lage);
      const d = stift.getImageData(0, 400, 900, 200).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
      return n;
    };
    m.schattenSetzen(true);
    const an = gemalt();
    m.schattenSetzen(false);
    const ab = gemalt();
    m.schattenSetzen(true);
    return { an, ab };
  });
  pruefe('eingeschaltet steht etwas im unteren Bilddrittel', aus.an > 5000,
    `${aus.an} Bildpunkte`);
  pruefe('ausgeschaltet nichts', aus.ab === 0, `${aus.ab} Bildpunkte`);

  console.log('');
  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
