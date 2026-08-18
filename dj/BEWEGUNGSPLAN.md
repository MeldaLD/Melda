# Von der Aufnahme zur Figur: der Plan

Was mit den DeepMotion-Dateien passieren soll, Schritt für Schritt – was
davon steht und gemessen ist, was noch fehlt, und **wo ich mir selbst noch
nicht traue.**

---

## Warum der alte Weg eine Decke hatte

Zwei Gründe, und keiner davon ließ sich wegtunen:

- **Eine Silhouette von vorn hat keine Tiefe.** Ein Arm, der zur Kamera zeigt
  oder vor dem Körper kreuzt, ist darin gar nicht enthalten. Die Drehung sah
  deshalb an manchen Stellen aus, als bräche etwas – die Information fehlte,
  sie war nicht falsch gerechnet.
- **Getanzt wird nicht in Sinuskurven.** Gewicht, Vorbereitung, Nachschwingen,
  Asymmetrie – das schreibt man nicht auf, das nimmt man auf.

## Die Kette

| | Schritt | Stand |
|---|---|---|
| 1 | **BVH lesen** – Knochenbaum, Drehreihenfolge, Weltkoordinaten | fertig, abgenommen |
| 2 | **Tipper finden** – der Einzähltakt in den Bewegungsdaten | fertig, ±4 ms |
| 3 | **Ausrichten** – Kameraschräglage herausrechnen | fertig, ±0,00° |
| 4 | **Umrechnen** – Gelenkstellungen → Knochenrichtungen | fertig |
| 5 | **Schleife wählen** – bestes Stück, Naht schließen | fertig, 0,00° Rest |
| 6 | **Zeichnen** – Silhouette aus Knochenrichtungen | **fehlt** |
| 7 | **Abspielen** – am Schlag ablesen, überblenden | **fehlt** |

Alles bis 5 ist gegen einen **Prüf-Tänzer** gemessen: eine synthetische
BVH-Aufnahme, deren Sollwerte hineingeschrieben sind. Die Abnahme prüft nicht
„sieht plausibel aus", sondern gegen Zahlen, die ich selbst gesetzt habe.

## Der Kniff: Richtungen statt Stellungen

Gespeichert wird nicht, *wo* ein Gelenk war, sondern **in welche Richtung ein
Knochen zeigt**. Die Längen kommen aus der Zeichnung.

Damit *kann* ein Knochen gar nicht die falsche Länge bekommen – genau die
Verformung, die bisher wie ein Bruch aussah. Nachgewiesen mit zwei völlig
verschiedenen Körpermaßen: einmal die der Aufnahme, einmal absichtlich
unsinnige. Beide Male ein in sich stimmiges Skelett.

Und **drei** Zahlen je Knochen statt zwei, weil die dritte die Tiefe ist. Die
Länge im Bild ist die Wurzel aus x²+y² – ein Arm zur Kamera wird davon von
selbst kürzer, statt zu brechen. Gemessen bis **34,5 % Verkürzung**.

Was es kostet:

```
2816 Byte je Schleife  ·  22 kB für alle acht  ·  16 Proben je Schlag
Packverlust: 0,35 Grad  ·  Abtastverlust am schnellsten Punkt: 1,01 Grad
```

## Vier Fehler in meinem eigenen Prüfstand

Der Prüfstand war dreimal das Kaputte, nicht die Kette. Alle vier stehen als
Kommentar im Code:

1. Die Wurzel zählte ihre Höhe **doppelt** – OFFSET *und* Positionskanal.
2. Die Tipperkurve ging vor *und* nach dem Aufschlag nach unten; der Aufschlag
   war ein Hochpunkt dazwischen. Acht Tiefpunkte statt vier.
3. In der Pultstellung steht der Arm mit 62+48 Grad schon fast senkrecht, und
   tiefer als 90 Grad kommt keine Hand. Von zehn Zentimetern Tipper blieben
   gemessen 2,5.
4. Das Vorgreifen war an den Aufschlag gekoppelt – aber ein Arm, der nach vorn
   greift, **hebt** die Hand. Der Tipper zeigte nach oben.

## Der eine echte Fehler – und warum kein Tempotest ihn gefunden hätte

Die Tippererkennung fand hartnäckig den **Beginn des Ausholens** statt den
Aufschlag. 336 ms zu früh – bei völlig richtigem Tempo, weil beide Ereignisse
im selben Abstand wiederkehren.

Beides sind starke Beschleunigungen nach oben. Der Unterschied ist, was
*davor* war:

```
Ausholen:  die Hand steht, dann geht sie hoch.   davor v = 0
Aufschlag: die Hand fällt, dann steht sie.       davor v < 0
```

Die Erkennung multipliziert jetzt mit der Fallgeschwindigkeit davor. Damit
sitzt sie auf **4 ms** genau, auch verrauscht.

## Tempo aus der Musik, Phase aus den Tippern

Die Tipper liefern beides – aber nicht gleich gut. Die Phase ist der
Mittelwert von vier Messungen und sitzt auf Millisekunden. Das Tempo wäre ihre
*Steigung*, und die streute verrauscht um **drei BPM** – über acht Schläge ein
Fünftel Schlag Versatz.

Also: Die Schlagdauer steht in der Referenzmusik und ist bekannt. Was die
Tipper messen, ist eine **Kontrolle**, und sie wird nur benutzt, wenn sie um
mehr als fünf Prozent abweicht. Dann lief das Video wirklich falsch, und das
soll auffallen statt überbügelt zu werden. Gegengeprüft mit einer künstlich um
12 % zu schnell laufenden Datei – wird erkannt.

