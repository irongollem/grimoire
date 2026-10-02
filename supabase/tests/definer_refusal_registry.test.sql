begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

-- Every SECURITY DEFINER function a signed-in user can call bypasses RLS, so
-- its own body is the only thing between a caller and every row (#936). The
-- security advisor counts these; it cannot tell a sound one from a broken one,
-- and it saw none of the real holes (is_app_admin() answering NULL,
-- get_admin_users, a DM seating anyone by writing member rows). This registry
-- replaces counting with proof. Each function is one of:
--
--   refuses  a test calls it as someone who must not be allowed and asserts it
--            raises (throws_ok) or answers nothing (is_empty).
--            src/lib/definerRefusalRegistry.test.ts reads this list and fails
--            unless supabase/tests/ holds that assertion.
--   self     it only ever acts on the caller. Proven here: it takes no uuid
--            argument, so there is no way to name anyone else.
--   public   deliberately open to any signed-in user; the reason is written
--            down. Anon reachability is pinned separately by
--            anon_rpc_surface.test.sql.
--
-- A new definer function fails this file until it is classified, and a
-- 'refuses' entry fails the vitest check until its refusal test exists. There
-- is no "unproven" kind, on purpose.

create temporary table definer_registry (
  name text primary key,
  kind text not null check (kind in ('refuses', 'self', 'public')),
  reason text,
  check (kind = 'refuses' or reason is not null)
) on commit drop;

insert into definer_registry (name, kind, reason) values
  ('accept_terms', 'self', 'records the caller''s own acceptance; keys only on auth.uid()'),
  ('acknowledge_ai_generation_job', 'refuses', null),
  ('acknowledge_ruleset_reviews', 'refuses', null),
  ('activate_innate_sorcery', 'refuses', null),
  ('admin_fulfil_dsr_request', 'refuses', null),
  ('admin_grant_credits', 'refuses', null),
  ('admin_log_dsr_request', 'refuses', null),
  ('admin_set_user_plan', 'refuses', null),
  ('admin_set_user_suspended', 'refuses', null),
  ('apply_de_level', 'refuses', null),
  ('apply_level_up', 'refuses', null),
  ('approve_character_content', 'refuses', null),
  ('archive_quest_beat', 'refuses', null),
  ('assert_quest_objective_status', 'refuses', null),
  ('assert_quest_runtime', 'refuses', null),
  ('assume_character', 'refuses', null),
  ('attach_party_member_to_campaign', 'refuses', null),
  ('cast_character_spell_v4', 'refuses', null),
  ('change_prepared_spell', 'refuses', null),
  ('check_all_quotas', 'self', 'the caller''s own quotas'),
  ('check_quota', 'self', 'the caller''s own quota for one resource'),
  ('claim_currency_drop', 'refuses', null),
  ('claim_item_drop', 'refuses', null),
  ('claim_loot_chest_atom', 'refuses', null),
  ('claim_player_offer', 'refuses', null),
  ('claim_vendor_offer', 'refuses', null),
  ('clone_party_member', 'refuses', null),
  ('consume_app_invite', 'refuses', null),
  ('convert_party_member_copy', 'refuses', null),
  ('convert_party_member_ruleset', 'refuses', null),
  ('convert_sorcery_points', 'refuses', null),
  ('decide_campaign_join_request', 'refuses', null),
  ('delete_campaign_with_homebrew', 'refuses', null),
  ('delete_character_spells', 'refuses', null),
  ('detach_party_member_from_campaign', 'refuses', null),
  ('dispatch_loot', 'refuses', null),
  ('end_campaign_quest_session', 'refuses', null),
  ('ensure_quest_main_thread', 'refuses', null),
  ('get_admin_users', 'refuses', null),
  ('get_character_content_item', 'refuses', null),
  ('get_campaign_live_quests', 'refuses', null),
  ('get_craftable_output_items', 'refuses', null),
  ('get_credit_calibration_hints', 'refuses', null),
  ('get_demo_status', 'self', 'whether the caller has a demo copy'),
  ('get_family_campaigns', 'self', 'the caller''s own children''s tables and the requests waiting on the caller'),
  ('get_loot_placements', 'refuses', null),
  ('get_player_encounter_state', 'refuses', null),
  ('get_player_session_state', 'refuses', null),
  ('get_player_visible_items', 'self', 'items in campaigns the caller is a member of, keyed on auth.uid()'),
  ('get_player_visible_locations', 'refuses', null),
  ('get_player_visible_mini', 'refuses', null),
  ('get_player_visible_monsters', 'refuses', null),
  ('get_player_visible_npcs', 'refuses', null),
  ('get_player_visible_puzzles', 'refuses', null),
  ('get_player_visible_quest_beats', 'refuses', null),
  ('get_player_visible_quests', 'refuses', null),
  ('get_player_visible_site_state', 'refuses', null),
  ('get_prompt_screening_hints', 'refuses', null),
  ('get_quest_runtime_context', 'refuses', null),
  ('get_unembedded_content_counts', 'refuses', null),
  ('get_user_ledger', 'refuses', null),
  ('grab_item_drop', 'refuses', null),
  ('join_campaign_via_invite', 'refuses', null),
  ('load_demo_campaign', 'self', 'copies the demo into a campaign the caller owns'),
  ('open_quest_thread', 'refuses', null),
  ('open_spell_change_windows', 'refuses', null),
  ('perform_quest_consequence', 'refuses', null),
  ('publish_demo_version', 'refuses', null),
  ('remove_from_family_campaign', 'refuses', null),
  ('remove_missing_character_content', 'refuses', null),
  ('restore_sorcery_points', 'refuses', null),
  ('search_quest_runtime_jump_targets', 'refuses', null),
  ('set_character_spell_prepared', 'refuses', null),
  ('set_demo_offered', 'refuses', null),
  ('spend_downtime_draw', 'refuses', null),
  ('take_spellcasting_rest', 'refuses', null),
  ('transfer_campaign_ownership', 'refuses', null),
  ('transition_quest_runtime', 'refuses', null),
  ('update_combatant_position', 'refuses', null),
  ('validate_app_invite', 'public', 'runs before login by definition; the token is the credential');

create temporary view client_definers as
  select p.oid, p.proname::text as name, p.proargtypes
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'execute');

select set_eq(
  $$ select name from client_definers $$,
  $$ select name from definer_registry $$,
  'every client-callable SECURITY DEFINER function is classified, and nothing else is'
);

select is(
  (select count(*)::int from (select name from client_definers group by name having count(*) > 1) d),
  0,
  'no client-callable definer function is overloaded, so the registry names each one exactly'
);

select is_empty(
  $$ select d.name
       from client_definers d
       join definer_registry r on r.name = d.name
      where r.kind = 'self'
        and exists (select 1 from unnest(d.proargtypes) t where t in ('uuid'::regtype, 'uuid[]'::regtype)) $$,
  'a self function takes no uuid, so a caller cannot name anyone but themselves'
);

select is_empty(
  $$ select name from definer_registry where kind <> 'refuses' and coalesce(trim(reason), '') = '' $$,
  'every self and public function says why'
);

select * from finish();
rollback;
