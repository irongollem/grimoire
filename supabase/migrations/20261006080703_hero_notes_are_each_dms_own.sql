-- #989, in the model of #983: a hero's DM note is each DM's own.
--
-- The Hall of Heroes is admin-curated and every signed-in account reads it
-- (`hall_of_heroes_select`), so `hall_of_heroes.notes`, labelled "DM Notes,
-- visible only to app admins", was one REST call away from anyone. The UI hid
-- it; the database did not. And it was one note for the whole app, where a hero
-- is something every DM can open and has their own thoughts about.
--
-- So a hero is a DM-note entity like the rest (src/lib/dmNotes/registry.ts,
-- type `hero`): each DM's note is their private entity_notes row. The two notes
-- production holds become their author's own (the admin's, checked 6 Oct 2026),
-- and the column goes.

insert into public.entity_notes (user_id, campaign_id, entity_type, entity_id, content, is_private, shared_with_dm)
select h.user_id, null, 'hero', h.id::text, h.notes, true, false
  from public.hall_of_heroes h
 where h.notes is not null
   and case when h.notes ~ '^\s*\{' then h.notes ~ '"text"\s*:\s*"[^"]*\S' else h.notes ~ '\S' end;

alter table public.hall_of_heroes drop column notes;
