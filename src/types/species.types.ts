export type SpeciesSize = "tiny" | "small" | "medium" | "large";

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
  created_at: string;
  updated_at: string;
}

export type SpeciesInsert = Omit<Species, "id" | "user_id" | "created_at" | "updated_at">;
export type SpeciesUpdate = Partial<SpeciesInsert>;
