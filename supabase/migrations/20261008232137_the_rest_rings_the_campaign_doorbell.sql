-- The rest rings the campaign doorbell (#1033, wave 3).
--
-- The last campaign tables a screen reads that were on no live route:
--   spell_change_windows  a swap the player may make after a level or a rest,
--                         opened by the DM's level-up and spent by the player
--   npc_relationships     the web of who knows whom, edited at the table
--   campaign_invites      the DM's invite links, seen from every DM device
--   player_favourites     one user's own favourites, seen from their other
--                         devices
--
-- What is left off a route on purpose is listed, with its reason, in
-- live_sync_exempt in supabase/tests/live_sync_registry.test.sql, which now
-- fails on any campaign-anchored table that is on neither list.

do $$
declare
  route record;
  args text;
begin
  for route in
    select * from (values
      ('spell_change_windows', 'signal_parent_change',   array['party_members', 'party_member_id']),
      ('npc_relationships',    'signal_campaign_change', array[]::text[]),
      ('campaign_invites',     'signal_campaign_change', array[]::text[]),
      ('player_favourites',    'signal_campaign_change', array[]::text[])
    ) as r(tbl, fn, fn_args)
  loop
    args := (select coalesce(string_agg(quote_literal(a), ', '), '') from unnest(route.fn_args) a);
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
