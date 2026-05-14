/**
 * Public Supabase API key for browser + SSR clients.
 * Dashboard labels vary ("publishable" / "anon"); CI may set either env name.
 */
export function resolveNextPublicSupabaseKey(): string | undefined {
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return publishable || anon || undefined;
}
