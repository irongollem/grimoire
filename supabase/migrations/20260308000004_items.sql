-- Items table: mundane equipment and magic items.
-- Weapons carry damage_rolls (JSONB array of {dice, type}).
-- Magic items can reference spells by UUID array.

CREATE TABLE IF NOT EXISTS items (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  item_type               text NOT NULL DEFAULT 'gear',
  subtype                 text,
  rarity                  text NOT NULL DEFAULT 'mundane',
  requires_attunement     boolean NOT NULL DEFAULT false,
  attunement_requirements text,
  weight                  text,
  cost                    text,
  damage_rolls            jsonb,          -- [{dice:"1d8",type:"slashing"}]
  armor_class             text,           -- e.g. "13 + DEX modifier"
  properties              text[] NOT NULL DEFAULT '{}',
  charges                 integer,
  recharge                text,
  spell_ids               uuid[] NOT NULL DEFAULT '{}',
  description             text NOT NULL DEFAULT '',
  source                  text,
  tags                    text[] NOT NULL DEFAULT '{}',
  image_url               text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "items_select" ON items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "items_insert" ON items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "items_update" ON items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "items_delete" ON items FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
