# Demo-Plattform für Hausverwaltungen

Vertriebsdemo, die kleinen Hausverwaltungen (100–500 Einheiten) zeigt, wie
KI-gestützte Mieterkommunikation über WhatsApp funktioniert. Pro Interessent
wird eine personalisierte Demo unter einem eigenen Link erzeugt.

> **Das ist bewusst kein Produktivsystem.** Die Gesprächslogik ist ein
> deterministisches Skript, kein Sprachmodell. Alle Stellen, die absichtlich
> nachgestellt sind, sind im Code mit `// DEMO:` markiert.

## Die drei Teile

| Bereich | Route | Zweck |
| --- | --- | --- |
| Mieter-Chat | `/demo/[slug]/chat` | WhatsApp-ähnliche Schadensmeldung, mobile-first |
| Verwalter-Dashboard | `/demo/[slug]/dashboard` | Vorgänge, Freigabe-Center, Termine, Postfach |
| Mandantenverwaltung | `/admin` | Neue Demo in unter 10 Minuten erzeugen |
| Diagnose | `/status` | Was ist konfiguriert, welcher Stand läuft |

Was im Chat gemeldet wird, erscheint über Supabase Realtime unmittelbar im
Dashboard – das ist der Moment, der bei einer Live-Vorführung zieht.

Damit dieser Moment sichtbar bleibt, sind die mitgelieferten Beispieldaten
zunächst **ausgeblendet**: Die Übersicht zeigt nur, was während der Vorführung
wirklich hereinkommt. Über die Leiste über jeder Liste – und am Ende der Tour –
lässt sich der volle Bestand dazuladen. Steuerung und Texte stehen in
[`config/ansicht.ts`](./config/ansicht.ts); ohne konfigurierte Datenbank bleibt
alles wie bisher sichtbar, weil dort ohnehin nichts entstehen kann.

## Technik

- Next.js 15 (App Router) · React 19 · TypeScript
- Tailwind CSS v4 · shadcn/ui (Radix) · lucide-react
- Supabase (Postgres, Realtime, Storage)
- Vercel (Preview-Deployment pro Branch)

## Einrichtung

```bash
npm install
cp .env.example .env.local   # Werte eintragen, siehe unten
npm run dev
```

Die Anwendung läuft dann auf http://localhost:3000.

**Ohne Rechner arbeiten?** Die Vorschau lässt sich vollständig im mobilen
Browser einrichten – siehe
[docs/vorschau-auf-dem-ipad.md](./docs/vorschau-auf-dem-ipad.md). Danach ist
bei jedem Push automatisch der aktuelle Stand unter einer festen URL
erreichbar. Die Seite `/status` zeigt dort, welche Umgebungsvariablen
angekommen sind und welcher Commit läuft.

### Umgebungsvariablen

Alle Werte stehen kommentiert in [`.env.example`](./.env.example).

Die Supabase-Werte finden Sie im Supabase-Dashboard unter
**Project Settings → API**:

