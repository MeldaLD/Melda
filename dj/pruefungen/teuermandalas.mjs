/*
 * Darf man einzelne Mandalas als "zu teuer" aussortieren?
 *
 * Die Frage kam nach zwei Messstand-Laeufen auf derselben Radeon RX 9070 XT
 * auf, und diese Pruefung haelt die Antwort fest, damit sie nicht beim
 * naechsten Blick auf die Tabelle wieder neu geraten wird.
 *
 * Die Daten unten sind echt: dieselbe Maschine, derselbe Browser, zwei Minuten
 * auseinander (07:52 und 07:54 am 17.8.2026), einmal mit Bildziel 60, einmal
 * mit 30. Dass sich zwischen den Laeufen nur die Schwelle aendert und nicht
 * die gemessene Zeit, macht sie zur idealen Kontrolle: Was in beiden Laeufen
 * verschieden herauskommt, ist Rauschen.
 *
 * Geprueft wird zweierlei:
 *   1. Die Rangfolge der Mandalas ist zwischen zwei Laeufen nicht stabil.
 *   2. Die Regel im Messstand faellt darauf nicht herein.
 */

let fehler = 0;
const ok = (was, gut, dazu = '') => {
  console.log(`  ${gut ? 'ok  ' : 'FEHL'} ${was}${dazu ? ` – ${dazu}` : ''}`);
  if (!gut) fehler++;
};

// [Name, Faktor, Streuung in Prozent] - abgeschrieben aus den beiden Berichten.
const LAUF60 = [
  ['Rosette 16', 0.98, 16], ['Feinrosette 8', 0.98, 17], ['Rosette 12', 0.98, 11],
  ['Feinrosette 6', 0.98, 12], ['Gegenspirale 10', 0.99, 7], ['Feinringe 12', 0.99, 11],
  ['Zackenrad 12', 0.99, 14], ['Lupe 8', 1.0, 27], ['Linse 6', 1.0, 33],
  ['Rosette 6', 1.0, 14], ['Bluete 9', 1.0, 11], ['Linse 10', 1.0, 32],
  ['Scharfe Spirale 8', 1.0, 7], ['Rosette 8', 1.0, 6], ['Wabe', 1.01, 84],
  ['Windrad 3', 1.01, 52], ['Spirale 6', 1.01, 7], ['Spirale 8', 1.01, 11],
  ['Rosette 5', 1.01, 15], ['Stumpfer Stern 6', 1.01, 8], ['Zarte Spirale 6', 1.01, 11],
  ['Bluete 6', 1.01, 16], ['Wabenstern 6', 1.01, 12], ['Windrad 9', 1.01, 5],
  ['Droste 10', 1.01, 27], ['Stern 7', 1.01, 17], ['Schraube 9', 1.01, 9],
  ['Kelch 6', 1.01, 14], ['Stern 12', 1.01, 20], ['Bluetenlinse 6', 1.01, 45],
  ['Bluetenlinse 9', 1.01, 39], ['Fliese', 1.01, 13], ['Kelch 10', 1.01, 9],
  ['Feinringe 6', 1.01, 15], ['Feinrosette 4', 1.02, 6], ['Sternringe 12', 1.02, 27],
  ['Schraube 6', 1.02, 18], ['Volle Bluete 5', 1.02, 21], ['Fliesenstern 8', 1.02, 6],
  ['Gegenspirale 6', 1.02, 13], ['Zackenrad 7', 1.02, 21], ['Droste 6', 1.02, 20],
  ['Stern 5', 1.02, 15], ['Drallringe 10', 1.02, 23], ['Rosette 3', 1.03, 24],
  ['Windrad 5', 1.03, 23], ['Drallringe 6', 1.03, 19], ['Sternringe 6', 1.04, 31],
  ['Trichter 6', 1.04, 49], ['Weite Droste 8', 1.05, 49], ['Spitzer Stern 9', 1.05, 32],
];
const LAUF30 = [
  ['Linse 6', 0.98, 44], ['Linse 10', 0.98, 41], ['Rosette 16', 0.99, 20],
  ['Lupe 8', 0.99, 26], ['Feinrosette 8', 0.99, 25], ['Feinrosette 6', 1.0, 16],
  ['Rosette 12', 1.0, 19], ['Bluetenlinse 9', 1.0, 54], ['Bluete 9', 1.0, 31],
  ['Scharfe Spirale 8', 1.0, 25], ['Windrad 9', 1.01, 24], ['Spirale 6', 1.01, 26],
  ['Spirale 8', 1.01, 29], ['Feinringe 12', 1.01, 16], ['Wabenstern 6', 1.01, 35],
  ['Bluetenlinse 6', 1.01, 58], ['Rosette 5', 1.01, 34], ['Rosette 6', 1.01, 15],
  ['Gegenspirale 10', 1.01, 16], ['Zarte Spirale 6', 1.01, 31], ['Stern 5', 1.01, 22],
  ['Fliese', 1.01, 32], ['Feinrosette 4', 1.01, 23], ['Stern 7', 1.01, 24],
  ['Bluete 6', 1.02, 32], ['Kelch 10', 1.02, 23], ['Zackenrad 12', 1.02, 19],
  ['Stumpfer Stern 6', 1.02, 22], ['Fliesenstern 8', 1.02, 24], ['Schraube 6', 1.02, 49],
  ['Drallringe 10', 1.02, 25], ['Zackenrad 7', 1.02, 24], ['Windrad 3', 1.02, 63],
  ['Rosette 8', 1.02, 19], ['Volle Bluete 5', 1.02, 40], ['Rosette 3', 1.02, 44],
  ['Schraube 9', 1.02, 32], ['Gegenspirale 6', 1.02, 30], ['Sternringe 12', 1.02, 32],
  ['Windrad 5', 1.03, 44], ['Drallringe 6', 1.03, 26], ['Feinringe 6', 1.03, 24],
  ['Stern 12', 1.03, 23], ['Kelch 6', 1.03, 30], ['Droste 10', 1.03, 25],
  ['Droste 6', 1.04, 22], ['Wabe', 1.04, 84], ['Spitzer Stern 9', 1.04, 44],
  ['Trichter 6', 1.04, 51], ['Sternringe 6', 1.04, 36], ['Weite Droste 8', 1.06, 52],
];

