# Der Schatten-DJ

Unten im Bild steht die Silhouette eines DJs hinter seinem Pult. Sie bewegt
sich zu der Musik, die gerade läuft – und zwar messbar zu *dieser* Musik.

Dieses Papier beschreibt, wie die Figur gebaut ist, warum die beiden
Vorgängerfassungen falsch aussahen, und was daraus zu lernen war.

## Wie sie gebaut ist

**Eine** Zeichnung – schwarze Silhouette auf weiß, vom Scheitel bis zur Hüfte,
Arme frei vom Körper. Daraus macht `werkzeuge/schattenumriss.mjs` beim Bauen
vier geschlossene Streckenzüge (878 Punkte aus 3122 rohen): Körper, linker
Arm, rechter Arm, Kopfhörerbügel. Die weiße Ärmelnaht schneidet die Arme vom
Rumpf ab – die Trennung steckt also schon in der Zeichnung und muss nicht
gerechnet werden.

Der Zeichner verformt diesen Umriss an einem Skelett, wie es
2D-Skelettanimation überall tut (Spine, Live2D, DragonBones): Jeder Randpunkt
gehört anteilig zu einem oder mehreren Knochen und wandert mit ihnen. Vier
Knochen genügen – Rumpf, Kopf, je Seite Ober- und Unterarm.

Der teure Teil eines solchen Verfahrens – Dreiecksnetz, Texturkoordinaten,
Schattierer – fällt weg, weil eine Silhouette keine Innenzeichnung hat. Zu
bewegen ist nur der Rand. **Gemessen 0,14 ms je Bild** in einem Chromium ohne
Grafikkarte; die alte Fassung aus Bildern kostete 0,53 ms.

## Was am Bild gemessen wird, statt geraten zu sein

Das Werkzeug misst die Gelenke selbst, damit eine andere Zeichnung nicht
sämtliche Zahlen im Code ungültig macht:

| Marke | Verfahren | Wert |
|---|---|---|
| Hals | schmalste Stelle zwischen Kopf- und Schulterbreite, Mitte des Plateaus | 0,245 |
| Handgelenk | schmalste Stelle zwischen Armmitte und Fingerspitze | 0,812 |
| Schultergelenk | wo der Rumpf 80 % seiner vollen Breite erreicht, auf der Armachse | ±0,157 / 0,341 |
| Ellenbogen | 42,3 % der Strecke Schulter–Fingerspitze (Anatomie) | ±0,209 / 0,612 |
| Hand | Mitte zwischen Handgelenk und Fingerspitze | ±0,240 / 0,897 |
| Plattenteller | erste Spaltengruppe über der Tischkante im Pultbild | 0,251 der Pultbreite |

Alle Maße in Figurenhöhen: y = 0 ist der Scheitel, y = 1 die Unterkante.

**Gegenprobe.** Schultergelenk und Handgelenk werden auf zwei unabhängigen
Wegen bestimmt – das eine aus der Rumpfbreite, das andere aus den
Gliedmaßenverhältnissen. Das Werkzeug rechnet beide und meldet die Abweichung;
sie liegt bei 1,3 % der Figurenhöhe.

## Drei Fehler, und was sie gemeinsam haben

### 1. Die Gliederpuppe aus fünf Teilen

Die erste Fassung setzte Pult, Kopf, Rumpf, Oberarm und Unterarm aus fünf
einzeln gezeichneten Bildern zusammen. Ergebnis: zwei Schultern übereinander
(Rumpf und Oberarm brachten beide eine mit), harte Nähte an den Gelenken,
nichts verformte sich, vier verschiedene Strichstärken. Etwas, das *fast* wie
ein Mensch aussieht und genau deshalb unheimlich wirkt.

Die Wurzel: Die Teile waren unabhängig voneinander entstanden. Eine Zeichnung
hat dieses Problem nicht.

### 2. Der Ärmel, der dem Arm folgen sollte

Das Schultergelenk sitzt im Rumpf, gut ein Fünftel der Figurenhöhe über der
Ärmelnaht. Dreht der Arm darum und der Ärmel bleibt stehen, reißt ein weißer
Keil auf. Der naheliegende Ausweg – die Randpunkte des Ärmels anteilig dem
Oberarmknochen zuschlagen – **schmiert**: Ein Punkt mit Gewicht 0,5 dreht bei
90 Grad Armdrehung nur 45 Grad mit. Bei erhobenen Armen stand der Rumpf als
schmales Rechteck ohne Schultern da, und aus den Ärmeln wurden Zipfel.

