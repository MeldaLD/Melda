# Herzbrille

Aus den Partyfotos ein Video schneiden: alle Gesichter so ausgerichtet, dass
die Brille immer an derselben Stelle sitzt, und dann hart auf den Beat
durchgeschnitten.

Zwei Adressen, dieselbe Seite:

| | |
|---|---|
| **Lokal**, mit laufendem Server | `http://localhost:3000/brille` |
| **Vercel**, ohne Server | `…/dj/brille/index.html` |

Die Fotos verlassen den Rechner in beiden Fällen nicht – die Seite lädt sie
nur im Browser, es gibt keinen Upload. Deshalb funktioniert sie auf Vercel
genauso gut wie lokal, obwohl dort kein Server mitrechnet.

> Damit das gilt, sind alle Pfade in dieser Seite **relativ**. Ein absolutes
> `/gemeinsam/brille.js` trifft auf Vercel ins Leere, weil die Datei dort
> unter `/dj/gemeinsam/` liegt – und der Fehler fällt beim Entwickeln nicht
> auf, weil der eigene Server genau die Adresse bedient, die im Code steht.
>
> Die Fotos in `brille/proben/` sind **doppelt** abgeschirmt, und das zweite
> Schloss ist das wichtigere:
>
> * `NICHT_AUSLIEFERN` in `werkzeuge/verteilen.mjs` hält sie von Vercel fern.
> * `.gitignore` hält die Gästefotos (`gast-*.jpg`) aus dem Repository.
>
> Der zweite Punkt kam später dazu, und er korrigiert einen Denkfehler im
> ersten: **Dieses Repository ist öffentlich.** „Wird nicht ausgeliefert“
> heißt dann eben nicht „steht nicht im Netz“ — ein Commit veröffentlicht die
> Datei genauso, nur an einer anderen Adresse, und aus der Git-Historie
> bekommt man sie nicht mehr heraus. Es sind erkennbare Gesichter von Gästen.
>
> Für die Abnahme heißt das: Die Gästefotos liegen nur lokal. Fehlen sie,
> überspringt `npm run brillepruefen` den Teil, statt rot zu werden.

---

> **Zur Größe:** Unter `public/brille/gesicht/` liegen MediaPipe-Laufzeit und
> BlazeFace-Modell, zusammen **9,6 MB**. Sie werden mit ausgeliefert und gehen
> damit auch nach Vercel. Warum das trotzdem der richtige Weg ist, steht unten
> unter *Der Anker*.

## Der Effekt

Die Technik heißt **face match cut**: Man richtet alle Portraits auf einen
gemeinsamen Punkt aus und schneidet schnell durch. Was dabei passiert, ist
mehr als eine Diashow — weil der Blick des Zuschauers *stehenbleibt*, während
die Menschen wechseln, lesen sich dreißig Einzelbilder als eine einzige
Bewegung. Der übliche Anker sind die Augen.

## Der Anker: erst das Gesicht, dann die Brille

Diese Überschrift hieß einmal *"Warum hier die Brille der bessere Anker ist"*,
und darunter stand ein Argument, das gut klang: Der Normalweg braucht ein
Gesichtsmodell von einigen Megabyte; auf jedem dieser Fotos sitzt aber
dieselbe Brille — zwei kräftig rote Herzen in einer Welt aus Haut, Himmel und
Hemd. Eine gebaute Passmarke, billiger *und* zuverlässiger. Augen sind mal zu,
mal verdeckt, mal im Schatten; die Brille ist immer da und immer rot.

Das Argument hatte einen Fehler, und er stand nicht im Code, sondern auf der
Party: **Viele Gäste hatten einen roten Folienwedel in der Hand** — ein Herz
aus Metallpapier mit Fransen. Der ist *kräftiger* rot als die getönten
Scheiben, weil er das Licht spiegelt, statt es zu filtern. Die Annahme "das
Roteste im Bild ist die Brille" gilt damit nicht mehr.

