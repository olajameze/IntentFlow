import { NextResponse } from "next/server";

const MIGRATION_HINT =
  "Apply the schema: Supabase → SQL Editor → paste and run supabase/migrations/20260512000000_init_marketing_engine.sql (creates businesses, leads, pending_posts, analytics_snapshots, revenue_*).";

/** JSON for 500s from PostgREST — surface in DevTools → Network → Response. */
export function supabaseErrorResponse(error: {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}) {
  const missingObject =
    error.message.includes("does not exist") ||
    error.message.includes("Could not find the table") ||
    error.code === "42P01";

  const authLooksWrong =
    /jwt|invalid api key|permission denied for/i.test(error.message) ||
    error.code === "PGRST301";

  let hint = missingObject ? MIGRATION_HINT : error.hint;
  if (authLooksWrong && !missingObject) {
    hint =
      "Verify NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in web/.env.local (Project Settings → API → service_role secret). Restart next dev after changes.";
  }

  return NextResponse.json(
    {
      error: error.message,
      code: error.code,
      details: error.details,
      hint,
    },
    { status: 500 },
  );
}
