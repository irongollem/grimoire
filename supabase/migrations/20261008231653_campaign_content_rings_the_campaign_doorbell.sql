-- Campaign content rings the campaign doorbell (#1033, wave 2).
--
-- What the DM writes and the table reads (homebrew monsters, spells, species,
-- classes and features, rules, traps, recipes, sounds and playlists, quest
-- wiring, faction links, a place's doors and regions) was on no live route, so
-- a DM's edit mid-session reached nobody's open screen, not even the DM's other
-- device. Every one rings rather than subscribes: the rows are owner-only or
-- DM-only, readers see them through projections, or the row carries no
-- campaign_id. A DM's own editor hears the echo of its save as a refetch of the
-- root its mutation already invalidated (every one of these mutations does), so
-- the ring adds no new hazard under an open form.
--
-- ── 1. One route for every table that hangs off a parent ────────────────────
--
-- A child row finds its campaign through its parent. There were three copies
-- of that (characters, places, quests) and this wave needed three more
-- (factions, recipes, playlists), so it becomes one function taking the parent
-- table and the foreign-key column as trigger arguments, and an optional
-- signal name third (quest_objectives rings quest_objectives_player). A
-- transition table is visible to dynamic SQL; the identifiers come from DDL and
-- are quoted with %I.

create function public.signal_parent_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_campaigns uuid[];
begin
  execute format(
    'select array(select p.campaign_id from changed c join public.%I p on p.id = c.%I)',
    tg_argv[0], tg_argv[1])
    into v_campaigns;
  perform private.ring_campaigns(v_campaigns, coalesce(tg_argv[2], tg_table_name));
  return null;
end;
$function$;

-- A trigger function never needs EXECUTE; keep it off the RPC surface.
revoke execute on function public.signal_parent_change() from public, anon, authenticated;

-- ── 2. The triggers ─────────────────────────────────────────────────────────

-- Three statement-level triggers per table, one per event. `fn` is the route;
-- `args` its trigger arguments, empty for rows that carry campaign_id.
do $$
declare
  route record;
  args text;
  trigger_name name;
begin
  for route in
    select * from (values
      -- Existing child routes, moved onto the shared function.
      ('ruleset_reviews',             'signal_parent_change', array['party_members', 'party_member_id']),
      ('character_classes',           'signal_parent_change', array['party_members', 'party_member_id']),
      ('character_spells',            'signal_parent_change', array['party_members', 'party_member_id']),
      ('faction_party_members',       'signal_parent_change', array['party_members', 'party_member_id']),
      ('store_items',                 'signal_parent_change', array['locations', 'location_id']),
      ('location_state_events',       'signal_parent_change', array['locations', 'location_id']),
      ('location_placements',         'signal_parent_change', array['locations', 'location_id']),
      ('quest_objectives',            'signal_parent_change', array['quests', 'quest_id', 'quest_objectives_player']),
      -- Wave 2: rows that carry campaign_id.
      ('monsters',                    'signal_campaign_change', array[]::text[]),
      ('spells',                      'signal_campaign_change', array[]::text[]),
      ('species',                     'signal_campaign_change', array[]::text[]),
      ('custom_classes',              'signal_campaign_change', array[]::text[]),
      ('custom_subclasses',           'signal_campaign_change', array[]::text[]),
      ('class_features',              'signal_campaign_change', array[]::text[]),
      ('rules',                       'signal_campaign_change', array[]::text[]),
      ('traps',                       'signal_campaign_change', array[]::text[]),
      ('crafting_recipes',            'signal_campaign_change', array[]::text[]),
      ('campaign_enabled_sources',    'signal_campaign_change', array[]::text[]),
      ('campaign_tile_packs',         'signal_campaign_change', array[]::text[]),
      ('sounds',                      'signal_campaign_change', array[]::text[]),
      ('soundboard_pages',            'signal_campaign_change', array[]::text[]),
      ('soundboard_playlists',        'signal_campaign_change', array[]::text[]),
      ('npc_sets',                    'signal_campaign_change', array[]::text[]),
      ('faction_deities',             'signal_campaign_change', array[]::text[]),
      ('quest_beat_attachments',      'signal_campaign_change', array[]::text[]),
      ('quest_beat_edges',            'signal_campaign_change', array[]::text[]),
      ('quest_beat_edge_gates',       'signal_campaign_change', array[]::text[]),
      -- Wave 2: rows under a parent.
      ('faction_locations',           'signal_parent_change', array['locations', 'location_id']),
      ('location_doors',              'signal_parent_change', array['locations', 'from_location_id']),
      ('location_map_regions',        'signal_parent_change', array['locations', 'site_location_id']),
      ('quest_consequences',          'signal_parent_change', array['quests', 'quest_id']),
      ('quest_refs',                  'signal_parent_change', array['quests', 'quest_id']),
      ('faction_items',               'signal_parent_change', array['factions', 'faction_id']),
      ('faction_npcs',                'signal_parent_change', array['factions', 'faction_id']),
      ('faction_relations',           'signal_parent_change', array['factions', 'faction_id']),
      ('crafting_recipe_ingredients', 'signal_parent_change', array['crafting_recipes', 'recipe_id']),
      ('crafting_recipe_modifiers',   'signal_parent_change', array['crafting_recipes', 'recipe_id']),
      ('crafting_recipe_outputs',     'signal_parent_change', array['crafting_recipes', 'recipe_id']),
      ('soundboard_playlist_tracks',  'signal_parent_change', array['soundboard_playlists', 'playlist_id'])
    ) as r(tbl, fn, fn_args)
  loop
    args := (select coalesce(string_agg(quote_literal(a), ', '), '') from unnest(route.fn_args) a);
    -- The moved routes replace the triggers they had; the new tables had none.
    for trigger_name in
      select g.tgname from pg_trigger g
       where g.tgrelid = format('public.%I', route.tbl)::regclass
         and g.tgname in (route.tbl || '_signal_insert', route.tbl || '_signal_update', route.tbl || '_signal_delete')
    loop
      execute format('drop trigger %I on public.%I', trigger_name, route.tbl);
    end loop;
    execute format(
      'create trigger %1$I after insert on public.%2$I referencing new table as changed '
      'for each statement execute procedure public.%3$I(%4$s)',
      route.tbl || '_signal_insert', route.tbl, route.fn, args);
    execute format(
      'create trigger %1$I after update on public.%2$I referencing new table as changed '
      'for each statement execute procedure public.%3$I(%4$s)',
      route.tbl || '_signal_update', route.tbl, route.fn, args);
    execute format(
      'create trigger %1$I after delete on public.%2$I referencing old table as changed '
      'for each statement execute procedure public.%3$I(%4$s)',
      route.tbl || '_signal_delete', route.tbl, route.fn, args);
  end loop;
end;
$$;

-- ── 3. The three per-parent copies go ───────────────────────────────────────

drop function public.signal_party_member_child_change();
drop function public.signal_location_child_change();
drop function public.signal_quest_child_change();
