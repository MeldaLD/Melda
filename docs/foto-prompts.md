# Prompts für die Demo-Fotos

Für jedes Szenario ein Hauptbild, für acht der zehn dazu drei Auswahlbilder
für die Rückfrage. Insgesamt **32 Dateien** – `wand-detail.jpg` ist in drei
Fällen dieselbe plausible Fehlauswahl, `bad-uebersicht.jpg` in zweien.

Alle Dateien gehören nach `public/demo-fotos/`, exakt unter dem angegebenen
Namen. Sobald eine Datei da ist, erscheint sie automatisch statt des
Platzhalters. Auf Vercel muss sie vor dem Bauen im Verzeichnis liegen –
ausgeliefert wird nur, was zur Bauzeit vorhanden war.

> **Der Name entscheidet, was das Haus verlässt.** Genau diese 32 Dateinamen
> gelten als Bilder der Vorführung: Zu ihnen gibt es eine hinterlegte
> Diagnose, und sie gehen auch mit gesetztem `ANTHROPIC_API_KEY` an kein
> Modell. Ein Bild mit einem anderen Namen wird tatsächlich ausgewertet.
> Wer eine Datei umbenennt, ändert damit ihr Verhalten – die Liste entsteht
> aus `config/scenarios.ts` und wird von `npm run pruefen:ki` geprüft.

## Für jedes Bild gilt

Diesen Block jedem Prompt voranstellen oder als Systemvorgabe setzen:

> Fotorealistische Handyaufnahme, wie ein Mieter sie beiläufig macht.
> Deutsche Mietwohnung, unaufgeregt und alltäglich. Verfügbares Licht,
> leichte Unschärfe erlaubt, keine Studioausleuchtung, keine Werbeästhetik.
> Querformat 4:3. Keine Menschen, keine Hände, keine Gesichter. Keine
> lesbare Schrift, keine Marken, keine Logos, keine Hausnummern, keine
> Namensschilder. Nichts Dramatisches oder Ekliges – es geht um einen
> normalen Schaden, nicht um eine Katastrophe.

**Danach:** auf höchstens 1600 px Breite verkleinern, als JPEG mit Qualität
75 speichern, Ziel unter 200 kB je Datei.

---

## 1 · Silikonfuge in der Dusche

**`silikonfuge-nah.jpg`** – Nahaufnahme der Silikonfuge zwischen Duschwanne
und weiß gefliester Wand. Die Fuge ist dunkel verfärbt und hat sich an
mehreren Stellen von der Fliese gelöst, eine schmale schwarze Linie zieht
sich entlang der Kante. Kamera etwa 30 cm entfernt, leicht schräg von oben.

**`silikonfuge-weit.jpg`** – Dieselbe Duschwanne aus zwei Metern Abstand, die
gesamte Länge der Wannenfuge im Bild, dazu die senkrechte Eckfuge. Man
erkennt, dass die Verfärbung über die volle Länge geht.

**`bad-uebersicht.jpg`** – Kleines deutsches Badezimmer im Ganzen: Dusche,
Waschbecken, Spiegelschrank, helle Fliesen. Aufgeräumt, aber bewohnt.

**`wand-detail.jpg`** – Nahaufnahme einer weiß gestrichenen Raufasertapete,
gleichmäßig und unauffällig. Absichtlich nichtssagend: Dieses Bild steht als
falsche Auswahl zur Verfügung.

---

## 2 · Tropfender Wasserhahn

**`wasserhahn-nah.jpg`** – Küchenarmatur aus gebürstetem Edelstahl, ein
Wassertropfen hängt am Auslauf. Nahaufnahme, Edelstahlspüle unscharf im
Hintergrund.

**`spuele-unterschrank.jpg`** – Blick in den geöffneten Spülenunterschrank:
Siphon aus weißem Kunststoff, zwei Eckventile, Anschlussschläuche. Etwas
Putzmittel am Rand, ganz normal.

**`wasserhahn-weit.jpg`** – Dieselbe Armatur aus etwa anderthalb Metern, mit
Spüle und ein Stück Arbeitsplatte.

**`kueche-uebersicht.jpg`** – Kleine deutsche Einbauküche im Ganzen,
Hängeschränke, Arbeitsplatte, Tageslicht von der Seite.

---

## 3 · Heizkörper wird nicht warm

**`heizkoerper-nah.jpg`** – Weißer Rippenheizkörper unter einem Fenster,
Thermostatventil im Bild, Kamera etwa einen Meter entfernt.

**`thermostat-nah.jpg`** – Nahaufnahme nur des Thermostatventils, weiße
Kunststoffkappe mit Zahlenring, Ventilanschluss sichtbar. **Wichtig: keine
lesbare Herstellerbeschriftung.**

**`heizkoerper-weit.jpg`** – Derselbe Heizkörper aus drei Metern, mit
Fensterbank und einem Stück Wohnzimmer.

**`wohnzimmer-uebersicht.jpg`** – Schlichtes deutsches Wohnzimmer, Sofa,
Couchtisch, Fenster mit Gardine. Bewohnt, nicht dekoriert.

---

## 4 · Wasserfleck an der Decke (Notfall)

**`wasserfleck-decke.jpg`** – Weiße Zimmerdecke mit einem bräunlichen,
feuchten Fleck, etwa handtellergroß, mit deutlich dunklerem Rand. Die Decke
wirkt an der Stelle leicht durchgedrückt. Von unten fotografiert.

**`wasserfleck-weit.jpg`** – Dieselbe Decke aus größerem Abstand, der Fleck
sitzt in einer Zimmerecke, ein Teil der angrenzenden Wand ist mit im Bild.
Die Ausdehnung wird erkennbar, etwa 60 × 40 cm.

