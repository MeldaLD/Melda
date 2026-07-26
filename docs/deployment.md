# Deployment

Die Anwendung läuft auf Vercel. Alles hier lässt sich im Browser erledigen,
auch vom Tablet.

## 1. Umgebungsvariablen

**Vercel → Ihr Projekt → Settings → Environment Variables.** Jede Variable
einzeln anlegen, Haken bei Production, Preview und Development.

| Variable | Pflicht | Woher / Wert |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ja | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ja | ebenda, `anon` bzw. Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | ja | ebenda, `service_role` bzw. Secret key (hinter „Reveal") |
| `ADMIN_PASSWORT` | für `/admin` | frei wählbar, lang und zufällig |
| `ADMIN_SESSION_SECRET` | für `/admin` | 32 zufällige Zeichen, `openssl rand -base64 32` |
| `ADMIN_ABSENDER` | nein | Ihre Absenderzeile in der E-Mail-Vorlage |
| `NEXT_PUBLIC_BASIS_URL` | nein | nur bei eigener Domain, z. B. `https://demo.ihre-domain.de` |

Nach jeder Änderung einmal **Deployments → Redeploy**, sonst greifen die
neuen Werte nicht.

> `SUPABASE_SERVICE_ROLE_KEY` umgeht alle Sicherheitsregeln der Datenbank.
> Nie mit `NEXT_PUBLIC_` präfixen, nie committen. Der Import von
> `src/lib/supabase/admin.ts` ist über `server-only` abgesichert – ein
> versehentlicher Client-Import bricht den Build ab, statt den Schlüssel
> auszuliefern.

Ob alles angekommen ist, zeigt `/status` auf dem Deployment.

## 2. Datenbank

Die SQL-Dateien aus `supabase/` **in dieser Reihenfolge** im Supabase
SQL Editor ausführen:

1. `migrations/20260726120000_schema.sql`
2. `migrations/20260726120100_rls.sql`
3. `migrations/20260726120200_realtime_storage_reset.sql`
4. `migrations/20260726160000_rueckruf_ohne_termin.sql`
5. `migrations/20260726190000_kleinreparatur.sql`
6. `seed/muster-hausverwaltung.sql`

Details und der Weg über die Supabase-CLI stehen in
[supabase/README.md](../supabase/README.md).

Kommt danach ein Fehler der Art *„Could not find the 'x' column … in the
schema cache"*, fehlt eine Migration. Sind alle eingespielt, hilft:

```sql
notify pgrst, 'reload schema';
```

## 3. Vom Arbeitsbranch auf `main`

Solange entwickelt wird, ist der Arbeitsbranch zugleich Standardbranch – so
landet jeder Push direkt auf der Haupt-URL. Vor dem ersten echten Kundenlink
sollte das umgestellt werden:

1. GitHub → Repository → Settings → General → **Default branch** auf `main`
   ändern (Branch vorher über einen Pull Request füllen).
2. Vercel → Settings → **Environments → Production → Branch Tracking** auf
   `main`.
3. Ab dann geht Entwicklung über Vorschau-Deployments, und `main` ist das,
   was der Kunde sieht.

## 4. Eigene Domain

Vercel → Settings → **Domains** → Domain eintragen und die angezeigten
DNS-Einträge beim Anbieter setzen. Danach `NEXT_PUBLIC_BASIS_URL` auf die
neue Adresse setzen und neu deployen – sonst stehen in den E-Mail-Vorlagen
weiterhin `vercel.app`-Links.

Eine eigene Domain lohnt sich: `demo.ihre-firma.de/demo/mustermann` wirkt in
einer Kaltakquise-Mail deutlich seriöser als eine `vercel.app`-Adresse.

## 5. Deployment-Schutz

Vercel schaltet bei neuen Projekten **Deployment Protection** ein. Vor dem
ersten Kundenlink muss die aus sein, sonst landet der Interessent auf einer
Anmeldemaske: Settings → **Deployment Protection** → Vercel Authentication
→ *Disabled*.

## Vor dem ersten Kundenlink

Diese Liste einmal durchgehen:

- [ ] Alle sechs SQL-Dateien eingespielt, `/status` zeigt keine Lücken
- [ ] Deployment Protection ausgeschaltet
- [ ] **Echte Fotos in `public/demo-fotos/`** – siehe das dortige README.
      Ein Interessent, der Platzhalter sieht, glaubt die Bilderkennung nicht
- [ ] Eigene Domain eingerichtet und `NEXT_PUBLIC_BASIS_URL` gesetzt
- [ ] Demo unter `/demo/muster` einmal komplett durchgeklickt, am Telefon
- [ ] `ADMIN_PASSWORT` ist nicht das Testpasswort aus der Entwicklung
- [ ] Im Admin eine Testdemo angelegt, den Link geöffnet, Farben geprüft

## Kosten und Grenzen

Der kostenlose Tarif reicht für diesen Zweck.

**Vercel Hobby** ist für nichtkommerzielle Nutzung gedacht. Wer damit aktiv
verkauft, braucht streng genommen den Pro-Tarif. Das sollten Sie wissen,
bevor es jemand anspricht.

**Supabase Free** pausiert Projekte nach sieben Tagen ohne Zugriff. Die
Anwendung fängt das ab und läuft dann aus dem Beispieldaten-Generator weiter
– nur der Live-Effekt zwischen Chat und Dashboard fehlt. Wer regelmäßig
Links verschickt, ist mit dem kleinsten bezahlten Tarif besser bedient.
