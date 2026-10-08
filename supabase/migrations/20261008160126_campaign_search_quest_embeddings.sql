-- Migration: campaign_search_quest_embeddings
-- Campaign-wide semantic search (#599): "find my thing" across the DM's own
-- material, by meaning rather than by exact keyword.
--
-- Nearly all of the machinery already exists. #595 built it for monsters,
-- #600 generalised it to npcs/factions/locations (20260803000004) and notes
-- (20260804000001), and #602 to items (20260805000005). The search-campaign
-- edge function reuses every one of those corpora and their match_* RPCs
-- as they stand. What this migration adds is the one corpus the search needs
-- that nothing had built yet, quests, plus the bookkeeping that every corpus
-- carries:
--
--   1. quest_embeddings + match_campaign_quests, the same #595 shape.
--   2. 'quest' in get_unembedded_content_counts, so the "index everything"
--      offer (#841) covers quests too.
--   3. quest_embeddings in the demo-campaign copy registry, so a fresh demo
--      is searchable from the first query, like every other corpus.
--   4. A 0-credit 'campaign_search' cost row for the query embedding each
--      search logs, so its spend is attributable in AdminPricingTab rather
--      than invisible (same reasoning as 20260803000005's entity_embedding).
--
-- PLAYER-AUTHORED CONTENT IS NOT INDEXED, and this migration adds nothing
-- that would change that. entity_notes, player_journal_entries and
-- npc_player_notes have a data subject who is not the DM, and the campaign's
-- ai_enabled flag is the DM's to set, so it cannot consent on a player's
-- behalf. npc_player_notes is also scoped to one party member: indexing it
-- into a DM-facing search would hand the DM a player's private speculation.
-- quests, quest_objectives and quest_beats are written only from the DM's
-- surfaces (no player surface writes a quest), so the quest corpus is DM
-- material through and through.

-- ── Side table ──────────────────────────────────────────────────────────────
-- A side table, never a column on quests: useQuests.ts `.select("*")`s the
-- quest list, and a vector(1536) is ~6 KB a row that every list load would
-- carry. `on delete cascade` takes the vector with the quest, so search never
-- confidently returns a quest that no longer exists.
--
-- One vector per QUEST, not per beat. The embed text (buildQuestEmbedText in
-- _shared/entityEmbedText.ts) folds the quest's objectives and its live
-- beats' titles into the quest's own text, so a query naming an event ("the
-- harbour office") finds the quest the beat belongs to. Beat prose is left
-- out on purpose: folded in, it diluted the one vector until a quest stopped
-- answering its own name (measured in buildQuestEmbedText's doc). Beats are
-- not a destination in the search UI (a beat lives inside
-- its quest's flow), and a per-beat corpus would multiply the #599 storage
-- multiplier (~15 KB a row with HNSW) by the number of beats for no
-- destination the DM can open.

create table quest_embeddings (
  quest_id        uuid primary key references quests(id) on delete cascade,
  embedding       extensions.vector(1536) not null,
  embedding_model text not null,
  source_hash     text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index quest_embeddings_vec_idx on quest_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

create trigger quest_embeddings_updated_at
  before update on quest_embeddings
  for each row execute procedure update_updated_at();

-- RLS enabled with zero policies: written by embed-content and read by
-- search-campaign, both through the service-role client. Same deny-all as
-- every other *_embeddings table; a policy would only widen access. Do not
-- "fix" this by adding one.
alter table quest_embeddings enable row level security;

-- ── Nearest-neighbour RPC ───────────────────────────────────────────────────
-- Same shape as match_campaign_npcs (20260803000004): SECURITY INVOKER,
-- search_path pinned, service-role only, scope and same-model gates in the
-- WHERE before ranking. Scope is the campaign's rows plus the campaign
-- OWNER's global (null-campaign) rows; p_owner_id is campaigns.user_id, read
-- by the edge function, never supplied by the caller.

create function match_campaign_quests(
  query_embedding   extensions.vector(1536),
  p_campaign_id     uuid,
  p_owner_id        uuid,
  p_embedding_model text,
  match_count       int
) returns table (
  id       uuid,
  title    text,
  status   text,
  distance float
)
language sql stable
set search_path = public, extensions
as $$
  select
    q.id,
    q.title,
    q.status::text,
    e.embedding <=> query_embedding as distance
  from quest_embeddings e
  join quests q on q.id = e.quest_id
  where (q.campaign_id = p_campaign_id or (q.campaign_id is null and q.user_id = p_owner_id))
    and e.embedding_model = p_embedding_model
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function match_campaign_quests(extensions.vector, uuid, uuid, text, int) from public, anon, authenticated;
grant  execute on function match_campaign_quests(extensions.vector, uuid, uuid, text, int) to service_role;

-- ── Unembedded counts ───────────────────────────────────────────────────────
-- Same function as 20260907120124 with a seventh kind. Body otherwise
-- unchanged; the rationale for every line lives in that migration.

create or replace function public.get_unembedded_content_counts(p_campaign_id uuid)
returns table (kind text, missing integer, ids uuid[])
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  return query
  select 'item'::text, count(*)::integer, coalesce(array_agg(i.id), '{}'::uuid[])
  from public.items i
  left join public.item_embeddings e on e.item_id = i.id
  where i.campaign_id = p_campaign_id and e.item_id is null

  union all
  select 'npc'::text, count(*)::integer, coalesce(array_agg(n.id), '{}'::uuid[])
  from public.npcs n
  left join public.npc_embeddings e on e.npc_id = n.id
  where n.campaign_id = p_campaign_id and e.npc_id is null

  union all
  select 'faction'::text, count(*)::integer, coalesce(array_agg(f.id), '{}'::uuid[])
  from public.factions f
  left join public.faction_embeddings e on e.faction_id = f.id
  where f.campaign_id = p_campaign_id and e.faction_id is null

  union all
  select 'location'::text, count(*)::integer, coalesce(array_agg(l.id), '{}'::uuid[])
  from public.locations l
  left join public.location_embeddings e on e.location_id = l.id
  where l.campaign_id = p_campaign_id and e.location_id is null

  union all
  select 'note'::text, count(*)::integer, coalesce(array_agg(nt.id), '{}'::uuid[])
  from public.notes nt
  left join public.note_embeddings e on e.note_id = nt.id
  where nt.campaign_id = p_campaign_id and e.note_id is null

  union all
  select 'monster'::text, count(*)::integer, coalesce(array_agg(m.id), '{}'::uuid[])
  from public.monsters m
  left join public.monster_embeddings e on e.monster_id = m.id
  where m.campaign_id = p_campaign_id and e.monster_id is null

  union all
  select 'quest'::text, count(*)::integer, coalesce(array_agg(q.id), '{}'::uuid[])
  from public.quests q
  left join public.quest_embeddings e on e.quest_id = q.id
  where q.campaign_id = p_campaign_id and e.quest_id is null

  order by 1;
end;
$$;

-- ── Demo copy ───────────────────────────────────────────────────────────────
-- Copied with its quest, like every other campaign corpus, so a new demo is
-- searchable by meaning from the first query (demo-campaign.md).
insert into private.demo_campaign_tables (table_name, tier, parent_column, parent_table, copy, reason) values
  ('quest_embeddings', 2, 'quest_id', 'quests', true, null);

-- ── Ledger attribution ──────────────────────────────────────────────────────
insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order) values
  ('campaign_search', 'Campaign Search (infrastructure)', 0, 47);
