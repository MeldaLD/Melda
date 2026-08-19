// Die Gewerke einer Buehnenshow.
//
// Was hier steht, sind die *Bausteine*: einzelne Lichtgewerke, jedes fuer
// sich, jedes ohne Meinung darueber, wann es laufen soll. Diese Entscheidung
// trifft die Regie in buehnenshow.js.
//
// Die Trennung ist keine Formsache, sondern das, was ein Lichtpult auch
// macht - und der Satz, der die ganze Zunft zusammenfasst, lautet:
//
//   "Busking is not winging it from scratch; it's more like live remixing of
//    well-prepared building blocks."
//
// Genau das ist der Aufbau hier. Die Bausteine sind vorbereitet und tun immer
// dasselbe; was eine Show daraus macht, ist die Auswahl.
//
// --- Die Gewerke einer echten Anlage ---------------------------------------
//
// Aus der Fachliteratur, und in dieser Reihenfolge aufgebaut:
//
//   Wash        macht die Farbstimmung. Die Grundlage, laeuft fast immer.
//   Beam        baut die Architektur in der Luft. Schmale Strahlen von oben.
//   Spot        setzt Flecken und Muster.
//   Blinder     leuchtet ins *Publikum*. Nur zu Hoehepunkten.
//   Strobe      Blitze. Bei uns klein, siehe unten.
//   Sunstrip    eine Leiste aus Lampen, die im Lauflicht arbeitet.
//   Kugel       die Spiegelkugel. Braucht die Buehne fuer sich allein.
//   Flamme      Flammenwerfer. Der teuerste Akzent, also der seltenste.
//   CO2         weisse Saeulen, kurz und hart.
//   Funken      Kaltfunken, die aufsteigen und fallen.
//   Dunst       macht Strahlen ueberhaupt erst sichtbar.
//
// --- Und was wir *nicht* machen ---------------------------------------------
//
// Ein echtes Stroboskop laeuft mit zehn bis fuenfundzwanzig Blitzen je
// Sekunde. Die allgemeine Blitzschwelle erlaubt drei - und zwar nur, wenn die
// Aenderung mindestens ein Viertel der Bildflaeche betrifft.
//
// Genau daran haengt die Loesung: Ein Blitz auf *weniger* als einem Viertel
// der Flaeche faellt nicht unter die Schwelle. Die Blitze hier sind deshalb
// klein und sitzen an einzelnen Lampen, nicht auf der ganzen Wand. Damit gibt
// es den Effekt, ohne dass die Zusage aus FARBWIRKUNG.md faellt - und die
// Abnahme misst beides: die Blitzrate *und* den Flaechenanteil.

import { mitAlpha } from './farben.js';

const kl = (x, a, b) => (x < a ? a : x > b ? b : x);

/** Ein weicher Leuchtfleck als vorgerechnetes Bild, je Farbe einmal. */
const fleckVorrat = new Map();
export function fleck(farbe) {
  if (!fleckVorrat.has(farbe)) {
    const r = 64;
    const c = document.createElement('canvas');
    c.width = r * 2;
    c.height = r * 2;
    const s = c.getContext('2d');
    const v = s.createRadialGradient(r, r, 0, r, r, r);
    v.addColorStop(0, '#ffffff');
    v.addColorStop(0.16, farbe);
    v.addColorStop(0.45, mitAlpha(farbe, 0.4));
    v.addColorStop(1, mitAlpha(farbe, 0));
    s.fillStyle = v;
    s.fillRect(0, 0, r * 2, r * 2);
    fleckVorrat.set(farbe, c);
    if (fleckVorrat.size > 40) fleckVorrat.clear();
  }
  return fleckVorrat.get(farbe);
}

/* --- Beams: die Architektur in der Luft ------------------------------------
 *
 * Das Gewerk, das eine Projektion am staerksten nach Konzert aussehen laesst.
 * Schmale Strahlen, die von oben herunterkommen, sich faechern, und auf
 * Schlaegen ihre Stellung wechseln.
 *
 * Zwei Regeln aus der Praxis stecken darin:
 *
 *   Sie fahren *gemeinsam*, nicht einzeln. Ein Faecher, der sich oeffnet und
 *   schliesst, ist ein Bild; zwoelf Strahlen, die einzeln herumsuchen, sind
 *   Unruhe.
 *
 *   Sie schalten hart auf den Schlag und fahren weich dazwischen. Ein Strahl,
 *   der immer nur weich faehrt, verliert den Bezug zur Musik; einer, der nur
 *   springt, sieht kaputt aus.
 */
