-- What an AI picture action costs in the Scriptorium's Illuminator (#1176 story 10).
--
-- Cut out, ink sketch, watercolour, extend to the page edge and match the
-- book's look each make one image edit through the `illuminate-picture` edge
-- function. Priced like a cut-out (`entity_cutout`, the same kind of edit on
-- the same model); its own type so it can be priced on its own and the ledger
-- names it.

insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
values ('illuminate_picture', 'Picture action (AI)', 50, 49)
on conflict (generation_type) do nothing;
