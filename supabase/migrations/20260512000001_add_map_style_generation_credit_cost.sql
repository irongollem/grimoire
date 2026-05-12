-- Migration: add_map_style_generation_credit_cost
-- Adds map_style_generation to ai_generation_credit_costs so admins can price it

insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
values ('map_style_generation', 'Map Style (AI)', 2, 13);
