-- The doorbell rings at commit, and an update rings the campaign a row left
-- (#1033 review).
--
-- ── Why at commit ───────────────────────────────────────────────────────────
--
-- A ring upserts the campaign's one campaign_sync row, and that row lock is
-- held to the end of the transaction. Ringing mid-transaction made it a hidden
-- second lock beside whatever the transaction locks next, so two transactions
-- touching one campaign could take them in opposite orders:
--
--   A: level-up writes character_classes (rings: locks campaign_sync C),
--      then updates the character row P            -> waits on B for P
--   B: a cast updates the character row P,
--      then writes character_spells (rings)        -> waits on A for C
--
-- and Postgres kills one, failing a player's write mid-session. Reproduced on
-- the local stack in review. Once #1033 made some seventy tables ring on every
-- write, the shape stopped being rare.
--
-- So a ring no longer touches campaign_sync. private.ring_campaigns queues
-- (campaign, signal) pairs in private.campaign_sync_pending, a plain insert
-- with no unique key and so no lock to wait on, and a deferred constraint
-- trigger drains this transaction's queue at commit, upserting campaign_sync
-- in key order. By then the transaction holds every lock it will ever take, so
-- the doorbell cannot close a cycle; concurrent commits lock doorbell rows in
-- one global order. Clients see nothing different: the rows changed in the
-- same transaction as before, and Realtime delivers after commit either way.
-- private.flush_campaign_sync is now the only writer of campaign_sync, and the
-- one place a transport swap (#999 row 4.2) would change.
--
-- A test that reads campaign_sync inside its own transaction runs
-- `set constraints all immediate` first, which drains the queue at the end of
-- each statement instead.
--
-- ── Why an update rings the campaign a row left ─────────────────────────────
--
-- Update triggers saw only the new rows, so a row moved to another campaign
-- (or to none, the general scope), or a child moved under another parent, rang
-- only where it landed; the campaign it left kept showing it. Update triggers
-- now also read the old rows. party_members keeps its own row-level leave
-- trigger, because it rings only on delete and on leaving, never on the hit
-- point changes that make up most of its updates.

-- ── 1. The queue ────────────────────────────────────────────────────────────

-- Rows never outlive their transaction: each is inserted and deleted inside
-- one, and never updated. That is why this table has no updated_at column or
-- trigger, the one exception to the rule in CLAUDE.md, and why it needs no
-- RLS: nothing but the two functions below reads or writes it, and `private`
-- is not published.
create table private.campaign_sync_pending (
  id            bigint generated always as identity primary key,
  txid          xid8 not null default pg_current_xact_id(),
  campaign_id   uuid not null,
  changed_table text not null
);

create index campaign_sync_pending_txid_idx on private.campaign_sync_pending (txid);

revoke all on private.campaign_sync_pending from public, anon, authenticated;

-- ── 2. Ring: queue the pairs ────────────────────────────────────────────────

create or replace function private.ring_campaigns(p_campaign_ids uuid[], p_signal text)
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
  insert into private.campaign_sync_pending (campaign_id, changed_table)
  select distinct r.id, p_signal
    from unnest(p_campaign_ids) as r(id)
   where r.id is not null;
end;
$function$;

-- ── 3. Flush: write the doorbell at commit ──────────────────────────────────

create function private.flush_campaign_sync()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ring record;
begin
  -- Fires once per queued row, at commit. The first firing drains the whole
  -- transaction's queue, so the rest find it empty.
  for ring in
    with drained as (
      delete from private.campaign_sync_pending
       where txid = pg_current_xact_id()
      returning id, campaign_id, changed_table
    )
    select d.campaign_id, d.changed_table, min(d.id) as first_rung
      from drained d
     -- A campaign deleted later in the same transaction has nobody listening,
     -- and its doorbell row would fail the foreign key.
     where exists (select 1 from public.campaigns p where p.id = d.campaign_id)
     group by d.campaign_id, d.changed_table
     -- Doorbell rows are locked in key order, so concurrent commits cannot
     -- deadlock on them. Within one campaign, each distinct signal is written
     -- in the order it first rang: every one is a separate change event, and a
     -- client refreshes what each names.
     order by d.campaign_id, first_rung
  loop
    insert into public.campaign_sync (campaign_id, changed_table, updated_at)
    values (ring.campaign_id, ring.changed_table, now())
    on conflict (campaign_id) do update
       set changed_table = excluded.changed_table,
           updated_at    = excluded.updated_at;
  end loop;
  return null;
end;
$function$;

-- A trigger function never needs EXECUTE; keep it off the RPC surface.
revoke execute on function private.flush_campaign_sync() from public, anon, authenticated;

create constraint trigger campaign_sync_pending_flush
  after insert on private.campaign_sync_pending
  deferrable initially deferred
  for each row execute procedure private.flush_campaign_sync();

-- ── 4. Update triggers read the old rows too ────────────────────────────────

create or replace function public.signal_campaign_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Each branch names only the transition tables its event has; PL/pgSQL
  -- resolves a relation when the statement first runs.
  if tg_op = 'UPDATE' then
    perform private.ring_campaigns(
      array(select c.campaign_id from changed c union select l.campaign_id from left_rows l),
      coalesce(tg_argv[0], tg_table_name));
  else
    perform private.ring_campaigns(
      array(select c.campaign_id from changed c),
      coalesce(tg_argv[0], tg_table_name));
  end if;
  return null;
end;
$function$;

create or replace function public.signal_parent_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_campaigns uuid[];
begin
  if tg_op = 'UPDATE' then
    execute format(
      'select array(select p.campaign_id
                      from (select c.%2$I as parent_id from changed c
                            union select l.%2$I from left_rows l) moved
                      join public.%1$I p on p.id = moved.parent_id)',
      tg_argv[0], tg_argv[1])
      into v_campaigns;
  else
    execute format(
      'select array(select p.campaign_id from changed c join public.%1$I p on p.id = c.%2$I)',
      tg_argv[0], tg_argv[1])
      into v_campaigns;
  end if;
  perform private.ring_campaigns(v_campaigns, coalesce(tg_argv[2], tg_table_name));
  return null;
end;
$function$;

-- Every update trigger on the two routes, recreated from its own definition
-- with the old rows added, so names and arguments carry over exactly.
do $$
declare
  trg record;
  definition text;
begin
  for trg in
    select g.oid, g.tgname, g.tgrelid::regclass as tbl
      from pg_trigger g
     where not g.tgisinternal
       and (g.tgtype & 16) <> 0
       and g.tgfoid in ('public.signal_campaign_change()'::regprocedure,
                        'public.signal_parent_change()'::regprocedure)
  loop
    definition := pg_get_triggerdef(trg.oid);
    if position('REFERENCING NEW TABLE AS changed' in definition) = 0 then
      raise exception 'Unexpected definition for trigger %: %', trg.tgname, definition;
    end if;
    execute format('drop trigger %I on %s', trg.tgname, trg.tbl);
    execute replace(definition, 'REFERENCING NEW TABLE AS changed',
                    'REFERENCING OLD TABLE AS left_rows NEW TABLE AS changed');
  end loop;
end;
$$;