export class Beams {
  constructor(anzahl = 8) {
    this.anzahl = anzahl;
    this.faecher = 0.5;
    this.faecherZiel = 0.5;
    this.neigung = 0.5;
    this.neigungZiel = 0.5;
    this.schwenk = 0;
    this.schwenkZiel = 0;
    this.letzterBeat = -1;
  }

  fortschreiben(sekunden, takt, wucht, kraft) {
    const t = kl(sekunden * 6, 0, 1);
    this.faecher += (this.faecherZiel - this.faecher) * t;
    this.neigung += (this.neigungZiel - this.neigung) * t;
    this.schwenk += (this.schwenkZiel - this.schwenk) * t;
    if (takt && takt.nummer !== this.letzterBeat) {
      this.letzterBeat = takt.nummer;
      // Alle zwei Schlaege eine neue Stellung, auf der Eins eine groessere.
      if (takt.nummer % 2 === 0) {
        this.faecherZiel = 0.25 + Math.random() * 0.75 * kraft;
        this.schwenkZiel = (Math.random() - 0.5) * 0.7 * kraft;
      }
      if (takt.aufEins) this.neigungZiel = 0.3 + Math.random() * 0.6;
    }
  }

  zeichnen(stift, breite, hoehe, farbe, kraft) {
    if (kraft < 0.02) return;
    const n = this.anzahl;
    for (let i = 0; i < n; i++) {
      // Die Quelle: gleichmaessig ueber die Oberkante verteilt.
      const qx = ((i + 0.5) / n) * breite;
      const qy = -hoehe * 0.02;
      // Das Ziel faechert um die Mitte - genau das macht einen Faecher aus.
      const mitte = breite * 0.5;
      const spreizung = (qx - mitte) * (0.6 + this.faecher * 2.6);
      const zx = mitte + spreizung + this.schwenk * breite * 0.35;
      const zy = hoehe * (0.35 + this.neigung * 0.75);

      const laenge = Math.hypot(zx - qx, zy - qy);
      const w = breite * 0.006 * (0.7 + kraft * 0.6);
      const v = stift.createLinearGradient(qx, qy, zx, zy);
      v.addColorStop(0, farbe);
      v.addColorStop(0.15, mitAlpha(farbe, 0.55));
      v.addColorStop(1, mitAlpha(farbe, 0));
      stift.fillStyle = v;
      stift.globalAlpha = kl(kraft * 0.75, 0, 1);
      // Ein Strahl wird zur Spitze hin breiter - er faechert im Dunst auf.
      const nx = -(zy - qy) / laenge;
      const ny = (zx - qx) / laenge;
      stift.beginPath();
      stift.moveTo(qx - nx * w * 0.5, qy - ny * w * 0.5);
      stift.lineTo(qx + nx * w * 0.5, qy + ny * w * 0.5);
      stift.lineTo(zx + nx * w * 2.2, zy + ny * w * 2.2);
      stift.lineTo(zx - nx * w * 2.2, zy - ny * w * 2.2);
      stift.closePath();
      stift.fill();
    }
    stift.globalAlpha = 1;
  }
}

/* --- Publikumsblinder -------------------------------------------------------
 *
 * Die Lampen, die *nicht* die Wand anleuchten, sondern nach vorn ins
 * Publikum. In der Fachliteratur ausdruecklich fuer "musical climaxes,
 * transitions, or call-and-response" - also nicht fuer nebenbei.
 *
 * Dargestellt als warme Scheiben am oberen Rand, die aufbluehen. Warmweiss
 * und nicht in der Palettenfarbe: Ein Blinder ist eine Halogenlampe, und der
 * Unterschied zum bunten Rest ist genau das, was ihn wirken laesst.
 */
