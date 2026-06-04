-- PestTrace: international positioning (trust badges + default country for new prospects)

update public.business_outreach_settings
set
  trust_badges = '["Audit-ready records","EU & global compliance","7-day free trial"]'::jsonb,
  updated_at = now()
where campaign_slug = 'pesttrace';

alter table public.outreach_prospects
  alter column country set default 'INT';
