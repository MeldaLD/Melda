# Wo die Rechenzeit hingeht

Der Messstand sagt, was ein Gerät schafft. Dieses Papier sagt, *woran* es
liegt und was sich daran ändern ließe. Alle Zahlen hier sind gezählt, nicht
geschätzt, und zwar in Punkt-Schritten statt in Millisekunden – die hängen am
Gerät, Punkt-Schritte nicht.

Nachzurechnen mit `node werkzeuge/punktschritte.mjs` und
`node werkzeuge/keilzaehler.mjs`. Beide bauen den Rechenweg des Schattierers
in reinem JS nach und brauchen keine Grafikkarte.

## Der Befund: es sind zwei Probleme, nicht eines

| Tiefe | Schritte je Punkt | innen % | Anteil der Arbeit in Innenpunkten |
|---:|---:|---:|---:|
| 2 | 263 | 28 % | **75 %** |
| 4 | 155 | 0 % | 1 % |
| 6 | 892 | 68 % | **81 %** |
| 8 | 1247 | 0 % | 2 % |
| 10 | 1149 | 1 % | 2 % |
| 12 | 2081 | 1 % | 1 % |
| 14 | 3490 | 7 % | 10 % |
| 16 | **8548** | 4 % | 6 % |

Das ist die wichtigste Tabelle des ganzen Papiers, und sie sagt etwas, das
man von außen nicht sieht:

- **Die teuren flachen Zeilen (2 und 6) sind teuer wegen der Innenpunkte.**
  Bei Tiefe 6 liegen 68 % der Bildpunkte innerhalb der Menge; sie entkommen
  nie, laufen jeden Schritt bis zum Deckel und stecken vier Fünftel der
  gesamten Rechenzeit in Flächen, die am Ende einfarbig sind.
- **Die teuren tiefen Zeilen (14 und 16) sind teuer aus einem ganz anderen
  Grund:** Dort liegt fast nichts im Inneren, aber die Punkte, die entkommen,
  brauchen dafür im Schnitt achttausend Schritte.

Zwei Probleme, zwei Mittel. Ein Mittel gegen beide gibt es nicht.

## Was schon gebaut ist und nachweislich wirkt

**Die Innenerkennung** (Brents Zyklussuche) greift genau dort, wo die
Innenpunkte sitzen. Gemessen bei Tiefe 6: **60 % weniger Schritte.**

Sie ist abgeschaltet, sobald `spanne < 1e-6` – also ab Tiefe rund 6,2. Ob
diese Grenze richtig sitzt, war offen; jetzt ist es gemessen:

| Tiefe | Ersparnis | fälschlich als „innen" erklärt |
|---:|---:|---:|
| 5,5 | 26 % | 0,4 % |
| 6,0 | 60 % | 1,5 % |
| 6,5 | 81 % | **7,4 %** |
| 7,0 | 82 % | **16,3 %** |
| 8,0 | 81 % | **84,5 %** |

Die Grenze sitzt richtig. Ein Stück weiter, und jeder vierzehnte Bildpunkt
wäre fälschlich schwarz – das sieht man. Bei Tiefe 8 und tiefer bricht das
Verfahren völlig zusammen (85 % falsch), und der Grund ist klar: In der Tiefe
ist `d` so klein, dass `z = Z + d` praktisch gleich der Bezugsbahn ist. Die
Zyklussuche findet dann nicht den Zyklus des Bildpunkts, sondern den der
Bezugsbahn – für alle Punkte denselben, bei Schritt 206. Ein relativer statt
absoluter Schwellwert hilft dagegen nicht; auch das ist nachgemessen.

Dass die Innenerkennung in der Tiefe fehlt, kostet ohnehin fast nichts: Dort
liegen nur 1 bis 7 % der Punkte innen.

## Vorschlag 1: das Kaleidoskop ausnutzen

**Der größte Posten, und er ist speziell für dieses Programm.**

Jede Faltung im Schattierer bildet die ganze Ebene in einen Keil ab – das ist
die Bauart eines Kaleidoskops. Die Grafikkarte rechnet den Keil aber so oft,
wie er im Bild vorkommt. Gezählt, wieviele Bildpunkte nach der Faltung
überhaupt auf verschiedene Stellen fallen (1600×900):

