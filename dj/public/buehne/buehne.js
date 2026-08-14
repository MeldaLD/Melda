// Die Buehne: hier laeuft die Musik, hier sieht man beim Mischen zu, und hier
// dreht man waehrend der Entwicklung an allem, was sich einstellen laesst.
//
// Der Ablauf ist eine Schleife:
//   1. Server fragen, was als naechstes kommt
//   2. Den Track laden (oder erzeugen) und bereitlegen
//   3. Auf der naechsten Phrasengrenze ueberblenden
//   4. Dem Server melden, was jetzt laeuft
//
// Punkt 2 passiert mit Vorlauf, Punkt 3 haelt sich ans Raster.

import { Mixer, UEBERGAENGE } from '../gemeinsam/mixer.js';
import { demoBibliothek } from '../gemeinsam/demomusik.js';
import { leitungSuchen } from '../gemeinsam/leitung.js';
import { Visualisierung } from '../gemeinsam/visual.js';
import { technikSammeln, technikAlsText } from '../gemeinsam/technik.js';
import {
  reiheSetzen,
  MANDALAS,
  mandalasSetzen,
  mandalasAktive,
  mandalaBericht,
  bildzielSetzen,
} from '../gemeinsam/visualmodi.js';

const $ = (id) => document.getElementById(id);

// Wie viel Vorlauf: bei dieser Restzeit wird der naechste Track geladen …
const LADEN_AB_REST = 45;
// … und bei dieser der Uebergang eingeplant.
const UEBERBLENDEN_AB_REST = 25;

const welt = {
  ctx: null,
  mixer: null,
  leitung: null,
  demo: false,
  // Nur der laufende und der naechste Puffer bleiben liegen. Ueber sechs
  // Stunden ist das der Unterschied zwischen laeuft und stirbt: ein
  // dekodierter Sechsminueter belegt rund 60 MB.
  puffer: new Map(),
  bibliothek: [],
  naechster: null,
  naechsterGrund: null,
  laedt: false,
  wechselLaeuft: false,
  verlauf: [],
  angleichAn: true,
  stilleSeit: null,
  zielenergie: 0.5,
};

// Zustand offenlegen. Zwei Gruende: Die Abnahme prueft damit die Engine statt
// der Beschriftung, und wenn am Partyabend etwas klemmt, sieht man in der
// Browserkonsole sofort nach, was die Decks wirklich tun.
window.__dj = welt;

// --- Start ----------------------------------------------------------------

$('startDemo').addEventListener('click', () => starten(true));
$('startEcht').addEventListener('click', () => starten(false));

// Erst herausfinden, wo wir laufen: mit Server oder als reine Webseite.
welt.leitung = await leitungSuchen();

if (welt.leitung.art === 'allein') {
  // Ohne Bibliothek ist der Pruefstand die einzige Betriebsart - und genau
  // dafuer ist er gebaut.
  $('echtHinweis').textContent =
    'Noch keine Musik da. Im Adminbereich unter /admin/dj hochladen.';
  $('startEcht').disabled = true;
} else {
  const tracks = await welt.leitung.bibliothek();
  $('echtHinweis').textContent = tracks.length
    ? `${tracks.length} Tracks, vermessen und bereit.`
    : 'Noch leer – unter /admin/dj hochladen.';
  $('startEcht').disabled = tracks.length === 0;
}

async function starten(demo) {
  welt.demo = demo;
  $('startDemo').disabled = true;
  $('startEcht').disabled = true;

  try {
    welt.ctx = new (window.AudioContext ?? window.webkitAudioContext)({ sampleRate: 44100 });
    await welt.ctx.resume();
    welt.mixer = new Mixer(welt.ctx);

    if (demo) {
      $('startDemo').querySelector('span').textContent = 'Musik wird erzeugt …';
      // Kurz Luft lassen, damit der Text noch gezeichnet wird, bevor der
      // Hauptstrang mit dem Rechnen beschaeftigt ist.
      await new Promise((f) => setTimeout(f, 50));
      const erzeugt = demoBibliothek(welt.ctx);
      welt.bibliothek = erzeugt.map((e) => e.track);
      for (const eintrag of erzeugt) welt.puffer.set(eintrag.track.id, eintrag.puffer);
      // Auch die Gegenstelle soll sie kennen - dann funktionieren Auswahl,
      // Wuensche und Abstimmung genauso wie spaeter mit echter Musik.
      await welt.leitung.bibliothekSetzen(welt.bibliothek);
      $('pruefstandMarke').textContent =
        welt.leitung.art === 'allein' ? 'Prüfstand · ohne Server' : 'Prüfstand';
      $('pruefstandMarke').hidden = false;
    } else {
      welt.bibliothek = await welt.leitung.bibliothek();
    }

    $('startschirm').hidden = true;
    $('konsole').hidden = false;
    bild = new Visualisierung($('visual'));
    // Auch das Bild offenlegen: Am Abend laesst sich damit in der Konsole der
    // Modus umstellen, wenn einer gerade nicht zum Raum passt.
    welt.bild = bild;

    const erster = await naechstenErfragen();
    const puffer = await pufferFuer(erster);
    welt.mixer.ersterTrack(erster, puffer);
    await laufendMelden(erster);
    aufraeumen(erster.id);

    await naechstenVorbereiten();
    schleife();
  } catch (fehler) {
    $('startFehler').hidden = false;
    $('startFehler').textContent = `Start fehlgeschlagen: ${fehler.message}`;
    $('startDemo').disabled = false;
    $('startEcht').disabled = false;
    throw fehler;
  }
}

