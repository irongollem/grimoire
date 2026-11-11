-- A player never receives a picture's untreated original or its edit recipe (#1176 story 9).
--
-- A Scriptorium picture now keeps its edits as a recipe over the original:
-- the image node carries `src` (what readers see: the baked result), plus
-- `original` (the untouched upload), `illuminate` (the steps) and `bakedFor`
-- (which steps `src` was baked from). The original is exactly what a DM may
-- have masked or cut a secret out of, so it must never reach a player.
--
-- Every player-facing projection of rich text already passes through
-- private.strip_secret_nodes (get_player_handout, private.book_body for
-- sharing, a quest's give-handout and a notice board's take, and
-- withhold_secret_blocks for every other projection), so the strip lives
-- there: an image node keeps `src` and loses the three recipe keys, and an
-- image whose bake is still pending is withheld whole. Nothing else in the
-- function changes.

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
    return jsonb_set(p_node, '{attrs}', (p_node -> 'attrs') - 'original' - 'illuminate' - 'bakedFor');
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
