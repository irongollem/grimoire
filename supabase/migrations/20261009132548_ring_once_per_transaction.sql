-- A campaign's doorbell is queued once per transaction, per signal.
--
-- 20261008234009 made a ring a plain insert into private.campaign_sync_pending,
-- drained at commit by a deferred per-row constraint trigger. Every statement
-- that rang queued its pairs again, so a definer path writing row by row in one
-- transaction (apply_level_up writing each character_spells row, an import)
-- queued N identical pairs, and commit then ran N trigger firings and N
-- index-scanned DELETEs, N−1 of which found nothing, on some seventy tables
-- that ring on every write.
--
-- A pair already queued by this transaction is now skipped. Only this
-- transaction's own rows are visible to the check (another transaction's queue
-- is uncommitted), and the first ring of each pair is the one kept, so the
-- order the flush writes signals in (by the first ring) is unchanged.

-- The probe below looks a pair up by (txid, campaign_id, changed_table); on
-- the txid index alone each ring would rescan all of this transaction's
-- queue. txid leads, so the flush's `where txid = ...` uses the same index.
drop index private.campaign_sync_pending_txid_idx;
create index campaign_sync_pending_pair_idx
  on private.campaign_sync_pending (txid, campaign_id, changed_table);

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
   where r.id is not null
     and not exists (
       select 1
         from private.campaign_sync_pending q
        where q.txid = pg_current_xact_id()
          and q.campaign_id = r.id
          and q.changed_table = p_signal
     );
end;
$function$;