// --- Nachschub ------------------------------------------------------------

async function naechstenErfragen() {
  const bpm = welt.mixer?.laufendesDeck?.effektivBpm() ?? null;
  const { track, grund, ziel } = await welt.leitung.naechster(bpm);
  welt.naechsterGrund = { grund, ziel };
  return track;
}

async function pufferFuer(track) {
  if (welt.puffer.has(track.id)) return welt.puffer.get(track.id);

  // `quelle` ist eine fertige Adresse (Supabase), `datei` ein Name im
  // Musikordner des lokalen Servers. Die Buehne muss nicht wissen, welches
  // von beiden gerade der Fall ist.
  const adresse = track.quelle ?? `/musik/${encodeURIComponent(track.datei)}`;
  const antwort = await fetch(adresse);
  if (!antwort.ok) throw new Error(`${track.titel} liess sich nicht laden (${antwort.status})`);
  const roh = await antwort.arrayBuffer();
  const puffer = await welt.ctx.decodeAudioData(roh);
  welt.puffer.set(track.id, puffer);
  return puffer;
}

// Alles freigeben ausser dem, was jetzt laeuft und was gleich kommt. Im
// Pruefstand bleiben die erzeugten Puffer liegen - die sind der Bestand.
function aufraeumen(...behalten) {
  if (welt.demo) return;
  for (const id of welt.puffer.keys()) {
    if (!behalten.includes(id)) welt.puffer.delete(id);
  }
}

async function naechstenVorbereiten() {
  if (welt.laedt || welt.naechster) return;
  welt.laedt = true;
  try {
    const track = await naechstenErfragen();
    await pufferFuer(track);
    welt.naechster = track;
  } catch (fehler) {
    console.error('Nachschub fehlgeschlagen', fehler);
  } finally {
    welt.laedt = false;
  }
}

async function laufendMelden(track) {
  await welt.leitung.laeuftMelden(track, welt.naechster);
}

// --- Uebergang ------------------------------------------------------------

async function ueberblenden(artWunsch = null) {
  if (welt.wechselLaeuft) return;
  if (!welt.naechster) {
    await naechstenVorbereiten();
    if (!welt.naechster) return;
  }
  welt.wechselLaeuft = true;

  const track = welt.naechster;
  welt.naechster = null;

  try {
    const puffer = welt.puffer.get(track.id) ?? (await pufferFuer(track));
    const angepasst = welt.angleichAn ? track : { ...track, angleichDb: 0 };
    const plan = welt.mixer.uebergang(angepasst, puffer, artWunsch || null, welt.zielenergie);

    verlaufEintragen(plan);
    await laufendMelden(track);
    aufraeumen(track.id);

    // Nach dem Uebergang gleich den uebernaechsten vorbereiten.
    setTimeout(() => {
      welt.wechselLaeuft = false;
      naechstenVorbereiten();
    }, Math.max(500, (plan.endeZeit - welt.ctx.currentTime) * 1000));
  } catch (fehler) {
    console.error('Uebergang fehlgeschlagen', fehler);
    welt.wechselLaeuft = false;
  }
}

function verlaufEintragen(plan) {
  welt.verlauf.unshift({
    zeit: new Date(),
    art: plan.name,
    von: plan.vonTrack?.titel ?? '–',
    nach: plan.nachTrack?.titel ?? '–',
    hinweis: plan.grund
      ? plan.grund
      : plan.tempo?.art && plan.tempo.art !== 'direkt'
        ? `${plan.tempo.art}es Tempo`
        : `${Math.round((plan.tempo?.zug ?? 0) * 1000) / 10} % Zug`,
  });
  welt.verlauf = welt.verlauf.slice(0, 30);
  zeichneVerlauf();
}

// --- Wiedergabe anhalten und weiterlaufen lassen ---------------------------
//
// iOS friert den Tonkontext ein, sobald man die App wechselt oder das Display
// sperrt, und gibt ihn nur nach einer Beruehrung wieder frei. Ohne das hier
// stuende die Buehne danach stumm da und saehe kaputt aus.

async function tonWeiter() {
  if (!welt.ctx) return;
  try {
    await welt.ctx.resume();
  } catch {
    // Beim naechsten Antippen nochmal.
  }
  tonZustandZeigen();
}

function tonZustandZeigen() {
  const laeuft = welt.ctx?.state === 'running';
  $('weiter').hidden = laeuft || !welt.ctx;
  $('wiedergabe').textContent = laeuft ? '⏸' : '▶';
}

$('weiter').addEventListener('click', tonWeiter);

$('wiedergabe').addEventListener('click', async () => {
  if (!welt.ctx) return;
  if (welt.ctx.state === 'running') await welt.ctx.suspend();
  else await welt.ctx.resume();
  tonZustandZeigen();
});

// Beim Zurueckkommen aus dem Hintergrund gleich nachsehen.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tonZustandZeigen();
});

// --- Bedienung ------------------------------------------------------------

$('jetztUeberblenden').addEventListener('click', () => ueberblenden($('artWahl').value));


/*
 * Die Auswahl fuellt sich aus den Modi selbst - so taucht ein neuer Modus hier
 * von allein auf, statt an zwei Stellen gepflegt werden zu muessen.
 *
 * Ausser den geheimen. Die stehen erst drin, wenn jemand sie gefunden hat -
 * siehe weiter unten.
 */
