-- Ask Grimoire (#1253): the ledger reasons its answers are written under, so the admin's cost breakdown lists them.
-- The price is not these rows: an answer is metered by its tokens (`charge_ask_answer`), routing is inside the
-- generator's own price, and the rolling summary is free. Same pattern as `agent_turn` (20261119121052).
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
values
  ('ask_answer', 'Ask Grimoire answer (metered by tokens)', 0, 54),
  ('ask_routing', 'Ask Grimoire routing (inside the generator''s price)', 0, 55),
  ('ask_summary', 'Ask Grimoire summary (free)', 0, 56)
on conflict (generation_type) do nothing;
