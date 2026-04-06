-- discovered_monsters has an updated_at trigger but no updated_at column,
-- causing every UPDATE (visibility, reveal_stats) to fail with a 400.
-- The table uses discovered_at instead; drop the broken trigger.
drop trigger if exists discovered_monsters_updated_at on discovered_monsters;
