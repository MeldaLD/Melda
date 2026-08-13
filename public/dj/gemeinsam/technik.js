// Was steckt in diesem Geraet, und wird es benutzt?
//
// Diese Datei beantwortet eine Frage, die man aus der Ferne nicht raten kann:
// Rechnet auf dem iPad, dem Telefon, dem Spiele-PC wirklich die Grafikeinheit -
// oder faellt der Browser still auf eine Nachbildung in Software zurueck und
// alles laeuft nur *irgendwie*? Der Unterschied sind zwei Groessenordnungen,
// und man sieht ihn dem Bild nicht unbedingt an: Ein zugedrehter Regler macht
// aus einer Notloesung ein fluessiges, nur eben grobes Bild.
//
// Drei Arten von Auskunft, und sie sind unterschiedlich viel wert:
//
//   1. Was das Geraet ueber sich *sagt* - Name der Karte, Grenzen des
//      Treibers, Kerne, Speicher. Billig zu haben, aber Browser luegen hier
//      absichtlich: Safari verschweigt den Kartennamen, weil er sich zum
//      Wiedererkennen missbrauchen laesst.
//   2. Was sich *messen* laesst - die reine Rechenzeit der Karte je Bild aus
//      EXT_disjoint_timer_query_webgl2, der Durchsatz in Punkt-Schritten je
//      Millisekunde. Das ist die belastbare Auskunft, weil sie nicht davon
//      abhaengt, was jemand behauptet.
//   3. Was sich daraus *schliessen* laesst - siehe urteil() unten.
//
// Nichts hiervon laeuft im Normalbetrieb mit. Es wird erst gesammelt, wenn
// jemand die Anzeige aufklappt.

import { gpuAuskunft } from './mandelgpu.js';

/*
 * Ab hier gilt eine Grafikeinheit als echt.
 *
 * Der Durchsatz zaehlt Punkt-Schritte je Millisekunde: Bildpunkte mal
 * Iterationen, geteilt durch die gebrauchte Zeit. Die Zahl trennt sauber,
 * weil sie um Groessenordnungen auseinanderliegt und nicht um Prozente -
 * nachgemessen liefert der Nachbau in Software (SwiftShader) 125 000 bis
 * 188 000, jede halbwegs aktuelle Grafikeinheit ueber 10 000 000.
 */
const ECHTE_KARTE_AB = 2e6;

// Namen, die eine Nachbildung in Software verraten. Kein Beweis - der Name
// kann fehlen -, aber wenn er dasteht, ist die Sache klar.
const SOFTWARE_NAMEN = /swiftshader|llvmpipe|softpipe|software|microsoft basic|generic renderer/i;

function rund(wert, stellen = 1) {
  return typeof wert === 'number' && Number.isFinite(wert) ? Number(wert.toFixed(stellen)) : null;
}

/**
 * Alles einsammeln. `mandel` ist window.__mandel, also der laufende Stand des
 * Fraktals; ohne ihn kommt trotzdem alles Uebrige.
 */
export async function technikSammeln(mandel = null, bild = null) {
  const gpu = gpuAuskunft();
  const auskunft = {
    gpu,
    webgpu: await webgpuFragen(),
    geraet: geraetFragen(),
    bildschirm: bildschirmFragen(),
    speicher: speicherFragen(),
    fraktal: fraktalFragen(mandel, bild),
  };
  auskunft.urteil = urteil(auskunft);
  return auskunft;
}

// --- WebGPU ---------------------------------------------------------------
//
// Wir zeichnen mit WebGL 2, nicht mit WebGPU. Trotzdem lohnt die Frage: Der
// WebGPU-Adapter nennt Hersteller und Architektur auch dort, wo WebGL den
// Namen verschweigt - auf einem iPad steht damit "apple / apple-m" statt
// "WebKit WebGL". Es ist die zweite Quelle fuer dieselbe Frage.

// Einmal fragen reicht - der Adapter aendert sich nicht, und ihn im
// Sekundentakt neu anzufordern waere Arbeit fuer nichts.
let webgpuGemerkt = null;

async function webgpuFragen() {
  if (webgpuGemerkt) return webgpuGemerkt;
  webgpuGemerkt = await webgpuErmitteln();
  return webgpuGemerkt;
}

async function webgpuErmitteln() {
  if (typeof navigator === 'undefined' || !navigator.gpu) return { da: false };
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return { da: false, grund: 'kein Adapter' };
    const info = adapter.info ?? (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null);
    return {
      da: true,
      hersteller: info?.vendor ?? null,
      architektur: info?.architecture ?? null,
      geraet: info?.device ?? null,
      beschreibung: info?.description ?? null,
      // Ein Adapter, der sich selbst als Notloesung ausweist. Genau die Frage.
      notloesung: adapter.isFallbackAdapter === true,
      arbeitsgruppe: adapter.limits?.maxComputeInvocationsPerWorkgroup ?? null,
      texturKante: adapter.limits?.maxTextureDimension2D ?? null,
    };
  } catch (grund) {
    return { da: false, grund: String(grund?.message ?? grund) };
  }
}

