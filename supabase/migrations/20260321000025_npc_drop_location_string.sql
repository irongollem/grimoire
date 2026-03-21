-- Remove the old flat location string from npcs. All location data now lives
-- in the locations table and is referenced via location_id.
alter table public.npcs drop column location;
