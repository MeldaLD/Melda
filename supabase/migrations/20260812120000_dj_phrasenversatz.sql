-- Auf welchem Takt eine Achttaktphrase beginnt.
--
-- Das Raster kennt nur Beats und die Eins eines Taktes. Wo die musikalische
-- Phrase anfaengt, steht darin nicht - und genau daran haengt, ob ein
-- Uebergang beatgenau *und* an der richtigen Stelle sitzt. Ohne diesen Wert
-- kann ein Mix sauber beatgematcht sein und sich trotzdem falsch anfuehlen,
-- weil er mitten in der Phrase ansetzt.
--
-- Abgelesen wird er aus den Abschnittsgrenzen, die die Neuheitskurve findet:
-- Die liegen in elektronischer Musik fast immer auf Achttaktgrenzen.

alter table dj_track
  add column if not exists phrasen_versatz smallint not null default 0;

comment on column dj_track.phrasen_versatz is
  'Takt, auf dem eine Achttaktphrase beginnt (0 bis 7). Aus den Abschnittsgrenzen abgelesen, nicht aus dem Raster.';
