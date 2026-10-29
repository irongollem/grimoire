-- Migration: handouts_share_deities_and_factions
-- A handout that embeds a deity or a faction shares it (#1115 story 7).
--
-- Scriptorium's live entity embed gains four kinds: deity, species, faction and
-- subclass. Sharing a handout already shares the places, NPCs, quests and
-- monsters it embeds with the players who receive it; a deity or faction it
-- embeds was skipped, so the player opened a page with a blank where the
-- entry should be. Both are now shared the way a place is: the recipients join
-- `player_visible_to`, unless the DM switched that embed's reveal off, and the
-- share dialog lists them. Species and subclasses are rules text that a
-- campaign's players can already read, like a spell: sharing reveals nothing.
--
-- The function is otherwise unchanged from 20261015234112_notice_boards.sql.
-- It stays SECURITY INVOKER: its callers (share_handout, the quest Advance and
-- the notice board) run as the DM, whose own RLS already bounds every update.

create or replace function private.apply_handout_reveals(
  p_campaign_id uuid,
  p_content text,
  p_members uuid[],
  p_dry_run boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_doc jsonb;
  v_attrs jsonb;
  v_reveal jsonb;
  v_type text;
  v_uuid uuid;
  v_off boolean;
  v_fields text[];
  v_new_fields text[];
  v_new_to uuid[];
  v_owner uuid;
  v_name text;
  v_flag boolean;
  v_revealed jsonb := '[]'::jsonb;
  v_withheld jsonb := '[]'::jsonb;
  r_npc record;
  r_loc record;
  r_quest record;
  r_disc record;
  r_shared record;
begin
  if p_members is null or cardinality(p_members) = 0 then
    return jsonb_build_object('revealed', v_revealed, 'withheld', v_withheld);
  end if;

  v_doc := coalesce(nullif(p_content, '')::jsonb, '{}'::jsonb);
  select c.user_id into v_owner from public.campaigns c where c.id = p_campaign_id;

  -- Document order, each embed node once (the result is collapsed to one line
  -- per entity after the loop): the share dialog lists what it reveals in the
  -- order the DM reads it on the page.
  for v_attrs in
    select t.attrs
      from (select e -> 'attrs' as attrs, min(ord) as first_at
              from jsonb_path_query(v_doc, 'strict $.**') with ordinality as q(e, ord)
             where jsonb_typeof(e) = 'object' and e ->> 'type' = 'entityEmbed'
             group by e -> 'attrs') t
     order by t.first_at
  loop
    v_type := v_attrs ->> 'entityType';
    v_reveal := case when jsonb_typeof(v_attrs -> 'reveal') = 'object' then v_attrs -> 'reveal' end;
    -- jsonb comparisons, never ::boolean casts: a malformed value in the
    -- document must reveal less, not abort a quest's Advance mid-transition.
    v_off := v_reveal -> 'off' = 'true'::jsonb;
    v_off := coalesce(v_off, false);
    -- A library monster's id is text; anything else is a uuid or nothing.
    -- (private.try_uuid exists but is closed to clients, and this runs as one.)
    begin
      v_uuid := (v_attrs ->> 'entityId')::uuid;
    exception when invalid_text_representation then
      v_uuid := null;
    end;

    -- ── npc: who (player_visible_to) and what (player_visible_fields) ──
    if v_type = 'npc' then
      select n.id, n.name, n.player_visible_to, n.player_visible_fields, n.disguise_name, n.is_revealed
        into r_npc
        from public.npcs n
       where n.id = v_uuid and n.campaign_id = p_campaign_id;
      if not found then
        v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'reason', 'outside_campaign');
        continue;
      end if;
      if v_reveal ? 'fields' and jsonb_typeof(v_reveal -> 'fields') = 'array' then
        select coalesce(array_agg(f), '{}') into v_fields
          from jsonb_array_elements_text(v_reveal -> 'fields') f
         where f in ('name', 'portrait', 'race', 'occupation', 'location');
      else
        v_fields := array['name']
          || case when v_attrs -> 'showArt' is distinct from 'false'::jsonb then array['portrait'] else '{}'::text[] end;
      end if;

      -- No fields is no reveal (effectiveEmbedReveal says the same): sharing
      -- an NPC with nothing of it visible would only add an invisible entry.
      if v_off or cardinality(v_fields) = 0 then
        if not (r_npc.player_visible_to @> p_members) then
          v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', r_npc.id, 'name', r_npc.name, 'reason', 'not_revealed');
        end if;
        continue;
      end if;

      v_new_fields := array(select distinct x from unnest(r_npc.player_visible_fields || v_fields) x order by 1);
      v_new_to := array(select distinct x from unnest(r_npc.player_visible_to || p_members) x);

      if not (r_npc.player_visible_fields @> v_fields and r_npc.player_visible_to @> p_members) then
        v_revealed := v_revealed || jsonb_build_object(
          'type', v_type, 'id', r_npc.id, 'name', r_npc.name, 'fields', to_jsonb(v_fields),
          -- A disguised NPC is revealed as its cover: the projection shows the
          -- disguise until the DM unmasks it, so say so before the DM confirms.
          'seen_as', case when r_npc.disguise_name is not null and not r_npc.is_revealed then r_npc.disguise_name end);
        if not p_dry_run then
          update public.npcs
             set player_visible_to = v_new_to, player_visible_fields = v_new_fields
           where id = r_npc.id;
        end if;
      end if;

    -- ── location: shared, and optionally its description ──
    elsif v_type = 'location' then
      select l.id, l.name, l.player_visible_to, l.is_description_shared
        into r_loc
        from public.locations l
       where l.id = v_uuid and l.campaign_id = p_campaign_id;
      if not found then
        v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'reason', 'outside_campaign');
        continue;
      end if;
      if v_off then
        if not (r_loc.player_visible_to @> p_members) then
          v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', r_loc.id, 'name', r_loc.name, 'reason', 'not_revealed');
        end if;
        continue;
      end if;
      v_flag := coalesce(v_reveal -> 'description' = 'true'::jsonb, false);
      if not (r_loc.player_visible_to @> p_members) or (v_flag and not r_loc.is_description_shared) then
        v_revealed := v_revealed || jsonb_build_object(
          'type', v_type, 'id', r_loc.id, 'name', r_loc.name, 'description', v_flag);
        if not p_dry_run then
          update public.locations
             set player_visible_to = array(select distinct x from unnest(player_visible_to || p_members) x),
                 is_description_shared = is_description_shared or v_flag
           where id = r_loc.id;
        end if;
      end if;

    -- ── quest: a handout can start one ──
    -- What unlock_quest does (undiscovered -> active, a hidden entry beat
    -- becomes its rumour), plus the recipients, which unlock_quest alone never
    -- adds: a quest nobody may see is not one the party has heard of.
    elsif v_type = 'quest' then
      select q.id, q.title, q.status, q.player_visible_to, q.entry_beat_id
        into r_quest
        from public.quests q
       where q.id = v_uuid and q.campaign_id = p_campaign_id;
      if not found then
        v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'reason', 'outside_campaign');
        continue;
      end if;
      if v_off then
        if not (r_quest.player_visible_to @> p_members) then
          v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', r_quest.id, 'name', r_quest.title, 'reason', 'not_revealed');
        end if;
        continue;
      end if;
      if not (r_quest.player_visible_to @> p_members) or r_quest.status = 'undiscovered' then
        v_revealed := v_revealed || jsonb_build_object(
          'type', v_type, 'id', r_quest.id, 'name', r_quest.title,
          'starts', r_quest.status = 'undiscovered');
        if not p_dry_run then
          perform private.reveal_quest_to(p_campaign_id, r_quest.id, p_members);
        end if;
      end if;

    -- ── monster: discovered, optionally with its stats ──
    elsif v_type = 'monster' then
      if v_uuid is not null then
        select m.name into v_name
          from public.monsters m
         where m.id = v_uuid
           and (m.campaign_id = p_campaign_id or (m.campaign_id is null and m.user_id = v_owner));
      else
        select lm.name into v_name from public.library_monsters lm where lm.id = v_attrs ->> 'entityId';
      end if;
      if v_name is null then
        v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'reason', 'outside_campaign');
        continue;
      end if;

      select d.id, d.visible_to, d.reveal_stats into r_disc
        from public.discovered_monsters d
       where d.campaign_id = p_campaign_id
         and (case when v_uuid is not null then d.monster_id = v_uuid
                   else d.library_monster_id = v_attrs ->> 'entityId' end);

      if v_off then
        if r_disc.id is null or not (r_disc.visible_to is null or r_disc.visible_to @> p_members) then
          v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'name', v_name, 'reason', 'not_revealed');
        end if;
        continue;
      end if;

      v_flag := coalesce(v_reveal -> 'stats' = 'true'::jsonb, false);
      -- visible_to null means the whole table already knows it.
      if r_disc.id is null
         or not (r_disc.visible_to is null or r_disc.visible_to @> p_members)
         or (v_flag and not r_disc.reveal_stats) then
        v_revealed := v_revealed || jsonb_build_object(
          'type', v_type, 'id', v_attrs ->> 'entityId', 'name', v_name, 'stats', v_flag);
        if not p_dry_run then
          if r_disc.id is null then
            insert into public.discovered_monsters (campaign_id, monster_id, library_monster_id, visible_to, reveal_stats)
            values (p_campaign_id, v_uuid,
                    case when v_uuid is null then v_attrs ->> 'entityId' end,
                    p_members, v_flag);
          else
            update public.discovered_monsters
               set visible_to = case when visible_to is null then null
                                     else array(select distinct x from unnest(visible_to || p_members) x) end,
                   reveal_stats = reveal_stats or v_flag
             where id = r_disc.id;
          end if;
        end if;
      end if;

    -- ── deity, faction: shared with the recipients, as a place is ──
    -- No sub-options: a player reads a shared deity's row directly and a shared
    -- faction through get_player_visible_factions, both keyed on
    -- player_visible_to alone. A faction row may have no campaign; one outside
    -- this campaign is never touched.
    elsif v_type in ('deity', 'faction') then
      if v_type = 'deity' then
        select d.id, d.name, d.player_visible_to into r_shared
          from public.deities d
         where d.id = v_uuid and d.campaign_id = p_campaign_id;
      else
        select f.id, f.name, f.player_visible_to into r_shared
          from public.factions f
         where f.id = v_uuid and f.campaign_id = p_campaign_id;
      end if;
      if not found then
        v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'reason', 'outside_campaign');
        continue;
      end if;
      if r_shared.player_visible_to @> p_members then
        continue;
      end if;
      if v_off then
        v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', r_shared.id, 'name', r_shared.name, 'reason', 'not_revealed');
        continue;
      end if;
      v_revealed := v_revealed || jsonb_build_object('type', v_type, 'id', r_shared.id, 'name', r_shared.name);
      if not p_dry_run then
        if v_type = 'deity' then
          update public.deities
             set player_visible_to = array(select distinct x from unnest(player_visible_to || p_members) x)
           where id = r_shared.id;
        else
          update public.factions
             set player_visible_to = array(select distinct x from unnest(player_visible_to || p_members) x)
           where id = r_shared.id;
        end if;
      end if;

    -- ── item: never revealed by paper; the party sees it once it has it ──
    elsif v_type = 'item' then
      select i.name into v_name from public.items i where i.id = v_uuid;
      v_withheld := v_withheld || jsonb_build_object(
        'type', v_type, 'id', v_attrs ->> 'entityId', 'name', v_name, 'reason', 'found_only');
    end if;
    -- spell, species, subclass: rules text a campaign's players can already
    -- read; nothing to reveal.
  end loop;

  -- One line per entity. The loop above runs once per embed node (each has its
  -- own blockId in attrs), so an NPC linked twice would otherwise be listed
  -- twice: duplicate rows in the share dialog and a doubled pending count.
  -- An entity some other embed of it reveals is not also "withheld".
  v_revealed := (
    select coalesce(jsonb_agg(s.x order by s.o), '[]'::jsonb)
      from (select distinct on (t.x ->> 'type', t.x ->> 'id') t.x, t.o
              from jsonb_array_elements(v_revealed) with ordinality t(x, o)
             order by t.x ->> 'type', t.x ->> 'id', t.o) s);
  v_withheld := (
    select coalesce(jsonb_agg(s.x order by s.o), '[]'::jsonb)
      from (select distinct on (t.x ->> 'type', t.x ->> 'id') t.x, t.o
              from jsonb_array_elements(v_withheld) with ordinality t(x, o)
             where not exists (
               select 1 from jsonb_array_elements(v_revealed) r
                where r ->> 'type' = t.x ->> 'type' and r ->> 'id' = t.x ->> 'id')
             order by t.x ->> 'type', t.x ->> 'id', t.o) s);

  return jsonb_build_object('revealed', v_revealed, 'withheld', v_withheld);
end;
$$;
