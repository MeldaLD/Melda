# Loopsystem

Arbeitsteilung beim Bauen: das starke Modell plant und prueft, ein guenstiger
Subagent tippt. Nach dem Guide "Das Claude-Loopsystem" (@GPTMarlon, Juli 2026),
geprueft gegen die offizielle Dokumentation am 11.08.2026.

## Aufbau

Steht schon: [`.claude/agents/executor.md`](./.claude/agents/executor.md) mit
`model: haiku`. Mehr braucht es nicht – der Rest sind Prompts.

## Die zwei Prompts

**Arbeiten:**

```
Schreib zuerst einen detaillierten Plan fuer: [AUFGABE].
Bau in dieser Phase noch nichts. Wenn der Plan steht, uebergib ihn Schritt fuer
Schritt an den executor-Subagent. Pruef nach jedem Schritt selbst das Ergebnis
gegen den Plan. Wenn etwas fehlt, schick den executor mit konkreten
Korrekturanweisungen noch einmal los. Meld dich erst zurueck, wenn alles dem
Plan entspricht.
```

**Durchlaufen lassen:**

```
/goal Alle Schritte aus dem Plan sind umgesetzt und geprueft. Es gibt keine
offenen Korrekturanweisungen mehr, und es wurden nur die im Plan genannten
Dateien veraendert.
```

`/goal` ohne Text zeigt den Stand, `/goal clear` stoppt.

## Was am Guide stimmt

Die Mechanik ist korrekt und aktuell:

- `.claude/agents/*.md` mit `model: haiku` ist der richtige Weg. `haiku` ist ein
  gueltiger Alias neben `sonnet`, `opus`, `fable`, vollen Modell-IDs und
  `inherit` (Standard).
- `/goal` gibt es wirklich, mit `clear`/`stop`/`off`/`reset`/`cancel` zum
  Abbrechen.
- Die Versionshuerde ist laengst genommen: der Guide nennt 2.1.139, aktuell
  laeuft hier 2.1.227.

## Was am Guide nicht mehr stimmt

**`/agents` oeffnet keinen Anlage-Assistenten mehr.** Seit v2.1.198 druckt der
Befehl nur noch einen Hinweis, man moege Claude fragen oder die Datei selbst
schreiben. Der Guide-Tipp mit dem Menue und der Rueckfrage "Projekt- oder
Nutzerebene?" laeuft ins Leere. Die Datei anlegen zu lassen funktioniert
weiterhin – das ist ohnehin der Weg, den der Guide als Hauptweg beschreibt.

## Wann sich die Delegation wirklich lohnt

Hier weicht die Erfahrung vom Guide ab, und zwar in beide Richtungen.

Der Guide rechnet so: Fleissarbeit auf Haiku kostet einen Bruchteil, also spart
man. Die Rechnung uebersieht, was die Delegation selbst kostet. **Ein Subagent
startet kalt.** Er hat den bisherigen Verlauf nicht, kennt die Dateien nicht und
liest sie neu ein. Das Hauptgespraech dagegen liegt im Prompt-Cache und ist beim
naechsten Zug fast geschenkt. Fuer eine kleine, eng verzahnte Aenderung zahlst
du also dreifach: den ausformulierten Plan, das Neu-Einlesen durch den Executor,
und das Gegenlesen des Ergebnisses. Selbst machen waere billiger *und* besser
gewesen.

Die Faustregel, die daraus folgt:

| Delegieren | Selbst machen |
| --- | --- |
| viel Lesen, wenig Entscheiden | viel Entscheiden, wenig Tippen |
| das Ergebnis ist praezise beschreibbar | "muss sich gut anfuehlen" |
| Details braucht man danach nicht mehr | es haengt am restlichen Gespraech |
| Serien: 20 Varianten, 40 Dateien | eine Datei, drei Zeilen |

Konkret in diesem Projekt:

- **Gut delegierbar:** QR-Code-Generator ohne Fremdpakete, `yt-dlp`-Aufrufe und
  Fehlerbehandlung, die Supabase-Client-Schicht, Testfaelle fuer die
  Auswahl-Bewertung, CSS-Varianten fuer die Buehne, das Einlesen von
  ID3-Metadaten.
- **Nicht delegieren:** die Mixing-Engine. Wann ein Uebergang gut klingt, ist
  eine Geschmacks- und Timingfrage mit einem Dutzend zusammenhaengender
  Entscheidungen. Ein Executor nach Plan produziert dort Code, der laeuft und
  schlecht klingt – und das faellt erst beim Hoeren auf, nicht beim Gegenlesen.

Der Nebeneffekt, den der Guide erwaehnt, ist dagegen den vollen Preis wert: Weil
der Executor in einem eigenen Kontextfenster arbeitet, bleibt das Hauptgespraech
sauber. Bei einem Projekt ueber mehrere Tage ist das mehr wert als die
gesparten Tokens.

## Die Warnung ernst nehmen

Der Guide sagt es selbst und es stimmt: **ein Loop ist ein Gaspedal, keine
Bremse.** Ein `/goal` mit schwammiger Bedingung dreht Runden, bis das Limit weg
ist. Die Bedingung muss aus der Ausgabe selbst pruefbar sein – "alle Tests
gruen" geht, "klingt gut" nicht. Fuer alles Klangliche gibt es keinen
automatischen Abschluss; da ist der Mensch mit Kopfhoerern die Abnahme.
