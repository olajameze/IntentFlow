import { createClient } from "@supabase/supabase-js";

export function createSeedAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function seedPendingPost(opts?: { platform?: string }): Promise<{ id: string; marker: string; businessId: string }> {
  const sb = createSeedAdmin();
  if (!sb) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for seeding.");
  }
  const { data: biz, error: bizErr } = await sb
    .from("businesses")
    .select("id")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (bizErr || !biz) {
    throw new Error(`No active business row to attach pending_posts to: ${bizErr?.message ?? "empty"}`);
  }
  const marker = `e2e ${crypto.randomUUID()}`;
  const platform = opts?.platform ?? "linkedin";
  const { data: inserted, error: insErr } = await sb
    .from("pending_posts")
    .insert({
      business_id: biz.id,
      platform,
      content: marker,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr || !inserted) throw insErr ?? new Error("insert pending_posts failed");
  return { id: String(inserted.id), marker, businessId: String(biz.id) };
}

export async function deletePendingPost(id: string): Promise<void> {
  const sb = createSeedAdmin();
  if (!sb) return;
  await sb.from("pending_posts").delete().eq("id", id);
}

export async function getPostStatus(id: string): Promise<string | null> {
  const sb = createSeedAdmin();
  if (!sb) return null;
  const { data } = await sb.from("pending_posts").select("status").eq("id", id).maybeSingle();
  return data ? String((data as { status?: string }).status ?? "") : null;
}

/** Sets status to approved (for exercising publish-approved without UI approve first). */
export async function approvePostViaServiceRole(id: string): Promise<void> {
  const sb = createSeedAdmin();
  if (!sb) throw new Error("Cannot approve post: seed admin client unavailable.");
  const { error } = await sb
    .from("pending_posts")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
