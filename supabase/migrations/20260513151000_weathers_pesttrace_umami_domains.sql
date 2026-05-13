-- Weathers Pest Solutions + PestTrace: production domains + Umami website ids (seed UUIDs)
update public.businesses
set
  website_url = 'https://weatherspestsolutions.co.uk',
  umami_website_id = 'a0bfefa1-d6ea-4ba0-b869-34f3901687fa',
  updated_at = now()
where id = '11111111-1111-1111-1111-111111111111';

update public.businesses
set
  website_url = 'https://pesttrace.com',
  umami_website_id = 'fa32c121-cb14-4b86-a3bd-0ab1bfd6bfca',
  updated_at = now()
where id = '22222222-2222-2222-2222-222222222222';
