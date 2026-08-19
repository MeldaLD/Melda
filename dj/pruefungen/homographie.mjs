// Abnahme fuer die projektive Abbildung.
//
//   node dj/pruefungen/homographie.mjs
//
// Diese Rechnung ist das Fundament der ganzen Projektionsanpassung, und ein
// Fehler darin waere besonders unangenehm: Er faellt erst an der Wand auf,
// abends, mit einem Beamer auf der Leiter. Geprueft wird deshalb gegen von
// Hand nachvollziehbare Faelle und nicht gegen "sieht richtig aus".
//
//   1. Die Einheitsabbildung laesst alles, wo es ist.
//   2. Verschieben, Skalieren, Drehen - Faelle mit bekannter Antwort.
//   3. Ein echtes Trapez: Geraden bleiben Geraden, die Mitte wandert.
//   4. Die Umkehrung ist wirklich die Umkehrung - auf zwei Rechenwegen.
//   5. Die CSS-Matrix bildet genauso ab wie die Rechnung.
//   6. Entartete Lagen liefern null statt Unsinn.
//   7. Ueberschlagene Vierecke werden erkannt, bevor sie Schaden anrichten.
//   8. Ein Rundgang durch den ganzen Ablauf, samt Frage nach der Klickgenauigkeit.

import { homographie, anwenden, umkehren, alsCss, imVieleck, passfehler, viereckPruefen }
  from '../public/gemeinsam/homographie.js';

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};
const nah = (a, b, wie = 1e-9) => Math.abs(a - b) < wie;
const punktNah = (p, q, wie = 1e-9) => nah(p[0], q[0], wie) && nah(p[1], q[1], wie);

const EINHEIT = [[0, 0], [1, 0], [1, 1], [0, 1]];

console.log('\nBekannte Faelle:');
{
  const H = homographie(EINHEIT, EINHEIT);
  pruefe('gleiche Punkte ergeben die Einheitsabbildung',
    punktNah(anwenden(H, [0.3, 0.7]), [0.3, 0.7]));
}
{
  const verschoben = EINHEIT.map(([x, y]) => [x + 5, y - 2]);
  const H = homographie(EINHEIT, verschoben);
  pruefe('Verschieben', punktNah(anwenden(H, [0.25, 0.5]), [5.25, -1.5]));
}
{
  const skaliert = EINHEIT.map(([x, y]) => [x * 1920, y * 1080]);
  const H = homographie(EINHEIT, skaliert);
  pruefe('Skalieren auf Bildschirmgroesse',
    punktNah(anwenden(H, [0.5, 0.5]), [960, 540], 1e-6));
}
{
  // 90 Grad gegen den Uhrzeigersinn: (x,y) -> (-y,x)
  const gedreht = EINHEIT.map(([x, y]) => [-y, x]);
  const H = homographie(EINHEIT, gedreht);
  pruefe('Drehen um 90 Grad', punktNah(anwenden(H, [0.8, 0.2]), [-0.2, 0.8]));
}

console.log('\nEin echtes Trapez - der Fall, um den es geht:');
{
  /*
   * So sieht ein Beamerbild aus, das schraeg von links unten auf eine Wand
   * faellt: Die rechte Kante ist laenger als die linke, und die Oberkante
   * kippt. Die Zahlen sind frei gewaehlt, aber die Form ist die richtige.
   */
  const wand = [[120, 80], [1850, 160], [1790, 990], [200, 900]];
  const H = homographie(EINHEIT, wand);
  pruefe('die vier Ecken landen genau auf ihren Zielen',
    passfehler(H, EINHEIT, wand) < 1e-9,
    `groesster Fehler ${passfehler(H, EINHEIT, wand).toExponential(1)}`);

  /*
   * Der Kern einer projektiven Abbildung: Die *Mitte* des Rechtecks landet
   * nicht im Schwerpunkt des Trapezes. Waere es so, waere die Abbildung nur
   * affin - und dann koennte sie eine schraege Projektion gar nicht
   * beschreiben.
   */
  const mitte = anwenden(H, [0.5, 0.5]);
  const schwerpunkt = [
    wand.reduce((a, p) => a + p[0], 0) / 4,
    wand.reduce((a, p) => a + p[1], 0) / 4,
  ];
  const abstand = Math.hypot(mitte[0] - schwerpunkt[0], mitte[1] - schwerpunkt[1]);
  pruefe('die Mitte wandert - es ist wirklich projektiv und nicht nur schief',
    abstand > 1, `${abstand.toFixed(1)} Bildpunkte neben dem Schwerpunkt`);

  /*
   * Und die Eigenschaft, auf der alles beruht: Geraden bleiben Geraden. Eine
   * projektive Abbildung darf alles verzerren, aber das nicht - sonst waere
   * eine Fensterkante hinterher krumm.
   */
  let groessteAbweichung = 0;
  const a = anwenden(H, [0, 0.35]);
  const b = anwenden(H, [1, 0.35]);
  const laenge = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let k = 1; k < 10; k++) {
    const p = anwenden(H, [k / 10, 0.35]);
    const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / laenge;
    groessteAbweichung = Math.max(groessteAbweichung, d);
  }
  pruefe('Geraden bleiben Geraden', groessteAbweichung < 1e-9,
    `groesste Abweichung ${groessteAbweichung.toExponential(1)} Bildpunkte`);
}

