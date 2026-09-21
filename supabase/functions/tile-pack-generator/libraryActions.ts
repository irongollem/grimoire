/**
 * Pure decision logic for the three library-pack admin actions added by #900
 * S2 (`update_library_pack`, `upload_library_tile`, `generate_library_pack`).
 *
 * Colocated here rather than inline in `index.ts` for the same reason as
 * `packTarget.ts` and `tileProvenance.ts`: `index.ts` creates its
 * service-role client at module scope from `Deno.env.get(...)`, which throws
 * under vitest/Node (`Deno` is undefined there), so nothing that file exports
 * can be unit-tested directly. Everything below is pure — no `Deno`, no
 * network, no DB — and is imported by `index.ts` rather than duplicated.
 */
import { slotId, type SlotIdentity } from "../../../src/cartographer/authoringPlan.ts";
import type { PackCategory } from "../../../src/cartographer/packSchema.ts";

/**
 * The three tiles a proof phase is built from. Kept as a structured list
 * (rather than the bare string `Set` this replaces) because
 * `styleReferences`'s existing-pack fallback needs them as slots it can turn
 * back into storage paths via `slotRelativePath`, not just as ids to compare
 * against. `PROOF_SLOTS` is derived from this list — never hand-maintained
 * alongside it — so the two cannot drift apart.
 */
export const PROOF_SLOT_IDENTITIES: SlotIdentity[] = [
  { category: "floor", variant: 0 },
  { category: "wallSegmentH", variant: 0 },
  { category: "solidBlock", variant: 0 },
];

export const PROOF_SLOTS = new Set(PROOF_SLOT_IDENTITIES.map(slotId));

/**
 * Whether a freshly planned generation run should open in the proof phase.
 *
 * Normally yes — a new pack has no approved style yet, so its floor/wall/
 * solidBlock tiles must be drawn and approved before anything else generates
 * against them as a reference. But `generate_library_pack` can also be asked
 * to fill the *remaining* gaps in a pack that already has those three tiles
 * (e.g. the partially-drawn `wood-interior`), and a plan built from
 * `undrawnSlotIds` then contains none of them. A run left in `proof_pending`
 * with zero proof jobs can never reach `awaiting_approval` — that transition
 * only fires when `proofRemaining === 0 && run.status === "proof_pending"`
 * inside `completeSlot`, which needs at least one proof job to have existed
 * — so it would sit there forever, unadvanceable by either the UI or the
 * approve action. Skipping straight to `"generating"` is what lets a
 * gap-filling run actually run.
 */
export function initialGenerationStatus(jobs: readonly { id: string }[]): "proof_pending" | "generating" {
  const proofJobCount = jobs.filter((job) => PROOF_SLOTS.has(job.id)).length;
  return proofJobCount === 0 ? "generating" : "proof_pending";
}

export interface ParsedTileSlot {
  ok: true;
  slot: SlotIdentity;
}
export interface RejectedTileSlot {
  ok: false;
}

/**
 * Validates an `upload_library_tile` request's `slot` field against the set
 * of legal schema slot ids (`enumerateSchemaSlots(true).map(slotId)`, built
 * once by the caller and passed in so this stays pure).
 *
 * Shape is checked before identity: `variant` must be a non-negative integer
 * and `side`, when present, a string — checked ahead of building the
 * `SlotIdentity` so a malformed body (a float variant, a numeric side) never
 * reaches `slotId`, which assumes well-formed input.
 */
export function parseTileSlot(raw: unknown, knownSlotIds: ReadonlySet<string>): ParsedTileSlot | RejectedTileSlot {
  if (!raw || typeof raw !== "object") return { ok: false };
  const { category, side, variant } = raw as Record<string, unknown>;
  if (typeof category !== "string") return { ok: false };
  if (side !== undefined && typeof side !== "string") return { ok: false };
  if (typeof variant !== "number" || !Number.isInteger(variant) || variant < 0) return { ok: false };
  const slot: SlotIdentity = { category: category as PackCategory, ...(side ? { side } : {}), variant };
  if (!knownSlotIds.has(slotId(slot))) return { ok: false };
  return { ok: true, slot };
}

export interface LibraryPackPatch {
  name?: string;
  description?: string;
  license_keys?: string[];
  /** `null` clears the column; `undefined` means "not supplied". */
  content_source_key?: string | null;
  sort_order?: number;
}

export type PatchValidationError =
  | "invalid_pack_concept"
  | "invalid_license_keys"
  | "invalid_content_source"
  | "invalid_sort_order"
  | "no_changes";

export type PatchValidationResult =
  | { ok: true; patch: LibraryPackPatch }
  | { ok: false; error: PatchValidationError };

/**
 * Field-level validation for `update_library_pack`'s partial-update body.
 *
 * Deliberately stops short of checking `content_source_key` against
 * `content_sources` — that is a DB read, so it stays in `index.ts`, done only
 * once this function has already confirmed the field is a plausible key
 * (`null` or a non-empty string).
 */
export function validateLibraryPackPatch(body: Record<string, unknown>): PatchValidationResult {
  const patch: LibraryPackPatch = {};
  let touched = false;

  if (body.name !== undefined) {
    touched = true;
    if (typeof body.name !== "string") return { ok: false, error: "invalid_pack_concept" };
    const name = body.name.trim();
    if (!name || name.length > 100) return { ok: false, error: "invalid_pack_concept" };
    patch.name = name;
  }

  if (body.description !== undefined) {
    touched = true;
    if (typeof body.description !== "string") return { ok: false, error: "invalid_pack_concept" };
    const description = body.description.trim();
    if (description.length > 1000) return { ok: false, error: "invalid_pack_concept" };
    patch.description = description;
  }

  if (body.license_keys !== undefined) {
    touched = true;
    const licenseKeys = body.license_keys;
    if (!Array.isArray(licenseKeys) || !licenseKeys.every((key) => typeof key === "string" && key.length > 0)) {
      return { ok: false, error: "invalid_license_keys" };
    }
    patch.license_keys = licenseKeys;
  }

  if (body.content_source_key !== undefined) {
    touched = true;
    if (body.content_source_key !== null && typeof body.content_source_key !== "string") {
      return { ok: false, error: "invalid_content_source" };
    }
    patch.content_source_key = body.content_source_key as string | null;
  }

  if (body.sort_order !== undefined) {
    touched = true;
    const sortOrder = body.sort_order;
    if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder) || sortOrder < 0) {
      return { ok: false, error: "invalid_sort_order" };
    }
    patch.sort_order = sortOrder;
  }

  if (!touched) return { ok: false, error: "no_changes" };
  return { ok: true, patch };
}
