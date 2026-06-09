-- Migration: add_entity_image_credit_cost
-- Prices standalone AI art generation for existing entities (generate-entity-image
-- edge function). Cost is image-dominated, so it matches the single-image
-- "portrait" cost (50); the prompt-author text call is rounding error.

insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
values ('entity_image', 'Entity Image (AI)', 50, 16)
on conflict (generation_type) do nothing;
