// Abnahme fuer das BVH-Lesen.
//
//   node dj/pruefungen/bvh.mjs
//
// Diese Abnahme gibt es, weil hier ein Fehler *unsichtbar* waere. Ein
// Skelett, dessen Drehreihenfolge falsch multipliziert wird, sieht in Ruhe
// vollkommen richtig aus und verdreht sich erst, wenn zwei Achsen zugleich
// im Spiel sind - also genau bei den Bewegungen, um die es geht. Es waere
// derselbe Fehler wie bisher, nur mit besseren Daten.
//
// Geprueft wird deshalb gegen von Hand ausgerechnete Stellungen, nicht gegen
// "sieht plausibel aus":
//
//   1. Ein Knochen ohne Drehung steht an seinem Offset.
//   2. Eine 90-Grad-Drehung schwenkt das Kind auf die bekannte Achse.
//   3. Zwei Drehungen hintereinander in der Reihenfolge, die in der Datei
//      steht - und *nicht* in der umgekehrten. Das ist der Kern.
//   4. Ein Knochen behaelt seine Laenge, egal wie gedreht wird.
//   5. Die Namenszuordnung findet Unterarme vor Oberarmen.

import { bvhLesen, vorwaerts, gelenkeZuordnen } from '../werkzeuge/bvh.mjs';

let fehler = 0;
const pruefe = (name, ok, hinweis = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FEHL'} ${name}${hinweis ? ` – ${hinweis}` : ''}`);
  if (!ok) fehler++;
};
const nah = (a, b, wie = 1e-6) => Math.abs(a - b) < wie;
const punktNah = (p, q, wie = 1e-6) => p.every((v, i) => nah(v, q[i], wie));

/*
 * Ein Skelett von Hand: Wurzel, ein Arm nach rechts (10 lang), daran ein
 * Unterarm nach rechts (8 lang). Damit lassen sich alle Stellungen im Kopf
 * ausrechnen, und genau das ist der Sinn.
 */
const bauen = (kanaele, zeilen) => `HIERARCHY
ROOT Huefte
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition ${kanaele}
  JOINT Oberarm
  {
    OFFSET 10 0 0
    CHANNELS 3 ${kanaele}
    JOINT Unterarm
    {
      OFFSET 8 0 0
      CHANNELS 3 ${kanaele}
      End Site
      {
        OFFSET 4 0 0
      }
    }
  }
}
MOTION
Frames: ${zeilen.length}
Frame Time: 0.0166667
${zeilen.map((z) => z.join(' ')).join('\n')}
`;

console.log('\nDer Baum wird richtig gelesen:');
{
  const s = bvhLesen(bauen('Zrotation Xrotation Yrotation', [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]));
  pruefe('vier Knoten, davon einer eine Spitze',
    s.gelenke.length === 4 && s.gelenke[3].spitze,
    s.gelenke.map((g) => g.name).join(', '));
  pruefe('die Kanalreihenfolge steht so da, wie sie in der Datei steht',
    s.gelenke[1].kanaele.join(',') === 'Zrotation,Xrotation,Yrotation');
  pruefe('die Spalten liegen hintereinander',
    s.gelenke[0].ersterKanal === 0 && s.gelenke[1].ersterKanal === 6 && s.gelenke[2].ersterKanal === 9);
  pruefe('Bilddauer gelesen', nah(s.bildDauer, 0.0166667));
}

console.log('\nOhne Drehung steht alles an seinem Offset:');
{
  const s = bvhLesen(bauen('Zrotation Xrotation Yrotation', [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]));
  const w = vorwaerts(s, s.bilder[0]);
  pruefe('Huefte im Ursprung', punktNah(w[0].p, [0, 0, 0]));
  pruefe('Oberarm bei x=10', punktNah(w[1].p, [10, 0, 0]));
  pruefe('Unterarm bei x=18', punktNah(w[2].p, [18, 0, 0]));
  pruefe('Spitze bei x=22', punktNah(w[3].p, [22, 0, 0]));
}

