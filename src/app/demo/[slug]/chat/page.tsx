import { notFound } from "next/navigation";

import { ChatFenster } from "@/components/chat/ChatFenster";
import { mandantLaden } from "@/lib/daten/quelle";

export default async function ChatSeite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const mandant = await mandantLaden(slug);
  if (!mandant) notFound();

  return <ChatFenster mandant={mandant} />;
}
