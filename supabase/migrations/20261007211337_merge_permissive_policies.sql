-- Merge multiple permissive policies per (table, command) into one (#999, 3.3).
--
-- The security advisor's `multiple_permissive_policies` fires wherever a role has
-- more than one PERMISSIVE policy for the same command: Postgres evaluates every one
-- of them for every row and ORs the results. Locally that is 60 (table, command)
-- combinations on 26 tables, all of them `{public}` role sets (the advisor multiplies
-- by database roles to reach its larger count).
--
-- Why this is semantically a no-op: permissive policies for the same command and
-- role set are combined with OR (using with using, with check with with check), so a
-- single policy whose expression is the OR of the originals grants exactly the same
-- rows. Each merged expression below is the originals' deparsed text from pg_policies,
-- parenthesised and OR-ed; the only liberties taken are (a) putting cheap pure column
-- comparisons before function calls before sublinks (operand order of an OR carries no
-- meaning), (b) dropping a duplicate when two originals were textually identical
-- (quests, user_subscriptions, plans, quest_refs update), and (c) spelling
-- `( SELECT auth.uid() AS uid)` as `(select auth.uid())`, the same parse tree.
--
-- UPDATE: a policy without a with check is checked against its using. The merged with
-- check is built from each original's EFFECTIVE check (its with check, else its using),
-- which is what Postgres evaluated when they were separate.
--
-- Scope: only groups whose roles array is identical ({public} everywhere here); none of
-- these tables has an ALL-command or restrictive policy, so no combination is left over.
--
-- Recursion: a policy that contains a sublink triggers Postgres's policy-recursion check
-- (see 20261006230038). Merging never adds a sublink that the combined policy set did not
-- already carry, because all permissive policies of a command are OR-ed into one qual
-- before sublinks are expanded either way. Mutual-reference tables were checked
-- (party_members <-> campaign_members, faction_* <-> deities/party_members,
-- quests <-> quest_refs/objectives, library_*_art, entity_notes, character_spells) and
-- are exercised for every account by scripts/db/rls-differential.ts and the pgTAP suite.
-- The unwrapped campaign_tile_packs_select policy is untouched.
--
-- Proof: scripts/db/rls-differential.ts compares, per account, visible rows and the
-- effective check of every policy before and after, inside a rolled-back transaction;
-- supabase/tests/permissive_policy_merge.test.sql pins the end state.

-- ai_credit_ledger
--   select: ai_credit_ledger_admin_select, ai_credit_ledger_select
drop policy "ai_credit_ledger_admin_select" on public.ai_credit_ledger;
drop policy "ai_credit_ledger_select" on public.ai_credit_ledger;
create policy ai_credit_ledger_select on public.ai_credit_ledger for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or (private.is_app_admin())
  );

-- calendar_events
--   select: "Users see own events", calendar_events_player_select
drop policy "Users see own events" on public.calendar_events;
drop policy "calendar_events_player_select" on public.calendar_events;
create policy calendar_events_select on public.calendar_events for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or (((campaign_id IS NOT NULL) AND (campaign_id IN ( SELECT campaign_members.campaign_id
       FROM campaign_members
      WHERE (campaign_members.user_id = (select auth.uid())))) AND ((player_visible = true) OR (event_type = 'session'::text))))
  );

-- campaign_members
--   update: campaign_members_dm_update, campaign_members_update_own
drop policy "campaign_members_dm_update" on public.campaign_members;
drop policy "campaign_members_update_own" on public.campaign_members;
-- campaign_members_update: a policy here has no with check, so Postgres checks its new row against its using;
-- the merged with check below carries that using in its place (effective check = with check, else using).
create policy campaign_members_update on public.campaign_members for update
  to public
  using (
    ((user_id = (select auth.uid())))
    or (private.is_campaign_dm(campaign_id))
  )
  with check (
    ((user_id = (select auth.uid())))
    or (private.is_campaign_dm(campaign_id))
  );

-- campaign_messages
--   delete: campaign_messages_delete, campaign_messages_delete_dm
drop policy "campaign_messages_delete" on public.campaign_messages;
drop policy "campaign_messages_delete_dm" on public.campaign_messages;
create policy campaign_messages_delete on public.campaign_messages for delete
  to public
  using (
    (((select auth.uid()) = user_id))
    or (private.is_campaign_dm(campaign_id))
  );

