# Plan: ein vollwertiger DJ in sieben Tagen

Ziel: ein Rechner, ein Display, eine Anlage. Der Abend laeuft von allein, klingt
ueber Stunden wie ein Mensch, der weiss was er tut, und die Gaeste koennen
mitreden ohne ihn zu zerlegen.

## Die eine Entscheidung, aus der alles folgt

**Die schwere Arbeit passiert vorher, nicht am Abend.**

Alles, was Rechenzeit, Python, ffmpeg und Modelle braucht - Tempo finden,
Beatraster legen, Tonart bestimmen, Drops suchen - laeuft in der Woche vor der
Party und schreibt sein Ergebnis in eine Datei. Am Abend liest der Server nur
noch diese Datei und der Browser mischt.

Der Grund ist nicht Eleganz, sondern Nerven: Was am Partyabend laeuft, soll so
wenige bewegliche Teile wie moeglich haben. Der Abend-Teil hat null
npm-Abhaengigkeiten und braucht nichts ausser Node und einem Browser. Wenn um
halb zwei etwas klemmt, willst du nicht in einer Python-Umgebung suchen.

```
VORBEREITUNG (diese Woche, braucht Python + ffmpeg + yt-dlp)
  einlesen/    YouTube-Link oder Datei  ->  musik/
  analyse/     Beatraster, Tonart, Struktur, Energie  ->  bibliothek.json

ABEND, auf deinem PC (nur Node + Browser, alles lokal)
  server/      Bibliothek, Auswahl, Wiedergabesteuerung
  bruecke/     haelt Supabase und den PC im Gleichstand
  buehne/      Zwei Decks, EQ, Filter, Echo - das eigentliche Mischen
  telefon/     Notfall-Abstimmung im lokalen WLAN, falls das Internet wegbricht

GAESTE (ueberall, auch mit Mobilfunk)
  gast/        kleine statische HTML-App  <->  Supabase  <->  Bruecke
```

Die eine Ausnahme: YouTube-Links, die du **waehrend** der Party reinwirfst.
Die laufen im Hintergrund durch dieselbe Pipeline und tauchen nach etwa einer
Minute in der Bibliothek auf. Das darf niemals die Wiedergabe blockieren -
deshalb ein eigener Prozess, dessen Absturz den Abend nicht anfasst.

## Supabase als Draht zwischen Gaesten und DJ

Die Gaeste bekommen eine kleine HTML-App, die nur mit Supabase spricht. Der PC
haengt an derselben Datenbank und hoert ueber Realtime mit. Das hat einen
Vorteil, der am Partyabend mehr wert ist als er klingt: **die Gaeste muessen
nicht ins WLAN.** Kein Passwort herumreichen, kein ueberfordeter Router, keine
Reichweitenprobleme im Garten. Mobilfunk reicht.

Der Preis: die Abstimmung braucht Internet. Deshalb die harte Trennung -

> **Die Musik haengt nie am Netz.** Bibliothek, Analyse, Auswahl und Wiedergabe
> laufen vollstaendig lokal. Faellt das Internet aus, verstummt die Abstimmung
> und der Autopilot spielt einfach weiter. Kein Gast merkt es, ausser er wollte
> gerade abstimmen.

### Die Tabellen

| Tabelle | Wer schreibt | Wozu |
| --- | --- | --- |
| `sitzung` | du | eine Zeile pro Abend, alles andere haengt daran |
| `katalog` | Bruecke | die Bibliothek, damit Gaeste suchen koennen |
| `jetzt_laeuft` | Bruecke | was laeuft, was kommt, Zielenergie - die Gaesteanzeige |
| `wuensche` | Gaeste | ein Wunsch pro Zeile, mit Geraetekennung |
| `stimmen` | Gaeste | Hochwaehlen fremder Wuensche |
| `richtungen` | Gaeste | chilliger / haerter, eine gueltige Stimme pro Geraet |
| `eingang` | du (Admin) | YouTube-Links, die der PC abholt und verarbeitet |

