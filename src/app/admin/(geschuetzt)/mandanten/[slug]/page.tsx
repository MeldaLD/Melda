import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, MailIcon, RotateCcwIcon } from "lucide-react";

import { beispieldatenNeu, mandantUmschalten } from "../../../aktionen";
import { LinkKopieren } from "@/components/admin/LinkKopieren";
import { LogoUpload } from "@/components/admin/LogoUpload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeerHinweis } from "@/components/dashboard/Anzeigen";
import { alsDatumZeit } from "@/lib/dashboard/format";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { basisUrl } from "@/lib/basis-url";

export const dynamic = "force-dynamic";

export default async function MandantDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = supabaseAdmin();

  const { data: mandant } = await db
    .from("demo_tenants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!mandant) notFound();

  const { data: besuche } = await db
    .from("demo_besuche")
    .select("sitzung, pfad, dauer_sekunden, begonnen_am, letzter_ping, user_agent")
    .eq("tenant_id", mandant.id)
    .order("letzter_ping", { ascending: false })
    .limit(40);

  const { count: vorgaenge } = await db
    .from("vorgaenge")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", mandant.id);

  // Je Sitzung zusammenfassen – interessant ist der Besuch, nicht der Klick.
  const sitzungen = new Map<
    string,
    { dauer: number; zuletzt: string; geraet: string | null }
  >();
  for (const b of besuche ?? []) {
    const vorhanden = sitzungen.get(b.sitzung);
    sitzungen.set(b.sitzung, {
      dauer: (vorhanden?.dauer ?? 0) + (b.dauer_sekunden ?? 0),
      zuletzt:
        !vorhanden || b.letzter_ping > vorhanden.zuletzt
          ? b.letzter_ping
          : vorhanden.zuletzt,
      geraet: vorhanden?.geraet ?? geraetName(b.user_agent),
    });
  }
  const besuchsliste = [...sitzungen.values()].sort((a, b) =>
    b.zuletzt.localeCompare(a.zuletzt),
  );

  const link = `${basisUrl()}/demo/${slug}`;

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/admin">
          <ArrowLeftIcon /> Alle Demos
        </Link>
      </Button>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="size-10 shrink-0 rounded-md border border-border"
            style={{ background: mandant.primaerfarbe }}
            aria-hidden
          />
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
              {mandant.firma}
              {!mandant.ist_aktiv && <Badge variant="outline">Deaktiviert</Badge>}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mandant.stadt} · angelegt {alsDatumZeit(mandant.erstellt_am)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="marke">
            <Link href={`/admin/mandanten/${slug}/email`}>
              <MailIcon /> E-Mail-Vorlage
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Link für den Kunden</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <LinkKopieren link={link} />
            <p className="text-xs text-muted-foreground">
              Führt auf die Einstiegsseite mit beiden Perspektiven. Direkt in den Chat
              geht <code className="rounded bg-muted px-1 py-0.5">{link}/chat</code>.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
          </CardHeader>
          <CardContent>
            <LogoUpload slug={slug} aktuellesLogo={mandant.logo_url} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Aufrufe</CardTitle>
            <Badge variant={mandant.aufrufe > 0 ? "marke" : "outline"}>
              {mandant.aufrufe} gesamt
            </Badge>
          </CardHeader>
          <CardContent>
            {besuchsliste.length === 0 ? (
              <LeerHinweis text="Noch nicht geöffnet." />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {besuchsliste.slice(0, 10).map((besuch, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block">{alsDatumZeit(besuch.zuletzt)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {besuch.geraet ?? "Unbekanntes Gerät"}
                      </span>
                    </span>
                    <span className="tabellenziffern shrink-0 text-xs font-medium">
                      {besuch.dauer < 60
                        ? `${besuch.dauer} Sek.`
                        : `${Math.round(besuch.dauer / 60)} Min.`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="pt-3 text-[11px] text-muted-foreground">
              Erfasst werden nur Zeitpunkt, Dauer und Gerätetyp – keine IP-Adressen,
              keine Wiedererkennung über Sitzungen hinweg.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verwaltung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="space-y-1.5 text-sm">
              <Zeile bezeichnung="Kennung" wert={mandant.slug} />
              <Zeile bezeichnung="Vorgänge" wert={String(vorgaenge ?? 0)} />
              <Zeile
                bezeichnung="Läuft ab"
                wert={mandant.ablaufdatum ?? "unbegrenzt"}
              />
              <Zeile
                bezeichnung="Objekte"
                wert={(mandant.objekt_namen ?? []).join(" · ") || "–"}
              />
            </dl>

            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <form
                action={async () => {
                  "use server";
                  await beispieldatenNeu(slug);
                }}
              >
                <Button type="submit" variant="outline" size="sm">
                  <RotateCcwIcon /> Beispieldaten neu erzeugen
                </Button>
              </form>

              <form
                action={async () => {
                  "use server";
                  await mandantUmschalten(slug, !mandant.ist_aktiv);
                }}
              >
                <Button type="submit" variant="ghost" size="sm">
                  {mandant.ist_aktiv ? "Demo deaktivieren" : "Demo aktivieren"}
                </Button>
              </form>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Eine deaktivierte oder abgelaufene Demo ist über den Link nicht mehr
              erreichbar – das erledigt die Datenbank selbst.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Zeile({ bezeichnung, wert }: { bezeichnung: string; wert: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-xs text-muted-foreground">{bezeichnung}</dt>
      <dd className="min-w-0 flex-1 break-words">{wert}</dd>
    </div>
  );
}

/** Grobe Gerätekennung – reicht, um Telefon von Rechner zu unterscheiden. */
function geraetName(userAgent: string | null): string | null {
  if (!userAgent) return null;
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android-Gerät";
  if (/Macintosh/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows-Rechner";
  return "Anderes Gerät";
}
