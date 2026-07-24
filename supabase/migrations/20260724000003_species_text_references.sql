-- Migration: species_text_references
-- Species references become text ids that hold EITHER a custom species uuid OR a
-- shared srd_species slug (issue #303) — the companions.source_monster_id
-- precedent. Needed because players pick a species during character creation and
-- cannot clone a shared row into the DM's species table under owner-only RLS,
-- so party_members must be able to point at srd_species directly.
--
-- The dropped ON DELETE SET NULL FKs are replicated by an AFTER DELETE trigger
-- on species (srd_species rows are admin-managed and never deleted in normal
-- operation, so they get no trigger).

alter table public.party_members
  drop constraint if exists party_members_species_id_fkey,
  drop constraint if exists party_members_disguise_species_id_fkey;

alter table public.party_members
  alter column species_id type text using species_id::text,
  alter column disguise_species_id type text using disguise_species_id::text;

alter table public.campaigns
  alter column disabled_species_ids drop default;
alter table public.campaigns
  alter column disabled_species_ids type text[] using disabled_species_ids::text[];
alter table public.campaigns
  alter column disabled_species_ids set default '{}'::text[];

-- Replaces the former ON DELETE SET NULL FK behaviour, and additionally scrubs
-- the deleted species from every campaign blocklist (the old uuid[] column had
-- no FK there, so stale ids used to linger — text refs keep the same cleanup).
create or replace function public.cleanup_species_references()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update party_members
  set species_id = null
  where species_id = old.id::text;

  update party_members
  set disguise_species_id = null
  where disguise_species_id = old.id::text;

  update campaigns
  set disabled_species_ids = array_remove(disabled_species_ids, old.id::text)
  where old.id::text = any(disabled_species_ids);

  return old;
end;
$$;

-- Trigger functions never need EXECUTE (the trigger system bypasses the check);
-- keep it off the PostgREST RPC surface.
revoke execute on function public.cleanup_species_references() from public, anon, authenticated;

create trigger species_cleanup_references
  after delete on public.species
  for each row execute procedure cleanup_species_references();
