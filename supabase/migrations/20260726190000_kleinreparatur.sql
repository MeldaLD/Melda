-- ---------------------------------------------------------------------------
-- Kleinreparaturen und Selbsthilfe
--
-- Viele Mietverträge enthalten eine Kleinreparaturklausel: Kosten kleiner
-- Reparaturen trägt der Mieter bis zu einem Höchstbetrag. Bei genau diesen
-- Fällen bietet der Assistent im Chat eine Anleitung zur Selbsthilfe an.
-- Nimmt der Mieter sie an und es klappt, entfällt der Handwerkereinsatz
-- vollständig – das ist für die Verwaltung eine harte Ersparnis und muss
-- deshalb im Dashboard messbar sein.
--
-- Wichtig: Die Klausel überträgt nur die Kosten, nicht die Pflicht zu
-- reparieren (BGH, 06.05.1992, VIII ZR 129/91). Der Tipp ist ein Angebot.
-- ---------------------------------------------------------------------------

alter table vorgaenge
  -- Geschätzte Kosten eines Handwerkereinsatzes, aus dem Szenario.
  add column if not exists kosten_schaetzung_euro integer,
  -- Wurde dem Mieter eine Selbsthilfe-Anleitung angeboten?
  add column if not exists selbsthilfe_angeboten boolean not null default false,
  -- Hat der Mieter den Schaden daraufhin selbst behoben?
  add column if not exists selbsthilfe_erfolgreich boolean not null default false;

comment on column vorgaenge.selbsthilfe_erfolgreich is
  'Vom Mieter selbst behoben – Handwerkereinsatz vollständig entfallen.';

-- Der je Mandant gültige Höchstbetrag steht in demo_tenants.einstellungen
-- unter "kleinreparatur_grenze_euro". Kein eigenes Feld, weil dort schon
-- alle übrigen Regelwerte liegen.

create index if not exists vorgaenge_selbsthilfe
  on vorgaenge (tenant_id)
  where selbsthilfe_erfolgreich;
