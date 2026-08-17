/*
 * Prueft die Saetze der Technikanzeige - nicht die Zahlen darunter.
 *
 * Anlass war ein echter Fall: Auf einem 145-Hz-Monitor mit Bildziel 60 stand
 * dort "48 Bilder je Sekunde bei einem Bildschirm, der 60 hergibt". Die 60
 * kam aus taktMs, und taktMs ist das *Ziel* des Reglers, nicht der
 * Bildschirm. Wer das liest, haelt seinen 145-Hz-Monitor fuer einen mit 60
 * und sucht den Fehler dort, wo keiner ist.
 *
 * Dazu die zweite Verwechslung: "Durchsatz" heisst in der Technikanzeige und
 * im Messstand dasselbe und meint zweierlei - einmal gegen den Schrittdeckel
 * gerechnet, einmal gegen die wirklich gelaufenen Schritte. Auf einer Radeon
 * RX 9070 XT waren das 9203 gegen 132, ein Faktor 70. Beide Zahlen stimmen;
 * nebeneinander gelesen sehen sie aus wie ein Widerspruch.
 *
 * Die Anzeige braucht keine Grafikkarte, um geprueft zu werden: urteil()
 * bekommt einen fertigen Befund und gibt Saetze zurueck.
 */

import { urteil } from '../public/gemeinsam/technik.js';

let fehler = 0;
const ok = (was, gut, dazu = '') => {
  console.log(`  ${gut ? 'ok  ' : 'FEHL'} ${was}${dazu ? ` – ${dazu}` : ''}`);
  if (!gut) fehler++;
};

/*
 * Der Befund vom Rechner, an dem das aufgefallen ist: Radeon RX 9070 XT,
 * 145-Hz-Bildschirm (6,9 ms), Bildziel 60 (also Zieltakt 16,7 ms), und
 * tatsaechlich kamen 20,8 ms je Bild an.
 */
const befund = () => ({
  gpu: {
    da: true,
    karte: 'ANGLE (AMD, AMD Radeon RX 9070 XT (0x00007550) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    karteRoh: '',
    hersteller: 'Google Inc. (AMD)',
    zeitmessung: true,
    messungen: 114,
    gpuMs: 11.19,
    grenzen: { textur: 16384, gleitkommaTextur: true },
  },
  fraktal: {
    da: true,
    aufGpu: true,
    durchsatz: 9202.87e6,
    abstandMs: 20.8,
    taktMs: 16.7,
    schirmTaktMs: 6.9,
    schritte: 700,
    reihe: { n: 3, stand: 'nur 3 Schritte moeglich', glieder: 4, bauMs: 0, runden: 0 },
    guete: 1.29,
    tiefe: 1.31,
  },
  genauigkeit: { messbar: true, voll: true, abweichung: 0 },
});

const alle = (a) => urteil(a).map(([, satz]) => satz).join('\n');

console.log('\nDer Bildschirm wird nicht mit dem Ziel verwechselt:');
{
  const text = alle(befund());
  const rate = text.match(/^.*Bilder je Sekunde.*$/m)?.[0] ?? '';
  ok('der Satz ueber die Bildrate steht da', rate.length > 0, rate);
  /*
   * Der Kern: Er darf keinem Bildschirm eine Rate andichten, die aus dem
   * Zieltakt stammt. Frueher stand hier "Bildschirm, der 60 hergibt" - der
   * Bildschirm gibt 145 her.
   */
  ok(
    'er nennt 60 als Ziel und nicht als Bildschirm',
    /Ziel von 60/.test(rate) && !/Bildschirm, der 60/.test(rate),
  );
  ok('und er nennt den wirklichen Bildschirm mit 145', /Bildschirm gaebe 145/.test(rate));
}

