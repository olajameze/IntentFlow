import { createBrowserClient } from "@supabase/ssr";
import { resolveNextPublicSupabaseKey } from "@/lib/resolve-next-public-supabase-key";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = resolveNextPublicSupabaseKey();

export function createClient() {
  return createBrowserClient(supabaseUrl!, supabaseKey!);
}