-- character_spells
--   insert: character_spells_insert, character_spells_insert_owner
drop policy "character_spells_insert" on public.character_spells;
drop policy "character_spells_insert_owner" on public.character_spells;
create policy character_spells_insert on public.character_spells for insert
  to public
  with check (
    (((EXISTS ( SELECT 1
       FROM campaign_members
      WHERE ((campaign_members.party_member_id = character_spells.party_member_id) AND (campaign_members.user_id = (select auth.uid()))))) OR (EXISTS ( SELECT 1
       FROM (campaign_members cm_player
         JOIN campaign_members cm_dm ON (((cm_dm.campaign_id = cm_player.campaign_id) AND (cm_dm.role = 'dm'::text) AND (cm_dm.user_id = (select auth.uid())))))
      WHERE (cm_player.party_member_id = character_spells.party_member_id)))))
    or ((EXISTS ( SELECT 1
       FROM party_members pm
      WHERE ((pm.id = character_spells.party_member_id) AND ((pm.owner_user_id = (select auth.uid())) OR ((pm.owner_user_id IS NULL) AND (pm.user_id = (select auth.uid()))))))))
  );

-- companions
--   select: "Campaign members see companions", companions_select
drop policy "Campaign members see companions" on public.companions;
drop policy "companions_select" on public.companions;
create policy companions_select on public.companions for select
  to public
  using (
    (private.is_campaign_member(campaign_id))
    or ((((select auth.uid()) = user_id) OR ((campaign_id IS NOT NULL) AND private.is_campaign_member(campaign_id))))
  );

-- crafting_recipes
--   select: crafting_recipes_select, crafting_recipes_select_player
drop policy "crafting_recipes_select" on public.crafting_recipes;
drop policy "crafting_recipes_select_player" on public.crafting_recipes;
create policy crafting_recipes_select on public.crafting_recipes for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or (((campaign_id IS NOT NULL) AND private.is_campaign_member(campaign_id) AND (EXISTS ( SELECT 1
       FROM campaign_members cm
      WHERE ((cm.user_id = (select auth.uid())) AND (cm.campaign_id = crafting_recipes.campaign_id) AND (cm.party_member_id = ANY (crafting_recipes.player_visible_to)))))))
  );

-- deities
--   select: deities_player_select, deities_select
drop policy "deities_player_select" on public.deities;
drop policy "deities_select" on public.deities;
create policy deities_select on public.deities for select
  to public
  using (
    (private.is_campaign_dm(campaign_id))
    or ((private.is_campaign_member(campaign_id) AND (player_visible_to IS NOT NULL) AND (EXISTS ( SELECT 1
       FROM campaign_members cm
      WHERE ((cm.user_id = (select auth.uid())) AND (cm.role = 'player'::text) AND (cm.party_member_id = ANY (deities.player_visible_to)))))))
  );

-- entity_notes
--   select: entity_notes_campaign_shared, entity_notes_dm_shared, entity_notes_own
drop policy "entity_notes_campaign_shared" on public.entity_notes;
drop policy "entity_notes_dm_shared" on public.entity_notes;
drop policy "entity_notes_own" on public.entity_notes;
create policy entity_notes_select on public.entity_notes for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or (((is_private = false) AND (EXISTS ( SELECT 1
       FROM (campaign_members cm_author
         JOIN campaign_members cm_viewer ON ((cm_author.campaign_id = cm_viewer.campaign_id)))
      WHERE ((cm_author.user_id = entity_notes.user_id) AND (cm_viewer.user_id = (select auth.uid())))))))
    or (((shared_with_dm = true) AND (EXISTS ( SELECT 1
       FROM (campaign_members cm_author
         JOIN campaign_members cm_dm ON ((cm_author.campaign_id = cm_dm.campaign_id)))
      WHERE ((cm_author.user_id = entity_notes.user_id) AND (cm_dm.user_id = (select auth.uid())) AND (cm_dm.role = 'dm'::text))))))
  );

