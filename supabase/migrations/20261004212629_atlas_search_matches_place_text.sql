-- The Atlas filter finds a place by the words in its description and notes
-- without the client holding every description (#972, story 15).
--
-- The Atlas used to load every place of the campaign with `select *` (~300 KB
-- for 185 places) and filter in the browser, partly so its search box could
-- match description and note text. The list is now a slim tree; the text match
-- moves here and returns ids, which the client intersects with the tree it
-- already has. Name, tag and type matching stay client-side, where they are
-- instant.

-- Plain text of a rich-text column. `description` is Tiptap JSON stored as
-- text; a few old rows still hold HTML from before the editor switched (the
-- client's `extractTiptapText` falls back the same way). Searching the raw
-- JSON instead would match its own keys, so "text" or "paragraph" would find
-- every place.
create function private.rich_text_plain(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or p_value = '' then
    return '';
  end if;
  return coalesce(
    (select string_agg(t #>> '{}', ' ') from jsonb_path_query(p_value::jsonb, 'strict $.**.text') as t),
    ''
  );
exception when others then
  return regexp_replace(p_value, '<[^>]+>', ' ', 'g');
end;
$$;

-- SECURITY INVOKER: RLS on `locations` decides what the caller may see, and
-- the campaign filter below mirrors the Atlas list's own (`fetchAllLocations`:
-- this campaign's places plus global ones), so a hit is always a place the
-- tree already shows.
create function public.search_campaign_location_text(p_campaign_id uuid, p_query text)
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id
  from public.locations l
  where (l.campaign_id = p_campaign_id or l.campaign_id is null)
    and length(trim(p_query)) > 0
    and (
      l.notes ilike '%' || trim(p_query) || '%'
      or private.rich_text_plain(l.description) ilike '%' || trim(p_query) || '%'
    );
$$;

revoke execute on function public.search_campaign_location_text(uuid, text) from public, anon;
grant execute on function public.search_campaign_location_text(uuid, text) to authenticated, service_role;
