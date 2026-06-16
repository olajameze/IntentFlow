import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "@/utils/supabase/middleware";
import { isAuthRequired, isPublicPath } from "@/lib/auth/operator";
import { resolveNextPublicSupabaseKey } from "@/lib/resolve-next-public-supabase-key";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/_next/")) {
    return NextResponse.next();
  }

  try {
    const response = await updateSession(request);

    const cronSecret = process.env.CRON_SECRET?.trim();
    const authHeader = request.headers.get("authorization") || "";
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      return response;
    }

    if (!isAuthRequired() || isPublicPath(request.nextUrl.pathname)) {
      return response;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = resolveNextPublicSupabaseKey();
    if (!supabaseUrl || !supabaseKey) return response;

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (user) return response;

    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  } catch (e) {
    console.error("[middleware]", e);
    return NextResponse.next({
      request: { headers: request.headers },
    });
  }
}

export const config = {
  matcher: [
    "/((?!_next/|favicon.ico|.*\\.(?:svg|ico|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
