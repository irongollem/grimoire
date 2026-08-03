-- Migration: seed_entity_embedding_credit_cost
-- Seeds the 0-cost ai_generation_credit_costs row for "entity_embedding" --
-- the generation_type generate-quest/index.ts (#600) already logs via
-- recordFreeGeneration() for its query-embedding call, and that embed-content
-- (the npc/faction/location embed-on-write + backfill function landing
-- alongside this migration) also logs for every row it embeds. Mirrors
-- 20260803000001's seed for "monster_embedding" exactly, and exists for the
-- same reason: recordFreeGeneration() writes straight to ai_credit_ledger
-- with no FK back to this table, so omitting the row does not break
-- anything at insert time -- but AdminPricingTab.vue's cost breakdown
-- renders one row per ai_generation_credit_costs entry, so without this seed
-- every entity_embedding ledger row (and a full npc/faction/location backfill
-- writes many) would be real, already-incurred provider spend that never
-- appears in the one report meant to make platform cost measurable.

insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order) values
  ('entity_embedding', 'Entity Embedding (infrastructure)', 0, 22);