Die Gaeste-App benutzt den oeffentlichen `anon`-Schluessel. Der darf in die App,
denn die Regeln stehen in der Datenbank: Row Level Security laesst Anonyme in
`wuensche`, `stimmen` und `richtungen` einfuegen und lesen, aber nichts
veraendern oder loeschen und nirgendwo sonst hin. `katalog` und `jetzt_laeuft`
sind fuer sie nur lesbar. `eingang` ist ueber ein Admin-Kennwort geschuetzt, das
nur du in der App eingibst.

Gegen Unfug: eine Geraetekennung im Browserspeicher, eine eindeutige Bedingung
auf `(wunsch, geraet)` und `(richtung, geraet)`, und eine Obergrenze offener
Wuensche pro Geraet. Das haelt keinen entschlossenen Angreifer auf - aber
entschlossene Angreifer sind auf dieser Party keine realistische Sorge, sondern
der Kumpel, der zwanzigmal auf denselben Knopf tippt.

### Der Weg eines Wunsches

1. Gast tippt in der App auf einen Track -> Zeile in `wuensche`
2. Supabase Realtime schiebt die Zeile an die Bruecke auf dem PC
3. Die Bruecke legt sie in den lokalen Zustand, die Auswahl bewertet sie mit
4. Kommt der Wunsch dran, meldet die Bruecke ihn in `jetzt_laeuft` zurueck
5. Die App des Gastes zeigt: laeuft gerade - dein Wunsch

Schritt 3 ist der Punkt, an dem die Demokratie eingehegt wird: ein Wunsch ist
eine gewichtete Stimme in der Bewertung, kein Befehl. Und hoechstens jeder
dritte Track ist ueberhaupt ein Wunsch.

## Was "klingt wie ein echter DJ" technisch bedeutet

Ein Crossfader allein macht keinen DJ. Vier Dinge trennen "zwei Lieder
uebereinander" von einem Uebergang, bei dem der Raum nicht merkt, dass gewechselt
wurde:

### 1. Phrasen, nicht nur Beats

Elektronische Musik ist in 8-, 16- und 32-Takt-Phrasen gebaut. Ein Uebergang,
der auf dem richtigen Beat aber mitten in der Phrase sitzt, klingt falsch, auch
wenn das Tempo exakt stimmt. Das ist der haeufigste Anfaengerfehler und der
groesste Hebel fuer Qualitaet.

Wir brauchen also nicht nur BPM, sondern: Downbeats (die Eins jedes Takts) und
daraus das Phrasenraster, verankert am ersten Downbeat.

### 2. Struktur kennen

Der Analyselauf markiert pro Track:

| Marke | Woran wir sie erkennen |
| --- | --- |
| Intro-Ende | erster Takt, in dem die Vollband-Energie den Median-Bereich erreicht |
| Breakdown | vier oder mehr Takte, in denen die Bassenergie deutlich unter den Median faellt |
| Drop | der Takt, in dem die Bassenergie nach einem Breakdown schlagartig zurueckkommt |
| Outro-Beginn | letzter Punkt, ab dem die Energie dauerhaft abfaellt |

Erst damit kann die Maschine so etwas entscheiden wie: "Der laufende Track ist
im Outro, der naechste hat in acht Takten seinen Drop - also lege ich den Drop
genau auf die Phrasengrenze und schneide den alten dort weg."

### 3. Mehrere Uebergangsarten statt einer

Die Engine waehlt nach Lage, nicht immer dasselbe:

| Art | Wann | Wie |
| --- | --- | --- |
| `blend32` | beide grooven, Energie aehnlich | 32 Takte ueberblenden, in der Mitte Bass tauschen |
| `drop_swap` | der Neue hat einen Drop, der Alte ist im Outro | Drop auf die Phrasengrenze legen, Alten dort hart wegnehmen |
| `filter_riser` | der Neue kommt aus einem Breakdown | Alten ueber 16 Takte hochpass-filtern, beim Drop loslassen |
| `echo_cut` | Energiewechsel oder Paarung passt nicht sauber | Alten ins Delay schicken, totschneiden, Neuer startet clean |
| `hard_cut` | Notfall | auf dem naechsten Downbeat umschalten |

