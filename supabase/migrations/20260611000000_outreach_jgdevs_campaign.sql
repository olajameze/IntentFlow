-- JGDevs outreach campaign: UK small businesses (websites, SEO, booking systems).

alter table public.outreach_prospects
  drop constraint if exists outreach_prospects_campaign_check;
alter table public.outreach_prospects
  add constraint outreach_prospects_campaign_check
  check (campaign in ('pesttrace', 'weathers', 'jgdevs'));

alter table public.outreach_prospects
  drop constraint if exists outreach_prospects_sector_check;

alter table public.outreach_prospects
  add constraint outreach_prospects_sector_check
  check (
    sector is null or sector in (
      'restaurant', 'hotel', 'care_home', 'school', 'letting_agent',
      'pub', 'gym', 'pet_groomer', 'bakery', 'food_production',
      'pest_control_firm',
      'tradesperson', 'salon', 'local_shop', 'professional',
      'generic'
    )
  );

update public.business_outreach_settings
set
  enabled = true,
  campaign_slug = 'jgdevs',
  sender_from_name = 'JGDevs',
  cta_url_template = 'https://jgdev.co.uk/?utm_source=outreach&utm_medium=email&utm_campaign=jgdevs&p={prospect_id}',
  cta_label = 'See how we can help',
  accent_color = '#2563EB',
  trust_badges = '["UK-based","Websites that convert","SEO & booking systems"]'::jsonb,
  updated_at = now()
where business_id = '33333333-3333-3333-3333-333333333333';
