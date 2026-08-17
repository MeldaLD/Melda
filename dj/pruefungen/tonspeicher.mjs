// Abnahme: passt der Ton ueberhaupt in dieses Geraet?
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/tonspeicher.mjs
//
// Der Anlass war ein Absturz auf dem iPhone: Mit den Testklaengen lief die
// Buehne, mit hochgeladener Musik brach sie ab - ohne Fehlermeldung, die
// Seite war einfach weg. Das ist das Bild, das ein Safari-Tab macht, wenn
// ihm der Speicher ausgeht.
//
// Die Rechnung: Ein dekodierter Puffer belegt Dauer mal Abtastrate mal zwei
// Kanaele mal vier Byte. Ein Stundenmix in 44,1 kHz Stereo sind 1,27
// Gigabyte - fuer einen. Die Buehne haelt den laufenden und den naechsten.
// Ein Sechsminueter dagegen sind 127 Megabyte, und damit lief es
// unauffaellig. Nicht die Musik war neu, die Laenge war es.
//
// Geprueft wird die Rechnung selbst, nicht ihr Ergebnis auf diesem Rechner:
// Eine Stunde Musik zu erzeugen, nur um zu sehen, dass sie nicht passt, waere
// teuer und wuerde genau das ausloesen, was verhindert werden soll.

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

// Ein Track, wie ihn die Analyse ablegt - gebraucht wird nur die Tempokarte,
// denn allein ihr letzter Eintrag sagt, wie lang das Stueck ist.
const track = (minuten) => ({
  id: `t${minuten}`,
  titel: `${minuten} Minuten`,
  abschnitte: [{ von: 0, bis: minuten * 60, bpm: 128, raster: 0.46875, vertrauen: 0.9 }],
});

try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'networkidle' });
  await seite.waitForFunction(() => window.__dj?.tonRechnung, { timeout: 30000 });

  console.log('\nDie Laenge kommt aus der Tempokarte, ohne dass etwas laedt:');
  const laengen = await seite.evaluate((t) => {
    const { spielzeit } = window.__dj.tonRechnung;
    return {
      sechs: spielzeit(t.sechs),
      stunde: spielzeit(t.stunde),
      leer: spielzeit({ id: 'x', titel: 'x' }),
      kaputt: spielzeit({ id: 'x', titel: 'x', abschnitte: [] }),
    };
  }, { sechs: track(6), stunde: track(60) });
  pruefe('sechs Minuten werden erkannt', laengen.sechs === 360, `${laengen.sechs} s`);
  pruefe('eine Stunde auch', laengen.stunde === 3600, `${laengen.stunde} s`);
  // Ein Track ohne Tempokarte darf die Rechnung nicht zum Absturz bringen -
  // er faellt dann eben durch die Pruefung durch und wird geladen wie frueher.
  pruefe('ohne Tempokarte kommt null zurueck', laengen.leer === null && laengen.kaputt === null);

  console.log('\nDie Groesse eines dekodierten Puffers:');
  const groessen = await seite.evaluate(() => {
    const { pufferBytes } = window.__dj.tonRechnung;
    return { stunde44: pufferBytes(3600, 44100), sechs44: pufferBytes(360, 44100), stunde22: pufferBytes(3600, 22050) };
  });
  pruefe(
    'eine Stunde in 44,1 kHz sind rund 1,27 GB',
    Math.abs(groessen.stunde44 - 1.27e9) < 0.02e9,
    `${(groessen.stunde44 / 1e9).toFixed(2)} GB`,
  );
  pruefe(
    'sechs Minuten sind rund 127 MB - deshalb fiel es nie auf',
    Math.abs(groessen.sechs44 - 127e6) < 3e6,
    `${Math.round(groessen.sechs44 / 1e6)} MB`,
  );
  pruefe('die halbe Rate halbiert genau', groessen.stunde22 * 2 === groessen.stunde44);

  console.log('\nDie Abtastrate richtet sich nach dem laengsten Track:');
  const wahl = await seite.evaluate((t) => {
    const { abtastrateWaehlen } = window.__dj.tonRechnung;
    // Das Budget wird hier vorgegeben, damit die Pruefung nicht davon
    // abhaengt, auf welchem Geraet sie laeuft.
    const mit = (budget, tracks) => {
      const echt = navigator.deviceMemory;
      Object.defineProperty(navigator, 'deviceMemory', { value: budget / 0.2 / 1e9, configurable: true });
      const aus = abtastrateWaehlen(tracks);
      Object.defineProperty(navigator, 'deviceMemory', { value: echt, configurable: true });
      return aus;
    };
    return {
      kurzGross: mit(3e9, [t.sechs]),
      langGross: mit(3e9, [t.stunde]),
      langKlein: mit(600e6, [t.stunde]),
      kurzKlein: mit(600e6, [t.sechs]),
    };
  }, { sechs: track(6), stunde: track(60) });

  // Auf einem Rechner mit Platz bleibt alles wie bisher - das ist die
  // wichtigste der vier Zeilen: Der Partyabend darf nichts davon merken.
  pruefe('kurze Tracks, viel Speicher: volle 44,1 kHz', wahl.kurzGross.rate === 44100);
  pruefe('kurze Tracks, wenig Speicher: ebenfalls voll', wahl.kurzKlein.rate === 44100,
    `${wahl.kurzKlein.rate} Hz`);
  pruefe('Stundenmix, viel Speicher: volle 44,1 kHz', wahl.langGross.rate === 44100,
    `${wahl.langGross.rate} Hz`);
  pruefe('Rechner behalten den Vorlauf', wahl.langGross.vorladen === true && wahl.kurzGross.vorladen === true);
  /*
   * 600 MB Budget, eine Stunde Musik: Zwei Puffer passen bei keiner Rate
   * (16 kHz waeren schon 922 MB). Einer passt bei 16 kHz mit 461 MB. Also
   * wird die Rate gesenkt *und* der Vorlauf geopfert - in dieser Reihenfolge,
   * damit ein Rechner mit Platz nichts davon merkt.
   */
  pruefe('Stundenmix, wenig Speicher: Rate heruntergegangen', wahl.langKlein.rate === 16000,
    `${wahl.langKlein.rate} Hz`);
  pruefe('und der Vorlauf geopfert', wahl.langKlein.vorladen === false);

  console.log('\nDas Budget unterscheidet Rechner von Telefon:');
  const budget = await seite.evaluate(() => {
    const { speicherBudget } = window.__dj.tonRechnung;
    const echt = navigator.deviceMemory;
    Object.defineProperty(navigator, 'deviceMemory', { value: undefined, configurable: true });
    const ohne = speicherBudget();
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    const acht = speicherBudget();
    Object.defineProperty(navigator, 'deviceMemory', { value: echt, configurable: true });
    return { ohne, acht };
  });
  pruefe('8 GB gemeldet ergeben 1,6 GB Budget', Math.abs(budget.acht - 1.6e9) < 1e6,
    `${(budget.acht / 1e9).toFixed(2)} GB`);
  pruefe('ohne Angabe kommt eine brauchbare Zahl', budget.ohne >= 600e6 && budget.ohne <= 3e9,
    `${(budget.ohne / 1e6).toFixed(0)} MB`);

  console.log('');
  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
