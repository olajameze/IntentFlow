-- Multi-campaign outreach: support multiple sending brands (PestTrace + Weathers Pest Solutions)
--
-- Adds a `campaign` column to outreach_prospects so the same scraped business can be a target
-- of different campaigns (e.g., Weathers sells pest control to a restaurant; PestTrace sells
-- compliance software to a pest control company). Each campaign has its own sender identity
-- (configured via env vars in the dashboard / engine).
--
-- Backwards compatibility: every existing row defaults to 'pesttrace'. The unique constraint on
-- email is loosened to (campaign, email) so a business email can exist once per campaign.

alter table public.outreach_prospects
  add column if not exists campaign text not null default 'pesttrace';

-- Allowed values — keep in sync with engine/tools/outreach_campaigns.py
alter table public.outreach_prospects
  drop constraint if exists outreach_prospects_campaign_check;
alter table public.outreach_prospects
  add constraint outreach_prospects_campaign_check
  check (campaign in ('pesttrace', 'weathers'));

-- Replace global email-unique with per-campaign email-unique
drop index if exists public.outreach_prospects_email_idx;
create unique index if not exists outreach_prospects_campaign_email_idx
  on public.outreach_prospects (campaign, lower(email));

-- Indexes for the dashboard tabs
create index if not exists outreach_prospects_campaign_status_idx
  on public.outreach_prospects (campaign, status, created_at desc);
