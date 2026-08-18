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
const QUELLE = path.resolve(process.argv[2] ?? 'werkzeuge/schattenquellen/tpose.jpeg');
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

      /* --- Was welche Schleife ist ---------------------------------------
       *
       * Die Zeichnung bringt die Zerlegung mit: weisse Linien trennen Kopf
       * vom Shirt, Unterarm vom Oberarm, Hose vom Shirt. Hier wird nur
       * zugeordnet und an der Achsel nachgeschnitten - nicht geraten.
       *
       * Zugeordnet wird nach Bauart, nie nach Reihenfolge, damit eine andere
       * Zeichnung nicht alles ungueltig macht:
       *
       *   - Loecher sind Schleifen, die ganz in einer anderen liegen. Sie
       *     gehoeren zu ihrer Wirtsschleife und werden mit ihr in einem Pfad
       *     gefuellt; die Gerade-Ungerade-Regel macht daraus von selbst ein
       *     Loch. Hier ist das der Spalt unter dem Kopfhoererbuegel.
       *   - Der Kopf ist die Schleife, die den Scheitel enthaelt.
       *   - Der Rumpf ist die groesste der uebrigen.
       *   - Die Unterarme sind die zwei, die am weitesten von der Mitte weg
       *     liegen.
       *   - Was dann noch bleibt, steht still - hier die Hose.
       */
      const mass = (s2) => {
        let lx2 = 1e9, rx2 = -1e9, ly2 = 1e9, ry2 = -1e9, sx = 0, sy = 0;
        for (const [x, y] of s2) {
          if (x < lx2) lx2 = x; if (x > rx2) rx2 = x;
          if (y < ly2) ly2 = y; if (y > ry2) ry2 = y;
          sx += x; sy += y;
        }
        return { lx: lx2, rx: rx2, ly: ly2, ry: ry2, mx: sx / s2.length, my: sy / s2.length };
      };
      const flaeche = (s2) => {
        let f2 = 0;
        for (let i = 0; i < s2.length; i++) {
          const [x1, y1] = s2[i];
          const [x2, y2] = s2[(i + 1) % s2.length];
          f2 += x1 * y2 - x2 * y1;
        }
        return Math.abs(f2) / 2;
      };
      const imInneren = (s2, px, py) => {
        let ja = false;
        for (let i = 0, j = s2.length - 1; i < s2.length; j = i++) {
          const [xi, yi] = s2[i];
          const [xj, yj] = s2[j];
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ja = !ja;
        }
        return ja;
      };

      /* --- Messen entlang der eigenen Achse -------------------------------
       *
       * Alles Folgende misst Querschnitte - die schmalste Stelle des Halses,
       * das Handgelenk, den Ballen. Die erste Fassung nahm dafuer waagerechte
       * Zeilen, weil die Figur mit haengenden Armen gezeichnet war.
       *
       * Diese Zeichnung steht im T-Pose, und da liegen die Arme *quer*. Eine
       * waagerechte Zeile durch einen waagerechten Unterarm misst nicht seine
       * Dicke, sondern seine Laenge. Deshalb bekommt jedes Teil seine eigene
       * Hauptachse (Hauptkomponente seiner Punktwolke), und gemessen wird
       * senkrecht dazu. Damit ist es gleichgueltig, in welcher Haltung
       * gezeichnet wurde.
       */
      const achseVon = (S) => {
        const m = mass(S);
        let sxx = 0, sxy = 0, syy = 0;
        for (const [x, y] of S) {
          const dx = x - m.mx;
          const dy = y - m.my;
          sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
        }
        const w = 0.5 * Math.atan2(2 * sxy, sxx - syy);
        return { cx: m.mx, cy: m.my, dx: Math.cos(w), dy: Math.sin(w) };
      };
      // In das Achsensystem: [quer, laengs]. 'laengs' liegt auf der zweiten
      // Stelle, damit die vorhandene Zeilenmessung unveraendert weiterlaeuft.
      const insSystem = (S, a2) =>
        S.map(([x, y]) => {
          const px = x - a2.cx;
          const py = y - a2.cy;
          return [-px * a2.dy + py * a2.dx, px * a2.dx + py * a2.dy];
        });
      const ausSystem = (a2, q, l) => [
        a2.cx - q * a2.dy + l * a2.dx,
        a2.cy + q * a2.dx + l * a2.dy,
      ];
      // Die Achse so drehen, dass 'laengs' von `weg` fort zeigt.
      const achseWeg = (S, weg) => {
        const a2 = achseVon(S);
        const r = insSystem(S, a2);
        let nahL = 0, nahD = Infinity;
        for (let i = 0; i < S.length; i++) {
          const d = (S[i][0] - weg[0]) ** 2 + (S[i][1] - weg[1]) ** 2;
          if (d < nahD) { nahD = d; nahL = r[i][1]; }
        }
        return nahL > 0 ? { ...a2, dx: -a2.dx, dy: -a2.dy } : a2;
      };
      // Der Schwerpunkt der Punkte am aeussersten Ende einer Achse.
      const endMitte = (S, a2, amEnde) => {
        const r = insSystem(S, a2);
        let lo = 1e9, hi = -1e9;
        for (const [, l] of r) { if (l < lo) lo = l; if (l > hi) hi = l; }
        const grenze = amEnde ? hi - (hi - lo) * 0.06 : lo + (hi - lo) * 0.06;
        let sq = 0, sl = 0, n2 = 0;
        for (const [q, l] of r) {
          if (amEnde ? l >= grenze : l <= grenze) { sq += q; sl += l; n2++; }
        }
        return ausSystem(a2, sq / n2, sl / n2);
      };

      /*
       * Querschnitte: echte Schnittpunkte mit den Kanten, nicht die Streuung
       * der Eckpunkte.
       *
       * Der Unterschied war ein Fehler: Zuerst wurden je Zeile die
       * vorhandenen *Eckpunkte* zusammengefasst. Nach Douglas-Peucker liegen
       * auf einer langen geraden Kante aber gar keine - in solchen Zeilen kam
       * Breite null heraus, und die Suche nach der schmalsten Stelle fand
       * statt des Halses eine Luecke in den Messdaten.
       *
       * Angewandt wird das gleich auf *gedrehte* Punktlisten, damit quer zur
       * jeweiligen Achse gemessen wird und nicht quer zum Bild.
       */
      const spanne = (s2, y) => {
        let l = 1e9, r = -1e9;
        for (let i = 0; i < s2.length; i++) {
          const [x1, y1] = s2[i];
          const [x2, y2] = s2[(i + 1) % s2.length];
          if ((y1 <= y) === (y2 <= y)) continue;
          const x = x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
          if (x < l) l = x;
          if (x > r) r = x;
        }
        return r < l ? null : [l, r];
      };
      const breiteBei = (s2, y) => {
        const p = spanne(s2, y);
        return p ? p[1] - p[0] : 0;
      };
      // Fein genug, dass ein Handgelenk nicht zwischen zwei Proben faellt.
      const SCHRITT = 0.002;
      const suchen = (s2, von2, bis2, besser) => {
        let wert = null;
        let wo = von2;
        for (let y = von2; y <= bis2; y += SCHRITT) {
          const w = breiteBei(s2, y);
          if (w <= 0) continue;
          if (wert === null || besser(w, wert)) { wert = w; wo = y; }
        }
        return { y: wo, w: wert ?? 0 };
      };
      const weiteste = (s2, a2, b3) => suchen(s2, a2, b3, (w, v) => w > v);
      const engste = (s2, a2, b3) => suchen(s2, a2, b3, (w, v) => w < v);
      /*
       * Die Mitte einer schmalen Stelle statt ihres tiefsten Punktes.
       *
       * Ein Handgelenk ist im Umriss kein spitzes Minimum, sondern eine
       * flache Mulde: ueber fuenf Prozent der Armlaenge aendert sich die
       * Breite kaum. Welche Probe darin die kleinste ist, entscheidet das
       * Rauschen der Zeichnung - gemessen kam links 0,829 heraus und rechts
       * 0,793, fuer zwei spiegelgleich gezeichnete Arme. Die Mitte der Mulde
       * ist stabil, der tiefste Punkt nicht.
       */
      const muldenMitte = (s2, a2, b3, toleranz = 1.03) => {
        const tief = engste(s2, a2, b3);
        let von2 = null;
        let bis2 = null;
        for (let y = a2; y <= b3; y += SCHRITT) {
          const w = breiteBei(s2, y);
          if (w > 0 && w <= tief.w * toleranz) { if (von2 === null) von2 = y; bis2 = y; }
        }
        return von2 === null ? tief.y : (von2 + bis2) / 2;
      };

      const masse = normiert.map(mass);
      const flaechen = normiert.map(flaeche);

      // Loecher: Schwerpunkt liegt in einer groesseren Schleife.
      const wirt = normiert.map((s2, i) => {
        for (let j = 0; j < normiert.length; j++) {
          if (j === i || flaechen[j] <= flaechen[i]) continue;
          if (imInneren(normiert[j], masse[i].mx, masse[i].my)) return j;
        }
        return -1;
      });
      const obenAuf = normiert.map((_, i) => i).filter((i) => wirt[i] < 0);

      const kopf = obenAuf.reduce((a2, i) => (masse[i].ly < masse[a2].ly ? i : a2), obenAuf[0]);
      const ohneKopf = obenAuf.filter((i) => i !== kopf);
      const koerper = ohneKopf.reduce((a2, i) => (flaechen[i] > flaechen[a2] ? i : a2), ohneKopf[0]);

      /* --- Die Gliederkette finden ----------------------------------------
       *
       * Uebrig sind: zwei Oberarme, zwei Unterarme, der Kopfhoererbuegel und
       * die Hose. Zugeordnet wird ueber Nachbarschaft, weil das ohne Wissen
       * ueber diese eine Zeichnung auskommt:
       *
       *   1. Ein Armteil liegt seitlich neben dem Rumpf - sein Schwerpunkt
       *      liegt weiter aussen als der halbe Rumpf breit ist. Hose und
       *      Kopfhoerer fallen damit heraus, obwohl die Hose den Rumpf
       *      beruehrt.
       *   2. Je Seite ist der Oberarm das Teil, das dem Rumpf am naechsten
       *      liegt, und der Unterarm das, was dem Oberarm am naechsten liegt.
       *      Das ist die Kette Schulter - Ellenbogen - Hand, von innen nach
       *      aussen abgelaufen.
       *   3. Vom Rest gehoert zum Kopf, was dem Kopf naeher ist als dem
       *      Rumpf. Alles andere steht still.
       *
       * Hier stand vorher ein Verfahren, das den Oberarm aus dem Rumpf
       * *herausschneiden* musste, weil die vorige Zeichnung beide in einer
       * Schleife hatte. Es ist weg: Diese Zeichnung trennt selbst, und ein
       * Schnitt, den niemand mehr braucht, ist nur eine weitere Stelle, an
       * der etwas schiefgehen kann.
       */
      const abstand = (A, B) => {
        let d = Infinity;
        for (const [ax, ay] of A) {
          for (const [bx, by] of B) {
            const q = (ax - bx) ** 2 + (ay - by) ** 2;
            if (q < d) d = q;
          }
        }
        return Math.sqrt(d);
      };

      const frei = ohneKopf.filter((i) => i !== koerper);
      const halbeBreite = Math.max(Math.abs(masse[koerper].lx), Math.abs(masse[koerper].rx));
      const seitlich = frei.filter((i) => Math.abs(masse[i].mx) > halbeBreite * 0.5);

      const armPaare = [-1, 1].map((seite) => {
        const meine = seitlich.filter((i) => Math.sign(masse[i].mx) === seite);
        if (meine.length < 2) {
          throw new Error(
            `Auf einer Seite nur ${meine.length} Armteil(e) gefunden. Die Zeichnung braucht ` +
              'je Seite Oberarm und Unterarm, durch eine weisse Linie getrennt.',
          );
        }
        const oberarm = meine.reduce((a2, i) =>
          abstand(normiert[i], normiert[koerper]) < abstand(normiert[a2], normiert[koerper]) ? i : a2,
        );
        const rest2 = meine.filter((i) => i !== oberarm);
        const unterarm = rest2.reduce((a2, i) =>
          abstand(normiert[i], normiert[oberarm]) < abstand(normiert[a2], normiert[oberarm]) ? i : a2,
        );
        return { seite, oberarm, unterarm };
      });

      const verbraucht = new Set([kopf, koerper, ...armPaare.flatMap((a2) => [a2.oberarm, a2.unterarm])]);
      const uebrigNach = frei.filter((i) => !verbraucht.has(i));
      const kopfTeile = uebrigNach.filter(
        (i) => abstand(normiert[i], normiert[kopf]) <= abstand(normiert[i], normiert[koerper]),
      );
      const stillIdx = uebrigNach.filter((i) => !kopfTeile.includes(i));

      /* --- Die Gelenke ----------------------------------------------------
       *
       * Alle am Bild gemessen. In der Vorgaengerzeichnung steckten Schulter
       * und Ellenbogen unter einem T-Shirt-Aermel und mussten ueber
       * Gliedmassenverhaeltnisse geschaetzt werden - mit einem Hebel von 4:1
       * und entsprechend wackligem Ergebnis. Hier trennt die Zeichnung selbst
       * an genau den Stellen, an denen die Knochen enden.
       */
      const KO = normiert[kopf];
      let halsY;
      {
        const schaedel = weiteste(KO, masse[kopf].ly + 0.02, masse[kopf].ly + 0.22).y;
        halsY = muldenMitte(KO, schaedel + SCHRITT, masse[kopf].ry - SCHRITT);
      }

      const armMarken = armPaare.map((A) => {
        const OA = normiert[A.oberarm].map((p) => p.slice());
        const UA = normiert[A.unterarm];
        const rumpfMitte = [masse[koerper].mx, masse[koerper].my];

        /*
         * Das Schultergelenk liegt *im* Rumpf, nicht an der Armwurzel.
         *
         * Genommen wird die Mitte des inneren Armendes und dann um ein
         * Viertel der Armdicke weiter nach innen geschoben. Der Grund ist
         * mechanisch: Dreht der Arm um seine aeusserste Wurzel, wandern
         * deren Ecken beim Drehen heraus und es klafft. Liegt der Drehpunkt
         * etwas tiefer, bleibt die Wurzel unter dem Shirt.
         *
         * Eine halbe Dicke war zu viel - damit sassen die Schultergelenke
         * bei 0,103 Figurenhoehen und die Figur bekam die Schulterbreite
         * eines Kindes, was die ganze Armgeometrie verzog. Ein Viertel
         * genuegt, weil Arm und Rumpf einander an der Wurzel ohnehin
         * ueberlappen.
         */
        const achseO = achseWeg(OA, rumpfMitte);
        const rO = insSystem(OA, achseO);
        let loO = 1e9;
        for (const [, l] of rO) if (l < loO) loO = l;

        /*
         * Die beiden Ecken der Armwurzel - die Enden des Schnitts, mit dem
         * die Zeichnung den Arm vom Rumpf trennt. Sie sind die Grundlage fuer
         * beides: das Gelenk und die Abdeckung der Fuge.
         */
        let e1 = null;
        let e2 = null;
        {
          const grenze = loO + (breiteBei(rO, loO + 0.01) || 0.05) * 0.35;
          let qmin = 1e9;
          let qmax = -1e9;
          for (const [q, l] of rO) {
            if (l > grenze) continue;
            if (q < qmin) { qmin = q; e1 = ausSystem(achseO, q, l); }
            if (q > qmax) { qmax = q; e2 = ausSystem(achseO, q, l); }
          }
        }
        // Obere Ecke zuerst - darauf verlaesst sich das Gelenk unten.
        if (e1[1] > e2[1]) { const t = e1; e1 = e2; e2 = t; }
        const wurzelLaenge = Math.hypot(e2[0] - e1[0], e2[1] - e1[1]);

        /*
         * Das Schultergelenk: die Mitte des Wurzelschnitts, ein Stueck weit
         * in den Rumpf hineingeschoben.
         *
         * Das obere Drittel, und das ist zweimal korrigiert. Zuerst stand
         * hier der Schwerpunkt der innersten Randpunkte, und der zieht
         * dorthin, wo die Punkte dichter liegen - beim Aermelloch also an die
         * Achselhoehle: gemessen 0,451, waehrend der Schnitt von 0,306 bis
         * 0,471 reicht. Ein Schultergelenk fast in der Achsel, um das der
         * ganze Arm schepperte.
         *
         * Die blosse Mitte war immer noch zu tief. Ein Schultergelenk sitzt
         * nicht in der Mitte des Aermellochs, sondern in seinem oberen
         * Drittel - der Aermelausschnitt reicht unten bis in die Achsel,
         * oben endet er am Gelenk.
         *
         * Das Hineinschieben ist mechanisch: Dreht der Arm um einen Punkt auf
         * seiner Wurzel, wandern deren Ecken beim Drehen heraus. Ein Fuenftel
         * der Wurzellaenge tiefer bleibt die Wurzel unter dem Shirt.
         */
        const OBERES_DRITTEL = 0.35;
        const schulter = [
          e1[0] + (e2[0] - e1[0]) * OBERES_DRITTEL - achseO.dx * wurzelLaenge * 0.2,
          e1[1] + (e2[1] - e1[1]) * OBERES_DRITTEL - achseO.dy * wurzelLaenge * 0.2,
        ];
        const dicke = breiteBei(rO, loO + 0.01);

        /*
         * Die Wurzel des Oberarms rund abschneiden.
         *
         * Sie ist lang: Das Aermelloch reicht von der Schulterhoehe bis in
         * die Achsel, gut 0,165 Figurenhoehen. Im T-Pose steht diese
         * Schnittkante senkrecht und liegt unsichtbar am Rumpf an - dreht der
         * Arm aber nach unten, dreht sie mit und steht als langer Keil aus
         * der Schulter heraus. Im Standbild sah das aus wie Schulterpolster,
         * und es wanderte auch noch mit jeder Armbewegung.
         *
         * Ein Kreisbogen um das Gelenk hat dieses Problem nicht: Er sieht bei
         * jedem Winkel gleich aus. Was danach ueber den Rumpf hinausragt, ist
         * eine runde Schulter - also genau das, was dort hingehoert.
         *
         * Abgeschnitten wird bei einem halben Wurzelmass vom Gelenk. Dort ist
         * der Arm ohnehin schon fast so schmal wie der Bogen, der Uebergang
         * faellt also nicht auf.
         */
        const rWurzel = wurzelLaenge * 0.5;
        const laengsAb = (x, y) =>
          (x - schulter[0]) * achseO.dx + (y - schulter[1]) * achseO.dy;
        const behalten = OA.map(([x, y]) => laengsAb(x, y) >= rWurzel);
        let start = -1;
        for (let k = 0; k < OA.length; k++) {
          if (behalten[k] && !behalten[(k - 1 + OA.length) % OA.length]) { start = k; break; }
        }
        if (start >= 0) {
          const gerundet = [];
          let k = start;
          while (behalten[k]) { gerundet.push(OA[k]); k = (k + 1) % OA.length; }
          // Der Bogen zurueck, hinter dem Gelenk herum.
          const letzter = gerundet[gerundet.length - 1];
          const erster = gerundet[0];
          const wink = (p) => Math.atan2(p[1] - schulter[1], p[0] - schulter[0]);
          let a2 = wink(letzter);
          let b3 = wink(erster);
          // Immer den Weg nehmen, der hinter dem Gelenk vorbeifuehrt.
          const hinten = Math.atan2(-achseO.dy, -achseO.dx);
          const drin = (w) => {
            const d1 = ((w - a2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            const d2 = ((b3 - a2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            return d1 <= d2;
          };
          const vorwaerts = drin(hinten);
          const BOGEN = 12;
          for (let j = 1; j < BOGEN; j++) {
            const t = j / BOGEN;
            let w;
            if (vorwaerts) {
              const d = ((b3 - a2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
              w = a2 + d * t;
            } else {
              const d = ((a2 - b3) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
              w = a2 - d * t;
            }
            gerundet.push([
              schulter[0] + Math.cos(w) * rWurzel,
              schulter[1] + Math.sin(w) * rWurzel,
            ]);
          }
          OA.length = 0;
          for (const p of gerundet) OA.push(p);
        }

        // Der Ellenbogen: die Mitte zwischen den beiden Enden, die sich in
        // der weissen Naht gegenueberstehen.
        const endeO = endMitte(OA, achseO, true);
        const achseU = achseWeg(UA, endeO);
        const anfangU = endMitte(UA, achseU, false);
        const ellbogen = [(endeO[0] + anfangU[0]) / 2, (endeO[1] + anfangU[1]) / 2];

        /*
         * Handgelenk und Ballen - laengs des Unterarms gemessen.
         *
         * Die Suche endet bei 70 % der Unterarmlaenge, und das ist eine
         * Korrektur: Bei 90 % lief sie bis in die Fingerspitzen, wo der
         * Umriss noch einmal schmal wird. Ein Arm bekam dadurch sein
         * Handgelenk mitten in der Hand, obwohl beide spiegelgleich
         * gezeichnet sind.
         *
         * Die Hand ist nicht die Spitze, sondern der *Ballen*: die breiteste
         * Stelle hinter dem Gelenk. Dorthin zielt die Umkehrkinematik, denn
         * mit dem Ballen liegt eine Hand auf einem Plattenteller.
         */
        const rU = insSystem(UA, achseU);
        let lo = 1e9;
        let hi = -1e9;
        for (const [, l] of rU) { if (l < lo) lo = l; if (l > hi) hi = l; }
        const L = hi - lo;
        const gelenkL = muldenMitte(rU, lo + L * 0.3, lo + L * 0.7);
        const ballenL = weiteste(rU, gelenkL + SCHRITT, hi - L * 0.05).y;
        const querBei = (R, l) => {
          const p = spanne(R, l);
          return p ? (p[0] + p[1]) / 2 : 0;
        };
        const handgelenk = ausSystem(achseU, querBei(rU, gelenkL), gelenkL);
        const hand = ausSystem(achseU, querBei(rU, ballenL), ballenL);

        /*
         * Die Gelenkdicke.
         *
         * Zwei starre Teile, die um einen gemeinsamen Punkt gegeneinander
         * drehen, reissen an der Aussenseite der Beugung einen Keil auf -
         * beide Enden sind gerade abgeschnitten. Ein Kreis im Gelenk deckt
         * ihn ab, und zwar bei jedem Winkel. Sein Radius ist die halbe Dicke
         * der Gliedmasse an dieser Stelle; groesser waere eine Beule,
         * kleiner liesse den Keil stehen.
         */
        const dickeU = breiteBei(rU, lo + L * 0.06);
        return {
          seite: A.seite,
          schulter, ellbogen, hand, handgelenk,
          schulterR: dicke * 0.5,
          wurzel: [e1, e2],
          ellbogenR: Math.max(breiteBei(rO, loO + (endeO ? 0 : 0) + 0.01), dickeU) * 0.5,
          oberarm: OA, unterarm: UA,
        };
      });

      /*
       * Gegenprobe: Passen die gemessenen Gelenke zu einem menschlichen Arm?
       * Auf der Strecke Schulter-Fingerspitze liegt der Ellenbogen bei 42,3 %,
       * das Handgelenk bei 75,5 %. Das ist hier *keine* Rechnung mehr, nur
       * noch eine Warnlampe fuer eine krumme Zeichnung.
       */
      const gegenprobe = armMarken
        .map((a3) => {
          let spitze = a3.hand;
          let weitest = -1;
          for (const [x, y] of a3.unterarm) {
            const d = Math.hypot(x - a3.schulter[0], y - a3.schulter[1]);
            if (d > weitest) { weitest = d; spitze = [x, y]; }
          }
          const bis = (p) =>
            Math.hypot(p[0] - a3.schulter[0], p[1] - a3.schulter[1]) / weitest;
          return [
            { was: 'Ellenbogen', gemessen: bis(a3.ellbogen), erwartet: 0.423 },
            { was: 'Handgelenk', gemessen: bis(a3.handgelenk), erwartet: 0.755 },
          ];
        })
        .flat();

      /*
       * Ausgegeben wird in Zeichenreihenfolge, von hinten nach vorn:
       * Oberarme, Kopf, Rumpf und was still steht, dann die Unterarme. Der
       * Kopf vor dem Rumpf, damit der Kragen den Hals verdeckt; die Unterarme
       * zuletzt, weil sie vor dem Koerper haengen.
       */
      const raus = [];
      const nr = (punkte) => (raus.push(punkte), raus.length - 1);
      const loecherVon = (i) => normiert.map((_, j) => j).filter((j) => wirt[j] === i);
      const rollen = {
        oberarme: armMarken.map((a2) => nr(a2.oberarm)),
        kopf: nr(KO),
        kopfTeile: [...loecherVon(kopf), ...kopfTeile].map((j) => nr(normiert[j])),
        rumpf: nr(normiert[koerper]),
        still: stillIdx.map((j) => nr(normiert[j])),
        unterarme: armMarken.map((a2) => nr(a2.unterarm)),
      };

      return {
        schleifen: raus,
        breite: (rx - lx) / hoehe,
        punkte: raus.reduce((n, s2) => n + s2.length, 0),
        roh: schleifen.reduce((n, s2) => n + s2.length, 0),
        rollen,
        marken: {
          halsY,
          arme: armMarken.map((a2) => ({
            seite: a2.seite,
            schulter: a2.schulter,
            ellbogen: a2.ellbogen,
            hand: a2.hand,
            schulterR: a2.schulterR,
            ellbogenR: a2.ellbogenR,
            wurzel: a2.wurzel,
          })),
        },
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
console.log('  Gegenprobe gegen menschliche Gliedmassenverhaeltnisse:');
let schief = 0;
for (const g of aus.gegenprobe) {
  const ab = Math.abs(g.gemessen - g.erwartet);
  if (ab > 0.05) schief++;
  console.log(
    `    ${g.was} gemessen ${g.gemessen.toFixed(3)}, erwartet ${g.erwartet.toFixed(3)}` +
    ` - Abweichung ${(ab * 100).toFixed(1)} %${ab > 0.05 ? '  <-- pruefen!' : ''}`,
  );
}
if (schief) console.log('  Achtung: Die Zeichnung weicht von menschlichen Proportionen ab.');
for (const [i, s] of aus.schleifen.entries()) console.log(`    ${i}: ${s.length} Punkte`);

const zahl = (v) => Number(v.toFixed(4));
const text = `// Der Umriss des Schatten-DJs - erzeugt, nicht von Hand geschrieben.
//
//   node werkzeuge/schattenumriss.mjs
//
// Geschlossene Streckenzuege, in Einheiten der Figurenhoehe: y = 0 ist der
// Scheitel, y = 1 die Unterkante, x = 0 die Mitte.
//
// ${aus.schleifen.length} Schleifen, ${aus.punkte} Punkte. Breite ${zahl(aus.breite)} Figurenhoehen.

export const UMRISS = ${JSON.stringify(
  aus.schleifen.map((s) => s.map(([x, y]) => [zahl(x), zahl(y)])),
)};

export const UMRISS_BREITE = ${zahl(aus.breite)};

/*
 * Welche Schleife was ist - in Zeichenreihenfolge, von hinten nach vorn.
 *
 * oberarme    je Seite einer, dreht um die Schulter
 * kopf        Kopf und Hals, dreht um den Hals
 * kopfTeile   was mit dem Kopf mitgeht: der Kopfhoererbuegel und was im
 *             Kopf ausgespart bleibt. Alles in einem Pfad mit dem Kopf,
 *             Gerade-Ungerade - dadurch werden eingeschlossene Schleifen von
 *             selbst zu Loechern
 * rumpf       das Shirt, steht still
 * still       was sonst noch stillsteht (die Hose)
 * unterarme   je Seite einer, drehen um den Ellenbogen
 */
export const ROLLEN = ${JSON.stringify(aus.rollen)};

/*
 * Die Gelenke, alle am Bild gemessen. Die Zeichnung trennt an genau den
 * Stellen, an denen die Knochen enden - deshalb steht hier keine geschaetzte
 * Zahl mehr.
 */
export const MARKEN = ${JSON.stringify({
  halsY: zahl(aus.marken.halsY),
  arme: aus.marken.arme.map((a) => ({
    seite: a.seite,
    schulter: a.schulter.map(zahl),
    ellbogen: a.ellbogen.map(zahl),
    hand: a.hand.map(zahl),
    schulterR: zahl(a.schulterR),
    ellbogenR: zahl(a.ellbogenR),
    wurzel: a.wurzel.map((p) => p.map(zahl)),
  })),
})};
`;

await fs.writeFile(ZIEL, text);
console.log(`\n${ZIEL} – ${Math.round(text.length / 1024)} kB\n`);
