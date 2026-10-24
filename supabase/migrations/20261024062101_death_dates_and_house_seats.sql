-- Two gaps the family trees (#1083) left, closed together because both widen a row a player projection returns.
--
-- 1. A death date for an NPC, on the campaign's calendar like the birth date (#1086): the year alone is enough,
--    month and day come together or not at all. With both dates a tree card reads "1428 - 1491" and the sheet can
--    say how old they were. Status "dead" still decides whether someone is dead; the date only says when.
-- 2. A House's seat: the place it rules from, shown in the house header. A plain FK, emptied when the place goes.
--
-- get_player_visible_npcs and get_player_visible_factions return setof their table positionally, so each gains the
-- new columns at the end: the death date is the DM's (as the birth date is), and the seat reaches a player only when
-- they can already see that place (the get_player_visible_locations rule, and its DM-preview twin).

alter table public.npcs
  add column died_year integer,
  add column died_month integer,
  add column died_day integer,
  add constraint npcs_died_shape check (
    (died_month is null) = (died_day is null)
    and (died_month is null or died_year is not null)
    and (died_month is null or died_month >= 1)
    and (died_day is null or died_day >= 1)
    and (died_year is null or born_year is null or died_year >= born_year)
  );

alter table public.factions
  add column seat_location_id uuid references public.locations (id) on delete set null;

create index if not exists factions_seat_location_id_idx on public.factions (seat_location_id) where seat_location_id is not null;

-- A seat stays inside the campaign, like every reference between campaign tables (#892, 20261003151455).
-- factions had no other such reference, so this is its first zz_same_campaign_refs trigger.
create trigger zz_same_campaign_refs
  before insert or update of seat_location_id, campaign_id on public.factions
  for each row execute procedure private.enforce_same_campaign_refs('seat_location_id', 'locations', 'owned');

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
    case when s.unmasked then s.unmasked_at else null end, -- unmasked_at: when the card turns
    null::integer,                                         -- born_year (#1086; DM-only, like age)
    null::integer,                                         -- born_month
    null::integer,                                         -- born_day
    null::integer,                                         -- died_year (DM-only, like the birth date)
    null::integer,                                         -- died_month
    null::integer                                          -- died_day
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


create or replace function public.get_player_visible_factions(p_campaign_id uuid, p_preview_member_id uuid default null::uuid)
returns setof factions
language sql
stable security definer
set search_path to 'public', 'private'
as $function$
  select
    f.id,
    f.user_id,
    f.name,
    f.faction_type,
    private.withhold_secret_blocks(f.description),
    f.emblem_url,
    f.alignment,
    f.tags,
    f.created_at,
    f.updated_at,
    f.player_visible_to,
    f.campaign_id,
    f.ai_provenance,
    f.setting_source,
    null::text,                          -- demo_source (#912): a quota marker, nothing for players
    f.party_standing,
    f.descent,                           -- #1083: how the house reckons its own
    ''::text,                            -- succession_note (#1083): the DM's
    case                                 -- seat_location_id: only a seat the player can already see
      when exists (
        select 1 from locations l
         where l.id = f.seat_location_id
           and (
             exists (
               select 1 from campaign_members cm
                where cm.user_id = (select auth.uid())
                  and cm.campaign_id = l.campaign_id
                  and cm.party_member_id = any (l.player_visible_to)
             )
             or (p_preview_member_id is not null and private.is_campaign_dm(l.campaign_id) and p_preview_member_id = any (l.player_visible_to))
           )
      ) then f.seat_location_id
      else null::uuid
    end
  from factions f
  where f.campaign_id = p_campaign_id
    and (
      private.faction_is_visible_to_caller(f.id)
      or (
        private.is_campaign_dm(f.campaign_id)
        and case
          when p_preview_member_id is not null then
            p_preview_member_id = any (f.player_visible_to)
            or exists (
              select 1 from faction_party_members fpm
               where fpm.faction_id = f.id
                 and fpm.party_member_id = p_preview_member_id
            )
          else
            array_length(f.player_visible_to, 1) is not null
            or exists (select 1 from faction_party_members fpm where fpm.faction_id = f.id)
        end
      )
    )
$function$;

revoke execute on function public.get_player_visible_factions(uuid, uuid) from public, anon;
grant execute on function public.get_player_visible_factions(uuid, uuid) to authenticated, service_role;
