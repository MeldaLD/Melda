import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { emailVorlagen, type VorlagenDaten } from "@config/email-vorlage";
import { VorlagenWahl } from "@/components/admin/VorlagenWahl";
import { Button } from "@/components/ui/button";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { basisUrl } from "@/lib/basis-url";

export const dynamic = "force-dynamic";

export default async function EmailVorlageSeite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const db = supabaseAdmin();
  const { data: mandant } = await db
    .from("demo_tenants")
    .select("firma, ansprechpartner, stadt, objekt_namen")
    .eq("slug", slug)
    .maybeSingle();
  if (!mandant) notFound();

  const daten: VorlagenDaten = {
    firma: mandant.firma,
    ansprechpartner: mandant.ansprechpartner,
    stadt: mandant.stadt,
    link: `${basisUrl()}/demo/${slug}`,
    erstesObjekt: mandant.objekt_namen?.[0] ?? null,
    // DEMO: Im Echtbetrieb käme das aus dem Profil des angemeldeten Nutzers.
    absender: process.env.ADMIN_ABSENDER ?? "Ihr Name\nIhre Firma\nTelefon",
  };

  // Die Vorlagen sind Funktionen und lassen sich nicht an eine Client
  // Component reichen – deshalb hier ausrechnen.
  const fertig = emailVorlagen.map((v) => ({
    id: v.id,
    name: v.name,
    beschreibung: v.beschreibung,
    betreff: v.betreff(daten),
    text: v.text(daten),
  }));

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={`/admin/mandanten/${slug}`}>
          <ArrowLeftIcon /> Zurück zu {mandant.firma}
        </Link>
      </Button>

      <h1 className="mb-1 text-xl font-semibold tracking-tight">E-Mail-Vorlage</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Fertig ausgefüllt für {mandant.firma}. Kopieren, in Ihr Postfach einfügen,
        absenden.
      </p>

      <VorlagenWahl vorlagen={fertig} />

      <p className="mt-5 text-xs text-muted-foreground">
        Die Texte stehen in{" "}
        <code className="rounded bg-muted px-1 py-0.5">config/email-vorlage.ts</code>{" "}
        und lassen sich dort frei ändern. Ihre Absenderzeile kommt aus der
        Umgebungsvariable <code>ADMIN_ABSENDER</code>.
      </p>
    </div>
  );
}
