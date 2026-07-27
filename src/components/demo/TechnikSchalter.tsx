"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CpuIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Name des Abfrageparameters, der die Technikansicht einschaltet. */
export const TECHNIK_PARAMETER = "technik";

/**
 * Schaltet die Technikansicht im Mieter-Chat ein und aus.
 *
 * Der Zustand hängt an der Adresse (?technik=1) und nicht an einem Zustand
 * im Speicher. Drei Gründe: Er übersteht das Neuladen, er lässt sich als
 * Link weitergeben ("mach das mal auf, dann siehst du es"), und er ist beim
 * Vorführen vor einem Kunden nachweislich aus, statt vielleicht noch von
 * gestern eingeschaltet.
 */
export function TechnikSchalter() {
  const pfad = usePathname();
  const parameter = useSearchParams();
  const an = parameter.get(TECHNIK_PARAMETER) === "1";

  const naechste = new URLSearchParams(parameter.toString());
  if (an) naechste.delete(TECHNIK_PARAMETER);
  else naechste.set(TECHNIK_PARAMETER, "1");
  const anhang = naechste.toString();

  return (
    <Link
      href={anhang ? `${pfad}?${anhang}` : pfad}
      // Kein Seitenwechsel: Der Chatverlauf soll beim Umschalten stehen
      // bleiben, sonst muss man ihn jedes Mal neu durchspielen.
      scroll={false}
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors",
        an ? "bg-white/15 text-white" : "text-slate-400 hover:text-slate-200",
      )}
      title={
        an ? "Technikansicht ausschalten" : "Zeigt unter jeder Antwort, wer sie erzeugt"
      }
    >
      <CpuIcon className="size-3 shrink-0" aria-hidden />
      Technik
    </Link>
  );
}
