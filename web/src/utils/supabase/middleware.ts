import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/** Supabase SSR stores sessions in `sb-<ref>-auth-token` (optionally chunked as `.0`, `.1`, …). */
function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-[a-z0-9_-]+-auth-token(\.[0-9]+)?$/i.test(c.name));
}

/**
 * Refreshes the auth session by touching `getUser()` and forwards updated cookies.
 * Never throws — missing env or Supabase errors fall back to passthrough so /_next assets never 500.
 *
 * Anonymous visitors (typical MVP: API routes use service role; no login yet) skip the extra
 * network round-trip to Supabase Auth on every navigation.
 */
export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next({
      request: { headers: request.headers },
    });
  }

  if (!hasSupabaseAuthCookie(request)) {
    return NextResponse.next({
      request: { headers: request.headers },
    });
  }

  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  });

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });

    await supabase.auth.getUser();
  } catch {
    return NextResponse.next({
      request: { headers: request.headers },
    });
  }

  return supabaseResponse;
}
