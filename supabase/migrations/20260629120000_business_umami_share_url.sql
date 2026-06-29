-- Public Umami share dashboard URL (free Hobby plan — no API key required).
alter table public.businesses
  add column if not exists umami_share_url text;

comment on column public.businesses.umami_share_url is
  'Umami Share URL from website settings — embed live stats in IntentFlow without Cloud API keys.';
