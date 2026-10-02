-- The demo copy leaves a file's path alone, whatever ids are in it.
--
-- A copy keeps pointing at the author's uploaded files (20260925002215), and
-- remap_demo_ids honoured that for one id only: the author's own, which it
-- rewrites where it is a value and leaves where it is a folder. Every other id
-- it rewrote wherever it appeared, on the assumption that a row's id never
-- occurs inside a path.
--
-- The music generator breaks that assumption. It stores a track at
-- `<author>/ai/<sound id>.mp3`, so the row's own id is its file name. The copy
-- gave the sound a new id and rewrote the file name to match, and the six
-- generated tracks in the Sugarwell template pointed at files that do not exist
-- in every copy ever made: "Failed to load" on a soundboard the user had not
-- touched. Uploaded tracks were unaffected, because an upload is named with a
-- random uuid that is no row's id. Found on 2 Oct 2026 by diffing every URL in
-- a copy against the template's; `sounds` was the only table affected.
--
-- So the rule is stated once, for the whole path: anything from the author's
-- folder to the end of the string is a file, and is copied verbatim. That also
-- covers a path with a row id as a folder (`<author>/<mini id>/model.glb`),
-- which no copied table holds today.

create or replace function private.remap_demo_ids(p_txt text, p_author uuid)
returns text
language plpgsql
set search_path = public, private
as $$
declare
  v_txt   text := p_txt;
  v_new   text;
  v_paths text[];
  m       record;
begin
  -- Park every path under the author's folder behind a placeholder. Longest
  -- first, so a path that is the tail of another cannot split it. chr(1) and
  -- chr(2) cannot occur in JSON text, which escapes control characters.
  select array_agg(s.p order by length(s.p) desc)
    into v_paths
    from (select distinct x[1] as p
            from regexp_matches(p_txt, p_author::text || '/[^"\\]*', 'g') x) s;
  for i in 1 .. coalesce(cardinality(v_paths), 0) loop
    v_txt := replace(v_txt, v_paths[i], chr(1) || i || chr(2));
  end loop;

  for m in
    select distinct x[1] as id
      from regexp_matches(v_txt, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g') x
  loop
    v_new := null;
    select mm.new_id::text into v_new from pg_temp.demo_map mm where mm.old_id = m.id::uuid;
    if v_new is null then
      continue;
    end if;
    if m.id::uuid = p_author then
      v_txt := replace(v_txt, '"' || m.id || '"', '"' || v_new || '"');
    else
      v_txt := replace(v_txt, m.id, v_new);
    end if;
  end loop;

  for i in 1 .. coalesce(cardinality(v_paths), 0) loop
    v_txt := replace(v_txt, chr(1) || i || chr(2), v_paths[i]);
  end loop;
  return v_txt;
end;
$$;

revoke execute on function private.remap_demo_ids(text, uuid) from public, anon, authenticated;
