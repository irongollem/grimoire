-- The canon at the AI table (#1226 story 9, frame 09 "The Narrator", frame 03 "What the table added").
--
-- The AI table comes last: every part of the canon works for a DM at a real table first. Here the Narrator reads it
-- and adds to it without breaking it. Two pieces of schema:
--
-- 1. What the table added (`story_facts`, #1021) gains the DM's review. Keep stamps `kept_at`; Strike stamps
--    `struck_at`: the fact never happened from now on, with nothing in its place (a correction already supersedes a
--    fact with a new one; a strike has no successor, which the schema could not say). A struck fact leaves the players'
--    view and the Narrator's record. `story_facts_keep_what_was_written` guards the listed columns only, so these two
--    may change; the DM-only update policy already covers them.
-- 2. The canon joins the campaign search by meaning (the #600 corpora): `canon_embeddings`, one vector per entry, the
--    entry's title and text with a lore entry's passages folded in. The Narrator looks the canon up through
--    `match_campaign_canon`, asking only for the parts it may read (never a secret: it gets a secret's clues where the
--    party stands, never its statement). Written by embed-content and read by edge functions through the service role.

-- ── 1. Keep and strike ────────────────────────────────────────────────────────
alter table public.story_facts
  add column kept_at timestamptz,
  add column struck_at timestamptz,
  add constraint story_facts_kept_or_struck check (kept_at is null or struck_at is null);

-- A struck fact never happened: players stop reading it, and the ties that hang off it with it.
alter policy "story_facts_select" on public.story_facts
  using (private.is_campaign_dm(campaign_id)
         or (known_to_player and struck_at is null and private.is_campaign_member(campaign_id)));

alter policy "story_fact_links_select" on public.story_fact_links
  using (private.is_campaign_dm(campaign_id)
         or (private.is_campaign_member(campaign_id)
             and exists (select 1 from public.story_facts f
                          where f.id = story_fact_links.fact_id and f.known_to_player and f.struck_at is null)));

-- ── 2. The canon by meaning ───────────────────────────────────────────────────
create table public.canon_embeddings (
  entry_id        uuid primary key references public.canon_entries (id) on delete cascade,
  embedding       extensions.vector(1536) not null,
  embedding_model text not null,
  source_hash     text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index canon_embeddings_vec_idx on public.canon_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

create trigger canon_embeddings_updated_at
  before update on public.canon_embeddings
  for each row execute procedure update_updated_at();

-- RLS enabled with zero policies: written by embed-content and read by edge functions, both through the service-role
-- client. Same deny-all as every other *_embeddings table; a policy would only widen access. Do not "fix" this by
-- adding one.
alter table public.canon_embeddings enable row level security;
grant select, insert, update, delete on public.canon_embeddings to service_role;

insert into private.demo_campaign_tables (table_name, tier, parent_column, parent_table, copy, reason) values
  ('canon_embeddings', 2, 'entry_id', 'canon_entries', true, null);

-- hnsw.iterative_scan is registered when pgvector's library loads; touching the type loads it (20261010133319).
select '[1]'::extensions.vector;

-- Nearest canon entries of one campaign, of the parts the caller asks for. Same shape as match_campaign_quests:
-- invoker, search_path pinned, service-role only, scope and same-model gates before ranking. The caller decides the
-- parts: the Narrator never asks for `secret`.
create function public.match_campaign_canon(
  query_embedding   extensions.vector(1536),
  p_campaign_id     uuid,
  p_embedding_model text,
  p_parts           text[],
  match_count       int
) returns table (
  id        uuid,
  part      text,
  knowledge text,
  title     text,
  distance  float
)
language sql
stable
set search_path = public, extensions
set "hnsw.iterative_scan" to 'strict_order'
as $$
  select c.id, c.part, c.knowledge, c.title, e.embedding <=> query_embedding as distance
    from public.canon_embeddings e
    join public.canon_entries c on c.id = e.entry_id
   where c.campaign_id = p_campaign_id
     and c.part = any (p_parts)
     and e.embedding_model = p_embedding_model
   order by e.embedding <=> query_embedding
   limit match_count;
$$;

revoke execute on function public.match_campaign_canon(extensions.vector, uuid, text, text[], int) from public, anon, authenticated;
grant execute on function public.match_campaign_canon(extensions.vector, uuid, text, text[], int) to service_role;
