-- Drop the HNSW indexes on the campaign-scoped embedding tables (#999 3.4.6,
-- context/architecture/database-review.md section 7).
--
-- Every match_campaign_* / match_custom_* function narrows to one campaign or
-- one owner before it ranks, and a scope holds a few hundred vectors at most.
-- The planner answers that by reading the scope and sorting it exactly, which
-- is both faster than an approximate index walk and exact. Production's
-- pg_stat_user_indexes on 11 Oct 2026 confirmed it: these seven indexes had
-- never been scanned (npc 537 rows, location 452, item 350, monster 127,
-- note 38, faction 32, quest a handful), while every re-embed still paid to
-- maintain them, about 13 MB between them.
--
-- The two library indexes stay: library_monster_embeddings and
-- library_item_embeddings are global tables (3,541 and 1,718 rows) searched
-- across whole sources, and they are scanned. hnsw.iterative_scan stays on
-- every match_* function (20261010133319): with no index it changes nothing,
-- and it keeps a function correct if an index is ever added back.
--
-- A short lock_timeout, as in 20261010102354: a drop waits behind any reader,
-- and the readers behind it would queue in turn.
set local lock_timeout = '5s';

drop index if exists public.npc_embeddings_vec_idx;
drop index if exists public.location_embeddings_vec_idx;
drop index if exists public.faction_embeddings_vec_idx;
drop index if exists public.note_embeddings_vec_idx;
drop index if exists public.quest_embeddings_vec_idx;
drop index if exists public.item_embeddings_vec_idx;
drop index if exists public.monster_embeddings_vec_idx;
