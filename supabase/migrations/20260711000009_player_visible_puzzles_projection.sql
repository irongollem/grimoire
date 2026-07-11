-- Migration: player_visible_puzzles_projection
-- #507 (part 1 — puzzles, highest-value leak: the full solution).
--
-- Players read shared puzzles two ways, both via a plain base-table `select *`:
--   * usePlayerVisiblePuzzles (the /play/puzzles list)
--   * usePuzzle → PlayerPuzzleDetailView (the single-puzzle page)
-- and puzzle_rooms_select grants a campaign member the WHOLE shared row —
-- `solution`, EVERY `hints` entry (revealed or not), `success_outcome`,
-- `failure_consequence`, and DM `notes`. The player UI filters hints to
-- `shared_hints` client-side only, so a player who opens devtools can read the
-- solution and unrevealed hints straight out of the JSON payload before solving.
--
-- Column/sub-row secrecy can't be expressed in an RLS policy, so the fix mirrors
-- the NPC projection (get_player_visible_npcs, 20260613000001): a SECURITY DEFINER
-- projection that nulls the DM-only columns and filters `hints` down to the
-- revealed ones, PLUS removing the player branch of puzzle_rooms_select so the
-- base table is no longer a devtools bypass. The DM keeps full base-table access
-- via the owner branch; players now read exclusively through the projection.
--
-- Player-facing puzzle fields (what PlayerPuzzleDetailView renders): name,
-- puzzle_type, difficulty, description ("The Room"), skill_checks (skill + DC),
-- image, tags, read_aloud, and the hints whose `order` is in shared_hints.

-- ── 1. Projection function ────────────────────────────────────────────────────
-- p_campaign_id → the player's shared-puzzle list; p_puzzle_id → one puzzle page.
-- Column list must match the puzzle_rooms row type positionally.
create or replace function get_player_visible_puzzles(
  p_campaign_id uuid default null,
  p_puzzle_id   uuid default null
)
returns setof puzzle_rooms
language sql stable security definer
set search_path = public
as $$
  select
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
    p.read_aloud
  from puzzle_rooms p
  where p.is_shared = true
    and p.campaign_id is not null
    and (p_campaign_id is null or p.campaign_id = p_campaign_id)
    and (p_puzzle_id   is null or p.id = p_puzzle_id)
    and private.is_campaign_member(p.campaign_id);
$$;

revoke all on function get_player_visible_puzzles(uuid, uuid) from public;
grant execute on function get_player_visible_puzzles(uuid, uuid) to authenticated;

-- ── 2. Close the base-table devtools bypass ───────────────────────────────────
-- puzzle_rooms_select granted members the full shared row. Players now read only
-- through the projection, so restrict the policy to the owner (DM). This is the
-- only player read path for puzzle_rooms, so nothing else regresses.
drop policy if exists "puzzle_rooms_select" on puzzle_rooms;

create policy "puzzle_rooms_select" on puzzle_rooms
  for select using ((select auth.uid()) = user_id);