Gemessen an vier echten Partyfotos griff die Suche in dreien daneben; im
vierten verschmolzen Brille und Wedel zu einem Klumpen. Trefferqualität:
0,35 / 0,00 / 0,00 / 0,00.

### Die Sackgasse davor

Naheliegend war ein Zusatzmerkmal ohne neues Werkzeug: Die Brille sitzt auf
Haut, der Wedel nicht — also den Anteil hautfarbener Punkte in einem Ring um
jeden roten Fleck messen. Gemessen trennt das nicht:

| Foto | Wedel | Brille |
|---|---|---|
| ohne Wedel | – | 0,05 |
| f9faf208 | 0,28 | **0,44** |
| 664ebfb3 | 0,11 | 0,11 |

Ausgerechnet der eine zweifelsfrei richtige Fund bekam den niedrigsten Wert
von allen — der Ring liegt bei einem großen Fleck schon im Himmel. Damit war
die Idee erledigt, und zwar **bevor sie gebaut war**.

### Also doch ein Gesichtsmodell

Der Browser bringt keins mit — `FaceDetector` gibt es nur auf Android. Also
liegt MediaPipe BlazeFace lokal unter `public/brille/gesicht/`: Laufzeit und
Modell zusammen **9,6 MB**. Das ist viel für eine Seite und trotzdem richtig —
die Alternative wäre, dreißig Fotos von Hand nachzuziehen. Lokal und nicht über
ein CDN, weil die Seite ohne Netz laufen soll.

Gefunden wird das Gesicht auf allen fünf Probefotos, mit 0,83 bis 0,95
Sicherheit und rund 300 ms je Bild. Fehlfunde auf Händen liegen bei 0,42 und
0,51 und fallen bei der Auswahl heraus (bewertet wird Sicherheit × Fläche ×
Mittigkeit — gemeint ist immer der Mensch, der fotografiert wurde).

### Und dann kehrte sich die Reihenfolge um

Der Plan war: Die Brille richtet aus, das Gesicht ist nur die Rückfallebene.
Auch das hat die Messung überstimmt. Selbst *im* Gesichtskasten findet die
Brillensuche nur auf einem einzigen Foto etwas, dem man die Ausrichtung
anvertrauen möchte:

| Foto | Δ Winkel | Versatz | Skala | Güte |
|---|---|---|---|---|
| beispiel | 1,7° | 0,07 | 2,49 | 0,92 |
| 64d071b9 | −18,2° | 0,35 | 2,70 | 0,63 |
| f9faf208 | −83,6° | 1,52 | 1,02 | 0 |
| 664ebfb3 | *die Brillensuche findet 3 Bildpunkte* | | | |
| 31153039 | 3,7° | 0,17 | 2,50 | 0,70 |

*Versatz* ist der Abstand zwischen Brillenmitte und Augenmitte, gemessen in
Augenabständen. Bei 64d071b9 liegt die gefundene Mitte **ein Drittel eines
Augenabstands** daneben und der Winkel achtzehn Grad — und die Güte meldet
trotzdem 0,63. Die Güte kann das auch gar nicht wissen: Sie beurteilt Größe,
Form und Waagerechte des Flecks, aber nicht, ob der Fleck an der richtigen
Stelle sitzt. **Das Gesicht weiß es.**

Damit steht die Reihenfolge:

> Die **Augen** legen die Ausrichtung fest — sie sind auf allen fünf Fotos da.
> Die **Brille** darf sie nachbessern — aber nur, wenn sie den Augen zustimmt.

Zustimmen heißt: höchstens 10° Winkelunterschied, höchstens 0,2 Augenabstände
Versatz, und eine Länge zwischen dem 2,1- und 3,1-fachen des Augenabstands.
Alle drei müssen halten. Einzeln lässt sich jede Bedingung austricksen — ein
Wedel neben dem Kopf hat durchaus den richtigen Winkel, ein einzelnes Glas
durchaus die richtige Mitte. Zusammen nicht mehr.

