import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Supabase-Client mit Service-Role-Rechten.
 *
 * Umgeht sämtliche RLS-Regeln. Ausschließlich in Route Handlern und
 * Server Actions verwenden – niemals in einer Client Component importieren.
 * Das `server-only`-Paket oben lässt den Build fehlschlagen, falls das doch
 * einmal passiert.
 */
export function supabaseAdmin() {
  const schluessel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!schluessel) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY fehlt. Bitte in .env.local bzw. in den " +
        "Vercel-Umgebungsvariablen hinterlegen (siehe .env.example).",
    );
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, schluessel, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