-- faction_deities
--   select: faction_deities_player_select, faction_deities_select
drop policy "faction_deities_player_select" on public.faction_deities;
drop policy "faction_deities_select" on public.faction_deities;
create policy faction_deities_select on public.faction_deities for select
  to public
  using (
    (private.is_campaign_dm(campaign_id))
    or ((private.is_campaign_member(campaign_id) AND (private.faction_is_visible_to_caller(faction_id) OR (EXISTS ( SELECT 1
       FROM deities d
      WHERE ((d.id = faction_deities.deity_id) AND (d.player_visible_to IS NOT NULL) AND (EXISTS ( SELECT 1
               FROM campaign_members cm
              WHERE ((cm.user_id = (select auth.uid())) AND (cm.role = 'player'::text) AND (cm.party_member_id = ANY (d.player_visible_to)))))))))))
  );

-- faction_npcs
--   select: faction_npcs_select, faction_npcs_shared_faction_member_select
drop policy "faction_npcs_select" on public.faction_npcs;
drop policy "faction_npcs_shared_faction_member_select" on public.faction_npcs;
create policy faction_npcs_select on public.faction_npcs for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or ((EXISTS ( SELECT 1
       FROM (faction_party_members fpm
         JOIN campaign_members cm ON ((cm.party_member_id = fpm.party_member_id)))
      WHERE ((fpm.faction_id = faction_npcs.faction_id) AND (cm.user_id = (select auth.uid())) AND (cm.role = 'player'::text)))))
  );

-- faction_party_members
--   select: faction_party_members_fellow_member_select, faction_party_members_player_select, faction_party_members_select
drop policy "faction_party_members_fellow_member_select" on public.faction_party_members;
drop policy "faction_party_members_player_select" on public.faction_party_members;
drop policy "faction_party_members_select" on public.faction_party_members;
create policy faction_party_members_select on public.faction_party_members for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or (private.is_faction_pc_member(faction_id, (select auth.uid())))
    or ((EXISTS ( SELECT 1
       FROM campaign_members cm
      WHERE ((cm.user_id = (select auth.uid())) AND (cm.role = 'player'::text) AND (cm.party_member_id = faction_party_members.party_member_id)))))
  );

-- library_monster_art
--   select: library_monster_art_campaign_member_select, library_monster_art_select
drop policy "library_monster_art_campaign_member_select" on public.library_monster_art;
drop policy "library_monster_art_select" on public.library_monster_art;
create policy library_monster_art_select on public.library_monster_art for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or ((((select auth.uid()) = user_id) OR (EXISTS ( SELECT 1
       FROM (campaign_members cm_player
         JOIN campaign_members cm_owner ON (((cm_owner.campaign_id = cm_player.campaign_id) AND (cm_owner.user_id = library_monster_art.user_id))))
      WHERE (cm_player.user_id = (select auth.uid()))))))
  );

-- library_spell_art
--   select: library_spell_art_campaign_member_select, library_spell_art_select
drop policy "library_spell_art_campaign_member_select" on public.library_spell_art;
drop policy "library_spell_art_select" on public.library_spell_art;
create policy library_spell_art_select on public.library_spell_art for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or ((((select auth.uid()) = user_id) OR (EXISTS ( SELECT 1
       FROM (campaign_members cm_player
         JOIN campaign_members cm_owner ON (((cm_owner.campaign_id = cm_player.campaign_id) AND (cm_owner.user_id = library_spell_art.user_id))))
      WHERE (cm_player.user_id = (select auth.uid()))))))
  );

-- pantheons
--   select: pantheons_player_select, pantheons_select
drop policy "pantheons_player_select" on public.pantheons;
drop policy "pantheons_select" on public.pantheons;
create policy pantheons_select on public.pantheons for select
  to public
  using (
    (private.is_campaign_dm(campaign_id))
    or ((private.is_campaign_member(campaign_id) AND (player_visible_to IS NOT NULL) AND (EXISTS ( SELECT 1
       FROM campaign_members cm
      WHERE ((cm.user_id = (select auth.uid())) AND (cm.role = 'player'::text) AND (cm.party_member_id = ANY (pantheons.player_visible_to)))))))
  );