| Faltung | verschiedene Punkte | Dubletten |
|---|---:|---:|
| Rosette 3 | 27,0 % | **73 %** |
| Rosette 6 | 13,5 % | **87 %** |
| Rosette 8 | 10,1 % | **90 %** |
| Rosette 16 | 5,5 % | **95 %** |
| Windrad 9 (nur Drehung) | 18,8 % | 81 % |
| Fliese | 18,5 % | 81 % |

Bei „Rosette 6" wird also jeder Punkt im Schnitt siebeneinhalbmal gerechnet.

**Wie man es einlöst:** Den Keil einmal in eine Textur rechnen, das Bild
daraus nachschlagen. Das ist ein alter Trick – Demoszene und frühe
Spieleentwickler haben Spiegelungen und Kacheln immer so gemacht, weil
Rechnen teuer war und Nachschlagen billig.

**Die Haken, und sie sind ernst:**

1. **Es gilt nur bei voller Symmetrie.** Der Schattierer blendet zwischen
   ungefaltet und gefaltet über (`mix(roh, falten(roh), mandala)`). Bei
   `mandala = 0,5` liegt der Abtastpunkt zwischen beiden – und dann gibt es
   keine Dubletten mehr. Volle Symmetrie steht nur bei bestimmten Szenen und
   bei hoher Spannung an. **Wieviel des Abends das ist, weiß ich nicht** – das
   müsste die Bühne erst mitschreiben.
2. **Nachschlagen ist unschärfer als Rechnen.** Zwischen den Texturpunkten
   wird interpoliert; feine Bänder verlieren dabei. Ein Teil der 87 % geht
   dafür wieder drauf.
3. Die Bandglättung (`fwidth`) und die Naht am Keilrand brauchen eigene
   Behandlung.

**Realistisch:** 50 bis 70 % weniger Fraktalarbeit – aber nur in den
Momenten voller Symmetrie, und mit spürbarem Bauaufwand.

## Vorschlag 2: BLA statt Reihenentwicklung

**Der größte Posten für die tiefen Zeilen – aber noch nicht fertig gedacht.**

Heute springt die Reihenentwicklung einmal am Anfang und überspringt damit
bei Tiefe 16 genau 2694 von 12467 Schritten (**22 %**). BLA (bilineare
Näherung, Zhuoran 2021) springt überall dort, wo der Sprung zulässig ist,
und ist das, womit moderne Tiefenzoomer arbeiten.

Prototyp gebaut und gezählt:

| Tiefe | echte Schritte ohne | mit BLA | Ersparnis |
|---:|---:|---:|---:|
| 10 | 1148 | 392 | **66 %** |
| 12 | 2080 | 715 | **66 %** |
| 14 | 3490 | 669 | **81 %** |
| 16 | 8546 | 800 | **91 %** |

**Und dann der Haken, der alles entscheidet.** Das Bild stimmt nicht. Bei
Tiefe 16 weichen 11 % der Bildpunkte sichtbar ab, und zwar in der
schlimmsten denkbaren Form:

- Die abweichenden Punkte liegen **einzeln** – 53 bis 94 % von ihnen haben
  keinen abweichenden Nachbarn. Das ist kein anderes Bild, das ist Grieß.
- Und es sind bei jedem Bild **andere** Punkte: Zwischen Tiefe 16,00 und
  16,02 überschneiden sich die abweichenden Mengen nur zu 2 bis 8 %.

Zusammen heißt das: **funkelndes Rauschen**. Auf einer Leinwand ist das das
Auffälligste, was es gibt – auffälliger als jedes Ruckeln.

Enger gestellt wird es besser, aber die Ersparnis fällt mit:

| Toleranz | Ersparnis (Tiefe 16) | sichtbar abweichend |
|---|---:|---:|
| 1e-6 | 91 % | 11,3 % |
| 1e-8 | 80 % | 6,2 % |
| 1e-10 | 65 % | 2,2 % |
| 1e-12 | 38 % | 0,9 % |

Selbst bei 1e-12 flimmert noch fast jeder hundertste Punkt.

