-- Schema fuer den Draht zwischen Gaesten und DJ.
--
-- Leitgedanke der Rechte: Anonyme duerfen lesen und einfuegen, sonst nichts.
-- Kein UPDATE, kein DELETE, nirgends. Das kostet uns eine Kleinigkeit an
-- Eleganz (Richtungsstimmen werden nicht ueberschrieben, sondern neu
-- eingefuegt, und es zaehlt die letzte), spart aber die ganze Klasse von
-- Angriffen, bei der jemand fremde Zeilen anfasst.

create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- Tabellen
-- --------------------------------------------------------------------------

-- Ein Abend. Alles haengt hieran, damit ein Testlauf die echte Party nicht
-- verschmutzt.
create table if not exists sitzung (
  id         uuid primary key default gen_random_uuid(),
  anlass     text not null,
  aktiv      boolean not null default true,
  gestartet  timestamptz not null default now()
);

-- Die Bibliothek, damit die Gaeste suchen koennen. Schreibt die Bruecke.
create table if not exists katalog (
  sitzung_id uuid not null references sitzung on delete cascade,
  track_id   text not null,
  titel      text not null,
  interpret  text not null default '',
  bpm        real,
  energie    real,
  dauer      real,
  primary key (sitzung_id, track_id)
);

-- Was gerade laeuft. Genau eine Zeile pro Sitzung, die Bruecke haelt sie aktuell.
create table if not exists jetzt_laeuft (
  sitzung_id          uuid primary key references sitzung on delete cascade,
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

-- Ein Wunsch pro Track. Wuenscht sich ein zweiter Gast denselben Track, wird
-- daraus eine Stimme - deshalb die eindeutige Bedingung.
create table if not exists wuensche (
  id         uuid primary key default gen_random_uuid(),
  sitzung_id uuid not null references sitzung on delete cascade,
  track_id   text not null,
  geraet     text not null,
  erstellt   timestamptz not null default now(),
  unique (sitzung_id, track_id)
);

create table if not exists stimmen (
  wunsch_id uuid not null references wuensche on delete cascade,
  geraet    text not null,
  erstellt  timestamptz not null default now(),
  primary key (wunsch_id, geraet)
);

-- Richtungsstimmen. Insert-only: pro Geraet zaehlt die juengste Zeile im
-- Zeitfenster, aeltere verfallen von selbst.
create table if not exists richtungen (
  id         uuid primary key default gen_random_uuid(),
  sitzung_id uuid not null references sitzung on delete cascade,
  geraet     text not null,
  richtung   text not null check (richtung in ('chilliger', 'haerter')),
  erstellt   timestamptz not null default now()
);

create index if not exists richtungen_zeit on richtungen (sitzung_id, erstellt desc);

-- YouTube-Links, die der PC abholt. Nur ueber die Funktion unten befuellbar.
create table if not exists eingang (
  id         uuid primary key default gen_random_uuid(),
  sitzung_id uuid not null references sitzung on delete cascade,
  url        text not null,
  status     text not null default 'neu' check (status in ('neu', 'laeuft', 'fertig', 'fehler')),
  meldung    text,
  erstellt   timestamptz not null default now()
);

-- Das Admin-Kennwort, gehasht. Eine Zeile.
create table if not exists geheimnis (
  id       int primary key default 1 check (id = 1),
  kennwort text not null
);

-- --------------------------------------------------------------------------
-- Obergrenze offener Wuensche pro Geraet
-- --------------------------------------------------------------------------
-- In der Datenbank statt in der App: die App kann jeder umgehen, der die
-- Entwicklerkonsole findet.

create or replace function wunsch_grenze() returns trigger
language plpgsql as $$
declare
  offen int;
begin
  select count(*) into offen
  from wuensche
  where sitzung_id = new.sitzung_id and geraet = new.geraet;

  if offen >= 2 then
    raise exception 'Du hast schon zwei Wuensche offen.';
  end if;
  return new;
end;
$$;

drop trigger if exists wunsch_grenze_pruefen on wuensche;
create trigger wunsch_grenze_pruefen
  before insert on wuensche
  for each row execute function wunsch_grenze();

-- --------------------------------------------------------------------------
-- Admin-Eingang: YouTube-Link mit Kennwort einwerfen
-- --------------------------------------------------------------------------
-- security definer heisst: die Funktion darf schreiben, obwohl der Aufrufer es
-- nicht darf. Das Kennwort wird in der Funktion geprueft, nicht in der App.

create or replace function link_einwerfen(p_sitzung uuid, p_url text, p_kennwort text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  neue_id uuid;
begin
  if not exists (
    select 1 from geheimnis
    where id = 1 and kennwort = crypt(p_kennwort, kennwort)
  ) then
    raise exception 'Falsches Kennwort.';
  end if;

  if p_url !~ '^https?://(www\.)?(youtube\.com|youtu\.be)/' then
    raise exception 'Das sieht nicht nach einem YouTube-Link aus.';
  end if;

  insert into eingang (sitzung_id, url) values (p_sitzung, p_url)
  returning id into neue_id;
  return neue_id;
end;
$$;

-- --------------------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------------------

alter table sitzung     enable row level security;
alter table katalog     enable row level security;
alter table jetzt_laeuft enable row level security;
alter table wuensche    enable row level security;
alter table stimmen     enable row level security;
alter table richtungen  enable row level security;
alter table eingang     enable row level security;
alter table geheimnis   enable row level security;

-- Lesen: alles ausser dem Eingang und dem Kennwort.
create policy sitzung_lesen     on sitzung     for select using (aktiv);
create policy katalog_lesen     on katalog     for select using (true);
create policy laeuft_lesen      on jetzt_laeuft for select using (true);
create policy wuensche_lesen    on wuensche    for select using (true);
create policy stimmen_lesen     on stimmen     for select using (true);
create policy richtungen_lesen  on richtungen  for select using (true);

-- Schreiben: nur einfuegen, nur in die drei Gaestetabellen, nur in eine aktive
-- Sitzung. Kein UPDATE, kein DELETE - dafuer gibt es bewusst keine Policy.
create policy wuensche_anlegen on wuensche for insert
  with check (exists (select 1 from sitzung s where s.id = sitzung_id and s.aktiv));

create policy stimmen_anlegen on stimmen for insert
  with check (exists (
    select 1 from wuensche w join sitzung s on s.id = w.sitzung_id
    where w.id = wunsch_id and s.aktiv
  ));

create policy richtungen_anlegen on richtungen for insert
  with check (exists (select 1 from sitzung s where s.id = sitzung_id and s.aktiv));

-- geheimnis und eingang bekommen keine einzige Policy. Damit kommt ueber den
-- anon-Schluessel niemand heran - ausser durch link_einwerfen().

-- --------------------------------------------------------------------------
-- Realtime
-- --------------------------------------------------------------------------
-- Die Bruecke hoert auf Gaesteaktivitaet, die Gaeste hoeren auf jetzt_laeuft.

alter publication supabase_realtime add table wuensche;
alter publication supabase_realtime add table stimmen;
alter publication supabase_realtime add table richtungen;
alter publication supabase_realtime add table jetzt_laeuft;
alter publication supabase_realtime add table eingang;

-- --------------------------------------------------------------------------
-- Einrichten
-- --------------------------------------------------------------------------
-- Einmal ausfuehren, Kennwort ersetzen, die ausgegebene Sitzungs-ID notieren:
--
--   insert into geheimnis (id, kennwort)
--   values (1, crypt('HIER-DEIN-ADMIN-KENNWORT', gen_salt('bf')))
--   on conflict (id) do update set kennwort = excluded.kennwort;
--
--   insert into sitzung (anlass) values ('30. Geburtstag') returning id;
