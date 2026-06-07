-- Single-query campaign stats for outreach KPI panel (replaces 19 parallel COUNT requests).

CREATE OR REPLACE FUNCTION public.outreach_campaign_stats(p_campaign text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH agg AS (
    SELECT
      count(*) FILTER (
        WHERE status = 'sent' OR replied_at IS NOT NULL OR booked_at IS NOT NULL
      ) AS sent,
      count(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
      count(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked,
      count(*) FILTER (WHERE replied_at IS NOT NULL) AS replied,
      count(*) FILTER (WHERE booked_at IS NOT NULL) AS booked,
      count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
      count(*) FILTER (WHERE interested_at IS NOT NULL) AS interested,
      count(*) FILTER (WHERE meeting_booked_at IS NOT NULL) AS meeting_booked,
      count(*) FILTER (WHERE converted_at IS NOT NULL) AS converted,
      count(*) FILTER (WHERE status = 'bounced') AS bounced,
      count(*) FILTER (
        WHERE engagement_tier = 'hot' AND status = 'sent' AND booked_at IS NULL
      ) AS hot_leads,
      count(*) FILTER (WHERE engagement_tier = 'hot') AS hot_tier,
      count(*) FILTER (WHERE engagement_tier = 'warm') AS warm_tier,
      count(*) FILTER (WHERE engagement_tier = 'cold') AS cold_tier,
      count(*) FILTER (WHERE subject_variant = 'A' OR subject_variant IS NULL) AS variant_a_sent,
      count(*) FILTER (WHERE subject_variant = 'B') AS variant_b_sent,
      count(*) FILTER (
        WHERE (subject_variant = 'A' OR subject_variant IS NULL) AND replied_at IS NOT NULL
      ) AS variant_a_replies,
      count(*) FILTER (WHERE subject_variant = 'B' AND replied_at IS NOT NULL) AS variant_b_replies,
      count(*) FILTER (
        WHERE status = 'bounced' AND raw IS NOT NULL AND raw ? 'verify'
      ) AS verify_failed,
      count(*) FILTER (
        WHERE status = 'sent' AND delivered_at IS NULL
      ) AS inbox_pending
    FROM public.outreach_prospects
    WHERE campaign = p_campaign
  ),
  revenue AS (
    SELECT count(*)::bigint AS revenue_attributed
    FROM public.outreach_conversion_receipts r
    INNER JOIN public.outreach_prospects p ON p.id = r.prospect_id
    WHERE p.campaign = p_campaign
      AND r.event_type IN ('payment_completed', 'trial_started', 'deposit_paid')
  )
  SELECT jsonb_build_object(
    'campaign', p_campaign,
    'sent', COALESCE(a.sent, 0),
    'opened', COALESCE(a.opened, 0),
    'clicked', COALESCE(a.clicked, 0),
    'replied', COALESCE(a.replied, 0),
    'booked', COALESCE(a.booked, 0),
    'delivered', COALESCE(a.delivered, 0),
    'interested', COALESCE(a.interested, 0),
    'meeting_booked', COALESCE(a.meeting_booked, 0),
    'converted', COALESCE(a.converted, 0),
    'bounced', COALESCE(a.bounced, 0),
    'hot_leads', COALESCE(a.hot_leads, 0),
    'revenue_attributed', COALESCE(r.revenue_attributed, 0),
    'verify_failed', COALESCE(a.verify_failed, 0),
    'inbox_pending', COALESCE(a.inbox_pending, 0),
    'engagement', jsonb_build_object(
      'hot', COALESCE(a.hot_tier, 0),
      'warm', COALESCE(a.warm_tier, 0),
      'cold', COALESCE(a.cold_tier, 0)
    ),
    'ab_test', jsonb_build_object(
      'variant_a_sent', COALESCE(a.variant_a_sent, 0),
      'variant_a_replies', COALESCE(a.variant_a_replies, 0),
      'variant_b_sent', COALESCE(a.variant_b_sent, 0),
      'variant_b_replies', COALESCE(a.variant_b_replies, 0)
    )
  )
  FROM agg a
  CROSS JOIN revenue r;
$$;

CREATE INDEX IF NOT EXISTS outreach_prospects_campaign_opened_idx
  ON public.outreach_prospects (campaign)
  WHERE opened_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS outreach_prospects_campaign_delivered_idx
  ON public.outreach_prospects (campaign)
  WHERE delivered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS outreach_prospects_campaign_engagement_idx
  ON public.outreach_prospects (campaign, engagement_tier);

CREATE INDEX IF NOT EXISTS outreach_prospects_campaign_subject_variant_idx
  ON public.outreach_prospects (campaign, subject_variant);

GRANT EXECUTE ON FUNCTION public.outreach_campaign_stats(text) TO service_role;
