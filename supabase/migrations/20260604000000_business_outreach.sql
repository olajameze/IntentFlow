-- Per-business outreach campaigns + conversion loop (engagement tiers, webhook idempotency)

-- ── 1. Business outreach settings ───────────────────────────────────────────

create table if not exists public.business_outreach_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  enabled boolean not null default false,
  campaign_slug text not null,
  sender_from_name text,
  sender_from_email text,
  cta_url_template text not null default '',
  cta_label text not null default 'Learn more',
  accent_color text not null default '#2F855A',
  trust_badges jsonb not null default '[]'::jsonb,
  scrape_queries jsonb not null default '{}'::jsonb,
  sector_angles jsonb not null default '{}'::jsonb,
  subject_prompt text,
  body_prompt text,
  follow_up_prompts jsonb not null default '[]'::jsonb,
  conversion_webhook_secret text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_outreach_settings_slug_idx
  on public.business_outreach_settings (campaign_slug);

alter table public.business_outreach_settings enable row level security;

create policy "service_role_all_business_outreach_settings"
  on public.business_outreach_settings
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 2. Outreach prospects: business link + engagement ────────────────────────

alter table public.outreach_prospects
  add column if not exists business_id uuid references public.businesses(id) on delete set null,
  add column if not exists engagement_tier text not null default 'cold',
  add column if not exists last_engagement_at timestamptz;

alter table public.outreach_prospects
  drop constraint if exists outreach_prospects_campaign_check;

alter table public.outreach_prospects
  add constraint outreach_prospects_campaign_check
  check (campaign ~ '^[a-z0-9][a-z0-9_-]{0,63}$');

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'outreach_prospects_engagement_tier_check'
  ) then
    alter table public.outreach_prospects
      add constraint outreach_prospects_engagement_tier_check
      check (engagement_tier in ('cold', 'warm', 'hot'));
  end if;
end$$;

create index if not exists outreach_prospects_engagement_idx
  on public.outreach_prospects (campaign, engagement_tier, click_count desc)
  where status = 'sent' and booked_at is null;

create index if not exists outreach_prospects_business_idx
  on public.outreach_prospects (business_id);

-- Backfill legacy campaigns
update public.outreach_prospects
set business_id = '11111111-1111-1111-1111-111111111111'
where campaign = 'weathers' and business_id is null;

update public.outreach_prospects
set business_id = '22222222-2222-2222-2222-222222222222'
where campaign = 'pesttrace' and business_id is null;

-- ── 3. Conversion webhook idempotency ───────────────────────────────────────

create table if not exists public.outreach_conversion_receipts (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  external_id text not null,
  event_type text not null,
  amount numeric,
  currency text,
  occurred_at timestamptz not null default now(),
  unique (prospect_id, external_id)
);

create index if not exists outreach_conversion_receipts_prospect_idx
  on public.outreach_conversion_receipts (prospect_id, occurred_at desc);

alter table public.outreach_conversion_receipts enable row level security;

create policy "service_role_all_outreach_conversion_receipts"
  on public.outreach_conversion_receipts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 4. Seed outreach settings for portfolio brands ──────────────────────────

insert into public.business_outreach_settings (
  business_id,
  enabled,
  campaign_slug,
  sender_from_name,
  cta_url_template,
  cta_label,
  accent_color,
  trust_badges,
  conversion_webhook_secret
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    true,
    'weathers',
    'Weathers Pest Solutions',
    'https://weatherspestsolutions.co.uk/book?utm_source=outreach&utm_medium=email&utm_campaign=weathers&p={prospect_id}',
    'Book a pest control slot',
    '#2F855A',
    '["BPCA Certified","5-Star Rated","24/7 Emergency","£50 deposit off invoice"]'::jsonb,
    encode(gen_random_bytes(24), 'hex')
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    true,
    'pesttrace',
    'PestTrace Team',
    'https://pesttrace.com/?utm_source=outreach&utm_medium=email&utm_campaign=pesttrace&p={prospect_id}',
    'See how PestTrace works',
    '#0F766E',
    '["UK-built","Audit-ready records","BPCA-aligned workflows"]'::jsonb,
    encode(gen_random_bytes(24), 'hex')
  )
on conflict (business_id) do update set
  enabled = excluded.enabled,
  campaign_slug = excluded.campaign_slug,
  cta_url_template = excluded.cta_url_template,
  updated_at = now();

-- JGDevs: enabled placeholder (prompts filled via bootstrap API)
insert into public.business_outreach_settings (
  business_id,
  enabled,
  campaign_slug,
  sender_from_name,
  cta_url_template,
  cta_label,
  accent_color,
  trust_badges,
  conversion_webhook_secret
)
select
  '33333333-3333-3333-3333-333333333333',
  false,
  'jgdevs-33333333',
  'JGDevs',
  coalesce(website_url, 'https://jgdev.co.uk') || '/?utm_source=outreach&p={prospect_id}',
  'Work with us',
  '#2563EB',
  '["Web & automation","UK-based"]'::jsonb,
  encode(gen_random_bytes(24), 'hex')
from public.businesses
where id = '33333333-3333-3333-3333-333333333333'
on conflict (business_id) do nothing;
