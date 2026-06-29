-- Replace Umami with Microsoft Clarity analytics snapshots.

update public.analytics_snapshots set source = 'manual' where source = 'umami';

alter table public.analytics_snapshots drop constraint if exists analytics_snapshots_source_check;
alter table public.analytics_snapshots add constraint analytics_snapshots_source_check
  check (source in ('clarity', 'similarweb', 'manual'));

alter table public.businesses drop column if exists umami_website_id;
alter table public.businesses drop column if exists umami_share_url;

comment on column public.businesses.clarity_project_id is
  'Microsoft Clarity project id + Data Export API sync (Settings → Data Export).';
