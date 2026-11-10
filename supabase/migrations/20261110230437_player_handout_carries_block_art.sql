-- A picture placed on a handout's page reaches the player's phone (#1175).
--
-- A Scriptorium picture placed freely on a page is page furniture of kind
-- "art" (scriptorium_documents.page_furniture), anchored to the block it was
-- placed from, so it travels with that text to whatever page it lands on. The
-- phone reader has no pages: it shows such a picture in the flow, after its
-- block, at full width. So get_player_handout now returns the chapter's art
-- alongside its content, as `chapter.art`: [{ blockId, src }] in furniture
-- order.
--
-- Only art anchored to a block that survives private.strip_secret_nodes is
-- returned: a picture placed from a DM-only secret block, or from the Deep
-- half of a lens pair, is withheld exactly as its block is. Art pinned to a
-- page number has nothing to follow in a reflowed reader and stays in print.
-- Nothing else of the furniture (watercolours, watermarks, credits, positions,
-- layers) is sent.

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
                            and jsonb_path_exists(
                                  v_content,
                                  '$.** ? (@.blockId == $id)',
                                  jsonb_build_object('id', f.item -> 'anchor' ->> 'blockId')))) end);
end;
$$;
