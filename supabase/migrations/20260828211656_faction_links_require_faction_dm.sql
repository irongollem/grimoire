-- Any player could enrol themselves into any faction, in any campaign, and read it.
--
-- THE ESCALATION
--
-- `faction_party_members` gated INSERT and UPDATE on `(select auth.uid()) = user_id`
-- and nothing else — no faction ownership, no campaign. Meanwhile three read policies
-- admit rows purely on the join that table expresses:
--
--   factions.factions_member_select
--   faction_npcs.faction_npcs_shared_faction_member_select
--   faction_party_members.faction_party_members_fellow_member_select  (via private.is_faction_pc_member)
--
-- each of the form "there exists a faction_party_members row linking this faction to a
-- campaign_members row where cm.user_id = auth.uid() and cm.role = 'player'". Nothing
-- ties the faction's campaign to the caller's. So the predicate is satisfied by a row
-- the caller is allowed to write.
--
-- Attack, from any ordinary player account: insert
-- `faction_party_members(user_id = self, faction_id = <any faction>, party_member_id =
-- <your own character>)`. You now read that faction, its faction_npcs, and its full PC
-- roster — DM-authored content in a campaign you are not a member of. It also defeats
-- the DM's per-faction `player_visible_to` gating inside your own campaign.
--
-- Demonstrated on a local replica as a player who belongs only to campaign A, against a
-- faction in campaign B: factions visible before = 0, self-enrol succeeds, factions
-- visible after = 1. Production data is currently clean (no cross-campaign links exist),
-- so this is reachable-but-unexploited rather than an active breach.
--
-- WHY THE 20260828201935 SWEEP MISSED IT
--
-- That sweep enumerated tables that *have* a `campaign_id` column, and these five
-- junctions have only `faction_id` — they derive their campaign through the parent. So
-- the census that found 27 tables could not see them. `faction_deities` is the odd one
-- out that proves the shape: it carries a real `campaign_id` and has been gated on
-- `private.is_campaign_dm(campaign_id)` all along.
--
-- The general lesson, which is the same one 20260828210805 recorded from the other
-- direction: the dangerous pattern is *a read policy whose predicate depends on a column
-- a less-privileged user may write*. Where the campaign_id lives is an implementation
-- detail of the table; it is not what makes the policy safe.
--
-- THE FIX
--
-- `private.can_edit_faction(faction_id)` resolves the campaign through the parent and
-- mirrors, exactly, the predicate `factions_update`/`factions_delete` already use for the
-- faction row itself — campaign DM, or owner of a global (campaign_id null) faction. It
-- returns `exists (...)`, so it is total: never NULL, which matters because a future
-- caller may negate it (see CLAUDE.md on private.is_app_admin).
--
-- Applied to INSERT and UPDATE on all five junctions, not only the two with an
-- exploitable read path. `faction_items`, `faction_locations` and `faction_relations`
-- have no shared read arm today, so injecting into them currently gains nothing — but
-- "gains nothing" is a property of the present policy set, and the two that *are*
-- exploitable became so when a read policy was added later to a table whose write side
-- had always been this loose. Leaving three siblings in that shape just arms the next one.
--
-- DELETE is deliberately unchanged (`auth.uid() = user_id`, i.e. delete only rows you
-- created): widening it to faction editors is not needed to close this and would be a
-- privilege increase in a migration whose job is the opposite.
--
-- Not addressed, deliberately: `faction_relations.target_faction_id` may still name a
-- faction the caller does not own. That stores a uuid and opens no read path —
-- `faction_relations_select` is owner-only, with no shared arm — so there is nothing to
-- close. If a shared read arm is ever added there, gate the target too.

create or replace function private.can_edit_faction(p_faction_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.factions f
    where f.id = p_faction_id
      and (
        (f.campaign_id is not null and private.is_campaign_dm(f.campaign_id))
        or (f.campaign_id is null and f.user_id = (select auth.uid()))
      )
  );
$$;

comment on function private.can_edit_faction(uuid) is
  'True when the caller may edit the given faction: DM of its campaign, or owner of a '
  'global faction. Mirrors the factions_update/factions_delete predicate. Lives in '
  'private so PostgREST cannot publish it. Total (exists), so it is safe to negate.';

-- ── faction_party_members — the one with the escalation ──────────────────────
drop policy faction_party_members_insert on public.faction_party_members;
create policy faction_party_members_insert on public.faction_party_members
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and private.can_edit_faction(faction_id)
  );

drop policy faction_party_members_update on public.faction_party_members;
create policy faction_party_members_update on public.faction_party_members
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and private.can_edit_faction(faction_id)
  );

-- ── faction_npcs — same shape, feeds faction_npcs_shared_faction_member_select ──
drop policy faction_npcs_insert on public.faction_npcs;
create policy faction_npcs_insert on public.faction_npcs
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and private.can_edit_faction(faction_id)
  );

drop policy faction_npcs_update on public.faction_npcs;
create policy faction_npcs_update on public.faction_npcs
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and private.can_edit_faction(faction_id)
  );

-- ── The three with no shared read arm today, closed for consistency ──────────
drop policy faction_items_insert on public.faction_items;
create policy faction_items_insert on public.faction_items
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and private.can_edit_faction(faction_id)
  );

drop policy faction_items_update on public.faction_items;
create policy faction_items_update on public.faction_items
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and private.can_edit_faction(faction_id)
  );

drop policy faction_locations_insert on public.faction_locations;
create policy faction_locations_insert on public.faction_locations
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and private.can_edit_faction(faction_id)
  );

drop policy faction_locations_update on public.faction_locations;
create policy faction_locations_update on public.faction_locations
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and private.can_edit_faction(faction_id)
  );

drop policy faction_relations_insert on public.faction_relations;
create policy faction_relations_insert on public.faction_relations
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and private.can_edit_faction(faction_id)
  );

drop policy faction_relations_update on public.faction_relations;
create policy faction_relations_update on public.faction_relations
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and private.can_edit_faction(faction_id)
  );
