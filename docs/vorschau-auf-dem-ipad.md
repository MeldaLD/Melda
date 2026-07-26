# Vorschau ohne Rechner einrichten (iPad, Safari)

Ziel: Nach dieser Einrichtung ist die Demo unter einer festen URL erreichbar
und aktualisiert sich bei jedem Push automatisch. Kein Terminal, keine
Installation, alles im Browser.

Dauer: etwa 10 Minuten, einmalig.

---

## Warum Vercel und nicht GitHub Pages

GitHub Pages liefert nur statische Dateien. Diese Anwendung braucht einen
Server – für die Route Handler des Chats, für die serverseitigen
Supabase-Zugriffe und für den Admin-Bereich. Auf Pages müssten genau die
Teile entfallen, die die Demo ausmachen.

Vercel ist der Hersteller von Next.js, das kostenlose Hobby-Kontingent reicht
für diesen Zweck vollständig aus, und die Einrichtung funktioniert komplett
im mobilen Browser.

---

## Schritt 1 – Vercel-Konto anlegen

1. In Safari **vercel.com** öffnen, **Sign Up**.
2. **Continue with GitHub** wählen und den Zugriff bestätigen.
3. Als Kontotyp **Hobby** wählen (kostenlos). Ein Team wird nicht gebraucht.

## Schritt 2 – Repository importieren

1. **Add New… → Project**.
2. Bei Bedarf **Adjust GitHub App Permissions** antippen und dem
   Repository `MeldaLD/Melda` Zugriff geben (privates Repo muss einzeln
   freigegeben werden).
3. `MeldaLD/Melda` in der Liste antippen → **Import**.
4. Framework wird automatisch als **Next.js** erkannt. Nichts ändern.
5. **Deploy** antippen.

Der erste Build dauert ein bis zwei Minuten.

## Schritt 3 – Nichts zu tun

Der Arbeitsbranch `claude/hausverwaltung-demo-platform-10rs3w` ist zugleich
der Standardbranch des Repositories – er war der erste Branch im vorher
leeren Repo. Vercel übernimmt beim Import den Standardbranch als
Produktionsbranch, also ist bereits alles richtig eingestellt.

Ergebnis: eine feste, ohne Anmeldung erreichbare Adresse in der Form
`https://melda.vercel.app`. Diese URL auf dem Home-Bildschirm ablegen –
dort ist ab jetzt immer der aktuelle Stand zu sehen.

> Falls die Einstellung später doch einmal gebraucht wird: Sie liegt nicht
> mehr unter *Settings → Git*, sondern unter
> **Settings → Environments → Production → Branch Tracking**.
>
> Vor dem ersten echten Kundenlink stellen wir das Repository auf `main` als
> Standardbranch um; die Entwicklung läuft dann über Vorschau-Deployments.

## Schritt 4 – Umgebungsvariablen eintragen

**Settings → Environment Variables**. Für jede Zeile: Name eintragen, Wert
einfügen, alle drei Haken (Production, Preview, Development) setzen, **Save**.

| Name | Wert |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ebenda, `anon` / Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | ebenda, `service_role` / Secret key (hinter „Reveal") |
| `ADMIN_PASSWORT` | frei wählbar |
| `ADMIN_SESSION_SECRET` | 32 zufällige Zeichen, siehe Hinweis unten |
| `NEXT_PUBLIC_BASIS_URL` | die Vercel-URL aus Schritt 3, ohne Schrägstrich am Ende |

Für `ADMIN_SESSION_SECRET` gibt es auf dem iPad kein `openssl`. Ausreichend
ist jede lange, zufällige Zeichenkette – etwa aus dem Passwortgenerator des
iCloud-Schlüsselbunds (Einstellungen → Passwörter → neues Passwort anlegen,
Vorschlag kopieren, Eintrag verwerfen).

Nach dem Eintragen einmal **Deployments → Redeploy**, damit die Werte greifen.

## Schritt 5 – Prüfen

Die Seite `/status` auf der Vercel-URL aufrufen, also zum Beispiel
`https://melda.vercel.app/status`.

Dort steht, welche Umgebungsvariablen angekommen sind und welcher Commit
gerade läuft. Alle sechs Variablen auf „gesetzt" bedeutet: fertig.

---

## Danach

Ab jetzt gilt: Bei jedem Push auf den Arbeitsbranch baut Vercel neu, etwa
eine Minute später ist der neue Stand unter derselben URL sichtbar.
Vercel schickt bei Bedarf eine E-Mail, wenn ein Build fehlschlägt.

## Was auf dem iPad sonst noch geht

- **Code lesen:** github.com im Browser, oder in der URL `github.com` durch
  `github.dev` ersetzen – das öffnet einen vollwertigen Editor in Safari.
- **Datenbank:** Das Supabase-Dashboard inklusive SQL Editor funktioniert im
  mobilen Safari. Migrationen lassen sich per Kopieren und Einfügen
  einspielen, die Kommandozeile wird dafür nicht gebraucht.
- **Tastatur:** Für längere Eingaben lohnt eine externe Tastatur, für das
  Prüfen der Demo reicht der Touchscreen.
