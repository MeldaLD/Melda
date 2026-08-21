// Die Bibliothek fuellen - im Serverbetrieb, ohne Vercel und ohne Supabase.
//
// Am Partyabend laeuft alles auf einem Rechner: der DJ-Server aus dj/server/,
// die Musik daneben in musik/, die Buehne im Browser. Was bisher fehlte, war
// der Schritt dazwischen - bibliothek.json wurde von nichts gefuellt. Die
// Analyse gab es nur auf der Aufnahmeseite im Adminbereich, und die haengt an
// Vercel und am Supabase-Speicher.
//
// Diese Seite schliesst die Luecke, und zwar mit *derselben* analyse.js, die
// auch die Buehne benutzt. Das ist der Punkt: Zwei Fassungen der Messung
// waeren zwei Fassungen des Beatrasters, und dann klingt der Abend anders als
// der Test.
//
// Der Ablauf ist geradeaus:
//
//   1. /api/dateien   sagt, was in musik/ liegt
//   2. /musik/<name>  wird geladen und dekodiert
//   3. analysiere()   misst
//   4. /api/bibliothek  nimmt das Ergebnis entgegen und schreibt es weg
//
// Gerechnet wird im Browser, weil dort Web Audio ist. Ein Stundenmix braucht
// dafuer ein bis zwei Minuten; das Fenster muss so lange offen bleiben.

import { analysiere, energienNormieren } from '../gemeinsam/analyse.js';

const $ = (id) => document.getElementById(id);
const liste = $('liste');

let dateien = [];
let bibliothek = [];
let laeuft = false;

/*
 * Dieselbe Abtastrate wie im Adminbereich, aus demselben Grund: Voll
 * aufgeloest sind ein paar Minuten Musik schon hundert Megabyte, und bei
 * grossen Dateien wird noch einmal halbiert. Eine Stunde stereo waere bei
 * 22050 Hz 635 MB allein an Abtastwerten.
 *
 * Hochgeladen oder veraendert wird nichts - gemessen wird auf einer Kopie im
 * Speicher, die Datei in musik/ bleibt, wie sie ist.
 */
const GROSS_AB_MB = 30;

function kontext(rate) {
  const Klasse = window.AudioContext ?? window.webkitAudioContext;
  try {
    return new Klasse({ sampleRate: rate });
  } catch {
    return new Klasse();
  }
}

// --- Anzeige ---------------------------------------------------------------

function fehlerZeigen(text) {
  const kasten = $('fehler');
  kasten.hidden = !text;
  kasten.textContent = text ?? '';
}

function standZeigen() {
  const vermessen = dateien.filter((d) => d.eintrag).length;
  $('stand').textContent = `${vermessen} von ${dateien.length} vermessen`;
}

function zeichnen() {
  liste.innerHTML = '';
  for (const datei of dateien) {
    const zeile = document.createElement('li');
    const kopf = document.createElement('div');
    kopf.className = 'zeile';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = datei.name;

    const zustand = document.createElement('span');
    zustand.className = `zustand${datei.fehler ? ' fehler' : datei.eintrag ? ' fertig' : ''}`;
    zustand.textContent = datei.fehler
      ? 'Fehler'
      : datei.schritt
        ? datei.schritt
        : datei.eintrag
          ? 'vermessen'
          : 'offen';

    kopf.append(name, zustand);
    zeile.append(kopf);

    if (datei.fehler) {
      const text = document.createElement('div');
      text.className = 'werte';
      text.textContent = datei.fehler;
      zeile.append(text);
    } else if (datei.eintrag) {
      zeile.append(werteZeile(datei.eintrag));
    }

    if (datei.schritt) {
      const balken = document.createElement('div');
      balken.className = 'balken';
      const innen = document.createElement('i');
      innen.style.width = `${Math.round((datei.anteil ?? 0) * 100)}%`;
      balken.append(innen);
      zeile.append(balken);
    }

    liste.append(zeile);
  }
  standZeigen();
}

function werteZeile(eintrag) {
  const teile = [];
  const dauer = eintrag.dauer ?? 0;
  teile.push(`${Math.floor(dauer / 60)}:${String(Math.round(dauer % 60)).padStart(2, '0')}`);

  const karte = eintrag.abschnitte ?? [];
  if (eintrag.ohneRaster) {
    teile.push('kein Beat erkennbar – wird geschnitten statt gemischt');
  } else if (karte.length > 1) {
    const tempi = karte.map((a) => Math.round(a.bpm));
    teile.push(`${karte.length} Stücke, ${Math.min(...tempi)}–${Math.max(...tempi)} BPM`);
  } else {
    teile.push(`${eintrag.bpm?.toFixed(1)} BPM`);
  }

  const drops = (eintrag.marken ?? []).filter((m) => m.name === 'drop').length;
  teile.push(`${drops} Drops`);
  teile.push(`${eintrag.lufs?.toFixed(1)} LUFS → ${eintrag.angleichDb?.toFixed(2)} dB`);

  const knoten = document.createElement('div');
  knoten.className = 'werte';
  knoten.textContent = teile.join(' · ');
  return knoten;
}

// --- Laden -----------------------------------------------------------------

// Aus dem Dateinamen einen Interpreten und einen Titel machen. Dieselbe Regel
// wie im Adminbereich: "Interpret - Titel.mp3".
function ausDateiname(pfad) {
  const ohneOrdner = pfad.split('/').pop() ?? pfad;
  const ohneEndung = ohneOrdner.replace(/\.[a-z0-9]+$/i, '');
  const geteilt = ohneEndung.split(/\s+[-–]\s+/);
  if (geteilt.length >= 2) {
    return { interpret: geteilt[0].trim(), titel: geteilt.slice(1).join(' - ').trim() };
  }
  return { interpret: '', titel: ohneEndung.trim() };
}

