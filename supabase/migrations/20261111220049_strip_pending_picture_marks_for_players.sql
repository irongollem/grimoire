-- A picture being painted for the DM ("Describe it", #1176) carries the job it
-- waits on: `pendingJob` and `pendingShape` on the image node, so a reload can
-- pick the wait up again. They are the DM's working marks, like a recipe, so a
-- player's copy drops them the same way it drops `original`, `illuminate` and
-- `bakedFor`. Both functions are otherwise unchanged from 20261111021210 and
-- 20261111070730.

create or replace function private.strip_secret_nodes(p_node jsonb)
returns jsonb
language plpgsql
immutable parallel safe
set search_path = ''
as $$
declare
  v_content jsonb;
begin
  -- A picture's recipe is the DM's: players read the baked `src` only. While
  -- an edit's bake is pending (a recipe, no `bakedFor`: every recipe edit
  -- clears it), `src` is still the original or an older bake, which may show
  -- exactly what the edit hides, so the picture is withheld until it lands.
  if jsonb_typeof(p_node) = 'object'
     and p_node ->> 'type' = 'image'
     and jsonb_typeof(p_node -> 'attrs') = 'object' then
    if jsonb_typeof(p_node -> 'attrs' -> 'illuminate') in ('object', 'string')
       and coalesce(p_node -> 'attrs' ->> 'bakedFor', '') = '' then
      return null;
    end if;
    -- No early return: a hand-written image with children of its own is walked like any node.
    p_node := jsonb_set(p_node, '{attrs}', (p_node -> 'attrs') - 'original' - 'illuminate' - 'bakedFor' - 'pendingJob' - 'pendingShape');
  end if;

  if jsonb_typeof(p_node) <> 'object'
     or jsonb_typeof(p_node -> 'content') is distinct from 'array' then
    return p_node;
  end if;

  -- Each child expands to zero or more replacement nodes (a lens pair to its
  -- Bright half's blocks), then each replacement is stripped in turn. The two
  -- ordinals keep the replacements in document order.
  select coalesce(jsonb_agg(s.kept order by s.ord, s.sub), '[]'::jsonb)
    into v_content
    from (
      select private.strip_secret_nodes(r.node) as kept, e.ord, r.sub
        from jsonb_array_elements(p_node -> 'content') with ordinality as e(child, ord)
        cross join lateral jsonb_array_elements(
          case
            when jsonb_typeof(e.child) <> 'object' then jsonb_build_array(e.child)
            when e.child ->> 'type' in ('secretBlock', 'lensDeep') then '[]'::jsonb
            when e.child ->> 'type' = 'lensBright' then
              case when jsonb_typeof(e.child -> 'content') = 'array' then e.child -> 'content' else '[]'::jsonb end
            when e.child ->> 'type' = 'lensPair' then coalesce((
              select jsonb_agg(b.node order by h.hord, b.bord)
                from jsonb_array_elements(
                       case when jsonb_typeof(e.child -> 'content') = 'array' then e.child -> 'content' else '[]'::jsonb end
                     ) with ordinality as h(half, hord)
                cross join lateral jsonb_array_elements(
                  case
                    when jsonb_typeof(h.half) = 'object'
                     and h.half ->> 'type' = 'lensBright'
                     and jsonb_typeof(h.half -> 'content') = 'array'
                    then h.half -> 'content'
                    else '[]'::jsonb
                  end
                ) with ordinality as b(node, bord)
            ), '[]'::jsonb)
            else jsonb_build_array(e.child)
          end
        ) with ordinality as r(node, sub)
       -- A Bright half's blocks are children now, so they pass the same filter
       -- a direct child does: a secret block inside the Bright half goes too.
       -- (A pair nested inside a Bright half survives as a pair, and the check
       -- in withhold_secret_blocks then withholds the value whole. The editor
       -- refuses to nest one, so that is the fail-closed edge, not a path.)
       where not (jsonb_typeof(r.node) = 'object' and r.node ->> 'type' in ('secretBlock', 'lensDeep'))
    ) s
   where s.kept is not null;

  if jsonb_array_length(p_node -> 'content') > 0 and jsonb_array_length(v_content) = 0 then
    if p_node ->> 'type' in ('doc', 'tableCell', 'tableHeader') then
      return jsonb_set(p_node, '{content}', '[{"type":"paragraph"}]'::jsonb);
    end if;
    return null;
  end if;

  return jsonb_set(p_node, '{content}', v_content);
end;
$$;

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
    'strict $.** ? (@.type == "secretBlock" || @.type == "lensPair" || @.type == "lensBright" || @.type == "lensDeep" || (@.type == "image" && (exists(@.attrs.original) || exists(@.attrs.illuminate) || exists(@.attrs.bakedFor) || exists(@.attrs.pendingJob) || exists(@.attrs.pendingShape))))'
  ) then
    return p_value;
  end if;

  v_out := private.strip_secret_nodes(v_doc);

  -- Anything the strip could not reach (a node outside a `content` array) is
  -- withheld whole, as before. A surviving `lensPair` or `lensDeep` means a
  -- Deep half may still be inside, and a surviving picture recipe an original.
  if v_out is null or jsonb_path_exists(
    v_out,
    'strict $.** ? (@.type == "secretBlock" || @.type == "lensPair" || @.type == "lensDeep" || (@.type == "image" && (exists(@.attrs.original) || exists(@.attrs.illuminate) || exists(@.attrs.bakedFor) || exists(@.attrs.pendingJob) || exists(@.attrs.pendingShape))))'
  ) then
    return null;
  end if;

  return v_out::text;
end;
$$;
