-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Grundregel: Öffentlich ist ausschließlich Lesen, und auch das nur für
-- Mandanten, die aktiv und nicht abgelaufen sind.
--
-- Es gibt bewusst KEINE INSERT-, UPDATE- oder DELETE-Policy. Jeder
-- schreibende Zugriff läuft serverseitig über den Service-Role-Key, der RLS
-- umgeht (siehe src/lib/supabase/admin.ts). Damit kann aus dem Browser
-- niemand Daten verändern, obwohl der Anon-Key öffentlich ist.
--
-- Lesen muss offen sein, weil Supabase Realtime im Dashboard mit dem
-- Anon-Key arbeitet: Ohne SELECT-Recht kämen keine Live-Ereignisse an.
-- ---------------------------------------------------------------------------

-- Hilfsfunktion: Ist dieser Mandant öffentlich sichtbar?
-- SECURITY DEFINER, damit die Prüfung nicht selbst wieder durch RLS läuft.
create or replace function mandant_sichtbar(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from demo_tenants t
    where t.id = p_tenant
      and t.ist_aktiv
      and (t.ablaufdatum is null or t.ablaufdatum >= current_date)
  );
$$;

comment on function mandant_sichtbar is
  'Abgelaufene oder deaktivierte Demos sind nicht mehr abrufbar.';

alter table demo_tenants    enable row level security;
alter table objekte         enable row level security;
alter table einheiten       enable row level security;
alter table mitarbeiter     enable row level security;
alter table handwerker      enable row level security;
alter table zeitfenster     enable row level security;
alter table vorgaenge       enable row level security;
alter table nachrichten     enable row level security;
alter table vorgang_verlauf enable row level security;
alter table freigaben       enable row level security;
alter table termine         enable row level security;
alter table demo_besuche    enable row level security;

-- Der Mandant selbst
create policy "aktive Mandanten oeffentlich lesbar"
  on demo_tenants for select
  to anon, authenticated
  using (ist_aktiv and (ablaufdatum is null or ablaufdatum >= current_date));

-- Alle abhängigen Tabellen nach demselben Muster
create policy "lesbar bei sichtbarem Mandanten" on objekte
  for select to anon, authenticated using (mandant_sichtbar(tenant_id));

create policy "lesbar bei sichtbarem Mandanten" on einheiten
  for select to anon, authenticated using (mandant_sichtbar(tenant_id));

create policy "lesbar bei sichtbarem Mandanten" on mitarbeiter
  for select to anon, authenticated using (mandant_sichtbar(tenant_id));

create policy "lesbar bei sichtbarem Mandanten" on handwerker
  for select to anon, authenticated using (mandant_sichtbar(tenant_id));

create policy "lesbar bei sichtbarem Mandanten" on zeitfenster
  for select to anon, authenticated using (mandant_sichtbar(tenant_id));

create policy "lesbar bei sichtbarem Mandanten" on vorgaenge
  for select to anon, authenticated using (mandant_sichtbar(tenant_id));

create policy "lesbar bei sichtbarem Mandanten" on nachrichten
  for select to anon, authenticated using (mandant_sichtbar(tenant_id));

create policy "lesbar bei sichtbarem Mandanten" on vorgang_verlauf
  for select to anon, authenticated using (mandant_sichtbar(tenant_id));

create policy "lesbar bei sichtbarem Mandanten" on freigaben
  for select to anon, authenticated using (mandant_sichtbar(tenant_id));

create policy "lesbar bei sichtbarem Mandanten" on termine
  for select to anon, authenticated using (mandant_sichtbar(tenant_id));

-- demo_besuche bekommt bewusst KEINE Policy.
-- Wer wann wie lange die Demo angesehen hat, ist Vertriebswissen und darf
-- nicht öffentlich abrufbar sein. Zugriff nur über den Service-Role-Key.

-- --- Tabellenrechte --------------------------------------------------------
--
-- RLS filtert Zeilen, ersetzt aber keine Rechte: Ohne GRANT SELECT bekommt
-- der Anon-Key "permission denied" und das Dashboard bliebe leer.
--
-- Supabase vergibt diese Rechte bei neu angelegten Tabellen zwar meist
-- automatisch über voreingestellte Standardprivilegien. Darauf verlassen wir
-- uns bewusst nicht – hier steht explizit, wer was darf, und die Migration
-- ist damit auch außerhalb von Supabase vollständig.

grant usage on schema public to anon, authenticated;

grant select on
  demo_tenants, objekte, einheiten, mitarbeiter, handwerker, zeitfenster,
  vorgaenge, nachrichten, vorgang_verlauf, freigaben, termine
to anon, authenticated;

-- demo_besuche fehlt in der Liste oben – Absicht, siehe Hinweis.
revoke all on demo_besuche from anon, authenticated;

-- Der Service-Role-Key umgeht RLS ohnehin; die Rechte dennoch ausdrücklich.
grant all on all tables in schema public to service_role;
