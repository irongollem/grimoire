-- Require campaign DM rights to write campaign-scoped DM content.
--
-- THE BUG
--
-- 51 policies across 27 tables gated their INSERT / UPDATE `with check` on
-- nothing but `(select auth.uid()) = user_id`. Ownership of the *row* was the
-- whole test; `campaign_id` was never consulted. So any authenticated user could
-- write a row stamped with their own user_id and *any* campaign_id — including a
-- campaign they are merely a player in, or one they have no relationship with at
-- all beyond knowing its uuid.
--
-- That is not theoretical, and it is not invisible to the victim, because several
-- of these tables have player-visible SELECT arms that key off attacker-controlled
-- columns:
--
--   * `npcs_player_select` matches `cm.party_member_id = ANY(npcs.player_visible_to)`,
--     and `player_visible_to` is set by whoever inserts the row. A player can mint
--     an NPC and choose which party members see it.
--   * `calendar_events_player_select` matches `player_visible = true OR
--     event_type = 'session'`, so any member can inject a session event the whole
--     party sees on the shared calendar.
--
-- The reachable path is not hypothetical either. `ImportBundleModal.vue` is mounted
-- at `App.vue:12` with no role check — it is driven by the OS `.grimoire` file
-- handler registered in `main.ts`, so it opens from anywhere in the app including
-- `/play/*`. `useWorldBundle.executeImport()` then batch-inserts into `locations`,
-- `npcs`, `npc_relationships`, `monsters` and `items` with
-- `campaign_id = activeCampaignId` — for a player, that is the DM's campaign.
-- RLS was the only thing standing there, and it was not standing.
--
-- Elsewhere the app leans on client-side gating that the server never mirrored:
-- the species/class create UI on `/codex/:tab` — the one route marked
-- `playerReadable: true` — is hidden behind `v-if="isDM"`, a template flag, not a
-- boundary.
--
-- THE FIX
--
-- Every affected policy keeps its existing owner test and gains a campaign gate:
--
--     and (campaign_id is null or private.is_campaign_dm(campaign_id))
--
-- This is not a new shape — `notes` has been written this way since it was added,
-- and the sweep simply brings the other 27 tables into line with it.
--
-- WHY ONE UNIFORM PREDICATE, INCLUDING THE `campaign_id is null` ARM ON TABLES
-- WHERE THE COLUMN IS `NOT NULL`
--
-- 20 of these tables allow a null `campaign_id` (a personal-library row: a homebrew
-- monster, spell or species that belongs to a user rather than to a campaign) and 7
-- do not. Writing the gate two different ways would mean re-deriving, per table and
-- per future reviewer, which variant is correct — and a dead `is null` arm on a
-- `NOT NULL` column costs nothing and stays correct if that constraint is ever
-- relaxed. One pattern, greppable, verified once.
--
-- The null arm is load-bearing rather than defensive: the player-reachable writes
-- on `/codex` all pass `campaign_id: null` explicitly (`ClassList.vue:158`
-- "Duplicate", `ArchetypeList.vue:147` "Load example"), so they keep working —
-- a player may still fork an SRD class into their own library, they simply cannot
-- staple it to someone else's campaign.
--
-- WHAT DELIBERATELY DID NOT CHANGE
--
--   * The `using` clauses. This migration is about who may *write* into a campaign;
--     read scoping is untouched.
--   * The per-user tables whose `user_id` means "the user this row belongs to"
--     rather than "the DM who authored this": entity_notes, campaign_messages,
--     ai_generation_jobs, image_generation_jobs, document_imports, minis,
--     dashboard_layouts, player_favourites, player_journal_entries,
--     player_npc_ratings, player_read_items, session_availability, party_members.
--     A campaign gate there would break the owner's own writes.
--   * `ImportBundleModal`'s missing UI role check. Gating it on `auth.isDM` would
--     break a legitimate flow — a user with no membership yet importing a bundle to
--     create a *new* campaign — which RLS now handles with the right granularity:
--     a campaign you own is allowed, someone else's is denied.
--
-- Writers that bypass RLS are unaffected by construction: every `SECURITY DEFINER`
-- RPC and every edge function (service role). Verified that no `SECURITY INVOKER`
-- function inserts into any of these tables, so the client is the only RLS-subject
-- writer.

