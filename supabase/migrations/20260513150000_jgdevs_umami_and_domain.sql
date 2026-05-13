-- JGDevs: production site + Umami website id (business UUID from seed)
update public.businesses
set
  website_url = 'https://jgdev.co.uk',
  umami_website_id = '630348c2-f497-439c-b667-ff6befb9daa0',
  updated_at = now()
where id = '33333333-3333-3333-3333-333333333333';
