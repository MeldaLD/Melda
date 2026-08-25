# Herzbrille

Aus den Partyfotos ein Video schneiden: alle Gesichter so ausgerichtet, dass
die Brille immer an derselben Stelle sitzt, und dann hart auf den Beat
durchgeschnitten.

Aufrufen unter `http://localhost:3000/brille` – die Fotos verlassen den
Rechner nicht, alles läuft im Browser.

---

## Der Effekt

Die Technik heißt **face match cut**: Man richtet alle Portraits auf einen
gemeinsamen Punkt aus und schneidet schnell durch. Was dabei passiert, ist
mehr als eine Diashow — weil der Blick des Zuschauers *stehenbleibt*, während
die Menschen wechseln, lesen sich dreißig Einzelbilder als eine einzige
Bewegung. Der übliche Anker sind die Augen.

## Warum hier die Brille der bessere Anker ist

Der Normalweg braucht ein Gesichtsmodell — ein neuronales Netz von einigen
Megabyte, das Landmarken findet. Hier gibt es eine Abkürzung, und sie ist
nicht nur billiger, sondern **zuverlässiger**: Auf jedem dieser Fotos sitzt
dieselbe Brille. Zwei kräftig rote Herzen in einer Welt aus Haut, Himmel und
Hemd.

Das ist eine gebaute Passmarke, und sie liefert genau die drei Größen, die
eine Ähnlichkeitsabbildung braucht:

| aus der Brille | ergibt |
|---|---|
| Mittelpunkt | Verschiebung |
| Achsenrichtung | Drehung |
| Länge | Größe |

Augen sind mal zu, mal verdeckt, mal im Schatten. Die Brille ist immer da und
immer rot.

## Wie die Brille gefunden wird

Der Weg dahin ging über zwei Sackgassen, und beide sind lehrreich.

**Erster Versuch — absoluter Kanalabstand** („rot muss 60 über grün liegen").
Das Ergebnis war die perfekte Umkehrung: markiert wurden Stirn, Wangen und
Mund, ausgelassen wurden die Linsen. In einer dunklen getönten Scheibe ist
*jeder* absolute Abstand klein, während sonnenbeschienene Haut ihn mühelos
erreicht.

**Zweiter Versuch — Schwelle am Bild statt an einer Erinnerung**, also die
rötesten drei Prozent aller Bildpunkte. Klang robust, war es nicht. Gemessen
überlappen sich die Bereiche nämlich:

```
             Rötung (r minus stärkster anderer Kanal)
Linse        34 (dunkle Stelle) … 118 (helle Stelle)
Haut         71 … 82
```

Eine dunkle Linsenstelle ist **weniger** rot-dominant als helle Haut. Nach
Rötung allein lässt sich das nicht trennen, mit keiner Schwelle.

**Was trennt, ist die Sättigung**, und zwar mit weitem Abstand:

```
Linse        0,80 … 1,00
Haut         0,11 … 0,54
```

Dazwischen liegt eine Lücke von 0,26. Die Schwelle in ihre Mitte zu legen war
die einzige Entscheidung, die überhaupt zu treffen war. Der Grund ist Physik:
Ein roter Filter lässt ein schmales Band durch und schluckt den Rest — das
*ist* hohe Sättigung. Haut streut breit und bleibt blass.

Dazu kommt ein **Schließen** der Maske (aufdicken, wieder abtragen), bevor
zusammenhängende Flecken gesucht werden. Die beiden Herzen hängen nur an der
Nasenbrücke zusammen, und die ist dünn. Reißt sie, findet der Sucher *eine*
Linse — und dann halbiert sich die geschätzte Größe und die Hauptachse eines
einzelnen, fast runden Herzens zeigt irgendwohin. Gemessen: Größe 0,48 statt
1,0 und Winkelfehler bis 90 Grad.

## Was die Ausrichtung leistet

Geprüft an dreißig künstlich verzerrten Fassungen des Beispielfotos —
±18 Grad Drehung, Größe 0,55 bis 1,3, Verschiebung, Helligkeit 0,6 bis 1,4:

```
gefunden                    30 von 30
Fehler der Brillenmitte      4,4 % der Brillenbreite im Mittel
                            30,9 % im schlechtesten Fall
```

Der Mittelwert ist gut, **der Ausreißer ist das Problem** — ein Kopf, der
verrutscht, während alle anderen stehen, fällt im Video sofort auf. Deshalb
zeigt die Galerie drei Zustände statt zwei: grün (sicher), **gelb (gefunden,
aber unsicher — bitte ansehen)**, rot (nicht gefunden). Bei Gelb und Rot
klickt man das Bild an und setzt die beiden Linsenmitten von Hand.

> Eine Warnung aus dem Bau dieser Zahlen: Die erste Prüfung hat das
> ausgerichtete Bild *noch einmal* durch denselben Sucher geschickt und dort
> brav 0,42 gemessen — bei Bildern, die sichtbar falsch waren. Derselbe
> Fehler zweimal hintereinander sieht aus wie kein Fehler. Erst der Vergleich
> gegen die *bekannte* Transformation hat es gezeigt.

## Reihenfolge

Bewusst ein Textfeld und keine Zieh-und-Ablege-Oberfläche. Eine Liste aus
dreißig Zeilen sortiert man in jedem Texteditor in Sekunden um: Zeile
ausschneiden, woanders einfügen. Was das Textfeld zusätzlich kann: eine Zeile
mit `#` auskommentieren — damit fliegt ein Bild raus, ohne verloren zu gehen.

Dazu vier Sortierungen auf Knopfdruck. Die interessanteste ist **nach
Kopfneigung**: Läuft die Neigung durch, kippt der Kopf über das ganze Video
langsam durch — eine Bewegung, die kein Einzelbild hat.

## Die Regler

| Regler | Was er tut |
|---|---|
| **Tempo + Bilder je Schlag** | Wie oft geschnitten wird. 2 je Schlag bei 128 BPM ist der klassische schnelle Schnitt |
| **Überblendung** | 0 = harter Schnitt (punchiger), höher = weiche Blende |
| **Langsamer Zoom** | Fährt über das *ganze* Video hinein, nicht je Bild — sonst zuckt es dreißigmal zurück |
| **Helligkeit angleichen** | Nimmt das Flackern zwischen dreißig verschiedenen Handykameras |
| **Leichter Versatz** | Ein winziges Zittern je Bild, damit es nicht steril wirkt |

## Aufnahme

Das Video entsteht in Echtzeit über `MediaRecorder` und kommt als WebM
heraus. Musik legst du hinterher selbst darunter.

Der elegantere Weg wäre gewesen, Bild für Bild zu rechnen und einzeln
anzumelden — unabhängig von der Rechnergeschwindigkeit und mit exakt gleichen
Abständen. Herausgekommen ist dabei eine Datei mit **110 Byte**: ein Kopf
ohne ein einziges Bild. Echtzeit kann das nicht passieren, und bei ein paar
Sekunden Video mit Standbildern fällt der Nachteil nicht ins Gewicht.
