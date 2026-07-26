import { notFound } from "next/navigation";

import { ChatFenster } from "@/components/chat/ChatFenster";
import type { ChatNutzer } from "@/components/chat/NutzerAuswahl";
import { bestandLaden } from "@/lib/daten/quelle";

export default async function ChatSeite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ergebnis = await bestandLaden(slug);
  if (!ergebnis) notFound();

  const { bestand } = ergebnis;

  // Fünf Wohnungen zur Auswahl, gestreut über die Objekte – eine Liste mit
  // 38 Einträgen würde beim Einstieg nur erschlagen.
  const nutzer: ChatNutzer[] = bestand.objekte
    .flatMap((objekt) => {
      const einheiten = bestand.einheiten.filter((e) => e.objekt_id === objekt.id);
      return einheiten.slice(0, 2).map((einheit) => ({
        einheitId: einheit.id,
        name: einheit.mieter_name,
        objekt: objekt.name,
        lage: einheit.bezeichnung,
        telefon: einheit.mieter_telefon,
      }));
    })
    .slice(0, 5);

  return <ChatFenster mandant={bestand.mandant} nutzer={nutzer} />;
}
