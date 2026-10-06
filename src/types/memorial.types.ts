/** Hall of the Fallen (#982): mirrors `character_memorials` / `memorial_mourners`. */
export type MemorialKind = "fallen" | "retired";

export interface CharacterMemorial {
  id: string;
  party_member_id: string;
  campaign_id: string;
  owner_user_id: string | null;
  marked_by: string | null;
  kind: MemorialKind;
  /** NULL while the character is on the wall. */
  restored_at: string | null;
  game_date: string | null;
  real_date: string;
  /** HTML, written by the DM. */
  account: string | null;
  /** HTML, written by the owner. */
  last_words: string | null;
  last_blow: string | null;
  survived_by: string[];
  player_name: string | null;
  character_name: string;
  portrait_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
  species_name: string | null;
  class_name: string | null;
  level: number | null;
  campaign_name: string;
  created_at: string;
  updated_at: string;
}

export interface MemorialMourner {
  memorial_id: string;
  user_id: string;
  campaign_id: string;
  candle_lit_at: string | null;
  tolled_at: string | null;
  kept_at: string | null;
  let_go_at: string | null;
  created_at: string;
  updated_at: string;
}