console.log('\nHin und zurueck:');
{
  const wand = [[120, 80], [1850, 160], [1790, 990], [200, 900]];
  const H = homographie(EINHEIT, wand);
  const R = umkehren(H);
  let schlimmster = 0;
  for (let x = 0; x <= 1.0001; x += 0.1) {
    for (let y = 0; y <= 1.0001; y += 0.1) {
      const zurueck = anwenden(R, anwenden(H, [x, y]));
      schlimmster = Math.max(schlimmster, Math.hypot(zurueck[0] - x, zurueck[1] - y));
    }
  }
  pruefe('ueber 121 Punkte kommt jeder wieder an seinem Platz an',
    schlimmster < 1e-9, `groesster Fehler ${schlimmster.toExponential(1)}`);

  /*
   * Und die Umkehrung auf einem zweiten Weg: Wer die Punktpaare vertauscht
   * und neu loest, muss dieselbe Abbildung bekommen wie wer die Matrix
   * umkehrt. Zwei verschiedene Rechenwege zum selben Ergebnis - stimmen sie
   * ueberein, ist die Wahrscheinlichkeit klein, dass beide denselben Fehler
   * haben.
   */
  const R2 = homographie(wand, EINHEIT);
  let unterschied = 0;
  for (let i = 0; i < 9; i++) unterschied = Math.max(unterschied, Math.abs(R[i] - R2[i]));
  pruefe('umgekehrte Matrix und umgekehrt geloest ergeben dasselbe',
    unterschied < 1e-9, `groesster Unterschied ${unterschied.toExponential(1)}`);
}

