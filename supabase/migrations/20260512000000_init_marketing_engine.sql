-- Omni-Channel Marketing Engine — initial schema (Supabase Postgres)
-- Enable extensions commonly used with pgcrypto for gen_random_uuid
create extension if not exists "pgcrypto";

-- Businesses: unlimited portfolio; agents load active rows
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in (
    'local_service', 'b2b_saas', 'agency', 'ecommerce', 'generic'
  )),
  target_audience text,
  industry text,
  social_accounts jsonb not null default '{}'::jsonb,
  website_url text,
  goals text,
  -- Encrypted at rest in app layer (base64 AES-GCM blob); never log in plain text
  stripe_secret_ciphertext text,
  stripe_secret_iv text,
  stripe_secret_tag text,
  umami_website_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists businesses_active_idx on public.businesses (active);

-- Leads captured by agents
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  source text,
  name text,
  email text,
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists leads_business_idx on public.leads (business_id, created_at desc);

-- Posts awaiting approval
create table if not exists public.pending_posts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  platform text not null,
  account_id text,
  content text not null,
  scheduled_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pending_posts_status_idx on public.pending_posts (status, business_id);

-- Traffic snapshots (Umami API / Similarweb)
create table if not exists public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  captured_at timestamptz not null default now(),
  source text not null check (source in ('umami', 'similarweb', 'manual')),
  website_id text,
  domain text,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists analytics_snapshots_business_idx on public.analytics_snapshots (business_id, captured_at desc);

-- Manual + Stripe-derived revenue lines
create table if not exists public.revenue_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  amount numeric(14,2) not null,
  currency text not null default 'GBP',
  source text not null check (source in (
    'stripe', 'paypal', 'bank_transfer', 'cash', 'invoice', 'manual', 'merged_csv', 'other'
  )),
  source_transaction_id text,
  fees numeric(14,2) default 0,
  net_amount numeric(14,2),
  customer_name text,
  description text,
  entry_date date not null default (timezone('utc', now()))::date,
  created_at timestamptz not null default now()
);

create index if not exists revenue_entries_business_idx on public.revenue_entries (business_id, entry_date desc);

-- Aggregated revenue snapshots (Stripe sync, merged CSV, etc.)
create table if not exists public.revenue_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  snapshot_date date not null default (timezone('utc', now()))::date,
  total_revenue numeric(14,2) not null default 0,
  total_fees numeric(14,2) not null default 0,
  net_revenue numeric(14,2) not null default 0,
  mrr numeric(14,2),
  transaction_count integer not null default 0,
  new_customers integer,
  churn_rate numeric(7,4),
  source text not null check (source in ('stripe_api', 'manual', 'merged_csv', 'computed')),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (business_id, snapshot_date, source)
);

create index if not exists revenue_snapshots_business_idx on public.revenue_snapshots (business_id, snapshot_date desc);

-- App settings key/value (Umami base URL, encrypted hints, feature flags)
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row Level Security: service role only for MVP dashboard (single operator).
-- Toggle policies per your auth model; anon disabled by default.
alter table public.businesses enable row level security;
alter table public.leads enable row level security;
alter table public.pending_posts enable row level security;
alter table public.analytics_snapshots enable row level security;
alter table public.revenue_entries enable row level security;
alter table public.revenue_snapshots enable row level security;
alter table public.app_settings enable row level security;

-- Authenticated users (after Supabase Auth): replace with your policy.
create policy "service_role_all_businesses" on public.businesses
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_all_leads" on public.leads
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_all_pending_posts" on public.pending_posts
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_all_analytics_snapshots" on public.analytics_snapshots
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_all_revenue_entries" on public.revenue_entries
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_all_revenue_snapshots" on public.revenue_snapshots
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_all_app_settings" on public.app_settings
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Seed initial businesses (IDs fixed for documentation; replace in production if needed)
insert into public.businesses (id, name, type, target_audience, industry, social_accounts, website_url, umami_website_id, goals, active)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Weathers Pest Solutions',
    'local_service',
    'Homeowners and landlords in South East UK needing rapid pest control',
    'Pest control / local services',
    '{"facebook":"weathers-pest","gbp":"Weathers Pest Solutions"}'::jsonb,
    'https://weatherspestsolutions.co.uk',
    'a0bfefa1-d6ea-4ba0-b869-34f3901687fa',
    'Emergency lead capture, local SEO dominance, GBP optimization',
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'PestTrace',
    'b2b_saas',
    'Pest control operators and compliance managers',
    'B2B SaaS / compliance',
    '{"linkedin":"company/pesttrace"}'::jsonb,
    'https://pesttrace.com',
    'fa32c121-cb14-4b86-a3bd-0ab1bfd6bfca',
    'B2B pipeline, audit readiness messaging, digital compliance positioning',
    true
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'JGDevs',
    'agency',
    'Founders and product teams needing high-trust engineering partners',
    'Software development agency',
    '{"linkedin":"company/jgdevs"}'::jsonb,
    'https://jgdev.co.uk',
    '630348c2-f497-439c-b667-ff6befb9daa0',
    'Authority content, case studies, LinkedIn thought leadership',
    true
  )
on conflict (id) do nothing;
