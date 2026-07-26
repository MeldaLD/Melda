import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase-Client für Server Components und Route Handler – lesend.
 * Ebenfalls nur mit dem Anon-Key, also durch RLS begrenzt.
 * Für schreibende Zugriffe siehe `supabaseAdmin()` in ./admin.
 */
export async function supabaseServer() {
  const cookieSpeicher = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieSpeicher.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieSpeicher.set(name, value, options),
            );
          } catch {
            // In Server Components ist Schreiben nicht erlaubt – unkritisch,
            // wir nutzen ohnehin keine Supabase-Auth-Sitzungen.
          }
        },
      },
    },
  );
}
