-- Migration: player_visible_quests_projection
-- #507 (part 3 — quest objectives; part 4 — quests). Both are genuine DM
-- narrative secrets (unlike SRD-public monster stats).
--
-- (3) quest_objectives_player_select gated only on the QUEST being visible to
--     the player (via q.player_visible_to) — it never checked the objective's
--     own `is_player_visible` flag, so secret objective text ("the informant is
--     actually the killer") shipped to players of any quest they can see.
--
-- (4) quests_select ships the WHOLE quest row to a player who is in
--     player_visible_to — including DM `notes` (Tiptap JSON the player UI never
--     renders). Fixed with a projection nulling `notes`, plus dropping the
--     player branch of quests_select so the base table is not a devtools bypass.
--
-- Dependency wrinkle: quest_objectives_player_select and quest_refs_player_select
-- subquery `quests` in their USING predicate, and an RLS subquery is itself
-- subject to the referenced table's RLS. Once quests_select is owner-only, those
-- subqueries would return nothing and players would lose ALL objectives/refs. So
-- the quest-visibility check moves into a SECURITY DEFINER helper in the
-- `private` schema (per the RLS-helper convention) that bypasses quests RLS.

-- ── 0. RLS helper: is a quest visible to the current player? ───────────────────
-- Lives in `private` (not exposed by PostgREST); SECURITY DEFINER so it can read
-- `quests` regardless of the now owner-only quests_select policy.
create or replace function private.is_quest_player_visible(p_quest_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from quests q
    join campaign_members cm on cm.campaign_id = q.campaign_id
    where q.id = p_quest_id
      and cm.user_id = (select auth.uid())
      and cm.party_member_id = any (q.player_visible_to)
  );
$$;

-- authenticated/anon keep USAGE+EXECUTE so RLS can resolve the predicate; the
-- function is in `private`, so PostgREST never exposes it as an RPC.
revoke all on function private.is_quest_player_visible(uuid) from public;
grant execute on function private.is_quest_player_visible(uuid) to authenticated, anon, service_role;

-- ── 1. quest_objectives: also gate on the objective's own visibility ──────────
drop policy if exists "quest_objectives_player_select" on quest_objectives;

create policy "quest_objectives_player_select" on quest_objectives
  for select using (
    quest_objectives.is_player_visible
    and private.is_quest_player_visible(quest_objectives.quest_id)
  );

-- ── 2. quest_refs: keep player visibility working without quests base RLS ──────
drop policy if exists "quest_refs_player_select" on quest_refs;

create policy "quest_refs_player_select" on quest_refs
  for select using (
    private.is_quest_player_visible(quest_refs.quest_id)
  );

-- ── 3. quests projection (nulls DM `notes`) ───────────────────────────────────
-- p_campaign_id → the player's quest list; p_quest_id → one quest page.
-- Column list matches the `quests` row type positionally.
create or replace function get_player_visible_quests(
  p_campaign_id uuid default null,
  p_quest_id    uuid default null
)
returns setof quests
language sql stable security definer
set search_path = public
as $$
  select
    q.id,
    q.user_id,
    q.campaign_id,
    q.parent_quest_id,
    q.title,
    q.summary,
    q.status,
    q.giver_npc_id,
    q.location_id,
    q.rewards,
    q.tags,
    null::text,                     -- notes (DM-only Tiptap JSON)
    q.started_at,
    q.resolved_at,
    q.created_at,
    q.updated_at,
    q.reward_pp,
    q.reward_gp,
    q.reward_ep,
    q.reward_sp,
    q.reward_cp,
    q.reward_currency_pools,
    q.description,
    q.reward_item_ids,
    q.reward_art_objects,
    q.player_visible_to
  from quests q
  where q.campaign_id is not null
    and (p_campaign_id is null or q.campaign_id = p_campaign_id)
    and (p_quest_id    is null or q.id = p_quest_id)
    and private.is_quest_player_visible(q.id);
$$;

revoke all on function get_player_visible_quests(uuid, uuid) from public;
revoke execute on function get_player_visible_quests(uuid, uuid) from anon;
grant execute on function get_player_visible_quests(uuid, uuid) to authenticated;

-- ── 4. Close the base-table devtools bypass ───────────────────────────────────
-- Players now read quests only through the projection; restrict the base SELECT
-- to the owner (DM). Objective/ref visibility no longer depends on this policy
-- (it goes through private.is_quest_player_visible).
drop policy if exists "quests_select" on quests;

create policy "quests_select" on quests for select using (
  (select auth.uid()) = user_id
);
