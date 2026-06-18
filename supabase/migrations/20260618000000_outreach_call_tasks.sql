-- Inbound call qualification: Groq call-prep tasks + optional public chat sessions

create table if not exists public.outreach_call_tasks (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  trigger text not null default 'reply' check (trigger in ('reply', 'click', 'call_intent', 'manual')),
  opening_script text not null default '',
  talking_points jsonb not null default '[]'::jsonb,
  objection_handling jsonb not null default '[]'::jsonb,
  suggested_next_step text not null default '',
  booking_url text not null default '',
  qualification_token uuid not null default gen_random_uuid(),
  chat_transcript jsonb not null default '[]'::jsonb,
  qualification_outcome text check (
    qualification_outcome is null
    or qualification_outcome in ('book', 'demo', 'callback', 'not_ready', 'unqualified')
  ),
  operator_notes text,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists outreach_call_tasks_token_uidx
  on public.outreach_call_tasks (qualification_token);

create index if not exists outreach_call_tasks_status_idx
  on public.outreach_call_tasks (status, due_at);

create index if not exists outreach_call_tasks_prospect_idx
  on public.outreach_call_tasks (prospect_id, created_at desc);

alter table public.outreach_call_tasks enable row level security;

create policy "service_role_outreach_call_tasks"
  on public.outreach_call_tasks
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
