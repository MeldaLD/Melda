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

## Millimeter: die Feinausrichtung

Rückmeldung nach dem ersten Durchlauf: *„Die Brille muss noch exakter
aufeinander sitzen."* Zu Recht. Der Anker saß bis dahin auf drei von fünf
Fotos auf den **Augenlandmarken**, und die sind für diesen Zweck grob —
BlazeFace rechnet intern auf 128 × 128 Bildpunkten. Im Kontrollbild sieht man
es direkt: Die Augenpunkte liegen sichtbar **neben** den Glasmitten.

Der Weg dahin ging über drei Messungen, und jede hat etwas anderes gefunden,
als ich erwartet hatte.

### 1. Die Schwelle war das falsche Maß

Die Rotmaske prüfte Sättigung ≥ 0,67 und Grün/Rot ≤ 0,45. Beide Werte sind an
*einem* Foto abgelesen, auf dem die Scheiben kräftig ausgeleuchtet sind.
Nachgemessen an allen fünf:

| | Glas | Haut |
|---|---|---|
| Sättigung ≥ 0,67 | **0,00** im schlechtesten Fall | bis 0,24 |
| B ≥ G (Magentaseite) | 0,97 | bis 0,20 |

Die alte Regel hat eine **negative** Lücke: Auf zwei Fotos findet sie keinen
einzigen Glaspunkt und markiert gleichzeitig ein Viertel der Haut. Der
Farbwinkel dagegen ist auf allen fünf praktisch derselbe (332–353°), während
Sättigung von 0,39 bis 1,00 schwankt. Gemessen wurde also ausgerechnet das,
was sich ändert.

### 2. …und er war falsch normiert

Der nächste Versuch war der Punktwert `r + b − 2g` mit einer Schwelle nach
Otsu. Das Ergebnis markierte das ganze Gesicht. Der Grund: Der Wert **wächst
mit der Helligkeit**, also schlägt helle Haut ein dunkles Glas. Durch `r`
geteilt ist er helligkeitsunabhängig — Haut liegt dann bei ≈ 0,15, ein Glas
bei ≈ 0,95 — und Otsu findet je Foto genau die Schwelle, die man von Hand
gewählt hätte: 0,42 / 0,45 / 0,55 / 0,62 / 0,66. Ein fester Wert kann das
nicht: 0,55 frisst die dunklen Gläser weg, 0,40 markiert zu viel.

### 3. Der Wedel war manchmal *im* Gesicht

Auf zwei Fotos hält jemand ihn direkt neben den Kopf. Er verschmilzt dann mit
einem Glas zu einem Fleck, und die gefundene Brille wird zu breit und schief.

Alle drei löst derselbe Gedanke: **Ein Brillenglas sitzt um ein Auge herum.**
Gesucht wird deshalb nicht mehr in einem Rechteck, sondern in **zwei
Kreisscheiben** um die Augenlandmarken (Radius 0,9 Augenabstände). Darin
bestimmt Otsu die Schwelle, und der Wedel liegt schlicht draußen. Zwei
Mittelpunkte, von den Augen aus gestartet, finden dann die beiden Glasmitten.

Die Augen machen damit genau das, was sie können — grob zeigen, wo zu suchen
ist — und genau das nicht, was sie nicht können: die Stelle bestimmen.

### Was es gebracht hat

Gemessen wird, ohne den Sucher sich selbst prüfen zu lassen: In jedem
Quellbild wird die Gläsermaske bestimmt, jede Maske durch *ihre* Ausrichtung
geschickt und die ausgerichteten Masken paarweise verglichen
(Schnitt ÷ Vereinigung).

| | über die Augen | über die Gläser |
|---|---|---|
| mittlere Deckung | 0,474 | **0,760** |
| schlechtestes Paar | 0,239 | **0,661** |
| Saum im Stapel | 84,4 % | **46,4 %** |

Im gestapelten Bild ist der Unterschied ohne Zahlen zu sehen: links ein roter
Schleier, rechts scharfe Herzkonturen.

