import type { SupabaseClient } from "@supabase/supabase-js";

export type OperatorRole = "admin" | "operator" | "viewer";

/** Write operator audit log entry (best-effort). */
export async function logOperatorAudit(
  sb: SupabaseClient,
  input: {
    userId?: string | null;
    action: string;
    resourceType?: string;
    resourceId?: string;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await sb.from("operator_audit_log").insert({
      user_id: input.userId ?? null,
      action: input.action,
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      detail: input.detail ?? {},
    });
  } catch {
    /* non-fatal */
  }
}

/** Ensure operator_profiles row exists for authenticated user. */
export async function ensureOperatorProfile(
  sb: SupabaseClient,
  userId: string,
  email?: string | null,
  role: OperatorRole = "operator",
): Promise<void> {
  const { data: existing } = await sb.from("operator_profiles").select("user_id").eq("user_id", userId).maybeSingle();
  if (existing) return;
  await sb.from("operator_profiles").insert({
    user_id: userId,
    email: email ?? null,
    role,
  });
}

export function isAuthRequired(): boolean {
  return process.env.OUTREACH_REQUIRE_AUTH === "1";
}

export const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/auth/",
  "/r/",
  "/api/outreach-track/",
  "/api/outreach-webhooks/",
  "/api/outreach-conversion",
  "/api/health",
] as const;

export function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/_next/")) return true;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}
