-- ---------------------------------------------------------------------------
-- Realtime, Logo-Speicher und Zurücksetzen der Demo
-- ---------------------------------------------------------------------------

-- --- Realtime --------------------------------------------------------------
-- Damit im Dashboard live auftaucht, was gerade im Chat gemeldet wird.
-- REPLICA IDENTITY FULL, damit bei Änderungen auch der vorherige Zeilenstand
-- mitgeliefert wird und clientseitige Filter zuverlässig greifen.
-- Die Tabellen sind klein, der Mehraufwand fällt nicht ins Gewicht.

alter table vorgaenge   replica identity full;
alter table nachrichten replica identity full;
alter table freigaben   replica identity full;
alter table termine     replica identity full;

do $$
declare
  tabelle text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach tabelle in array array['vorgaenge', 'nachrichten', 'freigaben', 'termine'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tabelle
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tabelle);
    end if;
  end loop;
end
$$;

-- --- Logo-Speicher ---------------------------------------------------------
-- Öffentlicher Bucket: Die Logos erscheinen im Chat-Header und in der
-- Dashboard-Seitenleiste und müssen ohne Anmeldung ladbar sein.
-- Hochgeladen wird ausschließlich serverseitig über den Service-Role-Key.

insert into storage.buckets (id, name, public)
values ('mandanten-logos', 'mandanten-logos', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Mandantenlogos oeffentlich lesbar'
  ) then
    create policy "Mandantenlogos oeffentlich lesbar"
      on storage.objects for select
      to anon, authenticated
      using (bucket_id = 'mandanten-logos');
  end if;
end
$$;

-- --- Zurücksetzen ----------------------------------------------------------
-- Leert alle Bewegungsdaten eines Mandanten. Der Mandant selbst und seine
-- Konfiguration bleiben erhalten.
--
-- Bewusst "alles löschen" statt "nur Nicht-Seed-Daten löschen": Auch die
-- Seed-Zeilen verändern sich während einer Vorführung (eine Freigabe wird
-- erteilt, ein Vorgang wandert weiter). Der Ausgangszustand wird deshalb
-- anschließend neu erzeugt – vom Beispieldaten-Generator der Anwendung oder
-- durch erneutes Einspielen der Seed-Datei.

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

  -- Reihenfolge egal, ON DELETE CASCADE greift ohnehin; explizit gelistet,
  -- damit beim Lesen klar ist, was verschwindet.
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

comment on function demo_leeren is
  'Löscht alle Bewegungsdaten eines Mandanten. Danach Beispieldaten neu erzeugen.';

-- Nur serverseitig aufrufbar.
--
-- Wichtig: Erst PUBLIC das Recht entziehen. Postgres vergibt EXECUTE auf neue
-- Funktionen standardmäßig an PUBLIC, und anon erbt daraus. Ein Entzug allein
-- für anon und authenticated bliebe wirkungslos – die Funktion ist
-- SECURITY DEFINER, jeder Besucher hätte damit die Demo leeren können.
revoke all on function demo_leeren(text) from public;
revoke all on function demo_leeren(text) from anon, authenticated;
grant execute on function demo_leeren(text) to service_role;
