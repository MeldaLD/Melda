# Der Partyrechner

Wie der Abend auf dem eigenen Rechner läuft, und wie man herausfindet, welche
Einstellung dort die beste ist. Nichts hier ist geraten – wo eine Zahl steht,
ist sie gemessen, und wo keine steht, sagt der Text warum.

## Vorher: die Recherche sagt „messen, nicht glauben"

Eine gezielte Recherche nach 2025/2026er Messungen für genau diesen Fall
– shader-gebundenes WebGL2 auf Windows mit einer Radeon RX 9070 XT – hat für
fast jede Browser- und Flag-Frage **kein belastbares Ergebnis** gefunden.
Keine veröffentlichte Gegenüberstellung Chrome/Edge/Firefox für diese Last,
keine für die ANGLE-Rückwände untereinander.

Das ist kein Mangel des Berichts, sondern die Antwort: Die Wahl ist eine
**messbare Größe und keine Glaubensfrage** – und das Werkzeug dafür steht
bereit. Der Messstand meldet den Durchsatz in Punkt-Schritten je
Millisekunde; diese Zahl hängt am Gerät und an der Rückwand, nicht am
Bildschirm und nicht an der Fenstergröße. Zwei Läufe, zwei Zahlen, fertig.

## Das Verfahren

Für jede Zeile der Tabelle: Browser starten, `/dj/messstand/index.html`
öffnen, **Kurzer Durchgang**, Durchsatz notieren.

| Was | Wie gestartet |
|---|---|
| Chrome, Vorgabe | `chrome --start-fullscreen` |
| Chrome, Direct3D 11 | `chrome --start-fullscreen --use-gl=angle --use-angle=d3d11` |
| Chrome, Vulkan | `chrome --start-fullscreen --use-gl=angle --use-angle=vulkan` |
| Chrome, Desktop-GL | `chrome --start-fullscreen --use-gl=angle --use-angle=gl` |
| Edge | dieselben Schalter, `msedge` statt `chrome` |
| Firefox | ohne Schalter |

Die Rückwand ist der einzige Schalter, dem die Recherche überhaupt zutraut,
den Durchsatz zu ändern – sie bestimmt, wie unser Schattierer für die Karte
übersetzt wird. Auf RDNA4 gibt es dazu keine veröffentlichte Messung, also
gilt die eigene.

Was drei unabhängige Recherchen übereinstimmend sagen, auch wenn keine es
belegen kann: **Direct3D 11 ist die Vorgabe und vermutlich schon die richtige
Wahl.** Vulkan liegt geschätzt zwischen 0,92× und 1,02× – also im Rauschen,
möglicherweise leicht schlechter. Nur Desktop-GL ist einhellig schlechter
(0,70× bis 0,85×). Erwarte also wenig; miss trotzdem, es kostet acht Minuten.

## Was ausdrücklich *nichts* bringt

Diese Schalter stehen in jeder Anleitung und sind für unseren Fall
wirkungslos, weil sie das Zusammensetzen der Seite betreffen und nicht die
Ausführung des Schattierers:

- `--enable-gpu-rasterization`, `--force-gpu-rasterization`, `--enable-zero-copy`
  – sie beschleunigen das Rastern von Webinhalten. Unser Bild entsteht in
  einem einzigen WebGL-Aufruf und wird davon nicht berührt.
- `--ignore-gpu-blocklist` – hebt nur eine Sperre auf. Wo die Karte ohnehin
  schon rechnet, ist es ein Nichts.

Und einer, von dem ausdrücklich **abzuraten** ist:

- `--disable-gpu-vsync` / `--disable-frame-rate-limit`. Sie lassen den Browser
  schneller zeichnen als der Bildschirm anzeigt. Das bringt für ein Fraktal
  nichts – wir setzen unsere Bildrate ohnehin selbst – und handelt sich
  Bildrisse ein. Auf einer Leinwand im Raum sieht man die.

Finger weg von `--disable-gpu`, `--disable-gpu-compositing`: Die schalten die
Grafikkarte ab.

## Windows und der Treiber

Auch hier ist die Beweislage dünn, und das steht so dabei:

- **Radeon Chill: aus.** Alle drei Recherchen sagen dasselbe, eine davon
  deutlich: Chill drosselt bei ausbleibender Eingabe auf die eingestellte
  Mindestbildrate, gern 30. Bei uns rührt stundenlang niemand Maus oder
  Tastatur an – das ist genau der Fall, für den Chill gebaut ist und den wir
  nicht wollen.

