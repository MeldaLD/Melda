// Aus einer Zeichnung einen verformbaren Umriss machen.
//
//   node werkzeuge/schattenumriss.mjs [quelle]
//
// Die Eingabe ist *eine* Zeichnung: eine schwarze Silhouette auf weissem
// Grund. Heraus kommt ein geschlossener Streckenzug - die Punktfolge des
// Umrisses -, den der Zeichner an einem Skelett verformt.
//
// --- Warum ueberhaupt ein Umriss --------------------------------------------
//
// Der Vorgaenger setzte die Figur aus fuenf einzeln gezeichneten Teilen
// zusammen. Das ergab zwei Schultern uebereinander, harte Naehte an den
// Gelenken und vier verschiedene Strichstaerken - etwas, das *fast* wie ein
// Mensch aussieht und deshalb unheimlich wirkt.
//
// Ein Umriss hat diese Fehler nicht, weil er *eine* Form ist. Verformt wird
// er wie in der Spielebranche ueblich: Jeder Punkt gehoert anteilig zu einem
// oder mehreren Knochen und wandert mit ihnen (lineare Mischhaut). Der teure
// Teil eines solchen Verfahrens - Texturkoordinaten, Dreiecksnetz,
// Schattierer - faellt hier weg, denn eine Silhouette hat keine
// Innenzeichnung. Zu bewegen sind nur die Randpunkte.
//
// --- Wie der Umriss gefunden wird -------------------------------------------
//
// Marschierende Quadrate. Ueber das Schwarzweissbild laeuft ein Gitter aus
// 2x2-Zellen; je nachdem, welche der vier Ecken innen liegen, entsteht in der
// Zelle ein Randstueck. Die Stuecke werden zu Schleifen verkettet.
//
// Der Vorzug gegenueber einer Randverfolgung: Loecher kommen von selbst
// heraus. Zwischen Kopfhoererbuegel und Schaedel liegt ein eingeschlossenes
// weisses Feld - als eigene Schleife gezeichnet und mit der
// Gerade-Ungerade-Regel gefuellt, wird daraus automatisch ein Loch. Es
// braucht keine Unterscheidung zwischen Aussenrand und Innenrand.
//
// Danach Douglas-Peucker: Aus zwanzigtausend Treppenpunkten werden ein paar
// hundert, die dieselbe Form beschreiben. Das ist keine Sparmassnahme am
// falschen Ende - jeder Punkt kostet in jedem Bild eine Verformung.

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const ADRESSE = process.env.DJ_ADRESSE ?? 'http://localhost:3000';
const CHROM = process.env.CHROMIUM_PFAD;
const QUELLE = path.resolve(process.argv[2] ?? 'werkzeuge/schattenquellen/figur.jpeg');
const ZIEL = path.resolve('public/gemeinsam/schattenumriss.js');

// Auf diese Hoehe wird vor dem Verfolgen verkleinert. Feiner bringt nichts:
// Die Zeichnung hat keine Einzelheiten unter einem halben Prozent ihrer Hoehe,
// und jeder zusaetzliche Punkt kostet spaeter Rechenzeit in jedem Bild.
const ARBEITSHOEHE = 520;
// Wie stark vereinfacht wird, in Bildpunkten der Arbeitshoehe.
const GENAUIGKEIT = 0.65;
// Schleifen unter dieser Laenge sind Staub aus der JPEG-Kompression.
const KLEINSTE_SCHLEIFE = 24;

