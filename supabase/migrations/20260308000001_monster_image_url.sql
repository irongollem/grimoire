-- Add optional art image to monsters (for card printing)
ALTER TABLE monsters ADD COLUMN IF NOT EXISTS image_url text;
