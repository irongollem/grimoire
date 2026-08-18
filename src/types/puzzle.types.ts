import type { AiProvenance } from "@/ai/provenance";

export const PUZZLE_TYPES = ["Logic", "Physical", "Arcane", "Social", "Environmental"] as const;
export type PuzzleType = typeof PUZZLE_TYPES[number];

export const PUZZLE_TYPE_BG: Record<PuzzleType, string> = {
  Logic:            "bg-puzzle-logic",
  Physical:         "bg-puzzle-physical",
  Arcane:           "bg-puzzle-arcane",
  Social:           "bg-puzzle-social",
  Environmental:    "bg-puzzle-environmental",
};

export const PUZZLE_DIFFICULTIES = ["Trivial", "Easy", "Medium", "Hard", "Deadly"] as const;
export type PuzzleDifficulty = typeof PUZZLE_DIFFICULTIES[number];

export const PUZZLE_DIFFICULTY_BG: Record<PuzzleDifficulty, string> = {
  Trivial:    "bg-puzzle-difficulty-trivial",
  Easy:       "bg-puzzle-difficulty-easy",
  Medium:     "bg-puzzle-difficulty-medium",
  Hard:       "bg-puzzle-difficulty-hard",
  Deadly:     "bg-puzzle-difficulty-deadly",
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
  /**
   * Whether players in the campaign can see this puzzle.
   *
   * Derived from `player_visible_to` and kept in lockstep with it — shared ⇔
   * the audience is non-empty. It survives because it is what assigns
   * `campaign_id`; the audience is the authority on who actually sees the row.
   */
  is_shared: boolean;
  /**
   * Party member ids this puzzle is revealed to; `[]` is nobody. Added by
   * `20260817230740` so puzzles can name an audience like every other
   * shareable entity — see `PuzzleRevealControl`.
   */
  player_visible_to: string[];
  /** Hint orders that have been revealed to players (e.g. [1, 2]) */
  shared_hints: number[];
  /** Short spoken text the DM reads aloud when players enter the room */
  read_aloud: string | null;
  /** Location that hosts this puzzle (DM-only; nulled in the player projection) */
  location_id: string | null;
  /** Dungeon feature that hosts this puzzle (DM-only; nulled in the player projection) */
  dungeon_feature_id: string | null;
  ai_provenance?: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

export type PuzzleInsert = Omit<PuzzleRoom, "id" | "user_id" | "created_at" | "updated_at">;
export type PuzzleUpdate = Partial<PuzzleInsert>;