/*
 * Solange getestet wird, steht das versteckte Bild offen in der Auswahl.
 *
 * Getippte Woerter gibt es auf einem Telefon nicht - dort ist keine Tastatur,
 * und ein Osterei, das die Haelfte der Geraete nicht oeffnen kann, ist keins,
 * sondern ein Fehler. Fuer die Testphase steht es deshalb schlicht in der
 * Liste.
 *
 * Vor der Party auf false stellen: Dann verschwindet es wieder, und es
 * oeffnen nur noch die beiden Wege unten - das getippte Wort und fuenf Tipper
 * auf die Ueberschrift. Beide funktionieren dann weiterhin, auch auf dem
 * Telefon.
 */
const GEHEIM_OFFEN = true;

const geheimFrei = GEHEIM_OFFEN || localStorage.getItem('djGeheim') === 'ja';
function modiEintragen(mitGeheimen) {
  const gewaehlt = $('modusWahl').value;
  $('modusWahl').length = 1;
  for (const { schluessel, name } of Visualisierung.modusnamen(mitGeheimen)) {
    const eintrag = document.createElement('option');
    eintrag.value = schluessel;
    eintrag.textContent = `Bild: ${name}`;
    $('modusWahl').append(eintrag);
  }
  $('modusWahl').value = gewaehlt;
}
modiEintragen(geheimFrei);

/*
 * Das versteckte Bild.
 *
 * Tippt jemand "trenta", schaltet die Buehne auf die Szenenfolge zur Party um
 * - Oliven, ein ueberlaufendes Weinglas, das Meer bei Sonnenuntergang. Danach
 * steht sie auch in der Auswahl und bleibt dort.
 *
 * Warum ein getipptes Wort und keine Taste: Tasten sind hier schon vergeben
 * (Leertaste, 1 bis 4, T), und ein Wort findet niemand aus Versehen. Genau das
 * ist der Punkt an einem Osterei.
 */
function geheimOeffnen() {
  localStorage.setItem('djGeheim', 'ja');
  modiEintragen(true);
  $('modusWahl').value = 'dolce';
  bild?.modusSetzen('dolce');
  zuruf('🍋 La Dolce Trenta');
}

/*
 * Der Weg fuer Finger: fuenf Tipper auf die Ueberschrift.
 *
 * Die Ueberschrift ist auf jedem Geraet da und wird sonst fuer nichts
 * gebraucht. Fuenf Tipper innerhalb von zwei Sekunden passieren nicht
 * versehentlich - und wer davon gehoert hat, findet es sofort.
 */
let tipper = 0;
let tipperZeit = 0;
$('anlass')?.addEventListener('click', () => {
  const jetzt = performance.now();
  tipper = jetzt - tipperZeit > 2000 ? 1 : tipper + 1;
  tipperZeit = jetzt;
  if (tipper >= 5) {
    tipper = 0;
    geheimOeffnen();
  }
});

let getippt = '';
function geheimPruefen(taste) {
  if (taste.length !== 1) return;
  getippt = (getippt + taste.toLowerCase()).slice(-12);
  if (!getippt.endsWith('trenta')) return;
  getippt = '';
  geheimOeffnen();
}

// Eine kurze Einblendung in der Mitte. Nur fuer diesen einen Moment - dafuer
// lohnt kein eigenes Bedienelement.
function zuruf(text) {
  const knoten = document.createElement('div');
  knoten.className = 'zuruf';
  knoten.textContent = text;
  document.body.append(knoten);
  setTimeout(() => knoten.remove(), 2600);
}

$('modusWahl').addEventListener('change', (e) => {
  bild?.modusSetzen(e.target.value || null);
});

/*
 * Die Bildguete von Hand.
 *
 * Der Regler im Fraktal passt sich zwar an die gemessene Zeit an, aber er
 * kann die Leinwand nicht kleiner machen - und die ist auf einem Tablet mit
 * doppelter Punktdichte der grosse Posten. Drei Stufen zum Durchprobieren,
 * daneben die gemessene Bildzeit, damit man sieht, was die Wahl bringt,
 * statt es zu erraten.
 */
for (const { schluessel, name } of Visualisierung.guetestufen()) {
  const eintrag = document.createElement('option');
  eintrag.value = schluessel;
  eintrag.textContent = `Qualität: ${name}`;
  $('gueteWahl').append(eintrag);
}

$('gueteWahl').addEventListener('change', (e) => {
  bild?.gueteSetzen(e.target.value);
});

/*
 * Das Bildziel - dieselbe Einstellung, die auch der Messstand schreibt.
 *
 * Ein Fach im Browser fuer beide: Wer im Messstand misst, was bei sechzig
 * Bildern durchgeht, und die Empfehlung uebernimmt, soll die Buehne nicht
 * anschliessend auf hundertfuenfundvierzig zielen sehen. Es waere sonst
 * gemessen worden, was gar nicht laeuft.
 */
// Gemerkt statt jedes Bild neu gelesen: localStorage ist synchron, und
// sechzigmal je Sekunde darin nachzuschlagen ist genau die Art Kleinigkeit,
// die spaeter als unerklaerlicher Ruckler wiederkommt.
let bildzielJetzt = 60;
{
  const gemerkt = localStorage.getItem('djBildziel');
  const ziel = gemerkt === null ? 60 : Number(gemerkt);
  $('bildzielWahl').value = String(ziel);
  bildzielJetzt = ziel;
  bildzielSetzen(ziel);
  $('bildzielWahl').addEventListener('change', (e) => {
    bildzielJetzt = Number(e.target.value);
    bildzielSetzen(bildzielJetzt);
    localStorage.setItem('djBildziel', e.target.value);
  });
}

