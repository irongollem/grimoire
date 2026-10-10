-- A ring no longer names the tab that caused it (#999 4.2 review).
--
-- 20261009233206 recorded the requesting tab from an `x-grimoire-tab` header so
-- a tab could skip its own rings. supabase-js sends global headers to Edge
-- Functions as well, whose CORS refused it, and skipping a tab's own ring also
-- lost a write's side effects (a craft that fills the party inventory) for the
-- writer. Every tab now refreshes on every ring, its own included, as it did
-- under postgres_changes, so the payload is `{ table }` and the origin goes.

-- ring_campaigns as it was in 20261009132548, before the header was read.
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

-- The commit-time send, without the origin.
create or replace function private.send_campaign_rings()
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
     -- A campaign deleted later in the same transaction has nobody listening.
     where exists (select 1 from public.campaigns p where p.id = d.campaign_id)
     group by d.campaign_id, d.changed_table
     -- Within one campaign, each distinct signal is sent in the order it first
     -- rang: every one is a separate change, and a client refreshes what each names.
     order by d.campaign_id, first_rung
  loop
    -- realtime.send swallows its own errors as a warning, so a ring can never
    -- fail the write that rang it.
    perform realtime.send(
      jsonb_build_object('table', ring.changed_table),
      'ring',
      'doorbell:' || ring.campaign_id,
      true);
  end loop;
  return null;
end;
$function$;

alter table private.campaign_sync_pending drop column if exists origin;
