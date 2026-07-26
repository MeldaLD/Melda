# Demo-Fotos

Hier gehören die Bilder hin, die im Chat als Beispielaufnahmen erscheinen.

**Solange hier nichts liegt, funktioniert die Demo trotzdem.** Statt eines
kaputten Bildsymbols zeigt die Oberfläche einen beschrifteten Platzhalter
(siehe `src/components/chat/DemoFoto.tsx`). Sobald eine Datei mit dem
passenden Namen abgelegt wird, erscheint sie automatisch – ohne Codeänderung.

## Welche Dateien gebraucht werden

Die Dateinamen stehen in `config/scenarios.ts`, je Szenario:

- `foto` – das Hauptbild, erscheint als Kachel im Foto-Dialog
- `zweitfoto.optionen` – die drei Bilder, die als zweite Aufnahme zur Auswahl
  stehen; eines davon ist unter `zweitfoto.korrekt` als das passende markiert

Vollständige Liste ausgeben:

```bash
node -e "const {szenarien}=require('tsx/cjs').require('./config/scenarios.ts',__filename); \
  console.log([...new Set(szenarien.flatMap(s=>[s.foto,...s.zweitfoto.optionen]))].sort().join('\n'))"
```

## Anforderungen an die Bilder

- Querformat, mindestens 800 × 600 Pixel, als JPEG
- unter 200 kB je Datei, sonst leidet die Ladezeit
- keine erkennbaren Personen, keine Hausnummern, keine Namensschilder
- keine echten Schadensfotos aus Kundenobjekten

**Vor dem ersten Kundenversand müssen die echten Bilder hier liegen.** Ein
Interessent, der Platzhalter sieht, glaubt die Bilderkennung nicht – und
genau die ist das Verkaufsargument.
