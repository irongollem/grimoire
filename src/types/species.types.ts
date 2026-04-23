export type SpeciesSize = "tiny" | "small" | "medium" | "large";

export interface SpeciesSpellGrant {
  spell_id: string | null;     // null = free player pick (e.g. High Elf cantrip)
  spell_name: string;          // display name; for free picks, describes the choice
  uses_per_day: number | null; // null = at will
  resets_on: "long_rest" | "short_rest" | null;
  min_level: number;           // character level required (default 1)
  source_label: string;        // e.g. "High Elf — Cantrip"
  subrace: string | null;      // null = all subraces; string = specific subrace name
}

export interface SpeciesSpeed {
  walk?: number;
  fly?: number;
  swim?: number;
  climb?: number;
  burrow?: number;
}

export interface SpeciesTrait {
  name: string;
  description: string;
}

export interface SpeciesSubrace {
  name: string;
  description: string;
  traits: SpeciesTrait[];
  ability_score_increases?: Record<string, number | string> | null;
}

export interface Species {
  id: string;
  user_id: string;
  name: string;
  description: string | null;    // Tiptap JSON
  notes: string | null;          // Tiptap JSON (DM-only)
  size: SpeciesSize | null;
  speed: SpeciesSpeed | null;
  ability_score_increases: Record<string, number | string> | null;
  traits: SpeciesTrait[] | null;
  languages: string[];
  tags: string[];
  source: string | null;
  subraces: SpeciesSubrace[] | null;
  image_url: string | null;
  focal_point: { x: number; y: number } | null;
  is_shapeshifter: boolean;
  natural_armor_ac?: number | null;
  granted_spells: SpeciesSpellGrant[];
  created_at: string;
  updated_at: string;
}

export type SpeciesInsert = Omit<Species, "id" | "user_id" | "created_at" | "updated_at">;
export type SpeciesUpdate = Partial<SpeciesInsert>;
