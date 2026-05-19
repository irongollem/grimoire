-- Migration: npc_relationship_5e_scale
-- Migrate NPC relationship from text {ally,neutral,enemy,unknown} to a real
-- Postgres enum on the 5e reaction scale:
--   {hostile, unfriendly, indifferent, friendly, helpful, unknown}
-- Unknown becomes the new default (the implicit "unset" state).
-- Value remap before the cast:
--   ally    -> helpful
--   neutral -> indifferent
--   enemy   -> hostile
--   unknown -> unknown
-- Null or empty values are seeded with 'unknown' defensively.

-- ── 1. Remap existing text values in-place ────────────────────────────────────
update public.npcs set relationship = case lower(coalesce(nullif(relationship, ''), 'unknown'))
  -- Legacy values
  when 'ally'        then 'helpful'
  when 'neutral'     then 'indifferent'
  when 'enemy'       then 'hostile'
  -- AI-generated off-scale value: an NPC mentioned in passing without a stance
  when 'mentioned'   then 'unknown'
  -- Already on the new scale (or any casing variant of it)
  when 'hostile'     then 'hostile'
  when 'unfriendly'  then 'unfriendly'
  when 'indifferent' then 'indifferent'
  when 'friendly'    then 'friendly'
  when 'helpful'     then 'helpful'
  when 'unknown'     then 'unknown'
  -- Anything else (future AI surprises) safely buckets to unknown rather than failing the cast
  else 'unknown'
end;

update public.hall_of_heroes set relationship = case lower(coalesce(nullif(relationship, ''), 'unknown'))
  when 'ally'        then 'helpful'
  when 'neutral'     then 'indifferent'
  when 'enemy'       then 'hostile'
  when 'mentioned'   then 'unknown'
  when 'hostile'     then 'hostile'
  when 'unfriendly'  then 'unfriendly'
  when 'indifferent' then 'indifferent'
  when 'friendly'    then 'friendly'
  when 'helpful'     then 'helpful'
  when 'unknown'     then 'unknown'
  else 'unknown'
end;

-- ── 2. Create the enum type ───────────────────────────────────────────────────
create type public.npc_relationship as enum (
  'hostile',
  'unfriendly',
  'indifferent',
  'friendly',
  'helpful',
  'unknown'
);

-- ── 3. Convert npcs.relationship from text → enum ─────────────────────────────
alter table public.npcs alter column relationship drop default;
alter table public.npcs
  alter column relationship type public.npc_relationship
  using relationship::public.npc_relationship;
alter table public.npcs alter column relationship set default 'unknown'::public.npc_relationship;

-- ── 4. Convert hall_of_heroes.relationship from text → enum ──────────────────
alter table public.hall_of_heroes alter column relationship drop default;
alter table public.hall_of_heroes
  alter column relationship type public.npc_relationship
  using relationship::public.npc_relationship;
alter table public.hall_of_heroes alter column relationship set default 'unknown'::public.npc_relationship;

-- ── 5. Refresh AI system prompt enum hint so generations use new values ──────
update public.ai_system_prompts
   set content = replace(
         content,
         '"relationship": "One of: ally, neutral, enemy, unknown"',
         '"relationship": "One of: hostile, unfriendly, indifferent, friendly, helpful, unknown"'
       )
 where generator_type = 'npc'
   and content like '%"relationship": "One of: ally, neutral, enemy, unknown"%';
