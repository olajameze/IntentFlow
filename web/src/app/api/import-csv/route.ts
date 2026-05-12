import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function parseCsvLoose(text: string): Record<string, string>[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const businessId = form.get("business_id");
  const file = form.get("file");
  if (typeof businessId !== "string" || !businessId) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const text = await file.text();
  const rows = parseCsvLoose(text);
  const sb = getSupabaseAdmin();
  const inserts = rows.slice(0, 500).map((r) => {
    const amount = Number(r.amount ?? r.gross ?? "0") || 0;
    return {
      business_id: businessId,
      amount,
      currency: r.currency || "GBP",
      source: "merged_csv" as const,
      description: r.description || null,
      entry_date: r.date || new Date().toISOString().slice(0, 10),
      customer_name: r.customer || r.name || null,
      net_amount: Number(r.net ?? amount) || amount,
    };
  });
  if (!inserts.length) {
    return NextResponse.json({ error: "No rows detected" }, { status: 400 });
  }
  const { data, error } = await sb.from("revenue_entries").insert(inserts).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ imported: data?.length ?? 0 });
}
