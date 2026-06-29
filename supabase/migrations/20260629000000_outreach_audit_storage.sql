-- Private bucket for outreach visual audit screenshots (JGDevs site score snapshots).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'outreach-audit',
  'outreach-audit',
  false,
  5242880,
  array['image/webp', 'image/png', 'image/jpeg']
)
on conflict (id) do nothing;

-- Service role manages uploads from the Python engine; signed URLs served from Next.js.
create policy "service_role_all_outreach_audit_objects"
  on storage.objects
  for all
  using (bucket_id = 'outreach-audit' and auth.role() = 'service_role')
  with check (bucket_id = 'outreach-audit' and auth.role() = 'service_role');
