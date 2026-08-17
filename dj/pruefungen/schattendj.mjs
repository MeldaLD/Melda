// Abnahme fuer den Schatten-DJ.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/schattendj.mjs
//
// Die Figur soll sich zu *dieser* Musik bewegen und nicht irgendwie zappeln.
// Der Unterschied ist von aussen nicht zu sehen - beides sieht nach Bewegung
// aus -, aber er ist messbar, und deshalb steht er hier:
//
//   1. Der Kopf nickt auf den Schlag. Geprueft wird nicht "er bewegt sich",
//      sondern dass die Bewegung *nach* dem Schlag am staerksten ist. Eine
//      Figur, die nach einem Zufallsgenerator wackelt, faellt genau hier
//      durch.
//   2. Ohne Takt steht sie still. Sonst wackelt sie auch bei Stille weiter,
//      und das sieht gespenstisch aus.
//   3. Der Drop hebt die Haende, und zwar messbar hoeher als im Ruhezustand.
//   4. Im Breakdown geht eine Hand ans Ohr - der Kopfhoerer. Das ist keine
//      Behauptung: Die Buehne bereitet in dieser Zeit wirklich den naechsten
//      Track vor.
//   5. Beim Uebergang wandert die Hand mit dem Regler. Am Schatten laesst sich
//      also ablesen, wie weit der Wechsel ist.
//   6. Es kostet fast nichts.
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

  console.log('\nDer Kopf nickt auf den Schlag, nicht irgendwann:');
  const nicken = await seite.evaluate(() => {
    const proben = window.__probe.lauf(300);
    /*
     * Fuer jedes Bild: wie weit ist es (in Bruchteilen eines Schlags) seit
     * dem letzten Schlag? Dazu die Staerke der Auslenkung. Gemittelt ueber
     * acht Faecher ergibt das die Form des Nickens innerhalb eines Schlags.
     */
    const faecher = new Array(8).fill(0);
    const zahl = new Array(8).fill(0);
    for (const p of proben.slice(60)) {
      const f = Math.min(7, Math.floor((p.beat - Math.floor(p.beat)) * 8));
      faecher[f] += Math.abs(p.nickX);
      zahl[f]++;
    }
    const mittel = faecher.map((s, i) => (zahl[i] ? s / zahl[i] : 0));
    return {
      mittel,
      hoechst: Math.max(...proben.map((p) => Math.abs(p.nickX))),
      // Was am Ende zaehlt: wie weit der Kopf wirklich wandert.
      hoechstPx: Math.max(...proben.map((p) => Math.abs(p.nickPx))),
    };
  });
  const stelle = nicken.mittel.indexOf(Math.max(...nicken.mittel));
  /*
   * Gemessen wird in Bildpunkten und nicht in der Federauslenkung. Von der
   * beabsichtigten Auslenkung kommt bei diesem Daempfungsgrad nur gut die
   * Haelfte an - das ist die Bauart der Feder und kein Fehler. Was zaehlt,
   * ist der Weg auf dem Bildschirm: Bei 600 Bildpunkten Hoehe sind drei
   * Bildpunkte sichtbar, auf einer Leinwand mit 1080 werden gut fuenf daraus.
   */
  pruefe('der Kopf wandert sichtbar', nicken.hoechstPx > 3,
    `${nicken.hoechstPx.toFixed(1)} Bildpunkte bei 600 Hoehe`);
  /*
   * Der Ausschlag muss kurz *nach* dem Schlag liegen, nicht davor und nicht
   * gleichmaessig verteilt. Genau daran haengt, ob es wie ein Nicken aussieht
   * oder wie ein Wackeln.
   */
  pruefe('und am staerksten kurz nach dem Schlag', stelle <= 2,
    `Spitze im ${stelle + 1}. von 8 Faechern`);
  const flach = Math.min(...nicken.mittel) / Math.max(...nicken.mittel);
  pruefe('die Bewegung ist nicht gleichmaessig verteilt', flach < 0.7,
    `flachste Stelle bei ${(flach * 100).toFixed(0)} % der hoechsten`);

  console.log('\nOhne Takt steht die Figur still:');
  const still = await seite.evaluate(() => {
    const proben = window.__probe.lauf(180, { takt: null, wucht: 0 });
    return Math.max(...proben.map((p) => Math.abs(p.nickX)));
  });
  pruefe('kein Nicken ohne Musik', still < 0.01, `${still.toFixed(4)}`);

  console.log('\nDer Drop hebt die Haende:');
  const drop = await seite.evaluate(() => {
    const ruhe = window.__probe.lauf(240);
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
   * Eine halbe Millisekunde ist grosszuegig - gemessen liegt es weit darunter.
   * Die Grenze steht dort, weil ein Bild bei 60 je Sekunde 16,7 ms hat und
   * der Schatten davon nichts Nennenswertes nehmen darf.
   */
  pruefe('unter einer halben Millisekunde je Bild', kosten < 0.5,
    `${kosten.toFixed(3)} ms`);

  console.log('\nAbschalten heisst abschalten:');
  const aus = await seite.evaluate(() => {
    const { m, stift } = window.__probe;
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