console.log('\nDie CSS-Matrix rechnet dasselbe:');
{
  /*
   * `matrix3d` nimmt die 4x4-Matrix *spaltenweise*. Eine Verwechslung mit
   * zeilenweise ergibt die transponierte Abbildung - und die sieht bei
   * symmetrischen Testfaellen zufaellig richtig aus. Deshalb wird hier
   * bewusst mit einem unsymmetrischen Trapez geprueft, und die ausgegebene
   * Matrix wird so angewandt, wie der Browser es tut.
   */
  const wand = [[120, 80], [1850, 160], [1790, 990], [200, 900]];
  const H = homographie(EINHEIT, wand);
  const text = alsCss(H);
  const m = text.slice('matrix3d('.length, -1).split(',').map(Number);
  pruefe('sechzehn Zahlen', m.length === 16, `${m.length}`);

  // CSS rechnet Zeilenvektor mal Matrix, die Spalten stehen wie oben.
  const durchCss = ([x, y]) => {
    const X = m[0] * x + m[4] * y + m[12];
    const Y = m[1] * x + m[5] * y + m[13];
    const W = m[3] * x + m[7] * y + m[15];
    return [X / W, Y / W];
  };
  let schlimmster = 0;
  for (const p of [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5], [0.3, 0.8]]) {
    const a = anwenden(H, p);
    const b = durchCss(p);
    schlimmster = Math.max(schlimmster, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  pruefe('die CSS-Matrix bildet genauso ab wie die Rechnung',
    schlimmster < 1e-5, `groesster Unterschied ${schlimmster.toExponential(1)} Bildpunkte`);
}

console.log('\nEntartete Lagen werden erkannt statt gerechnet:');
{
  pruefe('vier Punkte auf einer Geraden ergeben keine Abbildung',
    homographie([[0, 0], [1, 0], [2, 0], [3, 0]], EINHEIT) === null);
  pruefe('zwei gleiche Punkte ebenfalls nicht',
    homographie([[0, 0], [0, 0], [1, 1], [0, 1]], EINHEIT) === null);
  pruefe('und die Umkehrung einer entarteten Matrix ist null',
    umkehren([1, 0, 0, 2, 0, 0, 3, 0, 0]) === null);
}

console.log('\nFalsch angeklickte Ecken fallen auf:');
{
  pruefe('ein sauberes Viereck geht durch',
    viereckPruefen([[0, 0], [10, 0], [10, 10], [0, 10]]) === null);
  /*
   * Der haeufigste Bedienfehler: die Marken ueber Kreuz angeklickt. Die
   * Rechnung liefert dann brav eine Abbildung, und die klappt das Bild um.
   * An der Wand sieht das aus wie ein Fehler im Zeichner - deshalb wird es
   * hier gefangen und nicht dort gesucht.
   */
  const ueberkreuz = [[0, 0], [10, 0], [0, 10], [10, 10]];
  pruefe('ueberschlagene Ecken werden gemeldet',
    (viereckPruefen(ueberkreuz) ?? '').includes('ueberschlagen'), viereckPruefen(ueberkreuz));
  pruefe('und fast auf einer Linie auch',
    (viereckPruefen([[0, 0], [10, 0], [20, 0], [30, 0]]) ?? '').length > 0,
    viereckPruefen([[0, 0], [10, 0], [20, 0], [30, 0]]));
  pruefe('drei Ecken sind zu wenig',
    (viereckPruefen([[0, 0], [1, 0], [1, 1]]) ?? '').length > 0);
}

console.log('\nDas Vieleck weiss, was drin ist:');
{
  const fenster = [[10, 10], [30, 12], [29, 25], [11, 24]];
  pruefe('ein Punkt in der Mitte ist drin', imVieleck([20, 18], fenster));
  pruefe('einer daneben ist draussen', !imVieleck([40, 18], fenster));
  pruefe('einer darueber auch', !imVieleck([20, 5], fenster));
  // Ein L-foermiger Umriss: der Punkt in der Kerbe darf nicht als drin gelten.
  const ecke = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
  pruefe('auch bei einem L stimmt es', imVieleck([2, 8], ecke) && !imVieleck([8, 8], ecke));
}

console.log('\nEin Rundgang durch den ganzen Ablauf:');
{
  /*
   * Der Fall, wie er abends wirklich vorkommt - einmal komplett durchgerechnet.
   *
   *   Der Beamer wirft ein Testbild mit vier Marken bei 10 und 90 Prozent.
   *   Auf dem Foto landen sie irgendwo als Trapez.
   *   Auf demselben Foto sieht man ein Fenster.
   *   Frage: Wohin muss das Bild im Beamer, damit es genau im Fenster sitzt?
   */
  const BEAMER = { breite: 1920, hoehe: 1080 };
  const marken = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]
    .map(([x, y]) => [x * BEAMER.breite, y * BEAMER.hoehe]);
  const imFoto = [[430, 520], [2380, 610], [2300, 1780], [510, 1690]];
  const beamerZuFoto = homographie(marken, imFoto);
  const fotoZuBeamer = umkehren(beamerZuFoto);

  const fenster = [[900, 800], [1300, 820], [1295, 1150], [895, 1130]];
  const imBeamer = fenster.map((p) => anwenden(fotoZuBeamer, p));

  pruefe('das Fenster liegt im Beamerbild',
    imBeamer.every(([x, y]) => x > 0 && x < BEAMER.breite && y > 0 && y < BEAMER.hoehe),
    imBeamer.map(([x, y]) => `${Math.round(x)}/${Math.round(y)}`).join('  '));

  let schlimmster = 0;
  for (let i = 0; i < 4; i++) {
    const zurueck = anwenden(beamerZuFoto, imBeamer[i]);
    schlimmster = Math.max(schlimmster, Math.hypot(zurueck[0] - fenster[i][0], zurueck[1] - fenster[i][1]));
  }
  pruefe('und trifft im Foto wieder genau das Fenster',
    schlimmster < 1e-6, `groesster Fehler ${schlimmster.toExponential(1)} Bildpunkte`);

  /*
   * Die praktische Frage dahinter, und sie ist wichtiger als alle sauberen
   * Zahlen darueber: Wie genau muss man klicken? Ein Fingertipp auf einem
   * Handyfoto sitzt vielleicht fuenf Bildpunkte daneben. Was macht das an
   * der Wand?
   */
  let groesster = 0;
  for (let versuch = 0; versuch < 300; versuch++) {
    const wackelig = imFoto.map(([x, y]) => [x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10]);
    const H2 = umkehren(homographie(marken, wackelig));
    for (const p of fenster) {
      const a = anwenden(fotoZuBeamer, p);
      const b = anwenden(H2, p);
      groesster = Math.max(groesster, Math.hypot(a[0] - b[0], a[1] - b[1]));
    }
  }
  console.log(`    Fuenf Bildpunkte Klickfehler im Foto ergeben bis zu ` +
    `${groesster.toFixed(1)} Bildpunkte Versatz im Beamerbild.`);
  pruefe('ein ungenauer Klick bleibt ein kleiner Fehler', groesster < 40,
    `${groesster.toFixed(1)} von 1920 Bildpunkten`);
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlles gruen.');
process.exit(fehler ? 1 : 0);