// Die Anzeige zweimal je Sekunde nachziehen. Oefter waere unlesbar.
setInterval(() => {
  if (!bild) return;
  $('gueteWahl').value = bild.guetestufe;
  /*
   * Gezeigt wird der Bildabstand, nicht die Zeichendauer.
   *
   * Die Zeichendauer misst seit der Umstellung auf eigene Ebenen nur noch den
   * Ueberzug und meldete deshalb Unsinn - auf dem Telefon 0,9 ms und 1088
   * Bilder je Sekunde. Der Abstand zwischen zwei Bildern enthaelt alles und
   * ist das, was man sieht.
   */
  const ms = bild.abstandMs ?? bild.bildMs;
  const bilder = ms > 0.01 ? Math.round(1000 / ms) : 0;
  const m = window.__mandel;
  /*
   * Ist und Soll nebeneinander, und beide benannt.
   *
   * Vorher stand hier "16.7 ms · 60/s · Takt 33.3 ms" neben einem Schalter,
   * auf dem "30 Bilder/s" stand. Beides war fuer sich richtig und zusammen
   * unverstaendlich - zu Recht kam die Frage, welche der beiden Zahlen denn
   * nun gilt. Jetzt sagt die Anzeige, was gemessen ist und was angestrebt
   * wird, und wenn beides auseinanderliegt, sieht man es sofort.
   */
  const soll = bildzielJetzt > 0 ? `${bildzielJetzt}` : 'voll';
  $('bildTempo').textContent = `${ms.toFixed(1)} ms · ${bilder}/s (Ziel ${soll})`;
  $('bildTempo').title = m
    ? `${m.aufGpu ? `Grafikkarte: ${m.karte ?? 'unbekannt'}` : 'Hauptprozessor (Notfassung)'}\n` +
      `Ziel ${soll} Bilder/s, Takt ${(m.taktMs ?? 0).toFixed(1)} ms\n` +
      `Aufloesung ${(m.guete ?? 0).toFixed(2)} · Bremse ${(m.bremse ?? 0).toFixed(2)} · ` +
      `Schritte ${m.schritte} · Tiefe ${(m.tiefe ?? 0).toFixed(1)}\n` +
      `Zeichnen ${bild.bildMs.toFixed(1)} ms (nur der Ueberzug)`
    : '';
}, 500);

$('angleichAn').addEventListener('change', (e) => {
  welt.angleichAn = e.target.checked;
});

$('energieRegler').addEventListener('input', async (e) => {
  await welt.leitung.handEnergie(Number(e.target.value) / 100);
});

// Tastenkuerzel - beim Entwickeln schneller als Klicken.
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === ' ') {
    e.preventDefault();
    ueberblenden($('artWahl').value);
  }
  const arten = { 1: 'blende', 2: 'aufzug', 3: 'echo', 4: 'schnitt' };
  if (arten[e.key]) ueberblenden(arten[e.key]);
  if (e.key === 't' || e.key === 'T') technikUmschalten();
  if (e.key === 'm' || e.key === 'M') mandalaUmschalten();
  if (e.key === 'Escape' && !$('technik').hidden) technikUmschalten();
  if (e.key === 'Escape' && !$('mandalas').hidden) mandalaUmschalten();
  geheimPruefen(e.key);
});

/* --- Wer rechnet hier? ----------------------------------------------------
 *
 * Auf einem fremden Geraet - dem iPad, dem Telefon, dem Rechner eines Kumpels -
 * laesst sich die wichtigste Frage nicht aus der Ferne beantworten: Rechnet
 * ueberhaupt die Grafikeinheit, und wenn ja, welche? Man sieht es dem Bild
 * nicht an. Ein zugedrehter Regler macht auch aus einer Nachbildung in
 * Software ein fluessiges Bild - nur eben ein grobes.
 *
 * Die Anzeige wird bei jedem Aufklappen frisch gesammelt und danach im
 * Sekundentakt nachgezogen, solange sie offen ist. Zu ist sie kostenlos.
 */
let technikTakt = null;

async function technikZeichnen() {
  const auskunft = await technikSammeln(window.__mandel ?? null, bild ?? null);
  const zeichen = { gut: '✓', schlecht: '✗', offen: '·' };
  $('technikUrteil').innerHTML = '';
  for (const [art, satz] of auskunft.urteil) {
    const zeile = document.createElement('div');
    zeile.className = `satz ${art}`;
    const marke = document.createElement('b');
    marke.textContent = zeichen[art] ?? '·';
    const text = document.createElement('span');
    text.textContent = satz;
    zeile.append(marke, text);
    $('technikUrteil').append(zeile);
  }
  $('technikText').textContent = technikAlsText(auskunft);
}

function technikUmschalten() {
  const kasten = $('technik');
  kasten.hidden = !kasten.hidden;
  clearInterval(technikTakt);
  technikTakt = null;
  if (!kasten.hidden) {
    void technikZeichnen();
    technikTakt = setInterval(() => void technikZeichnen(), 1000);
  }
}

