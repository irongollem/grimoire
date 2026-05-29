-- Migration: realtime_publication
-- Add all campaign-scoped tables that useCampaignLiveSync listens to into the
-- supabase_realtime publication, and set REPLICA IDENTITY FULL so postgres_changes
-- filters on campaign_id work for UPDATE/DELETE events (the default replica
-- identity only carries the primary key in the OLD row image, so non-PK filters
-- silently miss updates).

do $$
declare
  t text;
  tables text[] := array[
    'notes','quests','locations','factions','npcs','companions',
    'discovered_monsters','pantheons','deities','puzzle_rooms',
    'calendar_events','player_journal_entries','session_proposals',
    'session_availability','campaigns','items','party_inventory','npc_inventory'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I replica identity full', t);
    -- add table to publication, ignoring if already a member
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null;
    end;
  end loop;
end $$;
