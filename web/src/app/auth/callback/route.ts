import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { ensureOperatorProfile } from "@/lib/auth/operator";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const admin = getSupabaseAdmin();
        await ensureOperatorProfile(admin, user.id, user.email);
      }
      return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : `/${next}`}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
