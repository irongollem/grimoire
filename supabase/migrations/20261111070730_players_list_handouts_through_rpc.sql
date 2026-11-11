-- A player lists their handouts through a function, never from the table (#1176).
--
-- A picture placed on a page (`scriptorium_documents.page_furniture`) now keeps
-- its edit recipe beside the baked result: `props.original` (the untouched
-- upload, exactly what a DM may have masked or cut a secret out of),
-- `props.illuminate` and `props.bakedFor`. Row security cannot hide a column,
-- so while `scriptorium_documents_select` admitted a player holding a handout,
-- that player could select `page_furniture` and read the original. The handout
-- itself already reaches players only through get_player_handout, which
-- projects a placed picture's `src` alone; the list was the one direct read.
--
-- So the select policy loses its player branch, and the list a player sees
-- (what their portal shows: the list columns, nothing of the body) comes from
-- get_player_handouts. A DM previewing a player's portal may call it too.

drop policy "scriptorium_documents_select" on public.scriptorium_documents;
create policy "scriptorium_documents_select" on public.scriptorium_documents for select to public
  using (((select auth.uid()) = user_id)
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (campaign_id is null and user_id = any ((select private.dm_library_authors())::uuid[])));

create function public.get_player_handouts(p_campaign_id uuid, p_party_member_id uuid)
returns table (
  id uuid,
  title text,
  doc_type text,
  campaign_id uuid,
  kind text,
  theme text,
  updated_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- The caller is that party member's player, or a DM of the campaign previewing them.
  if not (
    coalesce(private.is_campaign_dm(p_campaign_id), false)
    or exists (
      select 1 from public.campaign_members cm
       where cm.campaign_id = p_campaign_id
         and cm.user_id = (select auth.uid())
         and cm.party_member_id = p_party_member_id
    )
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
    select d.id, d.title, d.doc_type, d.campaign_id, d.kind, d.theme, d.updated_at, d.created_at
      from public.scriptorium_documents d
     where d.campaign_id = p_campaign_id
       and p_party_member_id = any (d.player_visible_to)
     order by d.updated_at desc;
end;
$$;

revoke execute on function public.get_player_handouts(uuid, uuid) from public, anon;
grant execute on function public.get_player_handouts(uuid, uuid) to authenticated, service_role;

-- withhold_secret_blocks guards every other player projection of rich text,
-- and it skipped the strip when a value held no secret block or lens pair, so
-- an image node kept its recipe there. An image now sends the value through
-- the strip as well; nothing else in the function changes.
create or replace function private.withhold_secret_blocks(p_value text)
returns text
language plpgsql
immutable parallel safe
set search_path = ''
as $$
declare
  v_doc jsonb;
  v_out jsonb;
begin
  -- Plain text and legacy HTML predate the editor's JSON and cannot hold a
  -- secret block or a lens pair, so they pass through as they are. See
  -- 20261007092700 for why `\s` and why only an object counts.
  if p_value is null or p_value !~ '^\s*{' then
    return p_value;
  end if;

  begin
    v_doc := p_value::jsonb;
  exception when others then
    -- Fail closed: something that looks like JSON but does not parse cannot be checked.
    return null;
  end;

  if not jsonb_path_exists(
    v_doc,
    'strict $.** ? (@.type == "secretBlock" || @.type == "lensPair" || @.type == "lensBright" || @.type == "lensDeep" || @.type == "image")'
  ) then
    return p_value;
  end if;

  v_out := private.strip_secret_nodes(v_doc);

  -- Anything the strip could not reach (a node outside a `content` array) is
  -- withheld whole, as before. A surviving `lensPair` or `lensDeep` means a
  -- Deep half may still be inside.
  if v_out is null or jsonb_path_exists(
    v_out,
    'strict $.** ? (@.type == "secretBlock" || @.type == "lensPair" || @.type == "lensDeep")'
  ) then
    return null;
  end if;

  return v_out::text;
end;
$$;