// --- Geraet und Browser ----------------------------------------------------

function geraetFragen() {
  if (typeof navigator === 'undefined') return {};
  return {
    kerne: navigator.hardwareConcurrency ?? null,
    // Nur Chrome, und absichtlich grob gerundet. Fehlt auf Safari.
    arbeitsspeicherGb: navigator.deviceMemory ?? null,
    platform: navigator.platform ?? null,
    kennung: navigator.userAgent ?? '',
    // Auf iOS/iPadOS meldet Safari sich seit Jahren als Desktop-Mac. Der
    // Beruehrungspunkt verraet das Geraet trotzdem.
    beruehrung: navigator.maxTouchPoints ?? 0,
    sparmodus: navigator.connection?.saveData ?? null,
    netz: navigator.connection?.effectiveType ?? null,
  };
}

function bildschirmFragen() {
  if (typeof window === 'undefined') return {};
  const passt = (frage) => (window.matchMedia ? window.matchMedia(frage).matches : null);
  return {
    fensterBreite: window.innerWidth,
    fensterHoehe: window.innerHeight,
    punkteJePunkt: window.devicePixelRatio ?? 1,
    schirmBreite: window.screen?.width ?? null,
    schirmHoehe: window.screen?.height ?? null,
    farbtiefe: window.screen?.colorDepth ?? null,
    // Sagt, ob der Bildschirm mehr als die ueblichen Farben kann.
    weiterFarbraum: passt('(dynamic-range: high)'),
    // Wer das eingeschaltet hat, will keine grossen Bewegungen sehen.
    wenigBewegung: passt('(prefers-reduced-motion: reduce)'),
  };
}

function speicherFragen() {
  const m = typeof performance !== 'undefined' ? performance.memory : null;
  if (!m) return { da: false };
  return {
    da: true,
    benutztMb: rund(m.usedJSHeapSize / 1048576, 0),
    reserviertMb: rund(m.totalJSHeapSize / 1048576, 0),
    grenzeMb: rund(m.jsHeapSizeLimit / 1048576, 0),
  };
}

// --- Der laufende Stand des Fraktals ---------------------------------------

function fraktalFragen(mandel, bild) {
  // Der Modus wechselt mit dem Track. Nur das Fraktal rechnet auf der
  // Grafikkarte; alle anderen Bilder entstehen auf der 2D-Leinwand, also auf
  // dem Hauptprozessor. Ohne diese Auskunft liest sich "Fraktal laeuft nicht"
  // wie ein Fehler, obwohl gerade nur etwas anderes zu sehen ist.
  const modus = bild?.letzterModusName ?? null;
  if (!mandel || modus !== 'Mandelbrot') return { da: false, modus };
  const punkte = (mandel.breite ?? 0) * (mandel.breite ?? 0) * 0.5625;
  return {
    da: true,
    aufGpu: mandel.aufGpu === true,
    // Die Aufloesung, mit der wirklich gerechnet wird. Ueber 1 heisst
    // Ueberabtastung - vier gerechnete Punkte je gezeigtem.
    guete: rund(mandel.guete, 2),
    bremse: rund(mandel.bremse, 2),
    breite: mandel.breite ?? null,
    punkte: Math.round(punkte),
    schritte: mandel.schritte ?? null,
    tiefe: rund(mandel.tiefe, 2),
    ziel: mandel.ziel ?? null,
    // Punkt-Schritte je Millisekunde - das Mass, das eine Grafikkarte von
    // einem Nachbau in Software unterscheidet.
    durchsatz: mandel.durchsatz ?? null,
    abstandMs: rund(mandel.abstandMs, 1),
    taktMs: rund(mandel.taktMs, 1),
    guetestufe: bild?.guetestufe ?? null,
    ueberzugMs: rund(bild?.bildMs, 2),
  };
}

// --- Was heisst das nun? ---------------------------------------------------

/*
 * Aus den Zahlen eine Aussage machen.
 *
 * Das ist der eigentliche Zweck der Anzeige. Eine Liste von zwanzig Werten
 * beantwortet die Frage "wird meine Hardware genutzt" naemlich nicht - man
 * muss wissen, welche Zahl wofuer steht. Also steht das Urteil oben, und die
 * Zahlen darunter belegen es.
 */
