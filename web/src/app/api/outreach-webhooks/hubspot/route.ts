import { NextResponse } from "next/server";
import { handleHubSpotDealUpdate } from "@/lib/integrations/hubspot";
import { withSupabaseRoute } from "@/lib/with-supabase-route";

/** POST — HubSpot deal property change (simplified payload) */
export async function POST(req: Request) {
  const secret = process.env.HUBSPOT_WEBHOOK_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization")?.replace("Bearer ", "") || "";
    if (auth !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    prospect_id?: string;
    email?: string;
    dealstage?: string;
    properties?: { dealstage?: { value?: string } };
  };

  const dealStage = body.dealstage || body.properties?.dealstage?.value;

  return withSupabaseRoute(async (sb) => {
    await handleHubSpotDealUpdate(sb, {
      prospectId: body.prospect_id,
      email: body.email,
      dealStage,
    });
    return NextResponse.json({ ok: true });
  });
}

export const dynamic = "force-dynamic";
