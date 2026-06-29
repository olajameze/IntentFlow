-- Canonical Clarity project IDs per brand (Data Export API sync).
-- xekb1rp4c9 = PestTrace (not Weathers)

update public.businesses
set clarity_project_id = 'xekb1rp4c9'
where id = '22222222-2222-2222-2222-222222222222'; -- PestTrace

update public.businesses
set clarity_project_id = 'xekxr45e4h'
where id = '11111111-1111-1111-1111-111111111111'; -- Weathers Pest Solutions

update public.businesses
set clarity_project_id = 'xekq5kgqss'
where id = '33333333-3333-3333-3333-333333333333'; -- JGDevs
