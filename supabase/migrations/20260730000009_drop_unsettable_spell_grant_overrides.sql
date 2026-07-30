-- Migration: drop_unsettable_spell_grant_overrides
--
-- character_spells.fixed_attack_bonus and fixed_save_dc (added in
-- 20260720000042) were meant to let a grant (racial/feat/item spell) override
-- the computed attack bonus / save DC — e.g. a magic item with a printed DC.
-- Nothing in the app ever writes either column (no character-creation step,
-- item grant flow, or admin UI sets them), so both are 100% NULL in
-- production. src/lib/spellGrantStats.ts, and every template that renders
-- through it, already fell through to the casting_ability/class-stats/
-- fallback precedence whenever these were NULL — which is always — so
-- removing the dead override branch changes no rendered output. Dropping the
-- columns removes an override path that was never reachable.
alter table public.character_spells
  drop constraint if exists character_spells_fixed_save_dc_check,
  drop constraint if exists character_spells_fixed_attack_bonus_check,
  drop column if exists fixed_save_dc,
  drop column if exists fixed_attack_bonus;
