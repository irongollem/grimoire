CREATE TABLE IF NOT EXISTS encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL DEFAULT 'New Encounter',
  description text,
  party_member_ids uuid[] DEFAULT '{}',
  combatants jsonb DEFAULT '[]',   -- CombatantDef[]
  factions jsonb DEFAULT '[]',     -- FactionDef[]
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner select" ON encounters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner insert" ON encounters FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner update" ON encounters FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "owner delete" ON encounters FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER set_encounters_updated_at
  BEFORE UPDATE ON encounters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
