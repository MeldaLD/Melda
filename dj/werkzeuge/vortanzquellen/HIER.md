# Woher diese beiden Dateien kommen

`maschine.js` und `stimmen.js` waren einmal Teil der Buehne: ein
synthetisches Technoschlagwerk mit Kick, Klatsch, Hi-Hats, einer
Bassrumpelwolke und Stichen, dazu ein Arrangement ueber 32 Takte mit einem
echten Sog vor dem Drop. Ausgebaut wurden sie in `5a3df2f`, weil die Buehne
seither echte Musik mischt und kein eigenes Schlagwerk mehr braucht.

Hier liegen sie wieder, aber **nicht als Teil des Produkts** - sie werden von
keinem Modul der Buehne importiert und landen in keiner gebauten Datei. Sie
sind Werkzeug: `werkzeuge/vortanzmusik.mjs` rendert daraus die Referenzmusik,
zu der die Bewegungen aufgenommen werden.

Wer sie aendert, aendert die Musik, zu der eventuell schon getanzt wurde. Dann
stimmen die aufgenommenen Bewegungen nicht mehr zum Raster. Im Zweifel eine
neue Datei danebenlegen statt diese anzufassen.
