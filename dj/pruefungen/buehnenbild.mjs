// Abnahme fuer die Verbindung von Kalibrierung und Buehne.
//
//   node dj/pruefungen/buehnenbild.mjs
//
// Was hier geprueft wird, laesst sich ohne Beamer und ohne Wand pruefen -
// und muss es auch, denn vor Ort ist keine Zeit dafuer. Gemessen wird gegen
// eine erfundene Kalibrierung, deren Antworten sich von Hand nachrechnen
// lassen.
//
//   1. Ohne Messung verhaelt sich alles wie bisher. Das ist die wichtigste
//      Eigenschaft: Die neue Funktion darf nichts kaputtmachen, solange sie
//      niemand eingemessen hat.
//   2. Eine Messung ergibt eine Verzerrung, und die bildet die Marken genau
//      auf ihre Plaetze im Beamerbild ab.
//   3. Bereiche kommen in Anteilen an und wissen, wo ihre Mitte ist, wo ihr
//      Rand laeuft und was in ihnen liegt.
//   4. Der Weg um einen Rahmen ist gleichmaessig - eine Lichtlinie darf an
//      den Ecken nicht stolpern.
//   5. Was ausserhalb des Beamerbildes liegt, wird als solches erkannt.

import { buehnenbildBauen } from '../public/gemeinsam/buehnenbild.js';
import { homographie, anwenden } from '../public/gemeinsam/homographie.js';

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};

const ANZEIGE = { breite: 1920, hoehe: 1080 };

/*
 * Eine erfundene Messung: Der Beamer steht schraeg links, sein Bild kommt als
 * Trapez an. Die Marken liegen im Foto entsprechend schief.
 */
const MESSUNG = {
  fassung: 1,
  beamer: { breite: 1920, hoehe: 1080 },
  fotoSeitenverhaeltnis: 4 / 3,
  marken: [[0.18, 0.22], [0.86, 0.16], [0.83, 0.79], [0.21, 0.74]],
  markenImBeamer: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]],
  bereiche: [
    { art: 'fenster', name: 'Fenster 1', punkte: [[0.30, 0.35], [0.44, 0.34], [0.45, 0.52], [0.31, 0.53]] },
    { art: 'tuer', name: 'Tür 1', punkte: [[0.52, 0.55], [0.62, 0.55], [0.62, 0.78], [0.52, 0.78]] },
    { art: 'tot', name: 'Totzone 1', punkte: [[0.70, 0.30], [0.80, 0.30], [0.80, 0.45], [0.70, 0.45]] },
  ],
};

console.log('\nOhne Messung bleibt alles wie es war:');
{
  for (const [wie, roh] of [['null', null], ['leer', {}], ['falsche Fassung', { fassung: 99, marken: [] }],
    ['nur drei Marken', { fassung: 1, marken: [[0, 0], [1, 0], [1, 1]] }]]) {
    const b = buehnenbildBauen(roh, ANZEIGE.breite, ANZEIGE.hoehe);
    pruefe(`${wie}: abgeschaltet`, b.an === false && b.css === 'none');
  }
  const b = buehnenbildBauen(null, ANZEIGE.breite, ANZEIGE.hoehe);
  pruefe('und alles gilt als im Bild', b.imBild([0.5, 0.5]) && b.imBild([0, 0]));
}

console.log('\nMit Messung entsteht eine Verzerrung:');
const bild = buehnenbildBauen(MESSUNG, ANZEIGE.breite, ANZEIGE.hoehe);
{
  pruefe('sie ist an', bild.an === true);
  pruefe('das Seitenverhaeltnis kommt vom Foto',
    Math.abs(bild.seitenverhaeltnis - 4 / 3) < 1e-9);
  pruefe('die Entwurfsleinwand hat das auch',
    Math.abs(bild.breite / bild.hoehe - 4 / 3) < 0.01,
    `${bild.breite} × ${bild.hoehe}`);
  /*
   * Sie soll ungefaehr so viele Bildpunkte haben wie die Anzeige - deutlich
   * mehr waere Rechenzeit fuer Punkte, die niemand sieht, deutlich weniger
   * waere unscharf.
   */
  const verhaeltnis = (bild.breite * bild.hoehe) / (ANZEIGE.breite * ANZEIGE.hoehe);
  pruefe('und ungefaehr so viele Punkte wie die Anzeige',
    verhaeltnis > 0.9 && verhaeltnis < 1.1, `${(verhaeltnis * 100).toFixed(0)} %`);
  pruefe('es kommt eine CSS-Matrix heraus', bild.css.startsWith('matrix3d('), bild.css.slice(0, 40) + '…');
}

