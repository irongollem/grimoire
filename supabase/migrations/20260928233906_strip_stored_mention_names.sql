-- Migration: strip_stored_mention_names
-- An @mention stores who it points at, never what they are called (#932).
--
-- A mention node used to be `{ type: "entityMention", attrs: { id, entityType,
-- label } }`, where `label` was the entity's real name at the moment of
-- writing, and the chip printed it for whoever was reading. So a note shared
-- with players that mentioned a disguised NPC showed them its true name, in
-- the page and in the JSON their browser downloaded. The client now stores
-- `{ id, entityType }` only and resolves the name at render time for the
-- current reader: the DM gets the name, a player gets what
-- get_player_visible_npcs and the other projections say they know, and "???"
-- when that is nothing.
--
-- This removes `label` from mentions already stored, so the old names do not
-- linger in rows players can read. Only the two editors that ever enabled
-- mentions wrote them: DM notes and the player journal. Production held 2
-- such notes and no journal entries when this was written. A row whose content
-- is not valid JSON (plain text from before the rich-text editor) is left as it
-- is: it cannot contain a mention node.

create function pg_temp.strip_mention_labels(j jsonb)
returns jsonb
language plpgsql
immutable
as $$
begin
  if jsonb_typeof(j) = 'object' then
    return (
      select coalesce(jsonb_object_agg(
        e.key,
        case when e.key = 'attrs' and j ->> 'type' = 'entityMention'
             then e.value - 'label'
             else pg_temp.strip_mention_labels(e.value)
        end), '{}'::jsonb)
      from jsonb_each(j) as e
    );
  elsif jsonb_typeof(j) = 'array' then
    return (
      select coalesce(jsonb_agg(pg_temp.strip_mention_labels(a.value) order by a.ordinality), '[]'::jsonb)
      from jsonb_array_elements(j) with ordinality as a
    );
  end if;
  return j;
end;
$$;

do $$
declare
  r record;
  doc jsonb;
begin
  for r in select id, content from public.notes where content like '%entityMention%' loop
    begin
      doc := r.content::jsonb;
    exception when others then
      continue;
    end;
    update public.notes set content = pg_temp.strip_mention_labels(doc)::text where id = r.id;
  end loop;

  for r in select id, content from public.player_journal_entries where content like '%entityMention%' loop
    begin
      doc := r.content::jsonb;
    exception when others then
      continue;
    end;
    update public.player_journal_entries set content = pg_temp.strip_mention_labels(doc)::text where id = r.id;
  end loop;
end;
$$;
