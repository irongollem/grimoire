-- Migration: rag_note_embeddings
-- Embedding side table + match RPC for the DM's notes, so the Chronicler can
-- retrieve "what came before" — prior session notes and chronicles — when
-- writing a recap (#600). Fourth campaign corpus after npcs/factions/locations
-- (20260803000004), same #595 pattern.

-- ── Side table ──────────────────────────────────────────────────────────────
-- Embedding lives in a side table, never as a column on notes: useNotes.ts
-- (NotesView's data source) `.select("*")`s the notes list, so a
-- vector(1536) column (~6 KB/row) would add that weight to every list load
-- across every note in every campaign. `on delete cascade` means a deleted
-- note takes its embedding with it -- no orphan rows, no stale vectors
-- matching a note that no longer exists.
--
-- ONLY `notes` is embedded here -- not entity_notes, player_journal_entries,
-- or npc_player_notes, even though all four tables hold something a human
-- typed about the campaign. Those three are player-authored (a player's
-- private journal entry, a player's own note attached to an NPC or another
-- entity); #599's rule is that player-authored content is never indexed into
-- a DM-facing retrieval surface. `notes` is the one table in that group whose
-- authorship is always the DM/co-DM (`user_id` is a campaign member with DM
-- access, never a player) -- session notes and previously-generated
-- chronicles both live here (see the "Fourth campaign corpus" note above),
-- which is exactly the "what came before" material the Chronicler needs.
-- `is_player_visible`/`player_visible_to` control whether a DM's note is
-- later SHOWN to players; they say nothing about who WROTE it, so they play
-- no part in this decision.
--
-- embedding_model records which model produced each vector, same reasoning as
-- 20260803000001/20260803000004 -- not restated here.

create table note_embeddings (
  note_id         uuid primary key references notes(id) on delete cascade,
  embedding       vector(1536) not null,
  embedding_model text not null,
  source_hash     text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── HNSW index ──────────────────────────────────────────────────────────────
create index note_embeddings_vec_idx on note_embeddings
  using hnsw (embedding vector_cosine_ops);

-- ── updated_at trigger ──────────────────────────────────────────────────────
create trigger note_embeddings_updated_at
  before update on note_embeddings
  for each row execute procedure update_updated_at();

-- ── RLS: enabled, intentionally zero policies ──────────────────────────────
-- Written and read only by the generate-chronicle-text and embed-content edge
-- functions through the service-role client, which bypasses RLS entirely --
-- same story as npc_embeddings/faction_embeddings/location_embeddings
-- (20260803000004). RLS enabled with zero policies is a deny-all to anon and
-- authenticated -- this is intentional and keeps the security advisor clean.
-- Do not "fix" this later by adding permissive policies.
alter table note_embeddings enable row level security;

-- ── Nearest-neighbour RPC ───────────────────────────────────────────────────
-- Same shape as match_campaign_npcs/_factions/_locations (20260803000004):
-- SECURITY INVOKER (the default; note the absence of `security definer`),
-- `set search_path = public` pinned at creation, and a revoke/grant pair that
-- keeps this function off the PostgREST RPC surface. See 20260803000004 for
-- the full rationale -- not restated here.
--
-- p_embedding_model pins every comparison to vectors from the SAME model, for
-- the same reason as the other campaign-corpus RPCs. See 20260803000001 for
-- the full rationale.
--
-- Deliberately NOT dedup'd like match_library_monsters (20260803000003), same
-- reason as match_campaign_npcs: `notes` is a single-DM corpus with no
-- cross-source duplication, so the plain ranked query below is already
-- correct.

create function match_campaign_notes(
  query_embedding   vector(1536),
  p_campaign_id     uuid,
  p_owner_id        uuid,
  p_embedding_model text,
  p_exclude_id      uuid,
  p_categories      text[],
  match_count       int
) returns table (
  id          uuid,
  title       text,
  category    text,
  session_num int,
  distance    float
)
language sql stable
set search_path = public
as $$
  select
    n.id,
    n.title,
    n.category,
    n.session_num,
    e.embedding <=> query_embedding as distance
  from note_embeddings e
  join notes n on n.id = e.note_id
  -- Campaign rows plus the campaign OWNER's global (null-campaign) rows --
  -- see match_campaign_npcs (20260803000004) for the full rationale.
  where (n.campaign_id = p_campaign_id or (n.campaign_id is null and n.user_id = p_owner_id))
    -- Same-model gate: never compare vectors across models.
    and e.embedding_model = p_embedding_model
    -- Excludes the note currently being edited/generated into, so a recap
    -- never retrieves the very note it will be inserted into.
    and (p_exclude_id is null or n.id <> p_exclude_id)
    -- Category gate, in the WHERE before ranking like every other predicate
    -- here. ALL of the DM's notes are embedded (the corpus serves #599's
    -- campaign-wide search too), but a caller writing PLAYER-FACING prose
    -- must restrict what it retrieves: the Chronicler passes
    -- array['session'], because session notes narrate what already happened
    -- at the table, while lore/quest/faction/location/general notes are the
    -- DM's planning material -- an unrevealed twist retrieved from a lore
    -- note would be woven into the recap as a "callback", leaking the
    -- spoiler in the DM's own voice.
    and n.category = any(p_categories)
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function match_campaign_notes(vector, uuid, uuid, text, uuid, text[], int) from public, anon, authenticated;
grant  execute on function match_campaign_notes(vector, uuid, uuid, text, uuid, text[], int) to service_role;