console.log('\nOhne Vorsprung des Bildschirms bleibt der Zusatz weg:');
{
  // Ein gewoehnlicher 60-Hz-Monitor mit Ziel 60: schirmTaktMs == taktMs.
  const a = befund();
  a.fraktal.schirmTaktMs = 16.7;
  const rate = alle(a).match(/^.*Bilder je Sekunde.*$/m)?.[0] ?? '';
  ok('kein "Bildschirm gaebe"-Zusatz', !/Bildschirm gaebe/.test(rate), rate);
  // Dieselbe Zahl zweimal in einem Satz ist keine Auskunft, sondern Laerm.
  ok('und trotzdem eine Aussage ueber das Ziel', /Ziel von 60/.test(rate));
}

console.log('\nFehlt die Bildschirmmessung, faellt der Satz nicht aus:');
{
  const a = befund();
  delete a.fraktal.schirmTaktMs;
  const rate = alle(a).match(/^.*Bilder je Sekunde.*$/m)?.[0] ?? '';
  ok('der Satz steht immer noch', rate.length > 0, rate);
  ok('ohne Zusatz', !/Bildschirm gaebe/.test(rate));
}

console.log('\nDer Durchsatz gibt sich als Deckelzahl zu erkennen:');
{
  const text = alle(befund());
  const satz = text.match(/^.*Punkt-Schritte je Millisekunde.*$/m)?.[0] ?? '';
  ok('die Zahl steht da', /9202\.9/.test(satz), satz);
  /*
   * Ohne diesen Hinweis stellt der Mensch die 9203 neben die 132 aus dem
   * Messstand und schliesst, eine der beiden Messungen sei kaputt.
   */
  ok('mit dem Hinweis auf den Schrittdeckel', /Schrittdeckel/.test(satz));
  ok('und der Warnung, nicht mit dem Messstand zu vergleichen', /Messstand/.test(satz));
}

console.log('\nDie Bewertung haengt am Ziel, nicht am Bildschirm:');
{
  /*
   * Hier lag zuerst mein eigener Test falsch, und das ist die Notiz wert:
   * Ich hatte behauptet, 20,8 ms bei Ziel 16,7 seien "schlecht". Sie waren
   * es nicht - 20,8/16,7 = 1,246, und die alte Schwelle stand bei 1,25. Der
   * Code hatte recht, die Behauptung nicht.
   *
   * Interessant war aber, *wie* knapp: Achtundvierzig Bilder statt sechzig,
   * jedes fuenfte weg, und die Anzeige sagte "gut". Deshalb steht die
   * Schwelle jetzt bei 1,1 - dort, wo der Regler ohnehin hinzielt - und
   * dazwischen liegt "offen".
   */
  const stufe = (abstandMs) => {
    const a = befund();
    a.fraktal.abstandMs = abstandMs;
    return urteil(a).find(([, s]) => /Bilder je Sekunde/.test(s));
  };

  ok('17,0 ms bei Ziel 16,7 sind gut', stufe(17.0)[0] === 'gut', stufe(17.0)[1]);
  ok(
    '20,8 ms - der gemessene Fall - sind offen, nicht mehr gut',
    stufe(20.8)[0] === 'offen',
    stufe(20.8)[1],
  );
  // 100 - 100/1,246 = 19,7 - also zwanzig, nicht siebzehn. Auch das hatte ich
  // erst falsch hingeschrieben: Der Rueckstand in Bildern ist nicht derselbe
  // wie der Ueberhang in Millisekunden.
  ok('und der Satz beziffert den Rueckstand', /20 Prozent unter dem Ziel/.test(stufe(20.8)[1]));
  ok('25 ms sind schlecht', stufe(25)[0] === 'schlecht', stufe(25)[1]);
  // Wer im Ziel liegt, soll nicht mit einer Prozentzahl behelligt werden.
  ok('bei "gut" steht keine Prozentzahl', !/Prozent unter dem Ziel/.test(stufe(17.0)[1]));
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Fehler.\n`);
process.exit(fehler === 0 ? 0 : 1);
