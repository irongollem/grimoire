-- Migration: schema_audit_indexes_rls_replica_identity
-- Schema audit (#580) cheap fixes: index the last unindexed FKs, stop RLS
-- policies re-evaluating auth.uid() per row, drop pointless REPLICA IDENTITY
-- FULL, and align account-deletion cascades with the established pattern.

-- ---------------------------------------------------------------------------
-- 1. Missing foreign-key indexes
-- ---------------------------------------------------------------------------
-- Postgres does not index FK columns automatically. Every one of these is
-- either an RLS predicate column (user_id / campaign_id) or a parent-delete
-- lookup, so an unindexed one is a seq scan per row checked.

create index if not exists abuse_guard_trips_user_id_idx
  on abuse_guard_trips (user_id);
create index if not exists class_option_texts_user_id_idx
  on class_option_texts (user_id);
create index if not exists downtime_grants_granted_by_idx
  on downtime_grants (granted_by);
create index if not exists encounter_state_player_updates_campaign_id_idx
  on encounter_state_player_updates (campaign_id);
create index if not exists encounter_state_player_updates_encounter_id_idx
  on encounter_state_player_updates (encounter_id);
create index if not exists npc_sets_user_id_idx
  on npc_sets (user_id);
create index if not exists soundboard_broadcast_sound_id_idx
  on soundboard_broadcast (sound_id);
create index if not exists soundboard_broadcast_user_id_idx
  on soundboard_broadcast (user_id);
create index if not exists spell_change_windows_source_class_id_idx
  on spell_change_windows (source_class_id);

-- ---------------------------------------------------------------------------
-- 2. RLS initplan: wrap auth.uid() so it is evaluated once, not per row
-- ---------------------------------------------------------------------------
-- A bare auth.uid() inside a policy is re-executed for every candidate row.
-- `(select auth.uid())` makes the planner hoist it into an InitPlan. The
-- predicates below are otherwise byte-for-byte identical — no change to what
-- any policy permits. `private.*` helpers are already STABLE and hoist fine.

drop policy if exists ai_generation_jobs_select_own on ai_generation_jobs;
create policy ai_generation_jobs_select_own on ai_generation_jobs
  for select using ((select auth.uid()) = user_id);

drop policy if exists class_feature_options_select on class_feature_options;
create policy class_feature_options_select on class_feature_options
  for select using (
    (select auth.uid()) = user_id or private.is_dm_of_my_campaigns(user_id)
  );

drop policy if exists class_feature_options_insert on class_feature_options;
create policy class_feature_options_insert on class_feature_options
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists class_feature_options_update on class_feature_options;
create policy class_feature_options_update on class_feature_options
  for update using ((select auth.uid()) = user_id);

drop policy if exists class_feature_options_delete on class_feature_options;
create policy class_feature_options_delete on class_feature_options
  for delete using ((select auth.uid()) = user_id);

drop policy if exists class_option_texts_insert on class_option_texts;
create policy class_option_texts_insert on class_option_texts
  for insert with check (
    (select auth.uid()) = user_id and private.is_campaign_member(campaign_id)
  );

drop policy if exists companions_insert on companions;
create policy companions_insert on companions
  for insert with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_member(campaign_id))
  );

drop policy if exists companions_update on companions;
create policy companions_update on companions
  for update using (
    (select auth.uid()) = user_id
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (
      campaign_id is not null
      and owner_party_member_id is not null
      and owner_party_member_id = private.my_party_member_id(campaign_id)
    )
  );

drop policy if exists companions_delete on companions;
create policy companions_delete on companions
  for delete using (
    (select auth.uid()) = user_id
    or (campaign_id is not null and private.is_campaign_dm(campaign_id))
    or (
      campaign_id is not null
      and owner_party_member_id is not null
      and owner_party_member_id = private.my_party_member_id(campaign_id)
    )
  );

drop policy if exists feature_interest_select on feature_interest;
create policy feature_interest_select on feature_interest
  for select using ((select auth.uid()) = user_id or private.is_app_admin());

drop policy if exists feature_interest_insert on feature_interest;
create policy feature_interest_insert on feature_interest
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists feature_interest_delete on feature_interest;
create policy feature_interest_delete on feature_interest
  for delete using ((select auth.uid()) = user_id);

