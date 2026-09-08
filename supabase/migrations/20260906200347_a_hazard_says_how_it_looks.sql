-- A trap or feature says how it looks. Story #804.
--
-- Traps, features and tables can be placed in a room (#788, #802), but a rolling
-- boulder and a spike pit have no way to draw differently — nothing on the
-- content row says what the thing *is*, visually.
--
-- ── Why the existing fields do not cover it ─────────────────────────────────
--
-- `traps.trap_type` is `Mechanical | Magical | Hybrid | Environmental`: a
-- mechanical classification, not a visual one. A spike pit and a rolling
-- boulder are both `Mechanical`. And the tile pack schema has no hazard
-- category at all — its objects stop at chest, barrel, table, statue, pillar,
-- brazier.
--
-- ── Why this is not a pack category id ──────────────────────────────────────
--
-- The obvious shortcut is to point a trap at a pack asset. That couples a
-- content row to one pack, and the trap becomes undrawable the moment a DM
-- loads a pack lacking that exact art. A trap says what it *is*; the renderer
-- decides how to draw that given whichever pack is loaded — the same
-- separation `location_type` → colour already uses.
--
-- ── text + CHECK rather than a Postgres enum ────────────────────────────────
--
-- Deliberate, and against the grain of `location_type_enum` / `npc_relationship`
-- nearby. This list is a drawing hint that will grow as packs gain art, and
-- `alter type ... add value` cannot run inside a transaction block alongside
-- other statements — which is how every migration here is written. A CHECK is
-- rewritten in place by the next migration with no such constraint.
--
-- Both lists are deliberately short. This is a hint for a renderer, not a
-- taxonomy of hazards, and a long list nobody fills in is worse than a short one
-- that is always answerable.

alter table public.traps
  add column if not exists hazard_glyph text;

alter table public.traps
  drop constraint if exists traps_hazard_glyph_check,
  add constraint traps_hazard_glyph_check check (
    hazard_glyph is null or hazard_glyph in (
      'pit', 'pressure_plate', 'tripwire', 'falling_block', 'dart_wall',
      'blade', 'flame_jet', 'glyph', 'net', 'alarm', 'collapsing_floor'
    )
  );

comment on column public.traps.hazard_glyph is
  'How this trap draws on a site map (#804) — what it IS, not which pack asset '
  'to use. Null means the renderer falls back to a generic hazard marker. Never '
  'reference a tile-pack category here: a trap must stay drawable under a pack '
  'that lacks the art.';

alter table public.dungeon_features
  add column if not exists feature_glyph text;

alter table public.dungeon_features
  drop constraint if exists dungeon_features_feature_glyph_check,
  add constraint dungeon_features_feature_glyph_check check (
    feature_glyph is null or feature_glyph in (
      'secret_door', 'hidden_passage', 'cache', 'moving_wall', 'lever',
      'altar', 'fountain', 'statue', 'rubble', 'inscription'
    )
  );

comment on column public.dungeon_features.feature_glyph is
  'How this feature draws on a site map (#804). Same contract as '
  'traps.hazard_glyph — an app-level visual kind, never a pack asset id.';

-- ── Puzzles need no third path, decided rather than omitted ─────────────────
--
-- #804 asked whether puzzles should be drawable too, noting they are anchored
-- by their own columns rather than through `location_placements`. Checked: the
-- table is `puzzle_rooms` (not `puzzles`, as the issue had it), and it carries
-- both `location_id` and `dungeon_feature_id`.
--
-- That settles it without a new mechanism. A puzzle anchored to a **dungeon
-- feature** is drawn by that feature's glyph — the puzzle is what the feature
-- contains, not a separate thing on the floor. A puzzle anchored to a
-- **location** is the room itself, and a room has no cell to mark. So there is
-- nothing a `puzzle_glyph` would draw that these two do not already cover.
