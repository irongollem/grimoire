-- Migration: puzzle_room_anchors
-- #168 — anchor a puzzle to the location and/or dungeon feature that hosts it,
-- so the puzzle view mode can render navigable links instead of the anchor
-- living only in the DM's head.
--
-- Also recreates get_player_visible_puzzles: it `returns setof puzzle_rooms`
-- with an explicit select list, so adding table columns without extending that
-- list breaks the function at call time ("structure of query does not match").
-- The anchors are DM prep data and are nulled out for players.

alter table puzzle_rooms
  add column location_id uuid references locations(id) on delete set null,
  add column dungeon_feature_id uuid references dungeon_features(id) on delete set null;

create index puzzle_rooms_location_idx on puzzle_rooms (location_id);
create index puzzle_rooms_dungeon_feature_idx on puzzle_rooms (dungeon_feature_id);

create or replace function get_player_visible_puzzles(
  p_campaign_id uuid default null,
  p_puzzle_id uuid default null
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
    p.read_aloud,
    null::uuid,                          -- location_id (DM-only anchor)
    null::uuid                           -- dungeon_feature_id (DM-only anchor)
  from puzzle_rooms p
  where p.is_shared = true
    and p.campaign_id is not null
    and (p_campaign_id is null or p.campaign_id = p_campaign_id)
    and (p_puzzle_id   is null or p.id = p_puzzle_id)
    and private.is_campaign_member(p.campaign_id);
$$;

revoke all on function get_player_visible_puzzles(uuid, uuid) from public;
grant execute on function get_player_visible_puzzles(uuid, uuid) to authenticated;