function urteil(a) {
  const zeilen = [];
  const name = a.gpu.karte || a.gpu.karteRoh || '';
  const durchsatz = a.fraktal.durchsatz ?? 0;

  // 1. Rechnet die Grafikeinheit?
  if (!a.gpu.da) {
    zeilen.push([
      'schlecht',
      'Kein WebGL 2 - dieser Browser gibt gar keine Grafikbeschleunigung heraus. ' +
        'Das Fraktal rechnet dann auf dem Hauptprozessor.',
    ]);
  } else if (!a.fraktal.da) {
    zeilen.push([
      'offen',
      `WebGL 2 ist da${name ? ` (${name})` : ''}, aber gerade laeuft der Modus "${a.fraktal.modus ?? 'unbekannt'}". ` +
        'Nur das Mandelbrot rechnet auf der Grafikkarte - alle anderen Bilder entstehen auf der 2D-Leinwand. ' +
        'Fuer die Messung oben auf "Bild: Mandelbrot" stellen.',
    ]);
  } else if (!a.fraktal.aufGpu) {
    // Der Grund ist wichtiger als die Feststellung: "zu langsam" und "gar
    // keine Karte da" fuehren zu ganz verschiedenen Handgriffen.
    zeilen.push([
      'schlecht',
      SOFTWARE_NAMEN.test(name)
        ? `Das Fraktal rechnet auf dem Hauptprozessor - und das zu Recht: "${name}" ist eine ` +
          'Nachbildung in Software. In diesem Browser ist die Hardwarebeschleunigung aus oder ' +
          'es gibt keine nutzbare Grafikeinheit.'
        : 'Das Fraktal rechnet auf dem Hauptprozessor - die Notfassung. Die Karte hat gemeldet, ' +
          'sie sei da, war aber zu langsam. Unter Windows waehlt der Browser manchmal die ' +
          'eingebaute statt der eingesteckten Karte.',
    ]);
  } else if (SOFTWARE_NAMEN.test(name)) {
    zeilen.push([
      'schlecht',
      `"${name}" ist eine Nachbildung in Software, keine Grafikkarte. Im Browser fehlt wohl die Hardwarebeschleunigung.`,
    ]);
  } else if (durchsatz >= ECHTE_KARTE_AB) {
    zeilen.push([
      'gut',
      `Die Grafikeinheit rechnet${name ? ` (${name})` : ''} - ${(durchsatz / 1e6).toFixed(1)} Millionen Punkt-Schritte je Millisekunde.`,
    ]);
  } else if (durchsatz > 0) {
    zeilen.push([
      'schlecht',
      `Nur ${(durchsatz / 1e3).toFixed(0)} Tausend Punkt-Schritte je Millisekunde. Das ist Software-Tempo, keine Grafikkarte.`,
    ]);
  }

  // 2. Wie ausgelastet ist sie?
  if (a.gpu.zeitmessung && a.gpu.gpuMs !== null && a.fraktal.abstandMs) {
    const anteil = (a.gpu.gpuMs / a.fraktal.abstandMs) * 100;
    const wie =
      anteil > 90
        ? ['schlecht', 'am Anschlag - mehr Bild geht nur mit weniger Aufloesung']
        : anteil > 60
          ? ['gut', 'gut ausgelastet']
          : ['gut', 'viel Luft'];
    zeilen.push([
      wie[0],
      `Die Karte rechnet ${a.gpu.gpuMs.toFixed(2)} ms je Bild von ${a.fraktal.abstandMs} ms - ${anteil.toFixed(0)} Prozent, ${wie[1]}.`,
    ]);
  } else if (a.gpu.da) {
    zeilen.push([
      'offen',
      'Dieser Browser gibt die GPU-Zeitmessung nicht heraus (Safari tut das nie). Die Auslastung ist deshalb nicht direkt messbar.',
    ]);
  }

  // 3. Trifft das Bild den Takt des Bildschirms?
  if (a.fraktal.abstandMs && a.fraktal.taktMs) {
    const bilder = 1000 / a.fraktal.abstandMs;
    const moeglich = 1000 / a.fraktal.taktMs;
    zeilen.push([
      a.fraktal.abstandMs <= a.fraktal.taktMs * 1.25 ? 'gut' : 'schlecht',
      `${bilder.toFixed(0)} Bilder je Sekunde bei einem Bildschirm, der ${moeglich.toFixed(0)} hergibt.`,
    ]);
  }

  // 4. Und die Aufloesung, in der wirklich gerechnet wird.
  if (a.fraktal.da) {
    const g = a.fraktal.guete ?? 0;
    zeilen.push([
      g >= 1 ? 'gut' : g >= 0.6 ? 'offen' : 'schlecht',
      g >= 1
        ? `Gerechnet wird mit ${g}-facher Aufloesung - ueber der Anzeige, also mit Ueberabtastung.`
        : `Gerechnet wird mit ${(g * 100).toFixed(0)} Prozent der Anzeigeaufloesung; das Bild wird hochskaliert.`,
    ]);
  }

  return zeilen;
}

