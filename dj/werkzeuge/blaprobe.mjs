/*
 * BLA ausprobieren, ohne Grafikkarte.
 *
 * Aufruf:  node werkzeuge/blaprobe.mjs [fehler|rebase]
 * Gegenprobe dazu: node werkzeuge/bildunruhe.mjs
 *
 * Welche *Sorte* Abweichung macht BLA?
 *
 * "Das Bild weicht ab" ist fuer eine Party keine Aussage - es gibt kein
 * richtiges Mandelbrotbild bei Tiefe 16, und niemand im Raum kennt eins.
 * Was zaehlt, sind zwei andere Fragen:
 *
 *   1. Liegen die abweichenden Punkte beieinander oder einzeln verstreut?
 *      Beieinander heisst: ein Bereich sieht anders aus - das faellt keinem
 *      auf. Verstreut heisst: Griess zwischen richtigen Punkten - das sieht
 *      man sofort, und es sieht kaputt aus.
 *
 *   2. Bleiben es dieselben Punkte, wenn die Fahrt weiterlaeuft? Wenn nicht,
 *      flackern sie - und Flackern auf einer Leinwand ist das Auffaelligste,
 *      was es gibt.
 */

const NACHKOMMA = 200n, EINS = 1n << NACHKOMMA, TEILER = 2 ** 200;
const fkMal = (a, b) => (a * b) >> NACHKOMMA;
function festkommaAusText(text) {
  const neg = text.trim().startsWith('-');
  const [ganz, bruch = ''] = text.trim().replace(/^[-+]/, '').split('.');
  let w = BigInt(ganz) * EINS, teiler = 10n;
  for (const z of bruch) { w += (BigInt(z) * EINS) / teiler; teiler *= 10n; }
  return neg ? -w : w;
}
const ZIEL = { x: '-0.743643887037158704752191506114774', y: '0.131825904205311970493132056385139' };
function bahnBauen(schritte) {
  const daten = new Float32Array(schritte * 4);
  let zr = 0n, zi = 0n;
  const cr = festkommaAusText(ZIEL.x), ci = festkommaAusText(ZIEL.y), vier = 4n * EINS;
  for (let i = 0; i < schritte; i++) {
    const r = Number(zr) / TEILER, j = Number(zi) / TEILER;
    const rG = Math.fround(r), jG = Math.fround(j);
    daten[i * 4] = rG; daten[i * 4 + 1] = Math.fround(r - rG);
    daten[i * 4 + 2] = jG; daten[i * 4 + 3] = Math.fround(j - jG);
    const zr2 = fkMal(zr, zr), zi2 = fkMal(zi, zi);
    if (zr2 + zi2 > vier) return { daten, laenge: i + 1 };
    zi = 2n * fkMal(zr, zi) + ci; zr = zr2 - zi2 + cr;
  }
  return { daten, laenge: schritte };
}

function blaBauen(bahn, eps, cBetrag) {
  const L = bahn.laenge - 1, stufen = [];
  const A = new Float64Array(L * 2), B = new Float64Array(L * 2), r = new Float64Array(L);
  for (let n = 0; n < L; n++) {
    const zr = bahn.daten[n * 4] + bahn.daten[n * 4 + 1];
    const zi = bahn.daten[n * 4 + 2] + bahn.daten[n * 4 + 3];
    A[n * 2] = 2 * zr; A[n * 2 + 1] = 2 * zi; B[n * 2] = 1; B[n * 2 + 1] = 0;
    const zB = Math.hypot(zr, zi), aB = 2 * zB;
    /*
     * Zwei Radien zur Wahl, und genau darin unterscheiden sich die
     * Veroeffentlichungen:
     *
     *   'fehler'  - Fraktaler 3: R = eps*|A| - |B||c|/|A|. Das ist ein
     *               Kriterium fuer den Naeherungsfehler und nach Aussage der
     *               Quelle *kein* Beweis, dass zwischendurch kein Rebasing
     *               noetig wird.
     *   'rebase'  - die aeltere, geometrische Bedingung von Zhuoran:
     *               |z| << (|Z| - |B||c|) / (|A| + 1). Die Eins im Nenner ist
     *               genau der Rebasing-Term - sie haelt den Punkt weit genug
     *               vom kritischen Punkt weg, dass die Bahn nicht neu
     *               angesetzt werden muss.
     */
    r[n] = ART === 'rebase'
      ? Math.max(0, eps * (zB - cBetrag) / (aB + 1))
      : (aB > 0 ? Math.max(0, eps * aB - cBetrag / aB) : 0);
  }
  stufen.push({ A, B, r, laenge: 1, anzahl: L });
  while (stufen[stufen.length - 1].anzahl > 1) {
    const u = stufen[stufen.length - 1], anzahl = u.anzahl >> 1;
    if (anzahl < 1) break;
    const A2 = new Float64Array(anzahl * 2), B2 = new Float64Array(anzahl * 2), r2 = new Float64Array(anzahl);
    for (let i = 0; i < anzahl; i++) {
      const x = 2 * i, y = 2 * i + 1;
      const axr = u.A[x * 2], axi = u.A[x * 2 + 1], ayr = u.A[y * 2], ayi = u.A[y * 2 + 1];
      const bxr = u.B[x * 2], bxi = u.B[x * 2 + 1], byr = u.B[y * 2], byi = u.B[y * 2 + 1];
      A2[i * 2] = ayr * axr - ayi * axi; A2[i * 2 + 1] = ayr * axi + ayi * axr;
      B2[i * 2] = ayr * bxr - ayi * bxi + byr; B2[i * 2 + 1] = ayr * bxi + ayi * bxr + byi;
      const axB = Math.hypot(axr, axi), bxB = Math.hypot(bxr, bxi);
      r2[i] = Math.min(u.r[x], axB > 0 ? Math.max(0, (u.r[y] - bxB * cBetrag) / axB) : 0);
    }
    stufen.push({ A: A2, B: B2, r: r2, laenge: u.laenge * 2, anzahl });
  }
  return stufen;
}

