"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { objektVorschlaege, staedteMitStrassen } from "@config/strassen";
import { MUSTER_MANDANT } from "@config/muster-mandant";
import { mandantAnlegen } from "../../../aktionen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markenPalette } from "@/lib/branding/farben";

/**
 * Das Formular für eine neue Demo.
 *
 * Ziel ist es, in unter zehn Minuten fertig zu sein. Deshalb sind alle Felder
 * außer Firma, Stadt und Kennung vorbelegt, und die Objektnamen füllen sich
 * beim Eintippen der Stadt mit echten Straßen von dort.
 */
export default function NeuerMandant() {
  const [fehler, absenden, laeuft] = useActionState(mandantAnlegen, null);
  const [firma, setFirma] = useState("");
  const [stadt, setStadt] = useState("");
  const [primaer, setPrimaer] = useState("#1F4E79");
  const [objekte, setObjekte] = useState("");
  const [objekteBerührt, setObjekteBerührt] = useState(false);

  // Slug automatisch aus der Firma vorschlagen – manuell überschreibbar.
  const [slug, setSlug] = useState("");
  const [slugBerührt, setSlugBerührt] = useState(false);

  const slugVorschlag = firma
    .toLowerCase()
    .replace(/[äöüß]/g, (z) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[z] ?? z)
    .replace(/gmbh|hausverwaltung|verwaltung|immobilien|&|\./g, " ")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const objekteVorschlag = stadt ? objektVorschlaege(stadt).join("\n") : "";
  const palette = markenPalette(primaer, null);

  return (
    <div style={palette as React.CSSProperties}>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/admin">
          <ArrowLeftIcon /> Zurück
        </Link>
      </Button>

      <h1 className="mb-1 text-xl font-semibold tracking-tight">Neue Demo anlegen</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Firma, Stadt und Farbe genügen. Alles Weitere wird vorgeschlagen und lässt sich
        überschreiben.
      </p>

      <form action={absenden} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Der Kunde</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Feld id="firma" beschriftung="Firma" pflicht>
              <Input
                id="firma"
                name="firma"
                value={firma}
                onChange={(e) => setFirma(e.target.value)}
                placeholder="Beispiel Hausverwaltung GmbH"
                required
              />
            </Feld>

            <Feld
              id="slug"
              beschriftung="Kennung in der URL"
              hinweis={`/demo/${slugBerührt ? slug || "…" : slugVorschlag || "…"}`}
              pflicht
            >
              <Input
                id="slug"
                name="slug"
                value={slugBerührt ? slug : slugVorschlag}
                onChange={(e) => {
                  setSlugBerührt(true);
                  setSlug(e.target.value);
                }}
                pattern="[a-z0-9][a-z0-9-]{1,58}[a-z0-9]"
                placeholder="beispiel-hausverwaltung"
                required
              />
            </Feld>

            <Feld
              id="stadt"
              beschriftung="Stadt"
              hinweis={
                staedteMitStrassen.includes(stadt.trim())
                  ? "Straßen aus dieser Stadt sind hinterlegt"
                  : "Für diese Stadt gibt es noch keine Straßenliste"
              }
              pflicht
            >
              <Input
                id="stadt"
                name="stadt"
                list="staedte"
                value={stadt}
                onChange={(e) => setStadt(e.target.value)}
                placeholder="Kassel"
                required
              />
              <datalist id="staedte">
                {staedteMitStrassen.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Feld>

            <Feld id="plz" beschriftung="Postleitzahl">
              <Input id="plz" name="plz" placeholder="34119" inputMode="numeric" />
            </Feld>

            <Feld id="ansprechpartner" beschriftung="Ansprechpartner">
              <Input
                id="ansprechpartner"
                name="ansprechpartner"
                placeholder="Herr Peter Beispiel"
              />
            </Feld>

            <Feld
              id="ablaufdatum"
              beschriftung="Demo läuft ab am"
              hinweis="Leer lassen für unbegrenzt"
            >
              <Input id="ablaufdatum" name="ablaufdatum" type="date" />
            </Feld>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Erscheinungsbild</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <Feld id="primaerfarbe" beschriftung="Primärfarbe">
                <div className="flex items-center gap-2">
                  <input
                    id="primaerfarbe"
                    name="primaerfarbe"
                    type="color"
                    value={primaer}
                    onChange={(e) => setPrimaer(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded border border-input bg-background p-1"
                  />
                  <Input
                    value={primaer}
                    onChange={(e) => setPrimaer(e.target.value)}
                    className="tabellenziffern w-28"
                    aria-label="Primärfarbe als Hex-Wert"
                  />
                </div>
              </Feld>

              <Feld
                id="sekundaerfarbe"
                beschriftung="Sekundärfarbe"
                hinweis="Optional, für Diagramme"
              >
                <Input
                  id="sekundaerfarbe"
                  name="sekundaerfarbe"
                  type="color"
                  defaultValue="#2F7D8C"
                  className="h-9 w-14 cursor-pointer p-1"
                />
              </Feld>
            </div>

            {/* Sofortige Vorschau: So sieht der Chat-Kopf beim Kunden aus. */}
            <div className="overflow-hidden rounded-md border border-border">
              <div className="flex items-center gap-2.5 bg-marke px-3 py-2.5 text-marke-kontrast">
                <span className="flex size-8 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold">
                  {(firma || "MH")
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <div>
                  <p className="text-sm leading-tight font-medium">
                    {firma || "Beispiel Hausverwaltung GmbH"}
                  </p>
                  <p className="text-[11px] opacity-80">Serviceassistent</p>
                </div>
              </div>
              <p className="bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                Vorschau. Die Textfarbe wird automatisch hell oder dunkel gewählt, damit
                sie auf jeder Kundenfarbe lesbar bleibt.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Beispieldaten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Feld
              id="objekte"
              beschriftung="Objekte"
              hinweis="Eine Adresse je Zeile. Echte Straßen aus der Stadt des Kunden wirken am stärksten."
            >
              <textarea
                id="objekte"
                name="objekte"
                rows={4}
                value={objekteBerührt ? objekte : objekteVorschlag}
                onChange={(e) => {
                  setObjekteBerührt(true);
                  setObjekte(e.target.value);
                }}
                placeholder={"Musterstraße 12\nBeispielweg 4"}
                className="w-full rounded-md border border-input px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </Feld>

            <Feld
              id="mitarbeiter"
              beschriftung="Mitarbeitende"
              hinweis="Je Zeile: Name, Rolle, Bereich (technik · buchhaltung · weg · allgemein)"
            >
              <textarea
                id="mitarbeiter"
                name="mitarbeiter"
                rows={4}
                defaultValue={MUSTER_MANDANT.mitarbeiter
                  .map((m) => `${m.name}, ${m.rolle}, ${m.bereich}`)
                  .join("\n")}
                className="w-full rounded-md border border-input px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </Feld>

            <Feld
              id="handwerker"
              beschriftung="Handwerksbetriebe"
              hinweis="Je Zeile: Firma, Gewerk. Der erste Betrieb je Gewerk wird zum Standard."
            >
              <textarea
                id="handwerker"
                name="handwerker"
                rows={5}
                defaultValue={MUSTER_MANDANT.handwerker
                  .map((h) => `${h.firma}, ${h.gewerk}`)
                  .join("\n")}
                className="w-full rounded-md border border-input px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </Feld>

            <Feld id="notfall_telefon" beschriftung="Notfallnummer der Verwaltung">
              <Input
                id="notfall_telefon"
                name="notfall_telefon"
                placeholder="0561 9000000"
              />
            </Feld>
          </CardContent>
        </Card>

        {fehler && (
          <p className="rounded-md bg-prio-notfall-sanft px-3 py-2 text-sm text-prio-notfall">
            {fehler}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" variant="marke" disabled={laeuft}>
            {laeuft ? "Wird angelegt…" : "Demo anlegen"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Beispieldaten werden gleich miterzeugt.
          </p>
        </div>
      </form>
    </div>
  );
}

function Feld({
  id,
  beschriftung,
  hinweis,
  pflicht,
  children,
}: {
  id: string;
  beschriftung: string;
  hinweis?: string;
  pflicht?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {beschriftung}
        {pflicht && <span className="ml-0.5 text-prio-notfall">*</span>}
      </Label>
      {children}
      {hinweis && <p className="text-[11px] text-muted-foreground">{hinweis}</p>}
    </div>
  );
}
