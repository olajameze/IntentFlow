import { NextResponse } from "next/server";
import { supabaseErrorResponse } from "@/lib/supabase-error-response";
import { withSupabaseRoute } from "@/lib/with-supabase-route";
import { z } from "zod";

const revenueEntrySchema = z.object({
  business_id: z.string().uuid(),
  amount: z.number(),
  currency: z.string().default("GBP"),
  source: z.enum(["stripe", "paypal", "bank_transfer", "cash", "invoice", "manual", "merged_csv", "other"]),
  source_transaction_id: z.string().optional(),
  fees: z.number().optional(),
  net_amount: z.number().optional(),
  customer_name: z.string().optional(),
  description: z.string().optional(),
  entry_date: z.string(),
});

export async function GET(req: Request) {
  return withSupabaseRoute(async (sb) => {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("business_id");
    let query = sb.from("revenue_entries").select("*").order("entry_date", { ascending: false }).limit(500);
    if (businessId) query = query.eq("business_id", businessId);
    const { data, error } = await query;
    if (error) return supabaseErrorResponse(error);
    return NextResponse.json(data ?? []);
  });
}

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = revenueEntrySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return withSupabaseRoute(async (sb) => {
    const payload = {
      ...parsed.data,
      net_amount: parsed.data.net_amount ?? parsed.data.amount,
    };
    const { data, error } = await sb.from("revenue_entries").insert(payload).select("*").single();
    if (error) return supabaseErrorResponse(error);
    return NextResponse.json(data);
  });
}
