import type { NpcInsert } from "./npc.types";

// ── Reward + status vocabularies ──────────────────────────────────────────────
// Mirrors the CHECK constraints in migration 20260710000001.

export const DOWNTIME_REWARD_TYPES = [
  "npc",
  "item",
  "spell",
  "quest",
  "note",
  "faction",
] as const;
export type DowntimeRewardType = (typeof DOWNTIME_REWARD_TYPES)[number];

export const DOWNTIME_DRAW_STATUSES = ["pending", "resolved", "cancelled"] as const;
export type DowntimeDrawStatus = (typeof DOWNTIME_DRAW_STATUSES)[number];

export const DOWNTIME_DRAW_STATUS_LABELS: Record<DowntimeDrawStatus, string> = {
  pending: "Awaiting the DM",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

// ── Proposed effects ──────────────────────────────────────────────────────────
// An outcome *proposes*; the DM disposes. Nothing here mutates a character until
// the DM ticks it on the resolution board. `gold` is the only kind Phase 1
// applies programmatically — the rest are a checklist the DM enacts at the table.

export const DOWNTIME_EFFECT_KINDS = ["gold", "item", "hp", "condition"] as const;
export type DowntimeEffectKind = (typeof DOWNTIME_EFFECT_KINDS)[number];

interface DowntimeEffectShared {
  applied: boolean;
  /** Why this effect exists, in the DM's voice. Absent when self-evident. */
  note: string | null;
}

export type DowntimeEffect =
  | (DowntimeEffectShared & {
      kind: "gold";
      cp: number;
      sp: number;
      ep: number;
      gp: number;
      pp: number;
    })
  | (DowntimeEffectShared & { kind: "item"; item_id: string; qty: number })
  | (DowntimeEffectShared & { kind: "hp"; delta: number })
  | (DowntimeEffectShared & { kind: "condition"; condition: string });

/** Coin fields, in the order they are displayed. */
export const COIN_KEYS = ["pp", "gp", "ep", "sp", "cp"] as const;
export type CoinKey = (typeof COIN_KEYS)[number];

// ── The archetype catalog ─────────────────────────────────────────────────────
// Lives in code (src/data/downtimeActivities.ts), never the DB: a new archetype
// is data, not a migration. Shaped card-ready so a future Cardforge `CardSubject`
// adapter reads it directly rather than forcing a refactor.

export type DowntimeRisk = 1 | 2 | 3;

export interface DowntimeActivity {
  key: string;
  title: string;
  /** One-line flavour printed on the card face. */
  hook: string;
  risk: DowntimeRisk;
  rewardType: DowntimeRewardType;
  /** Hex accent for the procedural card face. */
  accent: string;
  /** Single glyph for the procedural card face. */
  glyph: string;
  /** Real artwork once we have it; null means render the procedural face. */
  artUrl: string | null;
}

// ── Seed content ──────────────────────────────────────────────────────────────
// System templates cloned into a campaign as ordinary, private, editable rows.
// Nothing canonical is stored, so the `srd/` storage rules do not apply here.

/** The NPC-shaped fields a seed contributes; the rest get campaign defaults. */
export type DowntimeSeedNpc = Pick<
  NpcInsert,
  | "name"
  | "race"
  | "alignment"
  | "occupation"
  | "appearance"
  | "personality"
  | "backstory"
  | "relationship"
  | "tags"
>;

export interface DowntimeSeed {
  id: string;
  activityKey: string;
  /** Relative weight for the random pick. Must be > 0. */
  weight: number;
  /** Vignette title, e.g. "A friend in low places". */
  title: string;
  vignette: string;
  proposedEffects: DowntimeEffect[];
  npc: DowntimeSeedNpc;
}

// ── DB rows ───────────────────────────────────────────────────────────────────

export interface DowntimeGrant {
  id: string;
  campaign_id: string;
  party_member_id: string;
  granted_by: string | null;
  amount: number;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DowntimeDraw {
  id: string;
  campaign_id: string;
  party_member_id: string;
  activity_key: string;
  status: DowntimeDrawStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface DowntimeDeckBack {
  id: string;
  campaign_id: string;
  activity_key: string;
  reward_type: DowntimeRewardType;
  reward_id: string;
  is_recurring: boolean;
  position: number;
  consumed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DowntimeOutcome {
  id: string;
  campaign_id: string;
  draw_id: string;
  title: string;
  vignette: string | null;
  /** Null together with `reward_id` — an outcome may create nothing. */
  reward_type: DowntimeRewardType | null;
  reward_id: string | null;
  proposed_effects: DowntimeEffect[];
  created_at: string;
  updated_at: string;
}

export type DowntimeGrantInsert = Pick<
  DowntimeGrant,
  "party_member_id" | "amount" | "reason"
>;

export type DowntimeDeckBackInsert = Pick<
  DowntimeDeckBack,
  "activity_key" | "reward_type" | "reward_id" | "is_recurring" | "position"
>;

// ── Draw resolution ───────────────────────────────────────────────────────────

/** What the deck yielded. `null` upstream means the deck had nothing to give. */
export type DrawResult =
  | { source: "prepped"; back: DowntimeDeckBack }
  | { source: "seed"; seed: DowntimeSeed };
