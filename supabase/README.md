# Datenbank

## Aufbau

```
migrations/
  20260726120000_schema.sql                 Tabellen, Aufzählungstypen, Indizes
  20260726120100_rls.sql                    Sicherheitsregeln und Tabellenrechte
  20260726120200_realtime_storage_reset.sql Realtime, Logo-Bucket, demo_leeren()
seed/
  muster-hausverwaltung.sql                 Beispieldaten (erzeugt, nicht bearbeiten)
```

Reihenfolge beim Einspielen: erst die drei Migrationen in der Nummernfolge,
dann der Seed.

## Einspielen ohne Terminal (Tablet, fremder Rechner)

1. Supabase-Dashboard öffnen → **SQL Editor** → **New query**
2. Den Inhalt einer Datei kopieren, einfügen, **Run**
3. Für jede der vier Dateien wiederholen

Die Dateien liegen im Repository. Auf github.com die Datei öffnen und dort auf
**Raw** tippen – dann lässt sich der Inhalt sauber markieren und kopieren.

## Einspielen mit der Supabase-CLI

```bash
npm install -D supabase
npx supabase login
npx supabase link --project-ref IHR-PROJEKT-REF
npx supabase db push                          # Migrationen
npx supabase db execute -f supabase/seed/muster-hausverwaltung.sql
```

Die Projekt-Referenz ist der Teil vor `.supabase.co` in Ihrer Project URL.

## Beispieldaten neu erzeugen

Die Seed-Datei wird nicht von Hand gepflegt, sondern erzeugt:

```bash
npm run seed:sql
```

Quelle sind `config/muster-mandant.ts` (Firma, Stadt, Objekte, Mitarbeitende,
Handwerksbetriebe) und `config/scenarios.ts` (die Schadensfälle). Wer dort
etwas ändert, führt den Befehl aus und spielt die Datei erneut ein.

## Live-Verbindung zwischen Chat und Dashboard

Meldet ein Mieter im Chat einen Schaden, legt der Route Handler
`/api/chat/vorgang` daraus serverseitig einen echten Vorgang an – mit
Chatverlauf, Historie und den beiden offenen Freigaben. Das Dashboard
abonniert über Supabase Realtime die Tabellen `vorgaenge`, `nachrichten`,
`freigaben` und `termine` und rendert bei einer Änderung neu.

Damit das funktioniert, müssen drei Dinge stimmen – alle drei erledigen die
Migrationen:

1. Die Tabellen sind Teil der Publication `supabase_realtime`.
2. Sie haben `REPLICA IDENTITY FULL`, damit Filter auf `tenant_id` auch bei
   Änderungen greifen.
3. Der Anon-Key darf lesen (ohne SELECT-Recht kommen keine Ereignisse an).

Falls im Supabase-Dashboard unter *Database → Replication* nachgesehen
werden soll: Dort müssen die vier Tabellen aktiviert sein.

Ohne Datenbank läuft der Chat unverändert weiter, nur ohne den Live-Effekt.
Die Route antwortet dann mit `gespeichert: false`.

## Zurücksetzen

Die Seed-Datei ist wiederholbar: Sie leert zuerst alle Bewegungsdaten des
Mandanten und schreibt sie dann neu. Ein zweiter Durchlauf stellt also exakt
den Ausgangszustand wieder her. Genau das tut auch der Zurücksetzen-Knopf in
der Oberfläche.

Nur leeren, ohne neu zu befüllen:

```sql
select demo_leeren('muster');
```

## Sicherheitsmodell

- Alle Tabellen haben Row Level Security.
- Öffentlich (Anon-Key) ist ausschließlich **Lesen**, und nur bei Mandanten,
  die aktiv und nicht abgelaufen sind.
- Es gibt keine INSERT-, UPDATE- oder DELETE-Policy. Jeder Schreibzugriff
  läuft serverseitig über den Service-Role-Key.
- `demo_besuche` ist gar nicht öffentlich lesbar – wer wann wie lange die Demo
  angesehen hat, ist Vertriebswissen.
- `demo_leeren()` ist nur für die Service-Rolle ausführbar.

Geprüft wurde das gegen eine echte PostgreSQL-16-Instanz: Lesen erlaubt,
Schreiben abgewiesen, Besuchsdaten abgewiesen, Funktionsaufruf abgewiesen,
abgelaufene Demo unsichtbar.

## Zeitangaben im Seed

Alle Zeitstempel stehen als `now() + interval '...'` in der Datei, nicht als
feste Daten. Die Seed-Datei veraltet dadurch nicht: Egal wann sie eingespielt
wird, das Dashboard zeigt eine aktuelle Lage – ein Notfall von vor zwei
Stunden, ein überfälliger Vorgang, Termine in der kommenden Woche.
