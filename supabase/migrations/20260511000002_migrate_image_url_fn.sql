-- Migration: migrate_image_url_fn
-- Helper RPC for the one-shot PNG/JPEG → WebP originals migration. Updates every
-- known column in the public schema that may reference an image URL — direct
-- text URL columns, rich-text content, and JSONB blobs with embedded URLs.
-- Runs as security invoker so RLS still scopes updates to rows the caller owns.

create or replace function migrate_image_url(old_url text, new_url text)
returns void
language plpgsql
security invoker
as $$
begin
  -- Direct URL columns (exact match)
  update npcs               set portrait_url           = new_url where portrait_url           = old_url;
  update npcs               set disguise_portrait_url  = new_url where disguise_portrait_url  = old_url;
  update monsters           set image_url              = new_url where image_url              = old_url;
  update locations          set image_url              = new_url where image_url              = old_url;
  update locations          set map_url                = new_url where map_url                = old_url;
  update items              set image_url              = new_url where image_url              = old_url;
  update items              set mundane_image_url      = new_url where mundane_image_url      = old_url;
  update spells             set image_url              = new_url where image_url              = old_url;
  update factions           set emblem_url             = new_url where emblem_url             = old_url;
  update pantheons          set emblem_url             = new_url where emblem_url             = old_url;
  update companions         set portrait_url           = new_url where portrait_url           = old_url;
  update dungeon_features   set image_url              = new_url where image_url              = old_url;
  update puzzle_rooms       set image_url              = new_url where image_url              = old_url;
  update traps              set image_url              = new_url where image_url              = old_url;
  update party_members      set portrait_url           = new_url where portrait_url           = old_url;
  update species            set image_url              = new_url where image_url              = old_url;
  update backgrounds        set image_url              = new_url where image_url              = old_url;
  update deities            set portrait_url           = new_url where portrait_url           = old_url;
  update deities            set symbol_image_url       = new_url where symbol_image_url       = old_url;
  update hall_of_heroes     set portrait_url           = new_url where portrait_url           = old_url;
  update hall_of_heroes     set disguise_portrait_url  = new_url where disguise_portrait_url  = old_url;
  update hall_of_heroes     set card_art_url           = new_url where card_art_url           = old_url;
  update chronicler_images  set image_url              = new_url where image_url              = old_url;
  update campaigns          set group_portrait_url     = new_url where group_portrait_url     = old_url;

  -- Rich text content (Tiptap JSON stored as text) — substring replace
  update notes                  set content = replace(content, old_url, new_url) where content like '%' || old_url || '%';
  update scriptorium_documents  set content = replace(content, old_url, new_url) where content like '%' || old_url || '%';

  -- JSONB columns with embedded URLs (cast→replace→cast)
  update encounters set art_objects        = replace(art_objects::text,        old_url, new_url)::jsonb where art_objects::text        like '%' || old_url || '%';
  update quests     set reward_art_objects = replace(reward_art_objects::text, old_url, new_url)::jsonb where reward_art_objects::text like '%' || old_url || '%';
end;
$$;

grant execute on function migrate_image_url(text, text) to authenticated;
