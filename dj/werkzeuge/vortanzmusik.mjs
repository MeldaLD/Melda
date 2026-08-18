// Referenzmusik zum Vortanzen erzeugen.
//
// Gerendert wird mit dem Technogenerator, der frueher im Projekt lag
// (maschine.js, ausgebaut in 5a3df2f). Er kann Kick, Klatsch, Hi-Hats, eine
// Bassrumpelwolke und Stiche, und er hat ein Arrangement ueber 32 Takte mit
// einem echten Sog vor dem Drop. Genau das braucht jemand, der einen DJ
// spielen soll.
//
// Web Audio laeuft nur im Browser, also wird in einem OfflineAudioContext
// gerendert. Der hat aber keine laufende Uhr - `currentTime` steht bis zum
// Rendern auf null, und die Maschine plant relativ dazu. Deshalb bekommt sie
// den Kontext durch einen Proxy, dessen `currentTime` dieses Skript selbst
// vorstellt.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const lauf = promisify(execFile);
const BPM = 124;
const RATE = 44100;
const ORDNER = new URL('../vortanz/', import.meta.url).pathname;
/*
 * Beide Module kommen aus der Geschichte des Projekts. maschine.js holt sich
 * seine Klangerzeuger aus stimmen.js; im Browser gibt es hier aber kein
 * Dateisystem, ueber das dieser Import aufloesen koennte. Deshalb wird
 * stimmen.js zuerst zu einer Blob-Adresse gemacht und der Importpfad in
 * maschine.js darauf umgebogen.
 */
const quelle = await fs.readFile(new URL('./vortanzquellen/maschine.js', import.meta.url), 'utf8');
const stimmen = await fs.readFile(new URL('./vortanzquellen/stimmen.js', import.meta.url), 'utf8');

/*
 * Die Takes.
 *
 * `takt` ist der Startpunkt im 32-Takte-Arrangement des Generators:
 *   0..3   Einzug        kein Kick
 *   4..7   Kick rein
 *   8..15  Groove
 *   16..23 Hoehepunkt
 *   24..31 Sog           Kick raus, Rauschen faehrt hoch
 *
 * Jeder Take ist sieben Takte lang. Im ersten liegen vier Klicks zum
 * Einzaehlen; die Musik laeuft dabei schon, damit man im Groove ist, bevor
 * es losgeht.
 */
const TAKES = [
  { nr: 1, name: 'grundgroove', titel: 'Grundgroove',  takt: 8,  energie: 0.50, takte: 7 },
  { nr: 2, name: 'welle',       titel: 'Welle',        takt: 8,  energie: 0.60, takte: 7 },
  { nr: 3, name: 'aufbau',      titel: 'Aufbau',       takt: 24, energie: 0.80, takte: 7 },
  { nr: 4, name: 'drop',        titel: 'Drop',         takt: 1,  energie: 0.90, takte: 7 },
  { nr: 5, name: 'faustpumpe',  titel: 'Faustpumpe',   takt: 16, energie: 0.85, takte: 7 },
  { nr: 6, name: 'kopfhoerer',  titel: 'Kopfhoerer',   takt: 0,  energie: 0.25, takte: 7 },
  { nr: 7, name: 'regler',      titel: 'Regler',       takt: 8,  energie: 0.50, takte: 7 },
  { nr: 8, name: 'zeigen',      titel: 'Zeigen',       takt: 16, energie: 0.90, takte: 7 },
];
// Und ein Durchlauf zum Ueben: zwei volle Bloecke, Energie steigend.
const DURCHLAUF = { nr: 0, name: 'durchlauf', titel: 'Durchlauf', takt: 0, energie: null, takte: 64 };

