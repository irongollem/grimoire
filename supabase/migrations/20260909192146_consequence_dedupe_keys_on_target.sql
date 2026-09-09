-- Migration: consequence_dedupe_keys_on_target
-- A rule's dedupe key names every target it can have, not only the objective.
--
-- 20260905215424 (#794) carried the partial uniques of quest_objective_effects
-- forward: (condition, action, coalesce(target_objective_id, zeros)). That was
-- the whole identity of a rule when every action either moved an objective or
-- carried a payload. It stopped being so with unlock_quest (#836,
-- target_quest_id) and shift_npc_relationship / owe_favor (#831, #850,
-- target_npc_id): those targets were not in the key, so the index read "one
-- unlock_quest per beat" and "one NPC shift per beat" — a beat could not open
-- two sequels, or move two NPCs. Found on 9 Sep 2026 wiring a real quest whose
-- opening beat names two sibling quests to unlock (#834): the second insert
-- raised 23505.
--
-- The four payload-only actions (create_calendar_event, send_broadcast,
-- grant_knowledge, award_milestone) leave the key entirely. Two pieces of
-- knowledge granted by one beat are two rules, and the only column that could
-- tell them apart is the jsonb payload — a poor index key and a worse notion
-- of identity, since a DM editing one text would silently make it "the same
-- rule" as another. Duplicates there are visible in the Payoff list and are
-- the DM's to delete, as they were for quest_triggers before #794.
--
-- Written idempotently on purpose: it was applied to production by hand the
-- day it was written, ahead of the push that records it, so that the second
-- unlock could be authored on the beat it belongs to. Replaying it is a no-op.

drop index if exists public.quest_consequences_beat_uniq;
drop index if exists public.quest_consequences_edge_uniq;
drop index if exists public.quest_consequences_location_uniq;

create unique index if not exists quest_consequences_beat_rule_uniq
  on public.quest_consequences (
    on_beat_id, action,
    coalesce(target_objective_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(target_quest_id,     '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(target_npc_id,       '00000000-0000-0000-0000-000000000000'::uuid))
  where on_beat_id is not null
    and action not in ('create_calendar_event', 'send_broadcast', 'grant_knowledge', 'award_milestone');

create unique index if not exists quest_consequences_edge_rule_uniq
  on public.quest_consequences (
    on_edge_id, action,
    coalesce(target_objective_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(target_quest_id,     '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(target_npc_id,       '00000000-0000-0000-0000-000000000000'::uuid))
  where on_edge_id is not null
    and action not in ('create_calendar_event', 'send_broadcast', 'grant_knowledge', 'award_milestone');

create unique index if not exists quest_consequences_location_rule_uniq
  on public.quest_consequences (
    on_location_id, on_location_fact, action,
    coalesce(target_objective_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(target_quest_id,     '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(target_npc_id,       '00000000-0000-0000-0000-000000000000'::uuid))
  where on_location_id is not null
    and action not in ('create_calendar_event', 'send_broadcast', 'grant_knowledge', 'award_milestone');