| Dashboard | Variable |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` / Publishable key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` / Secret key (hinter „Reveal") | `SUPABASE_SERVICE_ROLE_KEY` |

Dazu kommen `ADMIN_PASSWORT` und `ADMIN_SESSION_SECRET` für den
Admin-Bereich und optional `ANTHROPIC_API_KEY` für das Sprachmodell (siehe
unten).

`NEXT_PUBLIC_BASIS_URL` ist optional: Ohne sie nimmt die Anwendung lokal
`http://localhost:3000` und auf Vercel automatisch die Projekt-URL. Gesetzt
werden muss sie erst, wenn eine eigene Domain im Spiel ist – siehe
`src/lib/basis-url.ts`.

### Das Sprachmodell einschalten

`ANTHROPIC_API_KEY` ist der einzige Schalter. Ohne ihn läuft die gesamte
Demo auf hinterlegten Texten – vollständig bedienbar, aber sie versteht
keinen Freitext, den die Stichwortsuche nicht kennt, und wertet keine Fotos
aus. Ist der Schlüssel gesetzt, arbeiten genau die Schritte mit einem Modell,
die in [`config/ki-einsatz.ts`](./config/ki-einsatz.ts) auf `aktiv: true`
stehen:

| Schritt | Stufe | Modell |
| --- | --- | --- |
| Freitext einem Thema zuordnen | Verstehen | `claude-haiku-4-5` |
| Foto auswerten | Sehen | `claude-opus-5` |
| Vorgang für die Verwaltung zusammenfassen | Formulieren | `claude-sonnet-5` |

Zwei weitere Schritte sind gebaut, aber abgeschaltet (`aktiv: false`) – die
Begründung steht an Ort und Stelle. Welche Schritte aus Überzeugung
hinterlegt bleiben und warum, zeigt die Seite
`/demo/<slug>/leitstand/ki`; sie sagt dort auch, ob ein Schlüssel gesetzt
ist.

**Die Bilder der Vorführung verlassen das Haus nicht.** Zu jeder der zehn
Kacheln und zu jedem Nachfragebild gibt es eine hinterlegte Diagnose, die
ein Mensch geschrieben hat und die zum weiteren Gesprächsverlauf passt. Ein
Modell danach zu fragen wäre Geld für eine schlechtere Antwort – und in
einer Vorführung ein Risiko, weil dasselbe Bild jedes Mal etwas anders
beschrieben würde. Die Sperre hängt allein am Dateinamen (`demoFotos` in
[`config/scenarios.ts`](./config/scenarios.ts)) und greift im Browser wie
auf dem Server.

Wirklich ausgewertet wird nur ein Bild, dessen Name dort **nicht** steht –
denn nur dafür gibt es keine hinterlegte Antwort. Neue Dateien in
`public/demo-fotos/` müssen vor dem Bauen dort liegen; Next liefert nur aus,
was zur Bauzeit vorhanden war.

Was vor jedem Aufruf entfernt wird (E-Mail, Telefon, IBAN) und was gar nicht
erst mitgeschickt wird, steht in `src/lib/ki/schwaerzen.ts`. Die Sperren
gegen Kostenzusagen, Fristen und Rechtsauskünfte in Modellantworten stehen in
`src/lib/ki/pruefen.ts` und werden mit `npm run pruefen:ki` geprüft – ohne
Schlüssel und ohne Netz.

> `SUPABASE_SERVICE_ROLE_KEY` umgeht alle Sicherheitsregeln der Datenbank.
> Nie mit `NEXT_PUBLIC_` präfixen, nie committen, nie im Frontend verwenden.
> Der Import von `src/lib/supabase/admin.ts` ist über das Paket `server-only`
> abgesichert – ein versehentlicher Client-Import bricht den Build ab.

Auf Vercel dieselben Variablen unter **Settings → Environment Variables**
anlegen (Production, Preview und Development ankreuzen) und einmal neu
deployen.

## Projektstruktur

```
config/            Von Hand pflegbare Inhalte – hier ändern Sie die Demo
  scenarios.ts       die Schadensszenarien (Texte des Chats, Basis der Vorgänge)
  chat-rahmen.ts     generische Gesprächstexte des Mieter-Chats
  kleinreparaturen.ts Grenzbeträge und Selbsthilfe-Anleitungen
  rueckruf-gruende.ts Themen, aus denen der Mieter beim Rückruf wählt
  email-vorlage.ts   die drei Anschreiben für den Vertrieb
  strassen.ts        echte Straßen je Stadt für die Personalisierung
  muster-mandant.ts  der Beispielmandant, zugleich Rückfalldatensatz
  namen.ts           Namenspools für plausible Beispieldaten
  demo.ts            Timings, Feature-Schalter, Nutzenannahmen
supabase/
  migrations/        SQL-Schema, versioniert – siehe supabase/README.md
  seed/              erzeugte Beispieldaten (npm run seed:sql)
scripts/
  seed-sql.ts        schreibt die Seed-Datei aus dem Generator
src/
  app/               Routen (App Router)
  components/ui/     shadcn/ui-Komponenten
  lib/branding/      Farbableitung aus der Mandanten-Primärfarbe
  lib/daten/         Domänentypen und Datenzugriff mit Rückfallebene
  lib/demo/          Beispieldaten-Generator (deterministisch)
  lib/supabase/      Datenbank-Clients (browser · server · admin)
```

Importe: `@/…` zeigt auf `src/`, `@config/…` auf `config/`.

### Hinweis zu shadcn/ui

Die Komponenten unter `src/components/ui/` sind Quellcode im Repo – genau so,
wie es shadcn/ui vorsieht. Weitere Komponenten holen Sie sich mit
`npx shadcn@latest add <name>`.

## Befehle

| Befehl | Wirkung |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktions-Build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript ohne Emit |
| `npm run format` | Prettier schreibend |
| `npm run format:check` | Prettier prüfend (läuft auch in der CI) |
| `npm run seed:sql` | Beispieldaten neu erzeugen (`supabase/seed/`) |
| `npm run pruefen:ansicht` | Prüft, wann Beispieldaten aus- und eingeblendet werden |
| `npm run typen:datenbank` | Typen aus der verknüpften Datenbank erzeugen |

## Deployment

Vercel, Schritt für Schritt inklusive Umgebungsvariablen, eigener Domain und
einer Checkliste vor dem ersten Kundenlink:
[docs/deployment.md](./docs/deployment.md).

## Datenbank

Schema, Sicherheitsmodell und wie Sie die Migrationen einspielen – auch ohne
Terminal – steht in [supabase/README.md](./supabase/README.md).

Die Anwendung läuft auch **ohne Datenbank**: Ist Supabase nicht konfiguriert
oder nicht erreichbar, liefert der Beispieldaten-Generator denselben Bestand
direkt aus dem Speicher (`src/lib/daten/quelle.ts`). Das schützt die Demo
davor, ins Leere zu laufen, wenn Supabase ein Projekt im kostenlosen Tarif
nach sieben Tagen Inaktivität pausiert. Im Rückfallbetrieb fehlt nur der
Live-Effekt zwischen Chat und Dashboard.

## Konventionen

- **Sprache:** Datenbank, `config/` und alle Fachbegriffe auf Deutsch;
  Framework- und Infrastrukturcode auf Englisch.
- **Oberfläche:** durchgehend Deutsch, Sie-Form, keine Emojis.
- **Kein Dark Mode.** Eine Vertriebsdemo muss bei jedem Betrachter identisch
  aussehen.
- **`// DEMO:`** markiert jede bewusst nachgestellte Stelle.
