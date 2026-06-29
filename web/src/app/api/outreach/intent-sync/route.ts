import { NextResponse } from "next/server";

/** POST — cron: Umami intent sync removed; use outreach conversion webhook instead. */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (expected) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.json(
    {
      ok: false,
      ingested: 0,
      error: "Umami removed",
      hint: "Site-intent UTM matching via Umami is no longer available. Use the outreach conversion webhook instead.",
    },
    { status: 410 },
  );
}

export const dynamic = "force-dynamic";