const browser = await chromium.launch({
  ...(CHROM ? { executablePath: CHROM } : {}),
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage({ viewport: { width: 400, height: 300 } });

let aus;
try {
  await seite.goto(`${ADRESSE}/buehne`, { waitUntil: 'domcontentloaded' });
  const roh = await fs.readFile(QUELLE);
  const art = QUELLE.endsWith('.png') ? 'image/png' : 'image/jpeg';

  aus = await seite.evaluate(
    async ({ quelle, arbeitshoehe, genauigkeit, kleinste }) => {
      const bild = new Image();
      bild.src = quelle;
      await bild.decode();

      const f = arbeitshoehe / bild.naturalHeight;
      const b = Math.round(bild.naturalWidth * f);
      const h = arbeitshoehe;
      const lein = document.createElement('canvas');
      lein.width = b;
      lein.height = h;
      const st = lein.getContext('2d', { willReadFrequently: true });
      st.imageSmoothingQuality = 'high';
      st.drawImage(bild, 0, 0, b, h);
      const d = st.getImageData(0, 0, b, h).data;

      /*
       * Innen oder aussen. Eine harte Schwelle, und das ist hier richtig:
       * Der Umriss wird gleich ohnehin vereinfacht, weiche Kanten haetten an
       * einem Streckenzug keine Entsprechung.
       */
      const drin = new Uint8Array(b * h);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        drin[p] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < 128 ? 1 : 0;
      }
      const gitter = (x, y) => (x < 0 || y < 0 || x >= b || y >= h ? 0 : drin[y * b + x]);

      /*
       * Der Rand als gerichtete Kanten auf dem Punktgitter.
       *
       * Der erste Anlauf waren marschierende Quadrate mit Kantenmitten. Er
       * lieferte dreizehn Bruchstuecke statt geschlossener Schleifen, das
       * laengste mit einunddreissig Punkten - die Verkettung brach ab, weil
       * die Richtung der Randstuecke aus der Falltabelle nicht durchgehend
       * gleich herum war.
       *
       * Dieses Verfahren *kann* nicht abbrechen. Fuer jeden Bildpunkt, der
       * innen liegt, wird jede Seite, hinter der aussen liegt, zu einer
       * gerichteten Kante entlang des Punktrasters - immer so herum, dass das
       * Innere links liegt. An jedem Gitterpunkt kommen dann genauso viele
       * Kanten an wie abgehen, und wer einer Kante folgt, landet
       * zwangslaeufig wieder am Anfang. Aussenrand und Loch fallen dabei
       * gleichermassen an; welches von beidem eine Schleife ist, muss niemand
       * entscheiden, weil die Gerade-Ungerade-Regel es beim Fuellen ohnehin
       * richtig macht.
       *
       * Herauskommt eine Treppe auf ganzen Zahlen. Die glaettet der naechste
       * Schritt.
       */
      const von = new Map();
      const legen = (ax, ay, ex, ey) => {
        const s = `${ax},${ay}`;
        if (!von.has(s)) von.set(s, []);
        von.get(s).push([ex, ey]);
      };
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < b; x++) {
          if (!gitter(x, y)) continue;
          // Reihenfolge der vier Seiten so, dass das Innere links liegt.
          if (!gitter(x, y - 1)) legen(x + 1, y, x, y);
          if (!gitter(x - 1, y)) legen(x, y, x, y + 1);
          if (!gitter(x, y + 1)) legen(x, y + 1, x + 1, y + 1);
          if (!gitter(x + 1, y)) legen(x + 1, y + 1, x + 1, y);
        }
      }

      const schleifen = [];
      for (const [start, ziele] of von) {
        while (ziele.length) {
          const [sx, sy] = start.split(',').map(Number);
          const punkte = [[sx, sy]];
          let [x, y] = ziele.pop();
          let sicher = 0;
          while ((x !== sx || y !== sy) && sicher++ < 500000) {
            punkte.push([x, y]);
            const liste = von.get(`${x},${y}`);
            if (!liste || !liste.length) break;
            [x, y] = liste.pop();
          }
          if (punkte.length >= kleinste) schleifen.push(punkte);
        }
      }

      /*
       * Douglas-Peucker: die Punkte wegwerfen, die nichts erzaehlen.
       *
       * Ausgeschrieben statt Bibliothek - es sind zwoelf Zeilen, und eine
       * Abhaengigkeit fuer zwoelf Zeilen waere in einer Datei, die als
       * Einzeldatei ausgeliefert wird, das schlechtere Geschaeft.
       */
      const vereinfachen = (pkt, eps) => {
        if (pkt.length < 3) return pkt;
        const behalten = new Uint8Array(pkt.length);
        behalten[0] = 1;
        behalten[pkt.length - 1] = 1;
        const stapel = [[0, pkt.length - 1]];
        while (stapel.length) {
          const [a, e] = stapel.pop();
          const [ax, ay] = pkt[a];
          const [ex, ey] = pkt[e];
          const dx = ex - ax;
          const dy = ey - ay;
          const laenge = Math.hypot(dx, dy) || 1e-9;
          let weit = 0;
          let wo = -1;
          for (let i = a + 1; i < e; i++) {
            const abstand = Math.abs((pkt[i][0] - ax) * dy - (pkt[i][1] - ay) * dx) / laenge;
            if (abstand > weit) { weit = abstand; wo = i; }
          }
          if (weit > eps && wo > 0) {
            behalten[wo] = 1;
            stapel.push([a, wo], [wo, e]);
          }
        }
        return pkt.filter((_, i) => behalten[i]);
      };

      const fertig = schleifen
        .map((s) => vereinfachen(s, genauigkeit))
        .filter((s) => s.length >= 8)
        .sort((a, b2) => b2.length - a.length);

      // Auf die Hoehe der Figur normieren: alles spaeter Gerechnete haengt an
      // ihr, nicht an der Groesse der Zeichnung.
      let lx = 1e9, ly = 1e9, rx = -1e9, ry = -1e9;
      for (const s of fertig) for (const [x, y] of s) {
        if (x < lx) lx = x; if (x > rx) rx = x;
        if (y < ly) ly = y; if (y > ry) ry = y;
      }
      const hoehe = ry - ly;
      const mitteX = (lx + rx) / 2;
      const normiert = fertig.map((s) =>
        s.map(([x, y]) => [(x - mitteX) / hoehe, (y - ly) / hoehe]),
      );

      /*
       * Was welche Schleife ist - und das ist ein Geschenk der Zeichnung.
       *
       * Erwartet hatte ich einen einzigen Umriss, aus dem die Arme per
       * Gewichtung herausgeloest werden muessen. Herausgekommen sind vier
       * *getrennte* Schleifen, weil die weisse Aermelnaht die Arme vom Rumpf
       * abschneidet. Damit ist die Trennung schon in der Zeichnung erledigt,
       * und die Naht deckt beim Drehen zugleich die Fuge ab - besser haette
       * man es nicht anlegen koennen.
       *
       * Zugeordnet wird nach Bauart, nicht nach Reihenfolge: Die groesste
       * Schleife ist der Koerper. Von den uebrigen sind die beiden, die am
       * weitesten nach unten reichen, die Arme (links und rechts nach ihrer
       * Lage); was dann noch bleibt, gehoert zum Kopf und wird mit ihm
       * gedreht - beim vorliegenden Bild der Kopfhoererbuegel.
       */
      const mass = (s) => {
        let lx2 = 1e9, rx2 = -1e9, ly2 = 1e9, ry2 = -1e9, sx = 0;
        for (const [x, y] of s) {
          if (x < lx2) lx2 = x; if (x > rx2) rx2 = x;
          if (y < ly2) ly2 = y; if (y > ry2) ry2 = y;
          sx += x;
        }
        return { lx: lx2, rx: rx2, ly: ly2, ry: ry2, mx: sx / s.length };
      };
      const masse = normiert.map(mass);

      /*
       * Die Breite einer Schleife auf einer Hoehe - als echte Schnittpunkte
       * mit den Kanten, nicht als Streuung der Eckpunkte.
       *
       * Der Unterschied ist kein Feinschliff, sondern war ein Fehler: Zuerst
       * wurden je Zeile die vorhandenen *Eckpunkte* zusammengefasst. Nach
       * Douglas-Peucker liegen auf einer langen geraden Kante aber gar keine
       * Eckpunkte mehr - in solchen Zeilen kam Breite null heraus, und die
       * Suche nach der schmalsten Stelle fand statt des Halses eine Luecke in
       * den Messdaten. Der Hals landete dadurch bei 0,185 mitten im Kiefer
       * statt bei 0,245.
       */
      const spanne = (s, y) => {
        let l = 1e9, r = -1e9;
        for (let i = 0; i < s.length; i++) {
          const [x1, y1] = s[i];
          const [x2, y2] = s[(i + 1) % s.length];
          if ((y1 <= y) === (y2 <= y)) continue;
          const x = x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
          if (x < l) l = x;
          if (x > r) r = x;
        }
        return r < l ? null : [l, r];
      };
      const breiteBei = (s, y) => {
        const p = spanne(s, y);
        return p ? p[1] - p[0] : 0;
      };
      const achseBei = (s, y) => {
        const p = spanne(s, y);
        return p ? (p[0] + p[1]) / 2 : null;
      };
      // Fein genug, dass ein Handgelenk nicht zwischen zwei Proben faellt.
      const SCHRITT = 0.002;
      const suchen = (s, von2, bis2, besser) => {
        let wert = null, wo = von2;
        for (let y = von2; y <= bis2; y += SCHRITT) {
          const w = breiteBei(s, y);
          if (w <= 0) continue;
          if (wert === null || besser(w, wert)) { wert = w; wo = y; }
        }
        return { y: wo, w: wert ?? 0 };
      };
      const weiteste = (s, a, b3) => suchen(s, a, b3, (w, v) => w > v);
      const engste = (s, a, b3) => suchen(s, a, b3, (w, v) => w < v);
      /*
       * Die Mitte einer schmalen Stelle statt ihres tiefsten Punktes.
       *
       * Ein Handgelenk ist im Umriss kein spitzes Minimum, sondern eine flache
       * Mulde: ueber fuenf Prozent der Armlaenge aendert sich die Breite um
       * weniger als ein Zehntel Bildpunkt. Welche Probe darin die kleinste
       * ist, entscheidet das Rauschen der Zeichnung. Gemessen kam links 0,829
       * heraus und rechts 0,793 - fuer zwei spiegelgleich gezeichnete Arme.
       * Die Mitte der Mulde ist stabil, der tiefste Punkt nicht.
       */
      const muldenMitte = (s, a, b3, toleranz = 1.03) => {
        const tief = engste(s, a, b3);
        let von2 = null, bis2 = null;
        for (let y = a; y <= b3; y += SCHRITT) {
          const w = breiteBei(s, y);
          if (w > 0 && w <= tief.w * toleranz) { if (von2 === null) von2 = y; bis2 = y; }
        }
        return von2 === null ? tief.y : (von2 + bis2) / 2;
      };
      const koerper = 0; // schon nach Laenge sortiert
      const rest = normiert.map((_, i) => i).filter((i) => i !== koerper);
      rest.sort((a, b2) => masse[b2].ry - masse[a].ry);
      const armIdx = rest.slice(0, 2).sort((a, b2) => masse[a].mx - masse[b2].mx);
      const zubehoer = rest.slice(2);

      const K = normiert[koerper];

      /*
       * Der Hals: die schmalste Stelle *zwischen* Kopf und Schultern.
       *
       * Oberhalb davon dreht der Kopf, unterhalb steht der Rumpf. Bei einem
       * Plateau - und der Hals ist immer eines - wird die Mitte genommen; die
       * erste gefundene Zeile waere sonst willkuerlich die oberste.
       */
      let halsY = 0.2;
      {
        const kopf = weiteste(K, 0.03, 0.28).y;
        const schulter = weiteste(K, 0.30, 0.75).y;
        halsY = muldenMitte(K, kopf + SCHRITT, schulter - SCHRITT);
      }

      /*
       * Die Gelenke je Arm - halb gemessen, halb Anatomie.
       *
       * Gemessen wird das *Handgelenk*: die schmalste Stelle zwischen
       * Armmitte und Fingerspitze. Sie ist die einzige Stelle des Armes, die
       * ein Umriss eindeutig verraet - Schulter und Ellenbogen liegen unter
       * dem Aermel beziehungsweise in einer glatten Kontur ohne Einschnuerung.
       *
       * Aus dem Handgelenk folgt der Rest ueber die menschlichen
       * Gliedmassenverhaeltnisse: Vom Schultergelenk bis zur Fingerspitze
       * liegt das Handgelenk bei 75,5 %, der Ellenbogen bei 42,3 %. Damit
       * ergibt sich das Schultergelenk rueckwaerts - und es landet dort, wo es
       * hingehoert: im Rumpf, deutlich oberhalb der Aermelnaht. Die Naht als
       * Drehpunkt zu nehmen (der naheliegende Fehler) laesst den Arm aus dem
       * Aermel klappen statt in ihm zu drehen.
       */
      const HANDGELENK_ANTEIL = 0.755;
      const ELLBOGEN_ANTEIL = 0.423;

      const armMasse = armIdx.map((i) => {
        const A = normiert[i];
        const oben = masse[i].ly;
        const unten = masse[i].ry;
        const laenge = unten - oben;
        const handgelenkY = muldenMitte(A, oben + laenge * 0.35, unten - laenge * 0.1);
        return { i, A, oben, unten, laenge, handgelenkY };
      });

      /*
       * Die Hoehe des Schultergelenks - am Rumpf gemessen, nicht am Arm.
       *
       * Der naheliegende Weg fuehrt rueckwaerts ueber das Handgelenk: Wenn es
       * bei 75,5 % der Strecke Schulter-Fingerspitze liegt, laesst sich die
       * Schulter ausrechnen. Der Weg ist verworfen, und zwar gemessen: Sein
       * Hebel ist 1/(1-0,755) = 4,1, ein Messfehler von einem Prozent der
       * Figurenhoehe wird zu vier. Die beiden spiegelgleich gezeichneten Arme
       * lieferten so 0,357 und 0,210 fuer dieselbe Schulter, und selbst
       * gemittelt landete sie bei 0,288 - ausserhalb des Rumpfes, der dort nur
       * 0,098 breit ist. Ein Schultergelenk in der Luft.
       *
       * Der Rumpf sagt es direkter: Das Gelenk liegt dort, wo die Silhouette
       * ihre volle Schulterbreite fast erreicht hat. Was darueber hinaus noch
       * breiter wird, ist der Deltamuskel, der sich um das Gelenk herumlegt.
       * Dort steigt die Breite steil an - ein Prozent Messfehler in der Breite
       * kostet ein Drittel Prozent in der Hoehe, der Hebel ist also kleiner
       * als eins statt vier.
       */
      const SCHULTER_ANTEIL = 0.8;
      const schulterY = (() => {
        const voll = weiteste(K, halsY, Math.min(...armMasse.map((a) => a.oben)));
        for (let y = halsY; y <= voll.y; y += SCHRITT) {
          if (breiteBei(K, y) >= voll.w * SCHULTER_ANTEIL) return y;
        }
        return (halsY + voll.y) / 2;
      })();

      /*
       * Gegenprobe: Wo muesste das Handgelenk liegen, wenn die Schulter dort
       * sitzt? Beide Wege sind unabhaengig - der eine kommt aus dem Rumpf, der
       * andere aus den Gliedmassenverhaeltnissen. Stimmen sie ueberein, stimmt
       * wahrscheinlich beides.
       */
      const gegenprobe = armMasse.map((a) => ({
        gemessen: a.handgelenkY,
        erwartet: schulterY + HANDGELENK_ANTEIL * (a.unten - schulterY),
      }));

      const armMarken = armMasse.map(({ i, A, oben, unten, laenge, handgelenkY }) => {
        /*
         * Die Achse des Armes - eine Ausgleichsgerade durch die Mitten
         * zwischen Aermelnaht und Handgelenk, nach oben bis zum Schultergelenk
         * verlaengert. Der Arm haengt nicht senkrecht, sondern leicht nach
         * aussen; wer ihn senkrecht annimmt, setzt das Schultergelenk zu weit
         * innen und der Arm reisst beim Heben aus dem Aermel.
         */
        let n = 0, sy = 0, sx = 0, syy = 0, sxy = 0;
        for (let y = oben + laenge * 0.06; y <= handgelenkY; y += SCHRITT) {
          const x = achseBei(A, y);
          if (x === null) continue;
          n++; sy += y; sx += x; syy += y * y; sxy += x * y;
        }
        const nenner = n * syy - sy * sy;
        const steigung = Math.abs(nenner) < 1e-9 ? 0 : (n * sxy - sx * sy) / nenner;
        const achse0 = (sx - steigung * sy) / Math.max(n, 1);
        const aufDerAchse = (y) => achse0 + steigung * y;

        const ellbogenY = schulterY + ELLBOGEN_ANTEIL * (unten - schulterY);
        // Die Hand als Endpunkt der Kette: die Mitte zwischen Handgelenk und
        // Fingerspitze. Auf sie zielt die Umkehrkinematik, nicht auf die
        // Spitze - eine Hand liegt mit dem Ballen auf dem Teller.
        const handY = (handgelenkY + unten) / 2;
        return {
          oben, unten,
          mitteX: (masse[i].lx + masse[i].rx) / 2,
          lx: masse[i].lx,
          rx: masse[i].rx,
          handgelenkY,
          schulter: [aufDerAchse(schulterY), schulterY],
          ellbogen: [aufDerAchse(ellbogenY), ellbogenY],
          hand: [achseBei(A, handY) ?? aufDerAchse(handY), handY],
        };
      });

      /*
       * Der Aermel - die Zone des Rumpfes, die mit dem Arm mitgehen muss.
       *
       * Ohne sie reisst beim Heben des Armes ein weisser Keil zwischen Naht
       * und Arm auf: Der Arm dreht, der Aermel bleibt stehen. In der
       * Spielebranche loest man das nicht anders - die Randpunkte des Aermels
       * bekommen anteilig das Gewicht des Oberarmknochens.
       *
       * Alle vier Zahlen sind am Bild abgelesen:
       *   aussen - die breiteste Stelle des Rumpfes (die Naht selbst)
       *   innen  - die Rumpfbreite knapp unterhalb der Naht (nur noch Torso)
       *   oben   - wo der Rumpf von oben kommend erstmals 'innen' erreicht
       *   voll   - die Hoehe der breitesten Stelle
       */
      const aermel = (() => {
        const armOben = Math.min(...armMarken.map((a) => a.oben));
        const armLaenge = Math.max(...armMarken.map((a) => a.unten)) - armOben;
        const breit = weiteste(K, halsY, armOben);
        const aussen = breit.w / 2;
        const innen = breiteBei(K, armOben + armLaenge * 0.07) / 2;
        let oben2 = halsY;
        for (let y = halsY; y <= breit.y; y += SCHRITT) {
          if (breiteBei(K, y) / 2 >= innen) { oben2 = y; break; }
        }
        return {
          innen, aussen, oben: oben2, voll: breit.y,
          ende: armOben + armLaenge * 0.1,
        };
      })();

      return {
        schleifen: normiert,
        breite: (rx - lx) / hoehe,
        punkte: normiert.reduce((n, s) => n + s.length, 0),
        roh: schleifen.reduce((n, s) => n + s.length, 0),
        rollen: { koerper, arme: armIdx, zubehoer },
        marken: { halsY, arme: armMarken, aermel },
        gegenprobe,
      };
    },
    {
      quelle: `data:${art};base64,${roh.toString('base64')}`,
      arbeitshoehe: ARBEITSHOEHE,
      genauigkeit: GENAUIGKEIT,
      kleinste: KLEINSTE_SCHLEIFE,
    },
  );
} finally {
  await browser.close();
}

