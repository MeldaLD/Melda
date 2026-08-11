# Remixen: was recherchiert wurde und was davon gebaut ist

Recherche am 11.08.2026. Zwei getrennte Fragen: *Was macht ein guter Live-Remix
aus?* und *Wie findet man den Höhepunkt eines Songs automatisch?*

## Teil 1 — Was ein DJ beim Remixen tut

Aus der DJ-Praxis (Quellen unten) kristallisieren sich fünf Handgriffe heraus.
Sie sind alle **rhythmische Umbauten**, keine klanglichen Effekte — genau
deshalb passen sie zu dem, was wir schon haben: ein Beatraster auf zwei
Millisekunden genau.

### Die eiserne Regel

> Loop-Längen bleiben musikalisch: 4, 8, 16 oder 32 Beats. Sonst hört das
> Publikum die Naht.

Das ist dieselbe Regel wie bei den Übergängen — nur eine Ebene tiefer. Ein
Schnitt mitten in der Phrase klingt falsch, auch wenn er auf dem Beat sitzt.

### Der Loop-Roll

Die wichtigste Technik und der größte Effekt fürs Geld: Eine Schleife wird
**fortlaufend halbiert**, kurz bevor der Drop kommt. 4 Beats, dann 2, dann 1,
dann ein halber. Das zieht die Spannung an wie eine Feder, und wenn der Drop
dann kommt, trifft er härter.

Der Trick funktioniert, weil das Ohr die Wiederholung erkennt und die
Beschleunigung als Steigerung liest — obwohl gar nichts lauter wird.

### Die übrigen vier

| Handgriff | Wozu |
| --- | --- |
| **Outro verlängern** | 16 oder 32 Beats loopen, um eine lange Blende zu tragen, statt sie zu hetzen |
| **Langweiliges überspringen** | auf der nächsten Phrasengrenze zum interessanten Teil springen |
| **Drop verdoppeln** | die Drop-Phrase einmal wiederholen, wenn der Raum kocht |
| **Beim Höhepunkt einsteigen** | spät am Abend nicht das Intro spielen, sondern nah am Kern anfangen |

Alle vier brauchen dasselbe: eine verlässliche Antwort auf die Frage, *wo im
Track was passiert*. Damit beginnt Teil 2.

## Teil 2 — Den Höhepunkt automatisch finden

Wir erkennen bisher Drops über die Bassenergie: Bass weg, Bass schlagartig
zurück. Das findet den *energetischen* Höhepunkt und funktioniert bei
Clubmusik gut. Es findet aber nicht den **wiederkehrenden Kern** — die Stelle,
die jeder mitsummt. Dafür gibt es ein etabliertes Verfahren.

### Selbstähnlichkeitsmatrix

Man zerlegt den Track in Merkmale — hier ein **Chroma-Vektor je Beat**, also
die Verteilung der Energie auf die zwölf Halbtöne. Dann vergleicht man jeden
Beat mit jedem anderen. Das Ergebnis ist eine quadratische Matrix, in der
Ähnlichkeit hell und Unterschied dunkel ist.

Darin sieht man zwei Dinge:

- **Blöcke** auf der Diagonalen: Abschnitte, die in sich gleich bleiben
- **Streifen** parallel zur Diagonalen: Stellen, die sich *wiederholen*

Chroma ist dabei die richtige Wahl, weil es die Harmonie erfasst und
gegenüber Klangfarbe unempfindlich ist: Dieselbe Melodie mit anderer
Instrumentierung bleibt ähnlich.

### Grenzen finden (Foote)

Über die Diagonale wird ein kleiner **Schachbrett-Kern** geschoben. Wo zwei
verschiedene Blöcke aneinanderstoßen, korreliert er stark — die entstehende
Kurve heißt Novelty-Funktion, und ihre Spitzen sind die Abschnittsgrenzen.
Anschließend werden sie auf Phrasengrenzen gerundet, denn in Clubmusik liegen
sie ohnehin dort.

### Den Kern erkennen

Der Höhepunkt ist der Abschnitt, der sich **am häufigsten wiederholt** und
dabei **hohe Energie** hat. Beides zusammen — reine Wiederholung allein fände
auch eine langweilige Strophe, reine Energie allein einen einmaligen Ausbruch.

## Was davon gebaut ist

- **Loop-Roll vor dem Drop** — `mixer.js`, halbierende Längen, phrasengenau
- **Outro verlängern** — dieselbe Mechanik mit langen Schleifen
- **Chroma, Selbstähnlichkeit, Novelty, Kern** — `analyse.js`

Was bewusst **nicht** gebaut ist: das Trennen in Spuren (Vocals vom Rest).
Das klingt fantastisch und kostet eine eigene Woche.

## Quellen

- [DJ Looping Guide — We Are Crossfader](https://wearecrossfader.co.uk/blog/dj-looping-guide/)
- [How and Why to Use Loops as a DJ — BPM Music](https://blog.bpmmusic.io/news/how-and-why-to-use-loops-as-a-dj/)
- [DJ Looping Techniques](https://edm-ghost-production.com/dj-knowledge-base/dj-looping-techniques)
- [Novelty-Based Segmentation — AudioLabs Erlangen (FMP)](https://www.audiolabs-erlangen.de/resources/MIR/FMP/C4/C4S4_NoveltySegmentation.html)
- [Foote: Automatic audio segmentation using a measure of audio novelty](https://www.researchgate.net/publication/3863771_Automatic_audio_segmentation_using_a_measure_of_audio_novelty)
- [Chorus Detection Using Music Structure Analysis](https://link.springer.com/chapter/10.1007/978-981-16-1649-5_1)
- [Automatic Detection of Cue Points for DJ Mixing](https://arxiv.org/pdf/2007.08411)