/*
 * Der Schalter fuer die Reihenentwicklung.
 *
 * Die Wahl haelt ueber einen Neustart - man vergleicht so etwas nicht in
 * dreissig Sekunden, sondern laesst es eine Weile laufen und schaut hin.
 */
{
  const gemerkt = localStorage.getItem('djReihe');
  const an = gemerkt === null ? true : gemerkt === 'ja';
  $('reiheAn').checked = an;
  reiheSetzen(an);
  $('reiheAn').addEventListener('change', (e) => {
    reiheSetzen(e.target.checked);
    localStorage.setItem('djReihe', e.target.checked ? 'ja' : 'nein');
  });
}

/* --- Welche Mandalas laufen duerfen ---------------------------------------
 *
 * Sechsundzwanzig Varianten sind zu viele fuer jedes Geraet - und welche sich
 * lohnen, haengt an der Grafikkarte und am Geschmack. Beides kann ich nicht
 * von hier aus entscheiden, also entscheidet es, wer davorsteht.
 *
 * Die Wahl liegt im Browser, nicht in der Datenbank: Sie gehoert zum Geraet.
 * Wer auf dem iPad die Haelfte abschaltet, will das auf dem Partyrechner nicht
 * auch haben.
 */
{
  const gemerkt = localStorage.getItem('djMandalas');
  if (gemerkt) {
    try {
      mandalasSetzen(JSON.parse(gemerkt));
    } catch {
      // Kaputter Eintrag - dann eben alle.
    }
  }
}

function mandalasMerken() {
  localStorage.setItem('djMandalas', JSON.stringify(mandalasAktive()));
}

let mandalaTakt = null;

function mandalaZeichnen() {
  const liste = $('mandalaListe');
  const bericht = mandalaBericht();
  // Was "schwer" heisst, ergibt sich aus dem Feld selbst: alles ueber dem
  // Anderthalbfachen des Mittelwerts. Eine feste Millisekundengrenze waere auf
  // einem Telefon etwas anderes als auf einem Spielerechner.
  const gemessen = bericht.filter((m) => m.ms !== null).map((m) => m.ms);
  const mittel = gemessen.length ? gemessen.reduce((a, b) => a + b, 0) / gemessen.length : 0;

  // Beim ersten Aufbau die Zeilen anlegen, danach nur noch die Werte
  // nachziehen - sonst verliert ein Kaestchen unter dem Finger den Fokus.
  if (liste.childElementCount !== bericht.length) {
    liste.innerHTML = '';
    for (const m of bericht) {
      const zeile = document.createElement('label');
      zeile.dataset.id = m.id;
      const kasten = document.createElement('input');
      kasten.type = 'checkbox';
      kasten.checked = m.an;
      kasten.addEventListener('change', () => {
        const jetzt = new Set(mandalasAktive());
        if (kasten.checked) jetzt.add(m.id);
        else jetzt.delete(m.id);
        mandalasSetzen([...jetzt]);
        mandalasMerken();
        mandalaZeichnen();
      });
      const name = document.createElement('span');
      name.textContent = m.name;
      const kosten = document.createElement('span');
      kosten.className = 'kosten';
      zeile.append(kasten, name, kosten);
      liste.append(zeile);
    }
  }

  for (const zeile of liste.children) {
    const m = bericht.find((x) => x.id === zeile.dataset.id);
    if (!m) continue;
    zeile.querySelector('input').checked = m.an;
    zeile.classList.toggle('laeuft', m.laeuft);
    const kosten = zeile.querySelector('.kosten');
    kosten.textContent = m.ms === null ? '–' : `${m.ms.toFixed(2)} ms`;
    kosten.classList.toggle('schwer', m.ms !== null && mittel > 0 && m.ms > mittel * 1.5);
  }
}

function mandalaUmschalten() {
  const kasten = $('mandalas');
  kasten.hidden = !kasten.hidden;
  clearInterval(mandalaTakt);
  mandalaTakt = null;
  if (!kasten.hidden) {
    mandalaZeichnen();
    mandalaTakt = setInterval(mandalaZeichnen, 700);
  }
}

$('mandalaKnopf').addEventListener('click', mandalaUmschalten);
$('mandalaZu').addEventListener('click', mandalaUmschalten);
$('mandalaAlle').addEventListener('click', () => {
  mandalasSetzen(MANDALAS.map((m) => m.id));
  mandalasMerken();
  mandalaZeichnen();
  $('mandalaStand').textContent = `Alle ${MANDALAS.length} sind an.`;
});
$('mandalaLeichte').addEventListener('click', () => {
  /*
   * Die Haelfte mit der kuerzesten gemessenen Zeit behalten.
   *
   * Ungemessene bleiben drin: Sie sind nicht teuer, sie waren nur noch nicht
   * dran. Sie hinauszuwerfen, weil man sie nicht kennt, waere das Gegenteil
   * von messen.
   */
  const bericht = mandalaBericht();
  const mitZahl = bericht.filter((m) => m.ms !== null).sort((a, b) => a.ms - b.ms);
  /*
   * Und sagen, wenn der Knopf nichts tun kann.
   *
   * Solange kaum etwas gemessen ist, bleibt fast alles drin - der Knopf sieht
   * dann kaputt aus, obwohl er genau das Richtige tut. Nachgestellt: nach acht
   * Sekunden lag eine einzige Messung vor, "Nur die leichten" liess alle
   * sechsundzwanzig stehen, und ohne diesen Hinweis waere das ein Fehler
   * gewesen, den es nicht gibt.
   */
  if (mitZahl.length < 4) {
    $('mandalaStand').textContent =
      `Erst ${mitZahl.length} von ${bericht.length} gemessen – lass die Fahrt` +
      ' ein paar Drops laufen, dann trennt sich das.';
    return;
  }
  const behalten = new Set(bericht.filter((m) => m.ms === null).map((m) => m.id));
  for (const m of mitZahl.slice(0, Math.max(1, Math.ceil(mitZahl.length / 2)))) behalten.add(m.id);
  mandalasSetzen([...behalten]);
  mandalasMerken();
  mandalaZeichnen();
  $('mandalaStand').textContent =
    `${behalten.size} von ${bericht.length} bleiben an – die teurere Haelfte der` +
    ` ${mitZahl.length} gemessenen ist ab.`;
});

