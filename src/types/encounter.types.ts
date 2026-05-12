import type { RewardCurrencyPool } from "@/types/quest.types";
export type { RewardCurrencyPool };

export interface ArtObject {
  id: string;
  name: string;
  value_gp: number;
  image_url: string | null;
  description: string | null;
}

// Faction definition — who fights whom
export interface FactionDef {
  id: string;       // "players" | "enemy" | "ally" | "neutral" | custom UUID
  name: string;
  color: string;    // hex color for UI borders/highlights
  hostile_to: string[]; // array of faction ids this faction will attack
}

export const DEFAULT_FACTIONS: FactionDef[] = [
  { id: "players", name: "Players",  color: "#1C2A4A", hostile_to: ["enemy"] },
  { id: "enemy",   name: "Enemy",    color: "#6B1C1C", hostile_to: ["players", "ally"] },
  { id: "ally",    name: "Ally",     color: "#1A4A1A", hostile_to: ["enemy"] },
  { id: "neutral", name: "Neutral",  color: "#3D3D3D", hostile_to: [] },
];

// A blueprint combatant entry in the encounter (stored in DB as JSONB)
// Either monster_id or npc_id is set, not both.
export interface CombatantDef {
  id: string;           // local UUID for this slot
  monster_id: string | null;
  npc_id: string | null;
  count: number;        // how many of this combatant
  faction_id: string;
  custom_name: string | null;
}

export interface Encounter {
  id: string;
  user_id: string;
  campaign_id: string | null;
  name: string;
  description: string | null;
  party_member_ids: string[];
  companion_ids: string[];
  party_member_factions: Record<string, string>; // memberId/companionId → factionId
  combatants: CombatantDef[];
  factions: FactionDef[];
  item_ids: string[];
  trap_ids: string[];
  reward_currency_pools: RewardCurrencyPool[];
  art_objects: ArtObject[];
  location_id: string | null;
  is_finished: boolean;
  events?: EncounterEvent[];
  // Boss-fight mechanics
  lair_enabled: boolean;
  /** References a CombatantDef.id in `combatants[]`. Null = no owner chosen yet. */
  lair_owner_def_id: string | null;
  created_at: string;
  updated_at: string;
}

export type EncounterInsert = Omit<Encounter, "id" | "user_id" | "created_at" | "updated_at">;
export type EncounterUpdate = Partial<EncounterInsert>;

// How much health info players see for non-PC combatants
export type HealthVisibility = "strategic" | "immersive" | "unknown";

// How much a monster is revealed to players in the initiative tracker
export type RevealState = "hidden" | "unseen" | "revealed";

// Spawn definition for event actions
export interface SpawnDef {
  monster_id: string;
  count: number;
  faction_id: string;
  custom_name?: string;
}

export type EventTrigger =
  | { type: "round_start"; round: number }
  | { type: "combatant_hp_pct"; combatant_def_id: string; pct: number }
  | { type: "combatant_dies"; combatant_def_id: string }
  | { type: "manual" };

export type EventAction =
  | { type: "spawn_combatants"; spawns: SpawnDef[] }
  | { type: "broadcast_message"; message: string };

export interface EncounterEvent {
  id: string;
  name: string;
  trigger: EventTrigger;
  actions: EventAction[];
  fire_once: boolean;
  is_player_visible?: boolean;
}

// Wildshape overlay — tracks beast form HP independently; player's real stats are NEVER modified
export interface WildshapeState {
  monster_id: string;
  beast_name: string;
  beast_image_url: string | null;
  beast_hp: number;      // current HP in beast form
  beast_max_hp: number;  // max HP of the beast
  beast_ac: string;      // AC of the beast
}

