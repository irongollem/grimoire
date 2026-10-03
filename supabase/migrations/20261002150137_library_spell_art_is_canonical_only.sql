-- #947: spell art has one source, library_spell_art_canonical, and the dead
-- references left by a careless bulk delete are repaired.
--
-- What was wrong. Canonical art must live under an admin-only prefix, never
-- under a user's own folder, because clearing that user's files wipes it
-- (CLAUDE.md, "Storage Path Convention"). The 109 library_art_defaults rows of
-- content_type 'spell' pointed at originals in the admin's own folder of
-- asset-images, and a bulk delete removed those files. Verified on production
-- on 2 Oct 2026: all 109 spell defaults are dead, plus 3 item defaults
-- (quarterstaff; ale, mug; bag of holding). The other 252 item defaults are
-- alive. 107 library_spells rows (62 spell names, in both rulesets) carried one
-- of those dead URLs, while the real art was fine: 95 rows of
-- library_spell_art_canonical sit under spell-images/srd/, and 96 of the 107
-- dead rows have canonical art for a spell of the same name.
--
-- Why it was permanent. sync_library_spell_art() first stamped the spell
-- defaults onto every library_spells row by lower(name), its "legacy path", and
-- only then overwrote from the canonical table where entry_id matched the
-- row's own id. So every admin sync re-applied a dead URL to each spell that
-- had a default by name but no canonical row under its exact id, mostly the
-- other ruleset's copy of the same spell.
--
-- The rules from here on:
--   * Spell art has one source, library_spell_art_canonical. library_art_defaults
--     holds items only, and its check constraint now says so.
--   * A spell with no canonical row under its own id takes the canonical art of
--     a spell with the same lower(name), the lowest entry_id when several do. A
--     row's own canonical art always wins.
--   * Item art keeps library_art_defaults (keyed by lowercased name) as its
--     source, and canonical item art gets the admin-only srd/ prefix in
--     item-images, as spell-images and monster-images have.
--
-- sync_library_spell_art() stays SECURITY INVOKER (20260930224550): the
-- library_spells_update policy is private.is_app_admin(), so the guard and the
-- policy agree.

-- 1. The sync: canonical by id, then the namesake's canonical art.
create or replace function public.sync_library_spell_art()
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  updated_count integer := 0;
  batch_count   integer;
begin
  if not private.is_app_admin() then
    raise exception 'Unauthorized';
  end if;

  -- A spell's own canonical row.
  update library_spells ls
  set image_url         = lsac.image_url,
      image_focal_point = lsac.portrait_focal_point,
      updated_at        = now()
  from library_spell_art_canonical lsac
  where lsac.entry_id  = ls.id
    and lsac.image_url is not null;

  get diagnostics batch_count = row_count;
  updated_count := updated_count + batch_count;

  -- No row of its own: the canonical art of a same-named spell (the other
  -- ruleset's copy). The lowest entry_id decides when several share a name.
  update library_spells ls
  set image_url         = nm.image_url,
      image_focal_point = nm.portrait_focal_point,
      updated_at        = now()
  from (
    select distinct on (lower(o.name))
           lower(o.name) as name_key, lsac.image_url, lsac.portrait_focal_point
    from library_spell_art_canonical lsac
    join library_spells o on o.id = lsac.entry_id
    where lsac.image_url is not null
    order by lower(o.name), lsac.entry_id
  ) nm
  where nm.name_key = lower(ls.name)
    and not exists (
      select 1 from library_spell_art_canonical own
      where own.entry_id = ls.id and own.image_url is not null
    );

  get diagnostics batch_count = row_count;
  updated_count := updated_count + batch_count;

  return updated_count;
end;
$function$;

-- 2. Repair. A row whose image_url equals a spell default's got it from the
-- legacy path, so re-derive it: own canonical row, else the namesake's, else
-- NULL. Plain updates rather than a call to the function, whose admin guard
-- would refuse a migration (no JWT). Runs before the defaults are deleted.
update library_spells ls
set image_url         = r.image_url,
    image_focal_point = r.portrait_focal_point,
    updated_at        = now()
from (
  select ls2.id, c.image_url, c.portrait_focal_point
  from library_spells ls2
  left join lateral (
    select lsac.image_url, lsac.portrait_focal_point
    from library_spell_art_canonical lsac
    left join library_spells o on o.id = lsac.entry_id
    where lsac.image_url is not null
      and (lsac.entry_id = ls2.id or lower(o.name) = lower(ls2.name))
    order by (lsac.entry_id = ls2.id) desc, lsac.entry_id
    limit 1
  ) c on true
  where ls2.image_url in (
    select d.image_url from library_art_defaults d
    where d.content_type = 'spell' and d.image_url is not null
  )
) r
where ls.id = r.id;

-- 3. Spells leave library_art_defaults for good.
delete from public.library_art_defaults where content_type = 'spell';

alter table public.library_art_defaults
  drop constraint library_art_defaults_content_type_check;
alter table public.library_art_defaults
  add constraint library_art_defaults_content_type_check check (content_type = 'item');

-- 4. Canonical item art lives under item-images/srd/, admin-only to write,
-- the same four policies spell-images carries.
create policy "item_images_srd_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "item_images_srd_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "item_images_srd_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = 'srd'
    and private.is_app_admin()
  );

create policy "item_images_srd_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = 'srd'
  );
