-- ─────────────────────────────────────────────────────────────────────────────
-- Monsters table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monsters (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name          text NOT NULL,
  monster_type  text NOT NULL DEFAULT 'humanoid',
  size          text NOT NULL DEFAULT 'medium',
  alignment     text NOT NULL DEFAULT 'unaligned',
  habitat       text,
  source        text,
  tags          text[] NOT NULL DEFAULT '{}',
  stat_block    jsonb NOT NULL DEFAULT '{}',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE monsters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monsters: owner full access"
  ON monsters FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER monsters_updated_at
  BEFORE UPDATE ON monsters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Party members table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS party_members (
  id                          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                     uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name                        text NOT NULL,
  player_name                 text,
  class                       text,
  subclass                    text,
  level                       integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 20),
  race                        text,
  max_hp                      integer NOT NULL DEFAULT 10,
  current_hp                  integer NOT NULL DEFAULT 10,
  temp_hp                     integer NOT NULL DEFAULT 0,
  ac                          integer NOT NULL DEFAULT 10,
  speed                       integer NOT NULL DEFAULT 30,
  initiative_bonus            integer NOT NULL DEFAULT 0,
  current_initiative          integer,
  str                         integer NOT NULL DEFAULT 10,
  dex                         integer NOT NULL DEFAULT 10,
  con                         integer NOT NULL DEFAULT 10,
  int                         integer NOT NULL DEFAULT 10,
  wis                         integer NOT NULL DEFAULT 10,
  cha                         integer NOT NULL DEFAULT 10,
  proficiency_bonus           integer NOT NULL DEFAULT 2,
  skill_proficiencies         jsonb NOT NULL DEFAULT '{}',
  saving_throw_proficiencies  text[] NOT NULL DEFAULT '{}',
  conditions                  text[] NOT NULL DEFAULT '{}',
  inspiration                 boolean NOT NULL DEFAULT false,
  death_save_successes        integer NOT NULL DEFAULT 0,
  death_save_failures         integer NOT NULL DEFAULT 0,
  notes                       text,
  sort_order                  integer NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE party_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "party_members: owner full access"
  ON party_members FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER party_members_updated_at
  BEFORE UPDATE ON party_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
