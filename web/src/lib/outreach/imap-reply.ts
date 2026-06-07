import type { SupabaseClient } from "@supabase/supabase-js";
import { handleInboundReply } from "@/lib/outreach/reply-handler";
import { outreachLog } from "@/lib/outreach/logger";

export function normalizeMessageId(id: string): string {
  return id.trim().replace(/^<|>$/g, "").toLowerCase();
}

export function parseMessageIdList(header: string | undefined): string[] {
  if (!header?.trim()) return [];
  const matches = header.match(/<[^>]+>|[^\s,<>]+@[^\s,<>]+/g) ?? [];
  return matches.map((m) => normalizeMessageId(m));
}

export function extractEmailAddress(fromHeader: string): string | null {
  const angle = fromHeader.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  const bare = fromHeader.trim().toLowerCase();
  return bare.includes("@") ? bare : null;
}

export function stripReplyBody(source: string): string {
  const headerEnd = source.indexOf("\r\n\r\n");
  let body = headerEnd >= 0 ? source.slice(headerEnd + 4) : source;
  if (body.includes("\n\n") && headerEnd < 0) {
    body = body.split("\n\n").slice(1).join("\n\n");
  }
  body = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return body.slice(0, 8000);
}

export function parseImapMessageSource(source: string): {
  fromEmail: string | null;
  inReplyToIds: string[];
  referenceIds: string[];
  subject: string;
  bodyText: string;
} {
  const headerEnd = source.indexOf("\r\n\r\n");
  const headers = headerEnd >= 0 ? source.slice(0, headerEnd) : source;
  const getHeader = (name: string): string => {
    const re = new RegExp(`^${name}:\\s*(.+)$`, "im");
    const match = headers.match(re);
    return match?.[1]?.trim() ?? "";
  };

  const fromEmail = extractEmailAddress(getHeader("From"));
  const inReplyToIds = parseMessageIdList(getHeader("In-Reply-To"));
  const referenceIds = parseMessageIdList(getHeader("References"));
  const subject = getHeader("Subject");
  const bodyText = stripReplyBody(source);

  return { fromEmail, inReplyToIds, referenceIds, subject, bodyText };
}

type ProspectRow = {
  id: string;
  campaign: string;
  email: string;
  raw?: { last_send?: { message_id?: string } } | null;
};

export function correlateProspectByReply(
  prospects: ProspectRow[],
  fromEmail: string | null,
  inReplyToIds: string[],
  referenceIds: string[],
): ProspectRow | null {
  const threadIds = new Set([...inReplyToIds, ...referenceIds]);
  if (threadIds.size > 0) {
    for (const p of prospects) {
      const mid = p.raw?.last_send?.message_id;
      if (mid && threadIds.has(normalizeMessageId(mid))) return p;
    }
  }
  if (fromEmail) {
    const match = prospects.find((p) => p.email?.toLowerCase() === fromEmail);
    if (match) return match;
  }
  return null;
}

export type ImapPollResult = {
  processed: number;
  matched: number;
  unsubscribed: number;
  skipped: number;
  errors: string[];
};

/** Poll UNSEEN messages from INBOX (last 48h) and process replies. */
export async function pollImapReplies(
  sb: SupabaseClient,
  config: { host: string; user: string; password: string },
): Promise<ImapPollResult> {
  const { ImapFlow } = await import("imapflow");
  const result: ImapPollResult = { processed: 0, matched: 0, unsubscribed: 0, skipped: 0, errors: [] };

  const client = new ImapFlow({
    host: config.host,
    port: 993,
    secure: true,
    auth: { user: config.user, pass: config.password },
    logger: false,
  });

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const { data: prospectPool } = await sb
    .from("outreach_prospects")
    .select("id, campaign, email, raw")
    .in("status", ["sent", "replied"])
    .order("updated_at", { ascending: false })
    .limit(500);

  const pool = (prospectPool ?? []) as ProspectRow[];

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    for await (const msg of client.fetch(
      { seen: false, since },
      { uid: true, source: true },
    )) {
      result.processed += 1;
      try {
        const source = msg.source?.toString("utf8") ?? "";
        if (!source) {
          result.skipped += 1;
          continue;
        }

        const parsed = parseImapMessageSource(source);
        if (!parsed.fromEmail) {
          result.skipped += 1;
          await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"]);
          continue;
        }

        const prospect = correlateProspectByReply(
          pool,
          parsed.fromEmail,
          parsed.inReplyToIds,
          parsed.referenceIds,
        );

        if (!prospect) {
          result.skipped += 1;
          await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"]);
          continue;
        }

        const handled = await handleInboundReply(sb, {
          prospectId: prospect.id,
          campaign: String(prospect.campaign || "pesttrace"),
          fromEmail: parsed.fromEmail,
          bodyText: parsed.bodyText,
          subject: parsed.subject,
        });

        if (handled.ok) {
          result.matched += 1;
          if (handled.unsubscribed) result.unsubscribed += 1;
        }

        await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"]);
      } catch (e) {
        result.errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  } finally {
    lock.release();
  }

  await client.logout();

  outreachLog({
    level: "info",
    event: "imap_poll_complete",
    campaign: "all",
    issues: [
      `processed=${result.processed}`,
      `matched=${result.matched}`,
      `unsubscribed=${result.unsubscribed}`,
    ],
  });

  return result;
}
