-- A recipe card shows a picture: the DM's own, or else the art of the thing it makes.
--
-- 1. crafting_recipes gains image_url + image_focal_point, the DM's custom image. Null
--    means "show the primary output's art", which the client resolves at render time,
--    so a recipe follows its item's picture when that picture changes.
--
-- 2. crafting_recipe_outputs and crafting_recipe_ingredients gain `position`. The
--    Workshop has always said "the first output is the primary result" and "the first
--    ingredient is the PRIMARY one (ruined on a critical fail)", but neither table had
--    an order: readers took whatever order the heap returned. The backfill keeps that
--    order (ctid, which is what every reader has been seeing), and from now on the
--    client writes the list index and reads `order by position`.
--
-- 3. get_craftable_output_items also returns the item's picture. A player shared a
--    recipe cannot read a DM-owned output item under RLS, which is why this projection
--    exists; the picture of a shared recipe's output is advertised exactly as its name
--    already is. The identified image, not the mundane one: the card names the item.
--    The return shape changes, so the function is dropped and recreated (create or
--    replace cannot change OUT columns); its signature, and so the
--    definer_refusal_registry entry, is unchanged.

alter table public.crafting_recipes
  add column image_url text,
  add column image_focal_point jsonb;

alter table public.crafting_recipe_outputs
  add column position integer not null default 0;

alter table public.crafting_recipe_ingredients
  add column position integer not null default 0;

update public.crafting_recipe_outputs o
   set position = ranked.pos
  from (
    select id, (row_number() over (partition by recipe_id order by ctid) - 1)::integer as pos
      from public.crafting_recipe_outputs
  ) ranked
 where ranked.id = o.id
   and o.position is distinct from ranked.pos;

update public.crafting_recipe_ingredients g
   set position = ranked.pos
  from (
    select id, (row_number() over (partition by recipe_id order by ctid) - 1)::integer as pos
      from public.crafting_recipe_ingredients
  ) ranked
 where ranked.id = g.id
   and g.position is distinct from ranked.pos;

drop function public.get_craftable_output_items(uuid);

create function public.get_craftable_output_items(p_campaign_id uuid)
  returns table (id uuid, name text, image_url text, image_focal_point jsonb)
  language sql
  security definer
  set search_path to 'public'
as $$
  with visible_recipes as (
    select r.id
    from crafting_recipes r
    where r.campaign_id = p_campaign_id
      and (
        r.user_id = (select auth.uid())
        or (
          private.is_campaign_member(r.campaign_id)
          and exists (
            select 1 from campaign_members cm
            where cm.user_id = (select auth.uid())
              and cm.campaign_id = r.campaign_id
              and cm.party_member_id = any(r.player_visible_to)
          )
        )
      )
  )
  select i.id, i.name, i.image_url, i.image_focal_point
  from items i
  where i.id in (
    select o.item_id from crafting_recipe_outputs o
      where o.recipe_id in (select v.id from visible_recipes v) and o.item_id is not null
    union
    select g.item_id from crafting_recipe_ingredients g
      where g.recipe_id in (select v.id from visible_recipes v) and g.item_id is not null
  );
$$;

comment on function public.get_craftable_output_items(uuid) is
  'id, name and picture of the vault items a recipe the caller can see produces or consumes. A shared recipe advertises both ends of itself; nothing else of the item leaves the table.';

revoke execute on function public.get_craftable_output_items(uuid) from public, anon;
grant execute on function public.get_craftable_output_items(uuid) to authenticated, service_role;
