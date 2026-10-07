-- Split FOR ALL policies that overlap a SELECT policy, then merge the SELECT side (#999 3.3).
--
-- Follow-up to 20261007211337. The advisor's multiple_permissive_policies also counts a
-- FOR ALL policy as one more policy for each of SELECT, INSERT, UPDATE and DELETE, so twelve
-- tables that pair a FOR ALL policy with a SELECT policy were still flagged.
--
-- A FOR ALL policy with using u and with check c (c is u when it has none) means exactly:
--   select: using u;  insert: with check c;  update: using u with check c;  delete: using u.
-- Each FOR ALL policy below is replaced by those four, and the SELECT one is OR-ed with the
-- table's existing SELECT policy, the same way as in the first migration. Expressions are the
-- deparsed text from pg_policies, parenthesised, with `(select auth.uid())` spelled the same
-- way as in 20261006230038; cheap comparisons are ordered before function calls before
-- sublinks, and an identical duplicate is dropped (none arises here). Role sets are all
-- `{public}` on both sides, no policy is restrictive, and none of these tables had any other
-- per-command policy, so the new names <table>_insert / _update / _delete are free.
--
-- Left as they are on purpose: the FOR ALL policies that overlap nothing, because a lone
-- policy per command is what the advisor wants (campaign_invites, encounter_state, npc_favors,
-- quest_beats, quest_beat_edges, quest_beat_edge_gates, quest_beat_attachments,
-- quest_runtime_state, quest_threads). They are not split, to avoid changing policy shape for
-- no gain.
--
-- Recursion: as before, the combined qual of a command is the same before and after, so the
-- sublinks Postgres expands are the same. discovered_monsters, npc_pc_notes and pinned_forms
-- read campaign_members in a sublink; campaign_members' own policies do not read those tables.
-- The differential script exercises every merged expression for every local account.
--
-- Proof: scripts/db/rls-differential.ts applies both merge migrations in one rolled-back
-- transaction and compares what every account can see and the effective check of every
-- policy; supabase/tests/permissive_policy_merge.test.sql pins the end state, now counting
-- FOR ALL policies too.

-- app_invites
--   all: app_invites_admin_write (using and with check)
--   select: app_invites_admin_read
drop policy "app_invites_admin_write" on public.app_invites;
drop policy "app_invites_admin_read" on public.app_invites;
create policy app_invites_select on public.app_invites for select
  to public
  using (
    private.is_app_admin()
  );
create policy app_invites_insert on public.app_invites for insert
  to public
  with check (
    private.is_app_admin()
  );
create policy app_invites_update on public.app_invites for update
  to public
  using (
    private.is_app_admin()
  )
  with check (
    private.is_app_admin()
  );
create policy app_invites_delete on public.app_invites for delete
  to public
  using (
    private.is_app_admin()
  );

-- campaigns
--   all: Users manage own campaigns (using and with check)
--   select: campaigns_member_select
drop policy "Users manage own campaigns" on public.campaigns;
drop policy "campaigns_member_select" on public.campaigns;
create policy campaigns_select on public.campaigns for select
  to public
  using (
    (((select auth.uid()) = user_id))
    or (private.is_campaign_member(id))
  );
create policy campaigns_insert on public.campaigns for insert
  to public
  with check (
    ((select auth.uid()) = user_id)
  );
create policy campaigns_update on public.campaigns for update
  to public
  using (
    ((select auth.uid()) = user_id)
  )
  with check (
    ((select auth.uid()) = user_id)
  );
create policy campaigns_delete on public.campaigns for delete
  to public
  using (
    ((select auth.uid()) = user_id)
  );

-- class_choice_rest_resets
--   all: class_choice_rest_resets_admin_write (using and with check)
--   select: class_choice_rest_resets_select
drop policy "class_choice_rest_resets_admin_write" on public.class_choice_rest_resets;
drop policy "class_choice_rest_resets_select" on public.class_choice_rest_resets;
create policy class_choice_rest_resets_select on public.class_choice_rest_resets for select
  to public
  using (
    (true)
    or (private.is_app_admin())
  );
create policy class_choice_rest_resets_insert on public.class_choice_rest_resets for insert
  to public
  with check (
    private.is_app_admin()
  );
create policy class_choice_rest_resets_update on public.class_choice_rest_resets for update
  to public
  using (
    private.is_app_admin()
  )
  with check (
    private.is_app_admin()
  );
create policy class_choice_rest_resets_delete on public.class_choice_rest_resets for delete
  to public
  using (
    private.is_app_admin()
  );

-- class_ritual_policies
--   all: class_ritual_policies_admin_write (using and with check)
--   select: class_ritual_policies_select
drop policy "class_ritual_policies_admin_write" on public.class_ritual_policies;
drop policy "class_ritual_policies_select" on public.class_ritual_policies;
create policy class_ritual_policies_select on public.class_ritual_policies for select
  to public
  using (
    (true)
    or (private.is_app_admin())
  );
create policy class_ritual_policies_insert on public.class_ritual_policies for insert
  to public
  with check (
    private.is_app_admin()
  );
create policy class_ritual_policies_update on public.class_ritual_policies for update
  to public
  using (
    private.is_app_admin()
  )
  with check (
    private.is_app_admin()
  );
create policy class_ritual_policies_delete on public.class_ritual_policies for delete
  to public
  using (
    private.is_app_admin()
  );

-- class_spellcasting_policies
--   all: class_spellcasting_policies_admin_write (using and with check)
--   select: class_spellcasting_policies_select
drop policy "class_spellcasting_policies_admin_write" on public.class_spellcasting_policies;
drop policy "class_spellcasting_policies_select" on public.class_spellcasting_policies;
create policy class_spellcasting_policies_select on public.class_spellcasting_policies for select
  to public
  using (
    (true)
    or (private.is_app_admin())
  );
create policy class_spellcasting_policies_insert on public.class_spellcasting_policies for insert
  to public
  with check (
    private.is_app_admin()
  );
create policy class_spellcasting_policies_update on public.class_spellcasting_policies for update
  to public
  using (
    private.is_app_admin()
  )
  with check (
    private.is_app_admin()
  );
create policy class_spellcasting_policies_delete on public.class_spellcasting_policies for delete
  to public
  using (
    private.is_app_admin()
  );

-- discovered_monsters
--   all: dm_full (using and with check)
--   select: player_select
drop policy "dm_full" on public.discovered_monsters;
drop policy "player_select" on public.discovered_monsters;
create policy discovered_monsters_select on public.discovered_monsters for select
  to public
  using (
    (private.is_campaign_dm(campaign_id))
    or ((private.is_campaign_member(campaign_id) AND ((visible_to IS NULL) OR (EXISTS ( SELECT 1
       FROM campaign_members cm
      WHERE ((cm.campaign_id = discovered_monsters.campaign_id) AND (cm.user_id = (select auth.uid())) AND (cm.party_member_id = ANY (discovered_monsters.visible_to))))))))
  );
create policy discovered_monsters_insert on public.discovered_monsters for insert
  to public
  with check (
    private.is_campaign_dm(campaign_id)
  );
create policy discovered_monsters_update on public.discovered_monsters for update
  to public
  using (
    private.is_campaign_dm(campaign_id)
  )
  with check (
    private.is_campaign_dm(campaign_id)
  );
create policy discovered_monsters_delete on public.discovered_monsters for delete
  to public
  using (
    private.is_campaign_dm(campaign_id)
  );

-- metamagic_options
--   all: metamagic_options_admin_write (using and with check)
--   select: metamagic_options_select
drop policy "metamagic_options_admin_write" on public.metamagic_options;
drop policy "metamagic_options_select" on public.metamagic_options;
create policy metamagic_options_select on public.metamagic_options for select
  to public
  using (
    (true)
    or (private.is_app_admin())
  );
create policy metamagic_options_insert on public.metamagic_options for insert
  to public
  with check (
    private.is_app_admin()
  );
create policy metamagic_options_update on public.metamagic_options for update
  to public
  using (
    private.is_app_admin()
  )
  with check (
    private.is_app_admin()
  );
create policy metamagic_options_delete on public.metamagic_options for delete
  to public
  using (
    private.is_app_admin()
  );

-- monsters
--   all: monsters: owner full access (using and with check)
--   select: monsters_player_select
drop policy "monsters: owner full access" on public.monsters;
drop policy "monsters_player_select" on public.monsters;
create policy monsters_select on public.monsters for select
  to public
  using (
    ((select auth.uid()) = user_id)
  );
create policy monsters_insert on public.monsters for insert
  to public
  with check (
    (((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
  );
create policy monsters_update on public.monsters for update
  to public
  using (
    ((select auth.uid()) = user_id)
  )
  with check (
    (((select auth.uid()) = user_id) AND ((campaign_id IS NULL) OR private.is_campaign_dm(campaign_id)))
  );
create policy monsters_delete on public.monsters for delete
  to public
  using (
    ((select auth.uid()) = user_id)
  );

-- npc_pc_notes
--   all: npc_pc_notes_dm_all (using and with check)
--   select: npc_pc_notes_player_select
drop policy "npc_pc_notes_dm_all" on public.npc_pc_notes;
drop policy "npc_pc_notes_player_select" on public.npc_pc_notes;
create policy npc_pc_notes_select on public.npc_pc_notes for select
  to public
  using (
    (private.is_campaign_dm(campaign_id))
    or ((EXISTS ( SELECT 1
       FROM campaign_members cm
      WHERE ((cm.user_id = (select auth.uid())) AND (cm.party_member_id = npc_pc_notes.party_member_id) AND (cm.role = 'player'::text)))))
  );
create policy npc_pc_notes_insert on public.npc_pc_notes for insert
  to public
  with check (
    private.is_campaign_dm(campaign_id)
  );
create policy npc_pc_notes_update on public.npc_pc_notes for update
  to public
  using (
    private.is_campaign_dm(campaign_id)
  )
  with check (
    private.is_campaign_dm(campaign_id)
  );
create policy npc_pc_notes_delete on public.npc_pc_notes for delete
  to public
  using (
    private.is_campaign_dm(campaign_id)
  );

-- party_milestones
--   all: party_milestones_dm_all (using and with check)
--   select: party_milestones_member_select
drop policy "party_milestones_dm_all" on public.party_milestones;
drop policy "party_milestones_member_select" on public.party_milestones;
create policy party_milestones_select on public.party_milestones for select
  to public
  using (
    (private.is_campaign_member(campaign_id))
    or (private.is_campaign_dm(campaign_id))
  );
create policy party_milestones_insert on public.party_milestones for insert
  to public
  with check (
    private.is_campaign_dm(campaign_id)
  );
create policy party_milestones_update on public.party_milestones for update
  to public
  using (
    private.is_campaign_dm(campaign_id)
  )
  with check (
    private.is_campaign_dm(campaign_id)
  );
create policy party_milestones_delete on public.party_milestones for delete
  to public
  using (
    private.is_campaign_dm(campaign_id)
  );

-- pinned_forms
--   all: pinned_forms_dm (using only; check = using)
--   select: pinned_forms_player_select
drop policy "pinned_forms_dm" on public.pinned_forms;
drop policy "pinned_forms_player_select" on public.pinned_forms;
create policy pinned_forms_select on public.pinned_forms for select
  to public
  using (
    (private.is_campaign_dm(campaign_id))
    or ((private.is_campaign_member(campaign_id) AND (EXISTS ( SELECT 1
       FROM campaign_members cm
      WHERE ((cm.campaign_id = pinned_forms.campaign_id) AND (cm.user_id = (select auth.uid())) AND (cm.party_member_id = pinned_forms.party_member_id))))))
  );
create policy pinned_forms_insert on public.pinned_forms for insert
  to public
  with check (
    private.is_campaign_dm(campaign_id)
  );
create policy pinned_forms_update on public.pinned_forms for update
  to public
  using (
    private.is_campaign_dm(campaign_id)
  )
  with check (
    private.is_campaign_dm(campaign_id)
  );
create policy pinned_forms_delete on public.pinned_forms for delete
  to public
  using (
    private.is_campaign_dm(campaign_id)
  );

-- soundboard_broadcast
--   all: soundboard_broadcast_dm_all (using and with check)
--   select: soundboard_broadcast_member_select
drop policy "soundboard_broadcast_dm_all" on public.soundboard_broadcast;
drop policy "soundboard_broadcast_member_select" on public.soundboard_broadcast;
create policy soundboard_broadcast_select on public.soundboard_broadcast for select
  to public
  using (
    (private.is_campaign_member(campaign_id))
    or (private.is_campaign_dm(campaign_id))
  );
create policy soundboard_broadcast_insert on public.soundboard_broadcast for insert
  to public
  with check (
    private.is_campaign_dm(campaign_id)
  );
create policy soundboard_broadcast_update on public.soundboard_broadcast for update
  to public
  using (
    private.is_campaign_dm(campaign_id)
  )
  with check (
    private.is_campaign_dm(campaign_id)
  );
create policy soundboard_broadcast_delete on public.soundboard_broadcast for delete
  to public
  using (
    private.is_campaign_dm(campaign_id)
  );
