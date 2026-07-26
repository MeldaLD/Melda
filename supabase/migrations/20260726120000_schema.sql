-- ---------------------------------------------------------------------------
-- Grundschema der Demo-Plattform
--
-- Alle Tabellen hängen an einem Demo-Mandanten (demo_tenants). Ein Mandant
-- entspricht einer Hausverwaltung, für die eine personalisierte Demo erzeugt
-- wurde. Löschen eines Mandanten räumt über ON DELETE CASCADE alles mit ab.
--
-- Namensgebung bewusst deutsch: Die Fachbegriffe sind die, die der Kunde
-- benutzt, und die Tabellen sollen im Supabase-Tabelleneditor ohne Übersetzung
-- lesbar sein.
-- ---------------------------------------------------------------------------

-- --- Aufzählungstypen ------------------------------------------------------

create type prioritaet as enum ('notfall', 'dringend', 'routine');

create type vorgang_status as enum (
  'neu',              -- gerade aus dem Chat eingegangen
  'in_pruefung',      -- wartet im Freigabe-Center
  'an_handwerker',    -- Auftrag ist raus
  'termin_vereinbart',
  'in_arbeit',
  'erledigt',
  'storniert'
);

create type gewerk as enum (
  'sanitaer', 'heizung', 'elektro', 'schluesseldienst',
  'maler', 'schreiner', 'reinigung', 'dach', 'sonstiges'
);

create type kanal as enum ('whatsapp', 'email', 'telefon');

create type nachricht_richtung as enum ('mieter', 'ki', 'verwalter', 'handwerker');

create type freigabe_typ as enum (
  'handwerkerauftrag', 'mieter_antwort', 'zahlungserinnerung', 'terminbestaetigung'
);

create type freigabe_status as enum ('offen', 'freigegeben', 'abgelehnt');

create type termin_typ as enum ('rueckruf', 'handwerkertermin');

create type termin_status as enum ('geplant', 'bestaetigt', 'abgesagt', 'erledigt');

create type fachbereich as enum ('technik', 'buchhaltung', 'weg', 'allgemein');

-- --- Mandanten -------------------------------------------------------------

create table demo_tenants (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique
                    constraint slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  firma           text not null,
  logo_url        text,
  primaerfarbe    text not null default '#1F4E79'
                    constraint primaerfarbe_hex check (primaerfarbe ~* '^#[0-9a-f]{6}$'),
  sekundaerfarbe  text
                    constraint sekundaerfarbe_hex check (sekundaerfarbe is null or sekundaerfarbe ~* '^#[0-9a-f]{6}$'),
  ansprechpartner text,
  stadt           text not null,

  -- Vorlagen für den Beispieldaten-Generator. Im Admin als ein Formular
  -- pflegbar; der Generator materialisiert daraus die Tabellen unten.
  objekt_namen    text[] not null default '{}',
  mitarbeiter     jsonb  not null default '[]'::jsonb,
  handwerker      jsonb  not null default '[]'::jsonb,

  -- Eskalationsregeln, Branding-Zusätze, Zeitfenster-Vorgaben
  einstellungen   jsonb  not null default '{}'::jsonb,

  ablaufdatum     date,
  aufrufe         integer not null default 0,
  ist_aktiv       boolean not null default true,
  erstellt_am     timestamptz not null default now()
);

comment on table demo_tenants is
  'Eine personalisierte Vertriebsdemo. Der Slug ist Teil der öffentlichen URL.';

-- --- Stammdaten ------------------------------------------------------------

create table objekte (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references demo_tenants(id) on delete cascade,
  name             text not null,
  strasse          text not null,
  plz              text not null,
  ort              text not null,
  einheiten_anzahl integer not null default 0,
  sortierung       integer not null default 0
);

create table einheiten (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references demo_tenants(id) on delete cascade,
  objekt_id      uuid not null references objekte(id) on delete cascade,
  bezeichnung    text not null,           -- z. B. "2. OG links"
  mieter_name    text not null,
  mieter_telefon text
);

create table mitarbeiter (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references demo_tenants(id) on delete cascade,
  name         text not null,
  initialen    text not null,
  rolle        text not null,
  bereich      fachbereich not null default 'allgemein',
  sortierung   integer not null default 0
);

create table handwerker (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references demo_tenants(id) on delete cascade,
  firma            text not null,
  gewerk           gewerk not null,
  telefon          text,
  reaktionszeit_h  integer not null default 24,
  bewertung        numeric(2,1) not null default 4.5
                     constraint bewertung_bereich check (bewertung >= 0 and bewertung <= 5),
  -- Betrieb, an den Meldungen dieses Gewerks automatisch gehen
  ist_standard     boolean not null default false
);

-- Ein Standardbetrieb je Gewerk und Mandant
create unique index handwerker_ein_standard_je_gewerk
  on handwerker (tenant_id, gewerk)
  where ist_standard;

-- Buchbare Rückruf-Zeitfenster je Mitarbeiter
create table zeitfenster (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references demo_tenants(id) on delete cascade,
  mitarbeiter_id uuid not null references mitarbeiter(id) on delete cascade,
  wochentag      smallint not null
                   constraint wochentag_bereich check (wochentag between 1 and 7), -- 1 = Montag
  von            time not null,
  bis            time not null,
  constraint zeitfenster_reihenfolge check (bis > von)
);

-- --- Vorgänge --------------------------------------------------------------

