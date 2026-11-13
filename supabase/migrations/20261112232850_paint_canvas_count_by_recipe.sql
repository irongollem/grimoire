-- The free plan's canvas count reads recipes, not text (#1181, replaces the count in 20261112184945).
--
-- The first count matched the text `"type": "paint"` in two forms: unescaped in chapters and escaped in page
-- furniture, on the belief that a chapter keeps a recipe as an object and page art as JSON text. Both forms occur
-- in both places: page art written by the Illuminator holds its recipe as an object, and moving a picture between
-- the text and the page copies the value as it is. A canvas in the other form went uncounted, so a free account
-- could paint one picture, move it, and start another, as often as it liked; and a text box whose prose happened to
-- read `"type": "paint"` was counted as a canvas.
--
-- So the count now finds every `illuminate` value where a recipe lives (an image node's attrs anywhere in a
-- chapter, an art item's props in page furniture), reads it as a recipe whether it is an object or JSON text, and
-- counts its `paint` steps. Prose cannot make an `illuminate` key, so typed text never counts. The `like` prefilter
-- stays, so a chapter that never mentions paint is not walked at all.

create or replace function private.recipe_paint_count(p_recipe jsonb)
 returns int
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare
  v_recipe jsonb := p_recipe;
begin
  if v_recipe is null then
    return 0;
  end if;
  if jsonb_typeof(v_recipe) = 'string' then
    begin
      v_recipe := (v_recipe #>> '{}')::jsonb;
    exception when others then
      -- Text that is not JSON is not a recipe.
      return 0;
    end;
  end if;
  if jsonb_typeof(v_recipe) <> 'object' or jsonb_typeof(v_recipe -> 'steps') is distinct from 'array' then
    return 0;
  end if;
  return (select count(*) from jsonb_array_elements(v_recipe -> 'steps') as s(step) where s.step ->> 'type' = 'paint')::int;
end;
$function$;

revoke execute on function private.recipe_paint_count(jsonb) from public, anon, authenticated;

create or replace function private.count_paint_canvases(p_user uuid)
 returns int
 language sql
 stable
 set search_path to ''
as $function$
  select (
    -- Chapters: every image node's recipe, wherever it sits in the document.
    coalesce((select sum(private.recipe_paint_count(r.recipe))
       from public.scriptorium_chapters c
       join public.scriptorium_documents d on d.id = c.document_id,
            jsonb_path_query(c.content, 'strict $.**.illuminate') as r(recipe)
      where d.user_id = p_user and d.demo_source is null
        and c.content::text like '%paint%'), 0)
    -- Page art: each furniture item's recipe.
  + coalesce((select sum(private.recipe_paint_count(f.item -> 'props' -> 'illuminate'))
       from public.scriptorium_documents d,
            jsonb_array_elements(case when jsonb_typeof(d.page_furniture) = 'array'
                                      then d.page_furniture else '[]'::jsonb end) as f(item)
      where d.user_id = p_user and d.demo_source is null
        and d.page_furniture::text like '%paint%'), 0)
  )::int;
$function$;

revoke execute on function private.count_paint_canvases(uuid) from public, anon, authenticated;
