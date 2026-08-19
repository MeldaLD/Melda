# Die Bühnenshow

Der Lichtpark hat Lampen an die Wand gestellt. Dieser Modus macht daraus eine
Show — also nicht mehr Licht, sondern eine Entscheidung darüber, *was wann
läuft*.

Der Unterschied ist der ganze Punkt. Ein Rig aus zwanzig Geräten, das
gleichzeitig alles kann, sieht nach zwei Minuten aus wie ein Rig aus zwanzig
Geräten. Was einen Abend trägt, ist die Dosierung.

---

## Was hinter einer Bühne wirklich steht

Die Recherche zu professionellen Shows ergibt eine überschaubare Liste, und
sie ordnet sich in Ebenen — nicht in Gerätetypen. Ein Lichtdesigner denkt in
„was macht dieser Layer für das Bild", nicht in „welche Lampe ist das".

| Ebene | Gerät | Aufgabe | Hier als |
|---|---|---|---|
| Grundlicht | Wash, Uplighter | Farbe, Fläche, Stimmung | `Partylicht` — Kegel in den Pfeilern |
| Luft | Beams, Moving Heads | Strahlen, die man *in der Luft* sieht | `Beams` — Fächer von oben |
| Akzentreihen | Sunstrips, Pinspots | Lauflichter auf Kanten | Punktreihen auf Sims und Sockel |
| Publikum | Blinder | Der Schlag ins Gesicht | `Blinder` — warme Balken oben |
| Zuckung | Strobe | Aufbau, Drop | `Blitze` — elf kleine Lampen |
| Textur | Spiegelkugel | Ruhe, die trotzdem lebt | `Kugel` — 96 wandernde Punkte |
| Pyro / SFX | Flamme, CO₂, Funken | Das teure Einzelereignis | `Flammen`, `Nebelstoss`, `Funken` |

Alle liegen in `public/gemeinsam/gewerke.js` und können jedes für sich etwas.
Keines von ihnen entscheidet, wann es dran ist.

## Die Regie

Das tut `public/gemeinsam/buehnenshow.js`, auf drei Ebenen von langsam nach
schnell:

- **Bild** — welche Gewerke überhaupt laufen dürfen. Sechs Stück (Wash, Beams,
  Kugel, Kette, Halbdunkel, Vollgas), Wechsel frühestens nach zwei Phrasen und
  nur an einer Phrasengrenze.
- **Lage** — was die Musik gerade tut: Ruhe, Groove, Aufbau, Drop, Höhepunkt.
  Kommt aus der Analyse und überstimmt das Bild.
- **Akzent** — Einzelereignisse mit Sperrzeit. Flamme 95 s, CO₂ 55 s, Funken
  40 s, Blinder 12 s.

Drei Regeln, die als Zusage gemeint sind und in der Abnahme nachgemessen
werden:

1. **Nie mehr als zwei laute Gewerke gleichzeitig.** Drei sieht man als eines,
   und danach ist die Show verbraucht.
2. **Die Spiegelkugel bekommt die Wand für sich.** Nicht aus Geschmack: Eine
   Spiegelkugel *ist* nichts als ein Feld wandernder Punkte. Läuft ein Wash
   daneben, bleibt eine leicht fleckige Wand übrig.
3. **Die Bilder werden rotiert, nicht gewürfelt.** Jedes kommt dran, bevor
   eines zum zweiten Mal kommt. Würfeln fühlt sich kurzfristig
   abwechslungsreicher an und wiederholt sich nach dem Gesetz der kleinen
   Zahlen viel zu oft — bei fünf Stundenmixen merkt man das.

## Das Loch vor dem Drop

Das Wirksamste an einer Lichtshow kostet nichts und ist das Gegenteil von
Licht: die Sekunde Dunkelheit unmittelbar vor dem Einschlag. Ein Aufbau, der
immer heller wird und dann *ausgeht*, macht den Drop doppelt so groß.

Gemessen: die Leinwand fällt im Loch auf 0,0008 mittlere Leuchtdichte, gegen
0,028 im Aufbau — und der Drop danach steht bei 0,068, also rund achtzigmal
so hell wie das Loch davor.

Es ist der einzige Effekt der ganzen Show, der aus Nichtstun besteht.