`echo_cut` ist immer moeglich und klingt nach Absicht. Das ist der Rueckfall,
wenn nichts anderes greift - und der Grund, warum das System nie peinlich wird.

### 4. Bass gehoert immer nur einem

Zwei Bassdrums uebereinander sind Matsch. Bei jedem Uebergang laeuft ein
Bass-Tausch: der eingehende Track kommt mit gekapptem Tief, an der
Phrasengrenze wird getauscht. Das ist der Handgriff, den jeder DJ macht, und in
Web Audio sind es zwei Lowshelf-Filter.

## YouTube klingt gut genug – wenn man drei Dinge macht

Ein YouTube-Download ist nicht pauschal schlechter. Opus mit 130 kbit/s aus
einem sauberen Master haelt auf einer Party jedem Vergleich stand. Was wirklich
weh tut, ist etwas anderes, und alles davon ist messbar und behandelbar. Das
uebernimmt `einlesen/` – gebaut und gegen Testmaterial abgenommen
(`npm run klangpruefen`).

### 1. Lautheit angleichen – der groesste Gewinn

Uploads liegen zwischen -6 und -20 LUFS. Zwei Tracks mit 12 dB Unterschied
hintereinander ist der haesslichste Fehler, den ein DJ machen kann, und er
uebertoent jedes Codec-Artefakt bei weitem. Jeder Track wird nach EBU R128
gemessen und bekommt einen Verstaerkungswert mit, der ihn auf -9 LUFS bringt.

Gemessen an drei Testdateien: **11,9 dB Spanne vorher, 0,0 dB nachher.** Das ist
der Punkt, an dem der Abend "wie aus einem Guss" klingt – und er wirkt bei
gekauften Dateien genauso.

Der Wert wird nur mitgeschrieben, nicht in die Datei gerechnet. Beim Abspielen
legt ihn ein Verstaerkungsregler an; so kann nichts anschlagen und nichts ist
unumkehrbar.

### 2. Zweite Generation erkennen

Der Fall, der tatsaechlich hoerbar ist: Jemand hat vor Jahren eine 128er-MP3 bei
YouTube hochgeladen, und YouTube hat sie nochmal durch Opus geschickt. Zwei
Codecs hintereinander hoert man.

Erkennbar am Hoehenabfall – gemessen wird nicht der absolute Pegel, sondern das
Gefaelle *innerhalb* der Hoehen (13–14 kHz gegen 19–20 kHz). Eine unangetastete
Datei faellt dort um wenige dB ab, eine einmal umkodierte um dreissig und mehr.
Weil es ein Verhaeltnis ist, funktioniert die Messung unabhaengig davon, ob ein
Track hell oder dunkel abgemischt ist.

Am Testmaterial: sauber **-1 dB**, einmal durch 96k-MP3 gedreht **45 dB**. Die
Trennung ist so deutlich, dass die Schwelle nicht wackelt.

### 3. Schwaechere Aufnahmen dorthin, wo sie nicht auffallen

Und hier kommt der eigentliche Kniff: Schwaches Material wird nicht
aussortiert, sondern **eingeplant**. Um 21 Uhr bei halber Lautstaerke hoert man
einen 16-kHz-Abbruch, um zwei Uhr im vollen Raum niemand mehr.

Jede Note wird also auf eine Mindest-Zielenergie abgebildet:

| Note | laeuft ab Zielenergie |
| --- | --- |
| 0.90 | immer |
| 0.70 | 0.23 |
| 0.50 | 0.52 |
| 0.35 | 0.75 |

