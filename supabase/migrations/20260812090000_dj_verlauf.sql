-- Der Verlauf eines Tracks ueber die Zeit.
--
-- Ein einziger Energiewert je Track sagt nur, welcher Track als naechstes
-- dran ist. Fuer einen Uebergang ist das die falsche Frage: Dort geht es
-- darum, an *welcher Stelle* man einen Track verlaesst und an welcher man in
-- den naechsten einsteigt. Ein Stueck mit zwei Minuten Ambient-Intro hat
-- denselben Mittelwert wie eines, das sofort losgeht - und wer es spaet am
-- Abend von vorne anspielt, leert die Tanzflaeche.
--
-- Darum je Takt vier Zahlen: Energie, Bassanteil, Hoehenanteil, Anschlaege je
-- Beat. Ein Sechsminueter hat rund 190 Takte, das sind wenige Kilobyte.

alter table dj_track
  add column if not exists profil jsonb not null default '[]'::jsonb;

comment on column dj_track.profil is
  'Verlauf je Takt: [{e,b,h,d}, …] - Energie, Bassanteil, Hoehenanteil, Anschlaege je Beat. Daran haengt, wo ein Uebergang ansetzt und wo er landet.';