-- party_members
--   delete: party_members_creator_delete, party_members_player_delete
--   insert: party_members_creator_insert, party_members_player_insert
--   select: party_members_creator_select, party_members_select
--   update: party_members_creator_update, party_members_player_update
drop policy "party_members_creator_delete" on public.party_members;
drop policy "party_members_player_delete" on public.party_members;
create policy party_members_delete on public.party_members for delete
  to public
  using (
    ((((select auth.uid()) = user_id) AND ((owner_user_id IS NULL) OR (owner_user_id = (select auth.uid()))) AND (NOT private.has_memorial_in_effect(id))))
    or (((((select auth.uid()) = owner_user_id) OR ((campaign_id IS NOT NULL) AND private.is_campaign_dm(campaign_id) AND (owner_user_id IS NULL))) AND (NOT private.has_memorial_in_effect(id))))
  );
drop policy "party_members_creator_insert" on public.party_members;
drop policy "party_members_player_insert" on public.party_members;
create policy party_members_insert on public.party_members for insert
  to public
  with check (
    ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_member(campaign_id))))
    or (((((select auth.uid()) = owner_user_id) AND ((campaign_id IS NULL) OR private.is_campaign_member(campaign_id))) OR ((campaign_id IS NOT NULL) AND private.is_campaign_dm(campaign_id))))
  );
drop policy "party_members_creator_select" on public.party_members;
drop policy "party_members_select" on public.party_members;
create policy party_members_select on public.party_members for select
  to public
  using (
    ((((select auth.uid()) = user_id) AND ((owner_user_id IS NULL) OR (owner_user_id = (select auth.uid())))))
    or ((((campaign_id IS NOT NULL) AND private.is_campaign_dm(campaign_id)) OR ((select auth.uid()) = owner_user_id) OR ((campaign_id IS NOT NULL) AND private.is_campaign_member(campaign_id) AND (EXISTS ( SELECT 1
       FROM campaign_members cm
      WHERE (cm.party_member_id = party_members.id)))) OR ((campaign_id IS NOT NULL) AND (is_dm_managed = true) AND (owner_user_id IS NULL) AND private.is_campaign_member(campaign_id))))
  );
drop policy "party_members_creator_update" on public.party_members;
drop policy "party_members_player_update" on public.party_members;
create policy party_members_update on public.party_members for update
  to public
  using (
    ((((select auth.uid()) = user_id) AND ((owner_user_id IS NULL) OR (owner_user_id = (select auth.uid())))))
    or ((((select auth.uid()) = owner_user_id) OR ((campaign_id IS NOT NULL) AND private.is_campaign_dm(campaign_id)) OR ((campaign_id IS NOT NULL) AND private.is_campaign_member(campaign_id) AND (EXISTS ( SELECT 1
       FROM campaign_members cm
      WHERE ((cm.party_member_id = party_members.id) AND (cm.user_id = (select auth.uid()))))))))
  )
  with check (
    ((((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_member(campaign_id))))
    or ((((select auth.uid()) = owner_user_id) OR ((campaign_id IS NOT NULL) AND private.is_campaign_dm(campaign_id)) OR ((campaign_id IS NOT NULL) AND private.is_campaign_member(campaign_id) AND (EXISTS ( SELECT 1
       FROM campaign_members cm
      WHERE ((cm.party_member_id = party_members.id) AND (cm.user_id = (select auth.uid()))))))))
  );

-- plans
--   select: plans_public_read, plans_select
drop policy "plans_public_read" on public.plans;
drop policy "plans_select" on public.plans;
create policy plans_select on public.plans for select
  to public
  using (
    true
  );

-- player_journal_entries
--   select: player_journal_entries_select_dm_shared, player_journal_entries_select_own, player_journal_entries_select_shared
drop policy "player_journal_entries_select_dm_shared" on public.player_journal_entries;
drop policy "player_journal_entries_select_own" on public.player_journal_entries;
drop policy "player_journal_entries_select_shared" on public.player_journal_entries;
create policy player_journal_entries_select on public.player_journal_entries for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or (((NOT is_private) AND private.is_campaign_member(campaign_id)))
    or (((shared_with_dm = true) AND (EXISTS ( SELECT 1
       FROM (campaign_members cm_author
         JOIN campaign_members cm_dm ON ((cm_author.campaign_id = cm_dm.campaign_id)))
      WHERE ((cm_author.user_id = player_journal_entries.user_id) AND (cm_author.campaign_id = player_journal_entries.campaign_id) AND (cm_dm.user_id = (select auth.uid())) AND (cm_dm.role = 'dm'::text))))))
  );

