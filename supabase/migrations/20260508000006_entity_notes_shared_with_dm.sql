-- Migration: entity_notes_shared_with_dm
-- Add shared_with_dm flag so players can opt-in to sharing their private notes with the campaign DM

alter table entity_notes
  add column if not exists shared_with_dm boolean not null default false;

-- Campaign DMs can read notes that players have explicitly shared with them
create policy "entity_notes_dm_shared" on entity_notes for select using (
  shared_with_dm = true
  and exists (
    select 1
    from campaign_members cm_author
    join campaign_members cm_dm on cm_author.campaign_id = cm_dm.campaign_id
    where cm_author.user_id = entity_notes.user_id
    and cm_dm.user_id = auth.uid()
    and cm_dm.role = 'dm'
  )
);
