-- ── Spells ────────────────────────────────────────────────────────────────────
-- Stores homebrew and custom spells. Components are stored as text[] ('V','S','M').
-- Casting time, range, and duration are free-form text for flexibility.

CREATE TABLE spells (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name           text        NOT NULL,
  level          smallint    NOT NULL DEFAULT 1 CHECK (level BETWEEN 0 AND 9),
  school         text        NOT NULL DEFAULT 'evocation',

  casting_time        text  NOT NULL DEFAULT 'Action',
  casting_time_custom text,
  range               text  NOT NULL DEFAULT '60 ft.',
  range_custom        text,
  duration            text  NOT NULL DEFAULT 'Instantaneous',
  duration_custom     text,

  components     text[]      NOT NULL DEFAULT '{}',   -- subset of ['V','S','M']
  material       text,                                -- material component description
  concentration  boolean     NOT NULL DEFAULT false,
  ritual         boolean     NOT NULL DEFAULT false,

  description    text        NOT NULL DEFAULT '',
  higher_levels  text,

  classes        text[]      NOT NULL DEFAULT '{}',
  tags           text[]      NOT NULL DEFAULT '{}',
  source         text,
  image_url      text,        -- optional art for card printing

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own spells"
  ON spells FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_spells_updated_at
  BEFORE UPDATE ON spells
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
