-- Page dressing (#1181): a book's or handout's hand-painted details repeated on every page with variation, a
-- stain low on the page, a wash along its edges, corner ornaments. The shape is the client's, read and checked
-- there; null is no dressing. Each page's variation comes from the document's seed and the page number, so the
-- editor, the preview and the PDF dress every page the same way.
--
-- A player reading a shared handout sees its dressing, as they see its paper, so get_player_handout returns
-- `page_dressing` too; it is otherwise unchanged from 20261111210419.

alter table public.scriptorium_documents
  add column page_dressing jsonb
    constraint scriptorium_documents_page_dressing_check
      check (page_dressing is null or jsonb_typeof(page_dressing) = 'object');

CREATE OR REPLACE FUNCTION public.get_player_handout(p_document_id uuid, p_chapter_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'page_dressing', v_doc.page_dressing,
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
$function$;
