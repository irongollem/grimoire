export const MINI_FORMATS = ["print", "vtt"] as const;
export type MiniFormat = (typeof MINI_FORMATS)[number];

export const MINI_FORMAT_LABELS: Record<MiniFormat, string> = {
  print: "Print",
  vtt:   "VTT",
};

export const MINI_STATUSES = [
  "stylizing",
  "image_ready",
  "sculpting",
  "downloading",
  "ready",
  "failed",
] as const;
export type MiniStatus = (typeof MINI_STATUSES)[number];

export const MINI_STATUS_LABELS: Record<MiniStatus, string> = {
  stylizing:   "Stylizing",
  image_ready: "Image Ready",
  sculpting:   "Sculpting",
  downloading: "Downloading",
  ready:       "Ready",
  failed:      "Failed",
};

export type MiniSourceTable = "npcs" | "monsters" | "party_members";

// Optional formats fetched alongside glb/stl (which get their own columns).
export interface MiniExtraPaths {
  usdz?: string;
  "3mf"?: string;
  obj?: string;
  // Uncomposed figure-only copies, kept alongside the composed model.* files
  // so forge-mini's `set_base` action can recompose onto a different base/
  // scale without re-running Meshy (Phase 4.5, #542).
  raw_glb?: string;
  raw_stl?: string;
}

export interface Mini {
  id: string;
  user_id: string;
  campaign_id: string | null;
  // Snapshot of the source entity's name at forge time (gallery display).
  label: string | null;
  source_table: MiniSourceTable;
  source_id: string;
  format: MiniFormat;
  status: MiniStatus;
  stylized_image_url: string | null;
  /** Durable link to the in-flight style render, if any. */
  stylize_job_id: string | null;
  meshy_task_id: string | null;
  provider: string;
  glb_path: string | null;
  stl_path: string | null;
  extra_paths: MiniExtraPaths;
  // Which curated base (mini-bases.ts registry) the model is composited onto,
  // and its real-world tabletop scale (Phase 4.5, #542). null base_id means
  // not yet composed (or composition fell back to raw-as-model on failure).
  base_id: string | null;
  scale_mm: number;
  thumbnail_url: string | null;
  polycount: number | null;
  sculpt_count: number;
  credits_spent: number;
  reservation_ids: string[] | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * What a player is allowed to see of someone else's mini — the shape returned
 * by the `get_player_visible_mini` RPC. The `minis` table itself is DM-only
 * (see migration `20260805000001`), so this projection deliberately omits the
 * job and credit columns; `label` also arrives null for an NPC whose name the
 * DM has not shared, even when the portrait is shared.
 */
export type PlayerVisibleMini = Pick<
  Mini,
  | "id"
  | "campaign_id"
  | "source_table"
  | "source_id"
  | "format"
  | "status"
  | "provider"
  | "glb_path"
  | "stl_path"
  | "thumbnail_url"
  | "label"
  | "base_id"
  | "scale_mm"
  | "created_at"
  | "updated_at"
>;

// Creation only needs the source + format — everything else is server-managed
// by the forge-mini pipeline (stylize → sculpt → download).
export type MiniInsert = Omit<
  Mini,
  | "id"
  | "user_id"
  | "label"
  | "created_at"
  | "updated_at"
  | "status"
  | "meshy_task_id"
  | "glb_path"
  | "stl_path"
  | "extra_paths"
  | "base_id"
  | "scale_mm"
  | "thumbnail_url"
  | "polycount"
  | "sculpt_count"
  | "credits_spent"
  | "reservation_ids"
  | "error"
  | "stylized_image_url"
  | "stylize_job_id"
>;
export type MiniUpdate = Partial<MiniInsert>;

export const SIMULACRUM_MODES = ["hidden", "teaser", "live"] as const;
export type SimulacrumMode = (typeof SIMULACRUM_MODES)[number];

export interface SimulacrumConfig {
  id: number;
  mode: SimulacrumMode;
  updated_at: string;
}

export interface FeatureInterest {
  id: string;
  user_id: string;
  feature: string;
  created_at: string;
}

// 1 initial sculpt + 2 free re-sculpts, per mini_sculpt's 500-credit bundle.
export const MAX_SCULPTS = 3;

// The feature_interest key for the Simulacrum demand gate — one constant so
// the teaser's register call and the admin counter can never typo-diverge.
export const SIMULACRUM_FEATURE_KEY = "simulacrum";
