-- Migration: lens_pair_deep_withheld_from_players
-- A lens pair's Deep half never reaches a player (#1115).
--
-- The lens pair (`lensPair`, holding one `lensBright` then one `lensDeep`) is
-- one passage read at two levels: Bright for a child at the table, Deep for an
-- adult. The Deep half is the DM's alone, everywhere (Jeffrey, 27 Oct 2026); a
-- DM who wants a player to read a Deep line shares it in another block on
-- purpose. Like the secret block (20261007092700), it is withheld by the server,
-- not hidden by the client: a Deep reading the client never receives cannot be
-- read from devtools, a downloaded JSON or a realtime payload.
--
-- The rule rides on the secret-block stripper rather than a stripper of its
-- own, so every projection that already withholds secret blocks (locations,
-- items, puzzles, notes, factions) withholds Deep halves too, and a future
-- projection that calls the one function gets both. For a player the pair is
-- replaced by its Bright half's blocks, unwrapped, which is what the client's
-- player view renders (viewerRender.ts): a Bright-lens table never learns a
-- Deep reading existed. A stray `lensDeep` outside a pair is dropped like a
-- secret block, and a stray `lensBright` is unwrapped.
--
-- The editor offers the pair only where this strip runs or where players never
-- read the field at all (an NPC's lore): `allowSecrets || allowLensPairs` in
-- RichTextEditor.vue. A quest beat's summary and reveal text reach players
-- unstripped, so they do not offer it.

create or replace function private.strip_secret_nodes(p_node jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_content jsonb;
begin
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
immutable
parallel safe
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
    'strict $.** ? (@.type == "secretBlock" || @.type == "lensPair" || @.type == "lensBright" || @.type == "lensDeep")'
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

revoke execute on function private.strip_secret_nodes(jsonb) from public, anon, authenticated;
revoke execute on function private.withhold_secret_blocks(text) from public, anon, authenticated;
