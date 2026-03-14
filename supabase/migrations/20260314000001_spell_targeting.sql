-- Add free-text targeting description to spells
ALTER TABLE spells
  ADD COLUMN IF NOT EXISTS target_description text;
