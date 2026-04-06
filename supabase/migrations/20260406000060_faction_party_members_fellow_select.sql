-- Allow players to see all party member entries in factions they belong to,
-- so the player view can show fellow PC members in "KNOWN MEMBERS".
--
-- A self-referential RLS policy on faction_party_members would recurse, so we
-- use a security-definer function that queries the table without RLS applied.

create or replace function is_faction_pc_member(p_faction_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from faction_party_members fpm
    join campaign_members cm on cm.party_member_id = fpm.party_member_id
    where fpm.faction_id = p_faction_id
      and cm.user_id = p_user_id
      and cm.role = 'player'
  );
$$;

-- Players can read all faction_party_members rows for factions they belong to.
create policy "faction_party_members_fellow_member_select" on faction_party_members
  for select using (
    is_faction_pc_member(faction_id, auth.uid())
  );
