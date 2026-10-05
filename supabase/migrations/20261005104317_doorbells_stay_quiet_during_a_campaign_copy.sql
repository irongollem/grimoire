-- The demo copy runs as one logged-in request and must finish inside the
-- authenticated role's 8-second statement timeout (see 20260927084747,
-- demo_copy_within_timeout). After the 5 Oct 2026 release, "Publish demo
-- version" was cancelled twice: the copy took 10 to 15 seconds, against 5 to 6
-- the week before, and "Load the demo campaign" runs the same copy for every
-- new user.
--
-- Measured in production, the player doorbells added that day
-- (20261005015440: locations, quests, quest_beats, quest_objectives) cost about
-- 2.2 seconds of it. They are statement-level triggers, but copy_demo_template
-- inserts one row per statement, so each fired once per copied row.
--
-- A campaign that is still being copied has nobody listening, so every doorbell
-- returns early while `grimoire.copying_campaign` is on, the convention the
-- quest-thread and quest-ref triggers already follow (20260925002215). The bodies
-- are otherwise the current ones, checked identical in production.

CREATE OR REPLACE FUNCTION public.signal_campaign_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- A campaign being copied (the demo) has nobody listening yet, and the copy
  -- inserts row by row, so a statement-level doorbell fires once per row.
  if current_setting('grimoire.copying_campaign', true) = 'on' then
    return null;
  end if;
  insert into campaign_sync (campaign_id, changed_table, updated_at)
  -- The signal is the table name unless the trigger names one: `npcs` rings
  -- `npcs_player` on insert and update so only player projections refresh.
  select distinct c.campaign_id, coalesce(tg_argv[0], tg_table_name), now()
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
$function$
;

CREATE OR REPLACE FUNCTION public.signal_handout_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- A campaign being copied (the demo) has nobody listening yet, and the copy
  -- inserts row by row, so a statement-level doorbell fires once per row.
  if current_setting('grimoire.copying_campaign', true) = 'on' then
    return null;
  end if;
  -- Same doorbell as signal_campaign_change, filtered to documents a player
  -- holds before or after the statement: a private draft's autosave rings
  -- nothing, while unsharing still rings the campaign it left. Each branch
  -- names only the transition tables its event has; PL/pgSQL resolves a
  -- relation when the statement first runs, so the others are never looked up.
  if tg_op = 'UPDATE' then
    insert into campaign_sync (campaign_id, changed_table, updated_at)
    select distinct s.campaign_id, 'scriptorium_documents', now()
      from (select n.campaign_id from new_rows n where n.player_visible_to <> '{}'::uuid[]
            union
            select o.campaign_id from old_rows o where o.player_visible_to <> '{}'::uuid[]) s
     where s.campaign_id is not null
       and exists (select 1 from campaigns p where p.id = s.campaign_id)
     order by 1
    on conflict (campaign_id) do update
       set changed_table = excluded.changed_table, updated_at = excluded.updated_at;
  elsif tg_op = 'INSERT' then
    insert into campaign_sync (campaign_id, changed_table, updated_at)
    select distinct n.campaign_id, 'scriptorium_documents', now()
      from new_rows n
     where n.player_visible_to <> '{}'::uuid[] and n.campaign_id is not null
       and exists (select 1 from campaigns p where p.id = n.campaign_id)
     order by 1
    on conflict (campaign_id) do update
       set changed_table = excluded.changed_table, updated_at = excluded.updated_at;
  else
    -- A shared document deleted with its campaign cascades after the campaign
    -- row is gone; the exists() skips it, as signal_campaign_change does.
    insert into campaign_sync (campaign_id, changed_table, updated_at)
    select distinct o.campaign_id, 'scriptorium_documents', now()
      from old_rows o
     where o.player_visible_to <> '{}'::uuid[] and o.campaign_id is not null
       and exists (select 1 from campaigns p where p.id = o.campaign_id)
     order by 1
    on conflict (campaign_id) do update
       set changed_table = excluded.changed_table, updated_at = excluded.updated_at;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.signal_quest_child_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- A campaign being copied (the demo) has nobody listening yet, and the copy
  -- inserts row by row, so a statement-level doorbell fires once per row.
  if current_setting('grimoire.copying_campaign', true) = 'on' then
    return null;
  end if;
  insert into campaign_sync (campaign_id, changed_table, updated_at)
  select distinct q.campaign_id, coalesce(tg_argv[0], tg_table_name), now()
    from changed c
    join quests q on q.id = c.quest_id
   where q.campaign_id is not null
     -- Skip the cascade from deleting a campaign (see signal_campaign_change).
     and exists (select 1 from campaigns p where p.id = q.campaign_id)
   order by 1
  on conflict (campaign_id) do update
     set changed_table = excluded.changed_table,
         updated_at    = excluded.updated_at;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.signal_ruleset_review_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- A campaign being copied (the demo) has nobody listening yet, and the copy
  -- inserts row by row, so a statement-level doorbell fires once per row.
  if current_setting('grimoire.copying_campaign', true) = 'on' then
    return null;
  end if;
  insert into campaign_sync (campaign_id, changed_table, updated_at)
  select distinct pm.campaign_id, 'ruleset_reviews', now()
    from changed c
    join party_members pm on pm.id = c.party_member_id
   where pm.campaign_id is not null
     and exists (select 1 from campaigns p where p.id = pm.campaign_id)
   order by 1
  on conflict (campaign_id) do update
     set changed_table = excluded.changed_table,
         updated_at    = excluded.updated_at;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.signal_store_item_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- A campaign being copied (the demo) has nobody listening yet, and the copy
  -- inserts row by row, so a statement-level doorbell fires once per row.
  if current_setting('grimoire.copying_campaign', true) = 'on' then
    return null;
  end if;
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
$function$
;

