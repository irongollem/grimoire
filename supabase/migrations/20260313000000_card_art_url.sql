-- Add card_art_url to support separate portrait (tall) and card art (landscape) images.
-- portrait_url / image_url = tall profile image used in encounter runner, NPC list, etc.
-- card_art_url = landscape card art used in MTG Card Forge layout.

ALTER TABLE party_members ADD COLUMN IF NOT EXISTS card_art_url text;
ALTER TABLE monsters      ADD COLUMN IF NOT EXISTS card_art_url text;
ALTER TABLE npcs          ADD COLUMN IF NOT EXISTS card_art_url text;
