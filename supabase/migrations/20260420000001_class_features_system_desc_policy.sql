-- Migration: class_features_system_desc_policy
-- Allow authenticated users to update the description field on system (user_id = null) class features.
-- System features are SRD content shared across all campaigns; descriptions are the same for everyone
-- and are sourced from the Open5e API, so any authenticated user running the sync is safe to write them.

drop policy "class_features_update" on class_features;

create policy "class_features_update" on class_features
  for update
  using  (auth.uid() = user_id or (user_id is null and auth.uid() is not null))
  with check (auth.uid() = user_id or (user_id is null and auth.uid() is not null));
