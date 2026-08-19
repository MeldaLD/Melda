# Die Farbwahl, geprüft

Das erklärte Ziel der Palette war, Leute in den Bann zu ziehen und dort zu
halten. Dieses Papier prüft, ob das trägt — mit Belegen aus der Forschung und
mit Messungen am laufenden Bild.

**Ergebnis vorweg:** Die Farbwahl hält stand. Eine Annahme über die
Bilddichte war falsch, aber es war *meine*, nicht die der Palette. Und eine
Sicherheitsfrage, die vorher niemand gestellt hatte, ist beantwortet.

## Die acht Paletten gegen die Vorliebenkurve

Valdez & Mehrabian haben Farbwirkung auf Lust, Erregung und Dominanz
vermessen und Regressionen dafür angegeben. Zwei Befunde sind hier
einschlägig:

- **Angenehmste Töne:** Blau, Blaugrün, Grün, Rotpurpur, Purpur, Purpurblau.
  **Unangenehmste:** Gelb und Grüngelb.
- **Erregung = −0,31·Helligkeit + 0,60·Sättigung.** Sättigung treibt die
  Erregung, Helligkeit dämpft sie.

Nachgeprüft, Palette für Palette:

| Palette | Grundton | Akzent | Tonabstand |
|---|---|---|---|
| Tiefsee | Blau (250) | Cyanblau (200) | 50° |
| Eisblau | Cyanblau (232) | Grüncyan (168) | 64° |
| Nachtviolett | Blauviolett (300) | Blau (262) | 38° |
| Amethyst | Blauviolett (318) | Blau (278) | 40° |
| Polarlicht | Grüncyan (168) | Cyanblau (208) | 40° |
| Giftgrün | Grün (142) | Grüncyan (190) | 48° |
| Magenta | Violett/Purpur (344) | Blauviolett (300) | 44° |
| Zwielicht | Blau (272) | Violett/Purpur (322) | 50° |

**Alle sechzehn Töne liegen im belegt angenehmen Bereich.** Gelb und Grüngelb
kommen nirgends als Fläche vor — nur als heller Akzent am Ende einer
Helligkeitsrampe, wo die Fläche klein und die Helligkeit hoch ist.

Der Erregungsteil passt zum Anlass: dunkel und mäßig gesättigt heißt nach der
Regression *hohe* Erregung bei niedriger Helligkeit — also wach, ohne dass die
Leinwand den Raum überstrahlt. Für eine Party ist das die richtige Ecke.

**Eine ehrliche Einschränkung:** Diese Regressionen stammen von Farbtafeln in
beleuchteten Räumen. Bei uns ist die Leinwand im dunklen Raum selbst die
Lichtquelle; der Helligkeitsterm lässt sich nicht ohne Weiteres übertragen.
Die Aussagen über die *Töne* übertragen sich, die über die absolute Helligkeit
nicht.

## Die Bilddichte — und eine Korrektur meiner eigenen Annahme

Menschen bevorzugen Muster mit einer bestimmten fraktalen Dimension, und in
diesem Bereich zeigt das Stirnhirn die stärkste Alpha-Aktivität: wach, aber
entspannt. Genau der Zustand, um den es geht.

Gemessen am gerenderten Bild, mit Kästchenzählung über die Kantenmenge:

```
Eichung:  Gerade 0,93 (soll 1,00)   Sierpinski 1,59 (soll 1,58)   Rauschen 1,96 (soll 2,00)
Bild:     Median 1,75, Zehntel..Neuntel 1,69..1,81
```

Die Eichung trifft alle drei bekannten Muster — die Zahl 1,75 ist also
belastbar.

**Mein erster Schluss war trotzdem falsch.** Ich habe 1,75 gegen das Fenster
1,3–1,5 gehalten und die Prüfung durchfallen lassen. Dieses Fenster gilt für
**statistische** Fraktale — Küstenlinien, Baumkronen, Pollock. Für **exakte**
Fraktale, also solche mit Symmetrie und wortwörtlicher Wiederholung,
verschiebt sich die Vorliebe deutlich nach oben und läuft gegen D = 2. Die
Begründung der Autoren ist genau unser Fall: Symmetrie und exakte Wiederholung
bringen die Einfachheit zurück, die sonst die Dichte kostet.

Ein Mandelbrot ist ein exaktes Fraktal, und der Mandala-Modus legt zusätzlich
eine n-zählige Symmetrie darüber. **1,75 liegt damit richtig**, nicht zu dicht.

Die Prüfung verlangt jetzt: Median zwischen 1,3 und 1,92, und das obere
Zehntel unter 1,95 — darüber wäre es kein Muster mehr, sondern Rauschen (die
Eichung misst für Rauschen 1,96).