export class Blinder {
  constructor(anzahl = 6, deckel = 1) {
    this.anzahl = anzahl;
    this.staerke = 0;
    /*
     * Ein Deckel auf die Helligkeit. Steht auf 1 und wird nicht gebraucht -
     * er ist die Stellschraube fuer den Aufbau vor Ort.
     *
     * Der Blinder ist mit weitem Abstand das hellste Gewerk: allein
     * gemessen 0,0756 mittlere Leuchtdichte, wo die Flamme bei 0,0140 und
     * die Blitze bei 0,0032 liegen. In der fertigen Show kommt das hellste
     * Bild damit auf 0,068 gegen eine Blitzschwelle von 0,10 - genug Luft,
     * also bleibt er ungedeckelt.
     *
     * Gemessen wird das aber auf einer gerechneten Leinwand. Wie hell eine
     * echte Wand wird, haengt am Beamer, am Abstand und daran, wie dunkel
     * der Hof ist. Faellt beim Aufbau auf, dass es blendet, ist das hier
     * die eine Zahl, an der man dreht, ohne sonst etwas anzufassen.
     *
     * Warum ein Faktor und nicht einfach kleinere Zahlen darunter: Die
     * Leinwand addiert in sRGB-Bytes, die Leuchtdichte rechnet mit dem
     * Exponenten 2,4 dagegen. Beides zusammen ist konvex, und deshalb
     * addieren sich Anteile nicht - Punkte allein 0,0393, Glut allein
     * 0,0069, beide zusammen 0,0756 statt 0,0462. Was ein Bild am Ende
     * wiegt, laesst sich darum nicht ausrechnen, nur messen.
     */
    this.deckel = deckel;
  }

  zuenden(wieviel = 1) {
    this.staerke = Math.min(1, this.staerke + wieviel);
  }

  fortschreiben(sekunden) {
    // Halogen glueht nach - ein Blinder geht nie hart aus.
    if (this.staerke > 0) this.staerke = Math.max(0, this.staerke - sekunden * 2.2);
  }

  zeichnen(stift, breite, hoehe) {
    if (this.staerke < 0.02) return;
    const warm = 'hsl(38 85% 66%)';
    const b = fleck(warm);
    const y = hoehe * 0.07;
    for (let i = 0; i < this.anzahl; i++) {
      const x = ((i + 0.5) / this.anzahl) * breite;
      const gr = breite * (0.05 + this.staerke * 0.09);
      stift.globalAlpha = kl(this.staerke * 0.9 * this.deckel, 0, 1);
      stift.drawImage(b, x - gr, y - gr, gr * 2, gr * 2);
    }
    // Und der Schein, den sie in den Raum werfen.
    const v = stift.createLinearGradient(0, 0, 0, hoehe * 0.6);
    v.addColorStop(0, mitAlpha(warm, 0.5));
    v.addColorStop(1, mitAlpha(warm, 0));
    stift.fillStyle = v;
    stift.globalAlpha = this.staerke * 0.5 * this.deckel;
    stift.fillRect(0, 0, breite, hoehe * 0.6);
    stift.globalAlpha = 1;
  }
}

/* --- Blitze, klein gehalten -------------------------------------------------
 *
 * Ein echtes Stroboskop blitzt zehn- bis fuenfundzwanzigmal je Sekunde. Das
 * geht hier nicht, und der Ausweg steckt im Wortlaut der Blitzschwelle
 * selbst: Sie greift erst, wenn die Aenderung *mindestens ein Viertel* der
 * Bildflaeche betrifft.
 *
 * Also blitzen hier einzelne kleine Lampen und nicht die Wand. Der Effekt ist
 * da - das Auge liest eine Reihe zuckender Punkte sofort als Stroboskop -,
 * und die Flaeche bleibt weit unter einem Viertel. Die Abnahme misst genau
 * das nach.
 */
export class Blitze {
  constructor(anzahl = 10) {
    this.anzahl = anzahl;
    this.phase = 0;
    this.an = false;
    this.muster = 0;
  }

  fortschreiben(sekunden, tempo) {
    this.phase += sekunden * tempo;
  }

