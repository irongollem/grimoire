// ── SRD rules (shared, read-only from client) ─────────────────────────────────

export interface SrdRule {
  id: string;
  slug: string;
  name: string;
  content: string;       // plain text from Open5e
  parent_slug: string | null;
  doc_slug: string;
  created_at: string;
  updated_at: string;
}

// ── Custom rules (per-user) ───────────────────────────────────────────────────

export const RULE_CATEGORIES = [
  "Combat",
  "Exploration",
  "Social",
  "Crafting",
  "Magic",
  "Environment",
  "Economy",
  "Other",
] as const;

export type RuleCategory = (typeof RULE_CATEGORIES)[number];

// ── Tracker bolt-on for custom rules ─────────────────────────────────────────

export interface TrackerEffect {
  type: "speed" | "disadvantage_checks" | "disadvantage_saves" | "exhaustion" | "note";
  value?: number;     // e.g. -10 for speed
  scope?: string;     // e.g. "STR,DEX" for specific check types
  label: string;      // human-readable: "Frozen (−10 ft speed)"
}

export interface TrackerLevel {
  value: number;
  label: string;      // "Unaffected", "Chilled", "Frozen", "Hypothermic"
  color?: string;     // tailwind color name, e.g. "blue", "red"
  effects?: TrackerEffect[];
}

export interface TrackerItemTag {
  tag: string;        // item tag, e.g. "food", "cold_weather_gear"
  delta: number;      // amount to change tracker; negative = reduce
  mode: "on_consume" | "suppresses_rest_tick";
}

export interface TrackerTriggers {
  onLongRest?: number;
  onShortRest?: number;
  itemTags?: TrackerItemTag[];
}

export interface DmButton {
  label: string;      // "Add Exposure", "Warm Up", "Reset Sanity"
  delta: number;      // tracker delta when pressed
}

export interface TrackerDef {
  label: string;                // "Cold Exposure", "Hunger Level"
  type: "level" | "points";
  min: number;
  max: number;
  levels?: TrackerLevel[];      // required when type = "level"
  triggers?: TrackerTriggers;
  dmButtons?: DmButton[];
}

export interface Rule {
  id: string;
  user_id: string;
  title: string;
  content: object | null;   // Tiptap JSON
  category: string | null;
  tags: string[];
  is_player_visible: boolean;
  tracker: TrackerDef | null;
  created_at: string;
  updated_at: string;
}

export type RuleInsert = Omit<Rule, "id" | "user_id" | "created_at" | "updated_at">;
export type RuleUpdate = Partial<RuleInsert>;

// ── Per-character tracker state ───────────────────────────────────────────────

export interface TrackerState {
  id: string;
  party_member_id: string;
  campaign_id: string;
  rule_key: string | null;   // set for built-in rules
  rule_id: string | null;    // set for custom rules
  value: number;
  updated_at: string;
}

// ── Built-in optional rule toggle (campaign_rules table) ──────────────────────

export interface CampaignRule {
  campaign_id: string;
  rule_key: string;
  enabled: boolean;
  updated_at: string;
}

// ── Built-in optional rule module definition (frontend registry only) ─────────

export interface OptionalRuleDef {
  key: string;
  name: string;
  summary: string;           // one-liner for the toggle list
  description: string;       // full text shown in Reliquary
  dmOnly: boolean;
  tracker?: Omit<TrackerDef, "dmButtons">;  // pre-configured tracker; dmButtons fixed per module
}
