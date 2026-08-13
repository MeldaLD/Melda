-- Die Tempo-Karte: je Abschnitt ein eigenes Tempo.
--
-- Bisher hatte ein Track ein bpm und ein raster, und daraus wurde das
-- Beatgitter linear hochgerechnet. Fuer einen Track stimmt das. Fuer einen
-- DJ-Mix von einer Stunde ist die Frage "welches Tempo hat diese Datei"
-- sinnlos: Da laufen zwanzig Stuecke hintereinander, jedes mit eigenem Tempo
-- und eigenem Beginn. Gemessen kam bei so einem Mix "128,01 BPM, Vertrauen 0
-- Prozent" heraus - und weil das Vertrauen unter der Schwelle lag, wurde er
-- als Flaeche behandelt und bekam gar keine Marken. Auf der Buehne hiess das:
-- eine Stunde Musik, zu der sich im Bild nichts bewegt.
--
-- Ein Eintrag je Abschnitt:
--
--   von, bis      Sekunden in der Datei
--   bpm, raster   wie beim Track, nur eben fuer dieses Stueck. raster ist
--                 eine absolute Zeit in der Datei, kein Versatz im Abschnitt.
--   vertrauen     0 bis 1
--   beatVersatz   Beatnummer, auf der das Raster dieses Abschnitts liegt
--
-- Der beatVersatz traegt die durchlaufende Beatzaehlung ueber die
-- Abschnittsgrenzen. Buehne und Mixer rechnen in Beatnummern, nicht in
-- Sekunden - die Farbwanderung, die Phrasengrenzen, die Marken. Mit dem
-- Versatz bleibt eine einzige Zaehlung ueber die ganze Stunde bestehen; nur
-- die Schrittweite aendert sich beim Uebergang. Er ist immer ein Vielfaches
-- von 32, also einer Phrase: So springt die Zaehlung nie rueckwaerts, und
-- Takt- wie Phrasengrenzen sitzen auf den Downbeats des neuen Abschnitts.
--
-- Leer heisst "keine Karte" - dann gelten bpm und raster der Zeile wie
-- bisher. Aufnahmen von vor dieser Migration rechnen damit unveraendert
-- weiter.

alter table dj_track
  add column if not exists abschnitte jsonb not null default '[]'::jsonb;

comment on column dj_track.abschnitte is
  'Tempo-Karte: je Abschnitt {von, bis, bpm, raster, vertrauen, beatVersatz}. Leer = ein Tempo fuer die ganze Datei, siehe bpm/raster.';
