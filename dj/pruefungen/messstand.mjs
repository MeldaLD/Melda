// Abnahme des Messstands.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/messstand.mjs
//
// Der Messstand ist ein Messgeraet, und ein Messgeraet, dem man nicht trauen
// kann, ist schlimmer als keines: Man richtet sich danach. Geprueft wird
// deshalb nicht, ob er Zahlen ausgibt, sondern ob die Zahlen das tun, was
// Zahlen ueber diese Sache tun muessen.
//
//   1. Mehr Arbeit kostet mehr Zeit. Achtung, das heisst *nicht* "tiefer
//      kostet mehr" - diese Zusage stand hier zuerst und war falsch. Die
//      Reihenentwicklung wird mit der Tiefe besser und ueberspringt bei Tiefe
//      16 neun Zehntel aller Schritte; die Kurve faellt dadurch, statt zu
//      steigen. Arbeit ist Punktzahl mal *wirksame* Schritte.
//   2. Mehr Punkte kosten mehr. Dieselbe Tiefe auf der groesseren Flaeche darf
//      nicht schneller sein.
//   3. Das Modell muss die Punkte treffen, die es nicht kennt. Der Messstand
//      misst zwei Schnitte und rechnet daraus den Rest hoch; ob das zulaessig
//      ist, entscheidet die Gegenprobe an ungemessenen Punkten - und die
//      Abweichung steht im Bericht, statt verschwiegen zu werden.
//   4. Die Empfehlung muss in der Buehne ankommen. Sie ist der eigentliche
//      Zweck: nicht eine Tabelle zum Anschauen, sondern eine Einstellung, mit
//      der der Abend laeuft.
//
// Achtung bei den absoluten Zahlen: In dieser Umgebung rechnet SwiftShader,
// ein Nachbau der Grafikkarte in Software. Die Millisekunden gelten dafuer und
// fuer nichts sonst. Die Ordnungsbeziehungen oben gelten trotzdem - sie haengen
// an der Arbeit, nicht an der Geschwindigkeit.

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
  args: [
    '--mute-audio',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const seite = await browser.newPage({ viewport: { width: 900, height: 700 } });
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => {
  if (n.type() === 'error') konsole.push(n.text());
});