drop policy if exists npc_sets_select on npc_sets;
create policy npc_sets_select on npc_sets
  for select using ((select auth.uid()) = user_id);

drop policy if exists npc_sets_insert on npc_sets;
create policy npc_sets_insert on npc_sets
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists npc_sets_update on npc_sets;
create policy npc_sets_update on npc_sets
  for update using ((select auth.uid()) = user_id);

drop policy if exists npc_sets_delete on npc_sets;
create policy npc_sets_delete on npc_sets
  for delete using ((select auth.uid()) = user_id);

drop policy if exists purchase_consents_select on purchase_consents;
create policy purchase_consents_select on purchase_consents
  for select using ((select auth.uid()) = user_id or private.is_app_admin());

drop policy if exists ruleset_reviews_select on ruleset_reviews;
create policy ruleset_reviews_select on ruleset_reviews
  for select using (
    exists (
      select 1 from party_members pm
      where pm.id = ruleset_reviews.party_member_id
        and (
          pm.user_id = (select auth.uid())
          or pm.owner_user_id = (select auth.uid())
          or private.is_campaign_dm(pm.campaign_id)
        )
    )
  );

drop policy if exists simulacrum_config_select on simulacrum_config;
create policy simulacrum_config_select on simulacrum_config
  for select using ((select auth.uid()) is not null);

