-- Migration: fix_function_search_path
-- Eight functions were created without a pinned search_path, flagged by the
-- Supabase advisor (lint 0011_function_search_path_mutable). A mutable
-- search_path lets a caller's role-level search_path influence name resolution
-- inside the function — a real hazard for the SECURITY DEFINER ones. Every other
-- function in this schema already pins `search_path = public`; bring these in line.

alter function public.assume_character(uuid, uuid)                      set search_path = public;
alter function public.chronicler_images_insert_redirect()              set search_path = public;
alter function public.chronicler_images_delete_redirect()              set search_path = public;
alter function public.clear_infusion_on_item_delete()                  set search_path = public;
alter function public.clear_shapeshifter_appearance(uuid)             set search_path = public;
alter function public.set_shapeshifter_appearance(uuid, uuid)         set search_path = public;
alter function public.grab_item_drop(uuid, integer, uuid, text, uuid) set search_path = public;
alter function public.sync_srd_spell_art_to_shared_table()            set search_path = public;
