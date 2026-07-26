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

Was im Chat gemeldet wird, erscheint über Supabase Realtime unmittelbar im
Dashboard – das ist der Moment, der bei einer Live-Vorführung zieht.

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
Admin-Bereich.

`NEXT_PUBLIC_BASIS_URL` ist optional: Ohne sie nimmt die Anwendung lokal
`http://localhost:3000` und auf Vercel automatisch die Projekt-URL. Gesetzt
werden muss sie erst, wenn eine eigene Domain im Spiel ist – siehe
`src/lib/basis-url.ts`.

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
  scenarios.ts       die Schadensszenarien des Chats
  chat-rahmen.ts     generische Gesprächstexte
  demo.ts            Timings, Feature-Schalter, Nutzenannahmen
supabase/
  migrations/        SQL-Schema, versioniert
  seed/              Beispieldaten
src/
  app/               Routen (App Router)
  components/ui/     shadcn/ui-Komponenten
  components/chat/   Chat-Oberfläche
  components/dashboard/
  lib/branding/      Farbableitung aus der Mandanten-Primärfarbe
  lib/chat/          Zustandsmaschine des Chats
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

## Konventionen

- **Sprache:** Datenbank, `config/` und alle Fachbegriffe auf Deutsch;
  Framework- und Infrastrukturcode auf Englisch.
- **Oberfläche:** durchgehend Deutsch, Sie-Form, keine Emojis.
- **Kein Dark Mode.** Eine Vertriebsdemo muss bei jedem Betrachter identisch
  aussehen.
- **`// DEMO:`** markiert jede bewusst nachgestellte Stelle.
