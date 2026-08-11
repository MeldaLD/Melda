-- Der automatische DJ: Bibliothek, Gaestewuensche, laufender Stand.
--
-- Alles mit Praefix dj_, damit auf einen Blick klar ist, dass es mit der
-- Hausverwaltungs-Demo nichts zu tun hat und getrennt weggeraeumt werden kann.
--
-- Leitgedanke bei den Rechten: Gaeste duerfen lesen und in genau drei Tabellen
-- einfuegen, sonst nichts. Kein UPDATE, kein DELETE, nirgends. Die Bibliothek
-- fuellt ausschliesslich der Admin ueber Route Handler mit Service-Role.

-- --------------------------------------------------------------------------
-- Bibliothek
-- --------------------------------------------------------------------------

create table if not exists dj_track (
  id            text primary key,
  titel         text not null,
  interpret     text not null default '',
  -- Pfad im Storage-Bucket dj-musik.
  datei         text not null,
  dauer         real,
  -- Alles, was die Analyse im Browser herausgefunden hat.
  bpm           real,
  raster        real not null default 0,
  einstieg_beat integer not null default 0,
  energie       real not null default 0.5,
  lufs          real,
  angleich_db   real not null default 0,
  note          real not null default 1,
  marken        jsonb not null default '[]'::jsonb,
  erstellt      timestamptz not null default now()
);

comment on column dj_track.raster is
  'Sekunden bis zum ersten Downbeat. Daran haengt jeder Uebergang.';
comment on column dj_track.angleich_db is
  'Verstaerkung, die den Track auf -9 LUFS bringt. Wird beim Abspielen angelegt, nicht in die Datei gerechnet.';
comment on column dj_track.energie is
  'Rang innerhalb der Bibliothek, 0 bis 1 - nicht absolut. So funktioniert die Energiekurve in jeder Sammlung.';

-- --------------------------------------------------------------------------
-- Gaestebeteiligung
-- --------------------------------------------------------------------------

-- Ein Wunsch pro Track. Wuenscht sich ein zweiter Gast denselben, wird daraus
-- eine Stimme - deshalb die eindeutige Bedingung.
create table if not exists dj_wunsch (
  id       uuid primary key default gen_random_uuid(),
  track_id text not null references dj_track (id) on delete cascade,
  geraet   text not null,
  erstellt timestamptz not null default now(),
  unique (track_id)
);

create table if not exists dj_stimme (
  wunsch_id uuid not null references dj_wunsch (id) on delete cascade,
  geraet    text not null,
  erstellt  timestamptz not null default now(),
  primary key (wunsch_id, geraet)
);

-- Insert-only: pro Geraet zaehlt die juengste Zeile im Zeitfenster, aeltere
-- verfallen von selbst. Das spart ein UPDATE-Recht fuer Anonyme.
create table if not exists dj_richtung (
  id       uuid primary key default gen_random_uuid(),
  geraet   text not null,
  richtung text not null check (richtung in ('chilliger', 'haerter')),
  erstellt timestamptz not null default now()
);

create index if not exists dj_richtung_zeit on dj_richtung (erstellt desc);

-- Was gerade laeuft. Genau eine Zeile, die Buehne haelt sie aktuell.
create table if not exists dj_laeuft (
  id                  integer primary key default 1 check (id = 1),
  track_id            text,
  titel               text,
  interpret           text,
  begonnen            timestamptz,
  dauer               real,
  naechster_titel     text,
  naechster_interpret text,
  zielenergie         real,
  aktualisiert        timestamptz not null default now()
);

insert into dj_laeuft (id) values (1) on conflict (id) do nothing;

-- --------------------------------------------------------------------------
-- Obergrenze offener Wuensche pro Geraet
-- --------------------------------------------------------------------------
-- In der Datenbank statt in der App: die App kann jeder umgehen, der die
-- Entwicklerkonsole findet.

create or replace function dj_wunsch_grenze() returns trigger
language plpgsql as $$
declare
  offen integer;
begin
  select count(*) into offen from dj_wunsch where geraet = new.geraet;
  if offen >= 2 then
    raise exception 'Du hast schon zwei Wuensche offen.';
  end if;
  return new;
end;
$$;

drop trigger if exists dj_wunsch_grenze_pruefen on dj_wunsch;
create trigger dj_wunsch_grenze_pruefen
  before insert on dj_wunsch
  for each row execute function dj_wunsch_grenze();

-- --------------------------------------------------------------------------
-- Rechte
-- --------------------------------------------------------------------------

alter table dj_track    enable row level security;
alter table dj_wunsch   enable row level security;
alter table dj_stimme   enable row level security;
alter table dj_richtung enable row level security;
alter table dj_laeuft   enable row level security;

drop policy if exists dj_track_lesen on dj_track;
create policy dj_track_lesen on dj_track for select using (true);

drop policy if exists dj_laeuft_lesen on dj_laeuft;
create policy dj_laeuft_lesen on dj_laeuft for select using (true);

drop policy if exists dj_wunsch_lesen on dj_wunsch;
create policy dj_wunsch_lesen on dj_wunsch for select using (true);
drop policy if exists dj_wunsch_anlegen on dj_wunsch;
create policy dj_wunsch_anlegen on dj_wunsch for insert with check (true);

drop policy if exists dj_stimme_lesen on dj_stimme;
create policy dj_stimme_lesen on dj_stimme for select using (true);
drop policy if exists dj_stimme_anlegen on dj_stimme;
create policy dj_stimme_anlegen on dj_stimme for insert with check (true);

drop policy if exists dj_richtung_lesen on dj_richtung;
create policy dj_richtung_lesen on dj_richtung for select using (true);
drop policy if exists dj_richtung_anlegen on dj_richtung;
create policy dj_richtung_anlegen on dj_richtung for insert with check (true);

-- dj_track und dj_laeuft bekommen bewusst keine Schreibrechte fuer Anonyme.
-- Beides fuellt der Admin ueber Route Handler mit Service-Role.

-- --------------------------------------------------------------------------
-- Speicher fuer die Musik
-- --------------------------------------------------------------------------
--
-- Der Bucket ist oeffentlich lesbar. Das ist eine bewusste Abwaegung: Signierte
-- Links laufen ab, und eine Adresse, die mitten in der Nacht mitten im Set
-- ungueltig wird, ist ein Ausfallgrund, den man sich nicht einbaut. Die
-- Dateinamen sind nicht zu erraten, hochladen darf nur der Admin.

insert into storage.buckets (id, name, public, file_size_limit)
values ('dj-musik', 'dj-musik', true, 52428800)
on conflict (id) do update
  set public = true, file_size_limit = 52428800;

drop policy if exists dj_musik_lesen on storage.objects;
create policy dj_musik_lesen on storage.objects
  for select using (bucket_id = 'dj-musik');

-- Hochladen laeuft ueber eine signierte Adresse, die der Server mit
-- Service-Role erzeugt. Deshalb hier kein INSERT-Recht fuer Anonyme.
