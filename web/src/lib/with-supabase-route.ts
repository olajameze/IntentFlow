import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Wraps API handlers so missing env / Supabase errors return JSON the browser can read.
 */
export async function withSupabaseRoute(
  handler: (sb: SupabaseClient) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const sb = getSupabaseAdmin();
    return await handler(sb);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    const missingEnv =
      msg.includes("SUPABASE_SERVICE_ROLE_KEY") || msg.includes("NEXT_PUBLIC_SUPABASE_URL");
    return NextResponse.json(
      {
        error: msg,
        ...(missingEnv && {
          hint:
            "Add SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL to web/.env.local (Supabase → Project Settings → API → service_role). Restart next dev after saving.",
        }),
      },
      { status: 503 },
    );
  }
}
