-- ---------------------------------------------------------------------------
-- Rückrufe: Thema statt Terminbuchung
--
-- Der Mieter buchte bisher im Chat ein festes Zeitfenster bei einer
-- namentlich genannten Person. Das setzt Wissen voraus, das wir nicht haben:
-- Wer ist zuständig, wer ist im Urlaub, wer vertritt. Diese Zuordnung gehört
-- in die Verwaltung, nicht in den Mieter-Chat.
--
-- Neu: Der Mieter nennt nur das Thema und wann er erreichbar ist. Die
-- Verwaltung weist den Rückruf im Dashboard einer Person zu und legt dabei
-- auch den konkreten Zeitpunkt fest.
--
-- Folge fürs Schema: beginn und ende sind bei Rückrufen zunächst leer.
-- ---------------------------------------------------------------------------

alter table termine
  alter column beginn drop not null,
  alter column ende drop not null;

alter table termine
  -- Thema aus config/rueckruf-gruende.ts, z. B. "abrechnung"
  add column if not exists grund text,
  -- Erreichbarkeit des Mieters: vormittag | nachmittag | egal
  add column if not exists zeitwunsch text,
  -- Zuordnungsvorschlag aus dem Thema. Die Verwaltung kann ihn überschreiben.
  add column if not exists bereich_vorschlag fachbereich;

comment on column termine.grund is
  'Nur bei Rückrufen: das vom Mieter gewählte Thema.';
comment on column termine.bereich_vorschlag is
  'Zuordnungsvorschlag aus dem Thema – im Dashboard überschreibbar.';

-- Ein Rückruf ohne zugewiesene Person ist "geplant"; sobald die Verwaltung
-- ihn zuordnet und terminiert, wird er "bestaetigt".
-- Ein Handwerkertermin braucht dagegen immer eine Zeit.
alter table termine
  add constraint handwerkertermin_braucht_zeit
  check (typ <> 'handwerkertermin' or (beginn is not null and ende is not null));

create index if not exists termine_offene_rueckrufe
  on termine (tenant_id, typ, status)
  where typ = 'rueckruf' and mitarbeiter_id is null;
