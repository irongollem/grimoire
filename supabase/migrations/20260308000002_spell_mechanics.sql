-- Add structured mechanics fields to spells for display, filtering, and advisor pre-fill
ALTER TABLE spells
  ADD COLUMN IF NOT EXISTS attack_type        text,
  ADD COLUMN IF NOT EXISTS save_attribute     text,
  ADD COLUMN IF NOT EXISTS save_effect        text,
  ADD COLUMN IF NOT EXISTS damage_dice        text,
  ADD COLUMN IF NOT EXISTS damage_type        text,
  ADD COLUMN IF NOT EXISTS healing_dice       text,
  ADD COLUMN IF NOT EXISTS aoe_shape          text,
  ADD COLUMN IF NOT EXISTS aoe_size           text,
  ADD COLUMN IF NOT EXISTS condition_inflicted text;
