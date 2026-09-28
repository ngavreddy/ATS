-- Private storage for resumes. Files live under a folder named after the agency id,
-- and these policies only let a signed-in user touch their own agency's folder.
insert into storage.buckets (id, name, public) values ('resumes', 'resumes', false)
on conflict (id) do nothing;

create policy "resumes_select" on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] in (select a::text from my_agencies() a));
create policy "resumes_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] in (select a::text from my_agencies() a));
create policy "resumes_update" on storage.objects for update to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] in (select a::text from my_agencies() a));
create policy "resumes_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] in (select a::text from my_agencies() a));