Der richtige Weg geht andersherum: Der Rumpf bleibt starr, und der **Arm**
bekommt das Stück, das ihm fehlt – einen Balken in Armbreite vom Gelenk bis
zur Naht, oben rund abgeschlossen. Im Ruhestand liegt er vollständig hinter
dem Rumpf und ist unsichtbar; beim Heben wird er zum Deltamuskel. Weil er
denselben Knochen trägt wie der Arm, kann zwischen beiden nie eine Fuge
entstehen.

### 3. Das Pult gab der Figur ihr Maß

Die Pultbreite hing am Bildschirm, die Figur richtete sich danach. Auf einer
Leinwand wurde das Pult 562 Bildpunkte breit und die Figur 292 hoch – ein
Möbel von der doppelten Schulterbreite, hinter dem ein Kind steht.

Schlimmer war die Nebenwirkung: Die Schulter stand damit nur 0,38
Figurenhöhen über der Platte, bei einer Armlänge von 0,64. Der Arm musste sich
für eine Reichweite von 128 Bildpunkten auf 194 zusammenfalten, der Ellenbogen
klappte vor die Brust – die Figur sah aus, als verschränke sie die Arme.

Jetzt führt die Rechnung von der Figur zum Pult. Ein DJ-Tisch ist gut
zweieinhalb Schultern breit; die Pultkante schneidet die Figur bei 0,87 ab,
weil ein Pult knapp einen Meter hoch ist und eine Hüfte auch. Der Griff zum
Teller braucht damit 87 % der Armlänge: leicht gebeugt, so wie jemand steht,
der auflegt.

### Das Gemeinsame

Alle drei sind auf jeder Zahl unsichtbar. Die Feder stimmte, die Rechenzeit
stimmte, die Hände gingen brav hoch – und die Figur war trotzdem falsch.
Gefunden wurden sie ausschließlich, indem Standbilder gerendert und
**angesehen** wurden (`werkzeuge/schattenbilder.mjs`, sieben Haltungen, seit
diesem Umbau jede zusätzlich als Ausschnitt in doppelter Größe – auf 200
Bildpunkten Figurenhöhe ist nicht zu erkennen, ob ein Ellenbogen in die
richtige Richtung knickt).

Was sich daraus in eine Abnahme übersetzen ließ, steht jetzt drin: Die Figur
muss auch mit erhobenen Armen **ein zusammenhängendes Stück** sein. Das hätte
Fehler 2 gefunden.

## Der Groove liegt auf dem Takt, nicht auf dem Schlag

Lange Zeit federte der Körper auf **jeden** Schlag – ein Stoß in eine
gedämpfte Feder, gestaffelt nach Eins, Phrase und Rest. Die Abnahme hat das
verlangt und die Figur hat es bestanden. Vor der Leinwand war es trotzdem
falsch:

> „Dieses dauerhafte, ich nenne es mal Klopfen, passend zum Beat. Zumindest
> bei elektronischer Musik geht das nicht."

Der Grund liegt im Material. Ein Technostück hat vier gleich schwere Schläge
je Takt. Wer auf jeden davon reagiert, gibt genau das wieder, was ohnehin
schon zu hören ist – heraus kommt ein Metronom mit Armen. Bei einem Stück mit
Backbeat wäre es anders: Dort tragen zwei der vier Schläge das Gewicht, und
ein Nicken darauf hat eine Richtung.

Was ein Mensch an einem Pult stattdessen tut, ist an sich selbst
nachzuvollziehen: Er verlagert das Gewicht von einem Bein aufs andere, **einen
Takt je Seite**. Während der Verlagerung sackt die Hüfte ab, im Stand über
einem Bein steht er wieder hoch. Das Auf und Ab ist also gar nicht
angetrieben – es fällt beim Verlagern von selbst an, einmal je Takt statt
viermal. Und weil die Hände auf den Tellern liegen bleiben, während die
Schulter mitwandert, beugen sich die Ellenbogen von allein mit.

Gemessen, indem die Kopfhöhe nach Schwingungen **je Schlag** zerlegt wird:

| Komponente | alt | jetzt |
|---|---|---|
| 1,000 je Schlag – das Klopfen | 3,62 px | **0,13 px** |
| 0,250 je Schlag – einmal je Takt | 0,53 px | **5,12 px** |

Die beiden Zahlen haben die Plätze getauscht, und zwar um mehr als das
Zwanzigfache in beide Richtungen.

Für die Feder bleibt das, wofür sie gebaut ist: die Ausnahme. Phrasengrenze
und Drop, also alle acht bis sechzehn Sekunden einmal. Genau dadurch fällt sie
wieder auf.

**Eine Abnahme, die das Falsche verlangt, ist schlimmer als gar keine** – sie
hält die Verbesserung auf. Die Prüfung „der Kopf nickt auf den Schlag" ist
deshalb nicht gelöscht, sondern **umgedreht**: Sie misst dieselbe Zahl und
verlangt jetzt, dass der Anteil je Schlag verschwindet. Dazu kommt eine
zweite: Eine Verlagerung muss bei jedem Tempo acht Schläge dauern – bei 100
Schlägen je Minute 4,80 s, bei 175 nur 2,75 s. Eine Bewegung nach der Uhr
fiele hier durch.

