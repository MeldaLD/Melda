# Aufbau vor Ort — Schritt für Schritt

Für den ersten Test mit dem Beamer. Alles hier ist durchgespielt, nicht
ausgedacht: Server, Testbild, Einmessen, Bühne — die Kette ist einmal
komplett durchlaufen, bevor diese Anleitung geschrieben wurde.

**Zeitbedarf:** rund 25 Minuten, davon 10 fürs Einmessen.

---

## Vorher: was auf den Rechner muss

| | |
|---|---|
| **Node** | Version 20 oder neuer. `node --version` im Terminal. |
| **Das Projekt** | Der Ordner mit `dj/` darin. |
| **Chrome oder Edge** | Firefox geht auch, ist aber ungetestet. |

**Kein `npm install` nötig.** Der DJ-Server benutzt nur eingebaute
Node-Module — das ist extra so gebaut, damit vor Ort nichts nachgeladen
werden muss. Ohne Netz funktioniert alles außer der Gästeabstimmung.

Musik ist optional: Ohne eigene Dateien läuft der **Prüfstand**, der seine
acht Tracks im Browser selbst erzeugt. Für den ersten Test reicht das völlig.

---

## 1 · Server starten

Terminal im Projektordner:

```
npm run dj:server
```

Es erscheinen drei Adressen:

```
Bühne (Monitor)   http://localhost:3200/buehne
Messstand         http://localhost:3200/messstand
Beamer einmessen  http://localhost:3200/kalibrieren
```

Das Fenster **offen lassen**. Der Server ist der Rest des Abends.

> **Warum ein Server und nicht die Dateien direkt?** Weil die Einmessung im
> Speicher des Browsers liegt, und der ist pro Adresse getrennt. Über den
> Server sind Einmessseite und Bühne dieselbe Adresse — die Bühne findet die
> Messung dann von allein. Bei direkt geöffneten Dateien tut sie das nicht.

## 2 · Beamer anschließen

- Beamer als **erweiterten Bildschirm** (Windows: `Win`+`P` → *Erweitern*).
- In den Windows-Anzeigeeinstellungen die **native Auflösung** des Beamers
  einstellen, meist 1920 × 1080.
- Beamer scharfstellen und ausrichten. Trapezkorrektur am Gerät **ausschalten** —
  die Verzerrung rechnen wir selbst, und zwar genauer.
- Der Raum sollte so dunkel sein, wie er es abends auch ist. Die Helligkeit,
  die du jetzt siehst, ist die, mit der du planst.

## 3 · Testbild werfen

1. Chrome auf den **Beamer-Bildschirm** schieben.
2. `http://localhost:3200/kalibrieren` öffnen.
3. Reiter **1 · Testbild werfen**.
4. Auflösung wählen — im Zweifel **„Bildschirmgröße übernehmen"**.
5. **Testbild im Vollbild** drücken.

An der Wand steht jetzt ein Raster mit **vier nummerierten Fadenkreuzen**:

```
   1 ─────────────── 2
   │                 │
   │        ✛        │
   │                 │
   4 ─────────────── 3
```

`Escape` beendet das Vollbild.

## 4 · Fotografieren

Ein Foto, auf dem **alle vier Fadenkreuze** und die ganze Fassade zu sehen
sind.

- Möglichst **frontal** und ohne Zoom-Verzeichnung.
- Handy **quer**.
- Nicht nachträglich zuschneiden — der Zuschnitt verschiebt alle Bezüge.

> **Muss ich von einem bestimmten Punkt aus fotografieren?** Für eine
> **flache** Wand nein: Die Rechnung ist eine Ebenen-Abbildung, und die
> stimmt für jeden Betrachter, egal wo das Foto entstanden ist. Nur wenn
> Dinge **hervorstehen** — ein Vordach, eine Säule, eine tiefe Laibung —
> lohnt es sich, von dort zu fotografieren, wo die Gäste später stehen.

## 5 · Foto auf den Rechner

Am einfachsten: Kabel, AirDrop, oder das Foto an sich selbst schicken. Auf
dem Rechner reicht der Speicherort, in dem du es wiederfindest.

> **Wenn du lieber auf dem iPad vermisst:** Geht auch. Dann dort einmessen,
> **Als Datei herunterladen**, die Datei auf den Rechner bringen, auf dem
> Rechner `/kalibrieren` öffnen, unter **3 · Ergebnis** die Datei laden und
> **Auf diesem Gerät speichern** drücken. Ohne diesen letzten Schritt kennt
> der Party-Rechner die Messung nicht.

## 6 · Vermessen

Reiter **2 · Foto vermessen**, Foto laden.

**Zuerst die vier Ecken — die Reihenfolge ist wichtig:**

Genau in der Nummerierung des Testbildes klicken:

| Klick | Fadenkreuz |
|---|---|
| 1. | oben **links** |
| 2. | oben **rechts** |
| 3. | unten **rechts** |
| 4. | unten **links** |

Also **im Uhrzeigersinn, beginnend oben links.** Eine andere Reihenfolge
ergibt eine gespiegelte oder verdrehte Projektion. Der Zähler am Knopf zeigt
`0/4` bis `4/4`.

**Danach die Bereiche.** Auf **Bereich zeichnen** stellen, Art wählen,
Eckpunkte anklicken, **Bereich schließen**:

