-- Create the documents storage bucket for DocuMind PDF uploads
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,                    -- private: files fetched server-side only
  52428800,                 -- 50 MB per file
  array['application/pdf']
)
on conflict (id) do nothing;

-- RLS: authenticated users can upload into their own folder (user_id/filename)
drop policy if exists "Users can upload own documents" on storage.objects;
create policy "Users can upload own documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS: authenticated users can read their own files
drop policy if exists "Users can read own documents" on storage.objects;
create policy "Users can read own documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- RLS: authenticated users can delete their own files
drop policy if exists "Users can delete own documents" on storage.objects;
create policy "Users can delete own documents"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
