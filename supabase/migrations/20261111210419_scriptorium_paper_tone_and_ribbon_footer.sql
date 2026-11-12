-- A book's paper and its footer style (#1176, the fishing-supplement pages).
--
-- `paper_tone` lays a book on a paper of its own instead of the look's: grey
-- or warm grey (the maintainer's own handmade paper scans), white, or
-- parchment. Null is the look's own paper. A handout's paper is its theme, so
-- only books offer it.
--
-- `footer_style` draws the running title plainly (as before) or on a ribbon
-- banner at the foot of the page.
--
-- A player reading a book shared with them sees its paper, so get_player_handout
-- returns `paper_tone` too; it is otherwise unchanged from 20261111072537. The
-- player reader draws no footers, so `footer_style` stays with the DM.

alter table public.scriptorium_documents
  add column paper_tone text
    constraint scriptorium_documents_paper_tone_check check (paper_tone in ('grey', 'warm-grey', 'white', 'parchment')),
  add column footer_style text not null default 'plain'
    constraint scriptorium_documents_footer_style_check check (footer_style in ('plain', 'ribbon'));

create or replace function public.get_player_handout(p_document_id uuid, p_chapter_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_doc public.scriptorium_documents;
  v_chapter public.scriptorium_chapters;
  v_content jsonb;
begin
  select * into v_doc from public.scriptorium_documents d where d.id = p_document_id;
  if not found or v_doc.campaign_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not (
    exists (select 1 from public.campaign_members cm
             where cm.user_id = (select auth.uid())
               and cm.campaign_id = v_doc.campaign_id
               and cm.party_member_id = any (v_doc.player_visible_to))
    or coalesce(private.is_campaign_dm(v_doc.campaign_id), false)
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_chapter
    from public.scriptorium_chapters c
   where c.document_id = v_doc.id and (p_chapter_id is null or c.id = p_chapter_id)
   order by c.position, c.created_at
   limit 1;

  if v_chapter.id is not null then
    v_content := private.strip_secret_nodes(v_chapter.content);
  end if;

  return jsonb_build_object(
    'id', v_doc.id,
    'title', v_doc.title,
    'kind', v_doc.kind,
    'doc_type', v_doc.doc_type,
    'campaign_id', v_doc.campaign_id,
    'theme', v_doc.theme,
    'paper_tone', v_doc.paper_tone,
    'updated_at', v_doc.updated_at,
    'chapters', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'position', c.position, 'title', c.title)
                                           order by c.position, c.created_at), '[]'::jsonb)
                   from public.scriptorium_chapters c where c.document_id = v_doc.id),
    'chapter', case when v_chapter.id is null then null else jsonb_build_object(
                 'id', v_chapter.id,
                 'title', v_chapter.title,
                 'content', v_content,
                 'art', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'blockId', f.item -> 'anchor' ->> 'blockId',
                                   'src', f.item -> 'props' ->> 'src') order by f.ord), '[]'::jsonb)
                           -- Not an array (a malformed column): no art, never a failed read of the text.
                           from jsonb_array_elements(case when jsonb_typeof(v_doc.page_furniture) = 'array'
                                                          then v_doc.page_furniture else '[]'::jsonb end)
                                  with ordinality as f(item, ord)
                          where f.item ->> 'kind' = 'art'
                            and f.item -> 'anchor' ->> 'type' = 'block'
                            -- A missing id would match every block whose own id is null.
                            and coalesce(f.item -> 'anchor' ->> 'blockId', '') <> ''
                            and coalesce(f.item -> 'props' ->> 'src', '') <> ''
                            -- An edit whose bake is pending (a recipe, no bakedFor) still shows the
                            -- original or an older bake in `src`: withheld until the bake lands.
                            and not ((f.item -> 'props') ? 'illuminate'
                                     and coalesce(f.item -> 'props' ->> 'bakedFor', '') = '')
                            and jsonb_path_exists(
                                  v_content,
                                  '$.** ? (@.blockId == $id)',
                                  jsonb_build_object('id', f.item -> 'anchor' ->> 'blockId')))) end);
end;
$$;