/**
 * Die Auskunft als Text - zum Kopieren und Verschicken.
 *
 * Der eigentliche Zweck: Wer auf dem Telefon steht und wissen will, warum es
 * dort ruckelt, kann das Ergebnis nicht abtippen.
 */
export function technikAlsText(a) {
  const zeilen = [];
  const raus = (name, wert) => {
    if (wert === null || wert === undefined || wert === '') return;
    zeilen.push(`${name.padEnd(22)} ${wert}`);
  };

  zeilen.push(`resident-dj – Technik  (${new Date().toLocaleString('de-DE')})`);
  zeilen.push('');
  for (const [art, satz] of a.urteil) zeilen.push(`[${art}] ${satz}`);

  zeilen.push('', '— Grafik (WebGL 2) —');
  if (a.gpu.da) {
    raus('Karte', a.gpu.karte || `${a.gpu.karteRoh} (Name verschwiegen)`);
    raus('Hersteller', a.gpu.hersteller || a.gpu.herstellerRoh);
    raus('Fassung', a.gpu.fassung);
    raus('Schattierer', a.gpu.schattierer);
    raus('groesste Textur', a.gpu.grenzen.textur);
    raus('Gleitkomma-Textur', a.gpu.grenzen.gleitkommaTextur ? 'ja' : 'nein');
    raus('Zeitmessung', a.gpu.zeitmessung ? `ja (${a.gpu.messungen} Messungen)` : 'nicht erlaubt');
    raus('reine GPU-Zeit', a.gpu.gpuMs === null ? null : `${a.gpu.gpuMs.toFixed(2)} ms je Bild`);
  } else {
    raus('WebGL 2', 'nicht vorhanden');
  }

  zeilen.push('', '— Grafik (WebGPU, nur zur Auskunft) —');
  if (a.webgpu.da) {
    raus('Hersteller', a.webgpu.hersteller);
    raus('Architektur', a.webgpu.architektur);
    raus('Geraet', a.webgpu.geraet || a.webgpu.beschreibung);
    raus('Notloesung', a.webgpu.notloesung ? 'ja' : 'nein');
  } else {
    raus('WebGPU', a.webgpu.grund ?? 'nicht vorhanden');
  }

  zeilen.push('', '— Fraktal —');
  if (a.fraktal.da) {
    raus('rechnet auf', a.fraktal.aufGpu ? 'Grafikkarte' : 'Hauptprozessor (Notfassung)');
    raus('Bildguete', a.fraktal.guetestufe);
    raus('Aufloesung', `${a.fraktal.guete} (${a.fraktal.breite} Punkte breit)`);
    raus('Bremse', a.fraktal.bremse);
    raus('Schritte je Punkt', a.fraktal.schritte);
    raus('Zoomtiefe', a.fraktal.tiefe);
    raus('Stelle', a.fraktal.ziel);
    raus(
      'Durchsatz',
      a.fraktal.durchsatz
        ? `${(a.fraktal.durchsatz / 1e6).toFixed(2)} Mio Punkt-Schritte/ms`
        : null,
    );
    raus('Bildabstand', `${a.fraktal.abstandMs} ms`);
    raus('Bildschirmtakt', `${a.fraktal.taktMs} ms`);
    raus('Ueberzug zeichnen', `${a.fraktal.ueberzugMs} ms`);
  } else {
    raus('Fraktal', 'laeuft nicht');
  }

  zeilen.push('', '— Geraet —');
  raus('Kerne', a.geraet.kerne);
  raus('Arbeitsspeicher', a.geraet.arbeitsspeicherGb ? `ca. ${a.geraet.arbeitsspeicherGb} GB` : null);
  raus('Beruehrungspunkte', a.geraet.beruehrung);
  raus('Plattform', a.geraet.platform);
  raus('Netz', a.geraet.netz);
  raus('Kennung', a.geraet.kennung);

  zeilen.push('', '— Bildschirm —');
  raus('Fenster', `${a.bildschirm.fensterBreite} x ${a.bildschirm.fensterHoehe}`);
  raus('Bildschirm', `${a.bildschirm.schirmBreite} x ${a.bildschirm.schirmHoehe}`);
  raus('Punkte je Punkt', a.bildschirm.punkteJePunkt);
  raus('Farbtiefe', a.bildschirm.farbtiefe);
  raus('weiter Farbraum', a.bildschirm.weiterFarbraum === null ? null : a.bildschirm.weiterFarbraum ? 'ja' : 'nein');

  if (a.speicher.da) {
    zeilen.push('', '— Speicher (nur Chrome) —');
    raus('benutzt', `${a.speicher.benutztMb} MB von ${a.speicher.grenzeMb} MB`);
  }

  return zeilen.join('\n');
}
