-- ── Un-weld reward text from a beat's rich-text body ────────────────────────
--
-- `20260906160921_sweep_the_quest_residue.sql` moved each quest's free-text
-- `rewards` onto its terminal beat with a plain string concatenation:
--
--   b.dm_content || E'\n\nReward: ' || s.text
--
-- `dm_content` is a Tiptap document serialised as JSON (`{"type":"doc",…}`)
-- wherever the beat was edited in the rich-text editor. Appending prose after
-- the closing brace turns that column into a string that is neither JSON nor
-- prose, and the viewer falls back to rendering the raw serialisation — the
-- "rich text doesn't render properly in run mode" report of 7 Sep 2026.
--
-- Production held exactly one such row when this was measured (the other five
-- rewards landed on beats whose body was empty, so they became plain text,
-- which the viewer renders as a paragraph). Written generally all the same:
-- the weld is a shape, not a row id, and a local `db reset` replays the sweep
-- against whatever seed it finds.
--
-- The repair parses the document back out, appends one paragraph — a bold
-- "Reward:" run followed by the text, so nothing the DM wrote is lost or
-- demoted — and stores the document again. A row whose prefix does not parse
-- as a Tiptap document is left alone and named in a notice, never guessed at.

do $$
declare
  v_row     record;
  v_marker  constant text := E'\n\nReward: ';
  v_doc     jsonb;
  v_reward  text;
  v_fixed   integer := 0;
  v_skipped text;
begin
  for v_row in
    select id, title, dm_content, position(v_marker in dm_content) as at
      from public.quest_beats
     where dm_content like '{%'
       and position(v_marker in dm_content) > 0
  loop
    begin
      v_doc := left(v_row.dm_content, v_row.at - 1)::jsonb;
    exception when others then
      v_doc := null;
    end;

    if v_doc is null or v_doc ->> 'type' is distinct from 'doc' or jsonb_typeof(v_doc -> 'content') is distinct from 'array' then
      v_skipped := concat_ws(', ', v_skipped, v_row.title);
      continue;
    end if;

    v_reward := btrim(substr(v_row.dm_content, v_row.at + length(v_marker)));

    update public.quest_beats
       set dm_content = jsonb_set(
             v_doc,
             '{content}',
             (v_doc -> 'content') || jsonb_build_array(jsonb_build_object(
               'type', 'paragraph',
               'content', jsonb_build_array(
                 jsonb_build_object('type', 'text', 'marks', jsonb_build_array(jsonb_build_object('type', 'bold')), 'text', 'Reward: '),
                 jsonb_build_object('type', 'text', 'text', v_reward)
               )
             ))
           )::text
     where id = v_row.id;

    v_fixed := v_fixed + 1;
  end loop;

  raise notice 'reward weld: % beat body(ies) repaired', v_fixed;
  if v_skipped is not null then
    raise notice 'reward weld: left alone, prefix is not a Tiptap document: %', v_skipped;
  end if;
end $$;
