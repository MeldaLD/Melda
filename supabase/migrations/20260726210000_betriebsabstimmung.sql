-- ---------------------------------------------------------------------------
-- Direkte Abstimmung mit den Handwerksbetrieben
--
-- Bisher endete unsere Arbeit an der Wohnungstür der Verwaltung: Der
-- Assistent bereitete den Auftrag vor, ein Mitarbeitender griff zum Hörer.
-- Der eigentliche Zeitfresser sitzt aber danach – das Hin und Her, bis
-- Betrieb und Mieter denselben Termin haben.
--
-- Deshalb: Betriebe, die zustimmen, geben uns ihre Erreichbarkeit und ihre
-- Arbeitszeiten. Dann übernimmt der Assistent die Abstimmung und legt der
-- Verwaltung nur noch das Ergebnis zur Bestätigung vor.
--
-- Wichtig ist die Zustimmung: Ein Handwerksbetrieb, dem ungefragt Nachrichten
-- eines fremden Systems ins Postfach laufen, ist als Partner verloren. Die
-- Vorgabe ist deshalb "aus", und das Umschalten ist eine bewusste Handlung
-- der Verwaltung, die den Betrieb vorher gefragt hat.
-- ---------------------------------------------------------------------------

alter table handwerker
  -- Kontaktdaten, über die wir den Betrieb erreichen
  add column if not exists ansprechpartner text,
  add column if not exists email text,
  -- Über welchen Weg der Betrieb angesprochen werden möchte
  add column if not exists kontakt_kanal kanal not null default 'email',
  -- Hat der Betrieb der direkten Abstimmung zugestimmt?
  add column if not exists abstimmung_erlaubt boolean not null default false,
  -- Wann der Betrieb üblicherweise arbeitet, z. B. "Mo–Do 7–16, Fr 7–13 Uhr".
  -- Freitext statt Kalender: Ein echter Kalenderabgleich braucht eine
  -- Schnittstelle in deren System, und die gibt es in diesem Marktsegment
  -- praktisch nie. Der Freitext ist das, was am Telefon ohnehin gesagt wird.
  add column if not exists arbeitszeiten text;

comment on column handwerker.abstimmung_erlaubt is
  'Betrieb hat zugestimmt, dass der Assistent Termine direkt mit ihm abstimmt.';
comment on column handwerker.arbeitszeiten is
  'Übliche Arbeitszeiten als Freitext – Grundlage der Terminvorschläge.';

-- Nachrichten an und von Handwerksbetrieben hängen an keiner Wohnung. Damit
-- der Verlauf eines Vorgangs sie trotzdem einordnen kann, wird festgehalten,
-- mit welchem Betrieb gesprochen wurde.
alter table nachrichten
  add column if not exists handwerker_id uuid references handwerker(id) on delete set null;

comment on column nachrichten.handwerker_id is
  'Gesetzt bei Nachrichten an oder von einem Handwerksbetrieb.';

create index if not exists nachrichten_handwerker
  on nachrichten (handwerker_id, gesendet_am)
  where handwerker_id is not null;
