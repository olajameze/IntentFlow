import type { SupabaseClient } from "@supabase/supabase-js";

const HUBSPOT_BASE = "https://api.hubapi.com";

function token(): string | null {
  return process.env.HUBSPOT_ACCESS_TOKEN?.trim() || null;
}

async function hubspotFetch(path: string, init?: RequestInit): Promise<Response> {
  const t = token();
  if (!t) throw new Error("HUBSPOT_ACCESS_TOKEN not set");
  return fetch(`${HUBSPOT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function testHubSpotConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await hubspotFetch("/crm/v3/objects/contacts?limit=1");
    if (!res.ok) return { ok: false, error: await res.text() };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

type ProspectForSync = {
  id: string;
  email: string;
  name?: string | null;
  campaign?: string | null;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  interested_at?: string | null;
  meeting_booked_at?: string | null;
  booked_at?: string | null;
  converted_at?: string | null;
};

function dealStageForProspect(p: ProspectForSync): string | undefined {
  const campaign = (p.campaign || "pesttrace").toLowerCase();
  if (p.converted_at || p.booked_at) {
    return (
      process.env[`HUBSPOT_DEAL_STAGE_WON_${campaign.toUpperCase()}`]?.trim() ||
      process.env.HUBSPOT_DEAL_STAGE_WON?.trim()
    );
  }
  if (p.meeting_booked_at) {
    return process.env.HUBSPOT_DEAL_STAGE_MEETING?.trim();
  }
  if (p.interested_at) {
    return process.env.HUBSPOT_DEAL_STAGE_QUALIFIED?.trim();
  }
  return process.env.HUBSPOT_DEAL_STAGE_NEW?.trim();
}

export async function syncProspectToHubSpot(
  sb: SupabaseClient,
  prospect: ProspectForSync,
): Promise<{ contactId?: string; dealId?: string; error?: string }> {
  if (!token()) return { error: "HUBSPOT_ACCESS_TOKEN not set" };

  const nameParts = (prospect.name || "").trim().split(/\s+/);
  const firstname = nameParts[0] || prospect.email.split("@")[0];
  const lastname = nameParts.slice(1).join(" ") || "";

  const properties: Record<string, string> = {
    email: prospect.email,
    firstname,
    lastname,
    phone: prospect.phone || "",
    city: prospect.city || "",
    country: prospect.country || "",
    intentflow_campaign: prospect.campaign || "",
    intentflow_prospect_id: prospect.id,
  };

  const { data: state } = await sb
    .from("hubspot_sync_state")
    .select("*")
    .eq("prospect_id", prospect.id)
    .maybeSingle();

  let contactId = state?.hubspot_contact_id as string | undefined;

  try {
    if (contactId) {
      await hubspotFetch(`/crm/v3/objects/contacts/${contactId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties }),
      });
    } else {
      const searchRes = await hubspotFetch("/crm/v3/objects/contacts/search", {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [{ propertyName: "email", operator: "EQ", value: prospect.email }],
            },
          ],
          limit: 1,
        }),
      });
      const searchJson = (await searchRes.json()) as { results?: { id: string }[] };
      contactId = searchJson.results?.[0]?.id;

      if (!contactId) {
        const createRes = await hubspotFetch("/crm/v3/objects/contacts", {
          method: "POST",
          body: JSON.stringify({ properties }),
        });
        if (!createRes.ok) throw new Error(await createRes.text());
        const created = (await createRes.json()) as { id: string };
        contactId = created.id;
      }
    }

    let dealId = state?.hubspot_deal_id as string | undefined;
    const stage = dealStageForProspect(prospect);
    const pipeline = process.env.HUBSPOT_PIPELINE_ID?.trim();

    if (stage && pipeline && !dealId) {
      const dealRes = await hubspotFetch("/crm/v3/objects/deals", {
        method: "POST",
        body: JSON.stringify({
          properties: {
            dealname: `${prospect.name || prospect.email} — ${prospect.campaign}`,
            pipeline,
            dealstage: stage,
          },
          associations: contactId
            ? [
                {
                  to: { id: contactId },
                  types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
                },
              ]
            : [],
        }),
      });
      if (dealRes.ok) {
        const deal = (await dealRes.json()) as { id: string };
        dealId = deal.id;
      }
    } else if (dealId && stage) {
      await hubspotFetch(`/crm/v3/objects/deals/${dealId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: { dealstage: stage } }),
      });
    }

    await sb.from("hubspot_sync_state").upsert({
      prospect_id: prospect.id,
      hubspot_contact_id: contactId,
      hubspot_deal_id: dealId ?? state?.hubspot_deal_id,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    });

    return { contactId, dealId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("hubspot_sync_state").upsert({
      prospect_id: prospect.id,
      hubspot_contact_id: contactId ?? null,
      hubspot_deal_id: state?.hubspot_deal_id ?? null,
      last_error: msg,
      updated_at: new Date().toISOString(),
    });
    return { error: msg };
  }
}

/** Stop IntentFlow sequence when HubSpot deal closes lost. */
export async function handleHubSpotDealUpdate(
  sb: SupabaseClient,
  payload: { prospectId?: string; dealStage?: string; email?: string },
): Promise<void> {
  const lostStages = (process.env.HUBSPOT_DEAL_STAGE_LOST || "closedlost")
    .split(",")
    .map((s) => s.trim().toLowerCase());

  if (!payload.dealStage || !lostStages.includes(payload.dealStage.toLowerCase())) return;

  let prospectId = payload.prospectId;
  if (!prospectId && payload.email) {
    const { data } = await sb
      .from("outreach_prospects")
      .select("id")
      .eq("email", payload.email.toLowerCase())
      .limit(1)
      .maybeSingle();
    prospectId = data?.id;
  }
  if (!prospectId) return;

  await sb
    .from("outreach_prospects")
    .update({ next_send_at: null, status: "unsubscribed", updated_at: new Date().toISOString() })
    .eq("id", prospectId);
}
