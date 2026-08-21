# Der Lagerraum

Was dieser Raum kann, was er nicht kann, und was daraus für die Gestaltung
folgt. Alles hier ist an der nachgestellten Messung gerechnet und hängt in
`npm run dj:lagerpruefen`.

---

## Vier Materialien, drei Probleme, eine Chance

| Fläche | Gemessen (geschätzt) | Neutralität | Trägt Farbe? |
|---|---|---|---|
| Grobspanplatte (OSB) | rgb(200 155 95) | 0,47 | **nein** |
| Verzinkter Stahl | rgb(150 152 155) | 0,97 | **ja** |
| Flaschenglas | rgb(40 38 34) | – | bleibt schwarz |
| Deckenbalken | rgb(120 100 74) | – | nein |

## Warum die Holzwand keine Farbe kann

Ein Beamer addiert Licht zu dem, was die Fläche zurückwirft. Je Kanal gilt
grob `gesehen = geworfen × Rückwurf`. Die OSB-Platte wirft Rot fast doppelt
so stark zurück wie Blau — und damit passiert Folgendes:

```
Farbwinkel        zurückkommendes Licht (1,0 = bestmöglich)
Gelb   55°        1,00
Rot    20°        0,52
Blau  220°        0,29
```

Blau auf Orange wird also nicht zu blassem Blau. Es wird zu **fast nichts**.
Wer dort ein buntes Bild hinwirft, bekommt kein buntes Bild, sondern ein
flaues.

### Warum wir trotzdem nicht kompensieren

Das Gegenmittel heißt radiometrische Kompensation: Man teilt das Wunschbild
durch den Rückwurf. Es funktioniert — und kostet genau das, was es
verspricht. Der schwächste Kanal müsste hier um **Faktor 2,11** angehoben
werden. Ein Beamer kann Blau aber nicht verdoppeln; er kann nur Rot und Grün
herunterziehen. Übrig bliebe weniger als die halbe Helligkeit, und in den
hellen Stellen läuft die Rechnung aus dem darstellbaren Bereich und clippt
sichtbar. Das ist auch in der Literatur die bekannte Grenze des Verfahrens.

Für eine Party in einem Lagerraum ist das der falsche Handel.

## Die Entscheidung

> **Farbe gehört auf die Gitterkästen. Die Holzwand bekommt warmes Licht mit
> starkem Hell-Dunkel.**

Das ist keine Notlösung, sondern das, was der Raum kann:

- Verzinkter Stahl ist mit 0,97 praktisch neutral — er gibt Farben
  ungefälscht wieder. Auf ihm liegen Blau (0,34) und Rot (0,48) nah
  beieinander, auf dem Holz nicht.
- Das dunkle Flaschenglas dahinter bleibt schwarz und liefert den Kontrast,
  den die Holzwand nicht hergibt.
- Stahl wirft **gerichtet** zurück, nicht diffus. Ein kleiner heller Fleck
  darauf *blitzt*, wo derselbe Fleck auf Holz nur ein Fleck wäre.

Umgesetzt ist das in zwei Farbsätzen statt einem: Die Töne für die Wand
werden auf das geschoben, was sie wiedergeben kann; die Töne für die Kästen
bleiben, wie die Palette sie meint.

## Die Kästen sind eine Anzeigetafel

Ein Stapel Gitterkästen sieht aus wie eine Lautsprecherwand — gleiche Größe,
gleiches Raster, gestapelt. Dahinter stehen hunderte Flaschenböden in einem
regelmäßigen Feld. Das ist eine **gebaute Punktmatrix**, die schon da ist.

Jeder Kasten wird über eine Abbildung vom Einheitsquadrat auf sein Viereck
angesprochen — dieselbe Rechnung wie für die ganze Wand, nur eine Stufe
kleiner. Damit sitzen die Zellen auch dann richtig, wenn der Kasten schief im
Bild steht; linear geteilt träfe man die unteren Reihen nicht mehr.

Fünf Muster, die auf der Phrase wechseln:

| Muster | Was es tut |
|---|---|
| **Pegel** | Pegelanzeige je Spalte aus dem Spektrum, Bass links |
| **Lauf** | eine Spalte wandert, ein Schritt je Schlag |
| **Welle** | eine Diagonale läuft durchs Feld |
| **Funkeln** | einzelne Zellen blitzen — nutzt den Stahlglanz am besten |
| **Atem** | das ganze Feld hebt und senkt sich, langsam |

Beim Drop leuchtet die ganze Wand einmal auf.

## Und die Mandalas?

Die reagieren mit — und zwar **alle**, ohne dass ein einziger Modus davon
weiß.

Nachdem ein Modus gezeichnet hat, wird das fertige Bild abgetastet: Was an
der Stelle einer Zelle hell ist, lässt die Flasche darunter aufleuchten. Ein
Iris-Ring, der über einen Kasten läuft, zieht eine Spur aus echten Flaschen
hinter sich her.

Der naheliegende Weg wäre gewesen, jedem Modus die Kästen beizubringen —
zwanzig Änderungen und jeder neue Modus müsste wieder daran denken. So ist es
eine Stelle, und ein neuer Modus reagiert automatisch.

Abgetastet wird nicht die große Leinwand, sondern eine 64 × 48 kleine Kopie
davon. Kosten gemessen: **+1,35 ms** auf 3,65 ms, bei einem Budget von
16,7 ms.

## Zahlen aus der Abnahme

```
322 Zellen in vier Kästen, alle Zellmitten im Kasten
Eckentreffer der Abbildung          0,0 Bildpunkte
Holzwand trägt Farbe                nein  (Neutralität 0,47)
Stahl trägt Farbe                   ja    (Neutralität 0,97)
Blau gegen Rot auf Holz             0,29 gegen 0,52
Blau gegen Rot auf Stahl            0,34 gegen 0,48
Kompensation würde kosten           Faktor 2,11
Flaschenwand                        6,86 ms gegen 6,34 ms Lichtpark
```

## Was noch offen ist

- Die Farbwerte oben sind aus dem Handyfoto vom Aufbautag **geschätzt**, nicht
  gemessen. Sobald das Messfoto durch die Einmessseite läuft, ersetzt sie der
  Median je Kanal — automatisch, je Bereich einzeln.
- Wie viele Fächer die Kästen wirklich haben, steht noch nicht fest. Beim
  Markieren eintragen; die Abnahme rechnet bisher mit 11 × 7 und 12 × 7.