// Live combatant during a run (ephemeral — not stored in DB)
export interface RunCombatant {
  instance_id: string;      // unique: "m-{defId}-{index}" or "p-{memberId}"
  type: "player" | "monster";
  name: string;
  faction_id: string;
  initiative: number | null;
  hp: number;
  max_hp: number;
  ac: string;
  conditions: string[];
  curses: string[];
  death_saves: { successes: number; failures: number };
  // back-references
  monster_id?: string;
  npc_id?: string;
  def_id?: string;
  party_member_id?: string;
  companion_id?: string;
  dex_mod: number; // for initiative tiebreaking
  portrait_url?: string | null;
  portrait_focal_point?: { x: number; y: number } | null;
  // reveal state — only meaningful for monsters; players are always "revealed"
  reveal_state?: RevealState;
  // wildshape — only set for player combatants currently wildshaped
  wildshape?: WildshapeState;
  // temp HP — absorbs damage first, doesn't stack with healing
  temp_hp?: number;
  // concentration — set when this combatant is concentrating on a spell.
  // Mirrors ConcentrationState on party_members; cleared on short rest / encounter end for monsters.
  concentration?: {
    spellId: string | null;
    spellName: string;
    castAtLevel: number;
    startedRound: number | null;
    appliedEffectIds: string[];
  } | null;
  // Surprise — true on round 1 if the DM flagged this combatant as surprised
  // at combat start. Cleared automatically when they finish their first turn.
  surprised?: boolean;
  // Legendary actions — populated for combatants whose monster stat block has
  // a `legendary_actions` array. Max pool resets at the start of this
  // combatant's turn; other combatants' turns can spend actions from here.
  legendary_action_cap?: number;
  legendary_actions_remaining?: number;
  // Reaction — one per round; reset at the start of each new round.
  reactionUsed?: boolean;
  // VTT battle map — anchor cell (top-left of footprint) on the encounter's
  // location map. Footprint is derived from creature size at render time, not
  // stored. Null/undefined = unplaced; the runner stages unplaced combatants
  // near the map origin so the DM can drag them in.
  position?: { x: number; y: number } | null;
}

// ── XP / CR tables (D&D 5e) ──────────────────────────────────────────────────

export const CR_XP: Record<string, number> = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100,
  "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
  "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
  "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000,
  "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
  "21": 33000, "22": 41000, "23": 50000, "24": 62000, "30": 155000,
};

export const XP_THRESHOLDS: Record<number, { easy: number; medium: number; hard: number; deadly: number }> = {
  1:  { easy: 25,   medium: 50,   hard: 75,   deadly: 100 },
  2:  { easy: 50,   medium: 100,  hard: 150,  deadly: 200 },
  3:  { easy: 75,   medium: 150,  hard: 225,  deadly: 400 },
  4:  { easy: 125,  medium: 250,  hard: 375,  deadly: 500 },
  5:  { easy: 250,  medium: 500,  hard: 750,  deadly: 1100 },
  6:  { easy: 300,  medium: 600,  hard: 900,  deadly: 1400 },
  7:  { easy: 350,  medium: 750,  hard: 1100, deadly: 1700 },
  8:  { easy: 450,  medium: 900,  hard: 1400, deadly: 2100 },
  9:  { easy: 550,  medium: 1100, hard: 1600, deadly: 2400 },
  10: { easy: 600,  medium: 1200, hard: 1900, deadly: 2800 },
  11: { easy: 800,  medium: 1600, hard: 2400, deadly: 3600 },
  12: { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },
  13: { easy: 1100, medium: 2200, hard: 3400, deadly: 5100 },
  14: { easy: 1250, medium: 2500, hard: 3800, deadly: 5700 },
  15: { easy: 1400, medium: 2800, hard: 4300, deadly: 6400 },
  16: { easy: 1600, medium: 3200, hard: 4800, deadly: 7200 },
  17: { easy: 2000, medium: 3900, hard: 5900, deadly: 8800 },
  18: { easy: 2100, medium: 4200, hard: 6300, deadly: 9500 },
  19: { easy: 2400, medium: 4900, hard: 7300, deadly: 10900 },
  20: { easy: 2800, medium: 5700, hard: 8500, deadly: 12700 },
};

export function crToXp(cr: string | null | undefined): number {
  if (!cr) return 0;
  return CR_XP[String(cr)] ?? 0;
}

export function monsterMultiplier(count: number): number {
  if (count === 1) return 1;
  if (count === 2) return 1.5;
  if (count <= 6) return 2;
  if (count <= 10) return 2.5;
  if (count <= 14) return 3;
  return 4;
}

