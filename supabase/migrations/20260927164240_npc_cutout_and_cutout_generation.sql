-- NPC cutouts, and generating a cutout with AI (#917 stories 4 and 5).
--
-- 1. npcs.cutout_url: the NPC's true form on a transparent background, beside
--    portrait_url, exactly as monsters.cutout_url (20260927065654). One cutout,
--    of the true form: a disguise keeps its own picture and needs no cutout of
--    its own, because a book prints the NPC as it really is.
--
-- 2. get_player_visible_npcs returns `setof npcs` with a positional column
--    list, so the new column is appended to it in the same position (the
--    player projection trap 20260927080501 fixed for monsters). It follows the
--    portrait's own visibility, and a concealed NPC's cutout is withheld
--    outright: players see the disguise portrait, and the true form's cutout
--    beside it would give the disguise away.
--
-- 3. The price of generating a cutout from an existing picture. One image-edit
--    call at the same size as an entity image, so the same 50 credits; the
--    edge function applies the provider and size multipliers as usual.

alter table public.npcs add column cutout_url text;

comment on column public.npcs.cutout_url is
  'The NPC''s true form on a transparent background, preferred in Scriptorium books and on tokens (#917). portrait_url stays the picture every other surface shows.';

insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
values ('entity_cutout', 'Cutout (AI)', 50, 16)
on conflict (generation_type) do nothing;

CREATE OR REPLACE FUNCTION public.get_player_visible_npcs(p_campaign_id uuid DEFAULT NULL::uuid, p_location_ids uuid[] DEFAULT NULL::uuid[], p_preview_member_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF npcs
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    s.id,
    s.user_id,
    case
      when not ('name' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_name is not null then s.disguise_name
      else s.name
    end,
    case when 'race' = any (s.player_visible_fields) then s.race else null end,
    null::text,                                            -- alignment (DM-only)
    null::text,                                            -- age (DM-only)
    case when 'occupation' = any (s.player_visible_fields) then s.occupation else null end,
    null::text,                                            -- appearance (DM-only)
    null::text,                                            -- personality (DM-only)
    null::text,                                            -- backstory (DM-only)
    null::text,                                            -- notes (DM-only)
    s.status,
    s.relationship,
    case
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_url
      else s.portrait_url
    end,
    null::text[],                                          -- tags (DM-only; no player toggle)
    null::jsonb,                                           -- stat_block (DM-only)
    null::uuid,                                            -- scriptorium_doc_id (DM-only)
    s.created_at,
    s.updated_at,
    s.campaign_id,
    case when 'location' = any (s.player_visible_fields) then s.location_id else null::uuid end,
    s.player_visible_fields,
    case
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_focal_point
      else s.portrait_focal_point
    end,
    null::uuid,                                            -- linked_monster_id (DM-only)
    s.relevance,
    s.player_visible_to,
    null::text,                                            -- disguise_name (stripped)
    null::text,                                            -- disguise_portrait_url (stripped)
    null::jsonb,                                           -- disguise_portrait_focal_point (stripped)
    false,                                                 -- is_revealed (cover shown; never leak true state)
    s.ai_provenance,
    null::text,                                            -- demo_source (#912): a quota marker, nothing for players
    case                                                   -- cutout_url (#917): the true form, so never for a concealed NPC
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed then null
      else s.cutout_url
    end
  from (
    select n.*,
      ((n.disguise_name is not null or n.disguise_portrait_url is not null)
        and not n.is_revealed) as concealed
    from npcs n
    where (p_campaign_id is null or n.campaign_id = p_campaign_id)
      and (p_location_ids is null or n.location_id = any (p_location_ids))
      and (
        -- (a) individually shared with the caller
        exists (
          select 1 from campaign_members cm
          where cm.user_id = (select auth.uid())
            and cm.campaign_id = n.campaign_id
            and cm.party_member_id = any (n.player_visible_to)
        )
        -- (b) shared via the NPC's OWN location ("Share linked NPCs" on that
        --     location, shared with the caller) — direct location only.
        or exists (
          select 1 from locations l
          join campaign_members cm
            on cm.user_id = (select auth.uid()) and cm.campaign_id = l.campaign_id
          where l.id = n.location_id
            and l.is_npcs_shared
            and cm.party_member_id = any (l.player_visible_to)
        )
        -- (c) DM preview: the campaign DM sees exactly what the previewed member
        --     would see (individually shared, or location-shared to that member);
        --     with no member chosen, anything shared with at least one member.
        or (
          private.is_campaign_dm(n.campaign_id)
          and (
            (p_preview_member_id is not null and (
              p_preview_member_id = any (n.player_visible_to)
              or exists (
                select 1 from locations l
                where l.id = n.location_id
                  and l.is_npcs_shared
                  and p_preview_member_id = any (l.player_visible_to)
              )
            ))
            or (p_preview_member_id is null and (
              array_length(n.player_visible_to, 1) is not null
              or exists (
                select 1 from locations l
                where l.id = n.location_id
                  and l.is_npcs_shared
                  and array_length(l.player_visible_to, 1) is not null
              )
            ))
          )
        )
      )
  ) s;
$function$;