- **Surface Format Optimization: nachsehen, nicht raten.** Eine Quelle sagt,
  sie ersetze Gleitkommaformate durch gröbere und gefährde damit unsere
  Bezugsbahn; eine andere sagt, das betreffe nur alte DirectX-Programme und
  habe auf ausdrücklich angelegte RGBA32F-Texturen null Wirkung. Beide ohne
  Beleg. Deshalb prüft die Bühne es selbst: Die Technikanzeige (Taste T)
  schreibt bekannte Zahlen in eine solche Textur, liest sie zurück und
  vergleicht. Steht dort „kommt unverändert zurück", ist die Frage für diesen
  Rechner beantwortet.
- **Anti-Lag, Enhanced Sync: aus.** Beides verschiebt Latenz, keins macht den
  Schattierer schneller.
- **Hardwarebeschleunigte GPU-Planung, Spielmodus, Energieplan:** kein Beleg
  für einen Effekt auf shader-gebundene Last gefunden. Wer mag, misst es mit
  dem Messstand – zwei Läufe kosten vier Minuten.
- **Browser auf „Höchstleistung"** in den Windows-Grafikeinstellungen. Bei nur
  einer Karte bringt das nichts – aber ein Rechner mit Intel-Prozessor hat
  *zwei* Grafikeinheiten, und welche der Browser nimmt, entscheidet Windows.
  Nimmt er die eingebaute, läuft alles, nur um ein Vielfaches langsamer, und
  nichts sagt es einem. Die Technikanzeige weist jetzt darauf hin, wenn der
  gemeldete Kartenname nach eingebauter Grafik aussieht.

## WebGPU?

Naheliegende Frage, und die Antwort ist vorerst nein. Der mögliche Gewinn von
WebGPU liegt im Verwalten von Zeichenbefehlen – bei uns ist es *ein* Aufruf
über Millionen Bildpunkte mit Tausenden Schritten je Punkt. Der Verwaltungs-
anteil ist verschwindend. Eine Messung, die für diesen Fall einen Gewinn
zeigt, gibt es nicht.

Wofür WebGPU wirklich etwas brächte: Zeitmessung je Durchgang, die Safari uns
verweigert. Das ist Diagnose, kein Bild.

## Der Arbeitsspeicher

64 GB klingen nach einer Reserve, die sich nutzen ließe. Für das Bild nicht:
Die Bezugsbahn ist 16 Byte je Schritt, bei zehntausend Schritten also 160
Kilobyte. Die Grafikkarte hat 16 GB, und die sind die engere Grenze.

Wo die 64 GB wirklich etwas bringen, ist der Ton. Eine Stunde Stereo als
Fließkomma sind rund 1,3 GB; fünf Stundenmixe also etwa 6,4 GB. Die passen
bequem in den Speicher, und wenn sie vorab dekodiert dort liegen, kann es
mitten im Abend kein Ruckeln beim Nachladen geben. Das ist noch nicht gebaut
– die Bühne hält derzeit den laufenden und den nächsten Puffer.

Zwei Grenzen dabei, und die Recherchen widersprechen sich bei der ersten:
Eine einzelne ArrayBuffer-Zuteilung ist auf 4 GB (zwei Quellen) oder 32 GB
(eine Quelle) begrenzt – für uns egal, weil dekodierter Ton als AudioBuffer
außerhalb des JavaScript-Speichers liegt. Die zweite ist ernster: Ein
Chrome-Tab stürzt bei etwa 16 GB Gesamtspeicher ab. Mit 6,4 GB Ton bleibt
Luft, aber nicht beliebig viel.

## Die Einstellung am Abend

Auf der Bühne: **PC-Modus** setzt Güte hoch, 60 Bilder/s und alle Mandalas.
Er tut nichts, was nicht auch von Hand ginge; er spart nur das Wissen, welche
drei Regler zusammengehören.

Danach den Messstand laufen lassen und die Empfehlung übernehmen. Wenn dort
„Hoch" nicht durchgeht: erst **30 Bilder/s** probieren, bevor die Güte
sinkt. Auf einem 145-Hz-Monitor ist das der größere Hebel – weniger Bilder,
dafür die doppelte Punktzahl je Bild.

## Ton und Bild

Der Gleichlauf wird gerechnet, nicht gehofft. Die Tonausgabe hat eine
Verzögerung (auf dem iPad gemessen: 32 ms), das Bild bis zum Bildschirm eine
andere (16,7 ms bei 60 Hz). Die Bühne zieht beide gegeneinander ab und zeigt
die Stelle, die zu hören sein *wird*, wenn das Bild erscheint. Geplant wird
weiter in der Zeit des Rechenwerks – wer das vermischt, verschiebt jeden
Übergang.

Nachzulesen bei `anzeigeVersatz()` in `gemeinsam/mixer.js`, nachzuprüfen mit
`npm run dj:gleichlaufpruefen`.