console.log('\nEine Drehung um 90 Grad schwenkt aufs Erwartete:');
{
  // Zrotation +90 an der Huefte: die x-Achse zeigt danach nach +y.
  const s = bvhLesen(bauen('Zrotation Xrotation Yrotation', [[0, 0, 0, 90, 0, 0, 0, 0, 0, 0, 0, 0]]));
  const w = vorwaerts(s, s.bilder[0]);
  pruefe('Oberarm steht bei (0,10,0)', punktNah(w[1].p, [0, 10, 0], 1e-9), w[1].p.map((v) => v.toFixed(3)).join(', '));
  pruefe('Unterarm steht bei (0,18,0)', punktNah(w[2].p, [0, 18, 0], 1e-9), w[2].p.map((v) => v.toFixed(3)).join(', '));
}
{
  // Yrotation +90 an der Huefte: die x-Achse zeigt danach nach -z.
  const s = bvhLesen(bauen('Zrotation Xrotation Yrotation', [[0, 0, 0, 0, 0, 90, 0, 0, 0, 0, 0, 0]]));
  const w = vorwaerts(s, s.bilder[0]);
  pruefe('bei Yrotation zeigt der Arm nach -z', punktNah(w[1].p, [0, 0, -10], 1e-9),
    w[1].p.map((v) => v.toFixed(3)).join(', '));
}

console.log('\nDie Reihenfolge der Achsen wird eingehalten - der eigentliche Punkt:');
{
  /*
   * Zwei Drehungen um verschiedene Achsen sind nicht vertauschbar. Genau hier
   * scheitert eine Umsetzung, die einfach "irgendwie XYZ" multipliziert - und
   * zwar unsichtbar, solange nur eine Achse im Spiel ist.
   *
   * Von Hand: Kanaele Zrotation Xrotation Yrotation, Werte Z=90, X=90.
   * Erst Z: x-Achse -> +y. Dann X um die *neue* x-Achse... nein: BVH dreht
   * um die koerpereigenen Achsen in Kanalreihenfolge, also R = Rz * Rx.
   * Der Kindpunkt (10,0,0) wird zu Rz*(Rx*(10,0,0)) = Rz*(10,0,0) = (0,10,0),
   * weil Rx die x-Achse nicht bewegt.
   *
   * Damit der Unterschied sichtbar wird, braucht es einen Punkt abseits der
   * x-Achse - also den Oberarm drehen und das Kind ansehen.
   */
  const zxy = bvhLesen(bauen('Zrotation Xrotation Yrotation', [[0, 0, 0, 0, 0, 0, 90, 90, 0, 0, 0, 0]]));
  const wz = vorwaerts(zxy, zxy.bilder[0]);
  // Oberarm bei (10,0,0). Sein Kind sitzt bei lokal (8,0,0).
  // R = Rz(90)*Rx(90). Rx(90)*(8,0,0) = (8,0,0). Rz(90)*(8,0,0) = (0,8,0).
  pruefe('ZXY: Unterarm bei (10,8,0)', punktNah(wz[2].p, [10, 8, 0], 1e-9),
    wz[2].p.map((v) => v.toFixed(3)).join(', '));
  // Und die Spitze zeigt die Reihenfolge: lokal (4,0,0) am Unterarm, der
  // selbst nicht dreht -> dieselbe Drehung -> (10,8,0)+(0,4,0) = (10,12,0).
  pruefe('ZXY: Spitze bei (10,12,0)', punktNah(wz[3].p, [10, 12, 0], 1e-9),
    wz[3].p.map((v) => v.toFixed(3)).join(', '));

  /*
   * Dieselben Zahlen, andere Kanalreihenfolge. Wuerde die Umsetzung die
   * Reihenfolge ignorieren, kaeme hier dasselbe heraus - und genau das darf
   * nicht sein.
   */
  const xzy = bvhLesen(bauen('Xrotation Zrotation Yrotation', [[0, 0, 0, 0, 0, 0, 90, 90, 0, 0, 0, 0]]));
  const wx = vorwaerts(xzy, xzy.bilder[0]);
  // Jetzt ist der erste Kanal Xrotation=90, der zweite Zrotation=90.
  // R = Rx(90)*Rz(90). Rz(90)*(8,0,0) = (0,8,0). Rx(90)*(0,8,0) = (0,0,8).
  pruefe('XZY mit denselben Zahlen: Unterarm bei (10,0,8)', punktNah(wx[2].p, [10, 0, 8], 1e-9),
    wx[2].p.map((v) => v.toFixed(3)).join(', '));
  pruefe('die beiden Reihenfolgen liefern also *nicht* dasselbe',
    !punktNah(wz[2].p, wx[2].p, 1e-3));
}

