-- Replace flat damage_dice + damage_type columns with a structured JSONB array.
-- Each element: { "dice": "2d6", "type": "fire" }
-- No data migration needed — no spells exist yet.
ALTER TABLE spells
  DROP COLUMN IF EXISTS damage_dice,
  DROP COLUMN IF EXISTS damage_type,
  ADD COLUMN IF NOT EXISTS damage_rolls jsonb;
