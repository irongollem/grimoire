-- Migration: rename_quest_status_on_hold_to_rumor
-- Renames quest_status_enum value 'on_hold' to 'rumor' and reorders the enum flow
-- Uses text as intermediate type to avoid the ADD VALUE same-transaction restriction

-- Step 1: relax column to text so we can freely change values and drop the old enum
ALTER TABLE quests ALTER COLUMN status TYPE text;

-- Step 2: migrate existing data
UPDATE quests SET status = 'rumor' WHERE status = 'on_hold';

-- Step 3: drop old enum and recreate in the correct narrative flow order
ALTER TABLE quests ALTER COLUMN status DROP DEFAULT;
DROP TYPE quest_status_enum;

CREATE TYPE quest_status_enum AS ENUM (
  'undiscovered',
  'rumor',
  'active',
  'completed',
  'failed'
);

-- Step 4: restore column to the new enum type
ALTER TABLE quests
  ALTER COLUMN status TYPE quest_status_enum
  USING status::quest_status_enum;

-- Step 5: new quests default to undiscovered
ALTER TABLE quests
  ALTER COLUMN status SET DEFAULT 'undiscovered';