---

# Selbstkontrolle: wo ich mir noch nicht traue

Die Liste ist der eigentliche Zweck dieses Papiers.

### R1 · Die Gelenknamen von DeepMotion kenne ich nicht

Meine Zuordnung deckt Mixamo und zwei weitere Namensschulen ab. Trifft
DeepMotion keine davon, **scheitert der Import laut** (`Gelenke fehlen im
Skelett`) und nicht still. Das ist Absicht.

*Risiko: klein. Behebung: eine Zeile, sobald die erste Datei da ist.*

### R2 · Die Tipper könnten im Solve nicht ankommen

Zu zaghaft getippt, Hand kurz aus dem Bild, Fußverriegelung hat die Hüfte
festgehalten – dann gibt es keinen Aufschlag zu finden.

*Rückfall 1: über den Ton des Originalvideos. Deshalb frage ich ihn ab.*
*Rückfall 2: von Hand am Vorschau-MP4 ablesen, ein Zahlenwert im Aufruf.*

### R3 · Vorn oder hinten – das erkenne ich noch nicht sicher

Ob die Person zur Kamera schaut oder von ihr weg, leite ich aus der Lage der
Schultern ab. Das ist eine **Konvention des Lösers**, keine Naturkonstante.
Liegt sie andersherum, ist die ganze Figur gespiegelt: Was rechts passiert,
passiert links.

Ein Schalter dafür ist da. Automatisch prüfen ließe es sich am **Knie** – Knie
beugen sich vorwärts, und das gilt für jeden Menschen –, dafür müsste ich die
Beine mitlesen. Gebaut ist das nicht.

*Erkennbar: sofort, am ersten Standbild. Behebung: ein Schalter.*

### R4 · Die Proportionen der Zeichnung – das größte offene Stück

Ich nehme die Knochen*längen* aus der Zeichnung. Damit bleibt das Skelett in
sich stimmig – aber die **Hand landet nicht mehr da, wo sie in der Aufnahme
war.** Hat die gezeichnete Figur kürzere Arme als die aufgenommene Person,
greift sie ins Leere statt auf den Plattenteller.

Das ist der Punkt, an dem übliche Bewegungsübertragung eine Korrektur
einzieht: erst die Richtungen übernehmen, dann die Hände auf ihr Ziel
nachziehen. Gebaut ist das nicht, und ich weiß noch nicht, wie groß der Fehler
überhaupt wird – das hängt an Maßen, die ich erst mit der ersten echten Datei
kenne.

*Risiko: mittel. Messbar, sobald eine Datei da ist. Plan: Abstand
Hand-zu-Plattenteller messen; wenn er stört, eine begrenzte Nachziehung.*

### R5 · Der Zeichner kann noch keine Verkürzung

Die gezeichneten Arm- und Rumpfstücke sind starre Formen, die bisher nur
gedreht werden. Für die Tiefe müssen sie **entlang der Knochenachse gestaucht**
werden – Breite bleibt, Länge schrumpft. Rechnerisch einfach, aber ungebaut
und deshalb ungeprüft.

### R6 · Was passiert, wenn ein Arm über den Körper geht?

Zeigt die Richtung im Bild fast genau nach hinten, kippt die gezeichnete Form
um. Beim Schattenriss ist das teilweise harmlos – schwarz auf schwarz
verschmilzt, und *hinter* dem Körper sieht man einen Arm ohnehin nicht. Aber
„teilweise harmlos" ist keine Aussage, sondern eine Vermutung. Ungeprüft.

### R7 · Das Überblenden zwischen den Schleifen fehlt

Acht Schleifen nützen nichts, wenn der Übergang von Groove zu Drop springt.
Überblendet werden muss in **Richtungsraum**, nicht in Bildpunkten, und es muss
auf einer Schlaggrenze passieren. Ungebaut.

### R8 · Wie gut der Solve wirklich ist, weiß niemand

Alles oben ist an sauberen und an künstlich verrauschten Daten gemessen. Mein
Rauschen ist gleichverteilt und unkorreliert; echtes Löserzittern ist es
nicht. Ein Solve, der die Arme durch den Körper schickt, fällt durch keine
meiner Prüfungen – **den sieht man nur im Vorschau-MP4.**

*Deshalb steht in der Anleitung: erst ein Take, ansehen, dann die anderen
sieben.*

---

## Reihenfolge und Reißleine

1. **Ein Take** von DeepMotion → ich messe R1, R3, R4, R8 durch.
2. Zeichner auf Knochenrichtungen umbauen (R5, R6).
3. Abspielen und Überblenden (R7).
4. Die restlichen sieben Takes.

**Die Reißleine bleibt:** Wenn es bis Donnerstag Abend nicht überzeugend
aussieht, geht der Schatten-DJ aus und die Mandalas laufen allein. Der Knopf
dafür ist gebaut und abgenommen – *„Schatten-DJ"* unter *Bild*, oder Taste D.

## Was man selbst nachrechnen kann

```
npm run dj:bvhpruefen        24 Prüfungen: BVH lesen, Drehreihenfolge, Namen
npm run dj:bewegungpruefen   21 Prüfungen: Tipper, Raster, Schleife, Packen
npm run dj:prueftaenzer      erzeugt den Prüf-Tänzer neu
```
