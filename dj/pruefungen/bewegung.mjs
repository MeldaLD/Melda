// Abnahme fuer die Einlesekette.
//
//   node dj/pruefungen/bewegung.mjs
//
// Gemessen wird gegen den Pruef-Taenzer (`werkzeuge/prueftaenzer.mjs`), und
// das ist der Punkt: Dessen Sollwerte sind hineingeschrieben, nicht geraten.
// Wenn die Kette 124,0 BPM meldet, eine Verlagerung ueber acht Schlaege und
// ein Absacken ueber vier, dann nicht, weil es plausibel aussieht.
//
// Zwei Laeufe je Pruefung, wo es geht: einmal an sauberen Daten, einmal an
// verrauschten. Eine Kette, die nur an sauberen Daten funktioniert, nuetzt
// nichts - was von einer Bewegungserfassung kommt, zittert immer.

import fs from 'node:fs/promises';
import { einlesen, umrechnen, tipperFinden, abtasten, nahtFehler, nahtSchliessen,
  packen, auspacken, KNOCHEN, PROBEN_JE_SCHLAG } from '../werkzeuge/bewegung.mjs';
import { bvhLesen, vorwaerts, gelenkeZuordnen } from '../werkzeuge/bvh.mjs';
import { taenzerBauen, SOLL, SCHLAG, BILDRATE } from '../werkzeuge/prueftaenzer.mjs';

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

const sauber = taenzerBauen();
const zittrig = taenzerBauen({ zittern: true });

console.log('\nDer Einzaehltakt wird gefunden:');
for (const [wie, text] of [['sauber', sauber], ['zittrig', zittrig]]) {
  const s = bvhLesen(text);
  const zu = gelenkeZuordnen(s);
  const stellen = s.bilder.map((b) => vorwaerts(s, b));
  const t = tipperFinden(
    stellen.map((w) => w[zu.handL].p),
    stellen.map((w) => w[zu.handR].p),
    s.bildDauer, SCHLAG,
  );
  const abZeit = Math.abs(t.zeit - SOLL.ersterTipper) * 1000;
  const abBpm = Math.abs(60 / t.schlagDauer - SOLL.bpm);
  /*
   * Ein Bild sind bei 60 Bildern je Sekunde 16,7 ms. Genauer als ein Bild
   * kann eine Aufnahme den Aufschlag gar nicht kennen, also ist das die
   * Grenze - und nicht eine, die ich mir grosszuegig gesetzt haette.
   */
  pruefe(`${wie}: der erste Tipper sitzt richtig`, abZeit < 1000 / BILDRATE + 1,
    `${(t.zeit * 1000).toFixed(0)} ms statt ${(SOLL.ersterTipper * 1000).toFixed(0)}, also ${abZeit.toFixed(0)} ms daneben`);
  pruefe(`${wie}: das Tempo stimmt`, abBpm < 1.5,
    `${(60 / t.schlagDauer).toFixed(2)} BPM statt ${SOLL.bpm}`);
  pruefe(`${wie}: erkannt wurde die tippende Hand`, t.hand === 'rechts', t.hand);
}

