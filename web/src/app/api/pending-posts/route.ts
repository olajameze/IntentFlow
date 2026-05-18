import { NextResponse } from "next/server";
import { supabaseErrorResponse } from "@/lib/supabase-error-response";
import { withSupabaseRoute } from "@/lib/with-supabase-route";
import { z } from "zod";

export async function GET(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "pending";
    const businessId = searchParams.get("business_id");
    let query = sb.from("pending_posts").select("*").order("created_at", { ascending: false }).limit(200);
    if (status) query = query.eq("status", status);
    if (businessId) query = query.eq("business_id", businessId);
    const { data, error } = await query;
    if (error) return supabaseErrorResponse(error);
    return NextResponse.json(data ?? []);
  });
}

const updateSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["approved", "rejected"]).optional(),
    content: z.string().min(1).max(12_000).optional(),
    scheduled_at: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine((d) => d.status !== undefined || d.content !== undefined || d.scheduled_at !== undefined, {
    message: "Provide at least one of: status, content, scheduled_at",
  });

export async function PATCH(req: Request) {
  const json = await req.json();
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return withSupabaseRoute(async (sb) => {
    const { id, status, content, scheduled_at } = parsed.data;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (content !== undefined) updates.content = content;
    if (status !== undefined) updates.status = status;
    if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at;

    const q = sb.from("pending_posts").update(updates).eq("id", id).eq("status", "pending");
    const { data, error } = await q.select("*").maybeSingle();
    if (error) return supabaseErrorResponse(error);
    if (!data) {
      return NextResponse.json(
        { error: "Post not found or already processed — refresh the list." },
        { status: 409 },
      );
    }
    return NextResponse.json(data);
  });
}
