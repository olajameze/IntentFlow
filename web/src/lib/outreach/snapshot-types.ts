import { z } from "zod";

export const snapshotGapSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  detail: z.string(),
  framework: z.string().optional(),
});

export const auditSnapshotPayloadSchema = z.object({
  version: z.literal(1),
  company_name: z.string(),
  website: z.string().nullable(),
  country: z.string(),
  city: z.string().nullable(),
  sector: z.string(),
  market_frameworks: z.array(z.string()),
  overall_score: z.number().int().min(0).max(100),
  score_breakdown: z.object({
    documentation_visibility: z.number().int().min(0).max(100),
    digital_evidence_trail: z.number().int().min(0).max(100),
    qualification_tracking: z.number().int().min(0).max(100),
    audit_readiness_signals: z.number().int().min(0).max(100),
  }),
  gaps: z.array(snapshotGapSchema).min(3).max(5),
  recommendations: z.array(z.string()).min(2).max(3),
  pesttrace_fit: z.string(),
  disclaimer: z.string(),
  generated_at: z.string(),
});

export type SnapshotGap = z.infer<typeof snapshotGapSchema>;
export type AuditSnapshotPayload = z.infer<typeof auditSnapshotPayloadSchema>;

export type ProspectSnapshotMeta = {
  id: string;
  token: string;
  overall_score: number;
  generated_at: string;
};

export function parseSnapshotPayload(raw: unknown): AuditSnapshotPayload | null {
  const parsed = auditSnapshotPayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseProspectSnapshotMeta(raw: unknown): ProspectSnapshotMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.id === "string" &&
    typeof o.token === "string" &&
    typeof o.overall_score === "number" &&
    typeof o.generated_at === "string"
  ) {
    return {
      id: o.id,
      token: o.token,
      overall_score: o.overall_score,
      generated_at: o.generated_at,
    };
  }
  return null;
}