-- ── calendar_events ──────────────────────────────────────────────────────────
drop policy "Users insert own events" on public.calendar_events;
create policy "Users insert own events" on public.calendar_events
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy "Users update own events" on public.calendar_events;
create policy "Users update own events" on public.calendar_events
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── class_feature_options ────────────────────────────────────────────────────
drop policy class_feature_options_insert on public.class_feature_options;
create policy class_feature_options_insert on public.class_feature_options
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── class_features ───────────────────────────────────────────────────────────
drop policy class_features_insert on public.class_features;
create policy class_features_insert on public.class_features
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- The `user_id is null` arm covers seeded rows that belong to no one; it is
-- preserved exactly as it was and only the campaign gate is added.
drop policy class_features_update on public.class_features;
create policy class_features_update on public.class_features
  for update to public
  using (
    (select auth.uid()) = user_id
    or (user_id is null and (select auth.uid()) is not null)
  )
  with check (
    (
      (select auth.uid()) = user_id
      or (user_id is null and (select auth.uid()) is not null)
    )
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── crafting_recipes ─────────────────────────────────────────────────────────
drop policy crafting_recipes_insert on public.crafting_recipes;
create policy crafting_recipes_insert on public.crafting_recipes
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy crafting_recipes_update on public.crafting_recipes;
create policy crafting_recipes_update on public.crafting_recipes
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── custom_classes ───────────────────────────────────────────────────────────
drop policy custom_classes_insert on public.custom_classes;
create policy custom_classes_insert on public.custom_classes
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy custom_classes_update on public.custom_classes;
create policy custom_classes_update on public.custom_classes
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── custom_subclasses ────────────────────────────────────────────────────────
drop policy custom_subclasses_insert on public.custom_subclasses;
create policy custom_subclasses_insert on public.custom_subclasses
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy custom_subclasses_update on public.custom_subclasses;
create policy custom_subclasses_update on public.custom_subclasses
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── encounters ───────────────────────────────────────────────────────────────
drop policy "owner insert" on public.encounters;
create policy "owner insert" on public.encounters
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy "owner update" on public.encounters;
create policy "owner update" on public.encounters
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── factions ─────────────────────────────────────────────────────────────────
-- Only the `with check` was permissive here; the `using` clause already consulted
-- the campaign and is preserved verbatim.
drop policy factions_update on public.factions;
create policy factions_update on public.factions
  for update to public
  using (
    private.is_campaign_dm(campaign_id)
    or (campaign_id is null and (select auth.uid()) = user_id)
  )
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── items ────────────────────────────────────────────────────────────────────
drop policy items_insert on public.items;
create policy items_insert on public.items
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy items_update on public.items;
create policy items_update on public.items
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── locations ────────────────────────────────────────────────────────────────
drop policy "Users can insert own locations" on public.locations;
create policy "Users can insert own locations" on public.locations
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy "Users can update own locations" on public.locations;
create policy "Users can update own locations" on public.locations
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── loot_tables ──────────────────────────────────────────────────────────────
drop policy loot_tables_insert on public.loot_tables;
create policy loot_tables_insert on public.loot_tables
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy loot_tables_update on public.loot_tables;
create policy loot_tables_update on public.loot_tables
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── monsters ─────────────────────────────────────────────────────────────────
-- A single FOR ALL policy, so the added gate covers both insert and update.
drop policy "monsters: owner full access" on public.monsters;
create policy "monsters: owner full access" on public.monsters
  for all to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── npc_inventory ────────────────────────────────────────────────────────────
drop policy npc_inventory_insert on public.npc_inventory;
create policy npc_inventory_insert on public.npc_inventory
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy npc_inventory_update on public.npc_inventory;
create policy npc_inventory_update on public.npc_inventory
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── npc_relationships ────────────────────────────────────────────────────────
drop policy npc_relationships_insert on public.npc_relationships;
create policy npc_relationships_insert on public.npc_relationships
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy npc_relationships_update on public.npc_relationships;
create policy npc_relationships_update on public.npc_relationships
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── npc_sets ─────────────────────────────────────────────────────────────────
drop policy npc_sets_insert on public.npc_sets;
create policy npc_sets_insert on public.npc_sets
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── npcs ─────────────────────────────────────────────────────────────────────
drop policy "Users insert own npcs" on public.npcs;
create policy "Users insert own npcs" on public.npcs
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy "Users update own npcs" on public.npcs;
create policy "Users update own npcs" on public.npcs
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── puzzle_rooms ─────────────────────────────────────────────────────────────
drop policy puzzle_rooms_insert on public.puzzle_rooms;
create policy puzzle_rooms_insert on public.puzzle_rooms
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy puzzle_rooms_update on public.puzzle_rooms;
create policy puzzle_rooms_update on public.puzzle_rooms
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── quest_trigger_scheduled ──────────────────────────────────────────────────
drop policy quest_trigger_scheduled_insert on public.quest_trigger_scheduled;
create policy quest_trigger_scheduled_insert on public.quest_trigger_scheduled
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy quest_trigger_scheduled_update on public.quest_trigger_scheduled;
create policy quest_trigger_scheduled_update on public.quest_trigger_scheduled
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── quests ───────────────────────────────────────────────────────────────────
drop policy "Users can insert own quests" on public.quests;
create policy "Users can insert own quests" on public.quests
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy "Users can update own quests" on public.quests;
create policy "Users can update own quests" on public.quests
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── roll_tables ──────────────────────────────────────────────────────────────
drop policy roll_tables_insert on public.roll_tables;
create policy roll_tables_insert on public.roll_tables
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy roll_tables_update on public.roll_tables;
create policy roll_tables_update on public.roll_tables
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── rules ────────────────────────────────────────────────────────────────────
drop policy rules_insert on public.rules;
create policy rules_insert on public.rules
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy rules_update on public.rules;
create policy rules_update on public.rules
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── soundboard_pages ─────────────────────────────────────────────────────────
drop policy soundboard_pages_insert on public.soundboard_pages;
create policy soundboard_pages_insert on public.soundboard_pages
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy soundboard_pages_update on public.soundboard_pages;
create policy soundboard_pages_update on public.soundboard_pages
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── soundboard_playlists ─────────────────────────────────────────────────────
drop policy soundboard_playlists_insert on public.soundboard_playlists;
create policy soundboard_playlists_insert on public.soundboard_playlists
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy soundboard_playlists_update on public.soundboard_playlists;
create policy soundboard_playlists_update on public.soundboard_playlists
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── sounds ───────────────────────────────────────────────────────────────────
drop policy sounds_insert on public.sounds;
create policy sounds_insert on public.sounds
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy sounds_update on public.sounds;
create policy sounds_update on public.sounds
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── species ──────────────────────────────────────────────────────────────────
drop policy species_insert on public.species;
create policy species_insert on public.species
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy species_update on public.species;
create policy species_update on public.species
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── spells ───────────────────────────────────────────────────────────────────
drop policy spells_insert on public.spells;
create policy spells_insert on public.spells
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy spells_update on public.spells;
create policy spells_update on public.spells
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

-- ── traps ────────────────────────────────────────────────────────────────────
drop policy traps_insert on public.traps;
create policy traps_insert on public.traps
  for insert to public
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );

drop policy traps_update on public.traps;
create policy traps_update on public.traps
  for update to public
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (campaign_id is null or private.is_campaign_dm(campaign_id))
  );