**Mein Verdacht, warum:** Der Prototyp springt über Stellen hinweg, an denen
die Bahn eigentlich neu angesetzt werden müsste (Zhuorans Rebasing, die Zeile
`if (r2 < dot(d,d) || m >= bahnLaenge-1)` im Schattierer). Genau die Punkte,
bei denen das passiert, liegen verstreut und wechseln von Bild zu Bild – das
paßt zum Befund. In der Literatur ist BLA korrekt; der Fehler liegt also
vermutlich bei mir und nicht am Verfahren. **Das ist die eine Stelle, an der
ich Recherche brauche.**

## Vorschlag 3: die Fahrt nicht tiefer treiben, als der Rechner trägt

Der billigste Vorschlag von allen, weil er nichts kostet außer einer Zahl.

Die Fahrt läuft bis Tiefe 26 (`MANDEL_MAX_TIEFE_GPU`). Tiefe 16 kostet auf
einer RX 9070 XT schon 300 ms je Bild auf „Hoch". Alles darüber ist Tiefe,
die kein Mensch als Tiefe erkennt – es sieht genauso aus wie Tiefe 12 –, aber
sie kostet das Zehnfache.

**Ersparnis: der ganze Ausschlag.** Statt zwischen 155 und 8548 Schritten zu
schwanken, bliebe die Fahrt in einem Band, das der Rechner hält.

**Der Preis:** Die Fahrt setzt öfter neu an. Das ist eine Änderung, die man
*sieht* – nicht als Fehler, aber als anderes Tempo. Deshalb steht sie hier
als Vorschlag und ist nicht schon eingebaut.

## Vorschlag 4: nur jeden zweiten Punkt rechnen

Schachbrettmuster – der Trick, mit dem die PS4 Pro ihre 4K gemacht hat. Ein
Bild rechnet die schwarzen Felder, das nächste die weißen, dazwischen wird
aus dem Vorbild ergänzt.

Bei uns gibt es dafür eine besonders saubere Fassung: Zwischengespeichert
wird nicht die *Farbe*, sondern die **Ausstiegszeit**. Die Farbe entsteht
daraus in jedem Bild neu – die Palette, die Drop-Welle, der Farbversatz
bleiben also vollständig lebendig und auf dem Beat. Nur die Geometrie ist
einen halben Bildschritt alt, und die ändert sich langsam.

**Realistisch: 45 bis 50 %,** über alle Tiefen, ohne Rücksicht auf die
Symmetrie. Nicht gemessen – das ist eine Schätzung aus der Bauart.

**Der Haken:** An Kanten, die schnell wandern, entstehen Schlieren. Bei einem
Zoom, der pro Bild um weniger als ein Prozent weiterrückt, sollte das kaum
auffallen; sicher ist es erst, wenn man es sieht.

## Was sich *nicht* lohnt

- **Innenerkennung in der Tiefe reparieren.** Dort liegen nur 1 bis 7 % der
  Punkte innen – selbst eine perfekte Erkennung spart unter 10 %.
- **Relativer statt absoluter Schwellwert bei der Zyklussuche.** Gemessen:
  ändert nichts (98 % Ersparnis bei Tiefe 16, aber dieselben 85 % falschen
  Punkte).
- **Am Schattierer feilen** – eine Multiplikation hier, ein Betrag da. Der
  Engpaß in der Schleife ist der Texturzugriff auf die Bezugsbahn, nicht das
  Rechnen. Was Rechenzeit spart, muß *Schritte* sparen, nicht Rechenschritte
  innerhalb eines Schritts.

## Die Reihenfolge, die ich empfehle

1. **Vorschlag 3** (Tiefe deckeln) – kostet nichts, wirkt sofort, ist eine
   Entscheidung und keine Baustelle.
2. **Vorschlag 4** (Schachbrett auf der Ausstiegszeit) – wirkt immer, ist
   überschaubar, und die Musik-Bild-Kopplung bleibt unangetastet, weil die
   Farbe jedes Bild neu entsteht.
3. **Vorschlag 1** (Kaleidoskop) – der größte Posten, aber erst nachdem die
   Bühne mitgeschrieben hat, wieviel des Abends überhaupt bei voller
   Symmetrie läuft.
4. **Vorschlag 2** (BLA) – erst wenn die Frage nach dem Rebasing beantwortet
   ist. Vorher ist es funkelndes Rauschen.
