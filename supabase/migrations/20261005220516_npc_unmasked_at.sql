-- When a disguised NPC's true self was revealed, so each player's People page
-- can turn the card over once: "you knew her as Mara Hollowell" (People ledger
-- design, 5 Oct 2026).
--
-- A player could not tell a disguise had fallen. get_player_visible_npcs shows a
-- concealed NPC under its cover and a revealed one under its true face, and
-- always answers is_revealed = false so the true state never leaks; the moment
-- of the reveal, and the cover the party had known, were nowhere.
--
-- `unmasked_at` is set when is_revealed goes false -> true and cleared when the
-- DM puts the disguise back on, so a second reveal turns the card again. An NPC
-- created already revealed, or revealed before this migration, has none: there
-- is no moment to replay. The projection hands it, and the cover identity, only
-- for an NPC that is no longer concealed: the cover is exactly what the party
-- was shown before, so nothing new about the NPC leaves the DM.

alter table public.npcs add column unmasked_at timestamptz;

create function public.stamp_npc_unmasked_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.is_revealed and not old.is_revealed then
    new.unmasked_at := now();
  elsif not new.is_revealed then
    new.unmasked_at := null;
  end if;
  return new;
end;
$$;

create trigger npcs_stamp_unmasked_at
  before update of is_revealed on public.npcs
  for each row execute procedure public.stamp_npc_unmasked_at();

revoke execute on function public.stamp_npc_unmasked_at() from public, anon, authenticated;

-- The projection, with the new column last as the table now has it. Unchanged
-- except the three cover columns and unmasked_at, which a player now receives
-- for an unmasked NPC (each still gated on its own visible field).
create or replace function public.get_player_visible_npcs(p_campaign_id uuid default null::uuid, p_location_ids uuid[] default null::uuid[], p_preview_member_id uuid default null::uuid)
 returns setof npcs
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
    -- The cover the party knew, only once it has fallen (unmasked_at set).
    case when s.unmasked and 'name' = any (s.player_visible_fields) then s.disguise_name else null end,
    case when s.unmasked and 'portrait' = any (s.player_visible_fields) then s.disguise_portrait_url else null end,
    case when s.unmasked and 'portrait' = any (s.player_visible_fields) then s.disguise_portrait_focal_point else null end,
    false,                                                 -- is_revealed (cover shown; never leak true state)
    s.ai_provenance,
    null::text,                                            -- demo_source (#912): a quota marker, nothing for players
    case                                                   -- cutout_url (#917): the true form, so never for a concealed NPC
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed then null
      else s.cutout_url
    end,
    case when s.unmasked then s.unmasked_at else null end  -- unmasked_at: when the card turns
  from (
    select n.*,
      ((n.disguise_name is not null or n.disguise_portrait_url is not null)
        and not n.is_revealed) as concealed,
      (n.is_revealed and n.unmasked_at is not null
        and (n.disguise_name is not null or n.disguise_portrait_url is not null)) as unmasked
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

revoke execute on function public.get_player_visible_npcs(uuid, uuid[], uuid) from public, anon;
grant execute on function public.get_player_visible_npcs(uuid, uuid[], uuid) to authenticated, service_role;
