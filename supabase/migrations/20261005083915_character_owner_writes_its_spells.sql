-- A character's owner could not write spell rows for it unless the character was
-- the account's ACTIVE one at a table: character_spells_insert (and select,
-- update, delete) only match through campaign_members.party_member_id, which
-- attach_party_member_to_campaign sets only when the player has no active
-- character yet. So a character resting in the pool, or a second character
-- attached to a table, could not be given spells by the creation wizard: the
-- always-prepared spells of a level-1 subclass (a 2014 Life Domain cleric's Bless
-- and Cure Wounds), and equally a species' innate spells for such a character.
-- apply_level_up gets round it by being a definer, which the creation wizard has
-- no equivalent of.
--
-- This lets the owner INSERT rows for their own character. The validate_source
-- and validate_limits triggers still apply to every row, so it widens who may
-- write, not what may be written. Select/update/delete are left as they are.
create policy character_spells_insert_owner on public.character_spells
  for insert
  with check (exists (
    select 1 from public.party_members pm
    where pm.id = character_spells.party_member_id
      and (pm.owner_user_id = (select auth.uid())
        or (pm.owner_user_id is null and pm.user_id = (select auth.uid())))
  ));
