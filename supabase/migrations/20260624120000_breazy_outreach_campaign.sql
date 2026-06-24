-- Breazy Productions outreach campaign: UK cinematic videography (weddings, commercial, music videos).

insert into public.businesses (id, name, type, target_audience, industry, social_accounts, website_url, goals, active)
values
  (
    '44444444-4444-4444-4444-444444444444',
    'Breazy Productions',
    'agency',
    'UK wedding venues, event organisers, independent cafes and restaurants, musicians and artists, and small brands needing promotional or event films',
    'Cinematic videography / video production',
    '{"email":"breazyproductions7@gmail.com","phone":"+44772846189"}'::jsonb,
    'https://jordans-e-website.vercel.app',
    'Book more wedding, commercial, and music video projects through cinematic outreach',
    true
  )
on conflict (id) do update set
  name = excluded.name,
  target_audience = excluded.target_audience,
  industry = excluded.industry,
  website_url = excluded.website_url,
  goals = excluded.goals,
  updated_at = now();

alter table public.outreach_prospects
  drop constraint if exists outreach_prospects_campaign_check;
alter table public.outreach_prospects
  add constraint outreach_prospects_campaign_check
  check (campaign in ('pesttrace', 'weathers', 'jgdevs', 'breazy'));

insert into public.business_outreach_settings (
  business_id,
  enabled,
  campaign_slug,
  sender_from_name,
  cta_url_template,
  cta_label,
  accent_color,
  trust_badges,
  conversion_webhook_secret
)
values
  (
    '44444444-4444-4444-4444-444444444444',
    true,
    'breazy',
    'Breazy Productions',
    'https://jordans-e-website.vercel.app/book?utm_source=outreach&utm_medium=email&utm_campaign=breazy&p={prospect_id}',
    'Book a videography consultation',
    '#C9A227',
    '["Cinematic storytelling","Wedding & commercial","UK videography","Featured portfolio work"]'::jsonb,
    encode(gen_random_bytes(24), 'hex')
  )
on conflict (business_id) do update set
  enabled = excluded.enabled,
  campaign_slug = excluded.campaign_slug,
  sender_from_name = excluded.sender_from_name,
  cta_url_template = excluded.cta_url_template,
  cta_label = excluded.cta_label,
  accent_color = excluded.accent_color,
  trust_badges = excluded.trust_badges,
  updated_at = now();
