import styles from "./snapshot.module.css";
import {
  jgdevSiteUrl,
  pesttraceTrialUrl,
  riskBand,
  scoreBand,
  trackedClickUrl,
  weathersBookUrl,
} from "@/lib/outreach/snapshot-view";
import type {
  AuditSnapshotPayload,
  RiskBriefPayload,
  SiteScorePayload,
  SnapshotGap,
  SnapshotPayload,
} from "@/lib/outreach/snapshot-types";

type ViewProps = {
  parsed: SnapshotPayload;
  prospectId: string;
  baseUrl: string;
};

function ScoreBar({
  label,
  value,
  variant = "pesttrace",
}: {
  label: string;
  value: number;
  variant?: "pesttrace" | "weathers" | "jgdevs";
}) {
  return (
    <div className={styles.scoreBar}>
      <div className={styles.scoreBarHeader}>
        <span>{label}</span>
        <span className={styles.scoreBarValue}>{value}/100</span>
      </div>
      <div className={styles.scoreBarTrack} data-campaign={variant}>
        <progress value={value} max={100} aria-label={`${label}: ${value} out of 100`} />
      </div>
    </div>
  );
}

function GapCard({ gap }: { gap: SnapshotGap }) {
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

function SnapshotShell({
  campaign,
  headerTitle,
  children,
  ctaLabel,
  ctaHref,
  disclaimer,
}: {
  campaign: "pesttrace" | "weathers" | "jgdevs";
  headerTitle: string;
  children: React.ReactNode;
  ctaLabel: string;
  ctaHref: string;
  disclaimer: string;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header} data-campaign={campaign}>
          {headerTitle}
        </div>
        <div className={styles.card}>
          {children}
          <div className={styles.ctaWrap}>
            <a className={styles.cta} data-campaign={campaign} href={ctaHref}>
              {ctaLabel}
            </a>
          </div>
          <p className={styles.disclaimer}>{disclaimer}</p>
        </div>
      </div>
    </div>
  );
}

function PesttraceView({ payload, prospectId, baseUrl }: { payload: AuditSnapshotPayload; prospectId: string; baseUrl: string }) {
  const trialUrl = pesttraceTrialUrl(prospectId);
  const ctaHref = baseUrl ? trackedClickUrl(prospectId, trialUrl, baseUrl) : trialUrl;
  const band = scoreBand(payload.overall_score);

  return (
    <SnapshotShell
      campaign="pesttrace"
      headerTitle="PestTrace — Audit Readiness Snapshot"
      ctaLabel="Start 7-day free trial"
      ctaHref={ctaHref}
      disclaimer={payload.disclaimer}
    >
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
        <ScoreBar variant="pesttrace" label="Documentation visibility" value={payload.score_breakdown.documentation_visibility} />
        <ScoreBar variant="pesttrace" label="Digital evidence trail" value={payload.score_breakdown.digital_evidence_trail} />
        <ScoreBar variant="pesttrace" label="Qualification tracking" value={payload.score_breakdown.qualification_tracking} />
        <ScoreBar variant="pesttrace" label="Audit readiness signals" value={payload.score_breakdown.audit_readiness_signals} />
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
    </SnapshotShell>
  );
}

