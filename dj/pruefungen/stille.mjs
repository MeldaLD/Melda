// Abnahme der Stille im Bild.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/stille.mjs
//
// Wenn im Stueck nichts los ist, darf auch im Bild nichts los sein. Das
// klingt nach einer Kleinigkeit und ist die riskanteste Aenderung am ganzen
// Bild: Ein Fehler darin heisst nicht "sieht etwas anders aus", sondern
// "Beamer aus" - und zwar mitten auf einer Party, wo niemand in den Code
// schaut. Deshalb wird hier nicht geprueft, ob es dunkel werden *kann*,
// sondern ob es zuverlaessig wieder hell wird.
//
// Vier Dinge muessen stimmen:
//
//   1. Im Breakdown wird es dunkel - sonst waere die ganze Sache umsonst.
//   2. Auf dem Drop ist das Bild *wieder da*, und zwar genau dort. Nicht
//      vorher (dann fehlt die Wirkung) und nicht nachher (dann kommt der
//      staerkste Moment der Musik im Dunkeln).
//   3. Beim Aufblenden waechst es weich zurueck, beim Einschlag schlagartig.
//      Beides ist gewollt; was nicht gewollt ist, waere die Umkehrung.
//   4. Und der Fall, an dem die Stundenmixe haengen: Eine Breakdown-Marke,
//      auf die keine weitere Marke folgt, darf das Bild nicht minutenlang
//      dunkel lassen. In einem einstuendigen Mix findet die Analyse
//      stellenweise lange keine Marke - ohne Deckel waere die "Laenge des
//      Breakdowns" dann vierhundert Beats.
//
// Geprueft wird gegen einen gebauten Ablauf, nicht gegen echte Musik: Nur so
// ist bekannt, wo der Drop *wirklich* liegt, und nur dann heisst "das Bild
// ist auf dem Drop zurueck" etwas.

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
const seite = await browser.newPage();
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => {
  if (n.type() === 'error') konsole.push(n.text());
});

