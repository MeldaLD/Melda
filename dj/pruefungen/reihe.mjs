// Abnahme der Reihenentwicklung.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/reihe.mjs
//
// Die Reihenentwicklung ist das einzige Stueck im Fraktal, das eine *Naeherung*
// ist und keine exakte Rechnung. Sie ueberspringt am Anfang der Bahn einen
// Teil der Iterationen, indem sie den Abstand direkt aus einer Potenzreihe
// ausrechnet. Der Gewinn ist gross; der Preis ist, dass sie falsch liegen
// *kann*.
//
// Und wenn sie falsch liegt, sieht das nicht nach Fehler aus. Sie putzt dann
// feine Zeichnung weg - das Bild wird glatter, nicht kaputt. Genau deshalb
// prueft diese Abnahme nicht "laeuft es", sondern: Kommt mit Reihe dasselbe
// Bild heraus wie ohne?
//
// Verglichen wird Bildpunkt fuer Bildpunkt an mehreren Zoomtiefen, und zwar
// an derselben Stelle, mit denselben Einstellungen, nur der Schalter
// unterscheidet sich.

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
  args: ['--mute-audio'],
});
const seite = await browser.newPage({ viewport: { width: 900, height: 600 } });
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => {
  if (n.type() === 'error' && !/api\/|Failed to load resource/.test(n.text())) konsole.push(n.text());
});

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });

  const ergebnis = await seite.evaluate(async () => {
    const gpu = await import('/gemeinsam/mandelgpu.js');
    if (!gpu.gpuBereit()) return { keineGpu: true };

    // Eine Farbtabelle, damit ueberhaupt etwas Sichtbares herauskommt.
    const tabelle = new Uint8Array(512 * 3);
    for (let i = 0; i < 512; i++) {
      const t = i / 512;
      tabelle[i * 3] = Math.round(128 + 127 * Math.sin(t * 6.283));
      tabelle[i * 3 + 1] = Math.round(128 + 127 * Math.sin(t * 6.283 + 2.1));
      tabelle[i * 3 + 2] = Math.round(128 + 127 * Math.sin(t * 6.283 + 4.2));
    }
    gpu.gpuFarben(tabelle);

    const ziel = {
      name: 'Seepferdchental',
      x: '-0.743643887037158704752191506114774',
      y: '0.131825904205311970493132056385139',
    };

    const einBild = (tiefe, schritte, reihe) => {
      const bild = gpu.gpuZeichnen({
        breite: 320,
        hoehe: 240,
        ziel,
        tiefe,
        dreh: 0,
        schritte,
        versatz: 0,
        dichte: 1,
        innenHell: 0.4,
        welle: 0,
        welleZeit: 0,
        mandala: 0,
        sterne: 6,
        fangAnteil: 0.3,
        guete: 1,
        reihe,
      });
      const leinwand = document.createElement('canvas');
      leinwand.width = bild.breite;
      leinwand.height = bild.hoehe;
      const stift = leinwand.getContext('2d');
      stift.drawImage(bild.leinwand, 0, 0);
      return {
        daten: Array.from(stift.getImageData(0, 0, bild.breite, bild.hoehe).data),
        breite: bild.breite,
        hoehe: bild.hoehe,
      };
    };

    const laeufe = [];
    for (const [tiefe, schritte] of [
      [1.5, 700],
      [4, 1200],
      [8, 2200],
      [12, 5000],
      [15, 9000],
    ]) {
      /*
       * Erst die Bezugsbahn auswachsen lassen - sonst misst man etwas anderes.
       *
       * Die Bahn waechst bei jedem Aufruf um ein Stueck, und ihre Laenge geht
       * ins Bild ein: Ist sie kurz, setzt die Rechnung haeufiger neu an. Zwei
       * Bilder mit verschieden langer Bahn unterscheiden sich also, ganz ohne
       * Reihenentwicklung.
       *
       * Genau das hat mich hier erst in die Irre gefuehrt: Bei einem Vergleich
       * ohne dieses Auswachsen kamen 86 Prozent geaenderte Punkte heraus - und
       * das war nicht die Reihe, sondern die Bahn.
       */
      for (let i = 0; i < 12; i++) einBild(tiefe, schritte, false);

      const ohne = einBild(tiefe, schritte, false);
      // Zweimal zeichnen: Der Bau der Reihe passiert im ersten Aufruf, und
      // erst der zweite nutzt sie mit voller Sprungweite.
      einBild(tiefe, schritte, true);
      const mit = einBild(tiefe, schritte, true);
      const auskunft = gpu.reiheAuskunft();

      let summe = 0;
      let schlimmster = 0;
      let anders = 0;
      let starkAnders = 0;
      const n = ohne.daten.length;
      for (let i = 0; i < n; i += 4) {
        let hier = 0;
        for (let k = 0; k < 3; k++) {
          const ab = Math.abs(ohne.daten[i + k] - mit.daten[i + k]);
          summe += ab;
          if (ab > hier) hier = ab;
        }
        if (hier > schlimmster) schlimmster = hier;
        if (hier > 0) anders++;
        // Ein Punkt, den man wirklich sehen wuerde. Alles darunter ist
        // Rundung an einer Farbbandgrenze.
        if (hier > 30) starkAnders++;
      }
      const punkte = n / 4;

      /*
       * Und die eigentliche Frage: Ist Zeichnung verlorengegangen?
       *
       * Ein paar gekippte Punkte an Farbbandgrenzen sind harmlos - dort
       * entscheidet die letzte Stelle, ob ein Punkt ins Nachbarband faellt.
       * Gefaehrlich ist etwas anderes: dass die Reihe zu weit springt und
       * feine Struktur glatt buegelt. Das misst man nicht am Unterschied,
       * sondern an der Kantendichte: Ein glatt gebuegeltes Bild hat weniger
       * Kanten als das echte.
       */
      const kanten = (daten, breite, hoehe) => {
        let s = 0;
        let z = 0;
        for (let y = 0; y < hoehe; y++) {
          for (let x = 1; x < breite; x++) {
            const i = (y * breite + x) * 4;
            s += Math.abs(daten[i] - daten[i - 4]) + Math.abs(daten[i + 1] - daten[i - 3]);
            z++;
          }
        }
        return z > 0 ? s / z : 0;
      };
      const kantenOhne = kanten(ohne.daten, ohne.breite, ohne.hoehe);
      const kantenMit = kanten(mit.daten, mit.breite, mit.hoehe);

      /*
       * Und die entscheidende Unterscheidung: gekippte Bandkanten oder ein
       * anderes Bild?
       *
       * Die Farbe ist eine periodische Funktion der Ausstiegszahl. An einer
       * Bandgrenze entscheidet die letzte Stelle, ob ein Punkt ins Nachbarband
       * faellt - dort kippt er bei jeder noch so kleinen Aenderung, und das
       * sieht in der Zaehlung dramatisch aus, im Bild aber nach nichts.
       *
       * Ein Weichzeichner ueber drei mal drei Punkte nimmt genau diese
       * Einzelkipper heraus und laesst stehen, was Flaeche hat. Bleibt danach
       * ein Unterschied, ist das Bild wirklich ein anderes.
       */
      const weich = (daten, breite, hoehe) => {
        const raus = new Float64Array(breite * hoehe * 3);
        for (let y = 0; y < hoehe; y++) {
          for (let x = 0; x < breite; x++) {
            for (let k = 0; k < 3; k++) {
              let s = 0;
              let z = 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  const yy = y + dy;
                  const xx = x + dx;
                  if (yy < 0 || yy >= hoehe || xx < 0 || xx >= breite) continue;
                  s += daten[(yy * breite + xx) * 4 + k];
                  z++;
                }
              }
              raus[(y * breite + x) * 3 + k] = s / z;
            }
          }
        }
        return raus;
      };
      const wOhne = weich(ohne.daten, ohne.breite, ohne.hoehe);
      const wMit = weich(mit.daten, mit.breite, mit.hoehe);
      let weichStark = 0;
      for (let i = 0; i < wOhne.length; i += 3) {
        let h = 0;
        for (let k = 0; k < 3; k++) h = Math.max(h, Math.abs(wOhne[i + k] - wMit[i + k]));
        if (h > 30) weichStark++;
      }
      laeufe.push({
        tiefe,
        schritte,
        uebersprungen: auskunft.n,
        stand: auskunft.stand,
        mittel: summe / (punkte * 3),
        schlimmster,
        anteilAnders: anders / punkte,
        anteilStark: starkAnders / punkte,
        anteilWeich: weichStark / punkte,
        kantenOhne,
        kantenMit,
      });
    }
    return { laeufe };
  });

  if (ergebnis.keineGpu) {
    console.log('\nNICHT GEPRUEFT: In diesem Browser gibt es kein WebGL 2.');
    console.log('Die Reihenentwicklung laeuft nur auf der Grafikkarte.\n');
    process.exit(0);
  }

  console.log('\nWieviel ueberspringt die Reihe?');
  for (const l of ergebnis.laeufe) {
    const anteil = l.schritte > 0 ? (l.uebersprungen / l.schritte) * 100 : 0;
    console.log(
      `    Tiefe ${String(l.tiefe).padStart(4)}: ${String(l.uebersprungen).padStart(5)} von ${String(l.schritte).padStart(5)} Schritten (${anteil.toFixed(0)} %) – ${l.stand}`,
    );
  }
  const tief = ergebnis.laeufe.filter((l) => l.tiefe >= 8);
  pruefe(
    'in der Tiefe springt sie ueberhaupt',
    tief.some((l) => l.uebersprungen > 0),
    tief.map((l) => l.uebersprungen).join(', '),
  );

  /*
   * Und jetzt der Punkt, um den es geht: Sieht das Bild gleich aus?
   *
   * Ein paar Stufen Unterschied sind unvermeidlich - die Reihe rechnet in
   * einfacher Genauigkeit, und an den Farbbandgrenzen kippt ein Punkt dadurch
   * schon mal in das Nachbarband. Was *nicht* passieren darf, ist verlorene
   * Zeichnung: grossflaechig andere Farben oder ein glatt gebuegeltes Bild.
   */
  console.log('\nUnd sieht es genauso aus?');
  for (const l of ergebnis.laeufe) {
    console.log(
      `    Tiefe ${String(l.tiefe).padStart(4)}: ${(l.anteilStark * 100).toFixed(2)} % gekippt, ` +
        `davon nach Weichzeichner ${(l.anteilWeich * 100).toFixed(2)} % uebrig ` +
        `(${(l.anteilAnders * 100).toFixed(1)} % ueberhaupt anders)`,
    );
  }
  const meisteStark = Math.max(...ergebnis.laeufe.map((l) => l.anteilStark));
  const meisteWeich = Math.max(...ergebnis.laeufe.map((l) => l.anteilWeich));
  console.log(
    `    Nach dem Weichzeichner bleiben hoechstens ${(meisteWeich * 100).toFixed(2)} % ` +
      `(vorher ${(meisteStark * 100).toFixed(2)} %)`,
  );
  /*
   * Geprueft wird das weichgezeichnete Bild, nicht das rohe.
   *
   * Die rohen Kipper an Bandgrenzen sind kein Fehler, sondern die Natur der
   * Sache: Die Farbe ist periodisch in der Ausstiegszahl, und an einer Grenze
   * entscheidet die letzte Stelle. Auch zwei exakte Rechnungen mit
   * unterschiedlicher Rundung wuerden sich dort unterscheiden. Was zaehlt, ist
   * ob eine *Flaeche* anders aussieht.
   */
  pruefe(
    'nach dem Weichzeichner bleibt kaum ein Unterschied',
    meisteWeich < 0.01,
    `${(meisteWeich * 100).toFixed(2)} % der Punkte`,
  );

  console.log('\nUnd ist Zeichnung verlorengegangen?');
  let glattgebuegelt = 0;
  for (const l of ergebnis.laeufe) {
    const verhaeltnis = l.kantenOhne > 0 ? l.kantenMit / l.kantenOhne : 1;
    if (verhaeltnis < 0.97) glattgebuegelt++;
    console.log(
      `    Tiefe ${String(l.tiefe).padStart(4)}: Kantendichte ${l.kantenOhne.toFixed(1)} ohne, ` +
        `${l.kantenMit.toFixed(1)} mit Reihe (${((verhaeltnis - 1) * 100).toFixed(1)} %)`,
    );
  }
  pruefe(
    'das Bild mit Reihe ist nicht glatter als ohne',
    glattgebuegelt === 0,
    `${glattgebuegelt} Tiefe(n) mit weniger Kanten`,
  );

  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