console.log(`  ${aus.schleifen.length} Schleifen, ${aus.punkte} Punkte (aus ${aus.roh} rohen)`);
for (const g of aus.gegenprobe) {
  const ab = Math.abs(g.gemessen - g.erwartet);
  console.log(
    `    Handgelenk gemessen ${g.gemessen.toFixed(3)}, aus der Schulter erwartet ` +
    `${g.erwartet.toFixed(3)} - Abweichung ${(ab * 100).toFixed(1)} % der Figurenhoehe` +
    `${ab > 0.04 ? '  <-- pruefen!' : ''}`,
  );
}
for (const [i, s] of aus.schleifen.entries()) console.log(`    ${i}: ${s.length} Punkte`);

const zahl = (v) => Number(v.toFixed(4));
const text = `// Der Umriss des Schatten-DJs - erzeugt, nicht von Hand geschrieben.
//
//   node werkzeuge/schattenumriss.mjs
//
// Geschlossene Streckenzuege, in Einheiten der Figurenhoehe: y = 0 ist der
// Scheitel, y = 1 die Unterkante, x = 0 die Mitte. Gefuellt wird mit der
// Gerade-Ungerade-Regel - damit werden eingeschlossene Schleifen (der Spalt
// zwischen Kopfhoererbuegel und Schaedel) von selbst zu Loechern, ohne dass
// jemand Aussen- von Innenrand unterscheiden muss.
//
// ${aus.schleifen.length} Schleifen, ${aus.punkte} Punkte. Breite ${zahl(aus.breite)} Figurenhoehen.

export const UMRISS = ${JSON.stringify(
  aus.schleifen.map((s) => s.map(([x, y]) => [zahl(x), zahl(y)])),
)};

export const UMRISS_BREITE = ${zahl(aus.breite)};

/*
 * Welche Schleife was ist, und die Gelenke - alles am Bild gemessen.
 *
 * koerper: Kopf, Rumpf und Huefte in einem Stueck.
 * arme:    die beiden freistehenden Arme, links zuerst.
 * zubehoer: was mit dem Kopf mitgeht (hier der Kopfhoererbuegel).
 */
export const ROLLEN = ${JSON.stringify(aus.rollen)};

export const MARKEN = ${JSON.stringify({
  halsY: zahl(aus.marken.halsY),
  arme: aus.marken.arme.map((a) => ({
    oben: zahl(a.oben), unten: zahl(a.unten),
    mitteX: zahl(a.mitteX), lx: zahl(a.lx), rx: zahl(a.rx),
    handgelenkY: zahl(a.handgelenkY),
    schulter: a.schulter.map(zahl),
    ellbogen: a.ellbogen.map(zahl),
    hand: a.hand.map(zahl),
  })),
  aermel: Object.fromEntries(Object.entries(aus.marken.aermel).map(([k, v]) => [k, zahl(v)])),
})};
`;

await fs.writeFile(ZIEL, text);
console.log(`\n${ZIEL} – ${Math.round(text.length / 1024)} kB\n`);
