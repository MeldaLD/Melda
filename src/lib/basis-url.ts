/**
 * Ermittelt die öffentliche Basis-URL der Anwendung.
 *
 * Gebraucht wird sie überall dort, wo ein vollständiger Link entstehen muss –
 * vor allem für die Demo-Links in der E-Mail-Vorlage im Admin-Bereich.
 *
 * Die Reihenfolge ist bewusst so gewählt, dass man nichts konfigurieren muss,
 * solange man keine eigene Domain hat:
 *
 *   1. NEXT_PUBLIC_BASIS_URL – manuell gesetzt, gewinnt immer.
 *      Nötig, sobald eine eigene Domain im Spiel ist, denn nur dann soll der
 *      Kunde auch diese Domain im Link sehen.
 *   2. Die Produktions-URL, die Vercel dem Projekt automatisch gibt.
 *      Bleibt über alle Deployments hinweg gleich.
 *   3. Die URL des einzelnen Deployments (Vorschau-Builds).
 *      Ändert sich bei jedem Push – nur als Notnagel.
 *   4. Lokale Entwicklung.
 */
export function basisUrl(): string {
  const manuell = process.env.NEXT_PUBLIC_BASIS_URL?.trim();
  if (manuell) return ohneSchraegstrich(manuell);

  const produktion = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (produktion) return `https://${ohneSchraegstrich(produktion)}`;

  const deployment = process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
  if (deployment) return `https://${ohneSchraegstrich(deployment)}`;

  return "http://localhost:3000";
}

/** Baut einen vollständigen Link auf die Demo eines Mandanten. */
export function demoLink(slug: string, pfad: "" | "/chat" | "/dashboard" = ""): string {
  return `${basisUrl()}/demo/${slug}${pfad}`;
}

/** Entfernt Schrägstriche am Ende, damit beim Zusammensetzen kein "//" entsteht. */
function ohneSchraegstrich(wert: string): string {
  return wert.replace(/\/+$/, "");
}