console.log('\nKnochen behalten ihre Laenge:');
{
  const zeilen = [];
  for (let b = 0; b < 60; b++) {
    zeilen.push([0, 0, 0, b * 7, b * 11, b * 13, b * 5, b * 3, b * 17, b * 23, b * 29, b * 2]);
  }
  const s = bvhLesen(bauen('Zrotation Xrotation Yrotation', zeilen));
  let schlimmster = 0;
  for (const bild of s.bilder) {
    const w = vorwaerts(s, bild);
    const l1 = Math.hypot(...w[1].p.map((v, i) => v - w[0].p[i]));
    const l2 = Math.hypot(...w[2].p.map((v, i) => v - w[1].p[i]));
    const l3 = Math.hypot(...w[3].p.map((v, i) => v - w[2].p[i]));
    schlimmster = Math.max(schlimmster, Math.abs(l1 - 10), Math.abs(l2 - 8), Math.abs(l3 - 4));
  }
  pruefe('ueber 60 Bilder mit wilden Winkeln bleibt jede Laenge stehen',
    schlimmster < 1e-9, `groesste Abweichung ${schlimmster.toExponential(1)}`);
}

console.log('\nDie Wurzel wandert mit ihren Positionskanaelen:');
{
  const s = bvhLesen(bauen('Zrotation Xrotation Yrotation', [[3, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0]]));
  const w = vorwaerts(s, s.bilder[0]);
  pruefe('Huefte bei (3,4,5)', punktNah(w[0].p, [3, 4, 5]));
  pruefe('und der Arm wandert mit', punktNah(w[1].p, [13, 4, 5]));
}

console.log('\nDie Namenszuordnung trifft das Richtige:');
{
  const namen = (liste) => ({
    gelenke: liste.map((n, i) => ({ name: n, eltern: i - 1, spitze: false })),
  });
  const mixamo = namen(['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2',
    'mixamorig:Neck', 'mixamorig:Head', 'mixamorig:LeftShoulder', 'mixamorig:LeftArm',
    'mixamorig:LeftForeArm', 'mixamorig:LeftHand', 'mixamorig:RightShoulder',
    'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand']);
  const z = gelenkeZuordnen(mixamo);
  pruefe('Huefte gefunden', mixamo.gelenke[z.huefte]?.name === 'mixamorig:Hips');
  pruefe('Kopf gefunden', mixamo.gelenke[z.kopf]?.name === 'mixamorig:Head');
  /*
   * Der Kern dieser Pruefung: "LeftArm" ist bei Mixamo der *Oberarm* und
   * steckt als Teilzeichenkette auch in "LeftForeArm". Wer nur nach Enthalten
   * sucht und die Reihenfolge nicht beachtet, haengt den Ellenbogen an den
   * Oberarm - und die Figur bekaeme einen Arm, der aus der Schulter waechst
   * und im Ellenbogen endet.
   */
  pruefe('Oberarm links ist LeftArm, nicht LeftForeArm',
    mixamo.gelenke[z.schulterL]?.name === 'mixamorig:LeftArm',
    mixamo.gelenke[z.schulterL]?.name);
  pruefe('Ellenbogen links ist LeftForeArm',
    mixamo.gelenke[z.ellbogenL]?.name === 'mixamorig:LeftForeArm',
    mixamo.gelenke[z.ellbogenL]?.name);
  pruefe('Hand rechts ist RightHand',
    mixamo.gelenke[z.handR]?.name === 'mixamorig:RightHand');
  pruefe('die Brust nimmt das oberste Spine-Glied',
    mixamo.gelenke[z.brust]?.name === 'mixamorig:Spine2',
    mixamo.gelenke[z.brust]?.name);

  // Und eine andere Namensschule, ohne Praefix und mit Unterstrichen.
  const andere = namen(['Pelvis', 'Chest', 'Neck', 'Head',
    'L_UpperArm', 'L_LowerArm', 'L_Hand', 'R_UpperArm', 'R_LowerArm', 'R_Hand']);
  const z2 = gelenkeZuordnen(andere);
  pruefe('auch Pelvis/L_UpperArm/L_LowerArm werden erkannt',
    andere.gelenke[z2.huefte]?.name === 'Pelvis'
    && andere.gelenke[z2.schulterL]?.name === 'L_UpperArm'
    && andere.gelenke[z2.ellbogenL]?.name === 'L_LowerArm',
    `${andere.gelenke[z2.huefte]?.name}, ${andere.gelenke[z2.schulterL]?.name}, ${andere.gelenke[z2.ellbogenL]?.name}`);
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlles gruen.');
process.exit(fehler ? 1 : 0);