**`decke-uebersicht.jpg`** – Zimmerdecke eines Wohnraums im Ganzen, weiß,
Deckenlampe, ohne besondere Auffälligkeiten.

**`wand-detail.jpg`** – bereits unter Szenario 1 beschrieben.

---

## 5 · Schimmel an der Außenwand

**`schimmel-ecke.jpg`** – Dunkler, fleckiger Schimmelbefall in einer
Raumecke direkt über der weißen Fußleiste, etwa 25 × 25 cm. Weiße
Raufasertapete drumherum. Sachlich, nicht abstoßend.

**`schimmel-weit.jpg`** – Dieselbe Ecke aus zwei Metern, das Fenster ist mit
im Bild und der Fensteranschluss erkennbar. Man sieht, dass es eine
Außenwand ist.

**`fenster-detail.jpg`** – Nahaufnahme eines Kunststofffenster-Rahmens am
unteren Anschluss, Dichtung und Laibung sichtbar.

**`wand-detail.jpg`** – bereits unter Szenario 1 beschrieben.

---

## 6 · Treppenhausbeleuchtung defekt

**`treppenhaus-dunkel.jpg`** – Treppenabsatz in einem deutschen Mehrfamilien-
haus, deutlich zu dunkel, die Deckenleuchte brennt nicht. Etwas Restlicht
aus einem Fenster. Geländer und Stufen erkennbar.

**`leuchte-nah.jpg`** – Nahaufnahme einer flachen, runden LED-Deckenleuchte
aus weißem Kunststoff, erloschen, von unten fotografiert.

**`treppenhaus-weit.jpg`** – Dasselbe Treppenhaus über zwei Etagen, weiter
oben brennt Licht. Der Kontrast macht klar, dass nur eine Leuchte ausfällt.

**`schalter-detail.jpg`** – Weißer Lichtschalter mit Zeitautomatik an einer
Treppenhauswand, Nahaufnahme.

---

## 7 · Abfluss läuft nicht ab

**`abfluss-verstopft.jpg`** – Weißes Waschbecken, etwa fünf Zentimeter
trübes Wasser stehen darin und laufen nicht ab. Von schräg oben.

_Nur dieses eine Bild._ Hier fragt der Assistent nicht nach: Zuerst kommt
der Selbsthilfe-Tipp, und ein zweites Foto ändert daran nichts. Siehe die
Regel in `config/scenarios.ts`.

---

## 8 · Fenstergriff defekt

**`fenstergriff-nah.jpg`** – Weißer Fenstergriff an einem Kunststofffenster,
sichtbar lose und leicht schief in der Halterung. Nahaufnahme.

**`griffplatte-nah.jpg`** – Dieselbe Griffstelle, aber mit Blick auf die
Griffplatte unter dem Hebel: die beiden Schraubenabdeckungen sichtbar,
eine davon verdreht. Daran erkennt der Betrieb, welche Garnitur passt.

**`fenster-gesamt.jpg`** – Ganzes Dreh-Kipp-Kunststofffenster von innen,
geschlossen, mit Rahmen und Griff. Ein Stück Kinderzimmer erkennbar.

**`fenster-detail.jpg`** – bereits unter Szenario 5 beschrieben.

**`kinderzimmer.jpg`** – Schlichtes Kinderzimmer, Bett, Regal, Spielzeug am
Boden. Bewohnt und unaufgeräumt, keine Personen.

---

## 9 · Gegensprechanlage ohne Funktion

**`klingel-nah.jpg`** – Innensprechstelle einer Gegensprechanlage an einer
Wohnungswand: weißes Kunststoffgehäuse, Hörer, Türöffnerknopf. Erkennbar
etwa fünfzehn Jahre alt. **Keine lesbare Beschriftung.**

**`klingeltableau.jpg`** – Klingeltableau neben einer Hauseingangstür,
mehrere Klingelknöpfe mit **leeren** Namensschildern. Edelstahl oder
Kunststoff, sichtlich in die Jahre gekommen.

**`hauseingang.jpg`** – Hauseingang eines deutschen Mehrfamilienhauses von
außen, Tür und ein Stück Fassade. **Keine Hausnummer, kein Straßenschild.**

**`flur-detail.jpg`** – Wohnungsflur, weiße Wand, Lichtschalter,
Garderobenhaken. Unauffällig.

---

## 10 · Müllraum überfüllt

**`muellraum-voll.jpg`** – Müllraum eines Mehrfamilienhauses: vier graue
Restmülltonnen, alle randvoll, die Deckel schließen nicht. Daneben stehen
mehrere volle Müllsäcke auf dem Boden. Ordentlich abgestellt, nicht
verwahrlost.

_Nur dieses eine Bild._ Hier fährt kein Handwerksbetrieb, sondern die
Entsorgung – ein zweites Foto ändert nichts daran, was eingepackt wird.

---

## Kontrolle vor dem Einsatz

- Alle 32 Dateinamen exakt wie oben, sonst greift der Platzhalter – und ein
  abweichender Name schickt das Bild an ein Modell statt zum hinterlegten
  Text. `npm run pruefen:ki` vergleicht diese Liste mit der Konfiguration.
- Kein Bild zeigt Personen, Schrift, Marken oder Hausnummern
- Jedes „weit"-Bild zeigt erkennbar **dasselbe Motiv** wie sein „nah"-Bild –
  daran hängt die Glaubwürdigkeit der Rückfrage
- Alle Dateien unter 200 kB