function WeathersView({ payload, prospectId, baseUrl }: { payload: RiskBriefPayload; prospectId: string; baseUrl: string }) {
  const bookUrl = weathersBookUrl(prospectId);
  const ctaHref = baseUrl ? trackedClickUrl(prospectId, bookUrl, baseUrl) : bookUrl;
  const band = riskBand(payload.overall_score);

  return (
    <SnapshotShell
      campaign="weathers"
      headerTitle="Weathers Pest Solutions — Seasonal Risk Brief"
      ctaLabel="Book a pest control visit"
      ctaHref={ctaHref}
      disclaimer={payload.disclaimer}
    >
      <h1 className={styles.title}>{payload.company_name}</h1>
      {payload.website ? <p className={styles.website}>{payload.website}</p> : null}
      <div className={styles.scoreBlock}>
        <div className={styles.scoreLabel}>{payload.season_label} premises risk</div>
        <div className={styles.scoreValue} data-band={band}>
          {payload.overall_score}
          <span className={styles.scoreDenom}>/100</span>
        </div>
      </div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Seasonal pressures</h2>
        <ul className={styles.recList}>
          {payload.seasonal_risks.map((risk) => (
            <li key={risk} className={styles.recItem}>
              {risk}
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Risk breakdown</h2>
        <ScoreBar variant="weathers" label="Rodent risk" value={payload.score_breakdown.rodent_risk} />
        <ScoreBar variant="weathers" label="Insect risk" value={payload.score_breakdown.insect_risk} />
        <ScoreBar variant="weathers" label="Audit pressure" value={payload.score_breakdown.audit_pressure} />
        <ScoreBar variant="weathers" label="Premises factors" value={payload.score_breakdown.premises_factors} />
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Sector risks</h2>
        {payload.gaps.map((gap) => (
          <GapCard key={gap.id} gap={gap} />
        ))}
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Prevention steps</h2>
        <ol className={styles.recList}>
          {payload.prevention_steps.map((step) => (
            <li key={step} className={styles.recItem}>
              {step}
            </li>
          ))}
        </ol>
      </section>
      <section className={styles.sectionWide}>
        <h2 className={styles.sectionTitle}>How Weathers can help</h2>
        <p className={styles.bodyText}>{payload.weathers_fit}</p>
      </section>
    </SnapshotShell>
  );
}

function JgdevsView({ payload, prospectId, baseUrl }: { payload: SiteScorePayload; prospectId: string; baseUrl: string }) {
  const siteUrl = jgdevSiteUrl(prospectId);
  const ctaHref = baseUrl ? trackedClickUrl(prospectId, siteUrl, baseUrl) : siteUrl;
  const band = scoreBand(payload.overall_score);

  return (
    <SnapshotShell
      campaign="jgdevs"
      headerTitle="JGDevs — Site Score Snapshot"
      ctaLabel="See how we can help"
      ctaHref={ctaHref}
      disclaimer={payload.disclaimer}
    >
      <h1 className={styles.title}>{payload.company_name}</h1>
      {payload.website ? <p className={styles.website}>{payload.website}</p> : null}
      <div className={styles.scoreBlock}>
        <div className={styles.scoreLabel}>Overall site score</div>
        <div className={styles.scoreValue} data-band={band}>
          {payload.overall_score}
          <span className={styles.scoreDenom}>/100</span>
        </div>
      </div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Score breakdown</h2>
        <ScoreBar variant="jgdevs" label="Local SEO visibility" value={payload.score_breakdown.local_seo_visibility} />
        <ScoreBar variant="jgdevs" label="Mobile experience" value={payload.score_breakdown.mobile_experience} />
        <ScoreBar variant="jgdevs" label="Booking & enquiry flow" value={payload.score_breakdown.booking_enquiry_flow} />
        <ScoreBar variant="jgdevs" label="Trust & clarity" value={payload.score_breakdown.trust_clarity} />
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
        <h2 className={styles.sectionTitle}>How JGDevs can help</h2>
        <p className={styles.bodyText}>{payload.jgdevs_fit}</p>
      </section>
    </SnapshotShell>
  );
}

export function CampaignSnapshotView({ parsed, prospectId, baseUrl }: ViewProps) {
  if (parsed.campaign === "weathers") {
    return <WeathersView payload={parsed.payload} prospectId={prospectId} baseUrl={baseUrl} />;
  }
  if (parsed.campaign === "jgdevs") {
    return <JgdevsView payload={parsed.payload} prospectId={prospectId} baseUrl={baseUrl} />;
  }
  return <PesttraceView payload={parsed.payload} prospectId={prospectId} baseUrl={baseUrl} />;
}

export function snapshotPageTitle(parsed: SnapshotPayload): string {
  if (parsed.campaign === "weathers") {
    return `${parsed.payload.company_name} — Seasonal Risk Brief`;
  }
  if (parsed.campaign === "jgdevs") {
    return `${parsed.payload.company_name} — Site Score Snapshot`;
  }
  return `${parsed.payload.company_name} — Audit Readiness Snapshot`;
}