Eins ist nicht erreichbar, und das ist kein Mangel: Die Köpfe sind
unterschiedlich gedreht, und eine Ähnlichkeitsabbildung — verschieben, drehen,
skalieren — kann eine perspektivisch andere Ansicht nicht zurechtbiegen. Sie
soll es auch nicht; ein verzerrtes Gesicht sieht sofort falsch aus.

Nebenbei ist die Suche **vier- bis fünfmal schneller** geworden (13–22 ms statt
55–70 ms je Foto): Zwei Kreisscheiben sind erheblich weniger Fläche als ein
Gesichtskasten mit Flutfüllung darin.

## Reihenfolge

Bewusst ein Textfeld und keine Zieh-und-Ablege-Oberfläche. Eine Liste aus
dreißig Zeilen sortiert man in jedem Texteditor in Sekunden um: Zeile
ausschneiden, woanders einfügen. Was das Textfeld zusätzlich kann: eine Zeile
mit `#` auskommentieren — damit fliegt ein Bild raus, ohne verloren zu gehen.

Dazu vier Sortierungen auf Knopfdruck. Die interessanteste ist **nach
Kopfneigung**: Läuft die Neigung durch, kippt der Kopf über das ganze Video
langsam durch — eine Bewegung, die kein Einzelbild hat.

## Musik

Die Musik wird hochgeladen wie die Bilder, und sie tut zwei Dinge: Sie legt
fest, **wann geschnitten wird**, und sie landet **gleich mit im Video**.

Die Analyse dafür liegt schon im Projekt — `analysiere()` misst Tempo, Raster,
Phrasengrenzen und Marken, `beatZeit()` gibt die Sekunde jedes einzelnen
Schlags. Sie ist für den DJ gebaut und wird hier unverändert benutzt: Der
Schnitt eines Bildes und der Einsatz eines Übergangs sind dasselbe Problem.

### Warum nicht einfach die BPM-Zahl übernehmen

Weil eine feste Zahl über die Länge auseinanderläuft. Ist ein Stück in
Wahrheit 123,6 statt 124 BPM, sind das nach dreißig Sekunden schon ein Sechstel
Schlag — und die Bildwechsel sitzen sichtbar neben der Musik. `beatZeit()`
rechnet stattdessen **jeden Schlag einzeln** aus der gemessenen Tempokarte und
trifft auch den letzten noch. Die Abnahme prüft genau das, mit 5 ms Toleranz
über die ganze Länge.

### Was eingestellt wird

* **Start** — die erste Phrase, oder eine der Marken aus der Analyse (Drop,
  Breakdown, Wechsel). Auf einem Drop anzufangen ist der billigste Weg zu
  einem Video, das nicht mit einem Intro beginnt.
* **Schläge je Bild** — vorgeschlagen wird die Unterteilung, deren Videolänge
  der Musik am nächsten kommt. Bei 45 Bildern und 128 BPM sind das zwei
  Schläge: 45 × 0,94 s = 42 s. Ein Schlag je Bild wäre 21 s, halb so lang.
* **Ton ins Video** — Bild und Ton gehen in denselben Strom, der Rekorder
  schneidet beides in *eine* Datei. Der Gleichlauf muss nicht nachträglich
  hergestellt werden, er entsteht beim Mitschnitt.

Ist die Musik länger als die Bilder — der Normalfall, und so soll es sein —,
wird sie über die letzten anderthalb Sekunden ausgeblendet. Reicht sie nicht,
werden Bilder weggelassen statt in die Stille weiterzulaufen; die Seite sagt
dann, wie viele.

Sobald Musik vermessen ist, sind die Regler *Tempo* und *Bilder je Schlag* von
Hand stillgelegt. Sie werden nicht mehr gelesen — sie bedienbar zu lassen wäre
die unangenehmste Sorte Fehler: Man dreht daran, und nichts passiert.

