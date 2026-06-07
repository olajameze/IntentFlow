import { NextResponse } from "next/server";
import { invalidateOutreachStats } from "@/lib/outreach/campaign-stats";
import { queryOutreachProspects } from "@/lib/outreach/prospect-list-query";
import { supabaseErrorResponse } from "@/lib/supabase-error-response";
import { withSupabaseRoute } from "@/lib/with-supabase-route";
import { z } from "zod";

const VALID_STATUSES = ["scraped", "draft_ready", "approved", "rejected", "sent", "bounced", "unsubscribed"] as const;
export async function GET(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const status = searchParams.get("status");
    const country = searchParams.get("country");
    const campaign = searchParams.get("campaign");
    const hotOnly = searchParams.get("hot") === "1";
    const engagementTier = searchParams.get("engagement_tier");
    const fullFields = searchParams.get("fields") === "full";

    if (id) {
      const { data, error } = await sb.from("outreach_prospects").select("*").eq("id", id).maybeSingle();
      if (error) return supabaseErrorResponse(error);
      if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(data);
    }

    try {
      const { data } = await queryOutreachProspects(sb, {
        status,
        country,
        campaign,
        hotOnly,
        engagementTier,
        fullFields,
      });
      return NextResponse.json(data);
    } catch (err) {
      return supabaseErrorResponse(err instanceof Error ? { message: err.message } : { message: String(err) });
    }
  });
}

const patchSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(VALID_STATUSES).optional(),
    email_subject: z.string().min(1).max(200).optional(),
    email_body: z.string().min(1).max(50_000).optional(),
    // Conversion flags (Klaviyo step 9) — operator-set from the dashboard.
    // Pass ``true`` to stamp now; ``false`` to clear; omit to leave unchanged.
    replied: z.boolean().optional(),
    booked: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.status !== undefined ||
      d.email_subject !== undefined ||
      d.email_body !== undefined ||
      d.replied !== undefined ||
      d.booked !== undefined,
    { message: "Provide at least one of: status, email_subject, email_body, replied, booked" },
  );

export async function PATCH(req: Request) {
  const json = await req.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  return withSupabaseRoute(async (sb) => {
    const { id, status, email_subject, email_body, replied, booked } = parsed.data;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };
    if (status !== undefined) updates.status = status;
    if (email_subject !== undefined) updates.email_subject = email_subject;
    if (email_body !== undefined) updates.email_body = email_body;
    if (replied !== undefined) updates.replied_at = replied ? now : null;
    if (booked !== undefined) updates.booked_at = booked ? now : null;

    // For replied/booked stamps we allow updates even on "sent" rows (that's the whole point).
    // For other patches we still block once sent/bounced to avoid editing live drafts.
    const isConversionFlagOnly =
      (replied !== undefined || booked !== undefined) &&
      status === undefined &&
      email_subject === undefined &&
      email_body === undefined;

    let query = sb.from("outreach_prospects").update(updates).eq("id", id);
    if (!isConversionFlagOnly) {
      query = query.not("status", "in", '("sent","bounced")');
    }

    const { data, error } = await query.select("*").maybeSingle();

    if (error) return supabaseErrorResponse(error);
    if (!data) {
      return NextResponse.json(
        { error: "Prospect not found or already sent — refresh the list." },
        { status: 409 },
      );
    }

    // Log conversion events for the KPI panel
    if (replied === true) {
      await sb.from("outreach_email_events").insert({
        prospect_id: id,
        campaign: data.campaign ?? "pesttrace",
        event_type: "reply",
      });
    }
    if (booked === true) {
      await sb.from("outreach_email_events").insert({
        prospect_id: id,
        campaign: data.campaign ?? "pesttrace",
        event_type: "booked",
      });
    }
    if (replied === true || booked === true) {
      invalidateOutreachStats(String(data.campaign ?? "pesttrace"));
    }
    return NextResponse.json(data);
  });
}

export async function DELETE(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get("ids");
    const singleId = searchParams.get("id");
    const ids = idsParam
      ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : singleId
        ? [singleId]
        : [];
    if (!ids.length) return NextResponse.json({ error: "id or ids required" }, { status: 400 });

    const { data, error } = await sb
      .from("outreach_prospects")
      .delete()
      .in("id", ids)
      .select("id, campaign");

    if (error) return supabaseErrorResponse(error);
    const rows = data ?? [];
    if (!rows.length) {
      return NextResponse.json({ ok: true, deleted: 0, alreadyDeleted: true });
    }

    const campaigns = Array.from(new Set(rows.map((r) => String(r.campaign ?? "pesttrace"))));
    campaigns.forEach((campaign) => invalidateOutreachStats(campaign));
    return NextResponse.json({ ok: true, deleted: rows.length });
  });
}
