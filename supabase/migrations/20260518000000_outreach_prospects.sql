-- PestTrace outreach prospects — scraped pest control businesses for B2B email outreach
create table if not exists public.outreach_prospects (
  id uuid primary key default gen_random_uuid(),

  -- Business identity
  name text not null,
  email text not null,
  website_url text,
  phone text,
  city text,
  country text not null default 'UK',
  source text not null default 'yell', -- yell | yelp | yellowpages | truelocal | manual

  -- Email draft (LLM-generated)
  email_subject text,
  email_body text,

  -- Workflow status
  -- scraped        → found by scraper, not yet reviewed
  -- draft_ready    → LLM email draft generated, awaiting human review
  -- approved       → human approved, ready to send
  -- rejected       → human rejected, will not send
  -- sent           → email delivered
  -- bounced        → SMTP bounce received
  -- unsubscribed   → replied STOP or manually marked
  status text not null default 'scraped' check (status in (
    'scraped', 'draft_ready', 'approved', 'rejected', 'sent', 'bounced', 'unsubscribed'
  )),

  sent_at timestamptz,
  raw jsonb not null default '{}'::jsonb,   -- raw scrape payload for audit

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deduplication: one email per prospect globally (not per-business)
create unique index if not exists outreach_prospects_email_idx on public.outreach_prospects (lower(email));

-- Efficient status-based queries for the dashboard
create index if not exists outreach_prospects_status_idx on public.outreach_prospects (status, created_at desc);
create index if not exists outreach_prospects_country_idx on public.outreach_prospects (country, status);

-- RLS: service role only (same pattern as all other tables)
alter table public.outreach_prospects enable row level security;

create policy "service_role_all_outreach_prospects" on public.outreach_prospects
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
