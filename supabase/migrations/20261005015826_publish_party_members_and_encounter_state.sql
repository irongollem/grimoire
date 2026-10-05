-- `party_members` and `encounter_state` are in production's supabase_realtime
-- publication, and the client subscribes to both (`usePartyLive` for HP and
-- conditions, `useEncounterLive` for the running encounter), but no migration
-- ever added them: production got them by hand. A database built from the
-- migrations (local, CI, a restore) therefore joined both channels and
-- received nothing, so a DM's damage never reached a player's sheet there
-- (found in a player-portal audit, 5 Oct 2026, on the local stack).
--
-- Idempotent: production already has both, and `add table` fails on a table
-- that is already a member.
do $$
declare
  t text;
begin
  foreach t in array array['party_members', 'encounter_state'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