/*
 * Der Weg zum Messstand.
 *
 * Das Ziel steht nicht im HTML, weil es davon abhaengt, wie diese Seite
 * gerade ausgeliefert wird. Auf dem eigenen Server liegt die Buehne unter
 * /buehne und der Messstand unter /messstand/. In der gebauten Fassung ist
 * die Buehne die Einzeldatei /dj, und der Messstand liegt daneben unter
 * /dj/messstand/index.html. Ein fester Pfad traefe genau eine der beiden
 * Fassungen - und in der anderen waere es ein toter Link, den niemand
 * bemerkt, bis er ihn braucht.
 */
function messstandVerlinken() {
  const link = $('messstandLink');
  if (!link) return;
  const gebaut = location.pathname === '/dj' || location.pathname.startsWith('/dj/');
  link.href = gebaut ? '/dj/messstand/index.html' : '/messstand/';
}
messstandVerlinken();

$('technikKnopf').addEventListener('click', technikUmschalten);
$('technikZu').addEventListener('click', technikUmschalten);
$('technikKopieren').addEventListener('click', async () => {
  const knopf = $('technikKopieren');
  const text = $('technikText').textContent;
  try {
    await navigator.clipboard.writeText(text);
    knopf.textContent = 'Kopiert';
  } catch {
    /*
     * Ohne sicheren Kontext oder ohne Erlaubnis gibt es keine Zwischenablage -
     * auf einem Telefon im lokalen WLAN ueber http ist das der Normalfall.
     * Dann wird der Text stattdessen markiert, und Antippen-Halten-Kopieren
     * tut es auch.
     */
    const bereich = document.createRange();
    bereich.selectNodeContents($('technikText'));
    const auswahl = window.getSelection();
    auswahl.removeAllRanges();
    auswahl.addRange(bereich);
    knopf.textContent = 'markiert – von Hand kopieren';
  }
  setTimeout(() => {
    knopf.textContent = 'Kopieren';
  }, 2500);
});

// --- Zustand vom Server ---------------------------------------------------

welt.leitung.beiZustand((zustand) => {
  $('anlass').textContent = zustand.anlass ?? 'resident-dj';
  welt.zielenergie = zustand.zielenergie ?? 0.5;
  const prozent = Math.round(welt.zielenergie * 100);
  $('energieWert').textContent = `${prozent} %`;
  if (document.activeElement !== $('energieRegler')) {
    $('energieRegler').value = prozent;
  }
  $('energieQuelle').textContent = zustand.handbetrieb
    ? 'von Hand gesetzt'
    : `nach Uhrzeit${zustand.richtungen?.haerter || zustand.richtungen?.chilliger ? ` · Gäste: ${zustand.richtungen.chilliger} chilliger, ${zustand.richtungen.haerter} härter` : ''}`;

  // Der naechste Track wird lange im Voraus geholt. Verschiebt sich die
  // Zielenergie danach deutlich - weil jemand am Regler dreht oder die Gaeste
  // abstimmen - waere er von gestern. Dann lieber neu aussuchen, solange der
  // Uebergang noch nicht laeuft.
  const ziel = zustand.zielenergie ?? 0.5;
  if (
    welt.naechster &&
    !welt.wechselLaeuft &&
    welt.naechsterGrund?.ziel !== undefined &&
    Math.abs(ziel - welt.naechsterGrund.ziel) > 0.1
  ) {
    welt.naechster = null;
    naechstenVorbereiten();
  }
});

// --- Zeichnen -------------------------------------------------------------

let bild = null;
let spektrumDaten = null;
let wellenDaten = null;
let letzteZeit = 0;

function leinwandAnpassen() {
  bild?.masseSetzen();
}
window.addEventListener('resize', leinwandAnpassen);

/*
 * Das Bildziel ist eine Obergrenze, kein frommer Wunsch.
 *
 * Vorher hiess "30 Bilder/s" nur: Der Regler *darf* sich je Bild mehr Zeit
 * nehmen. Gezeichnet wurde trotzdem bei jedem Aufruf, also sechzigmal je
 * Sekunde - und die Anzeige stellte das auch korrekt fest: "30 Bilder/s"
 * neben "60/s". Eins von beidem musste falsch sein, und es war der Schalter.
 *
 * Jetzt werden Aufrufe uebersprungen, bis das Ziel erreicht ist. Dreissig
 * heisst dreissig. Die neunzig Prozent sind Toleranz: Bei genau 33,3 ms
 * Abstand und 16,7 ms Bildtakt faellt sonst jedes zweite Bild knapp unter die
 * Schwelle, und aus dreissig werden zwanzig.
 *
 * Uebersprungen wird nur das *Zeichnen*. Der Mischer laeuft weiter bei jedem
 * Aufruf: Er haengt an der Tonausgabe, und ein Uebergang, der nur
 * dreissigmal je Sekunde nachgefuehrt wird, hoert man.
 */
