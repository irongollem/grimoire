-- Migration: fix_visibility_updated_at_trigger
-- Prevent updated_at from bumping when only player_visible_to changes on notes, quests, npcs, locations
-- Without this, a player who already read an entity would see the unread dot reappear
-- whenever the DM gave that entity to another player (updating player_visible_to bumped updated_at).

-- notes: bump updated_at only when actual content changes, not just visibility
drop trigger if exists notes_updated_at on notes;
create trigger notes_updated_at
  before update on notes
  for each row
  when (
    old.title                  is distinct from new.title or
    old.content                is distinct from new.content or
    old.category               is distinct from new.category or
    old.tags                   is distinct from new.tags or
    old.session_num            is distinct from new.session_num or
    old.is_pinned              is distinct from new.is_pinned or
    old.session_start_year     is distinct from new.session_start_year or
    old.session_start_month    is distinct from new.session_start_month or
    old.session_start_day      is distinct from new.session_start_day or
    old.session_end_year       is distinct from new.session_end_year or
    old.session_end_month      is distinct from new.session_end_month or
    old.session_end_day        is distinct from new.session_end_day or
    old.session_real_date      is distinct from new.session_real_date or
    old.linked_calendar_event_id is distinct from new.linked_calendar_event_id
  )
  execute procedure update_updated_at();

-- quests: bump updated_at only when actual content changes, not just visibility
drop trigger if exists quests_updated_at on quests;
create trigger quests_updated_at
  before update on quests
  for each row
  when (
    old.parent_quest_id        is distinct from new.parent_quest_id or
    old.title                  is distinct from new.title or
    old.summary                is distinct from new.summary or
    old.status                 is distinct from new.status or
    old.giver_npc_id           is distinct from new.giver_npc_id or
    old.location_id            is distinct from new.location_id or
    old.rewards                is distinct from new.rewards or
    old.reward_pp              is distinct from new.reward_pp or
    old.reward_gp              is distinct from new.reward_gp or
    old.reward_ep              is distinct from new.reward_ep or
    old.reward_sp              is distinct from new.reward_sp or
    old.reward_cp              is distinct from new.reward_cp or
    old.tags                   is distinct from new.tags or
    old.description            is distinct from new.description or
    old.notes                  is distinct from new.notes or
    old.reward_item_ids        is distinct from new.reward_item_ids or
    old.reward_currency_pools  is distinct from new.reward_currency_pools or
    old.started_at             is distinct from new.started_at or
    old.resolved_at            is distinct from new.resolved_at
  )
  execute procedure update_updated_at();

-- npcs: bump updated_at only when actual content changes, not just visibility
-- excludes player_visible_to and player_visible_fields from triggering the update
drop trigger if exists npcs_updated_at on npcs;
create trigger npcs_updated_at
  before update on npcs
  for each row
  when (
    old.name                          is distinct from new.name or
    old.race                          is distinct from new.race or
    old.alignment                     is distinct from new.alignment or
    old.age                           is distinct from new.age or
    old.occupation                    is distinct from new.occupation or
    old.location_id                   is distinct from new.location_id or
    old.appearance                    is distinct from new.appearance or
    old.personality                   is distinct from new.personality or
    old.backstory                     is distinct from new.backstory or
    old.notes                         is distinct from new.notes or
    old.status                        is distinct from new.status or
    old.relationship                  is distinct from new.relationship or
    old.portrait_url                  is distinct from new.portrait_url or
    old.portrait_focal_point          is distinct from new.portrait_focal_point or
    old.disguise_name                 is distinct from new.disguise_name or
    old.disguise_portrait_url         is distinct from new.disguise_portrait_url or
    old.disguise_portrait_focal_point is distinct from new.disguise_portrait_focal_point or
    old.is_revealed                   is distinct from new.is_revealed or
    old.tags                          is distinct from new.tags or
    old.stat_block                    is distinct from new.stat_block or
    old.linked_monster_id             is distinct from new.linked_monster_id or
    old.scriptorium_doc_id            is distinct from new.scriptorium_doc_id
  )
  execute procedure update_updated_at();

-- locations: bump updated_at only when actual content changes, not just visibility
drop trigger if exists locations_updated_at on locations;
create trigger locations_updated_at
  before update on locations
  for each row
  when (
    old.parent_id               is distinct from new.parent_id or
    old.name                    is distinct from new.name or
    old.location_type           is distinct from new.location_type or
    old.description             is distinct from new.description or
    old.notes                   is distinct from new.notes or
    old.tags                    is distinct from new.tags or
    old.image_url               is distinct from new.image_url or
    old.map_url                 is distinct from new.map_url or
    old.map_pins                is distinct from new.map_pins or
    old.is_map_shared           is distinct from new.is_map_shared or
    old.player_summary          is distinct from new.player_summary or
    old.is_description_shared   is distinct from new.is_description_shared or
    old.is_npcs_shared          is distinct from new.is_npcs_shared or
    old.is_inventory_shared     is distinct from new.is_inventory_shared or
    old.npc_owner_id            is distinct from new.npc_owner_id or
    old.related_location_ids    is distinct from new.related_location_ids or
    old.source_map_id           is distinct from new.source_map_id or
    old.is_battle_map           is distinct from new.is_battle_map or
    old.grid_calibration        is distinct from new.grid_calibration
  )
  execute procedure update_updated_at();
