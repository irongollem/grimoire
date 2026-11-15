-- #1061: the document importer's third matching tier asks TypeSafe's Jev whether an imported entity and a candidate
-- row are the same thing. Free to users, like the embedding tier beside it: import-match records it through
-- recordFreeGeneration() as 'entity_judgment' at delta 0, so the spend is real and ours.
--
-- recordFreeGeneration() writes straight to ai_credit_ledger with no FK to either table below, so nothing breaks
-- without these rows. They exist so the spend shows: AdminPricingTab's cost breakdown renders one row per
-- ai_generation_credit_costs entry and prices tokens through ai_model_pricing (same reasoning as 20260803000005's
-- 'entity_embedding').
--
-- The ledger records the alias the function asks for ('jev-latest'), not the version that answered: the alias is
-- the stable key this price hangs on, and a version bump on TypeSafe's side must not make the spend unpriced.
-- Price read from docs.typesafe.ai on 15 Nov 2026: 0.042 USD per million input tokens, output free.

insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order) values
  ('entity_judgment', 'Entity Judgment (infrastructure)', 0, 51)
on conflict (generation_type) do nothing;

insert into ai_model_pricing (model, provider, model_type, input_cost_per_million_tokens, output_cost_per_million_tokens, notes) values
  ('jev-latest', 'typesafe', 'text', 0.042, 0, 'TypeSafe Jev (System One): typed judgments, no generated text. Input only is billed.')
on conflict (model) do nothing;