function punktBla(bahn, stufen, vx, vy, deckel) {
  const B = bahn.daten, L = bahn.laenge;
  let dx = 0, dy = 0, m = 0, n = 0, echt = 0;
  while (n < deckel) {
    let sprung = false;
    if (stufen) for (let s = stufen.length - 1; s >= 1; s--) {
      const st = stufen[s];
      if (m % st.laenge !== 0) continue;
      const i = m / st.laenge;
      if (i >= st.anzahl || n + st.laenge > deckel || m + st.laenge >= L - 1) continue;
      if (Math.hypot(dx, dy) >= st.r[i]) continue;
      const ar = st.A[i * 2], ai = st.A[i * 2 + 1], br = st.B[i * 2], bi = st.B[i * 2 + 1];
      const nx = ar * dx - ai * dy + br * vx - bi * vy;
      const ny = ar * dy + ai * dx + br * vy + bi * vx;
      dx = nx; dy = ny; m += st.laenge; n += st.laenge; sprung = true; break;
    }
    if (!sprung) {
      const gx = B[m * 4] + B[m * 4 + 1], gy = B[m * 4 + 2] + B[m * 4 + 3];
      const ax = gx * dx - gy * dy, ay = gx * dy + gy * dx;
      const cx = dx * dx - dy * dy, cy = 2 * dx * dy;
      dx = 2 * ax + cx + vx; dy = 2 * ay + cy + vy; m++; n++; echt++;
    }
    const nx = B[m * 4] + B[m * 4 + 1] + dx, ny = B[m * 4 + 2] + B[m * 4 + 3] + dy;
    const r2 = nx * nx + ny * ny;
    if (r2 > 65536) return { n, echt, raus: true };
    if (r2 < dx * dx + dy * dy || m >= L - 1) { dx = nx; dy = ny; m = 0; }
  }
  return { n, echt, raus: false };
}

const ART = process.argv[2] ?? 'fehler';
const BREIT = 200, HOCH = 112, SEITE = HOCH / BREIT, DREH = 0.7;
const bahn = bahnBauen(12500);

/** Das Feld der Ausstiegszeiten fuer eine Tiefe, mit und ohne BLA. */
function feld(tiefe, eps) {
  const spanne = 1.6 / Math.pow(10, tiefe);
  const deckel = 12467;
  const sd = Math.sin(DREH), cd = Math.cos(DREH);
  const stufen = eps ? blaBauen(bahn, eps, Math.hypot(1, SEITE) * spanne) : null;
  const n = new Int32Array(BREIT * HOCH);
  let echt = 0;
  for (let py = 0; py < HOCH; py++) {
    for (let px = 0; px < BREIT; px++) {
      const bx = ((px + 0.5) / BREIT) * 2 - 1, by = (((py + 0.5) / HOCH) * 2 - 1) * SEITE;
      const e = punktBla(bahn, stufen, (bx * cd - by * sd) * spanne, (bx * sd + by * cd) * spanne, deckel);
      n[py * BREIT + px] = e.raus ? e.n : -1;
      echt += e.echt;
    }
  }
  return { n, echt: echt / (BREIT * HOCH) };
}

