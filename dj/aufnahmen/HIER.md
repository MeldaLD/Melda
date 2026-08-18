# Hier kommen die Aufnahmen rein

Je Take ein Ordner, benannt wie die Musikdatei:

```
dj/aufnahmen/
  01-grundgroove/
    01-grundgroove.bvh                 <- das Wichtigste
    01-grundgroove(includeTPose).bvh   <- die T-Pose-Fassung, wenn dabei
    01-grundgroove.mp4                 <- die Vorschau von DeepMotion
    original.mp4                       <- euer Video, mit Ton (wenn klein genug)
  02-welle/
  ...
```

Der Name des Ordners zaehlt, die Dateinamen darin nicht - das Werkzeug sucht
sich die BVH selbst und nimmt ausdruecklich *nicht* die mit `TPose` im Namen.

## Was das Werkzeug daraus macht

```
npm run dj:aufnahme dj/aufnahmen/01-grundgroove
```

Es liest, misst und meldet alles, was ich ueber die Aufnahme wissen muss -
Gelenknamen, Tipper, Tempo, Spiegelung, Naht, Verkuerzung. Was dabei schief
sein kann, steht in `../BEWEGUNGSPLAN.md` unter R1 bis R8.

## Zur Groesse

BVH und die kurze Vorschau sind klein genug fuers Verzeichnis. Das
Originalvideo kann leicht hundert Megabyte haben - wenn es zu gross ist,
lieber auf die Sekunden des Takes schneiden oder ganz weglassen. Es ist der
*Rueckfall* fuer den Fall, dass die Tipper im Solve nicht ankommen, nicht der
Hauptweg.
