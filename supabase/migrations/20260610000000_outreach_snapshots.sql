-- PestTrace audit readiness snapshots — public tokenized reports for outreach prospects.

create table if not exists public.outreach_snapshots (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  campaign text not null,
  token uuid not null unique default gen_random_uuid(),
  payload jsonb not null default '{}'::jsonb,
  overall_score smallint not null check (overall_score between 0 and 100),
  generated_at timestamptz not null default now(),
  first_viewed_at timestamptz,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists outreach_snapshots_prospect_campaign_idx
  on public.outreach_snapshots (prospect_id, campaign);

create index if not exists outreach_snapshots_token_idx
  on public.outreach_snapshots (token);

alter table public.outreach_snapshots enable row level security;

create policy "service_role_all_outreach_snapshots" on public.outreach_snapshots
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Add snapshot_view to outreach_email_events event types.
alter table public.outreach_email_events
  drop constraint if exists outreach_email_events_event_type_check;

alter table public.outreach_email_events
  add constraint outreach_email_events_event_type_check
  check (event_type in (
    'sent', 'delivered', 'open', 'click', 'reply', 'interested',
    'meeting_booked', 'booked', 'converted', 'bounce', 'unsubscribe',
    'snapshot_view'
  ));
