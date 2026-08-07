/**
 * Variant-sweep planning for the admin backfill tool (#619).
 *
 * The organic self-heal (`backfillVariants`) only fires on pages the right
 * person happens to browse — canonical art heals only under an admin's eyes,
 * a user's art only under their own. This module is the deliberate version:
 * enumerate a prefix, compute exactly which originals are missing which
 * variants, and hand the heal loop a worklist. Discovered because 94 of 97
 * `srd/` spell originals shipped with zero variants and nothing could ever
 * fix them.
 *
 * Planning is pure — listings in, worklist out — so the interesting logic is
 * testable without a network. The heal itself is `healVariants` in upload.ts,
 * shared with the organic path so the two can never diverge.
 */

import { bucketWritePolicy } from "@edge-shared/storage-policy.ts";
import { BUCKETS, BUCKET_ENTRIES, VARIANT_WIDTHS, variantPath, type BucketKey, type VariantWidth } from "./buckets";

/**
 * Anything carrying a `_w<digits>` marker before its extension or another
 * marker. Matches ArtPickerModal's filter, including the historical recursive
 * `_w200_w300.png` shapes from an old re-processing bug — those are variants
 * (of variants), never originals to heal.
 */
const VARIANT_MARKER_RE = /_w\d+(?=[._])/;

export interface MissingVariants {
  /** Storage path of the original. */
  readonly path: string;
  readonly missing: readonly VariantWidth[];
}

export interface SweepPlan {
  readonly originals: number;
  readonly complete: number;
  readonly worklist: readonly MissingVariants[];
}

/**
 * Pair every original in `paths` with the variant paths that should exist,
 * and report the gaps. Pure: `paths` is whatever a listing returned.
 */
export function planVariantSweep(paths: readonly string[]): SweepPlan {
  const present = new Set(paths);
  const originals = paths.filter((p) => !VARIANT_MARKER_RE.test(p) && !p.endsWith("/"));

  const worklist: MissingVariants[] = [];
  for (const original of originals) {
    const missing = VARIANT_WIDTHS.filter((w) => !present.has(variantPath(original, w)));
    if (missing.length) worklist.push({ path: original, missing });
  }

  return {
    originals: originals.length,
    complete: originals.length - worklist.length,
    worklist,
  };
}

export interface SweepTarget {
  readonly bucket: BucketKey;
  /** Folder prefix to enumerate — the admin's own uuid or a shared prefix. */
  readonly prefix: string;
}

/**
 * The prefixes worth sweeping for a given admin: every variant-generating
 * image bucket's shared admin prefixes (`srd/` where declared), plus the
 * admin's own folder in each. Other users' folders are deliberately absent —
 * their art heals organically under their own browsing, and healing it here
 * would require write access the storage policies refuse on purpose.
 */
export function sweepTargets(userId: string): SweepTarget[] {
  const targets: SweepTarget[] = [];
  for (const [key, cfg] of BUCKET_ENTRIES) {
    if (!cfg.generateVariants) continue;
    const policy = bucketWritePolicy(cfg.id);
    if (!policy?.clientWrites) continue;
    for (const prefix of policy.adminPrefixes) targets.push({ bucket: key, prefix });
    targets.push({ bucket: key, prefix: userId });
  }
  return targets;
}

/** Display id for a target row. */
export function targetLabel(target: SweepTarget, userId: string): string {
  const folder = target.prefix === userId ? "your uploads" : `${target.prefix}/`;
  return `${BUCKETS[target.bucket].id} · ${folder}`;
}
