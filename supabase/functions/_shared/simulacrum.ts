/**
 * Pure Simulacrum state-machine + Meshy param logic (portrait → 3D mini
 * pipeline, SIMULACRUM_PLAN.md). No Deno/Supabase imports on purpose — this
 * module is unit-tested with vitest (simulacrum.test.ts) and imported
 * unmodified by the Deno edge functions forge-mini and poll-meshy-jobs.
 */

// Keep in sync with src/types/mini.types.ts MAX_SCULPTS: 1 initial (paid)
// sculpt + 2 free re-sculpts, bundled into the mini_sculpt 500-credit charge
// (SIMULACRUM_PLAN.md §5).
export const MAX_SCULPTS = 3;

// Mirrors the `minis.status` check constraint — see
// supabase/migrations/20260718000001_simulacrum_foundations.sql.
export type MiniStatusB =
  | "stylizing"
  | "image_ready"
  | "sculpting"
  | "downloading"
  | "ready"
  | "failed";

/**
 * True while a stylize (re-)roll is allowed. Tweaking the source image is
 * fine before sculpting starts, after it fails, or between sculpt attempts
 * once a model exists — but never while a Meshy task is actually in flight.
 */
export function canStylize(status: MiniStatusB): boolean {
  return (
    status === "stylizing" ||
    status === "image_ready" ||
    status === "failed" ||
    status === "ready"
  );
}

/**
 * The first, PAID sculpt: only from a fresh (never-sculpted) stylized image,
 * or a retry after that first attempt failed — a failed first sculpt releases
 * its credit hold (see forge-mini), so retrying legitimately re-reserves.
 */
export function canSculpt(row: { status: MiniStatusB; sculpt_count: number }): boolean {
  return row.sculpt_count === 0 && (row.status === "image_ready" || row.status === "failed");
}

/**
 * A free re-sculpt retry on an already-sculpted mini, capped at MAX_SCULPTS
 * total attempts (SIMULACRUM_PLAN.md §5 — re-sculpts are free, we absorb the
 * Meshy cost, capped at 2 because we pay per retry). Besides "ready", the
 * "image_ready" state also qualifies once a sculpt has completed: a paid
 * re-stylize after sculpting (canStylize allows it) drops the row back to
 * image_ready with sculpt_count >= 1, and sculpting the NEW image must be a
 * free retry, not an impossible state — canSculpt requires sculpt_count 0.
 */
export function canResculpt(row: { status: MiniStatusB; sculpt_count: number }): boolean {
  return (
    (row.status === "ready" || row.status === "image_ready") &&
    row.sculpt_count >= 1 &&
    row.sculpt_count < MAX_SCULPTS
  );
}

export type MeshyTaskStatus = "SUCCEEDED" | "FAILED" | "CANCELED" | "PENDING" | "IN_PROGRESS";

export type SculptOutcome =
  | { kind: "wait" }
  | { kind: "complete" }
  | { kind: "fail"; nextStatus: "ready" | "failed"; releaseHold: true };

/**
 * Interprets a polled Meshy task status (poll-meshy-jobs) into what the
 * `minis` row should do next. FAILED/CANCELED are explicit Meshy failures; a
 * task still PENDING/IN_PROGRESS past STALE_SCULPT_MS is treated the same way
 * (Meshy tasks that never resolve must not keep a mini stuck forever). A
 * failed RE-sculpt keeps the previous model (nextStatus 'ready'); a failed
 * FIRST sculpt has no model to fall back to (nextStatus 'failed').
 */
export function resolveSculptOutcome(input: {
  taskStatus: MeshyTaskStatus;
  hasExistingModel: boolean;
  stale: boolean;
}): SculptOutcome {
  const { taskStatus, hasExistingModel, stale } = input;
  if (taskStatus === "SUCCEEDED") return { kind: "complete" };
  if (taskStatus === "FAILED" || taskStatus === "CANCELED" || stale) {
    return { kind: "fail", nextStatus: hasExistingModel ? "ready" : "failed", releaseHold: true };
  }
  return { kind: "wait" };
}

export type MeshFormat = "glb" | "stl" | "obj" | "usdz" | "3mf";

export interface MeshyParams {
  should_texture: boolean;
  topology?: "triangle" | "quad";
  target_polycount: number;
  target_formats: MeshFormat[];
  ai_model: "latest";
}

/**
 * Per-format Meshy image-to-3d params (SIMULACRUM_PLAN.md §2 table). Print
 * minis are untextured/high-poly for resin printing; VTT minis are textured/
 * low-poly for virtual tabletops. VTT's polycount is a provisional default
 * (§8.2) — tune during Phase 4 live smoke testing.
 */
export function meshyParamsForFormat(format: "print" | "vtt"): MeshyParams {
  if (format === "print") {
    return {
      should_texture: false,
      topology: "triangle",
      target_polycount: 200_000,
      target_formats: ["stl", "3mf", "glb"],
      ai_model: "latest",
    };
  }
  return {
    should_texture: true,
    target_polycount: 20_000,
    target_formats: ["glb", "usdz"],
    ai_model: "latest",
  };
}

// A Meshy task that never resolves (PENDING/IN_PROGRESS) past this window is
// treated as failed by the poller so a mini can never get stuck sculpting
// forever (SIMULACRUM_PLAN.md §4).
export const STALE_SCULPT_MS = 30 * 60 * 1000;

export function isStale(updatedAtIso: string, nowMs: number): boolean {
  const updatedMs = Date.parse(updatedAtIso);
  if (Number.isNaN(updatedMs)) return false;
  return nowMs - updatedMs > STALE_SCULPT_MS;
}