let letztesBild = 0;

function schleife(jetzt = 0) {
  requestAnimationFrame(schleife);
  if (!welt.mixer) return;

  if (bildzielJetzt > 0) {
    const mindestens = (1000 / bildzielJetzt) * 0.9;
    if (jetzt - letztesBild < mindestens) {
      // Nur die Anzeige und den Mischer nachziehen, nicht das Bild.
      zeichneDecks(welt.mixer.zustand());
      return;
    }
  }
  letztesBild = jetzt;

  // Zeit zwischen zwei Bildern, gedeckelt: Nach einem Tabwechsel kaeme sonst
  // ein Riesensprung, und alle Bewegungen wuerden auf einmal durchrauschen.
  const sekunden = Math.min(0.05, (jetzt - letzteZeit) / 1000 || 0.016);
  letzteZeit = jetzt;

  const zustand = welt.mixer.zustand();

  if (!spektrumDaten) spektrumDaten = new Uint8Array(welt.mixer.messung.frequencyBinCount);
  // Die Wellenform ist doppelt so lang wie das Spektrum: fftSize Abtastwerte
  // im Zeitbereich gegen fftSize/2 Frequenzbaender. Der Modus "Wellen"
  // zeichnet sie unmittelbar, alle anderen ruehren sie nicht an.
  if (!wellenDaten) wellenDaten = new Float32Array(welt.mixer.messung.fftSize);
  welt.mixer.spektrum(spektrumDaten);
  welt.mixer.wellenform(wellenDaten);
  bild?.zeichne(zustand, spektrumDaten, sekunden, wellenDaten);

  zeichneDecks(zustand);
  zeichneUebergang(zustand);

  $('pegelBalken').style.width = `${Math.min(100, zustand.pegel * 260)}%`;
  $('uhr').textContent = new Date().toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const g = welt.naechsterGrund;
  $('naechsterGrund').textContent = welt.naechster
    ? `${g?.grund === 'wunsch' ? 'Gästewunsch' : 'Autopilot'} · Energie ${Math.round((welt.naechster.energie ?? 0) * 100)} %`
    : '';

  tonZustandZeigen();
  nachschubPruefen();
  wachhund(zustand);
}

// --- Remix ----------------------------------------------------------------
//
// Vor jedem Drop wird geprueft, ob ein Loop-Roll hineinpasst und ob die Regie
// ihn gerade will. Die Regie haengt an der Zielenergie: frueh am Abend gar
// nicht, spaeter oft und schaerfer.

function nachschubPruefen() {
  const rest = welt.mixer.restSekunden();
  if (rest < LADEN_AB_REST) naechstenVorbereiten();
  if (rest < UEBERBLENDEN_AB_REST && !welt.wechselLaeuft && welt.naechster) {
    ueberblenden();
  }
}

// Stille ist der einzige Fehler, den dieses System nicht machen darf. Bleibt
// der Ausgang stumm, obwohl ein Deck laeuft, wird hart weitergeschaltet.
//
// Die Schwelle liegt bewusst sehr tief. Ein leises Intro oder ein Breakdown
// kann auf ein Tausendstel heruntergehen - wer da schon anschlaegt, zerschiesst
// genau die Stellen, die ein DJ absichtlich leise macht. Es geht nur um den
// Fall "wirklich nichts".
const STILL = 0.00005;
const STILLE_ERLAUBT_MS = 2500;

function wachhund(zustand) {
  // Angehalten ist keine Stoerung, sondern Absicht.
  if (welt.ctx?.state !== 'running') {
    welt.stilleSeit = null;
    return;
  }
  const einDeckLaeuft = zustand.decks.some((d) => d.laeuft);
  if (!einDeckLaeuft || zustand.pegel >= STILL) {
    welt.stilleSeit = null;
    return;
  }
  // Direkt nach einem Start braucht die Messung einen Moment.
  if (welt.wechselLaeuft) {
    welt.stilleSeit = null;
    return;
  }
  if (welt.stilleSeit === null) {
    welt.stilleSeit = performance.now();
    return;
  }
  if (performance.now() - welt.stilleSeit > STILLE_ERLAUBT_MS) {
    console.warn('Wachhund: Stille erkannt, schalte hart weiter');
    welt.stilleSeit = null;
    welt.wechselLaeuft = false;
    ueberblenden('schnitt');
  }
}

// Links steht immer, was laeuft, rechts was kommt - unabhaengig davon,
// welches Deck der Mixer gerade benutzt. Fuer den, der davorsteht, ist "Deck
// B" bedeutungslos; "als naechstes" nicht.
function zeichneDecks(zustand) {
  const u = zustand.uebergang;
  let laufend;
  let anderes;

  if (u && u.fortschritt > 0) {
    // Waehrend einer Blende richtet sich die Anzeige nach dem Uebergang, nicht
    // nach der Deck-Zaehlung des Mixers: Der schaltet intern schon um, wenn
    // der Neue erst anfaengt hochzukommen. Zu hoeren ist da noch der Alte -
    // und links soll stehen, was man hoert.
    laufend = zustand.decks.find((d) => d.track?.id === u.vonTrack?.id && d.laeuft);
    anderes = zustand.decks.find((d) => d.track?.id === u.nachTrack?.id && d.laeuft);
  }

  laufend ??= zustand.decks.find((d) => d.aktiv && d.laeuft) ?? zustand.decks[0];
  anderes ??= zustand.decks.find((d) => d !== laufend && d.laeuft);

  fuelleSeite($('deckA'), laufend, true);

  if (anderes) {
    // Waehrend eines Uebergangs laeuft der Neue schon - dann zeigt die rechte
    // Seite ihn mitsamt seinen Reglern.
    fuelleSeite($('deckB'), anderes, true);
  } else if (welt.naechster) {
    // Sonst der vorbereitete Track, noch ohne Laufwerte.
    fuelleSeite($('deckB'), { track: welt.naechster, bpm: welt.naechster.bpm, tempo: 1,
                              stelle: 0, dauer: 0, blende: 0, tief: 0 }, false);
  } else {
    fuelleSeite($('deckB'), null, false);
  }
}