function kennung(interpret, titel) {
  return `${interpret} ${titel}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function ordnerLesen() {
  fehlerZeigen(null);
  try {
    const [ausDatei, ausBibliothek] = await Promise.all([
      (await fetch('/api/dateien')).json(),
      (await fetch('/api/bibliothek')).json(),
    ]);
    bibliothek = ausBibliothek.tracks ?? [];
    const nachDatei = new Map(bibliothek.map((t) => [t.datei, t]));
    dateien = (ausDatei.dateien ?? []).map((name) => ({
      name,
      eintrag: nachDatei.get(name) ?? null,
      schritt: '',
      anteil: 0,
      fehler: null,
    }));
    if (dateien.length === 0) {
      fehlerZeigen('In musik/ liegt nichts Hoerbares. Dateien dorthin legen und neu lesen.');
    }
    zeichnen();
  } catch (grund) {
    fehlerZeigen(`Der Server antwortet nicht: ${grund.message}`);
  }
}

// --- Messen ----------------------------------------------------------------

async function eineVermessen(datei) {
  datei.fehler = null;
  datei.schritt = 'Laden';
  datei.anteil = 0;
  zeichnen();

  const antwort = await fetch(`/musik/${encodeURIComponent(datei.name)}`);
  if (!antwort.ok) throw new Error(`${antwort.status} beim Laden`);
  const roh = await antwort.arrayBuffer();

  datei.schritt = 'Dekodieren';
  zeichnen();
  /*
   * Die Groesse *vorher* merken - und die Datei danach ohne Kopie
   * weiterreichen.
   *
   * Hier stand `decodeAudioData(roh.slice(0))`, und das `slice` war eine
   * vollstaendige Kopie: Bei einem Stundenmix von 120 MB lagen damit 240 MB
   * gleichzeitig im Speicher, dazu noch der dekodierte Ton. Der Grund fuer
   * die Kopie war allein, dass `decodeAudioData` den uebergebenen Puffer
   * *entkoppelt* und `roh.byteLength` danach null waere - gebraucht wird die
   * Zahl aber nur fuer die Fehlermeldung. Also einmal ablesen und die Kopie
   * sparen.
   */
  const groesseMB = roh.byteLength / 1048576;
  const rate = roh.byteLength > GROSS_AB_MB * 1048576 ? 11025 : 22050;
  const ctx = kontext(rate);
  let puffer;
  try {
    puffer = await ctx.decodeAudioData(roh);
  } catch (grund) {
    void ctx.close();
    throw new Error(
      `Dieser Browser kann die Datei nicht dekodieren (${groesseMB.toFixed(1)} MB). ` +
        `Im Zweifel als MP3 oder WAV umwandeln. ${grund?.message ?? ''}`.trim(),
    );
  }

  const befund = await analysiere(puffer, (schritt) => {
    datei.schritt = schritt;
    // Die Messung meldet "Messen 42 %" - daraus wird der Balken.
    const treffer = /(\d+)\s*%/.exec(schritt);
    datei.anteil = treffer ? Number(treffer[1]) / 100 : datei.anteil;
    zeichnen();
  });
  void ctx.close();

  const { interpret, titel } = ausDateiname(datei.name);
  datei.eintrag = {
    id: kennung(interpret, titel),
    titel,
    interpret,
    datei: datei.name,
    // Ohne Klangbewertung: die kommt aus einlesen/qualitaet.mjs und braucht
    // ffmpeg. Wer sie hat, ueberschreibt die Note dort; hier zaehlt erst
    // einmal jeder Track gleich.
    note: datei.eintrag?.note ?? 1,
    ...befund,
  };
  datei.schritt = '';
  datei.anteil = 0;
  zeichnen();
}

async function alleVermessen() {
  if (laeuft) return;
  laeuft = true;
  $('starten').disabled = true;
  $('neuLaden').disabled = true;
  fehlerZeigen(null);

  const nochmal = $('alle').checked;
  const offen = dateien.filter((d) => nochmal || !d.eintrag);

  for (const datei of offen) {
    try {
      await eineVermessen(datei);
    } catch (grund) {
      datei.fehler = grund?.message ?? String(grund);
      datei.schritt = '';
      zeichnen();
    }
  }

  /*
   * Erst am Ende speichern, und zwar alles zusammen.
   *
   * Die Energie ist kein absoluter Wert, sondern ein Rang innerhalb der
   * Sammlung - energienNormieren braucht deshalb alle Tracks auf einmal.
   * Zwischendurch zu speichern haette bei jedem Durchlauf andere Zahlen
   * ergeben.
   */
  const tracks = dateien.filter((d) => d.eintrag).map((d) => d.eintrag);
  if (tracks.length > 0) {
    try {
      const antwort = await fetch('/api/bibliothek', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: energienNormieren(tracks) }),
      });
      if (!antwort.ok) throw new Error(`${antwort.status}`);
    } catch (grund) {
      fehlerZeigen(`Die Bibliothek liess sich nicht speichern: ${grund.message}`);
    }
  }

  laeuft = false;
  $('starten').disabled = false;
  $('neuLaden').disabled = false;
  await ordnerLesen();
}

$('starten').addEventListener('click', () => void alleVermessen());
$('neuLaden').addEventListener('click', () => void ordnerLesen());
await ordnerLesen();