Ein dumpfer YouTube-Wunsch wird damit nicht abgelehnt – er wartet auf den
lauten Teil des Abends. Der Gast bekommt ihn, nur eben spaeter. Unter Note 0.35
kommt nichts mehr rein.

Ist nach Sperre und Klangschranke nichts mehr uebrig, faellt eine von beiden –
welche, haengt vom Raum ab. Im leisen Raum wird lieber wiederholt als gedumpft,
im lauten umgekehrt. Nachweisbar in `npm run pruefen`.

### Dazu noch

- **Ein Format fuer alles.** Alles wird zu FLAC, 44,1 kHz, stereo. Nicht weil
  das aus einer Opus-Quelle besser klaenge, sondern damit ab hier nichts mehr
  verloren geht und der Browser am Abend nie ueber einen Codec stolpert.
- **Die bessere Fassung gewinnt.** Kennung aus Interpret und Titel; kaufst du
  einen Track spaeter nach, ersetzt er die YouTube-Fassung von selbst.
- **Unbrauchbares kommt gar nicht rein:** kuerzer als 45 Sekunden, laenger als
  20 Minuten (Mix oder Endlosschleife), mono *und* uebersteuert.
- **Kopfraum im Mixer.** Der Summenausgang laeuft auf -6 dBFS mit Begrenzer,
  damit zwei Tracks im Uebergang nicht ineinander verzerren.

Bleibt eine Empfehlung, keine Bedingung: Wo du die Wahl hast, nimm gekaufte
Dateien (Bandcamp und Beatport liefern WAV oder FLAC) fuer das Rueckgrat des
Abends. YouTube ist dann fuer Wuensche und Luecken – und dank Punkt 1 bis 3
faellt der Unterschied nicht mehr in den Abend hinein.

## Was wir bewusst nicht bauen

- **Kein Time-Stretch.** Tempo angleichen wir ueber die Abspielgeschwindigkeit,
  das verschiebt die Tonhoehe mit. Genau das machen Plattenspieler auch. Wir
  begrenzen auf +/- 6 %, darueber klingt es nach Chipmunk - und halten die
  Tempo-Nachbarschaft bei der Auswahl eng genug, dass wir es selten brauchen.
- **Kein Stem-Splitting.** Vocals und Drums trennen (Demucs & Co.) klingt
  fantastisch und kostet eine eigene Woche. Naechstes Jahr.
- **Keine Streaming-Dienste.** Spotify und Apple Music geben keinen rohen Ton
  heraus, mit dem man mischen kann. Das ist keine Bequemlichkeitsfrage,
  sondern technisch dicht.

## Der Wochenplan

Reihenfolge nach Risiko, nicht nach Sichtbarkeit. Was den Abend killt, kommt
zuerst; das Aussehen zuletzt.

### Tag 1 - Material und Raster

Einlesepipeline (`yt-dlp` -> ffmpeg -> `musik/`) und der Analyselauf mit Tempo,
Downbeats und Phrasenraster.

**Abnahme:** Ein Skript legt ueber zehn Tracks einen Klick auf das erkannte
Raster und rendert das als MP3. Wer reinhoert, hoert entweder, dass es sitzt,
oder wo es verrutscht. Kein Zwischenergebnis auf Verdacht.

### Tag 2 - Zwei Decks, ein sauberer Uebergang

Web-Audio-Engine: zwei Decks, 3-Band-EQ, Filter, Delay. Genau eine
Uebergangsart (`blend32`) mit Bass-Tausch, phrasengenau geplant.

**Abnahme:** Zehn Uebergaenge am Stueck anhoeren. Nicht "laeuft durch" - klingen.

### Tag 3 - Struktur und die guten Uebergaenge

Drop-, Breakdown- und Outro-Erkennung im Analyselauf. Darauf `drop_swap`,
`filter_riser`, `echo_cut`. Auswahllogik gegen die Energiekurve.

**Abnahme:** Eine Stunde im Zeitraffer durchlaufen lassen, jeden Uebergang mit
Art und Grund protokollieren, die Liste durchgehen.