## Ein Schatten leuchtet nicht

Über den Umriss lief ein zweiter, weißer Durchgang, ein paar Bildpunkte nach
oben versetzt: ein Streiflicht auf allen Oberkanten. Es ist raus, und nicht
aus Geschmack – es verletzte die Physik der Szene. Was da steht, ist ein
Körper **vor** einer leuchtenden Fläche. Ein Körper ist undurchsichtig; er
kann nichts nach vorn abstrahlen. Der Saum machte aus dem Schatten eine
beleuchtete Puppe.

Bleibt die Frage, ob der Umriss sich ohne ihn überhaupt noch abhebt. Gemessen
am Grund hinter der Figur, bei abgeschaltetem Schatten, über 120 Bilder je
Modus:

| Modus | Median sRGB | unteres Zehntel | unter 6 |
|---|---|---|---|
| Mandelbrot | 47 | 18 | 0,0 % |
| Mandala | 54 | 22 | 0,1 % |
| Tunnel | 82 | 53 | 0,0 % |

Praktisch nirgends ist der Grund so dunkel, dass ein schwarzer Umriss darin
verschwände. Der Saum war also nicht einmal nötig, um die Figur zu finden.

Dieselbe Messung ergab noch etwas: Rund drei Prozent des Grundes liegen
**dunkler** als das fast-schwarze `rgb(4,5,10)`, mit dem die Figur bisher
gefüllt war. Dort hob sie sich als *hellerer* Fleck ab – genau verkehrt herum
für einen Schatten. Sie ist jetzt reines Schwarz.

Es kostet auch nichts, sondern spart: ein Fülldurchgang über die ganze Figur
und ein zweites Blitten des Pults fallen weg. **0,057 ms je Bild** statt 0,147.

## Was sie sonst tut

- **Arm hoch beim Aufbau**, je näher der Drop kommt.
- **Beide Arme beim Drop**, mit rund zwei Sekunden Nachhall.
- **Kopfhörer ans Ohr im Breakdown** – die Bühne bereitet dann wirklich den
  nächsten Track vor.
- **Hand am Regler beim Übergang**, mit dem echten Reglerstand. Wer genau
  hinsieht, kann am Schatten ablesen, wie weit der Wechsel ist.
- **Zeigefinger ins Publikum** auf Phrasengrenzen, manchmal.

## Bedienung

Vorgabe **an**, abschaltbar mit Taste D oder dem Haken unter „Bild". Wer sie
einmal abgeschaltet hat, bekommt sie nicht wieder aufgedrängt.

## Wenn eine neue Zeichnung her soll

> Full body silhouette of a standing DJ from the hips up, seen straight from
> the front. Wearing a plain t-shirt and large over-ear headphones. Relaxed
> neutral standing pose, both arms hanging slightly away from the body with a
> slight bend at the elbows, hands relaxed and open, clearly separated from
> the torso with visible white gaps between each arm and the body. Flat vector
> silhouette, pure solid black (#000000) on pure white (#FFFFFF), no grey, no
> gradient, no shading, no outline, no drop shadow, no floor, no background,
> no perspective, no face details. Clean smooth vector edges. Centered, whole
> figure inside the frame with margin.

Negativ: `grey, gradient, shading, outline, drop shadow, glow, background,
text, watermark, perspective, 3D, photorealistic, arms touching the body,
crossed arms, hands in pockets, cropped limbs`

Drei Bedingungen, und sie folgen alle aus dem Verfahren:

- **Die Arme dürfen den Rumpf nicht berühren.** Sonst verschmilzt der Umriss
  und die Randverfolgung kann Arm und Rumpf nicht mehr trennen.
- **Von den Hüften aufwärts, entspannt stehend.** Aus dieser Haltung heraus
  lässt sich in jede andere drehen; aus einer verschränkten heraus nicht.
- **Reines Schwarz auf reinem Weiß.** Kein Schatten, keine Innenzeichnung,
  keine Perspektive.

Danach:

```
node werkzeuge/schattenumriss.mjs werkzeuge/schattenquellen/figur.jpeg
node werkzeuge/schattenbilder.mjs        # und die Bilder ansehen
node pruefungen/schattendj.mjs
```

Das Werkzeug meldet die Gegenprobe zwischen den beiden Wegen zum
Schultergelenk. Weicht sie um mehr als vier Prozent ab, stimmt etwas an der
Zeichnung nicht – meist eine Hand in der Tasche oder ein angeschnittener Arm.
