-- Migration: unembedded_content_counts
-- One DM-gated RPC answering "what in this campaign has no vector yet", per
-- entity kind -- backs the transfer-ownership embedding offer (#841).

-- `transfer_campaign_ownership` (20260731000001) and its quest-referenced-
-- entity followers (20260814065321 for items/NPCs, 20260814003041 for
-- monsters) clone referenced rows into the new owner's account rather than
-- repointing them, because the old owner keeps their own copy. Each clone is
-- a brand-new row with a brand-new id, so it has no matching row in its
-- embedding side table -- embed-on-write is a client-side hook
-- (queueItemEmbedding / queueNpcEmbedding / queueMonsterEmbedding, fired from
-- mutation hooks in src/composables/**/use*.ts) that a SECURITY DEFINER SQL
-- function cannot reach. The content is invisible to every retrieval-backed
-- generator, with no error anywhere, until an admin happens to run the
-- backfill.
--
-- The decided fix (#841) is NOT to re-embed automatically: a handed-over
-- campaign is not settled content, and embedding every clone at transfer
-- time spends the new DM's retrieval corpus on rows they have not yet looked
-- at, pruned or merged. Instead this offers it -- "N items and M NPCs are
-- not indexed for AI search yet, index them?" -- and lets the new DM decide.
--
-- Deliberately defined as "everything in this campaign with no vector", not
-- "rows the last transfer cloned": the transfer RPC does not need to know or
-- record anything for this to work, and any other path that ever leaves a row
-- unembedded (a failed embed-on-write call, a future import path) is picked
-- up by the same query. Self-healing beats bookkeeping.
--
-- Six kinds, six embedding side tables (20260803000001 monsters,
-- 20260803000004 npcs/factions/locations, 20260804000001 notes,
-- 20260805000005 items), each primary-keyed on <kind>_id referencing the
-- entity's own id.
--
-- Returns one row per kind, carrying the missing ids alongside the count,
-- rather than a bare count or a single jsonb blob: the caller
-- (useUnembeddedContent.ts) needs both a per-kind breakdown for the
-- settings-card copy AND the actual ids to drive indexAll()'s per-row
-- embed loop. All six embedding tables carry RLS enabled with zero policies
-- (intentional -- see 20260803000004/20260804000001/20260805000005), so the
-- client cannot itself anti-join entities against embeddings to discover
-- which ones are missing; this RPC is the only place that can see that. A
-- handful of uuids per kind is a few KB even for a large campaign, so nothing
-- here is paginated.

create function public.get_unembedded_content_counts(p_campaign_id uuid)
returns table (kind text, missing integer, ids uuid[])
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  -- Authorize first, per CLAUDE.md. coalesce is not optional: an
  -- un-coalesced boolean helper returning NULL for "not a member" is this
  -- repo's most expensive recurring bug (private.is_app_admin() did exactly
  -- this and every negated `if not ...` guard fell straight through). This
  -- also makes "not a DM here" and "campaign doesn't exist" answer
  -- identically, leaking neither.
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

  order by 1;
end;
$$;

revoke execute on function public.get_unembedded_content_counts(uuid) from public, anon;
grant execute on function public.get_unembedded_content_counts(uuid) to authenticated, service_role;
