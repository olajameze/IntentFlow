-- Outreach platform v2: inbox, suppression, alerts, nurture, HubSpot, timeline, LinkedIn tasks, send stats, auth

-- Conversation threads
create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  direction text not null check (direction in ('outbound', 'inbound', 'draft')),
  subject text,
  body_text text,
  body_html text,
  message_id text,
  in_reply_to text,
  status text not null default 'sent' check (status in ('sent', 'draft', 'failed')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists outreach_messages_prospect_idx
  on public.outreach_messages (prospect_id, occurred_at desc);

create unique index if not exists outreach_messages_message_id_uidx
  on public.outreach_messages (message_id)
  where message_id is not null;

-- Global do-not-contact
create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  reason text not null check (reason in ('unsubscribe', 'bounce', 'complaint', 'manual')),
  campaign text,
  created_at timestamptz not null default now()
);

create unique index if not exists suppression_list_email_campaign_uidx
  on public.suppression_list (lower(email), coalesce(campaign, ''));

-- Email alert rules
create table if not exists public.outreach_alert_rules (
  id uuid primary key default gen_random_uuid(),
  campaign text not null default 'all',
  events text[] not null default '{}',
  to_emails text[] not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outreach_alert_log (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.outreach_alert_rules(id) on delete set null,
  prospect_id uuid references public.outreach_prospects(id) on delete set null,
  event text not null,
  sent_at timestamptz not null default now()
);

create unique index if not exists outreach_alert_log_dedupe_uidx
  on public.outreach_alert_log (rule_id, prospect_id, event, ((sent_at at time zone 'utc')::date))
  where rule_id is not null and prospect_id is not null;

-- Post-conversion nurture
create table if not exists public.outreach_nurture_sequences (
  id uuid primary key default gen_random_uuid(),
  campaign text not null,
  step integer not null default 0,
  offset_days integer not null default 7,
  subject_template text not null,
  body_template text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (campaign, step)
);

create table if not exists public.outreach_nurture_enrollments (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  campaign text not null,
  step integer not null default 0,
  next_send_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (prospect_id)
);

-- HubSpot sync state
create table if not exists public.hubspot_sync_state (
  prospect_id uuid primary key references public.outreach_prospects(id) on delete cascade,
  hubspot_contact_id text,
  hubspot_deal_id text,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

-- Unified customer timeline (denormalized events)
create table if not exists public.customer_timeline_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.outreach_prospects(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  event_type text not null,
  title text not null,
  detail jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists customer_timeline_prospect_idx
  on public.customer_timeline_events (prospect_id, occurred_at desc);

-- LinkedIn manual task queue
create table if not exists public.outreach_linkedin_tasks (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  suggested_note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_linkedin_tasks_status_idx
  on public.outreach_linkedin_tasks (status, due_at);

-- Send-time optimization buckets
create table if not exists public.outreach_send_stats (
  id uuid primary key default gen_random_uuid(),
  campaign text not null,
  country text not null default 'INT',
  hour_utc smallint not null check (hour_utc >= 0 and hour_utc <= 23),
  dow smallint not null check (dow >= 0 and dow <= 6),
  opens integer not null default 0,
  clicks integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (campaign, country, hour_utc, dow)
);

-- Operator roles (Phase 5 auth)
create table if not exists public.operator_profiles (
  user_id uuid primary key,
  role text not null default 'operator' check (role in ('admin', 'operator', 'viewer')),
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operator_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  resource_type text,
  resource_id text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Extend outreach_email_events for site intent
alter table public.outreach_email_events drop constraint if exists outreach_email_events_event_type_check;
alter table public.outreach_email_events add constraint outreach_email_events_event_type_check
  check (event_type in (
    'sent', 'delivered', 'open', 'click', 'reply', 'interested', 'meeting_booked',
    'booked', 'converted', 'bounce', 'unsubscribe', 'snapshot_view', 'site_intent'
  ));

-- RLS: service role only (MVP)
alter table public.outreach_messages enable row level security;
alter table public.suppression_list enable row level security;
alter table public.outreach_alert_rules enable row level security;
alter table public.outreach_alert_log enable row level security;
alter table public.outreach_nurture_sequences enable row level security;
alter table public.outreach_nurture_enrollments enable row level security;
alter table public.hubspot_sync_state enable row level security;
alter table public.customer_timeline_events enable row level security;
alter table public.outreach_linkedin_tasks enable row level security;
alter table public.outreach_send_stats enable row level security;
alter table public.operator_profiles enable row level security;
alter table public.operator_audit_log enable row level security;

create policy "service_role_outreach_messages" on public.outreach_messages
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_suppression_list" on public.suppression_list
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_outreach_alert_rules" on public.outreach_alert_rules
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_outreach_alert_log" on public.outreach_alert_log
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_outreach_nurture_sequences" on public.outreach_nurture_sequences
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_outreach_nurture_enrollments" on public.outreach_nurture_enrollments
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_hubspot_sync_state" on public.hubspot_sync_state
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_customer_timeline_events" on public.customer_timeline_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_outreach_linkedin_tasks" on public.outreach_linkedin_tasks
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_outreach_send_stats" on public.outreach_send_stats
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_operator_profiles" on public.operator_profiles
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "service_role_operator_audit_log" on public.operator_audit_log
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Seed nurture sequences
insert into public.outreach_nurture_sequences (campaign, step, offset_days, subject_template, body_template)
values
  ('weathers', 0, 7, 'How did we do?', 'Hi {{name}}, thank you for choosing Weathers Pest Solutions. If you have a moment, we would appreciate a quick review of your recent treatment.'),
  ('weathers', 1, 90, 'Seasonal pest reminder', 'Hi {{name}}, as we head into peak season, here is a quick tip from Weathers Pest Solutions to keep wasps and rodents at bay.'),
  ('pesttrace', 0, 3, 'Getting started with PestTrace', 'Hi {{name}}, welcome to PestTrace. Here are three steps to digitise your treatment logs this week.'),
  ('pesttrace', 1, 14, 'Expand your team on PestTrace', 'Hi {{name}}, many operators add a second technician once logbooks are digital — happy to show you how.'),
  ('jgdevs', 0, 7, 'Quick check-in from JGDevs', 'Hi {{name}}, hope the new site is working well. Would a short case study on your business be useful for others?'),
  ('jgdevs', 1, 30, 'Refer a business to JGDevs', 'Hi {{name}}, if you know another local business that needs a better website, we would love an introduction.')
on conflict (campaign, step) do nothing;

-- Default alert rule (disabled until emails configured)
insert into public.outreach_alert_rules (campaign, events, to_emails, enabled)
select 'all', array['reply','hot_lead','booked','converted'], array[]::text[], false
where not exists (select 1 from public.outreach_alert_rules limit 1);