await fs.mkdir(ORDNER, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PFAD,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const seite = await browser.newPage();
seite.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await seite.goto('about:blank');


for (const take of [DURCHLAUF, ...TAKES]) {
  const roh = await seite.evaluate(async ({ quelle, stimmen, take, BPM, RATE }) => {
    const stimmenUrl = URL.createObjectURL(new Blob([stimmen], { type: 'text/javascript' }));
    const url = URL.createObjectURL(new Blob(
      [quelle.replace("'./stimmen.js'", JSON.stringify(stimmenUrl))],
      { type: 'text/javascript' },
    ));
    const M = await import(url);
    const taktDauer = (60 / BPM) * 4;
    /*
     * Nachlauf fuer Hall und Rumpeln - aber knapp.
     *
     * Die kostenlosen Erfassungsdienste nehmen 15 Sekunden je Aufnahme. Sieben
     * Takte bei 124 sind 13,55 s; mit zwei Sekunden Nachlauf waren es 15,5 und
     * damit eine Datei, die man nicht am Stueck hochladen kann. 0,7 s reichen
     * fuers Ausklingen und lassen die Datei bei 14,3 s.
     */
    const dauer = take.takte * taktDauer + (take.takte > 16 ? 2 : 0.7);
    const ctx = new OfflineAudioContext(2, Math.ceil(dauer * RATE), RATE);

    // Der Proxy: alles geht an den echten Kontext, nur `currentTime` stellt
    // dieses Skript.
    let jetzt = 0;
    const sicht = new Proxy(ctx, {
      get(z, feld) {
        if (feld === 'currentTime') return jetzt;
        const wert = Reflect.get(z, feld);
        return typeof wert === 'function' ? wert.bind(z) : wert;
      },
    });

    /*
     * Ein Begrenzer am Ausgang. Die Maschine ist auf einen Mixer mit
     * Begrenzer hin gebaut; ohne ihn schlaegt der Zusammenfall von Kick,
     * Klatsch und Hi-Hat auf der Zwei und der Vier ueber Vollaussteuerung.
     */
    const aus = ctx.createGain();
    aus.gain.value = 0.9;
    const bremse = ctx.createDynamicsCompressor();
    bremse.threshold.value = -6;
    bremse.knee.value = 3;
    bremse.ratio.value = 12;
    bremse.attack.value = 0.002;
    bremse.release.value = 0.12;
    aus.connect(bremse).connect(ctx.destination);

    const m = new M.Maschine(sicht, aus, () => {});
    // Den Anker so legen, dass bei t=0 der gewuenschte Takt laeuft.
    m.bpm = BPM;
    m.ankerZeit = -take.takt * taktDauer;
    m.laeuft = true;
    m.naechsterSchritt = take.takt * 16;
    m.zielenergie = take.energie ?? 0.4;

    /*
     * Die Klicks zum Einzaehlen: vier kurze Toene auf den Schlaegen des
     * ersten Taktes. Sie liegen ueber der Musik und nicht davor - so ist man
     * schon im Groove, wenn es losgeht.
     *
     * Der vierte klingt hoeher. Ohne diesen Unterschied weiss man beim
     * Mitzaehlen nie, ob der naechste Schlag die Eins ist.
     */
    /*
     * Wichtig: Die Klicks gehen *am Begrenzer vorbei*, direkt an den Ausgang.
     *
     * Zuerst liefen sie durch ihn hindurch, und das war gleich doppelt
     * falsch. Der Begrenzer wird von der lauten Musik gesteuert und hat den
     * Klick mitgedrueckt - gemessen kam er auf ein Fuenfzigstel der Lautheit
     * einer Hi-Hat, war also praktisch weg. Und er hat eine Vorschauzeit,
     * verschiebt also die Zeitachse. Ausgerechnet beim Klick darf das nicht
     * passieren: Er ist der Anker, mit dem spaeter Video und Musik
     * uebereinandergelegt werden. Was der Anker misst, muss auf die
     * Abtastung genau stimmen.
     */
    const klick = (zeit, hoch) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = hoch ? 1800 : 1200;
      g.gain.setValueAtTime(0, zeit);
      g.gain.linearRampToValueAtTime(0.9, zeit + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, zeit + 0.05);
      o.connect(g).connect(ctx.destination);
      o.start(zeit);
      o.stop(zeit + 0.08);
    };
    const schlag = 60 / BPM;
    for (let i = 0; i < 4; i++) klick(i * schlag, i === 3);

    // Die Maschine durchtakten: Uhr vorstellen, planen, wiederholen.
    for (let t = 0; t < dauer; t += 0.1) {
      jetzt = t;
      m.tick();
    }

    const fertig = await ctx.startRendering();
    /*
     * Als fertige WAV-Datei zurueckgeben, nicht als Zahlenreihe.
     *
     * Der erste Anlauf hat `Array.from(getChannelData(0))` gereicht - fuer
     * zwei Minuten sind das elf Millionen Fliesskommazahlen, die einzeln
     * durch die Browserbruecke serialisiert werden. Nach fuenf Minuten war
     * nicht eine einzige Datei fertig. Als Ganzzahlen und Base64 sind es
     * vier Megabyte am Stueck.
     */
    const l = fertig.getChannelData(0);
    const r = fertig.getChannelData(1);
    const n = l.length;
    const puffer = new ArrayBuffer(44 + n * 4);
    const s = new DataView(puffer);
    const text = (pos, wort) => { for (let i = 0; i < wort.length; i++) s.setUint8(pos + i, wort.charCodeAt(i)); };
    text(0, 'RIFF'); s.setUint32(4, 36 + n * 4, true); text(8, 'WAVE');
    text(12, 'fmt '); s.setUint32(16, 16, true); s.setUint16(20, 1, true);
    s.setUint16(22, 2, true); s.setUint32(24, RATE, true);
    s.setUint32(28, RATE * 4, true); s.setUint16(32, 4, true); s.setUint16(34, 16, true);
    text(36, 'data'); s.setUint32(40, n * 4, true);
    /*
     * Ein Deckel als reine Pegelaenderung, nicht als Begrenzer.
     *
     * Weil die Klicks am Begrenzer vorbeigehen, addieren sie sich im ersten
     * Takt roh auf die Musik - bei der lautesten Datei stand die Spitze
     * gemessen auf 1,00, also am Anschlag. Ein zweiter Begrenzer waere hier
     * das Falsche: Er wuerde wieder an der Zeitachse ziehen. Das ganze
     * Stueck gleichmaessig leiser zu machen kann das nicht.
     */
    let hoechst = 0;
    for (let i = 0; i < n; i++) {
      if (Math.abs(l[i]) > hoechst) hoechst = Math.abs(l[i]);
      if (Math.abs(r[i]) > hoechst) hoechst = Math.abs(r[i]);
    }
    const deckel = hoechst > 0.95 ? 0.95 / hoechst : 1;
    let spitze = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.max(-1, Math.min(1, l[i] * deckel));
      const b = Math.max(-1, Math.min(1, r[i] * deckel));
      if (Math.abs(a) > spitze) spitze = Math.abs(a);
      if (Math.abs(b) > spitze) spitze = Math.abs(b);
      s.setInt16(44 + i * 4, Math.round(a * 32767), true);
      s.setInt16(46 + i * 4, Math.round(b * 32767), true);
    }
    const bytes = new Uint8Array(puffer);
    let roh = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      roh += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return { wav: btoa(roh), sekunden: n / RATE, spitze };
  }, { quelle, stimmen, take, BPM, RATE });

  const wav = `${ORDNER}${take.name}.wav`;
  const mp3 = `${ORDNER}${String(take.nr).padStart(2, '0')}-${take.name}.mp3`;
  await fs.writeFile(wav, Buffer.from(roh.wav, 'base64'));
  await lauf('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame',
    '-b:a', '192k', '-metadata', `title=${take.titel} · ${BPM} BPM`, mp3]);
  // Die WAV bleibt liegen: Die Rasterpruefung vergleicht die MP3 dagegen und
  // findet so den Versatz, den der Kodierer einbaut.
  const { size } = await fs.stat(mp3);
  console.log(`${take.titel.padEnd(12)} ${roh.sekunden.toFixed(1)} s  ` +
    `Spitze ${roh.spitze.toFixed(2)}  ${(size / 1024).toFixed(0)} kB`);
}
await browser.close();
