-- A library item can be dropped to chat again.
--
-- `private.guard_message_items_shown` (20261003230336) refuses a chat drop or
-- offer naming a vault item the campaign has not been shown, and reads the item
-- ids out of the message through `private.message_item_ids`. The client writes
-- a drop's reference with `itemRefColumns`, which always sends both columns, so
-- a library item arrives as `{"item_id": null, "library_item_id": "srd_…"}`.
-- The extractor turned that JSON null into a SQL NULL uuid and returned it, the
-- guard asked whether the campaign had been shown item NULL, got false, and
-- refused: "a chat message may only offer an item this campaign has been
-- shown". So every drop of a shared-library item failed, for every player and
-- every DM, from the day the guard shipped. Production had no library drop at
-- all since then (checked 14 Oct 2026). It was found while testing #1059.
--
-- The test that covered library drops (`library_item_chat_drop.test.sql`) built
-- its metadata without an `item_id` key, which is why it passed; it now also
-- sends the client's shape. A null, absent or non-uuid id is not an item, so it
-- is skipped here rather than at the guard: every reader of the extractor wants
-- the items a message names, and NULL names none.

create or replace function private.message_item_ids(p_metadata jsonb)
returns setof uuid
language plpgsql
immutable
set search_path to 'public', 'private'
as $$
declare
  v text;
begin
  for v in
    select jsonb_path_query(p_metadata, '$.item_id') #>> '{}'
    union
    select jsonb_path_query(p_metadata, '$.rolled_atoms[*].item_id') #>> '{}'
  loop
    -- A JSON null reads as SQL NULL here: no item, not an unshown one.
    continue when v is null;
    begin
      return next v::uuid;
    exception when invalid_text_representation then
      null;
    end;
  end loop;
end;
$$;
