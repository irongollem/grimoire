/**
 * Centralised storage bucket registry + upload helpers.
 *
 * `@/lib/storage` was a single module until #577 stage 2 gave it a second
 * backing store; splitting it kept the file under the 600-line guidance in
 * CLAUDE.md while leaving every existing import site untouched. The public API
 * is exactly what it was — this barrel is the module's boundary, and nothing
 * outside it should reach into a sibling file directly.
 *
 *   buckets.ts  the registry: ids, limits, MIME allowlists, variant widths
 *   urls.ts     building and parsing public URLs (origin shape + CDN shape)
 *   upload.ts   uploads, size variants, XMP provenance inheritance, backfill
 *   remove.ts   deletes, by path and by public URL
 *   list.ts     merged both-stores enumeration of a user's own objects
 *   r2.ts       the R2 transport: presigned PUTs, deletes and listing
 */

export {
  BUCKETS,
  VARIANT_WIDTHS,
  variantPath,
  type BucketConfig,
  type BucketKey,
  type VariantWidth,
} from "./buckets";

export {
  getPublicUrl,
  isBucketUrl,
  parsePublicUrl,
  type ParsedPublicUrl,
} from "./urls";

export {
  uploadToBucket,
  uploadWithVariants,
  readEmbeddedXmp,
  inheritXmpIntoVariant,
  backfillVariants,
  healVariants,
  type HealResult,
  type UploadParams,
  type UploadWithVariantsParams,
} from "./upload";

export {
  deleteFromBucket,
  removeByPublicUrl,
  deleteByPublicUrl,
} from "./remove";

export { listOwnedPaths, listPathsUnder } from "./list";
export { planVariantSweep, sweepTargets, targetLabel, type SweepPlan, type SweepTarget, type MissingVariants } from "./sweep";
