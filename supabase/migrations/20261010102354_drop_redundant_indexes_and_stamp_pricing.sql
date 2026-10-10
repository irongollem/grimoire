-- Database hygiene from the #999 table review (3.4.1, 3.4.8;
-- context/architecture/database-review.md, sections 3 and 6).
--
-- Every index below is redundant: another index on the same table answers
-- every query it could, so it only costs a write per insert, update and delete.
-- The survivor is always the one a constraint owns or the one that enforces
-- uniqueness. Checked against production's pg_index on 10 Oct 2026, not the
-- migration history.

-- A drop holds ACCESS EXCLUSIVE until commit, and one of these tables is
-- campaign_members, which every membership check in RLS reads. Waiting behind a
-- long reader would queue the whole app behind this migration, so it gives up
-- instead and the deploy can be retried.
set local lock_timeout = '5s';

-- Exact duplicates: identical columns, operator class and predicate.
drop index if exists public.app_invites_token_idx;              -- app_invites_token_key (unique constraint)
drop index if exists public.campaign_invites_token_idx;         -- campaign_invites_token_key (unique constraint)
drop index if exists public.downtime_outcomes_draw_idx;         -- downtime_outcomes_draw_id_key (unique constraint)
drop index if exists public.soundboard_broadcast_campaign_idx;  -- soundboard_broadcast_campaign_id_key (unique constraint)
drop index if exists public.location_map_regions_space_idx;     -- location_map_regions_space_uniq (same partial index, unique)

-- Covered: a unique index leads with the same columns, so a b-tree scan on the
-- leading columns uses it, including the lookups an ON DELETE CASCADE makes.
drop index if exists public.campaign_members_campaign_idx;               -- (campaign_id, user_id)
drop index if exists public.npc_pc_notes_npc_idx;                         -- (npc_id, party_member_id)
drop index if exists public.session_availability_proposal_idx;            -- (session_proposal_id, user_id)
drop index if exists public.character_classes_member_idx;                 -- (party_member_id, class_name)
drop index if exists public.store_items_location_id_idx;                  -- (location_id, item_id)
drop index if exists public.class_option_texts_campaign_class_idx;        -- (campaign_id, class_name, choice_key, option_name)
drop index if exists public.location_doors_from_idx;                      -- (from_location_id, to_location_id, label)
drop index if exists public.character_content_reviews_party_member_idx;   -- (party_member_id, kind, ref)

-- ai_model_pricing has an updated_at column that nothing ever stamped.
create trigger ai_model_pricing_updated_at
  before update on public.ai_model_pricing
  for each row execute procedure update_updated_at();
