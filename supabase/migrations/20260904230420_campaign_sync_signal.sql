-- Migration: campaign_sync_signal
-- One row per campaign saying "table X just changed, refetch it" — the transport
-- for the two kinds of change the live-sync channel cannot carry itself (#811).
--
-- ── Why this exists ──────────────────────────────────────────────────────────
--
-- `useCampaignLiveSync` subscribes every table with `filter: campaign_id=eq.<id>`.
-- Realtime evaluates that filter against the event's record, and for a DELETE the
-- record is the *old* row — which, on a table with RLS enabled, contains only the
-- primary key. Postgres cannot prove a subscriber was allowed to see a row that no
-- longer exists, so Supabase never sends the rest of it, and `replica identity full`
-- does not change that (it is documented, and the two tables already set to FULL
-- here gain nothing from it). No `campaign_id` in the payload means the filter can
-- never match, which means **no DELETE on any of these tables has ever reached a
-- live session**. Measured, not inferred: an unfiltered subscription receives the
-- same delete that the filtered one silently drops. A player removing an item from
-- the party inventory left every other client showing it until a page refresh.
--
-- The second gap is `store_items`, which has no `campaign_id` at all — only
-- `location_id` — so it could not join the campaign-filtered channel for *any*
-- event, and was left out of the registry entirely. A shop stocked mid-session
-- therefore needed a remount to appear.
--
-- Both are the same shape of problem: a change the client must know about, that
-- cannot be described by a filter on the changed row. So the trigger writes the
-- fact of the change to a row that *can* be filtered. An UPDATE carries its full
-- new record, so `campaign_id=eq.<id>` matches, and the client refetches the one
-- query key named by `changed_table`. Deliberately a signal and not a copy of the
-- row: the client already knows how to fetch its own data correctly (RLS, embeds,
-- projections), and telling it to do that again is both smaller and impossible to
-- get subtly wrong.
--
-- One row per campaign, upserted in place — this is a doorbell, not a log. There
-- is nothing to prune, and no second copy of anything to drift.

create table if not exists campaign_sync (
  campaign_id   uuid primary key references campaigns(id) on delete cascade,
  -- The table whose rows changed, exactly as it is named in `SYNC_TABLES`
  -- (src/composables/campaign/useCampaignLiveSync.ts). The client maps it to a
  -- query key; a name it does not recognise is ignored rather than guessed at.
  changed_table text not null,
  updated_at    timestamptz not null default now()
);

create trigger campaign_sync_updated_at
  before update on campaign_sync
  for each row execute procedure update_updated_at();

alter table campaign_sync enable row level security;

-- Read-only to the table, and only for that campaign's own members (the DM has a
-- campaign_members row too, so this covers them). There are deliberately no
-- insert/update/delete policies: every write comes from the SECURITY DEFINER
-- triggers below, and a client that could forge a signal could force every other
-- client at the table into a refetch loop.
create policy campaign_sync_member_select on campaign_sync
  for select using (private.is_campaign_member(campaign_id));

comment on table campaign_sync is
  'One row per campaign: a doorbell for changes the live-sync channel cannot deliver — every DELETE (whose payload is primary-key-only under RLS, so the campaign_id filter cannot match it) and every store_items write (that table has no campaign_id). The client refetches the query key named by changed_table.';

-- ── The signal ───────────────────────────────────────────────────────────────
-- Statement-level with a transition table, not per row: deleting a campaign's
-- notes in one statement should ring the doorbell once, not once per note. That
-- also means a transition table per trigger, since Postgres allows one event per
-- trigger that uses them — hence three separate triggers for store_items below.

