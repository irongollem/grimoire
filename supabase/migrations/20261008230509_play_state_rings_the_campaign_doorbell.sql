-- Play state rings the campaign doorbell (#1033, wave 1).
--
-- Grimoire runs live games, so what changes at the table must reach every open
-- screen without a reload. These eighteen tables change during play and were
-- on no live route at all: a reveal, a door opened, a favour owed, a tracker
-- ticked, an encounter or roll table edited mid-session stayed stale on every
-- other device.
--
-- Every one rings rather than subscribes, by the Live Data rule in CLAUDE.md:
--   * owner-only rows (encounters, loot and roll tables, dungeon maps and
--     features, placements, player NPC ratings): the other members read them
--     through projections or not at all, so a row event reaches nobody else;
--   * rows only some members may read (the three reveal tables, PC notes,
--     tracker state, pinned forms, faction membership: the DM
--     and one player), and DM-only rows (favours, consequence events,
--     location state events);
--   * rows with no campaign_id (location_state_events, location_placements
--     hang off a place; faction_party_members off a character).
-- None was ever kept out of supabase_realtime on purpose; none is published
-- here either. The doorbell carries a table name, never a row.

-- ── 1. One doorbell for every table that hangs off a place ──────────────────

-- store_items had a copy of this body that could only ring its own name
-- (20261005104317). It moves onto the shared function; the copy goes. Same
-- shape as signal_party_member_child_change: the campaign is wherever the
-- place sits, and nobody when it sits nowhere.
create function public.signal_location_child_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- A campaign being copied (the demo) has nobody listening yet, and the copy
  -- inserts row by row, so a statement-level doorbell fires once per row.
  if current_setting('grimoire.copying_campaign', true) = 'on' then
    return null;
  end if;
  insert into campaign_sync (campaign_id, changed_table, updated_at)
  select distinct l.campaign_id, coalesce(tg_argv[0], tg_table_name), now()
    from changed c
    join locations l on l.id = c.location_id
   where l.campaign_id is not null
     -- Skip the cascade from deleting a campaign (see signal_campaign_change).
     and exists (select 1 from campaigns p where p.id = l.campaign_id)
   -- Fixed lock order across campaigns (see signal_campaign_change).
   order by 1
  on conflict (campaign_id) do update
     set changed_table = excluded.changed_table,
         updated_at    = excluded.updated_at;
  return null;
end;
$function$;

-- A trigger function never needs EXECUTE; keep it off the RPC surface.
revoke execute on function public.signal_location_child_change() from public, anon, authenticated;

drop trigger store_items_signal_insert on public.store_items;
drop trigger store_items_signal_update on public.store_items;
drop trigger store_items_signal_delete on public.store_items;
drop function public.signal_store_item_change();

-- ── 2. The triggers ─────────────────────────────────────────────────────────

-- Three statement-level triggers per table, one per event, each naming the
-- transition table its event has.
do $$
declare
  route record;
begin
  for route in
    select * from (values
      ('store_items',                'signal_location_child_change'),
      ('location_state_events',      'signal_location_child_change'),
      ('location_placements',        'signal_location_child_change'),
      ('faction_party_members',      'signal_party_member_child_change'),
      ('handout_reveals',            'signal_campaign_change'),
      ('location_reveals',           'signal_campaign_change'),
      ('npc_reveals',                'signal_campaign_change'),
      ('npc_pc_notes',               'signal_campaign_change'),
      ('party_member_tracker_state', 'signal_campaign_change'),
      ('pinned_forms',               'signal_campaign_change'),
      ('npc_favors',                 'signal_campaign_change'),
      ('quest_consequence_events',   'signal_campaign_change'),
      ('campaign_join_requests',     'signal_campaign_change'),
      ('player_npc_ratings',         'signal_campaign_change'),
      ('encounters',                 'signal_campaign_change'),
      ('loot_tables',                'signal_campaign_change'),
      ('roll_tables',                'signal_campaign_change'),
      ('dungeon_maps',               'signal_campaign_change'),
      ('dungeon_features',           'signal_campaign_change')
    ) as r(tbl, fn)
  loop
    execute format(
      'create trigger %1$I after insert on public.%2$I referencing new table as changed '
      'for each statement execute procedure public.%3$I()',
      route.tbl || '_signal_insert', route.tbl, route.fn);
    execute format(
      'create trigger %1$I after update on public.%2$I referencing new table as changed '
      'for each statement execute procedure public.%3$I()',
      route.tbl || '_signal_update', route.tbl, route.fn);
    execute format(
      'create trigger %1$I after delete on public.%2$I referencing old table as changed '
      'for each statement execute procedure public.%3$I()',
      route.tbl || '_signal_delete', route.tbl, route.fn);
  end loop;
end;
$$;