### Tag 4 - Stundenlang durchhalten

Das langweiligste und wichtigste Stueck Arbeit:

- Speicher: immer nur der laufende und der naechste Track dekodiert, alles
  andere sofort freigeben. Ein dekodierter Sechsminueter belegt rund 60 MB -
  ueber sechs Stunden ist das der Unterschied zwischen laeuft und stirbt.
- Wachhund: Ist der Ausgangspegel laenger als zwei Sekunden bei Null, obwohl
  etwas laufen sollte, wird der naechste Track hart gestartet. Stille ist der
  einzige echte Fehler.
- Nachschub: der naechste Track wird 60 Sekunden vorher geladen und analysiert.
- Live-Einlesen von YouTube im Hintergrundprozess.

**Abnahme:** Sechs Stunden Dauerlauf, Speicherverlauf mitschreiben, kein
Anstieg ueber die Zeit.

### Tag 5 - Die Gaeste

Supabase-Projekt, Schema, RLS-Regeln. Die Gaeste-App: suchen, wuenschen,
hochwaehlen, Richtung abstimmen, sehen was laeuft. Die Bruecke auf dem PC, die
Realtime abonniert und den Stand zurueckmeldet. Admin-Modus in derselben App,
damit du YouTube-Links vom Handy aus einwerfen kannst.

**Abnahme:** Drei Handys ueber Mobilfunk, nicht ueber das WLAN. Ein Wunsch geht
durch. Die Sperre "hoechstens jeder dritte Track" greift nachweisbar. Und der
harte Test: **Netzwerkkabel ziehen** - die Musik darf nicht stocken.

### Tag 6 - Sichtbar

Vollbild-Buehne: was laeuft, was kommt, die Wunschliste, der QR-Code, reagierende
Visuals. Der Avatar, der die echten Handgriffe der Engine mitmacht - Hand am
Crossfader, wenn wirklich gefadet wird.

Das steht bewusst hier hinten. Es ist der Teil, der am meisten Spass macht und
am wenigsten schadet, wenn er duenn bleibt.

### Tag 7 - Generalprobe

Auf dem echten Rechner, an der echten Anlage, ueber die echten Boxen, mit dem
echten Display. Lautstaerke, Ausgabegeraet, Standby aus, Browser im Vollbild,
WLAN-Reichweite fuer die Handys in dem Raum, in dem gefeiert wird.

Nicht am Vortag verschieben. Dieser Tag ist der Puffer.

## Was jetzt schon deine Entscheidung braucht

1. **Musik.** Das ist der kritische Pfad, nicht der Code. 150 bis 250 Tracks
   ueber die ganze Spannweite chillig bis hart. Je frueher die Bibliothek steht,
   desto mehr Uebergaenge kann ich vorher testen. Fang damit heute an.
2. **YouTube.** Gebaut und abgenommen, siehe oben – die Qualitaetsfrage ist
   geloest, nicht offen. Zu entscheiden bleibt nur das Rechtliche: Herunterladen
   widerspricht den Nutzungsbedingungen von YouTube. Fuer eine private Feier ist
   das deine Entscheidung.
3. **Der Rechner.** Betriebssystem und ob Chrome oder Firefox drauf ist - danach
   richte ich die Einrichtungsanleitung aus.
4. **Supabase.** Ein neues, leeres Projekt. Ich brauche die Projekt-URL und den
   `anon`-Schluessel; beides darf in die App und ist nicht geheim. Den
   `service_role`-Schluessel brauche ich **nicht** - die Bruecke kommt mit
   `anon` und passenden Regeln aus, und ein Schluessel, den niemand
   herumschickt, kann auch nicht auslaufen.
5. **Wo die Gaeste-App liegt.** Sie ist eine einzelne HTML-Datei ohne Bauschritt.
   Vercel, Netlify oder Supabase Storage - egal, Hauptsache eine kurze URL, die
   als QR-Code auf dem Display gut lesbar ist.
