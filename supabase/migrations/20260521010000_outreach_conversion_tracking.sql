-- Klaviyo-inspired conversion improvements for outreach.
--
-- Adds the columns and events table needed to:
--   • Klaviyo step 5  — personalise by sector (restaurant, hotel, care_home, …)
--   • Klaviyo step 6  — automate a 3-touch follow-up sequence (followup_count, next_send_at)
--   • Klaviyo step 7  — track booking conversion via a clear CTA (booked_at)
--   • Klaviyo step 8  — A/B test subject lines (email_subject_b, subject_variant)
--   • Klaviyo step 9  — track opens, clicks, replies, bounces (outreach_email_events)

-- ── 1. New columns on outreach_prospects ────────────────────────────────────

alter table public.outreach_prospects
  add column if not exists sector text,
  add column if not exists email_subject_b text,
  add column if not exists subject_variant char(1),                -- 'A' or 'B' once sent
  add column if not exists opened_at timestamptz,                   -- first open recorded
  add column if not exists clicked_at timestamptz,                  -- first CTA click recorded
  add column if not exists click_count integer not null default 0,  -- total CTA clicks
  add column if not exists open_count integer not null default 0,   -- total opens (incl. repeat)
  add column if not exists replied_at timestamptz,                  -- manually flagged from dashboard
  add column if not exists booked_at timestamptz,                   -- manually flagged from dashboard
  add column if not exists followup_count integer not null default 0,
  add column if not exists next_send_at timestamptz;                -- when the next follow-up is due

-- Recognised sectors — keep in sync with engine/tools/outreach_sector.py
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'outreach_prospects_sector_check'
  ) then
    alter table public.outreach_prospects
      add constraint outreach_prospects_sector_check check (
        sector is null or sector in (
          'restaurant', 'hotel', 'care_home', 'school', 'letting_agent',
          'pub', 'gym', 'pet_groomer', 'bakery', 'food_production',
          'pest_control_firm',  -- PestTrace target
          'generic'
        )
      );
  end if;
end$$;

-- Fast lookups for follow-up dispatch + KPI panels
create index if not exists outreach_prospects_next_send_idx
  on public.outreach_prospects (campaign, next_send_at)
  where next_send_at is not null;

create index if not exists outreach_prospects_sector_idx
  on public.outreach_prospects (campaign, sector);

-- ── 2. Events log (Klaviyo step 9 — track & monitor) ────────────────────────

create table if not exists public.outreach_email_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  campaign text not null,
  event_type text not null check (event_type in ('open', 'click', 'reply', 'booked', 'bounce', 'unsubscribe')),
  url text,                       -- destination URL for click events
  user_agent text,
  ip text,
  occurred_at timestamptz not null default now()
);

create index if not exists outreach_email_events_prospect_idx
  on public.outreach_email_events (prospect_id, occurred_at desc);

create index if not exists outreach_email_events_campaign_event_idx
  on public.outreach_email_events (campaign, event_type, occurred_at desc);

alter table public.outreach_email_events enable row level security;

create policy "service_role_all_outreach_email_events" on public.outreach_email_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
