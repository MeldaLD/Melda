"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayersIcon, MessageCircleIcon } from "lucide-react";

import { ansichtTexte } from "@config/ansicht";
import { beispieleUmschalten } from "@/app/demo/[slug]/aktionen";
import { Button } from "@/components/ui/button";
import type { Ansicht } from "@/lib/daten/typen";

/**
 * Die Leiste über der Übersicht: Was sehe ich hier gerade?
 *
 * Ohne sie wäre die aufgeräumte Übersicht ein Rätsel – der Betrachter würde
 * eine leere Liste für einen Fehler halten statt für die Aussage, die sie
 * ist. Mit ihr wird der Zusammenhang zwischen Chat und Übersicht zur
 * sichtbaren Mechanik: Hier steht nur, was hereinkam.
 */
export function Datenumschalter({ slug, ansicht }: { slug: string; ansicht: Ansicht }) {
  const router = useRouter();
  const [laeuft, starten] = useTransition();

  if (!ansicht.umschaltbar) return null;

  const umschalten = (zeigen: boolean) =>
    starten(async () => {
      await beispieleUmschalten(slug, zeigen);
      router.refresh();
    });

  // Noch nichts gemeldet: Das ist kein leerer Zustand, sondern die Einladung,
  // den Chat zu benutzen. Deshalb steht hier der Weg dorthin und nicht nur
  // eine Erklärung.
  if (ansicht.nurEigene && ansicht.eigene === 0) {
    return (
      <Rahmen hervorgehoben>
        <div className="w-full sm:w-auto sm:min-w-0 sm:flex-1">
          <p className="text-sm font-medium">{ansichtTexte.leer.titel}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {ansichtTexte.leer.text}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild size="sm" variant="marke">
            <Link href={`/demo/${slug}/chat`}>
              <MessageCircleIcon />
              {ansichtTexte.leer.zumChat}
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={laeuft}
            onClick={() => umschalten(true)}
          >
            {ansichtTexte.fokus.laden}
          </Button>
        </div>
      </Rahmen>
    );
  }

  return (
    <Rahmen>
      {/* Auf dem Telefon nimmt der Satz die ganze Zeile und der Knopf rutscht
          darunter – sonst quetscht sich der Text auf vier Zeilen. */}
      <p className="w-full text-sm text-muted-foreground sm:w-auto sm:min-w-0 sm:flex-1">
        {ansicht.nurEigene
          ? ansichtTexte.fokus.text(ansicht.eigene, ansicht.ausgeblendet)
          : ansichtTexte.voll.text(ansicht.eigene)}
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={laeuft}
        className="shrink-0"
        onClick={() => umschalten(ansicht.nurEigene)}
      >
        <LayersIcon />
        {ansicht.nurEigene ? ansichtTexte.fokus.laden : ansichtTexte.voll.ausblenden}
      </Button>
    </Rahmen>
  );
}

function Rahmen({
  hervorgehoben,
  children,
}: {
  hervorgehoben?: boolean;
  children: React.ReactNode;
}) {
  // Ohne eigenen Außenabstand: Die Seite, die sie einsetzt, bestimmt den
  // Rhythmus – sonst kämpfen zwei Abstandsregeln gegeneinander.
  return (
    <div
      className={
        hervorgehoben
          ? "flex flex-wrap items-start gap-3 rounded-lg border border-marke-rand bg-marke-sanft p-4"
          : "flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border bg-white px-4 py-2.5"
      }
    >
      {children}
    </div>
  );
}