  zeichnen(stift, breite, hoehe, kraft) {
    if (!this.an || kraft < 0.05) return;
    const schritt = Math.floor(this.phase);
    const weiss = 'hsl(210 30% 92%)';
    const b = fleck(weiss);
    const y = hoehe * 0.14;
    for (let i = 0; i < this.anzahl; i++) {
      /*
       * Nicht alle zugleich. Vier Muster - alle, jede zweite, von aussen
       * nach innen, zufaellig - und sie wechseln mit dem Schritt. Alle
       * zugleich waere sowohl langweilig als auch am naechsten an der
       * Flaechengrenze.
       */
      const m = (schritt + this.muster) % 4;
      const dran = m === 0 ? true
        : m === 1 ? i % 2 === (schritt % 2)
          : m === 2 ? Math.abs(i - (this.anzahl - 1) / 2) > (schritt % 3)
            : ((i * 2654435761 + schritt * 40503) >>> 8) % 3 === 0;
      if (!dran) continue;
      const x = ((i + 0.5) / this.anzahl) * breite;
      // Innerhalb eines Schritts kurz an, lang aus - das macht den Blitz.
      const u = this.phase - schritt;
      const hell = u < 0.35 ? 1 - u / 0.35 : 0;
      if (hell <= 0) continue;
      const gr = breite * 0.022;
      stift.globalAlpha = kl(hell * kraft, 0, 1);
      stift.drawImage(b, x - gr, y - gr, gr * 2, gr * 2);
    }
    stift.globalAlpha = 1;
  }
}

/* --- Die Spiegelkugel -------------------------------------------------------
 *
 * Das einzige Gewerk, das die Buehne fuer sich allein braucht - und zwar aus
 * einem sachlichen Grund und nicht aus Geschmack: Eine Spiegelkugel *ist*
 * nichts weiter als ein Feld wandernder Lichtpunkte. Laeuft daneben ein Wash,
 * verschwinden die Punkte im Grundlicht, und uebrig bleibt eine leicht
 * fleckige Wand.
 *
 * Deshalb schaltet die Regie beim Bild "Kugel" alles andere ab. Das ist
 * zugleich der wertvollste Baustein fuer einen langen Abend: Er ist ruhig,
 * er wiederholt sich nie genau, und er traegt minutenlang.
 */