drop policy if exists spell_change_windows_read on spell_change_windows;
create policy spell_change_windows_read on spell_change_windows
  for select using (
    exists (
      select 1 from party_members pm
      where pm.id = spell_change_windows.party_member_id
        and (
          pm.user_id = (select auth.uid())
          or pm.owner_user_id = (select auth.uid())
          or private.is_campaign_dm(pm.campaign_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. REPLICA IDENTITY FULL -> DEFAULT on every realtime table
-- ---------------------------------------------------------------------------
-- FULL was added speculatively to get `old` records in realtime payloads. It
-- does not work that way: per Supabase's docs, "when RLS is enabled and
-- replica identity is set to full on a table, the `old` record contains only
-- the primary key(s)". RLS is enabled on all of these, so FULL buys exactly
-- nothing at the client and costs a full old-row image in the WAL on every
-- UPDATE and DELETE. Every table here has a primary key, so DEFAULT (= PK)
-- replicates the same payload clients already receive.

alter table calendar_events replica identity default;
alter table campaign_members replica identity default;
alter table campaign_messages replica identity default;
alter table campaigns replica identity default;
alter table companions replica identity default;
alter table deities replica identity default;
alter table discovered_monsters replica identity default;
alter table encounter_state replica identity default;
alter table encounter_state_player_updates replica identity default;
alter table factions replica identity default;
alter table items replica identity default;
alter table locations replica identity default;
alter table notes replica identity default;
alter table npc_inventory replica identity default;
alter table npcs replica identity default;
alter table pantheons replica identity default;
alter table party_inventory replica identity default;
alter table party_members replica identity default;
alter table player_journal_entries replica identity default;
alter table puzzle_rooms replica identity default;
alter table quests replica identity default;
alter table ruleset_reviews replica identity default;
alter table session_availability replica identity default;
alter table session_proposals replica identity default;
alter table soundboard_broadcast replica identity default;

-- ---------------------------------------------------------------------------
-- 4. Account deletion: align ON DELETE with the established pattern
-- ---------------------------------------------------------------------------
-- 60 FKs to auth.users already CASCADE; these were created with the implicit
-- NO ACTION default, so deleting an account fails with a FK violation instead
-- of removing the user's own rows. All of these hold strictly private,
-- per-user content, matching what the 60 CASCADEs already do.
--
-- campaign_messages.recipient_user_id cascades rather than SET NULL on
-- purpose: a whisper with a null recipient is a campaign-wide message, so
-- nulling it would widen who can read it.
--
-- Deliberately NOT touched here (each needs a model decision, tracked
-- separately): srd_monster_art.user_id / srd_art_defaults.contributed_by
-- (canonical art must outlive the uploading account), the campaign_id FKs on
-- class_features / custom_classes / custom_subclasses (campaign-scoped
-- homebrew), and user_subscriptions.plan_id (blocking the delete of a plan
-- that still has subscribers is the intended behaviour).

alter table campaign_invites
  drop constraint campaign_invites_created_by_fkey,
  add constraint campaign_invites_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete cascade;

alter table campaign_messages
  drop constraint campaign_messages_user_id_fkey,
  add constraint campaign_messages_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table campaign_messages
  drop constraint campaign_messages_recipient_user_id_fkey,
  add constraint campaign_messages_recipient_user_id_fkey
    foreign key (recipient_user_id) references auth.users (id) on delete cascade;

alter table class_features
  drop constraint class_features_user_id_fkey,
  add constraint class_features_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table custom_classes
  drop constraint custom_classes_user_id_fkey,
  add constraint custom_classes_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table custom_subclasses
  drop constraint custom_subclasses_user_id_fkey,
  add constraint custom_subclasses_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table dungeon_features
  drop constraint dungeon_features_user_id_fkey,
  add constraint dungeon_features_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table encounter_state
  drop constraint encounter_state_user_id_fkey,
  add constraint encounter_state_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table faction_party_members
  drop constraint faction_party_members_user_id_fkey,
  add constraint faction_party_members_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table npc_inventory
  drop constraint npc_inventory_user_id_fkey,
  add constraint npc_inventory_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table npc_pc_notes
  drop constraint npc_pc_notes_user_id_fkey,
  add constraint npc_pc_notes_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table party_inventory
  drop constraint party_inventory_user_id_fkey,
  add constraint party_inventory_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table quest_triggers
  drop constraint quest_triggers_user_id_fkey,
  add constraint quest_triggers_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table sounds
  drop constraint sounds_user_id_fkey,
  add constraint sounds_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

-- quest_trigger_scheduled is ephemeral per-campaign scheduling state; both
-- parents should take it with them.
alter table quest_trigger_scheduled
  drop constraint quest_trigger_scheduled_user_id_fkey,
  add constraint quest_trigger_scheduled_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table quest_trigger_scheduled
  drop constraint quest_trigger_scheduled_campaign_id_fkey,
  add constraint quest_trigger_scheduled_campaign_id_fkey
    foreign key (campaign_id) references campaigns (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 5. Realtime publication: two subscriptions that were never published
-- ---------------------------------------------------------------------------
-- Auditing the publication against what actually subscribes found no
-- speculative members to remove — all 32 published tables have a live
-- subscriber. The drift runs the other way: two tables are subscribed to but
-- were never added, so their channels can never fire.
--
--   campaign_rules  — listed in useCampaignLiveSync's SYNC_TABLES; a DM's rule
--                     toggle currently reaches other clients only on refetch.
--   image_generation_jobs — waitForRow() subscribes for UPDATE; today only its
--                     4-second poll fallback ever completes the wait, which is
--                     also why image jobs feel laggier than mini/AI jobs
--                     (ai_generation_jobs is published, this one was not).
--
-- Both have a primary key and stay at REPLICA IDENTITY DEFAULT: campaign_rules'
-- composite PK (campaign_id, rule_key) is exactly what its DELETE handler
-- reads, and the image-job waiter only reads the new row.

alter publication supabase_realtime add table campaign_rules;
alter publication supabase_realtime add table image_generation_jobs;

-- ---------------------------------------------------------------------------
-- 6. Dead surface
-- ---------------------------------------------------------------------------
-- party_member_levels was a multiclass level-aggregate view; the shipped
-- implementation computes totals client-side in totalLevel() (multiclass.types)
-- straight off character_classes, and nothing in src/, the edge functions, the
-- MCP server, or any SQL object selects from the view.
--
-- Kept deliberately, so the next audit does not re-litigate them:
--   class_feature_options   — schema+RLS shipped, app wiring is deferred Phase 2
--   pro_waitlist / disposable_email_domains — written by the marketing site repo
--   abuse_guard_trips / spell_cast_records  — write-only dispute/audit trails
--   companion_player_notes / party_member_player_notes — superseded by
--     entity_notes but still holding 5 and 6 unmigrated rows; they need a
--     backfill before they can be dropped, tracked separately.

drop view if exists party_member_levels;
