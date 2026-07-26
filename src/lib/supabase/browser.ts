import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase-Client für Client Components.
 * Nutzt ausschließlich den öffentlichen Anon-Key und darf daher nur lesen,
 * was die RLS-Regeln freigeben. Wird vor allem für Realtime-Abos gebraucht,
 * damit im Dashboard live auftaucht, was im Chat entsteht.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
