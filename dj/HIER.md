# Wo der DJ wohnt

Der automatische DJ ist ein eigenstaendiges Projekt, liegt aber in diesem
Repository, weil hier die Vercel-Anbindung schon steht. Er hat mit der
Hausverwaltungs-Demo **nichts** zu tun und fasst von ihr nichts an.

## Zwei Orte, ein Projekt

| Ort | Was |
| --- | --- |
| `dj/` | der Quelltext. Hier wird entwickelt. |
| `public/dj/index.html` | eine einzelne, fertig gebaute Datei. Nur Ergebnis, nie von Hand aendern. |

Next.js liefert alles aus `public/` aus, deshalb ist der DJ unter **`/dj`**
erreichbar. Die Umschreibung dafuer steht in `next.config.ts`; ohne sie waere
er nur unter `/dj/index.html` zu finden.

## Nach jeder Aenderung

```bash
npm run dj
```

Das baut `dj/` zu `public/dj/index.html` zusammen: acht Module in eine Datei,
Stilvorlage inline, keine Abhaengigkeiten. **Wer das vergisst, aendert nichts
an dem, was im Netz steht.**

```bash
npm run dj:pruefen     # Auswahl-Logik und Timing-Mathematik
```

## Was am Hauptprojekt angepasst wurde

Bewusst so wenig wie moeglich, und nichts davon aendert bestehendes Verhalten:

- `next.config.ts` – eine Umschreibung `/dj` auf `/dj/index.html`
- `package.json` – die Skripte `dj` und `dj:pruefen`
- `eslint.config.mjs` und `.prettierignore` – `dj/` ausgenommen, weil es reines
  JavaScript ohne React ist und die Regeln hier nicht passen

## Weiter

`dj/README.md` erklaert den Aufbau, `dj/PLAN.md` den Weg bis zur Party.
