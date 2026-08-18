# Die Musik sehen

Rückmeldung von außen war: *„Es wäre geil, wenn das Gefühl, die Musik zu
sehen, noch stärker wäre."* Dieses Papier sagt, was daran gemessen falsch war,
was geändert wurde, und was es kostet.

Alle Zahlen stammen aus Messungen am laufenden Prüfstand, nicht aus Schätzung.
Die Abnahme dazu ist `pruefungen/musikimbild.mjs`.

## Drei Befunde

### 1. Der Kick kam 150 ms zu spät

Der Analyser des Browsers glättet, und der Faktor stand auf 0,75. Das ist ein
Tiefpass mit **58 ms Zeitkonstante**:

| Glättung | Zeitkonstante | nach 1 Bild | bis 90 % |
|---|---|---|---|
| 0,75 (vorher) | 58 ms | 25 % | 150 ms |
| 0,30 (jetzt) | 14 ms | 70 % | 33 ms |

Bei 128 Schlägen je Minute sind 150 ms **ein Drittel Schlag**. Das Taktraster
der Bühne sitzt derweil auf Millisekunden genau, weil es aus der Analyse kommt
und nicht aus einer Erkennung im Signal. Bewegung und Farbe liefen also
gegeneinander — und niemand konnte sagen, warum es „nicht ganz sitzt".

Was der Tiefpass an Ruhe geliefert hat, liefert jetzt ein **Spitzenhalter**:
Anstieg sofort, Abfall über rund 110 ms. Flimmern entsteht beim Zurückfallen,
nicht beim Ansteigen — deshalb kostet die Umstellung nichts an Ruhe.

### 2. Zwei Drittel des Spektrums waren tot

Gemessen über 900 Bilder Prüfstand, je Bin-Gruppe:

| Bins | Mittel | Max | über der Hälfte |
|---|---|---|---|
| 3..8 (Bass) | 192 | 255 | 94 % |
| 20..45 | 139 | 168 | 77 % |
| 98..212 | 70 | 113 | **0 %** |
| 212..459 | 40 | 109 | **0 %** |

Auf die Farbtabelle des Mandelbrots übersetzt: Die inneren Bänder sind
dauerhaft hell, die äußeren dauerhaft dunkel. Was sich bewegte, war ein
schmaler Ring in der Mitte.

Dagegen hilft eine **Verstärkung je Band**, bezogen auf das, was dieses Band
über die letzten Sekunden hergegeben hat. Sie ist auf gut das Dreifache
begrenzt, damit der Bass der Bass bleibt.

### 3. Oben wurde Rauschen abgetastet

Die Farbtabelle liest je Eintrag *einen* Bin. Am unteren Ende lesen **245 von
512** Einträgen denselben Bin wie ihr Vorgänger; am oberen überspringt jeder
Eintrag bis zu **13**. Ein Becken in Bin 700 wird also mit einer
Wahrscheinlichkeit von eins zu dreizehn überhaupt gesehen.

Deshalb wird jetzt zuerst in **64 logarithmische Bänder** zusammengefasst, über
das *Maximum* — ein Mittelwert würde die Spitze wegmitteln, auf die es ankommt.
Danach trägt jeder Bin den Wert seines Bandes, und das Abtasten kann keinen
Anschlag mehr verfehlen. Außerdem läuft die Frequenzachse der Tabelle jetzt nur
noch über die *nutzbaren* Bins; vorher waren die obersten elf Prozent der
Tabelle auf Frequenzen abgebildet, in denen seit je nichts steht.

## Was dabei herauskommt

Verschränkt gemessen — acht Blöcke abwechselnd mit und ohne Aufbereitung im
selben Durchlauf, damit die Musik beide Seiten gleich trifft:

| | ohne | mit |
|---|---|---|
| Korrelation Bild ↔ Bass | 0,89 | 0,84 |
| Helligkeitshub über einen Schlag | 14,8 % | **20,1 %** |
| obere Bänder über der Hälfte | 0 % | **80 %** |
| Bewegung im Bild je Bildpunkt | 15,4 | **17,1** |

Die Korrelation zum Bass *sinkt*, und das ist richtig so: Das Bild folgt jetzt
nicht mehr nur dem Bass, sondern dem ganzen Spektrum. Eine Abnahme, die nur
gegen den Bass misst, bestraft genau die Verbesserung, um die es geht.

### Zwei Messfehler auf dem Weg

Beide sind in der Abnahme dokumentiert, damit sie niemand wiederholt:

- **Gegen den geglätteten Bass zu messen konnte die Verspätung gar nicht
  finden.** Bass und Bild kommen aus demselben Analyser, tragen dieselbe
  Verzögerung, und der Versatz zwischen ihnen ist per Konstruktion null.
  Gemessen wird deshalb gegen das Taktraster.
- **Nacheinander zu messen misst den Track, nicht die Änderung.** Der erste
  Anlauf ergab für die Bildbewegung 23,6 gegen 1,0 — angeblich ein Einbruch um
  96 %. In Wahrheit lief zwischen beiden Durchgängen ein Breakdown.

## Was es kostet

**2 Mikrosekunden je Bild**, gemessen über 20 000 Durchläufe. Das sind 0,012 %
eines 16,7-ms-Bildes und weniger als die Hälfte dessen, was der Bau der
Farbtabelle daneben ohnehin braucht (5,1 µs).

Der Grund, dass es so billig ist: Die Aufbereitung *ersetzt* Arbeit. Sie fasst
460 nutzbare Bins in 64 Bänder zusammen und schreibt zurück — gut tausend
Rechenschritte. Die Alternative, jeden Bin einzeln zu behandeln, wäre teurer
und würde zugleich das Abtastproblem nicht lösen.

Die Glättung des Analysers zu senken kostet nichts: Es ist derselbe FFT, nur
mit anderem Nachlauf.
