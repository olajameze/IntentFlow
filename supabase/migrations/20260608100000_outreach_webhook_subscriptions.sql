-- Outbound webhook subscriptions for Zapier/HubSpot-style integrations.

CREATE TABLE IF NOT EXISTS public.outreach_webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign text NOT NULL DEFAULT 'all',
  url text NOT NULL,
  secret text NOT NULL,
  events text[] NOT NULL DEFAULT ARRAY['reply', 'booked', 'converted', 'hot_lead'],
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_webhook_subscriptions_campaign_idx
  ON public.outreach_webhook_subscriptions (campaign, enabled);

ALTER TABLE public.outreach_webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_outreach_webhook_subscriptions"
  ON public.outreach_webhook_subscriptions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
