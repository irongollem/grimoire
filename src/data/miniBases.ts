/**
 * Frontend mirror of the mini base registry.
 *
 * KEEP IN SYNC with `supabase/functions/_shared/mini-bases.ts` — the edge
 * runtime (Deno) and the app (Vite/browser) can't share a single module, so
 * this data is deliberately duplicated across the two runtimes. Any base
 * added/renamed/recolored there must be mirrored here (and vice versa).
 *
 * Base assets themselves are first-party, generated with the sister repo
 * `plinth` (desktop base-generator tool) — see SIMULACRUM_PLAN.md §1 / #542.
 */

export interface MiniBase {
  id: string;
  label: string;
  color: string;
}

export const MINI_BASES: MiniBase[] = [
  { id: "plain", label: "Plain", color: "#8a8a8a" },
  { id: "lava-flow", label: "Lava Flow", color: "#7a2e1e" },
  // Future bases (curated 25mm library, dropped in as `plinth` output lands):
  // { id: "stone", label: "Stone", color: "#6b6459" },
  // { id: "wood", label: "Wood Plank", color: "#8b5e34" },
  // { id: "grass", label: "Grass", color: "#4a7c3a" },
  // { id: "water", label: "Water", color: "#3a6ea5" },
  // { id: "lava", label: "Lava", color: "#c1440e" },
];

export const DEFAULT_BASE_ID = "plain";