Stimmt die Brille zu, gewinnt sie: Sie sitzt auf der Glasmitte statt auf der
Pupille und ist damit das genauere Maß für genau die Stelle, die im Video
stillstehen soll. Der Umrechnungsfaktor Augenabstand → Brillenlänge ist
**2,56**, gemittelt aus den drei Fotos mit zusammenhängendem Fund
(2,49 / 2,70 / 2,50); die beiden Fehlfunde liegen bei 1,02, weit genug weg,
dass sich daran gleich mitprüfen lässt, ob ein Fund taugt.

### Zwei Nebenbefunde beim Einschränken der Suche

Sobald die Brillensuche nur noch im Gesichtskasten läuft, stimmen zwei Werte
nicht mehr, die vorher richtig waren:

* **Der Schließradius** hing an der *Bildbreite* — 12 Punkte bei 640. In einem
  213 Punkte breiten Gesichtskasten verschmilzt das, was getrennt gehört:
  Radius 4 → 5500 Punkte Brille mit getrennten Haaren daneben, Radius 8 →
  5790, Radius 12 → 10217, also Brille und Haare als ein Klumpen. Der Radius
  bezieht sich jetzt auf den Suchbereich.
* **Der Suchbereich** war fast die volle Gesichtshöhe und reichte bis über den
  Mund. Auf einem Foto lacht jemand mit geschminkten Lippen — Lippen und
  Brille wurden ein Fleck, und der ist rund statt langgezogen. Die Güte fällt
  damit auf null, obwohl die Brille sauber gefunden war. Der Bereich endet
  jetzt bei zwei Dritteln der Gesichtshöhe.

Beide zusammen holten zwei Fotos zurück: 0,35 → 0,63 und 0,00 → 0,70.

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
zeigt die Galerie drei Zustände statt zwei: grün (ausgerichtet), **gelb (kein
Gesicht gefunden, hier hat nur die Brillensuche gearbeitet)**, rot (gar nichts
gefunden). Bei Gelb und Rot klickt man das Bild an und setzt die beiden
Linsenmitten von Hand.

### Nachgemessen an den echten Partyfotos

Die Zahlen oben stammen aus künstlich verzerrten Fassungen *eines* Fotos. Die
härtere Prüfung sind die fünf echten — vier davon mit Wedel. Gemessen wird
hier, **wo das Rot im fertig ausgerichteten Bild landet**; für die drei über
die Augen ausgerichteten ist das unabhängig von dem, was sie platziert hat.
Ziel ist x = 0,50 und y = 0,42:

| Foto | Quelle | x | y |
|---|---|---|---|
| beispiel | Brille | 0,500 | 0,419 |
| 64d071b9 | Augen | 0,524 | 0,412 |
| f9faf208 | Augen | (0,298) | 0,424 |
| 664ebfb3 | Augen | *3 rote Punkte im ganzen Foto* | |
| 31153039 | Brille | 0,458 | 0,435 |

Die Höhe stimmt auf allen fünf. Die beiden Klammerwerte sind **keine
Ausrichtungsfehler, sondern Messfehler**: Bei f9faf208 hält jemand den Wedel
auf Augenhöhe direkt neben den Kopf, er liegt also im gemessenen Band und
zieht den Schwerpunkt nach links; bei 664ebfb3 erkennt die Rotmaske die
Gläser überhaupt nicht als rot (sie sind heller und rosiger als die Schwellen
erlauben) — genau der Fall, für den der Augenanker da ist.

Der erste Anlauf dieser Messung nahm das *ganze* Bild statt eines Bandes um
die Zielstelle und meldete Höhen von 0,84. Das war der Wedel am unteren
Bildrand. Ein Prüfwert, der das Störobjekt mitzählt, gegen das man gerade
gebaut hat, misst nicht die Ausrichtung.

Die belastbarste Prüfung ist am Ende die einfachste: alle fünf ausgerichtet
übereinanderlegen. Liegen sie richtig, ergeben die Gläser **ein scharfes rotes
Band** statt eines Schleiers. Sie tun es.

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