try {
  await seite.goto(`${ADRESSE}/`, { waitUntil: 'domcontentloaded' });

  /*
   * Der Ablauf wird von Hand gedreht, Bild fuer Bild.
   *
   * Der Modus wird direkt aufgerufen, ohne Decks, ohne Ton und ohne Uhr. Das
   * ist kein Behelf, sondern der Punkt: Mit echter Musik waere der Drop
   * ungefaehr dort, wo die Analyse ihn vermutet, und die Aussage "das Bild ist
   * auf dem Drop zurueck" haette die Genauigkeit der Analyse statt der des
   * Bildes. Hier liegt der Drop dort, wo dieses Skript ihn hinlegt.
   */
  const laeufe = await seite.evaluate(async () => {
    const { MODI, leereBericht, leereZuruecksetzen } = await import('/gemeinsam/visualmodi.js');
    const leinwand = document.createElement('canvas');
    leinwand.width = 320;
    leinwand.height = 200;
    const stift = leinwand.getContext('2d');
    const palette = { grund: '#101018', licht: '#8fe', warm: '#fd6', kalt: '#4af' };

    const SCHRITT = 1 / 60;

    /**
     * Einen Abschnitt abspielen.
     *
     * @param {object} plan  wie viele Sekunden, und wie sich abbau, spannung,
     *                       wucht und drop ueber die Zeit verhalten
     */
    function spielen(plan) {
      const spur = [];
      const bilder = Math.round(plan.sekunden / SCHRITT);
      for (let i = 0; i < bilder; i++) {
        const t = i * SCHRITT;
        const lage = {
          breite: 320,
          hoehe: 200,
          zeit: (plan.ab ?? 0) + t,
          sekunden: SCHRITT,
          spektrum: null,
          welle: new Float32Array(0),
          // Zwei Schlaege je Sekunde - 120 BPM. Dieselben Felder wie
          // taktLage() in visual.js liefert; ein anderer Name reicht schon,
          // damit das Bild NaN rechnet.
          takt: (() => {
            const beat = ((plan.ab ?? 0) + t) * 2;
            return {
              beat,
              imBeat: beat - Math.floor(beat),
              nummer: Math.floor(beat),
              aufEins: Math.floor(beat) % 4 === 0,
              aufPhrase: Math.floor(beat) % 32 === 0,
            };
          })(),
          spannung: plan.spannung(t),
          wucht: plan.wucht(t),
          drop: plan.drop(t),
          abbau: plan.abbau(t),
          dropInSicht: plan.dropInSicht ?? true,
          guetestufe: 'niedrig',
          palette,
          paletteB: null,
          anteilB: 0,
        };
        MODI.mandelbrot.zeichne(stift, lage);
        spur.push({ t, ...leereBericht(), abbau: lage.abbau, spannung: lage.spannung });
      }
      return spur;
    }

    const ergebnis = {};

    /*
     * Ein Breakdown von 16 s, danach ein Drop. Die Spannung steigt in den
     * letzten 8 s auf 1 - so, wie sie es auf der Buehne aus den Marken tut.
     */
    const bogen = (dauer, dropBei) => ({
      sekunden: dauer,
      abbau: (t) => (t < dropBei ? Math.max(0, 1 - Math.pow(t / dropBei, 2) * 0.4) : 0),
      spannung: (t) => Math.min(1, Math.max(0, (t - (dropBei - 8)) / 8) ** 2),
      wucht: (t) => (t < dropBei ? 0.04 : 0.7),
      drop: (t) => t >= dropBei && t < dropBei + 1 / 60,
    });

    // Zwei Durchlaeufe hintereinander: Die Art wechselt beim Eintritt ab,
    // also liefert der erste die eine und der zweite die andere.
    leereZuruecksetzen();
    // Vorlauf mit Musik, damit der Eintritt in den Breakdown ein echter
    // Wechsel ist und nicht der Startzustand.
    spielen({
      sekunden: 3,
      abbau: () => 0,
      spannung: () => 0,
      wucht: () => 0.6,
      drop: () => false,
    });
    ergebnis.ersterBogen = spielen(bogen(20, 16));
    spielen({
      sekunden: 4,
      abbau: () => 0,
      spannung: () => 0,
      wucht: () => 0.6,
      drop: () => false,
    });
    ergebnis.zweiterBogen = spielen(bogen(20, 16));

    // Volle Fahrt: Hier darf nie etwas dunkel werden.
    leereZuruecksetzen();
    ergebnis.vollgas = spielen({
      sekunden: 20,
      abbau: () => 0,
      spannung: (t) => (t % 10) / 10,
      wucht: () => 0.55,
      drop: () => false,
    });

    // Eine gemessene Flaute ohne jede Marke - Intro, Ambientstelle, Pause.
    leereZuruecksetzen();
    ergebnis.flaute = spielen({
      sekunden: 24,
      abbau: () => 0,
      spannung: () => 0,
      wucht: (t) => (t < 14 ? 0.02 : 0.6),
      drop: () => false,
    });

    /*
     * Der Stundenmix-Fall: Breakdown-Marke, aber weit und breit kein Drop.
     * Der Abbau klingt dann von selbst ab (der Deckel in abbauBei sorgt
     * dafuer), und das Bild muss zurueckkommen, ohne dass irgendetwas es
     * zurueckholt.
     */
    leereZuruecksetzen();
    spielen({
      sekunden: 3,
      abbau: () => 0,
      spannung: () => 0,
      wucht: () => 0.6,
      drop: () => false,
    });
    ergebnis.ohneDrop = spielen({
      sekunden: 70,
      // 128 Beats bei 120 BPM sind 64 s - so lange braucht der gedeckelte
      // Abbau, um auszuklingen.
      abbau: (t) => Math.max(0, 1 - Math.pow(t / 64, 2)),
      spannung: () => 0,
      wucht: () => 0.5,
      drop: () => false,
      dropInSicht: false,
    });

    return ergebnis;
  });

  const tiefstens = (spur, von, bis) =>
    Math.max(...spur.filter((p) => p.t >= von && p.t <= bis).map((p) => p.leere));
  const beiZeit = (spur, t) => spur.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));

  console.log('\nIm Breakdown wird es dunkel:');
  for (const [name, spur] of [
    ['erster Bogen', laeufe.ersterBogen],
    ['zweiter Bogen', laeufe.zweiterBogen],
  ]) {
    const art = spur[0].art;
    const dunkelst = tiefstens(spur, 2, 12);
    pruefe(
      `${name} (${art}): das Bild geht wirklich zurueck`,
      dunkelst > 0.75,
      `dunkelster Stand ${dunkelst.toFixed(2)} von 0.94`,
    );
  }

  console.log('\nAuf dem Drop ist das Bild zurueck:');
  for (const [name, spur] of [
    ['erster Bogen', laeufe.ersterBogen],
    ['zweiter Bogen', laeufe.zweiterBogen],
  ]) {
    const amDrop = beiZeit(spur, 16 + 1 / 30);
    pruefe(
      `${name} (${spur[0].art}): auf dem Schlag ist frei`,
      amDrop.leere < 0.05,
      `Stand ${amDrop.leere.toFixed(3)}`,
    );
    const danach = spur.filter((p) => p.t > 16.1 && p.t < 19);
    pruefe(
      `${name}: und bleibt frei`,
      danach.every((p) => p.leere < 0.08),
      `hoechster Stand danach ${Math.max(...danach.map((p) => p.leere)).toFixed(3)}`,
    );
  }

  console.log('\nAufblenden und Einschlag sind zwei verschiedene Sachen:');
  {
    const arten = [laeufe.ersterBogen[0].art, laeufe.zweiterBogen[0].art];
    pruefe(
      'zwei Breakdowns hintereinander bekommen verschiedene Rueckwege',
      arten[0] !== arten[1],
      arten.join(' / '),
    );
    const weich = arten[0] === 'aufblenden' ? laeufe.ersterBogen : laeufe.zweiterBogen;
    const hart = arten[0] === 'einschlag' ? laeufe.ersterBogen : laeufe.zweiterBogen;

    /*
     * Der Unterschied wird an der Sekunde vor dem Drop gemessen, nicht am
     * Endstand: Beide enden bei null, das ist ja der Sinn. Verschieden ist,
     * *wann* sie dorthin kommen.
     */
    const weichVorher = beiZeit(weich, 15).leere;
    const hartVorher = beiZeit(hart, 15).leere;
    pruefe(
      'Aufblenden ist eine Sekunde vor dem Drop schon weitgehend da',
      weichVorher < 0.3,
      `Stand ${weichVorher.toFixed(2)}`,
    );
    pruefe(
      'Einschlag ist eine Sekunde vor dem Drop noch dunkel',
      hartVorher > 0.6,
      `Stand ${hartVorher.toFixed(2)}`,
    );
    const blitz = Math.max(...hart.filter((p) => p.t > 16 && p.t < 17).map((p) => p.einschlag));
    pruefe('und quittiert den Schlag mit einem Aufblitzen', blitz > 0.5, `Blitz ${blitz.toFixed(2)}`);
  }

  console.log('\nBei voller Fahrt bleibt das Bild an:');
  {
    const hoechst = Math.max(...laeufe.vollgas.map((p) => p.leere));
    pruefe('nichts wird dunkel, wenn nichts dunkel sein soll', hoechst < 0.02, `hoechstens ${hoechst.toFixed(3)}`);
  }

  console.log('\nEine Flaute ohne Marke wird trotzdem erkannt:');
  {
    const spur = laeufe.flaute;
    const inDerFlaute = tiefstens(spur, 10, 13.5);
    pruefe('nach ein paar stillen Sekunden geht das Bild zurueck', inDerFlaute > 0.5,
      `Stand ${inDerFlaute.toFixed(2)}`);
    const wiederDa = spur.filter((p) => p.t > 18);
    pruefe(
      'und kommt zurueck, sobald wieder etwas laeuft',
      wiederDa.every((p) => p.leere < 0.05),
      `hoechster Stand ${Math.max(...wiederDa.map((p) => p.leere)).toFixed(3)}`,
    );
  }

  console.log('\nStundenmix: Breakdown ohne Drop dahinter:');
  {
    const spur = laeufe.ohneDrop;
    pruefe(
      'ohne Drop in Sicht wird nicht auf den Einschlag gewartet',
      spur[0].art === 'aufblenden',
      spur[0].art,
    );
    /*
     * Die eigentliche Zusage: Es bleibt nicht dunkel. Wie lange am Stueck,
     * wird gemessen und mit der Musik verglichen - 128 Beats sind bei 120 BPM
     * 64 Sekunden, und laenger darf keine Dunkelheit ohne Marke dauern.
     */
    let laengste = 0;
    let laufend = 0;
    for (const p of spur) {
      if (p.leere > 0.5) laufend += 1 / 60;
      else laufend = 0;
      laengste = Math.max(laengste, laufend);
    }
    pruefe(
      'das Bild bleibt nicht laenger als der Breakdown dunkel',
      laengste < 66,
      `laengste Dunkelheit ${laengste.toFixed(1)} s`,
    );
    const amEnde = spur[spur.length - 1].leere;
    pruefe('und ist am Ende von selbst wieder da', amEnde < 0.05, `Stand ${amEnde.toFixed(3)}`);
  }

  /*
   * Und der Deckel selbst, direkt gemessen: Eine Marke ohne Nachfolgerin darf
   * keinen dreiminuetigen Breakdown ergeben.
   */
  console.log('\nDer Deckel auf der Breakdown-Laenge:');
  const deckel = await seite.evaluate(async () => {
    const { Visualisierung } = await import('/gemeinsam/visual.js');
    const abbauBei = Visualisierung.prototype.abbauBei;
    const dropVoraus = Visualisierung.prototype.dropVoraus;
    // Ein Mix, in dem nach der Breakdown-Marke vierhundert Beats lang nichts
    // mehr eingetragen ist - genau der Fall aus den Stundenmixen.
    const deck = { track: { marken: [{ name: 'breakdown', beat: 1000 }, { name: 'drop', beat: 1400 }] } };
    const werte = [];
    for (let beat = 1000; beat <= 1400; beat += 8) {
      werte.push({ beat, abbau: abbauBei.call({}, deck, { beat }) });
    }
    return {
      werte,
      dropWeit: dropVoraus.call({}, deck, { beat: 1000 }),
      dropNah: dropVoraus.call({}, deck, { beat: 1350 }),
    };
  });
  const nochImAbbau = deckel.werte.filter((w) => w.abbau > 0.35);
  const letzter = nochImAbbau.length ? nochImAbbau[nochImAbbau.length - 1].beat : 1000;
  pruefe(
    'eine Marke ohne Nachfolgerin ergibt hoechstens 32 Takte Breakdown',
    letzter - 1000 <= 128,
    `noch im Abbau bis Beat +${letzter - 1000}`,
  );
  pruefe('ein Drop 400 Beats voraus gilt als ausser Sicht', deckel.dropWeit > 192,
    `${deckel.dropWeit} Beats`);
  pruefe('einer 50 Beats voraus gilt als in Sicht', deckel.dropNah <= 192, `${deckel.dropNah} Beats`);

  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler === 0 ? '\nAlles gruen.\n' : `\n${fehler} Abweichung(en).\n`);
process.exit(fehler === 0 ? 0 : 1);
