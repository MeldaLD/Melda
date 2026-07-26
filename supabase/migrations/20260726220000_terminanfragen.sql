-- ---------------------------------------------------------------------------
-- Terminanfragen an die Handwerksbetriebe
--
-- Der Betrieb bekommt eine Nachricht mit einem Link. Dahinter liegt eine
-- einzige Seite: Was ist zu tun, wo, und drei Felder für Terminvorschläge.
-- Keine Anmeldung, kein Konto, keine App – ein Handwerker auf dem Dach soll
-- das mit einer Hand auf dem Telefon erledigen können.
--
-- Dieselbe Überlegung wie beim Mieter: Wir gehen dorthin, wo die Leute schon
-- sind, statt sie in ein Portal zu zwingen. Ein Betrieb, der sich erst
-- registrieren muss, antwortet nicht.
--
-- Die drei Vorschläge gehen anschließend an den Mieter, der einen auswählt.
-- Erst das Ergebnis kommt der Verwaltung als Terminbestätigung auf den Tisch.
-- ---------------------------------------------------------------------------

create type terminanfrage_status as enum (
  'offen',        -- Link verschickt, Betrieb hat noch nicht geantwortet
  'beantwortet',  -- Betrieb hat Vorschläge gemacht, Mieter wählt noch
  'bestaetigt',   -- Mieter hat gewählt
  'abgelaufen'
);

create table terminanfragen (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references demo_tenants(id) on delete cascade,
  vorgang_id    uuid not null references vorgaenge(id) on delete cascade,
  handwerker_id uuid not null references handwerker(id) on delete cascade,

  -- Teil der öffentlichen URL. Lang und zufällig, weil dahinter ohne
  -- Anmeldung Auftragsdaten stehen.
  token         text not null unique
                  constraint token_laenge check (char_length(token) between 24 and 64),

  status        terminanfrage_status not null default 'offen',

  -- Bis zu drei Zeitfenster, die der Betrieb genannt hat:
  -- [{ "beginn": "...", "ende": "..." }, ...]
  vorschlaege   jsonb not null default '[]'::jsonb,
  -- Index des vom Mieter gewählten Vorschlags
  gewaehlt      smallint
                  constraint gewaehlt_bereich check (gewaehlt is null or gewaehlt between 0 and 2),

  -- Was der Mieter sich ursprünglich gewünscht hatte – als Hinweis auf der
  -- Seite des Betriebs, damit er möglichst nah daran anbietet.
  wunsch_beginn timestamptz,
  wunsch_ende   timestamptz,

  ist_seed      boolean not null default false,
  erstellt_am   timestamptz not null default now(),
  beantwortet_am timestamptz,
  gueltig_bis   timestamptz not null default now() + interval '14 days'
);

create index terminanfragen_vorgang on terminanfragen (vorgang_id);
create index terminanfragen_tenant_status on terminanfragen (tenant_id, status);

comment on table terminanfragen is
  'Ein Link an einen Handwerksbetrieb: drei Terminvorschläge ohne Anmeldung.';
comment on column terminanfragen.token is
  'Teil der öffentlichen URL /termin/<token>. Nicht erratbar wählen.';

-- Der Betrieb ruft die Seite ohne Anmeldung auf. Gelesen und geschrieben wird
-- trotzdem ausschließlich serverseitig mit dem Service-Role-Key: Die Seite
-- ist eine Server Component, das Absenden eine Server Action. Für anon gibt
-- es deshalb bewusst keine Policy – wer den Token nicht hat, sieht nichts,
-- und wer ihn hat, kommt nur über unseren Server an die Daten.
alter table terminanfragen enable row level security;
grant select, insert, update on terminanfragen to service_role;

alter table terminanfragen replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'terminanfragen'
  ) then
    alter publication supabase_realtime add table public.terminanfragen;
  end if;
end
$$;

-- Zurücksetzen der Demo muss die Anfragen mitnehmen.
create or replace function demo_leeren(p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select id into v_tenant from demo_tenants where slug = p_slug;
  if v_tenant is null then
    raise exception 'Unbekannter Mandant: %', p_slug;
  end if;

  delete from terminanfragen  where tenant_id = v_tenant;
  delete from vorgang_verlauf where tenant_id = v_tenant;
  delete from nachrichten     where tenant_id = v_tenant;
  delete from freigaben       where tenant_id = v_tenant;
  delete from termine         where tenant_id = v_tenant;
  delete from vorgaenge       where tenant_id = v_tenant;
  delete from zeitfenster     where tenant_id = v_tenant;
  delete from einheiten       where tenant_id = v_tenant;
  delete from objekte         where tenant_id = v_tenant;
  delete from handwerker      where tenant_id = v_tenant;
  delete from mitarbeiter     where tenant_id = v_tenant;
end;
$$;

revoke all on function demo_leeren(text) from public;
revoke all on function demo_leeren(text) from anon, authenticated;
grant execute on function demo_leeren(text) to service_role;
