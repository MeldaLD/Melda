# resident-dj

Ein automatischer DJ, der einen Abend allein durchtraegt: phrasengenau gemischt,
mit einer Energiekurve von chillig bis hart, und mit Gaesten, die per Handy
mitreden duerfen, ohne den Abend zu zerlegen.

Erster Einsatz: ein 30. Geburtstag. Ein PC, ein Display, eine Anlage.

> **Stand: Geruest.** Der Server, die Auswahllogik und die Oberflaechen stehen.
> Die Mixing-Engine, der Analyselauf und die Supabase-Bruecke werden diese Woche
> gebaut. Der Fahrplan steht in **[PLAN.md](./PLAN.md)** – dort steht auch, warum
> welche Entscheidung so gefallen ist.

## Der Aufbau in einem Bild

```
VORHER (einmal, braucht Python + ffmpeg + yt-dlp)
  YouTube-Link oder Datei  ->  musik/  ->  Analyse  ->  bibliothek.json
                                            Tempo, Beatraster, Downbeats,
                                            Tonart, Drops, Energie

ABENDS (nur Node + Browser, alles lokal)
  server/   Bibliothek, Auswahl, Zustand        <- kein Internet noetig
  buehne/   zwei Decks, EQ, Filter, Echo        <- hier klingt die Musik
  bruecke/  Abgleich mit Supabase               <- darf ausfallen

GAESTE
  gast/     kleine HTML-App  <->  Supabase  <->  bruecke
```

Die Trennung ist Absicht: **die Musik haengt nie am Internet.** Faellt das Netz
aus, verstummt nur die Abstimmung, und der Autopilot spielt weiter.

## Zwei Betriebsarten

Die Buehne laeuft **mit und ohne Server** – dieselbe Seite, dieselbe
Auswahllogik, derselbe Mixer.

| | |
| --- | --- |
| **Alleinbetrieb** | Reine statische Seite. Kein Server, keine Installation. Der Pruefstand erzeugt seine Musik im Browser, die Auswahl laeuft mit. Damit funktioniert das auf Vercel, auf einem iPad, ohne Netz. |
| **Serverbetrieb** | Wie am Partyabend: eigene Bibliothek aus `musik/`, Gaestewuensche, Abstimmung, mehrere Geraete auf demselben Stand. |

Die Seite sucht beim Start selbst nach einem Server und schaltet um. Deshalb
liegen `auswahl.js` und `zustand.js` in `public/gemeinsam/` und nicht im
Server: **Was du im Alleinbetrieb hoerst, entscheidet am Partyabend derselbe
Code.**

### Ins Netz stellen (Alleinbetrieb)

`vercel.json` liegt bei. Kein Bauschritt, keine Abhaengigkeiten – Vercel
serviert einfach `public/`. Damit ist die Mischmaschine von jedem Geraet aus
erreichbar, auch ohne Rechner.

## Lokal – in 30 Sekunden hoerbar

```bash
npm start
```

Dann `http://localhost:3000/buehne` oeffnen und **Pruefstand starten**.

Der Pruefstand erzeugt acht Tracks im Browser – von chillig bis hart, mit
Intro, Breakdown, Drop und Outro – und legt sofort damit auf. Du brauchst dafuer
keine einzige eigene Datei. Es klingt nach Testmusik und soll das auch: Der
Punkt ist, die *Uebergaenge* zu hoeren und zu sehen, nicht die Musik.

Was du dabei ausprobieren kannst:

| | |
| --- | --- |
| **Leertaste** | jetzt ueberblenden |
| **1 2 3 4** | Uebergangsart erzwingen: Blende · Aufzug · Echo · Schnitt |
| **Energieregler** | den Abend vorspulen, von chillig bis Brett |
| **Lautheitsangleich** | aus- und wieder einschalten – der Unterschied ist der Punkt |

Der Uebergang startet nicht sofort, sondern auf der naechsten Phrasengrenze;
die Anzeige zaehlt herunter. Genau das ist der Unterschied zwischen
"uebereinandergelegt" und "gemischt".

