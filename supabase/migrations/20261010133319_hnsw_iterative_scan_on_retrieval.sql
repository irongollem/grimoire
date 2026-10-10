-- The retrieval RPCs keep scanning until their scope yields match_count rows
-- (#999 3.4.3, context/architecture/database-review.md section 7).
--
-- Every match_* function filters (campaign, owner, source, ruleset, model) and
-- then orders by `embedding <=> query` with a limit. When the planner answers
-- that with the HNSW index, the index hands back its ef_search (40) nearest
-- neighbours across the WHOLE table and the filter runs afterwards, so a scope
-- that holds few of those 40 returns fewer rows than asked, or none: a
-- campaign's NPCs drowned out by every other campaign's. Probed on pgvector
-- 0.8.0 with 6,000 vectors, 30 of them in scope and the index scan forced: the
-- default returned 0 of 10 rows, iterative scan 10 of 10. On small tables the
-- planner prefers an exact sequential scan and nothing changes; this is for the
-- day it does not.
--
-- strict_order rather than relaxed_order: results stay in exact distance order,
-- so no body has to re-sort, and hnsw.max_scan_tuples (20,000) still bounds the
-- work. A function-level SET leaves every other query's planning alone.
--
-- hnsw.iterative_scan exists from pgvector 0.8.0. Fail with the remedy rather
-- than with pgvector's own "invalid configuration parameter" on an older one.
do $$
declare
  v int[] := string_to_array(
    (select extversion from pg_extension where extname = 'vector'), '.')::int[];
begin
  if v < array[0, 8, 0] then
    raise exception 'pgvector % has no hnsw.iterative_scan; run "alter extension vector update" first',
      array_to_string(v, '.');
  end if;
end;
$$;

alter function public.match_library_monsters(extensions.vector, text[], text, text, integer)
  set hnsw.iterative_scan = strict_order;
alter function public.match_custom_monsters(extensions.vector, uuid, uuid, text, text, integer)
  set hnsw.iterative_scan = strict_order;
alter function public.match_library_items(extensions.vector, text[], text, text[], boolean, text, integer)
  set hnsw.iterative_scan = strict_order;
alter function public.match_custom_items(extensions.vector, uuid, uuid, text[], boolean, text, integer)
  set hnsw.iterative_scan = strict_order;
alter function public.match_campaign_npcs(extensions.vector, uuid, uuid, text, integer)
  set hnsw.iterative_scan = strict_order;
alter function public.match_campaign_locations(extensions.vector, uuid, uuid, text, integer)
  set hnsw.iterative_scan = strict_order;
alter function public.match_campaign_factions(extensions.vector, uuid, uuid, text, integer)
  set hnsw.iterative_scan = strict_order;
alter function public.match_campaign_notes(extensions.vector, uuid, uuid, text, uuid, text[], integer)
  set hnsw.iterative_scan = strict_order;
alter function public.match_campaign_quests(extensions.vector, uuid, uuid, text, integer)
  set hnsw.iterative_scan = strict_order;
