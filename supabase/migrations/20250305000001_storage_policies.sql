-- ── Storage RLS policies for npc-portraits bucket ────────────────────────────
-- The bucket must already exist (created via dashboard with Public = true).
-- Files should be uploaded at path: {user_id}/{filename}
-- The first folder component is used to scope access to the owning user.

create policy "Users can upload own NPC portraits"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'npc-portraits'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update own NPC portraits"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'npc-portraits'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own NPC portraits"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'npc-portraits'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public SELECT is handled by the bucket being public (no policy needed for reads).