create table vorgaenge (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references demo_tenants(id) on delete cascade,
  nummer             integer not null,           -- fortlaufend je Mandant, für die Anzeige
  einheit_id         uuid references einheiten(id) on delete set null,

  szenario_id        text,                       -- Verweis auf config/scenarios.ts
  titel              text not null,
  kategorie          text not null,
  gewerk             gewerk not null,
  prioritaet         prioritaet not null default 'routine',
  status             vorgang_status not null default 'neu',

  ki_zusammenfassung text,
  quelle             kanal not null default 'whatsapp',

  mitarbeiter_id     uuid references mitarbeiter(id) on delete set null,
  handwerker_id      uuid references handwerker(id) on delete set null,

  -- SLA-Ampel im Dashboard: überschritten = rot
  sla_frist          timestamptz,

  -- Kern des Verkaufsarguments: Zweitfoto hat eine zusätzliche Anfahrt erspart
  zweitanfahrt_vermieden boolean not null default false,

  -- Seed-Daten vs. während einer Vorführung live erzeugte Vorgänge.
  -- Das Zurücksetzen entfernt genau die nicht-Seed-Zeilen.
  ist_seed           boolean not null default false,

  erstellt_am        timestamptz not null default now(),
  erledigt_am        timestamptz,

  unique (tenant_id, nummer)
);

create index vorgaenge_tenant_status on vorgaenge (tenant_id, status);
create index vorgaenge_tenant_erstellt on vorgaenge (tenant_id, erstellt_am desc);

create table nachrichten (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references demo_tenants(id) on delete cascade,
  -- Nachrichten ohne Vorgang gibt es auch: reine Postfach-Einträge
  -- (E-Mail, Telefonnotiz), die noch keine Meldung geworden sind.
  vorgang_id  uuid references vorgaenge(id) on delete cascade,
  einheit_id  uuid references einheiten(id) on delete set null,

  richtung    nachricht_richtung not null,
  kanal       kanal not null default 'whatsapp',
  text        text not null,
  foto_id     text,                        -- Verweis auf ein Demo-Foto

  -- Strukturierte Zusatzinhalte im Chat: Prioritäts-Karte, Terminauswahl,
  -- Statusanzeige, Erkenntnis-Karte. Form siehe src/lib/chat/typen.ts
  meta        jsonb,

  ist_seed    boolean not null default false,
  gesendet_am timestamptz not null default now(),
  gelesen_am  timestamptz
);

create index nachrichten_vorgang on nachrichten (vorgang_id, gesendet_am);
create index nachrichten_tenant_postfach on nachrichten (tenant_id, gesendet_am desc);

create table vorgang_verlauf (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references demo_tenants(id) on delete cascade,
  vorgang_id   uuid not null references vorgaenge(id) on delete cascade,
  ereignis     text not null,              -- kurzer Schlüssel, z. B. "freigegeben"
  beschreibung text not null,
  akteur       text not null,              -- "KI-Assistent", Mitarbeitername, ...
  ist_seed     boolean not null default false,
  zeitpunkt    timestamptz not null default now()
);

create index vorgang_verlauf_vorgang on vorgang_verlauf (vorgang_id, zeitpunkt);

-- --- Freigabe-Center -------------------------------------------------------

create table freigaben (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references demo_tenants(id) on delete cascade,
  vorgang_id    uuid references vorgaenge(id) on delete cascade,

  typ           freigabe_typ not null,
  titel         text not null,
  -- Worauf die KI ihren Vorschlag stützt – das ist das Vertrauensargument
  begruendung   text not null,
  entwurf_text  text not null,
  empfaenger    text,

  status        freigabe_status not null default 'offen',
  entschieden_am timestamptz,
  entschieden_von text,

  -- "Diese Art von Vorgang künftig automatisch freigeben"
  regel_automatisch boolean not null default false,

  ist_seed      boolean not null default false,
  erstellt_am   timestamptz not null default now()
);

create index freigaben_tenant_status on freigaben (tenant_id, status, erstellt_am);

-- --- Termine ---------------------------------------------------------------

create table termine (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references demo_tenants(id) on delete cascade,
  vorgang_id     uuid references vorgaenge(id) on delete cascade,

  typ            termin_typ not null,
  titel          text not null,
  mitarbeiter_id uuid references mitarbeiter(id) on delete set null,
  handwerker_id  uuid references handwerker(id) on delete set null,
  einheit_id     uuid references einheiten(id) on delete set null,

  beginn         timestamptz not null,
  ende           timestamptz not null,
  status         termin_status not null default 'geplant',

  ist_seed       boolean not null default false,
  constraint termin_reihenfolge check (ende > beginn)
);

create index termine_tenant_beginn on termine (tenant_id, beginn);

-- --- Aufruf-Tracking -------------------------------------------------------

create table demo_besuche (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references demo_tenants(id) on delete cascade,
  sitzung         text not null,            -- zufällige ID pro Browser-Sitzung
  pfad            text not null,
  dauer_sekunden  integer not null default 0,
  user_agent      text,
  verweis         text,
  begonnen_am     timestamptz not null default now(),
  letzter_ping    timestamptz not null default now()
);

create index demo_besuche_tenant on demo_besuche (tenant_id, begonnen_am desc);
create unique index demo_besuche_sitzung on demo_besuche (tenant_id, sitzung, pfad);

comment on table demo_besuche is
  'Wann und wie lange ein Interessent die Demo geöffnet hat – Signal zum Nachfassen.';