---

## Sicherheit

Die Show ist der erste Modus, der ausdrücklich hell sein darf, deshalb steht
die Blitzschwelle hier schärfer im Weg als sonst. Maßstab ist wie in
[FARBWIRKUNG.md](./FARBWIRKUNG.md) die allgemeine Blitzschwelle: höchstens
drei Blitze je Sekunde, wobei ein Blitz ein Paar gegenläufiger Änderungen der
relativen Leuchtdichte um mindestens 0,10 ist, **auf mindestens einem Viertel
der Bildfläche**.

Auf dieser Viertel-Klausel beruht die Entscheidung, hier überhaupt Blitze
zuzulassen: Sie sitzen an einzelnen kleinen Lampen, nicht an der Wand. Im
schlimmsten Muster betreffen sie **0,7 %** der Fläche — Faktor 35 unter der
Grenze. Das ist keine Auslegung, sondern der Wortlaut.

Gemessen im schlimmsten Fall (Dauer-Aufbau, Drops alle 200 Bilder):

```
hellstes Bild            0,068   (Grenze 0,10)
größter Bildsprung       18,6 %  (Grenze 25 %)
Blitze je Sekunde        0,0     (Grenze 3)
Blitze allein, Fläche     0,7 %  (Grenze 25 %)
```

Eine Zahl davon hat lange anders ausgesehen, und wie sie gefunden wurde, ist
den Absatz wert: Das hellste Bild lag bei **0,128** und riss die Grenze. Der
Verdacht fiel zuerst auf den Blinder, dann auf das Grundlicht — beides
gemessen, beides harmlos, der Lichtpark allein kommt auf 0,017. Sichtbar
wurde die Ursache erst, als der Blinder gedeckelt wurde und das hellste Bild
*trotzdem* stehen blieb: Der Lichtpark bringt einen **eigenen** Blinder mit
und feuerte ihn auf denselben Drop. Zwei Gewerke, die einzeln jede Grenze
halten und zusammen keine. Seit der Park seinen abgibt (`blinderAus`), liegt
das hellste Bild bei 0,068 — ganz ohne Deckel.

## Was am Aufbauort noch passiert

Die Show ist von Anfang an auf die vermessene Wand gebaut, nicht auf eine
leere Fläche. Sobald `messung.json` aus `/kalibrieren` vorliegt, richtet sie
sich danach aus:

- **Uplighter und Flammen stehen in den Pfeilern**, also in den Lücken
  zwischen den Fenstern — nicht vor den Scheiben. Vor einer Scheibe wäre eine
  Flamme auch in Wirklichkeit keine gute Idee.
- **Die Punktreihen laufen auf den echten Kanten**, Sims und Sockel.
- **Die Beams fächern über die Fassade**, nicht über ein Rechteck.

Ohne Messung fällt alles auf gleichmäßige Abstände zurück und sieht immer
noch aus wie eine Show — nur eben nicht wie *diese* Wand.

Eine Stellschraube gibt es für vor Ort: `deckel` am `Blinder` in
`gewerke.js`. Er steht auf 1 und wird nach der Messung nicht gebraucht. Aber
gemessen wird auf einer gerechneten Leinwand; wie hell eine echte Wand wird,
hängt am Beamer, am Abstand und daran, wie dunkel der Hof ist. Fällt beim
Aufbau auf, dass es blendet, ist das die eine Zahl, an der man dreht, ohne
sonst etwas anzufassen.

## Abnahme

```
npm run dj:showpruefen
```

Sie misst, was oben als Zusage steht: Zurückhaltung, Rotation über zehn
Minuten, die Alleinstellung der Kugel, die Sperrzeiten unter einem Drop in
jedem dreißigsten Bild, das Loch vor dem Drop, die vier Sicherheitszahlen und
die Rechenzeit gegen den Lichtpark, den die Show enthält.

Die Regie läuft dabei mit fester Saat. Der erste Versuch, den Blinder zu
deckeln, ergab bei kleinerer Blende ein *helleres* Bild als bei größerer —
die Ursache war nicht der Blinder, sondern eine andere Bilderfolge in jedem
Lauf. Auf der Party würfelt sie weiter.
