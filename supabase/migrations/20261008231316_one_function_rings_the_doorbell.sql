-- One function rings the doorbell (#1033, #999).
--
-- Six trigger functions each wrote campaign_sync themselves, each with its own
-- copy of the same five rules: stay quiet while a campaign is copied, skip a
-- campaign that is being deleted, upsert one row per campaign, lock those rows
-- in key order, and name the signal. They differed only in how they find the
-- campaigns a change belongs to. The writing now lives in
-- private.ring_campaigns() alone, and the trigger functions only work out which
-- campaigns to ring.
--
-- The reason is transport, not tidiness. Realtime's postgres_changes poller is
-- about 91% of production database time (#999 re-baseline, 46 h of
-- pg_stat_statements), and it is a fixed cost: the poll loop and decoding the
-- WAL, not the number of live tables. Ringing through broadcast from the
-- database instead (#999 row 4.2) would retire it, and with one ringing
-- function that is a change in one place. Keep it that way: a new route finds
-- its campaigns and calls ring_campaigns(); it never writes campaign_sync.

-- ── 1. The ring ─────────────────────────────────────────────────────────────

create function private.ring_campaigns(p_campaign_ids uuid[], p_signal text)
returns void
language plpgsql
security invoker
set search_path to ''
as $function$
begin
  -- A campaign being copied (the demo) has nobody listening yet, and the copy
  -- inserts row by row, so a statement-level doorbell would fire once per row
  -- (20261005104317).
  if current_setting('grimoire.copying_campaign', true) = 'on' then
    return;
  end if;
  insert into public.campaign_sync (campaign_id, changed_table, updated_at)
  select distinct r.id, p_signal, now()
    from unnest(p_campaign_ids) as r(id)
   where r.id is not null
     -- Skip the cascade from `delete from campaigns`: the parent row is already
     -- gone by the time its children cascade, so the insert would fail the FK,
     -- and nobody is listening to a campaign that no longer exists.
     and exists (select 1 from public.campaigns p where p.id = r.id)
   -- Lock the doorbell rows in a fixed order. A statement touching two
   -- campaigns takes a row lock per campaign, and two such statements running
   -- in opposite orders would deadlock; ordering by the key makes that
   -- impossible rather than unlikely.
   order by 1
  on conflict (campaign_id) do update
     set changed_table = excluded.changed_table,
         updated_at    = excluded.updated_at;
end;
$function$;

-- Invoker on purpose: only the definer trigger functions below call it, so it
-- already runs as their owner and needs no rights of its own.
revoke execute on function private.ring_campaigns(uuid[], text) from public, anon, authenticated;

-- ── 2. The routes: each finds its campaigns and rings ───────────────────────

-- Rows that carry campaign_id. The signal is the table name unless the trigger
-- names one: `npcs` rings `npcs_player` on insert and update so only player
-- projections refresh.
create or replace function public.signal_campaign_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform private.ring_campaigns(
    array(select c.campaign_id from changed c),
    coalesce(tg_argv[0], tg_table_name));
  return null;
end;
$function$;

-- Rows under a character: the campaign is wherever it sits now.
create or replace function public.signal_party_member_child_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform private.ring_campaigns(
    array(select pm.campaign_id from changed c join party_members pm on pm.id = c.party_member_id),
    coalesce(tg_argv[0], tg_table_name));
  return null;
end;
$function$;

-- Rows under a place.
create or replace function public.signal_location_child_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform private.ring_campaigns(
    array(select l.campaign_id from changed c join locations l on l.id = c.location_id),
    coalesce(tg_argv[0], tg_table_name));
  return null;
end;
$function$;

-- Rows under a quest.
create or replace function public.signal_quest_child_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform private.ring_campaigns(
    array(select q.campaign_id from changed c join quests q on q.id = c.quest_id),
    coalesce(tg_argv[0], tg_table_name));
  return null;
end;
$function$;

-- A character leaving a campaign: the UPDATE reaches only the campaign it
-- joined, so the one it left is rung here.
create or replace function public.signal_party_member_left_campaign()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform private.ring_campaigns(array[old.campaign_id], tg_table_name);
  return null;
end;
$function$;

-- Documents ring only when a player holds one before or after the statement:
-- a private draft's autosave rings nothing, while unsharing still rings the
-- campaign it left. Each branch names only the transition tables its event
-- has; PL/pgSQL resolves a relation when the statement first runs, so the
-- others are never looked up.
create or replace function public.signal_handout_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE' then
    perform private.ring_campaigns(
      array(select n.campaign_id from new_rows n where n.player_visible_to <> '{}'::uuid[]
            union
            select o.campaign_id from old_rows o where o.player_visible_to <> '{}'::uuid[]),
      'scriptorium_documents');
  elsif tg_op = 'INSERT' then
    perform private.ring_campaigns(
      array(select n.campaign_id from new_rows n where n.player_visible_to <> '{}'::uuid[]),
      'scriptorium_documents');
  else
    perform private.ring_campaigns(
      array(select o.campaign_id from old_rows o where o.player_visible_to <> '{}'::uuid[]),
      'scriptorium_documents');
  end if;
  return null;
end;
$function$;
