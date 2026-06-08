import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getPublicBaseUrl } from "@/lib/outreach/public-base-url";
import {
  parseSnapshotPayload,
  type AuditSnapshotPayload,
} from "@/lib/outreach/snapshot-types";
import {
  isSnapshotToken,
  pesttraceTrialUrl,
  recordSnapshotView,
  scoreBand,
  trackedClickUrl,
} from "@/lib/outreach/snapshot-view";
import styles from "./snapshot.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: { token: string } };

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.scoreBar}>
      <div className={styles.scoreBarHeader}>
        <span>{label}</span>
        <span className={styles.scoreBarValue}>{value}/100</span>
      </div>
      <div className={styles.scoreBarTrack}>
        <progress value={value} max={100} aria-label={`${label}: ${value} out of 100`} />
      </div>
    </div>
  );
}

function GapCard({ gap }: { gap: AuditSnapshotPayload["gaps"][number] }) {
  return (
    <div className={styles.gapCard}>
      <div className={styles.gapMeta}>
        <span className={styles.severity} data-severity={gap.severity}>
          {gap.severity}
        </span>
        {gap.framework ? <span className={styles.framework}>{gap.framework}</span> : null}
      </div>
      <h3 className={styles.gapTitle}>{gap.title}</h3>
      <p className={styles.gapDetail}>{gap.detail}</p>
    </div>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const token = params.token?.trim() ?? "";
  if (!isSnapshotToken(token)) return { title: "Snapshot not found" };
  try {
    const sb = getSupabaseAdmin();
    const { data: row } = await sb
      .from("outreach_snapshots")
      .select("payload")
      .eq("token", token)
      .maybeSingle();
    const payload = parseSnapshotPayload(row?.payload);
    if (payload) {
      return { title: `${payload.company_name} — Audit Readiness Snapshot` };
    }
  } catch {
    /* ignore */
  }
  return { title: "Audit Readiness Snapshot" };
}

export default async function SnapshotPage({ params }: Props) {
  const token = params.token?.trim() ?? "";
  if (!isSnapshotToken(token)) notFound();

  const sb = getSupabaseAdmin();
  const { data: row, error } = await sb
    .from("outreach_snapshots")
    .select("prospect_id, campaign, payload, overall_score")
    .eq("token", token)
    .maybeSingle();

  if (error || !row || row.campaign !== "pesttrace") notFound();

  const payload = parseSnapshotPayload(row.payload);
  if (!payload) notFound();

  const viewMeta = await recordSnapshotView(sb, token);
  const prospectId = viewMeta?.prospectId ?? row.prospect_id;
  const baseUrl = getPublicBaseUrl();
  const trialUrl = pesttraceTrialUrl(prospectId);
  const ctaHref = baseUrl ? trackedClickUrl(prospectId, trialUrl, baseUrl) : trialUrl;

  const band = scoreBand(payload.overall_score);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>PestTrace — Audit Readiness Snapshot</div>
        <div className={styles.card}>
          <h1 className={styles.title}>{payload.company_name}</h1>
          {payload.website ? <p className={styles.website}>{payload.website}</p> : null}

          <div className={styles.scoreBlock}>
            <div className={styles.scoreLabel}>Overall score</div>
            <div className={styles.scoreValue} data-band={band}>
              {payload.overall_score}
              <span className={styles.scoreDenom}>/100</span>
            </div>
          </div>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Market context</h2>
            <p className={styles.bodyText}>
              Frameworks relevant to {payload.country}: {payload.market_frameworks.join(", ")}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Score breakdown</h2>
            <ScoreBar label="Documentation visibility" value={payload.score_breakdown.documentation_visibility} />
            <ScoreBar label="Digital evidence trail" value={payload.score_breakdown.digital_evidence_trail} />
            <ScoreBar label="Qualification tracking" value={payload.score_breakdown.qualification_tracking} />
            <ScoreBar label="Audit readiness signals" value={payload.score_breakdown.audit_readiness_signals} />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Top gaps</h2>
            {payload.gaps.map((gap) => (
              <GapCard key={gap.id} gap={gap} />
            ))}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recommendations</h2>
            <ol className={styles.recList}>
              {payload.recommendations.map((rec) => (
                <li key={rec} className={styles.recItem}>
                  {rec}
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.sectionWide}>
            <h2 className={styles.sectionTitle}>How teams address this</h2>
            <p className={styles.bodyText}>{payload.pesttrace_fit}</p>
          </section>

          <div className={styles.ctaWrap}>
            <a className={styles.cta} href={ctaHref}>
              Start 7-day free trial
            </a>
          </div>

          <p className={styles.disclaimer}>{payload.disclaimer}</p>
        </div>
      </div>
    </div>
  );
}