/*
 * Die Farbe, die aus einer Ausstiegszeit wird - dieselbe Formel wie im
 * Schattierer. Erst hier entscheidet sich, ob ein Unterschied ueberhaupt zu
 * sehen ist: Die Wurzelkennlinie staucht grosse Zeiten stark zusammen.
 */
const farbstelle = (n) => (n < 0 ? -1 : (Math.pow(Math.max(n, 1), 0.45) * 0.5) % 1);

function vergleich(tiefe, eps) {
  const a = feld(tiefe, null), b = feld(tiefe, eps);
  let ab = 0, sichtbar = 0, einzeln = 0, imKlumpen = 0;
  const anders = new Uint8Array(BREIT * HOCH);
  for (let i = 0; i < BREIT * HOCH; i++) {
    if (a.n[i] !== b.n[i]) {
      ab++;
      // Sichtbar ist eine Abweichung erst, wenn sie die Farbe merklich
      // verschiebt. Ein Unterschied von zwei Schritten bei n = 5000 tut das
      // nicht - die Wurzelkennlinie schluckt ihn.
      const fa = farbstelle(a.n[i]), fb = farbstelle(b.n[i]);
      const d = Math.abs(fa - fb);
      if (Math.min(d, 1 - d) > 0.02) { sichtbar++; anders[i] = 1; }
    }
  }
  // Liegen die sichtbaren Abweichungen beieinander? Gezaehlt wird, wieviele
  // von ihnen mindestens einen abweichenden Nachbarn haben.
  for (let y = 0; y < HOCH; y++) {
    for (let x = 0; x < BREIT; x++) {
      if (!anders[y * BREIT + x]) continue;
      let nachbarn = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= BREIT || ny >= HOCH) continue;
        if (anders[ny * BREIT + nx]) nachbarn++;
      }
      if (nachbarn === 0) einzeln++; else imKlumpen++;
    }
  }
  return { ab, sichtbar, einzeln, imKlumpen, echtOhne: a.echt, echtMit: b.echt, gesamt: BREIT * HOCH };
}

console.log(`Sorte der Abweichung (200x112 Punkte, Tiefe 16) - Radius "${ART}"\n`);
console.log('  eps      Ersparnis   Punkte anders   davon sichtbar   davon einzeln (Griess)');
for (const eps of (ART === 'rebase' ? [1, 0.1, 0.01, 0.001] : [Math.pow(2,-24), 1e-8, 1e-10])) {
  const v = vergleich(16, eps);
  const spar = 100 - (v.echtMit / v.echtOhne) * 100;
  console.log(
    `  ${String(eps).padEnd(7)}  ${spar.toFixed(0).padStart(8)} %   ${((v.ab / v.gesamt) * 100).toFixed(1).padStart(12)} %   ${((v.sichtbar / v.gesamt) * 100).toFixed(1).padStart(13)} %   ${v.sichtbar ? `${((v.einzeln / v.sichtbar) * 100).toFixed(0)} % von ${v.sichtbar}` : '–'}`,
  );
}

/*
 * Und die zweite Frage: Bleiben es dieselben Punkte, wenn die Fahrt
 * weitergeht? Ein Bild, das anders aussieht, ist harmlos. Ein Bild, in dem
 * dieselbe Stelle von Bild zu Bild umspringt, flackert.
 */
console.log('\nBleibt es beim Weiterfahren stabil? (Tiefe 16.00 gegen 16.02)');
console.log('  eps      abweichende Punkte bei 16.00   bei 16.02   gemeinsam');
for (const eps of (ART === 'rebase' ? [0.01] : [Math.pow(2,-24)])) {
  const mengen = [16.0, 16.02].map((t) => {
    const a = feld(t, null), b = feld(t, eps);
    const s = new Set();
    for (let i = 0; i < BREIT * HOCH; i++) {
      const fa = farbstelle(a.n[i]), fb = farbstelle(b.n[i]);
      const d = Math.abs(fa - fb);
      if (a.n[i] !== b.n[i] && Math.min(d, 1 - d) > 0.02) s.add(i);
    }
    return s;
  });
  const gemeinsam = [...mengen[0]].filter((i) => mengen[1].has(i)).length;
  const vereint = new Set([...mengen[0], ...mengen[1]]).size;
  console.log(
    `  ${String(eps).padEnd(7)}  ${String(mengen[0].size).padStart(28)}   ${String(mengen[1].size).padStart(9)}   ${vereint ? ((gemeinsam / vereint) * 100).toFixed(0) : 0} %`,
  );
}