export type DifficultyLabel = "Trivial" | "Easy" | "Medium" | "Hard" | "Deadly" | "Legendary";

export const DIFFICULTY_COLORS: Record<DifficultyLabel, string> = {
  Trivial:    "#6B7280",
  Easy:       "#16A34A",
  Medium:     "#CA8A04",
  Hard:       "#EA580C",
  Deadly:     "#DC2626",
  Legendary:  "#7C3AED",
};

export interface DifficultyResult {
  rawXp: number;
  adjustedXp: number;
  hazardXp: number;
  allyAdjustedXp: number;
  netXp: number;
  multiplier: number;
  allyMultiplier: number;
  enemyCount: number;
  allyCount: number;
  partyThresholds: { easy: number; medium: number; hard: number; deadly: number };
  label: DifficultyLabel;
}

export function calculateDifficulty(
  enemyEntries: { cr: string | null | undefined; count: number }[],
  partyLevels: number[],
  allyEntries: { cr: string | null | undefined; count: number }[] = [],
  hazardXp = 0,
): DifficultyResult {
  // Enemy side
  const enemyCount = enemyEntries.reduce((s, e) => s + e.count, 0);
  const rawXp = enemyEntries.reduce((s, e) => s + crToXp(e.cr) * e.count, 0);
  const multiplier = monsterMultiplier(enemyCount);

  // Adjust enemy multiplier by party size
  let adjustedMultiplier = multiplier;
  if (partyLevels.length < 3) adjustedMultiplier = nextMultiplierTier(multiplier, +1);
  else if (partyLevels.length > 5) adjustedMultiplier = nextMultiplierTier(multiplier, -1);

  const adjustedXp = Math.round(rawXp * adjustedMultiplier);

  // Ally side — apply same count multiplier to reflect action economy value
  const allyCount = allyEntries.reduce((s, e) => s + e.count, 0);
  const allyRawXp = allyEntries.reduce((s, e) => s + crToXp(e.cr) * e.count, 0);
  const allyMultiplier = monsterMultiplier(allyCount);
  const allyAdjustedXp = Math.round(allyRawXp * allyMultiplier);

  // Net XP is what we compare against thresholds
  // Trap/hazard XP is added flat (no count multiplier — static hazards fire once)
  const netXp = Math.max(0, adjustedXp + hazardXp - allyAdjustedXp);

  // Party thresholds = sum of each member's threshold for their level
  const partyThresholds = { easy: 0, medium: 0, hard: 0, deadly: 0 };
  for (const level of partyLevels) {
    const t = XP_THRESHOLDS[Math.min(Math.max(level, 1), 20)] ?? XP_THRESHOLDS[1];
    partyThresholds.easy   += t.easy;
    partyThresholds.medium += t.medium;
    partyThresholds.hard   += t.hard;
    partyThresholds.deadly += t.deadly;
  }

  let label: DifficultyLabel;
  if (netXp === 0)                               label = "Trivial";
  else if (netXp < partyThresholds.easy)         label = "Trivial";
  else if (netXp < partyThresholds.medium)       label = "Easy";
  else if (netXp < partyThresholds.hard)         label = "Medium";
  else if (netXp < partyThresholds.deadly)       label = "Hard";
  else if (netXp < partyThresholds.deadly * 2)   label = "Deadly";
  else                                            label = "Legendary";

  return {
    rawXp, adjustedXp, hazardXp, allyAdjustedXp, netXp,
    multiplier: adjustedMultiplier, allyMultiplier,
    enemyCount, allyCount, partyThresholds, label,
  };
}

function nextMultiplierTier(m: number, dir: 1 | -1): number {
  const TIERS = [1, 1.5, 2, 2.5, 3, 4];
  const idx = TIERS.indexOf(m);
  return TIERS[Math.min(Math.max(idx + dir, 0), TIERS.length - 1)] ?? m;
}

// Live encounter state persisted for real-time player sync
export interface EncounterState {
  id: string;
  encounter_id: string;
  campaign_id: string;
  user_id: string;
  is_running: boolean;
  current_round: number;
  active_combatant_index: number;
  combatants_live: RunCombatant[];
  events_fired?: string[];
  started_at: string | null;
  updated_at: string;
}
