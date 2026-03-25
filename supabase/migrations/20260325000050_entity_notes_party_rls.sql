-- Replace the asymmetric DM↔player policies with a symmetric one:
-- any campaign member can see non-private notes written by fellow campaign members.
drop policy if exists "entity_notes_party_to_player" on entity_notes;
drop policy if exists "entity_notes_party_to_dm"     on entity_notes;

create policy "entity_notes_campaign_shared" on entity_notes
  for select using (
    is_private = false
    and exists (
      select 1
        from campaign_members cm_author
        join campaign_members cm_viewer
          on cm_author.campaign_id = cm_viewer.campaign_id
       where cm_author.user_id  = entity_notes.user_id
         and cm_viewer.user_id  = auth.uid()
    )
  );
