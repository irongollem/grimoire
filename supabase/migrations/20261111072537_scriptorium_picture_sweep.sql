-- Illuminator files leave storage once nothing refers to them (#1176).
--
-- The Illuminator stores a picture's bake, brush masks, textures and AI
-- results as `asset-images/<author>/ill-...`. The editor used to delete one
-- the moment a single saved chapter or a book's furniture stopped naming it,
-- which broke pictures that had moved (text to page, one chapter to another),
-- an undo that brought an old bake back, and books copied from this one. Now
-- the editor collects candidates while a book is open and, when it closes or a
-- chapter or book is deleted, asks scriptorium_pictures_in_use which are still
-- named anywhere; only the rest are deleted.
--
-- The check reads every account's books (a demo copy or a copied book may name
-- the author's file), so it is a definer. It answers only about the caller's
-- own `ill-` files: anything else comes back as in use, so a caller can learn
-- nothing about another account's files and can never be told to delete one.
--
-- get_player_handout also withholds a placed picture whose edit has not been
-- baked yet, the way private.strip_secret_nodes does for one in the text.

create function public.scriptorium_pictures_in_use(p_urls text[])
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_in_use text[];
begin
  if v_uid is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_urls), 0) > 500 then
    raise exception 'At most 500 pictures at a time' using errcode = '22023';
  end if;

  select coalesce(array_agg(u), '{}'::text[]) into v_in_use
    from unnest(coalesce(p_urls, '{}'::text[])) as u
   where strpos(u, '/' || v_uid::text || '/ill-') = 0
      or exists (select 1 from public.scriptorium_chapters c where strpos(c.content::text, u) > 0)
      or exists (select 1 from public.scriptorium_documents d where strpos(d.page_furniture::text, u) > 0);
  return v_in_use;
end;
$$;

revoke execute on function public.scriptorium_pictures_in_use(text[]) from public, anon;
grant execute on function public.scriptorium_pictures_in_use(text[]) to authenticated, service_role;

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
