-- Microsoft Clarity project id per brand (Settings → Traffic tracking snippet).
alter table public.businesses
  add column if not exists clarity_project_id text;

comment on column public.businesses.clarity_project_id is
  'Microsoft Clarity project id from clarity.microsoft.com → Settings → Setup.';