## Blitze: die Frage, die niemand gestellt hatte

Auf der Party läuft eine große Projektion in einem dunklen Raum. Unter dreißig
Gästen sitzt statistisch niemand mit lichtempfindlicher Epilepsie — aber
„statistisch niemand" ist keine Zusage, die man geben möchte.

Maßstab ist die allgemeine Blitzschwelle: höchstens **drei Blitze je Sekunde**,
wobei ein Blitz ein Paar gegenläufiger Änderungen der relativen Leuchtdichte
um mindestens 0,10 ist, auf mindestens einem Viertel der Bildfläche, und das
dunklere Bild unter 0,80 liegt.

Gemessen über 1200 Bilder mit Drops und einem Übergang:

```
hellstes Bild: relative Leuchtdichte 0,106 von 1,0
Blitze in der schlimmsten Sekunde: 0
Kontrolle mit einem gebauten 10-Hz-Blitz: 10 erkannt
```

**Null**, und die Kontrolle beweist, dass der Zähler funktioniert. Der Grund
ist die Palette selbst: Das *hellste* Bild des ganzen Laufs erreicht nur ein
Zehntel der möglichen Leuchtdichte. Eine Änderung um 0,10 ist damit gar nicht
darstellbar — die dunkle Grundierung macht die Projektion durch ihre Bauart
sicher, nicht durch eine Bremse.

Das gilt für die gemessenen Modi. Wer die Helligkeit später anhebt, sollte
`pruefungen/bildwirkung.mjs` erneut laufen lassen; sie hängt in `dj:alles`.

### Nachtrag: Lichtpark und Bühnenshow

Genau dieser Fall ist eingetreten. Der Lichtpark und die Bühnenshow sind
ausdrücklich als *helle* Modi gebaut, und für sie trägt die Begründung „die
dunkle Grundierung macht 0,10 gar nicht darstellbar" nicht mehr. Sie haben
deshalb eigene Abnahmen mit denselben Maßstäben:

```
Lichtpark    hellstes Bild 0,072   Blitze 0,0 je Sekunde
Bühnenshow   hellstes Bild 0,068   Blitze 0,0 je Sekunde
             größter Bildsprung 18,6 % der Fläche  (Grenze 25 %)
             Blitze allein       0,7 % der Fläche  (Grenze 25 %)
```

Beide bleiben unter der Schwelle, aber nicht mehr durch ihre Bauart, sondern
weil es nachgemessen ist. Die Bühnenshow ist außerdem der erste Modus mit
einem echten Stroboskop; dass es das geben darf, hängt allein an der
Viertel-Klausel — die Einzelheiten stehen in
[BUEHNENSHOW.md](./BUEHNENSHOW.md).

## Was nicht geprüft ist

- **Trance im engeren Sinn** — also Entrainment durch periodische Reize — ist
  hier bewusst kein Ziel. Es funktioniert über Flackern in bestimmten
  Frequenzbändern, und genau das ist die Ecke, aus der die Blitzgefahr kommt.
  Was die Figur und das Bild tun, ist Bindung durch Rhythmus und Dichte, nicht
  durch Flackern.
- **Wirkung auf konkrete Gäste.** Die zitierten Arbeiten geben Mittelwerte
  über Gruppen an. Zur Fraktalvorliebe gibt es ausdrücklich Arbeiten über
  individuelle Unterschiede; eine Palette kann nicht für jeden stimmen.

## Belege

- Valdez & Mehrabian, *Effects of color on emotions*, J. Exp. Psychol. Gen.
  123(4), 1994. — [PubMed](https://pubmed.ncbi.nlm.nih.gov/7996122/)
- Palmer & Schloss, *An ecological valence theory of human color preference*,
  PNAS 107(19), 2010.
- Hagerhall, Laike, Taylor u. a., *Investigations of Human EEG Response to
  Viewing Fractal Patterns*, Perception 37(10), 2008. —
  [SAGE](https://journals.sagepub.com/doi/abs/10.1068/p5918)
- Bies, Boydston, Taylor, Sereno, *Aesthetic Responses to Exact Fractals
  Driven by Physical Complexity*, Front. Hum. Neurosci. 10:210, 2016. —
  [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4873502/)
- Robert u. a., *Taxonomy of Individual Variations in Aesthetic Responses to
  Fractal Patterns*, Front. Hum. Neurosci. 10:350, 2016. —
  [Frontiers](https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2016.00350/full)
- W3C, *Understanding SC 2.3.1: Three Flashes or Below Threshold*. —
  [W3C](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes.html)
- Kovesi, *Good Colour Maps: How to Design Them*, arXiv:1509.03700, 2015.