console.log('\nDie Rohdaten:');
ok('beide Laeufe kennen dieselben 51 Mandalas', LAUF60.length === 51 && LAUF30.length === 51);
{
  const a = new Set(LAUF60.map((x) => x[0]));
  ok('und dieselben Namen', LAUF30.every((x) => a.has(x[0])));
}

console.log('\nDie Spanne ist kleiner als der Fehler eines einzelnen:');
for (const [wie, lauf] of [['60 Bilder/s', LAUF60], ['30 Bilder/s', LAUF30]]) {
  const f = lauf.map((x) => x[1]);
  const spanne = (Math.max(...f) - Math.min(...f)) * 100;
  const str = lauf.map((x) => x[2]).sort((p, q) => p - q);
  const mittlere = str[str.length >> 1];
  /*
   * Das ist der ganze Befund in einer Zeile: Der Unterschied zwischen dem
   * billigsten und dem teuersten Mandala ist kleiner als die Unsicherheit,
   * mit der ein einzelnes gemessen wurde. Alles Weitere waere Muenzwurf.
   */
  ok(
    `${wie}: die ganze Spanne (${spanne.toFixed(0)} %) liegt unter der mittleren Streuung (±${mittlere} %)`,
    spanne < mittlere,
  );
}

console.log('\nDie Rangfolge haelt zwischen zwei Laeufen nicht:');
{
  const p60 = new Map(LAUF60.map(([n], i) => [n, i]));
  const p30 = new Map(LAUF30.map(([n], i) => [n, i]));
  const n = LAUF60.length;
  let d2 = 0;
  for (const [name] of LAUF60) d2 += (p60.get(name) - p30.get(name)) ** 2;
  const rho = 1 - (6 * d2) / (n * (n * n - 1));
  // Etwas Signal ist da - aber weit weg von einer Rangfolge, auf die man eine
  // Auswahl gruenden koennte.
  ok('es gibt ein schwaches Signal (Rangkorrelation ueber 0,5)', rho > 0.5, `ρ = ${rho.toFixed(2)}`);
  ok('aber keine verlaessliche Ordnung (unter 0,9)', rho < 0.9, `ρ = ${rho.toFixed(2)}`);

  const sprung = Math.max(...LAUF60.map(([nm]) => Math.abs(p60.get(nm) - p30.get(nm))));
  // "Wabe" springt von Platz 47 auf Platz 15. Wer nach Rang aussortiert,
  // sortiert bei jedem Lauf etwas anderes aus.
  ok('einzelne springen um mehr als 20 Plaetze', sprung > 20, `groesster Sprung ${sprung} Plaetze`);
}