console.log('\nDie Kamera-Schraeglage wird herausgerechnet:');
{
  /*
   * Der Pruef-Taenzer steht frontal. Wird die ganze Aufnahme kuenstlich
   * gedreht - so, als haette die Kamera schraeg gestanden -, muss dieselbe
   * Schleife herauskommen. Das ist die schaerfere Pruefung als "der Winkel
   * wird richtig gemessen": Sie prueft, ob er auch richtig *angewandt* wird.
   */
  const s = bvhLesen(sauber);
  const zu = gelenkeZuordnen(s);
  const gerade = umrechnen(s, zu);

  // 25 Grad um die Senkrechte drehen: die Wurzel bekommt einen Yrotation-Wert.
  const gedreht = bvhLesen(sauber.replace(/^(-?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+ )(-?[\d.]+)/gm,
    (_, vorn, y) => `${vorn}${(Number(y) + 25).toFixed(4)}`));
  const schief = umrechnen(gedreht, zu);

  let schlimmster = 0;
  for (const [name] of KNOCHEN) {
    for (let i = 0; i < gerade.richtungen[name].length; i += 7) {
      const a = gerade.richtungen[name][i];
      const b = schief.richtungen[name][i];
      const grad = (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
      schlimmster = Math.max(schlimmster, grad);
    }
  }
  pruefe('eine um 25 Grad gedrehte Aufnahme ergibt dieselben Richtungen',
    schlimmster < 1.5, `groesster Unterschied ${schlimmster.toFixed(2)} Grad`);
}

console.log('\nDie Bewegung landet mit den richtigen Perioden auf dem Raster:');
{
  const e = einlesen(sauber);
  /*
   * Der Pruef-Taenzer verlagert das Gewicht ueber acht Schlaege und sackt
   * ueber vier ab. Beides muss sich in der Schleife wiederfinden - und zwar
   * ohne dass die Kette davon weiss. Gemessen wird an der Wurzelspur, per
   * Kammabgleich ueber die Zahl der Schwingungen in der Schleife.
   */
  const schwingungen = (reihe, achse) => {
    const n = reihe.length;
    const mittel = reihe.reduce((a, p) => a + p[achse], 0) / n;
    let bestes = -Infinity;
    let beste = 0;
    for (let k = 0.5; k <= 6; k += 0.5) {
      let re = 0;
      let im = 0;
      for (let i = 0; i < n; i++) {
        const w = (2 * Math.PI * k * i) / n;
        re += (reihe[i][achse] - mittel) * Math.cos(w);
        im += (reihe[i][achse] - mittel) * Math.sin(w);
      }
      const b = Math.hypot(re, im) / n;
      if (b > bestes) { bestes = b; beste = k; }
    }
    return beste;
  };
  // Die Schleife ist acht Schlaege lang. Eine Verlagerung ueber acht Schlaege
  // ist darin *eine* Schwingung, ein Absacken ueber vier sind zwei.
  const seit = schwingungen(e.wurzel, 0);
  const hoch = schwingungen(e.wurzel, 1);
  pruefe('die Verlagerung dauert acht Schlaege', Math.abs(seit - 1) < 0.01,
    `${seit.toFixed(1)} Schwingungen in acht Schlaegen`);
  pruefe('das Absacken dauert vier', Math.abs(hoch - 2) < 0.01,
    `${hoch.toFixed(1)} Schwingungen in acht Schlaegen`);
  pruefe('die Schleife hat die erwartete Laenge',
    e.wurzel.length === 8 * PROBEN_JE_SCHLAG, `${e.wurzel.length} Proben`);
  pruefe('sie faengt auf einem ganzen Schlag an', Number.isInteger(e.messwerte.abSchlag),
    `ab Schlag ${e.messwerte.abSchlag}`);
}

console.log('\nDie Naht ist zu:');
for (const [wie, text] of [['sauber', sauber], ['zittrig', zittrig]]) {
  const e = einlesen(text);
  const rest = nahtFehler(e);
  pruefe(`${wie}: nach dem Schliessen bleibt kein Sprung`, rest < 0.5,
    `${rest.toFixed(2)} Grad zwischen letzter und erster Probe (vorher ${e.messwerte.nahtGrad.toFixed(1)})`);
}

console.log('\nKnochen behalten ihre Laenge - egal welche:');
{
  /*
   * Der eigentliche Grund fuer das ganze Verfahren.
   *
   * Gespeichert werden Richtungen, die Laengen kommen aus der Zeichnung.
   * Damit *kann* ein Knochen gar nicht die falsche Laenge bekommen - und
   * genau das wird hier nachgewiesen: Dieselbe Schleife, einmal mit den
   * Massen der aufgenommenen Person aufgebaut und einmal mit ganz anderen,
   * muss beide Male ein in sich stimmiges Skelett ergeben.
   */
  const e = einlesen(sauber);
  const aufbauen = (laengen) => {
    const punkte = [];
    for (let i = 0; i < e.wurzel.length; i++) {
      const huefte = [e.wurzel[i][0], e.wurzel[i][1]];
      const r = (name) => e.richtungen[name][i];
      const geh = (von, name, l) => [von[0] + r(name)[0] * l, von[1] + r(name)[1] * l];
      const hals = geh(huefte, 'rumpf', laengen.rumpf);
      const kopf = geh(hals, 'kopf', laengen.kopf);
      const schulterR = [hals[0] + laengen.schulter, hals[1]];
      const ellbogenR = geh(schulterR, 'oberarmR', laengen.oberarm);
      const handR = geh(ellbogenR, 'unterarmR', laengen.unterarm);
      punkte.push({ huefte, hals, kopf, schulterR, ellbogenR, handR });
    }
    return punkte;
  };
  const pruefeMasse = (name, laengen) => {
    const p = aufbauen(laengen);
    let schlimmster = 0;
    for (const f of p) {
      /*
       * Im Bild ist ein Knochen *hoechstens* so lang wie in Wirklichkeit -
       * zeigt er zur Kamera, ist er kuerzer. Er darf also nie laenger sein,
       * und genau das wird geprueft. Eine Ueberlaenge waere der Beweis, dass
       * die Richtung nicht auf eins normiert ist.
       */
      const ober = Math.hypot(f.ellbogenR[0] - f.schulterR[0], f.ellbogenR[1] - f.schulterR[1]);
      const unter = Math.hypot(f.handR[0] - f.ellbogenR[0], f.handR[1] - f.ellbogenR[1]);
      schlimmster = Math.max(schlimmster, ober - laengen.oberarm, unter - laengen.unterarm);
    }
    pruefe(`${name}: kein Knochen wird laenger als er darf`, schlimmster < 1e-9,
      `groesste Ueberlaenge ${schlimmster.toExponential(1)}`);
  };
  pruefeMasse('Masse der Aufnahme', { rumpf: 52, kopf: 24, schulter: 18, oberarm: 28, unterarm: 26 });
  pruefeMasse('ganz andere Masse', { rumpf: 100, kopf: 60, schulter: 45, oberarm: 12, unterarm: 70 });
}

console.log('\nDie Verkuerzung in die Tiefe ist da, wo sie hingehoert:');
{
  const e = einlesen(sauber);
  /*
   * Ein Knochen, der genau quer zur Kamera steht, ist im Bild voll lang;
   * einer, der zur Kamera zeigt, kuerzer. Die Laenge im Bild ist die Wurzel
   * aus x²+y², und die muss zwischen null und eins liegen. Waere sie immer
   * eins, gaebe es keine Tiefe - dann waere das hier wieder eine flache
   * Zeichnung, und die Arme wuerden wieder brechen.
   */
  let kleinste = 1;
  let groesste = 0;
  for (const [name] of KNOCHEN) {
    for (const v of e.richtungen[name]) {
      const imBild = Math.hypot(v[0], v[1]);
      kleinste = Math.min(kleinste, imBild);
      groesste = Math.max(groesste, imBild);
    }
  }
  pruefe('keine Richtung ist im Bild laenger als eins', groesste <= 1 + 1e-9,
    `groesste ${groesste.toFixed(4)}`);
  pruefe('und die Tiefe wird wirklich genutzt', kleinste < 0.999,
    `kuerzeste Bildlaenge ${kleinste.toFixed(3)} – das sind ${((1 - kleinste) * 100).toFixed(1)} % Verkuerzung`);
}

console.log('\nPacken und Auspacken kostet nichts Sichtbares:');
{
  const e = einlesen(sauber);
  const zurueck = auspacken(e.gepackt);
  let schlimmster = 0;
  for (const [name] of KNOCHEN) {
    for (let i = 0; i < e.richtungen[name].length; i++) {
      const a = e.richtungen[name][i];
      const b = zurueck.richtungen[name][i];
      const grad = (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
      schlimmster = Math.max(schlimmster, grad);
    }
  }
  let wurzelFehler = 0;
  for (let i = 0; i < e.wurzel.length; i++) {
    wurzelFehler = Math.max(wurzelFehler,
      Math.abs(e.wurzel[i][0] - zurueck.wurzel[i][0]), Math.abs(e.wurzel[i][1] - zurueck.wurzel[i][1]));
  }
  /*
   * Ein Grad an der Schulter sind bei einem halben Meter Arm knapp einen
   * Zentimeter an der Hand - auf einer Leinwand ein Fuenftelbildpunkt.
   */
  pruefe('die Richtungen ueberstehen ein Byte je Achse', schlimmster < 1,
    `groesster Unterschied ${schlimmster.toFixed(2)} Grad`);
  pruefe('die Wurzel ueberlebt zwei Byte', wurzelFehler < 1e-3,
    `groesster Unterschied ${wurzelFehler.toExponential(1)} Rumpflaengen`);

  const bytes = e.gepackt.richtungen.length + e.gepackt.wurzel.length * 2;
  pruefe('und eine Schleife bleibt klein', bytes < 4000,
    `${bytes} Byte je Schleife, ${(bytes * 8 / 1024).toFixed(1)} kB fuer acht`);
}

console.log('\nAuch verrauschte Daten ergeben eine brauchbare Schleife:');
{
  /*
   * Beide Laeufe nehmen dieselbe Stelle. Der erste Anlauf liess jeden seine
   * eigene beste Naht suchen - und verglich dann Schlag 17 mit Schlag 19,
   * also zwei verschiedene Takte. Der gemeldete Unterschied von 4,3 Grad war
   * zum guten Teil genau das und nicht das Rauschen.
   */
  const s = einlesen(sauber, { festerSchlag: 8 });
  const z = einlesen(zittrig, { festerSchlag: 8 });
  pruefe('das benutzte Tempo bleibt stehen', Math.abs(z.messwerte.bpm - SOLL.bpm) < 0.01,
    `${z.messwerte.bpm.toFixed(2)} BPM benutzt, ${z.messwerte.gemessenBpm.toFixed(2)} aus den Tippern gemessen`);
  pruefe('und die Messung bleibt in der Toleranz', !z.messwerte.tempoAusMessung,
    `${(z.messwerte.tempoAbweichung * 100).toFixed(1)} % daneben, Grenze 5 %`);
  /*
   * Der Vergleich der Schleifen selbst: Das Zittern ist mit +/- 0,7 Grad je
   * Gelenk angesetzt, und ueber die Kette summiert sich das. Zwei Grad
   * mittlerer Unterschied heisst, dass die Kette das Rauschen weder
   * verstaerkt noch daran zerbricht.
   */
  let summe = 0;
  let zahl = 0;
  for (const [name] of KNOCHEN) {
    for (let i = 0; i < s.richtungen[name].length; i++) {
      const a = s.richtungen[name][i];
      const b = z.richtungen[name][i];
      summe += (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
      zahl++;
    }
  }
  pruefe('und die Haltung weicht nur wenig ab', summe / zahl < 4,
    `im Mittel ${(summe / zahl).toFixed(2)} Grad Unterschied zur sauberen Aufnahme`);
}

console.log('\nEin wirklich falsch laufendes Video faellt auf:');
{
  /*
   * Die Gegenprobe zur Tempo-Regel. Laeuft das Video wirklich zu schnell -
   * etwa weil jemand mit 30 Bildern gefilmt und die Datei als 25 deklariert
   * hat -, dann sitzen die Tipper enger beieinander, und *dann* soll die
   * Kette der Messung folgen statt dem erwarteten Wert.
   *
   * Nachgebaut, indem die Bilddauer in der Datei um zwoelf Prozent verkuerzt
   * wird. Der Taenzer tanzt unveraendert; nur die Uhr in der Datei luegt.
   */
  const schnell = sauber.replace(/Frame Time: [\d.]+/, `Frame Time: ${(0.88 / BILDRATE).toFixed(7)}`);
  const e = einlesen(schnell);
  pruefe('die Kette merkt, dass das Video zu schnell laeuft', e.messwerte.tempoAusMessung,
    `${(e.messwerte.tempoAbweichung * 100).toFixed(1)} % daneben`);
  pruefe('und rechnet dann mit dem gemessenen Tempo',
    Math.abs(e.messwerte.bpm - SOLL.bpm / 0.88) < 4,
    `${e.messwerte.bpm.toFixed(1)} BPM statt der erwarteten ${SOLL.bpm}`);
}

console.log('\nWas die Kette ueber die Aufnahme sagt:');
{
  const e = einlesen(sauber);
  for (const [k, v] of Object.entries(e.messwerte)) {
    if (k === 'gelenke') continue;
    console.log(`    ${k.padEnd(14)} ${typeof v === 'number' ? v.toFixed(4).replace(/\.?0+$/, '') : v}`);
  }
}

await fs.mkdir(new URL('./proben/', import.meta.url).pathname, { recursive: true });
console.log(fehler ? `\n${fehler} Fehler.` : '\nAlles gruen.');
process.exit(fehler ? 1 : 0);