-- prompt_screenings
--   select: prompt_screenings_admin_select, prompt_screenings_select
drop policy "prompt_screenings_admin_select" on public.prompt_screenings;
drop policy "prompt_screenings_select" on public.prompt_screenings;
create policy prompt_screenings_select on public.prompt_screenings for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or (private.is_app_admin())
  );

-- quest_objectives
--   select: "Users can read objectives of own quests", quest_objectives_player_select
drop policy "Users can read objectives of own quests" on public.quest_objectives;
drop policy "quest_objectives_player_select" on public.quest_objectives;
create policy quest_objectives_select on public.quest_objectives for select
  to public
  using (
    ((is_player_visible AND private.is_quest_player_visible(quest_id)))
    or ((EXISTS ( SELECT 1
       FROM quests
      WHERE ((quests.id = quest_objectives.quest_id) AND ((select auth.uid()) = quests.user_id)))))
  );

-- quest_refs
--   select: "Users can read refs of own quests", quest_refs_player_select
--   update: "Users can update refs of own quests", quest_refs_update
drop policy "Users can read refs of own quests" on public.quest_refs;
drop policy "quest_refs_player_select" on public.quest_refs;
create policy quest_refs_select on public.quest_refs for select
  to public
  using (
    ((is_player_visible AND private.is_quest_player_visible(quest_id)))
    or ((EXISTS ( SELECT 1
       FROM quests
      WHERE ((quests.id = quest_refs.quest_id) AND ((select auth.uid()) = quests.user_id)))))
  );
drop policy "Users can update refs of own quests" on public.quest_refs;
drop policy "quest_refs_update" on public.quest_refs;
create policy quest_refs_update on public.quest_refs for update
  to public
  using (
    (EXISTS ( SELECT 1
   FROM quests
  WHERE ((quests.id = quest_refs.quest_id) AND ((select auth.uid()) = quests.user_id))))
  )
  with check (
    (EXISTS ( SELECT 1
   FROM quests
  WHERE ((quests.id = quest_refs.quest_id) AND ((select auth.uid()) = quests.user_id))))
  );

-- quests
--   select: "Users can read own quests", quests_select
drop policy "Users can read own quests" on public.quests;
drop policy "quests_select" on public.quests;
create policy quests_select on public.quests for select
  to public
  using (
    ((select auth.uid()) = user_id)
  );

-- rules
--   select: rules_player_select, rules_select
drop policy "rules_player_select" on public.rules;
drop policy "rules_select" on public.rules;
create policy rules_select on public.rules for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or (((is_player_visible = true) AND (user_id IN ( SELECT cm_dm.user_id
       FROM (campaign_members cm_player
         JOIN campaign_members cm_dm ON (((cm_player.campaign_id = cm_dm.campaign_id) AND (cm_dm.role = 'dm'::text))))
      WHERE ((cm_player.user_id = (select auth.uid())) AND (cm_player.role = 'player'::text))))))
  );

-- scriptorium_documents
--   select: "Users see own docs", scriptorium_documents_player_select
drop policy "Users see own docs" on public.scriptorium_documents;
drop policy "scriptorium_documents_player_select" on public.scriptorium_documents;
create policy scriptorium_documents_select on public.scriptorium_documents for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or (((campaign_id IS NOT NULL) AND (EXISTS ( SELECT 1
       FROM campaign_members cm
      WHERE ((cm.user_id = (select auth.uid())) AND (cm.campaign_id = scriptorium_documents.campaign_id) AND (cm.party_member_id = ANY (scriptorium_documents.player_visible_to)))))))
  );

-- store_items
--   select: store_items_campaign_member_select, store_items_select
drop policy "store_items_campaign_member_select" on public.store_items;
drop policy "store_items_select" on public.store_items;
create policy store_items_select on public.store_items for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or (((visible = true) AND private.can_see_shared_store(location_id)))
  );

-- user_subscriptions
--   select: user_subscriptions_select, user_subscriptions_select_admin, user_subscriptions_select_own
drop policy "user_subscriptions_select" on public.user_subscriptions;
drop policy "user_subscriptions_select_admin" on public.user_subscriptions;
drop policy "user_subscriptions_select_own" on public.user_subscriptions;
create policy user_subscriptions_select on public.user_subscriptions for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or (private.is_app_admin())
  );
