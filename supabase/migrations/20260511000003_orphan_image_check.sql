-- Migration: orphan_image_check
-- Helper RPCs for the one-shot orphaned-image cleanup. Mirrors the column list
-- from migrate_image_url so coverage stays symmetric: every column the migrator
-- knows how to rewrite is also a column the orphan check inspects.

create or replace function image_url_referenced(url text)
returns boolean
language plpgsql
security invoker
as $$
begin
  -- Direct URL columns (exact match)
  if exists (select 1 from npcs              where portrait_url = url or disguise_portrait_url = url) then return true; end if;
  if exists (select 1 from monsters          where image_url = url)                                   then return true; end if;
  if exists (select 1 from locations         where image_url = url or map_url = url)                  then return true; end if;
  if exists (select 1 from items             where image_url = url or mundane_image_url = url)        then return true; end if;
  if exists (select 1 from spells            where image_url = url)                                   then return true; end if;
  if exists (select 1 from factions          where emblem_url = url)                                  then return true; end if;
  if exists (select 1 from pantheons         where emblem_url = url)                                  then return true; end if;
  if exists (select 1 from companions        where portrait_url = url)                                then return true; end if;
  if exists (select 1 from dungeon_features  where image_url = url)                                   then return true; end if;
  if exists (select 1 from puzzle_rooms      where image_url = url)                                   then return true; end if;
  if exists (select 1 from traps             where image_url = url)                                   then return true; end if;
  if exists (select 1 from party_members     where portrait_url = url)                                then return true; end if;
  if exists (select 1 from species           where image_url = url)                                   then return true; end if;
  if exists (select 1 from backgrounds       where image_url = url)                                   then return true; end if;
  if exists (select 1 from deities           where portrait_url = url or symbol_image_url = url)      then return true; end if;
  if exists (select 1 from hall_of_heroes    where portrait_url = url or disguise_portrait_url = url or card_art_url = url) then return true; end if;
  if exists (select 1 from chronicler_images where image_url = url)                                   then return true; end if;
  if exists (select 1 from campaigns         where group_portrait_url = url)                          then return true; end if;

  -- Rich text content (substring match)
  if exists (select 1 from notes                 where content like '%' || url || '%') then return true; end if;
  if exists (select 1 from scriptorium_documents where content like '%' || url || '%') then return true; end if;

  -- JSONB columns
  if exists (select 1 from encounters where art_objects::text        like '%' || url || '%') then return true; end if;
  if exists (select 1 from quests     where reward_art_objects::text like '%' || url || '%') then return true; end if;

  return false;
end;
$$;

-- Batch checker: return the subset of `urls` that are NOT referenced anywhere.
create or replace function find_orphan_image_urls(urls text[])
returns text[]
language plpgsql
security invoker
as $$
declare
  url text;
  orphans text[] := '{}';
begin
  foreach url in array urls loop
    if not image_url_referenced(url) then
      orphans := array_append(orphans, url);
    end if;
  end loop;
  return orphans;
end;
$$;

grant execute on function image_url_referenced(text)      to authenticated;
grant execute on function find_orphan_image_urls(text[])  to authenticated;