console.log('\nDie Regel des Messstands faellt nicht darauf herein:');
{
  /*
   * Dieselbe Regel wie in messstand.js: Ueberschuss groesser als die eigene
   * Streuung UND mindestens das 1,33-fache. Hier gegen die echten Zahlen
   * gehalten - beide Huerden muessen die ganze Tabelle abweisen.
   */
  const teuer = (lauf) =>
    lauf.filter(([, f, s]) => f - 1 > s / 100 && f >= 1.33).map(([n]) => n);
  ok('bei 60 Bildern/s wird keins aussortiert', teuer(LAUF60).length === 0, teuer(LAUF60).join(', '));
  ok('bei 30 Bildern/s wird keins aussortiert', teuer(LAUF30).length === 0, teuer(LAUF30).join(', '));

  // Und die Gegenprobe: Ein wirklicher Ausreisser wird erkannt. Ohne den
  // waere "keins gefunden" auch mit einer kaputten Regel zu erklaeren.
  const erfunden = [...LAUF60, ['Erfundenes Ungetuem', 2.4, 12]];
  ok(
    'ein echter Ausreisser wuerde aber erkannt',
    teuer(erfunden).length === 1 && teuer(erfunden)[0] === 'Erfundenes Ungetuem',
  );
  // Und einer, der nur laut misst, nicht: 2,4x mit ±300 % ist keine Messung.
  const laut = [...LAUF60, ['Nur Rauschen', 2.4, 300]];
  ok('ein lautes, aber unsicheres Mandala nicht', teuer(laut).length === 0);
}

console.log('\nWas das fuer die Vorauswahl heisst:');
{
  // Die vier, die in beiden Laeufen oben stehen - das ist das einzige
  // reproduzierbare Signal in der ganzen Tabelle.
  const oben = (lauf) => new Set(lauf.slice(-4).map(([n]) => n));
  const a = oben(LAUF60), b = oben(LAUF30);
  const gemeinsam = [...a].filter((x) => b.has(x));
  ok(
    'dieselben vier stehen in beiden Laeufen ganz oben',
    gemeinsam.length === 4,
    gemeinsam.join(', '),
  );
  /*
   * Und trotzdem bleiben sie drin. Reproduzierbar heisst nicht bedeutsam:
   * Diese vier kosten vier bis sechs Prozent mehr. Die Tiefenleiter selbst
   * kostet zwischen ihrer billigsten und ihrer teuersten Stelle das
   * Vierundzwanzigfache (2,7 ms bei Tiefe 4 gegen 63,6 ms bei Tiefe 16).
   * Sechs Prozent gegen vierundzwanzigfach - dafuer nimmt man niemandem ein
   * Mandala weg.
   */
  const teuerste = Math.max(...LAUF30.map((x) => x[1]));
  ok('und kosten trotzdem hoechstens sechs Prozent mehr', teuerste <= 1.06, `${teuerste}×`);
  /*
   * Der Groessenvergleich, und hier hatte ich ihn erst unbrauchbar
   * hingeschrieben ("weniger als ein Vierhundertstel der Spanne") - eine
   * Formulierung, die zwei Verhaeltnisse mischt und deren Zahl nur zufaellig
   * knapp danebenlag. Sauber gerechnet wird der *Mehraufwand* verglichen:
   * Tiefe 16 kostet 63,6 ms, Tiefe 4 nur 2,7 ms - ein Mehraufwand von rund
   * 2260 Prozent. Das teuerste Mandala liegt bei 6 Prozent.
   */
  const tiefenMehr = 63.6 / 2.7 - 1;
  const mandalaMehr = teuerste - 1;
  ok(
    'die Tiefe kostet mehr als das Dreihundertfache dessen, was die Mandalawahl kostet',
    tiefenMehr / mandalaMehr > 300,
    `${(tiefenMehr / mandalaMehr).toFixed(0)}-fach`,
  );
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Fehler.\n`);
process.exit(fehler === 0 ? 0 : 1);
