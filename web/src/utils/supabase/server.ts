import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolveNextPublicSupabaseKey } from "@/lib/resolve-next-public-supabase-key";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = resolveNextPublicSupabaseKey();

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — middleware keeps sessions fresh.
        }
      },
    },
  });
}
