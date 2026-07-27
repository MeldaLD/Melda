-- Wer Termine vorschlägt: der Betrieb, nicht wir.
--
-- Bisher wählte der Mieter im Chat aus drei konkreten Zeitfenstern, die wir
-- selbst erzeugt hatten – aus Werktagen und Öffnungszeiten gerechnet, ohne
-- dass irgendjemand den Betrieb gefragt hätte. So läuft es in der Praxis
-- nicht: Handwerksbetriebe sind ausgelastet und nennen ihrerseits die
-- Zeitpunkte, an denen sie können. Der Mieter entscheidet danach, ob einer
-- davon passt.
--
-- Vom Mieter brauchen wir deshalb nur eines, und zwar früh: wann er
-- grundsätzlich erreichbar ist. Das geben wir dem Betrieb mit, damit er
-- Fenster vorschlägt, die überhaupt in Frage kommen.

alter table vorgaenge
  add column if not exists erreichbarkeit text;

comment on column vorgaenge.erreichbarkeit is
  'Grobe Erreichbarkeit des Mieters aus dem Chat: vormittag | nachmittag | egal. '
  'Kein Termin und keine Zusage – nur eine Angabe für den Betrieb.';

-- Die beiden Spalten hielten den "Wunschtermin" des Mieters, den es so nicht
-- mehr gibt. Stehen zu lassen hieße, die Verwechslung zu konservieren.
alter table terminanfragen
  drop column if exists wunsch_beginn,
  drop column if exists wunsch_ende;
