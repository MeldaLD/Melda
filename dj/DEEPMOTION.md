# DeepMotion: Schritt für Schritt

Was einzustellen ist, damit hinterher die richtigen Dateien herauskommen –
und bei jeder Einstellung, warum sie so und nicht anders steht.

Die Parameternamen unten sind die aus der
[Animate-3D-Schnittstelle](https://github.com/DeepMotion/Animate-3D-REST-API).
In der Oberfläche heißen die Schalter manchmal etwas anders; die Bedeutung ist
dieselbe.

---

## 0. Erst **einen** Take, dann den Rest

Das ist der wichtigste Punkt der ganzen Anleitung.

Lade zuerst **nur `01-grundgroove`** hoch, schick mir das Ergebnis, und ich
lasse die ganze Kette einmal durchlaufen. Erst wenn das sitzt, die anderen
sieben. Guthaben ist begrenzt, und es wäre bitter, alles zu verbrauchen und
danach festzustellen, dass eine Einstellung falsch stand.

---

## 1. Die Videos schneiden

Je Take ein Clip. Beim Schneiden gilt:

- **Alle vier Tischtipper müssen drin sein.** Sie sind mein Anker – an ihnen
  finde ich das Schlagraster in den Bewegungsdaten wieder.
- **Großzügig schneiden.** Ein, zwei Sekunden vorher und nachher schaden
  nicht. Auf den Frame genau muss gar nichts sein; die Tipper finde ich
  ohnehin selbst.
- **Nichts beschleunigen, nichts verlangsamen.** Keine Zeitlupe, keine
  Bildratenwandlung.

Wenn ihr statt zu schneiden einfach das ganze Video hochladen wollt: geht
auch, solange es unter der Längengrenze eures Tarifs bleibt. Ich kann die
Takes anhand der Tipper selbst auseinandersortieren. Getrennte Clips sind aber
sauberer, weil ein schlechter Take dann nur einen Job kostet.

## 2. Vor dem Hochladen kurz durchsehen

Spart Guthaben – jeder dieser Punkte macht einen Job unbrauchbar:

- [ ] Alle vier Tipper zu sehen
- [ ] Der **ganze Körper** durchgehend im Bild, auch bei erhobenen Armen
- [ ] Die Kamera hat sich nicht bewegt
- [ ] Nur **eine** Person im Bild
- [ ] Nicht zu dunkel, kein Gegenlicht

## 3. Die Einstellungen

| Einstellung | Wert | Warum |
|---|---|---|
| `formats` | **`bvh, fbx, mp4`** | BVH ist das, womit ich arbeite. FBX als Rückfall, falls mit dem BVH etwas nicht stimmt. MP4 als Vorschau – daran sehe ich, was der Löser produziert hat, und kann ein Problem seinem Verursacher zuordnen statt zu raten. |
| `rootAtOrigin` | **aus** | Der wichtigste Schalter. Er würde die Figur an den Ursprung heften – und damit genau die Hüftbewegung wegnehmen, aus der der Groove besteht: Gewichtsverlagerung und Einsacken. Wegdriften kann ich hinterher abziehen; gelöschte Bewegung kann ich nicht zurückholen. |
| `poseFilteringStrength` | **0.0** (höchstens 0.2) | Glättet Zittern, „may sacrifice frame-level accuracy" – und genau die Genauigkeit auf Bildebene entscheidet, ob eine Bewegung auf dem Schlag sitzt. Glätten kann ich später, entglätten nie. |
| `footLockingMode` | **`auto`** | Sie steht auf der Stelle und verlagert Gewicht, da passt die Vorgabe. Falls die Hüfte im Ergebnis wie festgeschraubt wirkt: einmal `grounding` probieren, das hält Bodenkontakt ohne zu verriegeln. |
| `videoSpeedMultiplier` | **1.0** | Ist nur für Zeitlupenmaterial da. |
| `upperBodyOnly` | **false** | Zu sehen ist später nur der Oberkörper – aber die Beine stabilisieren die Schätzung, und die Hüfte brauche ich. |
| `trackHand` | **aus** | Finger sind auf einer Silhouette aus zehn Metern nicht zu erkennen, kosten aber Rechenzeit und bringen Zittern mit. Das Handgelenk kommt ohnehin aus der Armkette. |
| `trackFace` | **aus** | Es ist ein Schattenriss. |

## 4. Herunterladen

Im Download-Fenster unten im Auswahlfeld **BVH** wählen (und FBX, und MP4).

Im ZIP liegen **zwei** BVH-Dateien. Eine davon hat `(includeTPose)` im Namen –
die hat bei Sekunde 0 eine zusätzliche T-Pose eingefügt.

- **Die Datei *ohne* `includeTPose` ist die wichtige.** Bei ihr ist Bild 0
  wirklich der Anfang der Aufnahme. Bei der anderen wäre mein erster Tipper
  keine echte Bewegung, sondern eine eingeschobene Pose – die Zeitachse wäre
  um ein Bild verschoben.
- **Schick mir trotzdem beide.** Aus der T-Pose lese ich die Knochenlängen im
  Ruhezustand ab, und die brauche ich, um die Bewegung auf die gezeichnete
  Figur zu übertragen.

## 5. Was ich am Ende brauche

Am liebsten in einem Ordner je Take:

```
01-grundgroove/
  01-grundgroove.bvh                 ← das Wichtigste
  01-grundgroove(includeTPose).bvh
  01-grundgroove.fbx                 ← Rückfall
  01-grundgroove.mp4                 ← die Vorschau von DeepMotion
  01-grundgroove-original.mp4        ← euer Video, mit Ton
```

Der **Ton im Originalvideo** darf nicht fehlen. Er ist die zweite,
unabhängige Möglichkeit, Bewegung und Musik übereinanderzulegen – falls mit
den Tippern etwas nicht klappt, rechne ich es über den Ton aus.

Dazu eine Zeile: **welche Datei welcher Take ist**, und ob ein Take mehrfach
aufgenommen wurde (dann sag mir, welcher gilt).

## 6. Woran man ein schlechtes Ergebnis erkennt

Schaut euch die MP4-Vorschau an. Diese drei Dinge heißen „nochmal":

- **Arme, die durch den Körper gehen** oder von einem Bild aufs nächste
  springen.
- **Füße, die schlittern**, obwohl sie stehen bleiben sollten.
- **Das Skelett kippt nach hinten durch** – Arme und Beine sind plötzlich
  vertauscht. Das ist die klassische Schwäche einer einzelnen Kamera: Aus
  einem Bild allein ist nicht immer zu sehen, ob ein Arm nach vorn oder nach
  hinten zeigt. Passiert vor allem, wenn man sich zur Seite dreht.

Wenn nur *eine kurze Stelle* wackelt, schick es trotzdem – oft liegt die
schlechte Stelle außerhalb der sechs Takte, die ich am Ende benutze.

---

## Was auf meiner Seite schon steht

Damit klar ist, dass ihr nicht ins Leere aufnehmt:

- **Der BVH-Leser** (`werkzeuge/bvh.mjs`) ist fertig und abgenommen. Er liest
  den Knochenbaum, folgt der Drehreihenfolge, die in der Datei steht, und
  rechnet jedes Bild in Weltkoordinaten.
- **Die Abnahme dazu** (`npm run dj:bvhpruefen`) rechnet Stellungen von Hand
  nach, statt „sieht plausibel aus" zu prüfen. Der Kern: Dieselben Zahlen
  müssen bei der Kanalreihenfolge ZXY etwas *anderes* ergeben als bei XZY.
  Genau dieser Fehler wäre sonst unsichtbar – ein falsch multipliziertes
  Skelett steht in Ruhe völlig richtig da und verdreht sich erst, wenn zwei
  Achsen zugleich im Spiel sind.
- **Die Namenszuordnung** kennt mehrere Namensschulen (Mixamo, `L_UpperArm`,
  `Pelvis`/`Chest`). Auch hier eine Falle, die abgedeckt ist: `LeftArm` ist bei
  Mixamo der *Oberarm* und steckt als Teilzeichenkette in `LeftForeArm` – wer
  nur nach Enthalten sucht, hängt den Ellenbogen an den Oberarm.

Was als Nächstes drankommt: Tipper finden, auf das Schlagraster legen,
Schleifen bilden – und die Silhouette aus Gelenkstellungen zeichnen statt aus
gerechneten Winkeln. Der vorhandene Zeichner nimmt ohnehin schon
Gelenkstellungen entgegen; die Kinematik davor hat sie bisher nur *erfunden*.
Die fliegt raus, der Zeichner bleibt.
