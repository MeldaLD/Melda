// Alles, was du vor der Party einstellst, steht hier. Eine Datei, damit du am
// Abend nicht im Code suchen musst.

export const konfiguration = {
  // Wie der Abend heisst - steht gross auf dem Monitor.
  anlass: '30. Geburtstag',

  // Port des Servers. Gaeste erreichen die Abstimmung unter
  // http://<IP-des-Laptops>:<port>/p
  port: 3000,

  // Ordner mit deinen Musikdateien (relativ zum Projekt oder absolut).
  musikOrdner: './musik',

  // ------------------------------------------------------------------
  // Die Energiekurve: das Herzstueck. Erst chillig, spaeter haerter.
  // ------------------------------------------------------------------
  // Uhrzeit -> Zielenergie zwischen 0 (Ambient) und 1 (Brett).
  // Dazwischen wird linear interpoliert. Zeiten nach Mitternacht einfach
  // weiterzaehlen (25:00 = 1 Uhr nachts), dann gibt es keine Sprungstelle.
  energiekurve: [
    { zeit: '19:00', energie: 0.15 }, // Ankommen, Reden muss moeglich sein
    { zeit: '21:00', energie: 0.35 }, // Es fuellt sich
    { zeit: '22:30', energie: 0.55 }, // Erste tanzen
    { zeit: '24:00', energie: 0.75 }, // Der Laden laeuft
    { zeit: '25:30', energie: 0.9 }, // Haerter
    { zeit: '27:00', energie: 0.8 }, // Auslaufen
    { zeit: '28:00', energie: 0.5 },
  ],

  // Wie stark die Gaeste die Kurve verbiegen duerfen. 0.15 heisst: die
  // Abstimmung kann die Zielenergie um hoechstens +/- 0.15 verschieben.
  // Damit bleibt der Abend in deiner Hand, aber die Gaeste merken ihren Einfluss.
  stimmenEinfluss: 0.15,

  // ------------------------------------------------------------------
  // Mischen
  // ------------------------------------------------------------------
  mix: {
    // Laenge eines Uebergangs in Beats. 32 Beats sind bei 128 BPM 15 Sekunden.
    uebergangBeats: 32,
    // Wie weit das Tempo eines Tracks gezogen werden darf, bevor es unnatuerlich
    // klingt. 0.06 = +/- 6 Prozent. Darueber wird nicht mehr angeglichen.
    tempoToleranz: 0.06,
    // Zielkorridor beim Aussuchen: naechster Track darf so weit vom aktuellen
    // Tempo abweichen, sonst faellt er raus.
    bpmFenster: 0.1,
    // Wie viele Tracks ein gespielter Titel gesperrt bleibt.
    sperreNachTracks: 25,
  },

  // ------------------------------------------------------------------
  // Klangqualitaet
  // ------------------------------------------------------------------
  // Jeder Track bekommt beim Einlesen eine gemessene Note (siehe
  // einlesen/qualitaet.mjs). Statt schwaechere Aufnahmen auszusortieren,
  // setzen wir sie dort ein, wo sie nicht auffallen: Um 21 Uhr bei halber
  // Lautstaerke hoert man einen 16-kHz-Abbruch, um zwei Uhr im vollen Raum
  // niemand mehr. So bleibt ein YouTube-Wunsch spielbar, ohne dass er den
  // aufmerksamen Teil des Abends kostet.
  klang: {
    // Ab dieser Note gilt ein Track als einwandfrei und laeuft immer.
    guteNote: 0.85,
    // Wie viel Zielenergie ein gerade noch zugelassener Track braucht.
    maxAnforderung: 0.75,
    // Wie stark die Note bei sonst gleicher Passung den Ausschlag gibt.
    gewicht: 0.1,
    // Tracks ohne Messung (aelteres Material) werden so bewertet.
    annahmeOhneMessung: 0.8,
  },

  // ------------------------------------------------------------------
  // Abstimmung
  // ------------------------------------------------------------------
  abstimmung: {
    // Hoechstens jeder n-te Track ist ein Gaestewunsch. Der Rest kommt vom
    // Autopilot. Sonst zerlegt der erste Gast mit Handy den ganzen Abend.
    wunschJederNteTrack: 3,
    // Wie lange eine Richtungsstimme (chilliger/haerter) zaehlt, in Minuten.
    stimmeGiltMinuten: 20,
    // Wie viele offene Wuensche ein Geraet gleichzeitig haben darf.
    wuenscheProGeraet: 2,
  },
};

// Interpoliert die Zielenergie fuer einen Zeitpunkt aus der Kurve.
// `minuten` sind Minuten seit Mitternacht, Werte ueber 24h erlaubt.
export function zielenergie(minuten, kurve = konfiguration.energiekurve) {
  const punkte = kurve.map((p) => ({
    minuten: inMinuten(p.zeit),
    energie: p.energie,
  }));

  if (minuten <= punkte[0].minuten) return punkte[0].energie;
  const letzter = punkte[punkte.length - 1];
  if (minuten >= letzter.minuten) return letzter.energie;

  for (let i = 0; i < punkte.length - 1; i++) {
    const a = punkte[i];
    const b = punkte[i + 1];
    if (minuten >= a.minuten && minuten <= b.minuten) {
      const anteil = (minuten - a.minuten) / (b.minuten - a.minuten);
      return a.energie + anteil * (b.energie - a.energie);
    }
  }
  return letzter.energie;
}

// '25:30' -> 1530. Stunden ueber 24 sind erlaubt und meinen den Folgetag.
export function inMinuten(zeit) {
  const [h, m] = zeit.split(':').map(Number);
  return h * 60 + m;
}

// Jetzt als Minuten seit Mitternacht - nach 24 Uhr wird weitergezaehlt, solange
// es vor 10 Uhr morgens ist. Damit passt die Kurve ueber den Tageswechsel.
export function jetztInMinuten(datum = new Date()) {
  const minuten = datum.getHours() * 60 + datum.getMinutes();
  return datum.getHours() < 10 ? minuten + 24 * 60 : minuten;
}