| Art | Wofür | Was die Show damit macht |
|---|---|---|
| **Gitterkasten** | die Flaschenkästen | wird zur Punktmatrix: Pegel, Lauflicht, Funkeln |
| **Fenster** | Fensterflächen | Inhalt läuft *hinein*, Rahmen werden nachgezeichnet |
| **Tür** | Türen, Tore, Durchgänge | Hier kommt etwas *heraus* |
| **Kante / Sims** | Gesimse, Sockel, Kanten | Lauflichter und Punktreihen laufen darauf |
| **Balken** | Deckenbalken | Licht läuft der Reihe nach an ihnen entlang |
| **Knick** | Raumkanten, wo die Wand abknickt | dort bricht das Bild – nichts Wichtiges hin |
| **Fläche** | glatte, gute Wandstücke | bevorzugt für große Motive |
| **Totzone** | Regenrohre, Kisten, alles Störende | hier landet nichts |

### Für diesen Raum: die Gitterkästen zuerst

Sie sind das Wertvollste, was der Raum hat – warum, steht in
[LAGERRAUM.md](./LAGERRAUM.md). Beim Markieren:

1. Art auf **Gitterkasten** stellen.
2. **Spalten** und **Reihen** eintragen: wie viele Flaschen der Kasten breit
   und hoch ist. Ruhig nachzählen, es lohnt sich – daraus wird die
   Auflösung der Anzeigetafel. Zur Not schätzen; ungefähr ist besser als gar
   nicht.
3. **Genau vier Ecken**, im Uhrzeigersinn ab oben links. Die Seite lässt für
   diese Art nichts anderes zu – ohne vier Ecken gibt es kein Raster.
4. Für **jeden** Kasten einzeln, nicht einen Rahmen um den ganzen Stapel.

Danach die vier, fünf **Deckenbalken** und die **Raumkante** links als Knick.

Lieber wenige, gut gesetzte Bereiche als viele ungenaue. **Die vier
Gitterkästen allein tragen schon fast alles.**

## 7 · Kontrollieren — der wichtigste Schritt

Der Haken **Prüfraster** legt das komplette Testraster zurückgerechnet über
dein Foto.

**Deckt es sich mit dem echten Raster auf dem Foto, stimmt die Messung.**
Wenn nicht, hast du fast immer die vier Ecken in der falschen Reihenfolge
oder ein Fadenkreuz danebengeklickt. Mit **Zurück** korrigieren.

Diese eine Kontrolle fängt praktisch jeden Fehler ab, den man hier machen
kann — nimm sie ernst, sie kostet zehn Sekunden.

## 8 · Speichern

Reiter **3 · Ergebnis** → **Auf diesem Gerät speichern**.

Zusätzlich **Als Datei herunterladen** und die Datei sichern. Wenn der
Browser-Speicher mal leer ist, ist das der Unterschied zwischen „Datei laden"
und „alles noch mal messen".

## 9 · Bühne starten

1. `http://localhost:3200/buehne` — **auf demselben Rechner und im selben
   Browser**, sonst ist die Messung nicht da.
2. **Prüfstand starten** (oder **Eigene Bibliothek**, wenn Musik in `musik/`
   liegt). Der Prüfstand braucht ein paar Sekunden, um seine Tracks zu bauen.
3. `F11` für Vollbild.
4. Unter **Bild** im Menü: **Bild: Bühnenshow** wählen.

Dass die Einmessung greift, siehst du sofort: Das Bild ist zur Wand hin
verzogen, die Punktreihen liegen auf deinen Kanten, Fensterrahmen stehen an
den Fenstern.

## 10 · Bedienoberfläche weg

Knopf **UI ausblenden**, Taste **U**, oder gleich mit
`http://localhost:3200/buehne?ui=aus` starten.

Damit verschwindet alles außer dem Bild, auch der Mauszeiger. Das ist beim
Projizieren nicht nur Kosmetik: Die Bedienleiste ist normales HTML und wird
**nicht** mitverzerrt — sie stünde als einziges schief zur Wand.

Zurück: **Escape**, oder dreimal in die linke obere Ecke tippen.

---

## Wenn etwas nicht stimmt

| Symptom | Ursache | Lösung |
|---|---|---|
| Bild ist nicht verzogen | Bühne kennt die Messung nicht | Gleiche Adresse? Gespeichert? Bühne mit `F5` neu laden |
| Projektion gespiegelt oder verdreht | Ecken in falscher Reihenfolge | Neu setzen, 1→2→3→4 im Uhrzeigersinn |
| Prüfraster passt nicht | Fadenkreuz danebengeklickt | **Zurück**, neu setzen |
| Alles ruckelt | zu schwache Grafik | Bildgüte runterstellen; **PC-Modus** nur bei eigener Grafikkarte |
| Zu hell / blendet | echte Wand heller als gerechnet | `deckel` am `Blinder` in `gemeinsam/gewerke.js` von `1` auf `0.6` |
| Nach dem Umstecken alles schief | andere Auflösung als beim Messen | Auflösung zurückstellen **oder** neu einmessen |

**Modus per Tastatur festhalten**, wenn das Menü weg ist — `F12` für die
Konsole:

```js
welt.bild.modusZwang = 'show';   // Bühnenshow festhalten
welt.bild.modusZwang = null;     // wieder automatisch
```

## Was du mitbringen solltest

- **Zollstock oder Maßband** — nicht für die Software, sondern um den
  Beamerabstand zu notieren. Beim nächsten Mal steht er dann gleich richtig.
- **Ein Foto der fertigen Aufstellung.** Wo der Beamer stand, ist die eine
  Information, die sich nicht rekonstruieren lässt.
- **Verlängerungskabel.** Der Beamer steht nie da, wo die Steckdose ist.

## Was heute noch nicht dran ist

Der **Schatten-DJ** ist noch die alte, gerechnete Figur — die guten
Bewegungen aus den DeepMotion-Aufnahmen sind noch nicht eingebaut. Für den
Aufbautest stört das nicht; wenn er dich ärgert, schalt ihn mit **D** aus.
