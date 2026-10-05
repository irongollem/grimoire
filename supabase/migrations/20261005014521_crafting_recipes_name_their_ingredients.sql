-- A recipe card advertises what it makes AND what it takes. get_craftable_output_items
-- (20260711000020, #521) exposed id+name of recipe OUTPUT items only, so a player shown
-- a recipe saw its ingredients, DM-owned custom `items` rows hidden by RLS, as
-- "Unknown item" and could not tell what to gather. Same projection question, same
-- authorization: widen the function to the ingredients of the very same visible recipes.
-- The signature and return shape are unchanged, so the client's map and the
-- definer_refusal_registry entry stay valid. Only id + name leave the table.
create or replace function public.get_craftable_output_items(p_campaign_id uuid)
  returns table (id uuid, name text)
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
  select i.id, i.name
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
  'id + name of the vault items a recipe the caller can see produces or consumes. Name only: a shared recipe advertises both ends of itself.';

revoke execute on function public.get_craftable_output_items(uuid) from public, anon;
grant execute on function public.get_craftable_output_items(uuid) to authenticated, service_role;