export class Kugel {
  constructor(punkte = 90) {
    this.winkel = 0;
    this.punkte = Array.from({ length: punkte }, (_, i) => {
      /*
       * Gleichmaessig ueber eine Kugel verteilt, nicht ueber Laengen- und
       * Breitengrade: Sonst draengen sich die Punkte an den Polen, und man
       * sieht der Kugel an, dass sie gerechnet ist. Die Fibonacci-Spirale ist
       * das uebliche Mittel dagegen.
       */
      const y = 1 - (i / (punkte - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = i * Math.PI * (3 - Math.sqrt(5));
      return { x: Math.cos(phi) * r, y, z: Math.sin(phi) * r };
    });
  }

  fortschreiben(sekunden, tempo) {
    this.winkel += sekunden * tempo;
  }

  zeichnen(stift, breite, hoehe, farbe, kraft) {
    if (kraft < 0.02) return;
    const b = fleck(farbe);
    const c = Math.cos(this.winkel);
    const s = Math.sin(this.winkel);
    for (const p of this.punkte) {
      // Um die senkrechte Achse drehen.
      const x = p.x * c - p.z * s;
      const z = p.x * s + p.z * c;
      /*
       * Nur die dem Betrachter *abgewandte* Haelfte wirft Punkte nach vorn -
       * die zugewandten Spiegel werfen sie nach hinten. Das ist der Grund,
       * warum die Punkte einer echten Kugel immer von einer Seite kommen und
       * zur anderen verschwinden.
       */
      if (z < 0) continue;
      /*
       * Die Punkte laufen ueber die *ganze* Wand, nicht nur um die Kugel:
       * Der Strahl geht von der Kugel weg und trifft die Wand weit
       * ausserhalb. Der Faktor streckt genau das.
       */
      const px = 0.5 + x * 0.85;
      const py = 0.42 + p.y * 0.62;
      if (px < -0.05 || px > 1.05 || py < -0.05 || py > 1.05) continue;
      // Weiter aussen laenger und schwaecher - der Strahl trifft schraeg auf.
      const schraeg = 1 + Math.abs(x) * 1.6;
      const gr = breite * 0.011 * schraeg;
      stift.globalAlpha = kl(kraft * (0.35 + z * 0.65) / schraeg, 0, 1);
      stift.drawImage(b, px * breite - gr, py * hoehe - gr / schraeg,
        gr * 2, (gr * 2) / schraeg);
    }
    stift.globalAlpha = 1;
  }
}

/* --- Flammen ----------------------------------------------------------------
 *
 * Der teuerste Akzent einer echten Show, und deshalb der seltenste: Ein
 * Flammenprojektor kostet Gas, Genehmigung und Sicherheitsabstand. Genau
 * dieses Verhaeltnis wird hier nachgebaut - die Regie zuendet sie mit langer
 * Sperrzeit, und dadurch bleibt der Effekt ein Ereignis.
 *
 * Gezeichnet als aufsteigende, flackernde Saeule: unten hell und weiss, oben
 * rot und ausfransend. Genau in dieser Reihenfolge - eine Flamme, die unten
 * rot ist, sieht aus wie Farbe und nicht wie Feuer.
 */
export class Flammen {
  constructor(stellen = [0.2, 0.5, 0.8]) {
    this.stellen = stellen;
    this.leben = stellen.map(() => 0);
  }

  zuenden(welche = null) {
    if (welche === null) this.leben = this.leben.map(() => 1);
    else this.leben[welche % this.leben.length] = 1;
  }

  fortschreiben(sekunden) {
    this.leben = this.leben.map((l) => Math.max(0, l - sekunden * 1.15));
  }

  zeichnen(stift, breite, hoehe, zeit) {
    for (let i = 0; i < this.stellen.length; i++) {
      const l = this.leben[i];
      if (l < 0.02) continue;
      // Anschwellen und abfallen - eine Flamme kommt nicht sofort auf voll.
      const u = 1 - l;
      const stark = Math.min(1, u * 5) * l;
      const x = this.stellen[i] * breite;
      const fuss = hoehe * 0.97;
      const hoch = hoehe * 0.55 * stark;

      for (let k = 0; k < 3; k++) {
        // Drei Zungen mit eigenem Flackern - eine einzelne Form sieht steif aus.
        const flacker = Math.sin(zeit * (11 + k * 3.7) + i * 2.1) * 0.5 + 0.5;
        const h = hoch * (0.6 + flacker * 0.55);
        const w = breite * 0.022 * (0.7 + flacker * 0.5);
        const neigung = Math.sin(zeit * (4 + k) + i) * breite * 0.02;
        const v = stift.createLinearGradient(x, fuss, x + neigung, fuss - h);
        v.addColorStop(0, 'hsl(48 100% 88%)');
        v.addColorStop(0.2, 'hsl(38 100% 62%)');
        v.addColorStop(0.6, mitAlpha('hsl(20 100% 52%)', 0.55));
        v.addColorStop(1, mitAlpha('hsl(8 100% 45%)', 0));
        stift.fillStyle = v;
        stift.globalAlpha = kl(stark * (0.85 - k * 0.2), 0, 1);
        stift.beginPath();
        stift.moveTo(x - w, fuss);
        stift.quadraticCurveTo(x - w * 0.8, fuss - h * 0.5, x + neigung, fuss - h);
        stift.quadraticCurveTo(x + w * 0.8, fuss - h * 0.5, x + w, fuss);
        stift.closePath();
        stift.fill();
      }
      // Der Lichtschein am Boden.
      const b = fleck('hsl(30 100% 60%)');
      const gr = breite * 0.09 * stark;
      stift.globalAlpha = stark * 0.7;
      stift.drawImage(b, x - gr, fuss - gr * 0.6, gr * 2, gr * 1.2);
    }
    stift.globalAlpha = 1;
  }
}

/* --- CO2-Saeulen ------------------------------------------------------------
 *
 * Kurz, weiss, hart. Anders als eine Flamme steigt eine CO2-Saeule nicht auf,
 * sondern *schiesst* - sie ist in einem Sekundenbruchteil oben und loest sich
 * dann auf. Genau dieser Unterschied macht sie zu einem anderen Akzent.
 */
export class Nebelstoss {
  constructor(stellen = [0.12, 0.88]) {
    this.stellen = stellen;
    this.leben = stellen.map(() => 0);
  }

  zuenden() { this.leben = this.leben.map(() => 1); }

  fortschreiben(sekunden) {
    this.leben = this.leben.map((l) => Math.max(0, l - sekunden * 0.9));
  }

  zeichnen(stift, breite, hoehe) {
    for (let i = 0; i < this.stellen.length; i++) {
      const l = this.leben[i];
      if (l < 0.02) continue;
      const u = 1 - l;
      // Die Saeule ist nach einem Fuenftel der Zeit auf voller Hoehe.
      const hoch = hoehe * 0.8 * Math.min(1, u * 5);
      const x = this.stellen[i] * breite;
      const fuss = hoehe * 0.95;
      const w = breite * (0.018 + u * 0.05);
      const v = stift.createLinearGradient(x, fuss, x, fuss - hoch);
      v.addColorStop(0, mitAlpha('hsl(200 20% 96%)', 0.85 * l));
      v.addColorStop(0.5, mitAlpha('hsl(200 20% 96%)', 0.45 * l));
      v.addColorStop(1, mitAlpha('hsl(200 20% 96%)', 0));
      stift.fillStyle = v;
      stift.globalAlpha = 1;
      stift.beginPath();
      stift.moveTo(x - w * 0.4, fuss);
      stift.lineTo(x + w * 0.4, fuss);
      stift.lineTo(x + w * 1.8, fuss - hoch);
      stift.lineTo(x - w * 1.8, fuss - hoch);
      stift.closePath();
      stift.fill();
    }
  }
}

/* --- Kaltfunken -------------------------------------------------------------
 *
 * Funkenfontaenen, wie sie auf jeder Buehne stehen. Anders als alles andere
 * hier haben sie *Schwerkraft* - und genau daran erkennt man sie: Ein
 * Lichtpunkt, der einen Bogen fliegt und faellt, ist ein Funke; einer, der
 * schwebt, ist Staub.
 */
export class Funken {
  constructor(stellen = [0.3, 0.7]) {
    this.stellen = stellen;
    this.teilchen = [];
  }

  zuenden(wieviele = 70) {
    for (const s of this.stellen) {
      for (let i = 0; i < wieviele / this.stellen.length; i++) {
        if (this.teilchen.length > 260) break;
        const streu = (Math.random() - 0.5) * 0.5;
        this.teilchen.push({
          x: s + streu * 0.02,
          y: 0.96,
          vx: streu * 0.25,
          vy: -(0.75 + Math.random() * 0.55),
          alter: 0,
          leben: 0.9 + Math.random() * 0.9,
        });
      }
    }
  }

  fortschreiben(sekunden) {
    const uebrig = [];
    for (const p of this.teilchen) {
      p.alter += sekunden;
      if (p.alter >= p.leben) continue;
      p.vy += sekunden * 1.5; // Schwerkraft
      p.x += p.vx * sekunden;
      p.y += p.vy * sekunden;
      if (p.y > 1.02) continue;
      uebrig.push(p);
    }
    this.teilchen = uebrig;
  }

  zeichnen(stift, breite, hoehe) {
    if (!this.teilchen.length) return;
    stift.fillStyle = 'hsl(45 100% 85%)';
    for (const p of this.teilchen) {
      const u = p.alter / p.leben;
      stift.globalAlpha = kl((1 - u) * 0.95, 0, 1);
      const gr = breite * 0.0022 * (1 - u * 0.5);
      // Ein kurzer Strich in Flugrichtung, kein Punkt - das ist die
      // Bewegungsunschaerfe, die ein Funke im Auge hinterlaesst.
      stift.fillRect(p.x * breite - gr, p.y * hoehe - gr, gr * 2, gr * 2 + Math.abs(p.vy) * hoehe * 0.012);
    }
    stift.globalAlpha = 1;
  }
}
