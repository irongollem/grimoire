-- Migration: puzzle_player_visible_to
--
-- Gives puzzles the audience every other shareable entity already has (#741).
--
-- Puzzles were the one entity whose "share with players" could not name a
-- player: a single `is_shared` boolean revealed a puzzle to the whole campaign
-- or to nobody. That made the unified reveal control impossible to fit — its
-- entire premise is choosing *who* — and it made puzzles quietly less useful
-- than the location or NPC next to them, since a DM could not hand one player
-- the riddle their character is standing in front of.
--
-- `is_shared` is kept and stays in lockstep with the audience (shared ⇔ the
-- list is non-empty). It is what assigns `campaign_id`, and dropping it would
-- reach into the generator, the templates and the DM list for no gain. The
-- audience is the authority; `is_shared` is the derived flag.

-- ── 1. The column ─────────────────────────────────────────────────────────────
-- NOT NULL DEFAULT '{}' from the start, matching every sibling table as of
-- 20260817224804 — the nullable version of this column bought nothing and cost
-- a crash on every row nobody had ever shared.
alter table puzzle_rooms
  add column player_visible_to uuid[] not null default '{}'::uuid[];

-- ── 2. Backfill ───────────────────────────────────────────────────────────────
-- Every currently-shared puzzle is visible to the whole campaign today, so it
-- must stay visible to the whole party. Without this the migration would
-- silently empty the players' puzzle list — the audience gate would find an
-- empty array on rows that are, right now, shared with everyone.
update puzzle_rooms p
   set player_visible_to = coalesce((
         select array_agg(pm.id)
           from party_members pm
          where pm.campaign_id = p.campaign_id
       ), '{}'::uuid[])
 where p.is_shared = true
   and p.campaign_id is not null;

-- ── 3. Visibility helper ──────────────────────────────────────────────────────
-- In `private`, not `public`: it is an authorization predicate, and PostgREST
-- auto-publishes everything in `public` as an RPC. Mirrors
-- private.is_quest_player_visible (20260711000012).
create or replace function private.is_puzzle_player_visible(p_puzzle_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from puzzle_rooms p
    join campaign_members cm on cm.campaign_id = p.campaign_id
    where p.id = p_puzzle_id
      and cm.user_id = (select auth.uid())
      and cm.party_member_id = any (p.player_visible_to)
  );
$$;
revoke all on function private.is_puzzle_player_visible(uuid) from public;
grant execute on function private.is_puzzle_player_visible(uuid) to authenticated, anon, service_role;

-- ── 4. Projection ─────────────────────────────────────────────────────────────
-- `returns setof puzzle_rooms` with an explicit select list, so the new column
-- has to be added here too or the function breaks at call time with "structure
-- of query does not match". Written out in full rather than string-patched onto
-- pg_get_functiondef, because the audience gate in the WHERE clause changes as
-- well and a two-anchor patch is a worse thing to read than the whole function.
--
-- The audience replaces `p.is_shared = true` as the gate. It is strictly
-- narrower: step 2 gave every shared puzzle the whole party, so no player loses
-- a puzzle they can see today, and an unshared puzzle has an empty array, which
-- matches nobody.
drop function if exists public.get_player_visible_puzzles(uuid, uuid);

create function get_player_visible_puzzles(
  p_campaign_id uuid default null,
  p_puzzle_id uuid default null,
  p_preview_party_member_id uuid default null
)
returns setof puzzle_rooms
language plpgsql stable security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_preview_party_member_id is not null and not exists (
    select 1
    from public.party_members pm
    where pm.id = p_preview_party_member_id
      and (p_campaign_id is null or pm.campaign_id = p_campaign_id)
      and coalesce(private.is_campaign_dm(pm.campaign_id), false)
  ) then
    raise exception 'Preview audience is not available to this DM';
  end if;

  return query select
    p.id,
    p.user_id,
    p.name,
    p.puzzle_type,
    p.difficulty,
    p.description,                       -- player-facing "The Room" setup
    null::text,                          -- solution (DM-only)
    -- hints: keep only the entries the DM has revealed via shared_hints
    coalesce((
      select jsonb_agg(h order by (h->>'order')::int)
      from jsonb_array_elements(coalesce(p.hints, '[]'::jsonb)) h
      where (h->>'order')::int = any (coalesce(p.shared_hints, array[]::int[]))
    ), '[]'::jsonb),
    p.skill_checks,                      -- skill + DC are shown to players
    null::text,                          -- success_outcome (DM-only)
    null::text,                          -- failure_consequence (DM-only)
    p.image_url,
    p.image_focal_point,
    p.tags,
    null::text,                          -- notes (DM-only)
    p.created_at,
    p.updated_at,
    p.campaign_id,
    p.is_shared,
    p.shared_hints,
    p.read_aloud,
    null::uuid,                          -- location_id (DM-only anchor)
    null::uuid,                          -- dungeon_feature_id (DM-only anchor)
    p.ai_provenance,
    p.player_visible_to
  from puzzle_rooms p
  where p.campaign_id is not null
    and (p_campaign_id is null or p.campaign_id = p_campaign_id)
    and (p_puzzle_id   is null or p.id = p_puzzle_id)
    and case
      when p_preview_party_member_id is null then private.is_puzzle_player_visible(p.id)
      else p_preview_party_member_id = any (p.player_visible_to)
        and coalesce(private.is_campaign_dm(p.campaign_id), false)
    end;
end;
$$;

-- The new signature gets fresh default grants, so restate the login-only
-- boundary explicitly. anon's access comes via the PUBLIC grant, so revoking
-- from anon alone would be a no-op.
revoke execute on function public.get_player_visible_puzzles(uuid, uuid, uuid) from public, anon;
grant execute on function public.get_player_visible_puzzles(uuid, uuid, uuid) to authenticated, service_role;
