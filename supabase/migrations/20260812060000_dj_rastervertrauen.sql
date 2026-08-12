-- Wie sehr ist dem gemessenen Tempo zu trauen?
--
-- Der Anlass war eine Feldaufnahme mit Meeresrauschen. Die Tempoerkennung
-- meldete pflichtbewusst 161,29 BPM - eine Zahl, die sich in nichts von einem
-- echten Tempo unterscheidet, sobald sie einmal in der Tabelle steht. Der
-- Mixer haette darauf gemischt, und niemand haette den Zusammenhang zwischen
-- "klingt schlecht" und dieser Zeile je gefunden.
--
-- Deshalb steht jetzt neben jedem Tempo, wie belastbar es ist. Ist es das
-- nicht, mischt der DJ nicht darauf, sondern setzt sein eigenes Schlagwerk
-- darunter - das ist ohnehin das, was ein Mensch mit so einem Stueck taete.

alter table dj_track
  add column if not exists bpm_vertrauen real not null default 1,
  add column if not exists ohne_raster boolean not null default false;

comment on column dj_track.bpm_vertrauen is
  'Wie belastbar Tempo und Raster sind, 0 bis 1. Aus zwei Massen: wie weit sich der Puls in der Autokorrelation abhebt, und wie viel Anschlagsenergie das gefundene Raster gegenueber einem zufaellig verschobenen einsammelt.';
comment on column dj_track.ohne_raster is
  'true = kein brauchbares Raster. Der Track wird nicht beatgematcht, sondern als Flaeche unter dem eigenen Schlagwerk benutzt.';

-- Bestandsaufnahmen wurden ohne dieses Mass vermessen. Der Vorgabewert 1
-- laesst sie unveraendert laufen; wer sie neu hochlaedt, bekommt den echten
-- Wert. Alles andere waere geraten.
