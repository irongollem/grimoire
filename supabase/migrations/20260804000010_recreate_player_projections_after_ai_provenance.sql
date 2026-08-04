-- Migration: recreate_player_projections_after_ai_provenance
-- 20260804000002 appended ai_provenance to six tables returned by positional
-- SETOF-table player projections. PostgreSQL validates SQL-function row shapes
-- only when they execute, so those player reads then failed with 42P13. Append
-- the new disclosure column to each projection while preserving every existing
-- secrecy gate in the current function body.

do $recreate$
declare
  definition text;
  patched text;
begin
  definition := pg_get_functiondef('public.get_player_visible_items()'::regprocedure);
  patched := replace(
    definition,
    E'    i.mastery\n  from items i',
    E'    i.mastery,\n    i.ai_provenance\n  from items i'
  );
  if patched = definition then raise exception 'Could not patch get_player_visible_items'; end if;
  execute patched;

  definition := pg_get_functiondef('public.get_player_visible_locations(uuid, uuid)'::regprocedure);
  patched := replace(
    definition,
    E'    null::text                                                                -- audio_theme (DM-only)\n  from locations l',
    E'    null::text,                                                               -- audio_theme (DM-only)\n    l.ai_provenance\n  from locations l'
  );
  if patched = definition then raise exception 'Could not patch get_player_visible_locations'; end if;
  execute patched;

  definition := pg_get_functiondef('public.get_player_visible_monsters(uuid)'::regprocedure);
  patched := replace(
    definition,
    E'    m.provenance\n  from monsters m',
    E'    m.provenance,\n    m.ai_provenance\n  from monsters m'
  );
  if patched = definition then raise exception 'Could not patch get_player_visible_monsters'; end if;
  execute patched;

  definition := pg_get_functiondef('public.get_player_visible_npcs(uuid, uuid[], uuid)'::regprocedure);
  patched := replace(
    definition,
    E'    false                                                  -- is_revealed (cover shown; never leak true state)\n  from (',
    E'    false,                                                 -- is_revealed (cover shown; never leak true state)\n    s.ai_provenance\n  from ('
  );
  if patched = definition then raise exception 'Could not patch get_player_visible_npcs'; end if;
  execute patched;

  definition := pg_get_functiondef('public.get_player_visible_puzzles(uuid, uuid)'::regprocedure);
  patched := replace(
    definition,
    E'    null::uuid                           -- dungeon_feature_id (DM-only anchor)\n  from puzzle_rooms p',
    E'    null::uuid,                          -- dungeon_feature_id (DM-only anchor)\n    p.ai_provenance\n  from puzzle_rooms p'
  );
  if patched = definition then raise exception 'Could not patch get_player_visible_puzzles'; end if;
  execute patched;

  definition := pg_get_functiondef('public.get_player_visible_quests(uuid, uuid)'::regprocedure);
  patched := replace(
    definition,
    E'    q.player_visible_to\n  from quests q',
    E'    q.player_visible_to,\n    q.ai_provenance\n  from quests q'
  );
  if patched = definition then raise exception 'Could not patch get_player_visible_quests'; end if;
  execute patched;
end
$recreate$;

-- CREATE OR REPLACE preserves grants, but keep the login-only RPC boundary
-- explicit in the migration that recreates these security-definer functions.
revoke execute on function public.get_player_visible_items() from public, anon;
revoke execute on function public.get_player_visible_locations(uuid, uuid) from public, anon;
revoke execute on function public.get_player_visible_monsters(uuid) from public, anon;
revoke execute on function public.get_player_visible_npcs(uuid, uuid[], uuid) from public, anon;
revoke execute on function public.get_player_visible_puzzles(uuid, uuid) from public, anon;
revoke execute on function public.get_player_visible_quests(uuid, uuid) from public, anon;

grant execute on function public.get_player_visible_items() to authenticated, service_role;
grant execute on function public.get_player_visible_locations(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_player_visible_monsters(uuid) to authenticated, service_role;
grant execute on function public.get_player_visible_npcs(uuid, uuid[], uuid) to authenticated, service_role;
grant execute on function public.get_player_visible_puzzles(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_player_visible_quests(uuid, uuid) to authenticated, service_role;
