import { CheckCheckIcon } from "lucide-react";

import { ChatKarte } from "./Karten";
import { DemoFoto } from "./DemoFoto";
import type { ChatNachricht } from "@/lib/chat/typen";
import { cn } from "@/lib/utils";

function uhrzeit(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function Blase({ nachricht }: { nachricht: ChatNachricht }) {
  const eigen = nachricht.von === "mieter";

  // Sicherheitsnetz: Eine Blase ohne Text, Foto und Karte wäre im Gespräch
  // ein leerer Kasten. Lieber gar nichts zeigen als etwas Kaputtes.
  if (!nachricht.text && !nachricht.foto && !nachricht.karte) return null;

  return (
    <div className={cn("flex", eigen ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[85%] rounded-lg px-2.5 py-1.5 shadow-sm sm:max-w-[75%]",
          eigen ? "rounded-br-sm bg-chat-eigen" : "rounded-bl-sm bg-chat-fremd",
        )}
      >
        {nachricht.foto && (
          <DemoFoto
            datei={nachricht.foto}
            beschriftung={nachricht.fotoBeschriftung ?? "Foto"}
            className="mb-1 h-40 w-full rounded-md sm:h-48"
          />
        )}

        {nachricht.text && (
          <p className="text-[15px] leading-snug whitespace-pre-line text-slate-900">
            {nachricht.text}
          </p>
        )}

        {nachricht.karte && <ChatKarte karte={nachricht.karte} />}

        <div className="mt-0.5 flex items-center justify-end gap-1">
          <span className="tabellenziffern text-[11px] text-slate-500">
            {uhrzeit(nachricht.zeit)}
          </span>
          {eigen && (
            <CheckCheckIcon
              className={cn(
                "size-3.5",
                nachricht.gelesen ? "text-chat-haken" : "text-slate-400",
              )}
              aria-label={nachricht.gelesen ? "Gelesen" : "Zugestellt"}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function TippIndikator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-lg rounded-bl-sm bg-chat-fremd px-3 py-2.5 shadow-sm">
        <span className="sr-only">Der Assistent tippt gerade</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-slate-400"
            style={{ animationDelay: `${i * 150}ms`, animationDuration: "1s" }}
          />
        ))}
      </div>
    </div>
  );
}
