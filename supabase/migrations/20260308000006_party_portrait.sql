-- Add optional portrait to party members (for encounter runner display)
ALTER TABLE party_members ADD COLUMN IF NOT EXISTS portrait_url text;
