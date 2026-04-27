-- Migration: fix_character_classes_rls_owner
-- Allow the character owner (owner_user_id) to read and write their own character_classes rows

drop policy if exists "character_classes_select" on character_classes;
drop policy if exists "character_classes_insert" on character_classes;
drop policy if exists "character_classes_update" on character_classes;
drop policy if exists "character_classes_delete" on character_classes;

create policy "character_classes_select" on character_classes
  for select using (
    exists (
      select 1 from party_members pm
      where pm.id = character_classes.party_member_id
        and (pm.user_id = auth.uid() or pm.owner_user_id = auth.uid())
    )
  );

create policy "character_classes_insert" on character_classes
  for insert with check (
    exists (
      select 1 from party_members pm
      where pm.id = character_classes.party_member_id
        and (pm.user_id = auth.uid() or pm.owner_user_id = auth.uid())
    )
  );

create policy "character_classes_update" on character_classes
  for update using (
    exists (
      select 1 from party_members pm
      where pm.id = character_classes.party_member_id
        and (pm.user_id = auth.uid() or pm.owner_user_id = auth.uid())
    )
  );

create policy "character_classes_delete" on character_classes
  for delete using (
    exists (
      select 1 from party_members pm
      where pm.id = character_classes.party_member_id
        and (pm.user_id = auth.uid() or pm.owner_user_id = auth.uid())
    )
  );