console.log('\nDie Verzerrung trifft genau:');
{
  /*
   * Der Kern: Eine Marke, die im Foto bei 18/22 Prozent liegt, muss nach der
   * Verzerrung genau dort landen, wo der Beamer sie hingeworfen hat - bei 10
   * Prozent seiner Breite und Hoehe. Nachgerechnet wird das mit derselben
   * Abbildung, die auch an die Leinwand geht.
   */
  const von = MESSUNG.marken.map(([x, y]) => [x * bild.breite, y * bild.hoehe]);
  const nach = MESSUNG.markenImBeamer.map(([x, y]) => [x * ANZEIGE.breite, y * ANZEIGE.hoehe]);
  const H = homographie(von, nach);
  let schlimmster = 0;
  for (let i = 0; i < 4; i++) {
    const [x, y] = anwenden(H, von[i]);
    schlimmster = Math.max(schlimmster, Math.hypot(x - nach[i][0], y - nach[i][1]));
  }
  pruefe('jede Marke landet auf ihrem Platz im Beamerbild',
    schlimmster < 1e-6, `groesster Fehler ${schlimmster.toExponential(1)} Bildpunkte`);

  // Und die Matrix in der Buehne ist dieselbe.
  const m = bild.css.slice('matrix3d('.length, -1).split(',').map(Number);
  const durchCss = ([x, y]) => {
    const W = m[3] * x + m[7] * y + m[15];
    return [(m[0] * x + m[4] * y + m[12]) / W, (m[1] * x + m[5] * y + m[13]) / W];
  };
  let unterschied = 0;
  for (const p of von) {
    const a = anwenden(H, p);
    const b = durchCss(p);
    unterschied = Math.max(unterschied, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  pruefe('und die Matrix an der Leinwand rechnet dasselbe',
    unterschied < 1e-4, `groesster Unterschied ${unterschied.toExponential(1)} Bildpunkte`);
}

console.log('\nDie Bereiche wissen ueber sich Bescheid:');
{
  pruefe('alle drei sind da', bild.bereiche.length === 3);
  pruefe('nach Art abfragbar', bild.art('fenster').length === 1 && bild.art('tot').length === 1);

  const f = bild.art('fenster')[0];
  // Von Hand: die vier Ecken gemittelt.
  const sollX = (0.30 + 0.44 + 0.45 + 0.31) / 4;
  const sollY = (0.35 + 0.34 + 0.52 + 0.53) / 4;
  pruefe('die Mitte stimmt',
    Math.abs(f.mitte[0] - sollX) < 1e-9 && Math.abs(f.mitte[1] - sollY) < 1e-9,
    `${f.mitte[0].toFixed(4)} / ${f.mitte[1].toFixed(4)}`);
  pruefe('der Kasten stimmt',
    Math.abs(f.kasten.links - 0.30) < 1e-9 && Math.abs(f.kasten.rechts - 0.45) < 1e-9
    && Math.abs(f.kasten.breite - 0.15) < 1e-9);
  pruefe('die Mitte liegt im Bereich', f.drin(f.mitte));
  pruefe('ein Punkt daneben nicht', !f.drin([0.6, 0.4]));

  pruefe('bei() findet den richtigen Bereich',
    bild.bei([0.37, 0.44])?.name === 'Fenster 1', bild.bei([0.37, 0.44])?.name);
  pruefe('und gibt null zurueck, wo nichts ist', bild.bei([0.05, 0.05]) === null);
  pruefe('die Tuer liegt tiefer als das Fenster',
    bild.art('tuer')[0].mitte[1] > f.mitte[1]);
}

console.log('\nEine Lichtlinie laeuft gleichmaessig um den Rahmen:');
{
  const f = bild.art('fenster')[0];
  /*
   * Der Rand wird in 200 Schritten abgelaufen. Sind die Abstaende zwischen
   * aufeinanderfolgenden Punkten alle gleich, laeuft die Linie mit
   * gleichmaessiger Geschwindigkeit. Waere je Kante dieselbe Zahl von
   * Schritten vergeben worden, waere sie an der kurzen Kante schnell und an
   * der langen langsam - und genau das sieht man an einer Ecke sofort.
   */
  const seiten = bild.seitenverhaeltnis;
  const schritte = [];
  let vorher = f.aufDemRand(0);
  for (let k = 1; k <= 200; k++) {
    const p = f.aufDemRand(k / 200);
    schritte.push(Math.hypot((p[0] - vorher[0]) * seiten, p[1] - vorher[1]));
    vorher = p;
  }
  const mittel = schritte.reduce((a, b) => a + b, 0) / schritte.length;
  /*
   * An einer Ecke ist der Schritt zu Recht kuerzer.
   *
   * Der erste Anlauf verlangte, dass *alle* 200 Schritte gleich lang sind,
   * und meldete 11 Prozent Abweichung. Die Messung hatte recht und die
   * Erwartung war falsch: Ein Schritt, der ueber eine Ecke fuehrt, geht als
   * Sehne quer und ist damit kuerzer als der Weg am Rand entlang. Das ist
   * Geometrie und kein Fehler.
   *
   * Geprueft wird deshalb, dass *nur* die Eckschritte abweichen - vier
   * Ecken, also hoechstens vier von zweihundert.
   */
  const auffaellig = schritte.filter((s) => Math.abs(s - mittel) / mittel > 0.02).length;
  pruefe('nur die vier Eckschritte weichen ab', auffaellig <= 4,
    `${auffaellig} von 200 Schritten`);
  const ohneEcken = schritte.slice().sort((a, b) => a - b).slice(4);
  const glatt = Math.max(...ohneEcken.map((s) => Math.abs(s - mittel) / mittel));
  pruefe('dazwischen ist die Schrittweite gleich', glatt < 0.02,
    `groesste Abweichung ${(glatt * 100).toFixed(2)} %`);

  pruefe('ein voller Umlauf kommt wieder am Anfang an',
    Math.hypot(...f.aufDemRand(1).map((v, i) => v - f.aufDemRand(0)[i])) < 1e-9);
  pruefe('und der Weg laeuft ueber den Rand, nicht durch die Mitte',
    [0, 0.1, 0.25, 0.4, 0.6, 0.9].every((t) => {
      const p = f.aufDemRand(t);
      // Auf dem Rand heisst: auf einer der vier Kanten des Kastens.
      const e = 1e-9;
      return Math.abs(p[0] - f.kasten.links) < 0.02 || Math.abs(p[0] - f.kasten.rechts) < 0.02
        || Math.abs(p[1] - f.kasten.oben) < 0.02 || Math.abs(p[1] - f.kasten.unten) < 0.02 || e < 0;
    }));
}

console.log('\nWas der Beamer nicht erreicht, faellt auf:');
{
  /*
   * Die Marken liegen im Foto zwischen 16 und 86 Prozent. Das Beamerbild
   * deckt also nur einen Teil des Fotos ab - und was ausserhalb liegt,
   * bleibt an der Wand dunkel, egal wie schoen der Entwurf ist.
   */
  pruefe('die Mitte wird erreicht', bild.imBild([0.5, 0.5]));
  pruefe('die aeussere Ecke nicht', !bild.imBild([0.02, 0.02]));
  pruefe('der rechte Rand auch nicht', !bild.imBild([0.98, 0.5]));

  let drin = 0;
  let gesamt = 0;
  for (let x = 0.005; x < 1; x += 0.01) {
    for (let y = 0.005; y < 1; y += 0.01) {
      gesamt++;
      if (bild.imBild([x, y])) drin++;
    }
  }
  const anteil = (drin / gesamt) * 100;
  /*
   * Nachgerechnet: Die Marken sitzen bei 10 und 90 Prozent des Beamerbildes,
   * das Beamerbild ist also 1/0,8 = 1,25-mal so gross wie ihr Viereck. Im
   * Foto spannen sie rund 66 mal 57 Prozent auf; mal 1,25 in beiden
   * Richtungen sind das gut 59 Prozent der Bildflaeche.
   */
  pruefe('und ungefaehr so viel Bildflaeche wird abgedeckt, wie zu erwarten',
    anteil > 50 && anteil < 70, `${anteil.toFixed(0)} % – erwartet rund 59 %`);

  pruefe('alle drei Bereiche liegen im Beamerbild',
    bild.bereiche.every((b) => b.punkte.every((p) => bild.imBild(p))),
    bild.bereiche.filter((b) => !b.punkte.every((p) => bild.imBild(p))).map((b) => b.name).join(', ') || '—');
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlles gruen.');
process.exit(fehler ? 1 : 0);
