import { TechnikSchalter } from "./TechnikSchalter";
import { ZuruecksetzenKnopf } from "./ZuruecksetzenKnopf";

/**
 * Kennzeichnung jeder Demo-Seite.
 *
 * Bewusst als schmale Leiste über allem statt als schwebendes Abzeichen:
 * Sie ist immer sichtbar, verdeckt nichts und wirkt wie ein bewusster Hinweis
 * und nicht wie ein Aufkleber, den man wegklicken soll. Wer eine Demo zeigt,
 * sollte das auch sagen – das schafft Vertrauen, statt es zu kosten.
 *
 * Die erste Fassung war zu leise: graue Schrift auf dunklem Grund, elf Pixel.
 * Beim Mitlesen ist sie schlicht übersehen worden. Deshalb jetzt ein Feld in
 * Bernstein mit dem Wort DEMO und eine farbige Kante nach unten. Bernstein
 * und nicht die Mandantenfarbe: Der Hinweis "das ist eine Vorführung" darf
 * nicht wie ein Teil des Produkts aussehen, sondern muss sich davon absetzen.
 * Dieselbe Farbe trägt auch die geführte Tour – alles Bernsteinfarbene gehört
 * zur Vorführung, alles in der Mandantenfarbe zum Produkt.
 */
export function DemoLeiste({
  slug,
  hinweis,
  zuruecksetzenZeigen,
}: {
  slug: string;
  hinweis?: string;
  /** Nur für uns sichtbar machen, wenn eine Datenbank angebunden ist. */
  zuruecksetzenZeigen?: boolean;
}) {
  return (
    <div
      // Die Tour misst diese Leiste, damit ihr Hinweis nicht darauf rutscht.
      data-demo-leiste
      className="flex items-center justify-center gap-2 border-b-2 border-demo bg-slate-900 px-3 py-1.5 text-center text-xs font-medium text-slate-300 sm:gap-3"
    >
      <span className="shrink-0 rounded-sm bg-demo px-1.5 py-0.5 text-[10px] leading-4 font-bold tracking-[0.14em] text-slate-900 uppercase">
        Demo
      </span>
      {/* Bewusst umbrechend statt abgeschnitten: "truncate" erzwingt eine
          Zeile, und deren Mindestbreite schob auf dem Telefon die ganze Seite
          nach rechts aus dem Bild. Zwei Zeilen sind das kleinere Übel. */}
      <span className="min-w-0">
        Beispieldaten, keine echten Mieter{hinweis ? ` · ${hinweis}` : ""}
      </span>
      {/* Nur für uns: macht im Chat sichtbar, welcher Schritt später an ein
          Modell geht. Vor einem Kunden bleibt sie aus. */}
      <TechnikSchalter />
      {zuruecksetzenZeigen && <ZuruecksetzenKnopf slug={slug} />}
    </div>
  );
}
