-- A character doll is priced like every other OpenAI picture: base x the
-- OpenAI image multiplier x the 1536x1024 size multiplier, charged by
-- generate-character-doll and shown by useCharacterDollCost.
--
-- It used to be one flat 100 with neither multiplier (20261006213453), which
-- ignored the admin's provider rate. The base becomes three pictures' worth
-- (3 x the 50 an entity image costs), so a doll costs what its three sheets
-- would cost one at a time: 150 x 0.35 x 1.5 = 79 credits at today's rate.
-- Only the row still at the old default moves, so an admin's own price stays.
update public.ai_generation_credit_costs
set credit_cost = 150
where generation_type = 'character_doll'
  and credit_cost = 100;
