-- Migration: scriptorium_documents_move_into_chapters
-- Every Scriptorium document becomes a book with one chapter, and the document's own `content`
-- column goes (#1115 story 13; the model is 20261029222021). Nothing reads `content` after this:
-- the client writes chapters, players read through get_player_handout, and the handout givers
-- read private.book_body.
--
-- Nothing is lost. A body that is a Tiptap document moves as it is. A body that is not (an
-- unreadable string the editor refused to open, which until now kept the only copy) moves as
-- plain paragraphs of its raw text, so its author can still see it and copy it out.
--
-- The move must not look like an edit: it touches no book's updated_at, or every holder of a
-- handout would see its "new" mark light up for a change nobody made. So the chapter triggers
-- that touch the book are off while the chapters are written.

alter table public.scriptorium_chapters disable trigger scriptorium_chapters_touch_book_insert;

do $$
declare
  r record;
  v_doc jsonb;
  v_title text;
begin
  for r in select d.id, d.content, d.word_count from public.scriptorium_documents d loop
    v_doc := null;
    if r.content is not null and r.content ~ '^\s*\{' then
      begin
        v_doc := r.content::jsonb;
      exception when others then
        v_doc := null;
      end;
    end if;

    if v_doc is null
       or v_doc ->> 'type' is distinct from 'doc'
       or jsonb_typeof(v_doc -> 'content') is distinct from 'array' then
      -- Plain paragraphs of the raw text, one per line; an empty body is one empty paragraph.
      v_doc := jsonb_build_object('type', 'doc', 'content', coalesce((
        select jsonb_agg(case when l.line = '' then jsonb_build_object('type', 'paragraph')
                              else jsonb_build_object('type', 'paragraph', 'content',
                                     jsonb_build_array(jsonb_build_object('type', 'text', 'text', l.line))) end
                         order by l.ord)
          from regexp_split_to_table(coalesce(r.content, ''), E'\r?\n') with ordinality as l(line, ord)
         where r.content is not null and btrim(r.content) <> ''), '[{"type": "paragraph"}]'::jsonb));
    end if;

    if jsonb_array_length(v_doc -> 'content') = 0 then
      v_doc := jsonb_set(v_doc, '{content}', '[{"type": "paragraph"}]'::jsonb);
    end if;

    -- The chapter's name is its first top-level heading's text, as the client writes it.
    select coalesce(string_agg(t.node ->> 'text', '' order by t.ord), '') into v_title
      from (select b.node from jsonb_array_elements(v_doc -> 'content') with ordinality as b(node, ord)
             where b.node ->> 'type' = 'heading' order by b.ord limit 1) h
      cross join lateral jsonb_array_elements(coalesce(h.node -> 'content', '[]'::jsonb)) with ordinality as t(node, ord)
     where t.node ->> 'type' = 'text';

    insert into public.scriptorium_chapters (document_id, position, title, content, word_count)
    values (r.id, 0, btrim(v_title), v_doc, greatest(coalesce(r.word_count, 0), 0));
  end loop;
end;
$$;

alter table public.scriptorium_chapters enable trigger scriptorium_chapters_touch_book_insert;

-- Furniture pinned to a page names that page within its chapter now. With one chapter, page N
-- of the book is page N of that chapter, so only the chapter id is added.
alter table public.scriptorium_documents disable trigger scriptorium_updated_at;
alter table public.scriptorium_documents disable trigger scriptorium_documents_signal_update;

update public.scriptorium_documents d
   set page_furniture = (
     select jsonb_agg(case when f.item -> 'anchor' ->> 'type' = 'page'
                           then jsonb_set(f.item, '{anchor,chapterId}', to_jsonb(c.id))
                           else f.item end order by f.ord)
       from jsonb_array_elements(d.page_furniture) with ordinality as f(item, ord))
  from public.scriptorium_chapters c
 where c.document_id = d.id
   and exists (select 1 from jsonb_array_elements(d.page_furniture) x where x -> 'anchor' ->> 'type' = 'page');

alter table public.scriptorium_documents enable trigger scriptorium_updated_at;
alter table public.scriptorium_documents enable trigger scriptorium_documents_signal_update;

alter table public.scriptorium_documents drop column content;
