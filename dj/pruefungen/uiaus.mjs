// Abnahme fuer das Ausblenden der Oberflaeche.
//
//   DJ_PORT=3200 node dj/server/index.js &
//   DJ_ADRESSE=http://localhost:3200 node dj/pruefungen/uiaus.mjs
//
// Diese Abnahme gibt es aus einem Grund: Der Schalter kann jemanden
// aussperren. Er blendet die Oberflaeche aus, in der er selbst liegt, und er
// merkt sich das ueber einen Neustart hinweg - der Griff, der sonst immer
// hilft, hilft hier also nicht mehr.
//
// Deshalb wird nicht nur geprueft, dass das Ausblenden funktioniert, sondern
// vor allem, dass *jeder einzelne* Rueckweg funktioniert:
//
//   1. Ausgeblendet ist wirklich alles weg - und das Bild laeuft weiter.
//   2. Der Stand ueberlebt einen Neustart. (Das ist die Absicht, nicht der
//      Fehler - aber es ist auch das, was den Rueckweg noetig macht.)
//   3. Taste U holt zurueck.
//   4. Escape holt zurueck - auch das ist gewollt: eine Taste, die nur in eine
//      Richtung wirkt, muss man sich nicht als Umschalter merken.
//   5. Dreimal in die Ecke tippen holt zurueck. Das ist der Weg fuers iPad,
//      auf dem keine Tastatur haengt.
//   6. Zweimal tippen holt *nicht* zurueck. Sonst reicht ein versehentlicher
//      Doppeltipper, und der Zweck ist dahin.
//   7. Die Steuerung kommt bei einer Mausbewegung nicht zurueck. Sonst hiesse
//      "dauerhaft ausgeblendet" in Wahrheit "bis jemand die Maus bewegt".
//   8. `?ui=aus` und `?ui=an` wirken - der Weg fuer eine Verknuepfung oder
//      einen Kioskmodus, und der letzte Rueckweg, wenn gar nichts mehr geht.

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
const seite = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const konsole = [];
seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
seite.on('console', (n) => {
  if (n.type() === 'error') konsole.push(n.text());
});

// Ist die Oberflaeche zu sehen? Gemessen am gerechneten Stil und nicht an
// einer Klasse - eine Klasse zu setzen ist noch kein Ausblenden.
const sichtbar = () => seite.evaluate(() => {
  const k = document.getElementById('konsole');
  return !k.hidden && getComputedStyle(k).display !== 'none';
});

/*
 * Gewartet wird auf das Attribut und nicht auf die Sichtbarkeit: Genau hier
 * geht es ja darum, dass die Oberflaeche unsichtbar ist, obwohl die Buehne
 * laeuft. Ein `waitForSelector` mit der Vorgabe "sichtbar" liefe im
 * ausgeblendeten Zustand jedes Mal in seinen Zeitablauf.
 */
const starten = async (suffix = '') => {
  await seite.goto(`${ADRESSE}/buehne${suffix}`, { waitUntil: 'networkidle' });
  await seite.click('#startDemo');
  await seite.waitForFunction(
    () => !document.getElementById('konsole').hasAttribute('hidden'),
    null,
    { timeout: 120000 },
  );
  /*
   * Und dann warten, bis das Bild wirklich etwas zeichnet.
   *
   * Zwischen "die Konsole ist da" und dem ersten fertigen Bild liegen ein
   * paar Sekunden - der Fraktalrechner baut seine Programme. Ohne dieses
   * Warten mass die Pruefung "das Bild laeuft weiter" in zwei von drei
   * Laeufen eine schwarze Leinwand und meldete einen Fehler, den es nicht
   * gab. Gewartet wird auf das Ergebnis und nicht auf eine feste Zeit, damit
   * es auf einem langsameren Geraet nicht wieder knapp wird.
   */
  await seite.waitForFunction(() => {
    const lein = document.getElementById('visual');
    const k = document.createElement('canvas');
    k.width = 64; k.height = 40;
    const st = k.getContext('2d', { willReadFrequently: true });
    st.drawImage(lein, 0, 0, 64, 40);
    const d = st.getImageData(0, 0, 64, 40).data;
    let summe = 0;
    for (let i = 0; i < d.length; i += 4) summe += d[i] + d[i + 1] + d[i + 2];
    return summe / (d.length / 4) > 6;
  }, null, { timeout: 60000 });
  // Und ein Moment fuer den Hinweis, der beim Start eingeblendet wird.
  await seite.waitForTimeout(300);
};

