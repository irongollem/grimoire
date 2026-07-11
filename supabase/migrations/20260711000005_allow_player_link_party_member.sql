-- Migration: allow_player_link_party_member
-- Fix the 2026-06-21 regression (guard_campaign_member_self_update, migration
-- 20260621000001) that blocked every player from linking a character to their
-- own campaign_members row. The guard pinned `party_member_id` alongside `role`
-- and `campaign_id` for non-DM self-updates, but party_member_id is how a player
-- claims / self-creates / assumes a character — so all three flows failed with
-- "Not allowed to change role/campaign/party assignment" and no player has linked
-- a character since that date.
--
-- role and campaign_id remain pinned (the real privilege-escalation vectors).
-- party_member_id becomes changeable by a non-DM, but only to a SAFE target so a
-- player still cannot hijack another user's character:
--   * clearing it (unlink) is always allowed;
--   * otherwise the target party_member must belong to THIS membership's campaign,
--     must not be owned by a different user, and must not already be linked by a
--     different membership.
--
-- Preserves the live definition's `private.is_campaign_dm` reference (the RLS
-- helpers were relocated to the private schema in 20260629000002) and the
-- SECURITY DEFINER / search_path = public settings.

create or replace function public.guard_campaign_member_self_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- DMs of this campaign may change anything (also covered by campaign_members_dm_all,
  -- but the trigger fires for them too, so allow it explicitly).
  if private.is_campaign_dm(old.campaign_id) then
    return new;
  end if;

  -- Non-DM self-update: role and campaign_id stay pinned to their prior values.
  if new.role is distinct from old.role
     or new.campaign_id is distinct from old.campaign_id then
    raise exception 'Not allowed to change role or campaign assignment';
  end if;

  -- party_member_id may change (claim / self-create / assume), but only to a
  -- character the player is allowed to take: same campaign, not owned by someone
  -- else, and not already claimed by another member. Clearing it is always allowed.
  if new.party_member_id is distinct from old.party_member_id
     and new.party_member_id is not null then

    if not exists (
      select 1 from public.party_members pm
      where pm.id = new.party_member_id
        and pm.campaign_id = new.campaign_id
        and (pm.owner_user_id is null or pm.owner_user_id = (select auth.uid()))
    ) then
      raise exception 'Cannot link a character from another campaign or owned by another player';
    end if;

    if exists (
      select 1 from public.campaign_members cm
      where cm.party_member_id = new.party_member_id
        and cm.id is distinct from new.id
    ) then
      raise exception 'That character is already claimed by another player';
    end if;
  end if;

  return new;
end;
$$;