try {
  await seite.goto(`${ADRESSE}/messstand`, { waitUntil: 'networkidle' });

  console.log('\nDie Seite selbst:');
  pruefe('sie liegt unter /messstand', seite.url().includes('/messstand'));
  /*
   * Der Schraegstrich am Ende ist kein Schoenheitsfehler, sondern der Grund,
   * warum das Beiwerk ueberhaupt geladen wird. Die Seite laeuft unter zwei
   * Adressen und laedt deshalb relativ; ohne Schraegstrich landete
   * "messstand.css" eine Ebene zu hoch. Genau das ist der Aufnahmeseite schon
   * einmal passiert, und dort war es ein leerer Bildschirm.
   */
  pruefe('und wird auf den Schraegstrich umgeleitet', seite.url().endsWith('/messstand/'), seite.url());
  const stilDa = await seite.evaluate(() => {
    const knopf = document.getElementById('kurz');
    return getComputedStyle(knopf).borderRadius !== '0px';
  });
  pruefe('das Stylesheet ist angekommen', stilDa);

  console.log('\nEin kurzer Durchgang:');
  await seite.click('#kurz');
  // Er dauert; auf SwiftShader deutlich laenger als auf einer Karte.
  await seite.waitForFunction(() => window.__messstand !== undefined, null, { timeout: 900000 });
  const { roh, aus } = await seite.evaluate(() => ({
    roh: {
      taktMs: window.__messstand.roh.taktMs,
      abgebrochen: window.__messstand.roh.abgebrochen,
      flaechen: window.__messstand.roh.flaechen,
      schrittPlan: window.__messstand.roh.schrittPlan,
      kurve: window.__messstand.roh.kurve,
      uebersprungenGesamt: window.__messstand.roh.uebersprungen,
      mandalaPunkte: window.__messstand.roh.mandalaPunkte,
      probe: window.__messstand.roh.probe,
      zeitmessung: window.__messstand.roh.auskunft.zeitmessung,
    },
    aus: {
      budgetMs: window.__messstand.aus.budgetMs,
      durchsatz: window.__messstand.aus.durchsatz,
      abweichungen: window.__messstand.aus.abweichungen,
      jeMandala: window.__messstand.aus.jeMandala,
    },
  }));

  pruefe('er laeuft durch, ohne abzubrechen', !roh.abgebrochen);
  pruefe('der Bildtakt wurde gemessen', roh.taktMs > 3 && roh.taktMs < 200,
    `${roh.taktMs.toFixed(1)} ms`);
  pruefe('drei Flaechen aus dem wirklichen Bildschirm', roh.flaechen.length === 3,
    roh.flaechen.map((f) => `${f.name} ${(f.punkte / 1e6).toFixed(2)} MP`).join(', '));

  /*
   * Auch hier stand zuerst eine Zusage zu viel: "nirgends weniger Schritte bei
   * mehr Tiefe". Sie war nur deshalb gruen, weil die Stichprobe gar nicht
   * gemessen hatte und der Messstand still auf seine Ersatzformel zurueckfiel
   * - und die ist monoton, weil ich sie monoton hingeschrieben habe.
   *
   * Mit laufender Stichprobe kommen 700, 840, 1060, 7142, 1685, 2536, 4666,
   * 12467 heraus. Das ist richtig so: Wieviele Schritte eine Stelle braucht,
   * haengt daran, wie nah der Ausschnitt am Rand der Menge liegt, und der Rand
   * kommt auf der Fahrt mal naeher und mal ferner. Ueber die ganze Leiter
   * steigt es, von Stufe zu Stufe nicht.
   */
  console.log('\nDie Schrittzahl kommt aus der Stichprobe:');
  const plan = [...roh.schrittPlan].sort((a, b) => a.tiefe - b.tiefe);
  const haelfte = Math.floor(plan.length / 2);
  const mittelwert = (a) => a.reduce((x, y) => x + y.schritte, 0) / a.length;
  const flachMittel = mittelwert(plan.slice(0, haelfte));
  const tiefMittel = mittelwert(plan.slice(haelfte));
  pruefe(
    'ueber die ganze Leiter braucht es tiefer mehr Schritte',
    tiefMittel > flachMittel,
    `flach ${Math.round(flachMittel)} gegen tief ${Math.round(tiefMittel)}`,
  );
  /*
   * Und sie kommt aus der Stichprobe, nicht aus der Ersatzformel.
   *
   * Im ersten Bericht vom iPad standen exakt 400 + 110 mal Tiefe und in der
   * Spalte "innen" durchgehend nichts - beides zusammen heisst: Die Stichprobe
   * hat gar nicht gemessen, weil die Bezugsbahn zu dem Zeitpunkt noch nicht
   * existierte. Der Messstand meldete daraufhin eine Arbeit, die er sich
   * ausgedacht hatte.
   */
  const gemessen = plan.filter((s) => s.innenAnteil !== null && s.innenAnteil !== undefined);
  pruefe('und sie ist gemessen, nicht aus der Ersatzformel', gemessen.length === plan.length,
    `${gemessen.length} von ${plan.length} Tiefen mit Stichprobe`);

  /*
   * Hier stand zuerst "Tiefer kostet mehr", und die Pruefung schlug fehl - auf
   * allen drei Flaechen gleichzeitig, mit Tiefe 2 bei 532 ms und Tiefe 16 bei
   * 199. Ein Messfehler trifft nicht dreimal dasselbe, also war die Zusage
   * falsch und nicht die Messung.
   *
   * Nachgemessen mit abgeschalteter Reihenentwicklung stieg die Kurve sauber
   * von 332 auf 1042 ms. Die Reihe ueberspringt bei Tiefe 2 null Schritte und
   * bei Tiefe 16 ganze 1944 von 2160: Je tiefer die Fahrt, desto naeher liegen
   * benachbarte Bildpunkte, desto laenger traegt die Naeherung. Sie wird mit
   * der Tiefe besser.
   *
   * Geprueft wird deshalb, was wirklich gilt: Mehr *wirksame* Arbeit kostet
   * mehr Zeit. Wirksame Arbeit ist Punktzahl mal (Schritte minus
   * uebersprungene).
   */
  console.log('\nMehr wirksame Arbeit kostet mehr Zeit:');
  {
    const gemessen = roh.kurve.filter((p) => !p.geschaetzt && p.wandMs > 0);
    const arbeit = (p) => p.punkte * (p.wirksam ?? p.schritte);
    const sortiert = [...gemessen].sort((a, b) => arbeit(a) - arbeit(b));
    const wenig = sortiert[0];
    const viel = sortiert[sortiert.length - 1];
    pruefe(
      'der Punkt mit der meisten Arbeit ist auch der teuerste Bereich',
      viel.wandMs > wenig.wandMs,
      `${(arbeit(wenig) / 1e6).toFixed(0)} Mio → ${wenig.wandMs.toFixed(1)} ms gegen ` +
        `${(arbeit(viel) / 1e6).toFixed(0)} Mio → ${viel.wandMs.toFixed(1)} ms`,
    );

    /*
     * Und die Beziehung ist nicht nur an den Enden richtig, sondern ueber die
     * ganze Reihe: Der Durchsatz - Arbeit je Millisekunde - muss ungefaehr
     * konstant sein. Genau das ist der Beleg, dass "wirksame Arbeit" die
     * richtige Groesse ist und "Tiefe" es nicht war.
     */
    const durchsaetze = gemessen.map((p) => arbeit(p) / p.wandMs);
    const s = [...durchsaetze].sort((a, b) => a - b);
    const spanne = s[s.length - 1] / s[0];
    pruefe(
      'und der Durchsatz bleibt dabei in derselben Groessenordnung',
      spanne < 12,
      `zwischen ${(s[0] / 1e3).toFixed(0)}k und ${(s[s.length - 1] / 1e3).toFixed(0)}k ` +
        `Punkt-Schritten/ms, Spanne ${spanne.toFixed(1)}×`,
    );
  }

  console.log('\nDie Reihenentwicklung wird mit der Tiefe besser:');
  {
    const jeTiefe = new Map();
    for (const p of roh.kurve) {
      if (!p.geschaetzt && p.uebersprungen !== undefined) jeTiefe.set(p.tiefe, p);
    }
    const flach = jeTiefe.get(2) ?? jeTiefe.get(4);
    const tief = jeTiefe.get(16) ?? jeTiefe.get(14);
    if (!flach || !tief) {
      console.log('    NICHT GEPRUEFT: für flach und tief liegt keine gemessene Zeile vor.');
    } else {
      const anteil = (p) => p.uebersprungen / p.schritte;
      pruefe(
        `bei Tiefe ${tief.tiefe} überspringt sie mehr als bei Tiefe ${flach.tiefe}`,
        anteil(tief) > anteil(flach),
        `${(anteil(flach) * 100).toFixed(0)} % gegen ${(anteil(tief) * 100).toFixed(0)} %`,
      );
    }
  }

  console.log('\nMehr Punkte kosten mehr:');
  {
    const gross = roh.flaechen[0];
    const klein = roh.flaechen[roh.flaechen.length - 1];
    if (gross.punkte === klein.punkte) {
      console.log('    NICHT GEPRUEFT: auf diesem Bildschirm rechnen alle Stufen dieselbe Flaeche.');
    } else {
      const bei = (schluessel, tiefe) =>
        roh.kurve.find((p) => p.flaeche === schluessel && p.tiefe === tiefe)?.wandMs ?? null;
      const tiefe = 12;
      pruefe(
        `bei Tiefe ${tiefe} kostet ${gross.name} mehr als ${klein.name}`,
        bei(gross.schluessel, tiefe) > bei(klein.schluessel, tiefe),
        `${bei(gross.schluessel, tiefe)?.toFixed(1)} gegen ${bei(klein.schluessel, tiefe)?.toFixed(1)} ms`,
      );
    }
  }

  console.log('\nJedes Mandala hat einen Faktor:');
  const ohne = aus.jeMandala.filter((m) => m.faktor === null);
  pruefe('keines ohne Messwert', ohne.length === 0, ohne.map((m) => m.id).join(', '));
  const faktoren = aus.jeMandala.map((m) => m.faktor).filter((x) => x !== null);
  pruefe(
    'und die Faktoren liegen in einer plausiblen Spanne',
    Math.min(...faktoren) > 0.1 && Math.max(...faktoren) < 12,
    `${Math.min(...faktoren).toFixed(2)}× bis ${Math.max(...faktoren).toFixed(2)}×`,
  );
  pruefe(
    'das Bezugsmandala selbst liegt bei eins',
    Math.abs((aus.jeMandala.find((m) => m.id === 'rosette6')?.faktor ?? 0) - 1) < 0.35,
    `${(aus.jeMandala.find((m) => m.id === 'rosette6')?.faktor ?? 0).toFixed(2)}×`,
  );

  console.log('\nDie Gegenprobe an ungemessenen Punkten:');
  /*
   * Wieviele Punkte die Gegenprobe schafft, haengt am Geraet: Was zu teuer
   * ist, wird uebersprungen und faellt heraus - vergleichen liesse sich dort
   * nur eine Schaetzung mit sich selbst. Zwei sind wenig, aber sie sind eine
   * Aussage; null waeren keine.
   */
  pruefe('sie ist gelaufen', aus.abweichungen.length >= 2, `${aus.abweichungen.length} Punkte`);
  const mittlere = [...aus.abweichungen].sort((a, b) => a - b)[Math.floor(aus.abweichungen.length / 2)];
  /*
   * Die Schwelle ist bewusst weit: Hier rechnet ein Nachbau in Software, der
   * unter Last seine eigene Geschwindigkeit aendert. Geprueft wird, dass das
   * Modell ueberhaupt in der Naehe liegt - ob es gut ist, sagt die Zahl, die
   * der Messstand selbst ausweist, und die liest, wer davorsteht.
   */
  pruefe('und das Modell liegt nicht voellig daneben', mittlere < 0.6,
    `${(mittlere * 100).toFixed(0)} % Abweichung im Median`);

  console.log('\nDer Durchsatz - die vergleichbare Zahl:');
  pruefe('er ist da und positiv', aus.durchsatz > 0,
    `${aus.durchsatz.toFixed(2)} Mio. Punkt-Schritte/ms`);

  console.log('\nDie Empfehlung kommt in der Buehne an:');
  await seite.click('#uebernehmen');
  const gemerkt = await seite.evaluate(() => ({
    mandalas: JSON.parse(localStorage.getItem('djMandalas') ?? 'null'),
    guete: localStorage.getItem('dj-bildguete'),
  }));
  pruefe('eine Mandala-Auswahl liegt im Browser', Array.isArray(gemerkt.mandalas) && gemerkt.mandalas.length > 0,
    `${gemerkt.mandalas?.length ?? 0} Mandalas`);
  pruefe('und eine Guetestufe', ['hoch', 'mittel', 'niedrig'].includes(gemerkt.guete), String(gemerkt.guete));
  /*
   * Und die Buehne muss damit auch etwas anfangen koennen. Eine Kennung, die
   * der Messstand schreibt und die Buehne nicht kennt, waere ein stiller
   * Fehler: Die Auswahl faellt beim Laden durch das Sieb, und es sieht aus,
   * als haette die Uebernahme nichts getan.
   */
  const bekannt = await seite.evaluate(async (ids) => {
    const { MANDALAS } = await import('/gemeinsam/visualmodi.js');
    const alle = new Set(MANDALAS.map((m) => m.id));
    return ids.filter((id) => !alle.has(id));
  }, gemerkt.mandalas ?? []);
  pruefe('jede uebernommene Kennung kennt die Buehne', bekannt.length === 0, bekannt.join(', '));

  console.log('\nDer Bericht:');
  const bericht = await seite.evaluate(() => window.__messstand.bericht);
  for (const stueck of ['Karte', 'Bildtakt', 'Tiefenkurve', 'Durchsatz', 'Gegenprobe']) {
    pruefe(`er nennt "${stueck}"`, bericht.includes(stueck));
  }

  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