create or replace function public.signal_campaign_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into campaign_sync (campaign_id, changed_table, updated_at)
  select distinct c.campaign_id, tg_table_name, now()
    from changed c
   where c.campaign_id is not null
     -- Skip the cascade from `delete from campaigns`: the parent row is already
     -- gone by the time its children cascade, so the insert would fail the FK —
     -- and nobody is listening to a campaign that no longer exists.
     and exists (select 1 from campaigns p where p.id = c.campaign_id)
   -- Lock the doorbell rows in a fixed order. A statement deleting across two
   -- campaigns takes a row lock per campaign, and two such statements running
   -- in opposite orders would deadlock; ordering by the key makes that
   -- impossible rather than unlikely.
   order by 1
  on conflict (campaign_id) do update
     set changed_table = excluded.changed_table,
         updated_at    = excluded.updated_at;
  return null;
end;
$$;

-- store_items reaches its campaign through the location it sits in. Same doorbell,
-- different derivation — and unlike the others this fires on insert and update too,
-- because the table is on no channel at all: stocking a shop, hiding a ware and
-- repricing one are all invisible to players without it.
create or replace function public.signal_store_item_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into campaign_sync (campaign_id, changed_table, updated_at)
  select distinct l.campaign_id, 'store_items', now()
    from changed c
    join locations l on l.id = c.location_id
   where l.campaign_id is not null
     and exists (select 1 from campaigns p where p.id = l.campaign_id)
   order by 1
  on conflict (campaign_id) do update
     set changed_table = excluded.changed_table,
         updated_at    = excluded.updated_at;
  return null;
end;
$$;

-- Trigger functions are called by the trigger system, which does not check
-- EXECUTE — so keep both off the PostgREST RPC surface entirely.
revoke execute on function public.signal_campaign_change()   from public, anon, authenticated;
revoke execute on function public.signal_store_item_change() from public, anon, authenticated;

-- ── Attach ───────────────────────────────────────────────────────────────────
-- Every table in SYNC_TABLES that carries a campaign_id. Kept in step with the
-- client registry by src/composables/campaign/campaignSyncTables.test.ts, which
-- fails if a table is added to one list and not the other.
--
-- Ten of these have a *nullable* campaign_id (general-scope rows that belong to a
-- user rather than a campaign — a vault item, a world-level location). Deleting
-- one of those signals nothing, because there is no campaign to signal: the guard
-- above skips it rather than ringing every campaign's doorbell.

do $$
declare
  t text;
begin
  foreach t in array array[
    'notes', 'quests', 'locations', 'factions', 'npcs', 'companions',
    'discovered_monsters', 'pantheons', 'deities', 'puzzle_rooms',
    'calendar_events', 'player_journal_entries', 'session_proposals',
    'session_availability', 'items', 'quest_beat_loot', 'campaign_messages',
    'npc_inventory', 'campaign_members', 'ruleset_reviews', 'campaign_rules',
    'downtime_grants', 'downtime_draws', 'downtime_outcomes',
    'downtime_deck_backs', 'minis', 'class_option_texts', 'item_entries',
    'party_inventory'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_signal_delete', t);
    execute format(
      'create trigger %I after delete on public.%I '
      'referencing old table as changed '
      'for each statement execute procedure public.signal_campaign_change()',
      t || '_signal_delete', t);
  end loop;
end;
$$;

drop trigger if exists store_items_signal_insert on store_items;
create trigger store_items_signal_insert
  after insert on store_items
  referencing new table as changed
  for each statement execute procedure public.signal_store_item_change();

drop trigger if exists store_items_signal_update on store_items;
create trigger store_items_signal_update
  after update on store_items
  referencing new table as changed
  for each statement execute procedure public.signal_store_item_change();

-- On delete the row is gone, so the location comes from the old row.
drop trigger if exists store_items_signal_delete on store_items;
create trigger store_items_signal_delete
  after delete on store_items
  referencing old table as changed
  for each statement execute procedure public.signal_store_item_change();

-- ── Publish ──────────────────────────────────────────────────────────────────
-- Without this the doorbell rings into an empty room (see 20260728000003).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'campaign_sync'
  ) then
    alter publication supabase_realtime add table public.campaign_sync;
  end if;
end;
$$;