function fuelleSeite(knoten, daten, hervorheben) {
  knoten.classList.toggle('aktiv', !!daten && hervorheben);

  if (!daten?.track) {
    knoten.querySelector('.deck-titel').textContent = '–';
    knoten.querySelector('.deck-interpret').textContent = '';
    knoten.querySelector('.deck-bpm').textContent = '';
    knoten.querySelector('.fortschritt > i').style.width = '0%';
    return;
  }

  knoten.querySelector('.deck-titel').textContent = daten.track.titel ?? '–';
  knoten.querySelector('.deck-interpret').textContent = daten.track.interpret ?? '';
  knoten.querySelector('.deck-bpm').textContent = daten.bpm
    ? `${daten.bpm.toFixed(1)} BPM${Math.abs(daten.tempo - 1) > 0.001 ? ` · ${((daten.tempo - 1) * 100).toFixed(1)} %` : ''}`
    : '';

  const anteil = daten.dauer ? Math.min(1, daten.stelle / daten.dauer) : 0;
  knoten.querySelector('.fortschritt > i').style.width = `${anteil * 100}%`;
  zeichneMarken(knoten.querySelector('.fortschritt > u'), daten);

  knoten.querySelector('[data-regler="blende"]').style.width = `${daten.blende * 100}%`;
  // Bass: 0 dB = voll, -32 dB = weg.
  knoten.querySelector('[data-regler="tief"]').style.width =
    `${Math.max(0, 1 + daten.tief / 32) * 100}%`;
}

// Die Strukturmarken als feine Striche im Fortschrittsbalken - so sieht man,
// ob der Uebergang wirklich am Outro sitzt.
function zeichneMarken(knoten, daten) {
  const marken = daten.track?.marken;
  if (!marken || !daten.dauer) return (knoten.style.backgroundImage = '');
  const striche = marken
    .filter((m) => m.name !== 'intro')
    .map((m) => {
      const p = ((m.sekunde / daten.dauer) * 100).toFixed(2);
      const farbe = m.name === 'drop' ? 'rgba(255,61,127,.9)' : 'rgba(255,255,255,.28)';
      return `linear-gradient(90deg, transparent ${p}%, ${farbe} ${p}%, ${farbe} calc(${p}% + 1px), transparent calc(${p}% + 1px))`;
    });
  knoten.style.backgroundImage = striche.join(',');
}

function zeichneUebergang(zustand) {
  const u = zustand.uebergang;
  $('uebergang').hidden = !u;
  $('wartend').hidden = !!u;
  if (!u) return;

  const wartet = u.startetIn > 0.05;
  $('uebergangName').textContent = wartet
    ? `${u.name} in ${u.startetIn.toFixed(1)} s`
    : u.name;
  $('uebergangFortschritt').style.width = `${u.fortschritt * 100}%`;
  $('uebergangGrund').textContent = wartet
    ? 'wartet auf die nächste Phrasengrenze'
    : (u.grund ?? u.beschreibung);
}

function zeichneVerlauf() {
  $('verlauf').innerHTML = '';
  for (const eintrag of welt.verlauf) {
    const zeile = document.createElement('li');
    const zeit = eintrag.zeit.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    zeile.innerHTML = '<span></span><em></em><b></b><span></span>';
    const felder = zeile.children;
    felder[0].textContent = zeit;
    felder[1].textContent = eintrag.art;
    felder[2].textContent = eintrag.nach;
    felder[3].textContent = eintrag.hinweis;
    $('verlauf').append(zeile);
  }
}

// --- Steuerung zeigen und verstecken --------------------------------------
//
// Auf einem Monitor im Raum soll nichts herumstehen, was niemand bedient.
// Jede Maus- oder Fingerbewegung holt die Leiste zurueck, danach verschwindet
// sie wieder.
let ruheZaehler = null;
function steuerungZeigen() {
  $('steuerung').classList.add('sichtbar');
  clearTimeout(ruheZaehler);
  ruheZaehler = setTimeout(() => {
    // Nicht wegblenden, solange jemand tatsaechlich an einem Regler haengt.
    if ($('steuerung').contains(document.activeElement)) return steuerungZeigen();
    $('steuerung').classList.remove('sichtbar');
  }, 3500);
}
for (const ereignis of ['mousemove', 'touchstart', 'keydown']) {
  window.addEventListener(ereignis, steuerungZeigen, { passive: true });
}

// Die Uebergangsarten aus der Engine in die Auswahlliste, damit beides nicht
// auseinanderlaeuft.
for (const [schluessel, plan] of Object.entries(UEBERGAENGE)) {
  const option = [...$('artWahl').options].find((o) => o.value === schluessel);
  if (option) option.title = plan.beschreibung;
}
