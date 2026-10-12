-- The subclass-spell sync stands down during a campaign copy.
--
-- `character_classes_sync_subclass_spells` (20261008165034) writes the spells a
-- subclass grants the moment a class row is inserted. A campaign copy inserts
-- character_classes before character_spells, so the sync wrote each copied
-- character's grants first and the template's own granted rows -- copied with
-- the rest of character_spells -- then collided on
-- character_spells_party_member_spell_source_class_key, failing
-- publish_demo_version()'s dry run and every load_demo_campaign() with it.
--
-- The template's rows are the right ones to keep: they are what the author
-- published, preparation flags and converted picks included. So the trigger
-- follows the convention 20260925002215 set for side-effect triggers and
-- returns early while `grimoire.copying_campaign` is on. Body read from
-- production 12 Oct 2026; only the early return is new.

create or replace function private.character_classes_sync_subclass_spells()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if current_setting('grimoire.copying_campaign', true) = 'on' then
    return null;
  end if;
  perform private.sync_subclass_spells(new.id);
  return null;
end;
$function$;

revoke execute on function private.character_classes_sync_subclass_spells() from public, anon, authenticated;
