-- A cover's shade replaces its on/off darkening switch (#1176 story 5).
--
-- The front cover's "Darken behind the title" (`titleScrim`, on by default)
-- becomes "Shade under the title": none, dusk or parchment (`shade`). Dusk is
-- the gradient the switch drew, so a cover with it on becomes dusk and a cover
-- with it off becomes none; nothing is drawn differently. Every stored cover
-- node is rewritten so the editor and print read `shade` alone.

create function pg_temp.cover_shade(p_node jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_attrs jsonb;
begin
  if jsonb_typeof(p_node) <> 'object' then
    return p_node;
  end if;

  if p_node ->> 'type' = 'coverPage' and jsonb_typeof(p_node -> 'attrs') = 'object' then
    v_attrs := p_node -> 'attrs';
    if not (v_attrs ? 'shade') or v_attrs ->> 'shade' not in ('none', 'dusk', 'parchment') then
      v_attrs := jsonb_set(
        v_attrs,
        '{shade}',
        to_jsonb(case when v_attrs -> 'titleScrim' = 'false'::jsonb then 'none' else 'dusk' end)
      );
    end if;
    p_node := jsonb_set(p_node, '{attrs}', v_attrs - 'titleScrim');
  end if;

  if jsonb_typeof(p_node -> 'content') = 'array' then
    p_node := jsonb_set(
      p_node,
      '{content}',
      (select coalesce(jsonb_agg(pg_temp.cover_shade(c) order by o), '[]'::jsonb)
         from jsonb_array_elements(p_node -> 'content') with ordinality as e(c, o))
    );
  end if;

  return p_node;
end;
$$;

update public.scriptorium_chapters
   set content = pg_temp.cover_shade(content)
 where content::text like '%"coverPage"%';
