/*
 * Wieviele *verschiedene* Punkte rechnet ein Mandala eigentlich?
 *
 * Jede Faltung im Schattierer bildet die ganze Ebene in einen Keil ab - das
 * ist die Bauart eines Kaleidoskops. Die Grafikkarte rechnet den Keil aber
 * so oft, wie er im Bild vorkommt. Gezaehlt wird hier, wieviele Bildpunkte
 * nach der Faltung auf verschiedene Stellen fallen: der Rest ist Arbeit, die
 * schon getan ist.
 */
const BREIT = 1600, HOCH = 900, SEITE = HOCH / BREIT, DREH = 0.7;

function faltSpiegel(x, y, n) {
  const keil = Math.PI / Math.max(1, n);
  const r = Math.hypot(x, y);
  let w = Math.atan2(y, x);
  w = ((((w + keil) % (2 * keil)) + 2 * keil) % (2 * keil)) - keil;
  return [Math.cos(Math.abs(w)) * r, Math.sin(Math.abs(w)) * r];
}
function faltDrehung(x, y, n) {
  const keil = (2 * Math.PI) / Math.max(1, n);
  const r = Math.hypot(x, y);
  let w = Math.atan2(y, x);
  w = ((w % keil) + keil) % keil;
  return [Math.cos(w) * r, Math.sin(w) * r];
}
function faltQuadrat(x, y) {
  x = Math.abs(x); y = Math.abs(y);
  return x < y ? [y, x] : [x, y];
}

// Auf Bildpunktgenauigkeit runden: feiner als ein Bildpunkt muss nichts
// unterschieden werden, denn feiner wird auch nicht angezeigt.
const h = 2 / BREIT;
function zaehlen(falt, n) {
  const sd = Math.sin(DREH), cd = Math.cos(DREH);
  const gesehen = new Set();
  for (let py = 0; py < HOCH; py++) {
    for (let px = 0; px < BREIT; px++) {
      const bx = ((px + 0.5) / BREIT) * 2 - 1, by = (((py + 0.5) / HOCH) * 2 - 1) * SEITE;
      const rx = bx * cd - by * sd, ry = bx * sd + by * cd;
      const [fx, fy] = falt(rx, ry, n);
      gesehen.add(`${Math.round(fx / h)},${Math.round(fy / h)}`);
    }
  }
  return gesehen.size;
}

const gesamt = BREIT * HOCH;
console.log(`Bild ${BREIT}x${HOCH} = ${(gesamt / 1e6).toFixed(2)} MP\n`);
console.log('  Faltung             verschiedene Punkte   Anteil   moegliche Ersparnis');
for (const [name, falt, n] of [
  ['Rosette 3   (Spiegel)', faltSpiegel, 3],
  ['Rosette 5   (Spiegel)', faltSpiegel, 5],
  ['Rosette 6   (Spiegel)', faltSpiegel, 6],
  ['Rosette 8   (Spiegel)', faltSpiegel, 8],
  ['Rosette 12  (Spiegel)', faltSpiegel, 12],
  ['Rosette 16  (Spiegel)', faltSpiegel, 16],
  ['Windrad 6   (Drehung)', faltDrehung, 6],
  ['Windrad 9   (Drehung)', faltDrehung, 9],
  ['Fliese      (Quadrat)', (x, y) => faltQuadrat(x, y), 0],
]) {
  const d = zaehlen(falt, n);
  console.log(
    `  ${name.padEnd(22)} ${((d / 1e6).toFixed(3) + ' MP').padStart(12)}   ${((d / gesamt) * 100).toFixed(1).padStart(5)} %   ${(100 - (d / gesamt) * 100).toFixed(0).padStart(6)} %`,
  );
}
