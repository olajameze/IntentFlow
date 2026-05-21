import { NextResponse } from "next/server";
import { supabaseErrorResponse } from "@/lib/supabase-error-response";
import { withSupabaseRoute } from "@/lib/with-supabase-route";
import { z } from "zod";

const VALID_STATUSES = ["scraped", "draft_ready", "approved", "rejected", "sent", "bounced", "unsubscribed"] as const;
const VALID_CAMPAIGNS = ["pesttrace", "weathers"] as const;

export async function GET(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const country = searchParams.get("country");
    const campaign = searchParams.get("campaign");

    let query = sb
      .from("outreach_prospects")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (status) query = query.eq("status", status);
    if (country) query = query.eq("country", country.toUpperCase());
    if (campaign && (VALID_CAMPAIGNS as readonly string[]).includes(campaign)) {
      query = query.eq("campaign", campaign);
    }

    const { data, error } = await query;
    if (error) return supabaseErrorResponse(error);
    return NextResponse.json(data ?? []);
  });
}

const patchSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(VALID_STATUSES).optional(),
    email_subject: z.string().min(1).max(200).optional(),
    email_body: z.string().min(1).max(50_000).optional(),
  })
  .refine((d) => d.status !== undefined || d.email_subject !== undefined || d.email_body !== undefined, {
    message: "Provide at least one of: status, email_subject, email_body",
  });

export async function PATCH(req: Request) {
  const json = await req.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  return withSupabaseRoute(async (sb) => {
    const { id, status, email_subject, email_body } = parsed.data;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status !== undefined) updates.status = status;
    if (email_subject !== undefined) updates.email_subject = email_subject;
    if (email_body !== undefined) updates.email_body = email_body;

    const { data, error } = await sb
      .from("outreach_prospects")
      .update(updates)
      .eq("id", id)
      .not("status", "in", '("sent","bounced")')
      .select("*")
      .maybeSingle();

    if (error) return supabaseErrorResponse(error);
    if (!data) {
      return NextResponse.json(
        { error: "Prospect not found or already sent — refresh the list." },
        { status: 409 },
      );
    }
    return NextResponse.json(data);
  });
}

export async function DELETE(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { error } = await sb
      .from("outreach_prospects")
      .delete()
      .eq("id", id)
      .not("status", "eq", "sent"); // keep sent records for audit

    if (error) return supabaseErrorResponse(error);
    return NextResponse.json({ ok: true });
  });
}