### Gezeichnet wird nach der Tonuhr

Nicht nach `performance.now()`. Zeichnet man nach der Systemuhr und spielt den
Ton daneben ab, laufen beide auseinander — der Bildschirm lässt ein Bild aus,
der Ton nicht. `AudioContext.currentTime` ist dieselbe Uhr, nach der der Ton
läuft; wer danach zeichnet, kann nicht wegdriften.

### Ein Fehler, den erst die Abnahme gefunden hat

Die erste Fassung hat zwei Fragen in einem Zug entschieden: *Ist das Raster
sicher?* und *Kommt der Ton mit?* Bei einer Klickspur, deren Tempo auf ein
Zehntel genau erkannt wird, deren Vertrauen aber unter der Schwelle bleibt,
kam die Datei **ohne Ton** heraus — und nirgends stand etwas dazu. Es sind
zwei Fragen: Woher die Schnittzeiten kommen, und ob Musik da ist. Die zweite
hängt nur an der zweiten. Beide Fälle stehen jetzt in `npm run musikpruefen`.

### Auf dem iPhone

Zwei Dinge, die Safari anders macht und die beide erst am Gerät auffielen:

* **Die Musikauswahl hatte `accept="audio/*"`.** Damit bietet iOS Safari nur
  die *Fotoauswahl* an — man kommt gar nicht an die eigene Musik heran. Das
  Feld hat jetzt keine Einschränkung mehr; dann erscheint „Datei auswählen"
  und damit die Dateien-App. Der Preis ist eine ungefilterte Liste am
  Rechner, und das ist der bessere Tausch als eine Auswahl, in der das
  Gesuchte nicht vorkommt. Wer eine ungeeignete Datei erwischt, bekommt jetzt
  einen brauchbaren Satz statt „Unable to decode audio data".
  (Titel aus Apple Music sind kopiergeschützt und lassen sich nicht lesen —
  die Datei muss in der Dateien-App liegen.)
* **Safari kann kein WebM aufnehmen**, weder auf dem Mac noch auf dem iPhone.
  Mit einer reinen WebM-Liste wäre der ganze Ablauf auf der letzten Stufe
  gescheitert — nachdem die Bilder ausgerichtet und die Musik vermessen sind.
  Dahinter steht jetzt MP4, und die Dateiendung richtet sich nach dem, was
  wirklich aufgenommen wurde; auf dem Telefon hängt am Namen, welche App die
  Datei bekommt.

Für Safari gibt es hier keine Testumgebung. Nachgestellt wird deshalb die
Eigenschaft, an der es hängt: `MediaRecorder.isTypeSupported` lehnt im dritten
Prüffall jedes WebM ab. Eine Zusage für ein Gerät, das nie geprüft wird, ist
keine.

### Wie genau der Schnitt in der Datei sitzt

Der Schnittplan ist auf die Millisekunde genau. Die *Datei* ist es nicht ganz,
und das liegt nicht am Plan: Ein Schnitt kann nur auf einer Bildgrenze liegen.
Von Hand nachgemessen (ffmpeg, Bildunterschiede gegen die Anschläge im Ton
derselben Datei) lagen die Schnitte 18 bis 55 ms neben dem Schlag — bei einem
Bildabstand von 88 ms in dieser Umgebung, also **innerhalb eines Bildes**. Auf
einem Rechner mit Grafikkarte sind es 33 ms.

> Zwei Messfehler auf dem Weg dahin, beide meine. Der erste Versuch hat die
> Bilder mit `-r 60` neu abgetastet — damit erfindet ffmpeg Zwischenbilder und
> verschiebt die Zeitstempel; die „Abweichung" war meine eigene Umrechnung.
> Der zweite lief mit eingeschaltetem langsamen Zoom: Dann ändert sich *jedes*
> Bild ein wenig, und ein Verfahren, das Schnitte an Bildunterschieden
> erkennt, findet die falschen Stellen. Es meldete 225 ms, wo 55 ms waren.

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
