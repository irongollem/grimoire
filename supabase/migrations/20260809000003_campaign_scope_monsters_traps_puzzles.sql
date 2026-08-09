-- Migration: campaign_scope_monsters_traps_puzzles
-- Give `monsters` and `traps` the nullable `campaign_id` the other DM-owned
-- tables already have, and bring all three homebrew kinds under the explicit
-- campaign-deletion disposition (#597).

-- WHY. Nine DM-owned tables carry a campaign_id; monsters and traps did not,
-- so a DM running several campaigns saw one undivided bestiary and trap list
-- with no per-row choice available even in principle. (puzzle_rooms already
-- had the column -- what it lacked was any code that read it, plus the FK
-- semantics below.)
--
-- The original reason for the shared-across-campaigns design is gone: it
-- predates library_monsters, when every user held their own copy of the Open5e
-- import and one undivided list was the lesser evil. Shared content now lives
-- in library_* and is gated per campaign by enabled sources.

-- ── NO BACKFILL. Read this before "tidying up" the null rows ────────────────
-- Existing rows stay null, and null keeps meaning "available in every
-- campaign" -- the same semantics items/species/locations already use.
--
-- A monster written two campaigns ago belongs to whichever campaign the DM had
-- in mind at the time, and that is unrecoverable from the data: there is no
-- authored-in-campaign timestamp, and encounter references only prove where a
-- creature was USED, not where it belongs. So any backfill is a guess, and a
-- wrong guess is worse than null: null shows the monster everywhere (visible,
-- fixable), while a wrong campaign_id hides it from the campaign the DM
-- actually wrote it for, with no message anywhere saying so.
--
-- The DM re-scopes deliberately, per row, via the Scope control in the editor.
-- Do NOT add an UPDATE here later. See also #596, which flips the *default* for
-- new rows across the nine existing tables and reaches the same conclusion
-- about the backlog.

alter table public.monsters add column campaign_id uuid references public.campaigns(id);
alter table public.traps    add column campaign_id uuid references public.campaigns(id);

comment on column public.monsters.campaign_id is
  'NULL = available in every campaign; set = visible only when that campaign is active. Never backfilled -- see 20260809000003.';
comment on column public.traps.campaign_id is
  'NULL = available in every campaign; set = visible only when that campaign is active. Never backfilled -- see 20260809000003.';

-- Both columns are filtered on by the list composables and joined by
-- match_custom_monsters, and an unindexed FK also makes every campaign DELETE
-- scan the table to check the constraint.
create index if not exists monsters_campaign_id_idx on public.monsters (campaign_id);
create index if not exists traps_campaign_id_idx    on public.traps    (campaign_id);

-- ── FK: NO ACTION on all three, deliberately ───────────────────────────────
-- The two FK defaults are both wrong for authored homebrew whose null is
-- meaningful, exactly as #585 found for custom_classes/custom_subclasses/
-- class_features (see 20260730000011 and lib/campaignHomebrewDisposition.ts):
--   - ON DELETE CASCADE destroys a monster the DM spent an evening writing,
--     as a side effect of deleting the campaign it happened to be scoped to.
--   - ON DELETE SET NULL silently promotes campaign-exclusive material to
--     universal -- the opposite of what the DM asked for, and invisible.
-- So the app asks, and NO ACTION is the guarantee that it asked: any delete
-- path that skips the disposition fails loudly on the constraint instead of
-- quietly picking one of the two wrong answers.
--
-- puzzle_rooms is repointed from its inherited ON DELETE SET NULL to match.
-- Its old behaviour is the silent-promotion case above; it was never a
-- decision, just the default the column was born with in the squashed schema.
alter table public.puzzle_rooms drop constraint puzzle_rooms_campaign_id_fkey;
alter table public.puzzle_rooms add constraint puzzle_rooms_campaign_id_fkey
  foreign key (campaign_id) references public.campaigns(id);

-- ── Campaign deletion: three more tables under the same disposition ────────
-- Unchanged from 20260730000011 except for the three tables added to each
-- branch. Same authorization (re-derived from auth.uid(), never a
-- caller-supplied id) and the same one-transaction guarantee: disposition and
-- delete either both commit or neither does.
create or replace function public.delete_campaign_with_homebrew(
  p_campaign_id uuid,
  p_disposition text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_disposition not in ('promote', 'delete') then
    raise exception 'Invalid disposition: %, expected ''promote'' or ''delete''', p_disposition;
  end if;

  -- Mirrors "Users manage own campaigns", the only RLS policy that governs
  -- DELETE on public.campaigns (campaigns_member_select is SELECT-only and
  -- does not apply): only the campaign's owner may delete it. This function
  -- is SECURITY DEFINER and bypasses RLS entirely, so that check must be
  -- restated here explicitly, re-derived from auth.uid() -- never trusting
  -- a caller-supplied id.
  select user_id into v_owner
  from public.campaigns
  where id = p_campaign_id;

  if v_owner is null then
    raise exception 'Campaign not found';
  end if;

  if v_owner <> v_uid then
    raise exception 'Not authorized to delete this campaign';
  end if;

  -- `campaign_id = p_campaign_id` is false (not true) for NULL rows, so
  -- universal homebrew and every other campaign's rows are never touched.
  if p_disposition = 'promote' then
    update public.custom_classes    set campaign_id = null where campaign_id = p_campaign_id;
    update public.custom_subclasses set campaign_id = null where campaign_id = p_campaign_id;
    update public.class_features    set campaign_id = null where campaign_id = p_campaign_id;
    update public.monsters          set campaign_id = null where campaign_id = p_campaign_id;
    update public.traps             set campaign_id = null where campaign_id = p_campaign_id;
    update public.puzzle_rooms      set campaign_id = null where campaign_id = p_campaign_id;
  else
    delete from public.custom_classes    where campaign_id = p_campaign_id;
    delete from public.custom_subclasses where campaign_id = p_campaign_id;
    delete from public.class_features    where campaign_id = p_campaign_id;
    delete from public.monsters          where campaign_id = p_campaign_id;
    delete from public.traps             where campaign_id = p_campaign_id;
    delete from public.puzzle_rooms      where campaign_id = p_campaign_id;
  end if;

  delete from public.campaigns where id = p_campaign_id;
end;
$$;

-- ── Retrieval: the encounter suggester stops offering other campaigns' work ─
-- match_custom_monsters filtered on owner alone, so once a DM scopes their
-- homebrew the suggester would still surface another campaign's creatures --
-- a subtle failure, since the suggestions look perfectly good.
--
-- The predicate is match_custom_items' (20260805000005), verbatim in shape:
-- campaign rows plus the campaign OWNER's global (null-campaign) rows.
-- p_owner_id is campaigns.user_id, passed by the edge function -- never a
-- caller-supplied id.
--
-- The argument list changes, so this is a drop-and-create rather than a
-- `create or replace`. Body is otherwise unchanged from 20260803000003's
-- dedupe-by-conceptual-key version.
--
-- `extensions.vector` and `search_path = public, extensions` are both
-- load-bearing: pgvector no longer lives in public (20260805000006), and
-- `= public` alone cannot resolve `<=>`. The failure is silent -- every
-- generator degrades to an ungrounded prompt and logs nothing a user sees.
drop function if exists public.match_custom_monsters(extensions.vector, uuid, text, text, integer);

create function public.match_custom_monsters(
  query_embedding   extensions.vector(1536),
  p_campaign_id     uuid,
  p_owner_id        uuid,
  p_ruleset         text,
  p_embedding_model text,
  match_count       int
) returns table (
  id               uuid,
  name             text,
  monster_type     text,
  challenge_rating text,
  distance         float
)
language sql stable
set search_path = public, extensions
as $$
  select s.id, s.name, s.monster_type, s.challenge_rating, s.distance
  from (
    -- conceptual_key is null on every custom monster, so this degrades to
    -- lower(name) -- which matches what generate-encounter's merge already
    -- does, and keeps two deliberately same-named homebrew variants from both
    -- occupying candidate slots.
    select distinct on (coalesce(k.conceptual_key, lower(k.name)))
           k.id, k.name, k.monster_type, k.challenge_rating, k.distance
    from (
      select
        m.id,
        m.name,
        m.monster_type,
        m.stat_block->>'challenge_rating' as challenge_rating,
        m.conceptual_key,
        e.embedding <=> query_embedding as distance
      from monster_embeddings e
      join monsters m on m.id = e.monster_id
      where (m.campaign_id = p_campaign_id or (m.campaign_id is null and m.user_id = p_owner_id))
        and coalesce(m.open5e_import, false) = false
        -- ruleset may be null on custom monsters that predate the column.
        and (m.ruleset is null or m.ruleset = p_ruleset)
        -- Same-model gate: never compare vectors across models.
        and e.embedding_model = p_embedding_model
      order by e.embedding <=> query_embedding
      limit greatest(match_count * 5, match_count)
    ) k
    order by coalesce(k.conceptual_key, lower(k.name)), k.distance
  ) s
  order by s.distance
  limit match_count;
$$;

revoke execute on function public.match_custom_monsters(extensions.vector, uuid, uuid, text, text, int) from public, anon, authenticated;
grant  execute on function public.match_custom_monsters(extensions.vector, uuid, uuid, text, text, int) to service_role;

-- ── Repair the player projection this column would otherwise break ─────────
-- `get_player_visible_monsters` is `returns setof monsters` with a positional
-- column list, so widening `monsters` invalidates it. PostgreSQL validates a
-- SQL function's row shape only when it EXECUTES, so nothing above would have
-- failed here -- it would have failed for every real player, at read time,
-- with `42P13 return type mismatch`. That is not hypothetical: it is exactly
-- how the "Unknown creature" outage happened (20260720000018 widened the table,
-- 20260724000005 repaired it four days later), which is why
-- supabase/tests/player_projections.test.sql now executes every setof-table
-- function in CI. It caught this one.
--
-- This MUST stay in the same migration as the `add column` above. Split across
-- two, every player read is broken in between.
--
-- Patch-by-replace rather than a rewrite, following 20260804000010: the body
-- carries a secrecy gate per column (stat_block nulled unless the discovery
-- revealed stats, notes/description/lair_location_id DM-only), and
-- transcribing 60 lines of that to append one column is how a gate gets
-- dropped by accident. The anchor is asserted, so a drifted body fails the
-- migration instead of silently not patching.
--
-- campaign_id is nulled, not passed through, for the same reason
-- lair_location_id is: it is DM-side library organisation with no player-facing
-- meaning. Passing it through would additionally hand a player the uuid of a
-- campaign they are not in, whenever a monster discovered here happens to be
-- scoped elsewhere.
do $recreate$
declare
  definition text;
  patched    text;
begin
  definition := pg_get_functiondef('public.get_player_visible_monsters(uuid)'::regprocedure);
  patched := replace(
    definition,
    E'    m.ai_provenance\n  from monsters m',
    E'    m.ai_provenance,\n    null::uuid                                                        -- campaign_id (DM-only scope)\n  from monsters m'
  );
  if patched = definition then raise exception 'Could not patch get_player_visible_monsters'; end if;
  execute patched;
end
$recreate$;

-- CREATE OR REPLACE preserves grants; restated for the same reason
-- 20260804000010 restates them -- the login-only boundary on a SECURITY
-- DEFINER function should be visible in every migration that recreates it.
revoke execute on function public.get_player_visible_monsters(uuid) from public, anon;
grant  execute on function public.get_player_visible_monsters(uuid) to authenticated, service_role;