### Alles nachpruefen

```bash
npm run pruefen        # Auswahl-Logik und Timing-Mathematik
npm run klangpruefen   # Klangmessung (braucht ffmpeg)
npm run mischpruefen   # Mischmaschine im echten Browser (braucht npm install)
```

Der Betrieb selbst hat **keine Abhaengigkeiten** und keinen Bauschritt – Node 20
reicht. `npm install` braucht nur die Browser-Abnahme.

## Material hereinholen

```bash
npm run einlesen -- "https://www.youtube.com/watch?v=…"
npm run einlesen -- --ordner ~/Musik/Techno
```

Braucht `ffmpeg` und `yt-dlp` – aber nur hier, nicht am Partyabend.

Jeder Track wird dabei gemessen und bekommt eine Note. Der wichtigste Schritt
ist der **Lautheitsangleich**: Uploads liegen zwischen -6 und -20 LUFS, und zwei
Tracks mit 12 dB Unterschied hintereinander sind haesslicher als jedes
Codec-Artefakt. Am Testmaterial: 11,9 dB Spanne vorher, 0,0 dB nachher.

Schwaechere Aufnahmen werden nicht aussortiert, sondern eingeplant – sie laufen
erst, wenn der Raum laut genug ist, dass es niemandem auffaellt. Ein dumpfer
YouTube-Wunsch wird also nicht abgelehnt, er wartet. Details in
[PLAN.md](./PLAN.md).

| Adresse | Wofuer |
| --- | --- |
| `/buehne` | Das Fenster fuer den Monitor |
| `/p` | Notfall-Abstimmung im lokalen WLAN |
| `/` | Uebersicht |

Musik gehoert nach `musik/` (wird nicht mit eingecheckt). Solange die
Bibliothek leer ist, laeuft der Server, hat aber nichts zu spielen.

## Was du einstellst

Alles Einstellbare steht in **[`konfiguration.js`](./konfiguration.js)**, in einer
Datei, damit du am Abend nicht im Code suchst:

- **Die Energiekurve** – Uhrzeit zu Zielenergie. Das Rueckgrat des Abends.
- **Wie stark die Gaeste sie verbiegen duerfen** (`stimmenEinfluss`, Standard
  ±0.15). Der Abend bleibt in deiner Hand, aber die Gaeste merken ihren Einfluss.
- **Uebergangslaenge und Tempotoleranz.**
- **Wie oft ein Gaestewunsch drankommt** (Standard: hoechstens jeder dritte
  Track). Ohne diese Bremse zerlegt der erste Gast mit Handy den Abend.

## Verzeichnisse

| Ort | Inhalt |
| --- | --- |
| `konfiguration.js` | alles Einstellbare, plus die Energiekurve |
| `einlesen/einlesen.mjs` | YouTube und Dateien hereinholen, messen, vereinheitlichen |
| `einlesen/qualitaet.mjs` | Lautheit, Hoehenabfall, Mono, Uebersteuerung |
| `server/index.js` | HTTP, SSE, API – ohne Fremdpakete |
| `server/auswahl.js` | wer als naechstes drankommt (der DJ-Kopf) |
| `server/zustand.js` | Wuensche, Richtungsstimmen, Zielenergie |
| `pruefungen/` | Abnahmen, die man ausfuehren statt glauben kann |
| `supabase/schema.sql` | Tabellen und Rechte fuer die Gaeste-App |
| `public/buehne/` | die Monitoransicht |
| `public/telefon/` | Notfall-Abstimmung |
| `musik/` | deine Dateien (nicht im Repo) |

## Mitentwickeln

Dieses Projekt benutzt ein Loopsystem: das starke Modell plant und prueft, ein
guenstiger Subagent setzt um. Aufbau und – wichtiger – wann sich das lohnt und
wann nicht, steht in **[LOOPSYSTEM.md](./LOOPSYSTEM.md)**.
