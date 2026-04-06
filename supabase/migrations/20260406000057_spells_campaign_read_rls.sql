-- Fix spells RLS so players can see spells created by any member of their campaign.
-- The original policy used FOR ALL with auth.uid() = user_id, which blocked players
-- (different auth.uid()) from seeing the DM's spells.
--
-- New policy split:
--   SELECT  — owner or any campaign member sharing a campaign with the spell owner
--   INSERT  — owner only
--   UPDATE  — owner only
--   DELETE  — owner only

drop policy if exists "Users can manage their own spells" on spells;

-- Read: own spells, or spells by any user who shares a campaign with you
create policy "spells_select" on spells
  for select using (
    auth.uid() = user_id
    or exists (
      select 1
      from campaign_members cm_me
      join campaign_members cm_owner
        on cm_owner.campaign_id = cm_me.campaign_id
       and cm_owner.user_id = spells.user_id
      where cm_me.user_id = auth.uid()
    )
  );

create policy "spells_insert" on spells
  for insert with check (auth.uid() = user_id);

create policy "spells_update" on spells
  for update using (auth.uid() = user_id);

create policy "spells_delete" on spells
  for delete using (auth.uid() = user_id);
