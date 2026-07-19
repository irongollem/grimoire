export const PUZZLE_TYPES = ["Logic", "Physical", "Arcane", "Social", "Environmental"] as const;
export type PuzzleType = typeof PUZZLE_TYPES[number];

export const PUZZLE_TYPE_COLORS: Record<PuzzleType, string> = {
  Logic:         "#7c3aed",
  Physical:      "#b45309",
  Arcane:        "#0284c7",
  Social:        "#16a34a",
  Environmental: "#059669",
};

export const PUZZLE_DIFFICULTIES = ["Trivial", "Easy", "Medium", "Hard", "Deadly"] as const;
export type PuzzleDifficulty = typeof PUZZLE_DIFFICULTIES[number];

export const PUZZLE_DIFFICULTY_COLORS: Record<PuzzleDifficulty, string> = {
  Trivial: "#6b7280",
  Easy:    "#16a34a",
  Medium:  "#ca8a04",
  Hard:    "#dc2626",
  Deadly:  "#7c3aed",
};

export const PUZZLE_SKILLS = [
  "Arcana",
  "History",
  "Insight",
  "Investigation",
  "Nature",
  "Perception",
  "Persuasion",
  "Religion",
  "Sleight of Hand",
  "Stealth",
  "Athletics",
  "Acrobatics",
  "Animal Handling",
  "Medicine",
  "Survival",
] as const;
export type PuzzleSkill = typeof PUZZLE_SKILLS[number];

export interface PuzzleHint {
  order: number;
  text: string;
}

export interface PuzzleSkillCheck {
  skill: string;
  dc: number;
}

export interface PuzzleRoom {
  id: string;
  user_id: string;
  name: string;
  puzzle_type: PuzzleType;
  difficulty: PuzzleDifficulty;
  description: string | null;
  solution: string | null;
  hints: PuzzleHint[];
  skill_checks: PuzzleSkillCheck[];
  success_outcome: string | null;
  failure_consequence: string | null;
  image_url: string | null;
  image_focal_point: { x: number; y: number } | null;
  tags: string[];
  notes: string | null;
  /** Campaign this puzzle is shared into (set automatically when is_shared = true) */
  campaign_id: string | null;
  /** Whether players in the campaign can see this puzzle */
  is_shared: boolean;
  /** Hint orders that have been revealed to players (e.g. [1, 2]) */
  shared_hints: number[];
  /** Short spoken text the DM reads aloud when players enter the room */
  read_aloud: string | null;
  /** Location that hosts this puzzle (DM-only; nulled in the player projection) */
  location_id: string | null;
  /** Dungeon feature that hosts this puzzle (DM-only; nulled in the player projection) */
  dungeon_feature_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PuzzleInsert = Omit<PuzzleRoom, "id" | "user_id" | "created_at" | "updated_at">;
export type PuzzleUpdate = Partial<PuzzleInsert>;