try {
  await starten();
  pruefe('vor dem Ausblenden ist die Oberflaeche da', await sichtbar());

  console.log('\nDer Knopf blendet alles aus:');
  await seite.evaluate(() => document.getElementById('uiAus').click());
  await seite.waitForTimeout(300);
  pruefe('die Oberflaeche ist weg', !(await sichtbar()));
  /*
   * Das Bild muss weiterlaufen. Ausgeblendet werden soll die Bedienung, nicht
   * die Sache selbst - und ein Fehler beim Ausblenden koennte die Schleife
   * genauso gut anhalten, ohne dass man es an der Oberflaeche saehe.
   */
  const bewegt = await seite.evaluate(async () => {
    const lein = document.getElementById('visual');
    const k = document.createElement('canvas');
    k.width = 128; k.height = 80;
    const st = k.getContext('2d', { willReadFrequently: true });
    /*
     * Abgegriffen wird im Bildtakt und nicht irgendwann.
     *
     * Die Leinwand ist eine WebGL-Leinwand ohne `preserveDrawingBuffer`: Nach
     * dem Zusammensetzen ist ihr Zeichenpuffer leer, und ein drawImage zu
     * einem beliebigen Zeitpunkt liefert Schwarz. Beide Aufnahmen waeren dann
     * gleich, und die Pruefung meldete "das Bild steht" - obwohl es laeuft.
     * Genau das ist beim ersten Anlauf passiert.
     */
    const imTakt = () => new Promise((f) => requestAnimationFrame(() => {
      st.drawImage(lein, 0, 0, 128, 80);
      f(st.getImageData(0, 0, 128, 80).data);
    }));
    const a = await imTakt();
    await new Promise((f) => setTimeout(f, 700));
    const b = await imTakt();
    let anders = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 12) anders++;
    }
    return anders / (a.length / 4);
  });
  pruefe('das Bild laeuft weiter', bewegt > 0.1, `${(bewegt * 100).toFixed(0)} % der Punkte geaendert`);
  pruefe('der Mauszeiger ist mit weg',
    await seite.evaluate(() => getComputedStyle(document.body).cursor === 'none'));

  console.log('\nEine Mausbewegung holt die Steuerung nicht zurueck:');
  await seite.mouse.move(500, 300);
  await seite.mouse.move(520, 320);
  await seite.waitForTimeout(400);
  pruefe('die Oberflaeche bleibt weg', !(await sichtbar()));
  pruefe('und die Steuerung ist nicht auf sichtbar gestellt',
    await seite.evaluate(() => !document.getElementById('steuerung').classList.contains('sichtbar')));

  console.log('\nDer Stand ueberlebt einen Neustart:');
  await starten();
  pruefe('nach dem Neuladen immer noch ausgeblendet', !(await sichtbar()));
  pruefe('und der Hinweis auf den Rueckweg steht im Bild',
    await seite.evaluate(() => {
      const h = document.getElementById('uiHinweis');
      return !h.hidden && Number(getComputedStyle(h).opacity) > 0.5;
    }));

  console.log('\nDrei Wege zurueck, und zwei davon ohne Tastatur:');
  // 1. Taste U.
  await seite.keyboard.press('u');
  await seite.waitForTimeout(300);
  pruefe('Taste U holt zurueck', await sichtbar());
  await seite.keyboard.press('u');
  await seite.waitForTimeout(300);
  pruefe('und blendet wieder aus', !(await sichtbar()));

  // 2. Escape.
  await seite.keyboard.press('Escape');
  await seite.waitForTimeout(300);
  pruefe('Escape holt zurueck', await sichtbar());

  // 3. Die Ecke - der Weg fuers iPad.
  await seite.evaluate(() => document.getElementById('uiAus').click());
  await seite.waitForTimeout(300);
  const ecke = await seite.evaluate(() => {
    const r = document.getElementById('uiEcke').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, breit: r.width, hoch: r.height };
  });
  // Gross genug, um sie im Dunkeln zu treffen.
  pruefe('die Ecke ist ein grosses Ziel', ecke.breit >= 100 && ecke.hoch >= 100,
    `${Math.round(ecke.breit)}x${Math.round(ecke.hoch)} Bildpunkte`);
  await seite.mouse.click(ecke.x, ecke.y);
  await seite.mouse.click(ecke.x, ecke.y);
  await seite.waitForTimeout(200);
  pruefe('zwei Tipper reichen nicht', !(await sichtbar()));
  await seite.mouse.click(ecke.x, ecke.y);
  await seite.waitForTimeout(300);
  pruefe('drei Tipper holen zurueck', await sichtbar());

  /*
   * Und der Doppeltipper darf sich nicht ueber Minuten aufsummieren. Geprueft
   * mit zwei Tippern, einer Pause laenger als das Fenster, und einem dritten.
   */
  await seite.evaluate(() => document.getElementById('uiAus').click());
  await seite.waitForTimeout(300);
  await seite.mouse.click(ecke.x, ecke.y);
  await seite.mouse.click(ecke.x, ecke.y);
  await seite.waitForTimeout(2300);
  await seite.mouse.click(ecke.x, ecke.y);
  await seite.waitForTimeout(300);
  pruefe('ein Tipper nach einer Pause faengt von vorn an', !(await sichtbar()));

  console.log('\nUeber die Adresse, fuer eine Verknuepfung oder den Kioskmodus:');
  await starten('?ui=an');
  pruefe('?ui=an holt zurueck', await sichtbar());
  await starten('?ui=aus');
  pruefe('?ui=aus blendet aus', !(await sichtbar()));
  // Und der Stand ist mitgeschrieben - ohne Parameter bleibt es aus.
  await starten();
  pruefe('und schreibt den Stand mit', !(await sichtbar()));
  await starten('?ui=an');

  console.log('');
  pruefe('keine Konsolenfehler', konsole.length === 0, konsole.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlles gruen.');
process.exit(fehler ? 1 : 0);
