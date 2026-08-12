// Abnahme der Schlagwerkstimmen.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/stimmen.mjs
//
// Klang laesst sich nicht behaupten, aber vier Eigenschaften lassen sich
// messen, und an ihnen haengt alles Weitere:
//
//   1. Der Einsatz sitzt auf der geplanten Zeit. Daran haengt das ganze
//      Timing der Maschine - eine Stimme, die zwei Millisekunden zu spaet
//      kommt, macht aus einem Beat einen Schleifer.
//   2. Nichts uebersteuert. Es kommen noch andere Stimmen und die laufende
//      Musik dazu; der Kopfraum muss hier schon eingeplant sein.
//   3. Die Laenge stimmt. Ein `becken` mit der Laenge eines `hutZu` waere
//      kein Becken.
//   4. Die Kennzeichen stimmen: Der Kick faellt in der Tonhoehe, der Klatsch
//      besteht aus mehreren Koernern, der Sweep faehrt wirklich nach oben.
//
// Gerendert wird offline - schneller als Echtzeit und exakt reproduzierbar.

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
const seite = await browser.newPage();
seite.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

try {
  await seite.goto(`${ADRESSE}/`, { waitUntil: 'domcontentloaded' });

  const befund = await seite.evaluate(async () => {
    const stimmen = await import('/gemeinsam/stimmen.js');

    const RATE = 44100;
    const EINSATZ = 0.5; // alle Stimmen werden auf diese Zeit geplant

    // Eine Stimme allein rendern und vermessen.
    const messe = async (name, ruf, sekunden) => {
      const ctx = new OfflineAudioContext(1, Math.ceil(RATE * sekunden), RATE);
      ruf(ctx, ctx.destination, EINSATZ);
      const puffer = await ctx.startRendering();
      const daten = puffer.getChannelData(0);

      let spitze = 0;
      let spitzeBei = 0;
      let nichtEndlich = 0;
      for (let i = 0; i < daten.length; i++) {
        const wert = daten[i];
        if (!Number.isFinite(wert)) { nichtEndlich++; continue; }
        const betrag = Math.abs(wert);
        if (betrag > spitze) { spitze = betrag; spitzeBei = i; }
      }

      // Einsatz: erster Abtastwert ueber 10 Prozent der Spitze.
      let einsatz = -1;
      for (let i = 0; i < daten.length; i++) {
        if (Math.abs(daten[i]) > spitze * 0.1) { einsatz = i; break; }
      }

      // Laenge: ab der Spitze der erste Punkt, ab dem es dauerhaft unter
      // 5 Prozent bleibt. "Dauerhaft" ist wichtig - Rauschen unterschreitet
      // die Schwelle staendig kurz, ohne verklungen zu sein.
      const schwelle = spitze * 0.05;
      let verklungen = daten.length;
      const halteFenster = Math.round(RATE * 0.02);
      for (let i = spitzeBei; i < daten.length; i++) {
        let drueber = false;
        for (let j = i; j < Math.min(daten.length, i + halteFenster); j++) {
          if (Math.abs(daten[j]) > schwelle) { drueber = true; break; }
        }
        if (!drueber) { verklungen = i; break; }
      }

      // Nulldurchgangsrate in einem Fenster - grober Ersatz fuer die
      // spektrale Lage, aber ohne FFT und voellig ausreichend fuer die
      // Frage "vorne heller als hinten?".
      const nulldurchgaenge = (vonSek, bisSek) => {
        const von = Math.round((EINSATZ + vonSek) * RATE);
        const bis = Math.min(daten.length - 1, Math.round((EINSATZ + bisSek) * RATE));
        let zahl = 0;
        for (let i = von + 1; i <= bis; i++) {
          if ((daten[i - 1] < 0) !== (daten[i] < 0)) zahl++;
        }
        return bis > von ? zahl / ((bis - von) / RATE) : 0;
      };

      // Bei einem Saegezahn versagt die Nulldurchgangsrate: Die Wellenform
      // steigt zwischen zwei Ruecksetzern monoton, also zaehlt man immer den
      // Grundton, egal wie weit der Tiefpass offen ist. Deshalb hier ein
      // anderes Mass fuer "hell": das Verhaeltnis aus der Leistung der
      // ersten Differenz zur Leistung des Signals. Die Differenz ist ein
      // Hochpass erster Ordnung - je mehr Obertoene, desto groesser.
      const hoehenmass = (vonSek, bisSek) => {
        const von = Math.round((EINSATZ + vonSek) * RATE);
        const bis = Math.min(daten.length - 1, Math.round((EINSATZ + bisSek) * RATE));
        let signal = 0;
        let flanke = 0;
        for (let i = von + 1; i <= bis; i++) {
          signal += daten[i] * daten[i];
          const d = daten[i] - daten[i - 1];
          flanke += d * d;
        }
        return signal > 0 ? Math.sqrt(flanke / signal) : 0;
      };

      // Geglaettete Huellkurve: gleitender Effektivwert, feiner Vorschub.
      //
      // Der erste Versuch nahm den Spitzenwert je Millisekunde. Das war
      // unbrauchbar: Die Stimmen bestehen aus Rauschen, und der hoechste von
      // 44 Zufallswerten schwankt selbst so stark, dass ein Gipfelsucher vor
      // allem den Zufall findet. Von vierzehn Durchgaengen meldeten fuenf zu
      // wenige Koerner - nicht weil der Klatsch anders klang, sondern weil
      // gewuerfelt wurde.
      //
      // Der Effektivwert ueber drei Millisekunden mittelt das weg und laesst
      // die Huellkurve stehen, um die es geht.
      const glatteHuelle = (bisSek, fensterSek = 0.003, schrittSek = 0.0005) => {
        const fenster = Math.round(fensterSek * RATE);
        const schritt = Math.round(schrittSek * RATE);
        const von = Math.round(EINSATZ * RATE);
        const bis = Math.round((EINSATZ + bisSek) * RATE);
        const werte = [];
        for (let i = von; i + fenster < bis; i += schritt) {
          let s = 0;
          for (let j = i; j < i + fenster; j++) s += daten[j] * daten[j];
          werte.push(Math.sqrt(s / fenster));
        }
        return werte;
      };

      return {
        name,
        spitze,
        nichtEndlich,
        einsatzMs: einsatz < 0 ? null : (einsatz / RATE - EINSATZ) * 1000,
        // Erster Abtastwert ueberhaupt ungleich null. Fuer Stimmen, die
        // absichtlich aus dem Nichts kommen, ist das die richtige Frage -
        // nicht, wann sie zehn Prozent erreichen.
        regtSichMs: (() => {
          for (let i = 0; i < daten.length; i++) {
            if (Math.abs(daten[i]) > spitze * 1e-4) return (i / RATE - EINSATZ) * 1000;
          }
          return null;
        })(),
        laengeMs: ((verklungen - Math.round(EINSATZ * RATE)) / RATE) * 1000,
        nulldurchgaenge,
        hoehenmass,
        glatteHuelle,
      };
    };

    const ergebnisse = {};
    ergebnisse.kick = await messe('kick', (c, z, t) => stimmen.kick(c, z, t), 1.5);
    ergebnisse.klatsch = await messe('klatsch', (c, z, t) => stimmen.klatsch(c, z, t), 1.5);
    ergebnisse.hutZu = await messe('hutZu', (c, z, t) => stimmen.hutZu(c, z, t), 1);
    ergebnisse.hutAuf = await messe('hutAuf', (c, z, t) => stimmen.hutAuf(c, z, t), 1.5);
    ergebnisse.becken = await messe('becken', (c, z, t) => stimmen.becken(c, z, t), 3);
    ergebnisse.rausch = await messe('rausch', (c, z, t) => stimmen.rausch(c, z, t, { dauer: 2 }), 3.5);
    ergebnisse.stich = await messe('stich', (c, z, t) => stimmen.stich(c, z, t), 1.5);

    // Kennzeichen, die je Stimme eigens gerechnet werden.
    const kick = ergebnisse.kick;
    kick.zrVorne = kick.nulldurchgaenge(0, 0.02);
    kick.zrHinten = kick.nulldurchgaenge(0.1, 0.2);

    const klatsch = ergebnisse.klatsch;
    // Koerner zaehlen: Gipfel der geglaetteten Huellkurve, die sich gegen das
    // *folgende* Tal deutlich abheben. Diese Forderung nach Prominenz ist der
    // Kern - ein Klatsch unterscheidet sich von einem Rauschstoss gleicher
    // Laenge genau dadurch, dass der Pegel zwischen den Koernern einbricht
    // und wieder hochkommt.
    const kh = klatsch.glatteHuelle(0.045);
    let khHoch = 0;
    for (const w of kh) if (w > khHoch) khHoch = w;
    let koerner = 0;
    let i = 0;
    while (i < kh.length) {
      // Zum naechsten Gipfel laufen.
      while (i < kh.length - 1 && kh[i + 1] >= kh[i]) i++;
      const gipfel = kh[i];
      // Und von dort ins Tal.
      let tal = gipfel;
      let j = i;
      while (j < kh.length - 1 && kh[j + 1] <= kh[j]) { j++; tal = kh[j]; }
      if (gipfel > khHoch * 0.25 && tal < gipfel * 0.6) koerner++;
      if (j === i) i++; else i = j;
    }
    klatsch.gipfel = koerner;

    const sweep = ergebnisse.rausch;
    sweep.zrErstesViertel = sweep.nulldurchgaenge(0, 0.5);
    sweep.zrLetztesViertel = sweep.nulldurchgaenge(1.5, 2);

    const stich = ergebnisse.stich;
    stich.hellVorne = stich.hoehenmass(0, 0.03);
    stich.hellHinten = stich.hoehenmass(0.15, 0.2);

    // Dauerlast im echten Tempo: 200 Kicks auf 130 BPM, also gut anderthalb
    // Minuten durchlaufender Viervierteltakt. Ein frueherer Versuch mit 200
    // Kicks in vier Sekunden mass etwas anderes - bei 51 Schlaegen je Sekunde
    // ueberlagern sich sieben Kicks staendig, und die Summe ist dann
    // erwartungsgemaess hoch. Das kommt am Kicksynthesizer nicht vor.
    const DAUER_BPM = 130;
    const dauerAbstand = 60 / DAUER_BPM;
    const dauerCtx = new OfflineAudioContext(1, Math.ceil(RATE * (200 * dauerAbstand + 1)), RATE);
    for (let i = 0; i < 200; i++) {
      stimmen.kick(dauerCtx, dauerCtx.destination, 0.05 + i * dauerAbstand, { pegel: 1 });
    }
    const dauerPuffer = await dauerCtx.startRendering();
    const dauerDaten = dauerPuffer.getChannelData(0);
    let dauerSpitze = 0;
    let dauerKaputt = 0;
    for (const wert of dauerDaten) {
      if (!Number.isFinite(wert)) { dauerKaputt++; continue; }
      const b = Math.abs(wert);
      if (b > dauerSpitze) dauerSpitze = b;
    }

    // Die Funktionen lassen sich nicht ueber die Prozessgrenze reichen.
    for (const e of Object.values(ergebnisse)) {
      delete e.nulldurchgaenge;
      delete e.hoehenmass;
      delete e.glatteHuelle;
    }
    return { ergebnisse, dauer: { spitze: dauerSpitze, kaputt: dauerKaputt } };
  });

  const { ergebnisse, dauer } = befund;

  console.log('\nGemessen (Einsatz geplant auf 500 ms):\n');
  console.log('  Stimme    Spitze   Einsatz     Laenge bis -26 dB');
  for (const e of Object.values(ergebnisse)) {
    console.log(
      `  ${e.name.padEnd(9)} ${e.spitze.toFixed(3).padStart(6)}   ` +
        `${(e.einsatzMs === null ? '—' : `${e.einsatzMs >= 0 ? '+' : ''}${e.einsatzMs.toFixed(2)} ms`).padStart(9)}   ` +
        `${e.laengeMs.toFixed(0).padStart(6)} ms`,
    );
  }

  console.log('\nEs kommt etwas heraus, und nichts ist kaputt:');
  for (const e of Object.values(ergebnisse)) {
    pruefe(`${e.name} klingt`, e.spitze > 0.01, `Spitze ${e.spitze.toFixed(3)}`);
    pruefe(`${e.name} ohne NaN`, e.nichtEndlich === 0);
  }

  console.log('\nKopfraum – bei Pegel 1 bleibt Luft:');
  for (const e of Object.values(ergebnisse)) {
    pruefe(`${e.name} uebersteuert nicht`, e.spitze <= 0.95, `Spitze ${e.spitze.toFixed(3)}`);
  }
  pruefe(
    'der Kick liegt im Zielfenster 0,5 bis 0,85',
    ergebnisse.kick.spitze >= 0.5 && ergebnisse.kick.spitze <= 0.85,
    `${ergebnisse.kick.spitze.toFixed(3)}`,
  );

  console.log('\nDer Einsatz sitzt – daran haengt das ganze Timing:');
  for (const e of Object.values(ergebnisse)) {
    // `rausch` ist der Aufbau-Sweep. Er beginnt bei 0,4 Prozent seiner
    // spaeteren Spitze und waechst ueber zwei Sekunden - er erreicht zehn
    // Prozent also erst weit nach dem Einsatz, und das ist genau richtig so.
    // Bei ihm zaehlt, wann er ueberhaupt anfaengt zu klingen.
    const gemessen = e.name === 'rausch' ? e.regtSichMs : e.einsatzMs;
    pruefe(
      `${e.name} setzt innerhalb 5 ms ein`,
      gemessen !== null && gemessen >= -0.1 && gemessen < 5,
      `${gemessen === null ? 'nie ueber der Schwelle' : `${gemessen.toFixed(2)} ms`}` +
        (e.name === 'rausch' ? ' (erster Ton, nicht 10 % – siehe Kommentar)' : ''),
    );
  }

  console.log('\nLaengen stehen im richtigen Verhaeltnis:');
  const laenge = (n) => ergebnisse[n].laengeMs;
  pruefe('hutZu ist kurz', laenge('hutZu') < 120, `${laenge('hutZu').toFixed(0)} ms`);
  pruefe('hutAuf ist deutlich laenger als hutZu', laenge('hutAuf') > laenge('hutZu') * 3);
  pruefe('becken ist am laengsten', laenge('becken') > laenge('hutAuf'));
  pruefe(
    'der Kick passt zu seinem Abfall von 340 ms',
    laenge('kick') > 170 && laenge('kick') < 680,
    `${laenge('kick').toFixed(0)} ms`,
  );

  console.log('\nDie Kennzeichen der einzelnen Stimmen:');
  pruefe(
    'der Kick faellt in der Tonhoehe',
    ergebnisse.kick.zrVorne > ergebnisse.kick.zrHinten * 1.5,
    `${ergebnisse.kick.zrVorne.toFixed(0)} -> ${ergebnisse.kick.zrHinten.toFixed(0)} Nulldurchgaenge/s`,
  );
  pruefe(
    'der Klatsch besteht aus mehreren Koernern',
    ergebnisse.klatsch.gipfel >= 2,
    `${ergebnisse.klatsch.gipfel} Gipfel in den ersten 40 ms`,
  );
  pruefe(
    'der Sweep faehrt nach oben',
    ergebnisse.rausch.zrLetztesViertel > ergebnisse.rausch.zrErstesViertel * 2,
    `${ergebnisse.rausch.zrErstesViertel.toFixed(0)} -> ${ergebnisse.rausch.zrLetztesViertel.toFixed(0)} Nulldurchgaenge/s`,
  );
  pruefe(
    'der Stich schliesst seinen Filter',
    ergebnisse.stich.hellVorne > ergebnisse.stich.hellHinten * 1.5,
    `Hoehenmass ${ergebnisse.stich.hellVorne.toFixed(3)} -> ${ergebnisse.stich.hellHinten.toFixed(3)}`,
  );

  console.log('\nDauerlast – 200 Kicks auf 130 BPM:');
  console.log(`    Spitze ${dauer.spitze.toFixed(3)}, ${dauer.kaputt} unbrauchbare Abtastwerte`);
  pruefe('nichts wird unendlich', dauer.kaputt === 0 && Number.isFinite(dauer.spitze));
  // Bei 130 BPM ist ein Kick fast verklungen, bevor der naechste kommt. Bleibt
  // trotzdem etwas stehen, waechst die Summe - und genau das faende man hier.
  pruefe('es schaukelt sich nicht auf', dauer.spitze < 0.8, `${dauer.spitze.toFixed(3)}`);
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
