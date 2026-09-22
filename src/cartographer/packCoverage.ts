/**
 * Which of a pack's slots actually have art — as opposed to which it *claims*.
 *
 * `validatePack` answers a different question and must not be used for this
 * one. It reports a slot as present when the manifest declares it with a URL;
 * bytes never enter into it. That is correct for what it is for (does this
 * manifest describe a well-formed pack?) and wrong for every question the
 * admin surface asks, because the ten library packs migrated by #889 S7
 * declare their full slot list and contain no images at all. Measured against
 * production 21 Sep 2026, `validatePack(manifest).valid` is `true` for every
 * one of them.
 *
 * So two notions of "missing" coexist on purpose:
 *
 *  - **undeclared** — the manifest does not mention the slot. `validatePack`
 *    sees this; `createGenerationPlan`'s default `missingSlots()` plans it.
 *  - **undrawn** — declared, but no bytes were ever written. Only this module
 *    sees it, and it is the one that matters for "generate this pack's art",
 *    "show me what is still blank", and "may this pack be published?".
 *
 * `byteSize` is the evidence. It is written per slot by the generator as each
 * tile lands (`completeSlot`) and back-filled for the migrated packs by
 * `scripts/seed-library-tile-packs.ts`. Counting it against production
 * reproduces #891's object-level inventory exactly — 0 for the ten empty
 * packs, 24 for `wood-interior`, 29 for `celestial-observatory` — so the
 * manifest can be trusted here without listing the bucket.
 *
 * Read by the admin panel, by `generate_library_pack`'s slot selection and by
 * the publish gate. One module rather than three inline loops: the byteSize
 * walk was originally written into `LibraryTilePackRow.vue` alone, and the
 * moment a second caller needed it the two would have been free to disagree
 * about what "drawn" means — in a place where disagreeing means either
 * publishing a pack full of holes or paying to redraw tiles that exist.
 */
import {
  TILE_PACK_SCHEMA,
  type AssetSlot,
  type PackCategory,
  type TilePackManifest,
} from "./packSchema.ts";
import { enumerateSchemaSlots, slotId, slotRelativePath, type SlotIdentity } from "./authoringPlan.ts";

export interface SlotCoverage {
  readonly slot: SlotIdentity;
  /** `slotId(slot)` — what `createGenerationPlan`'s `selectedSlotIds` takes. */
  readonly id: string;
  /** Path within the pack prefix, e.g. `floor/0.webp` or `wallJoint/L_NE/0.webp`. */
  readonly relativePath: string;
  /** The manifest mentions this slot. */
  readonly declared: boolean;
  /** Declared *and* carrying bytes. */
  readonly drawn: boolean;
  /** Part of the schema's required floor — the 20 tiles a pack cannot render without. */
  readonly required: boolean;
  /** When these bytes were last written; the cache key a reader must use. See `AssetSlot.rev`. */
  readonly rev?: number;
}

export interface CoverageCounts {
  /** Slots carrying bytes. */
  readonly drawn: number;
  /** Slots the manifest declares, drawn or not. */
  readonly declared: number;
  /** Slots in the schema's required floor. */
  readonly required: number;
  /** Required slots carrying bytes — `required - requiredDrawn` is what blocks publication. */
  readonly requiredDrawn: number;
}

const CATEGORY_ORDER = Object.keys(TILE_PACK_SCHEMA.categories) as PackCategory[];

function orderKey(slot: SlotIdentity): string {
  const category = String(CATEGORY_ORDER.indexOf(slot.category)).padStart(3, "0");
  const variant = String(slot.variant).padStart(3, "0");
  return `${category}:${slot.side ?? ""}:${variant}`;
}

function isDrawn(slot: AssetSlot): boolean {
  return typeof slot.byteSize === "number" && slot.byteSize > 0;
}

/**
 * Every slot this pack is answerable for, in schema order.
 *
 * The set is the **union** of the schema's required floor and whatever the
 * manifest declares — deliberately not `enumerateSchemaSlots(true)`, which
 * would list all ~200 slots the v3 schema permits. A schema-1 pack would then
 * show hundreds of blanks for optional hazard and feature categories it never
 * claimed, and "generate everything missing" would quietly mean "drag this
 * pack to v3 and pay for it", which is the opposite of what #900 decided.
 * Optional slots appear here only once a pack has actually declared one.
 */
export function packCoverage(manifest: TilePackManifest): SlotCoverage[] {
  const declared = new Map<string, AssetSlot>();
  const identities = new Map<string, SlotIdentity>();

  for (const [category, slots] of Object.entries(manifest.assets) as [PackCategory, AssetSlot[] | undefined][]) {
    // A manifest may name a category this build's schema does not know (a pack
    // authored against a newer schema). `validatePack` reports those as extras;
    // here they are simply skipped, because nothing downstream — neither the
    // generator's plan nor the publish gate — can act on a slot it has no
    // definition for.
    if (!(category in TILE_PACK_SCHEMA.categories)) continue;
    for (const slot of slots ?? []) {
      const identity: SlotIdentity = {
        category,
        ...(slot.side ? { side: slot.side } : {}),
        variant: slot.variant,
      };
      const id = slotId(identity);
      declared.set(id, slot);
      identities.set(id, identity);
    }
  }

  const required = new Set<string>();
  for (const identity of enumerateSchemaSlots(false)) {
    const id = slotId(identity);
    required.add(id);
    if (!identities.has(id)) identities.set(id, identity);
  }

  return [...identities.values()]
    .sort((a, b) => orderKey(a).localeCompare(orderKey(b)))
    .map((slot) => {
      const id = slotId(slot);
      const asset = declared.get(id);
      return {
        slot,
        id,
        relativePath: slotRelativePath(slot),
        declared: asset !== undefined,
        drawn: asset !== undefined && isDrawn(asset),
        required: required.has(id),
        ...(asset?.rev !== undefined ? { rev: asset.rev } : {}),
      };
    });
}

export function coverageCounts(manifest: TilePackManifest): CoverageCounts {
  const coverage = packCoverage(manifest);
  let drawn = 0;
  let declared = 0;
  let required = 0;
  let requiredDrawn = 0;
  for (const entry of coverage) {
    if (entry.drawn) drawn += 1;
    if (entry.declared) declared += 1;
    if (entry.required) {
      required += 1;
      if (entry.drawn) requiredDrawn += 1;
    }
  }
  return { drawn, declared, required, requiredDrawn };
}

/**
 * Slot ids to hand `createGenerationPlan`'s `selectedSlotIds`.
 *
 * `requiredOnly` is the cost lever #891 asked for: a migrated pack declares
 * ~53 slots but only 20 are load-bearing, and at 12 credits a slot the gap
 * between the two is the difference between filling ten packs and filling
 * four. The admin picks per run; this function just answers both.
 */
export function undrawnSlotIds(
  manifest: TilePackManifest,
  options: { requiredOnly?: boolean } = {},
): string[] {
  return packCoverage(manifest)
    .filter((entry) => !entry.drawn && (!options.requiredOnly || entry.required))
    .map((entry) => entry.id);
}

/**
 * May this pack be published?
 *
 * Every required slot has to carry bytes. Optional and surplus declared slots
 * do not — a pack shipping 8 of its 16 possible floor variants is a complete
 * pack, and holding publication until someone draws the other eight would
 * block every pack forever.
 */
export function hasCompleteArt(manifest: TilePackManifest): boolean {
  const { required, requiredDrawn } = coverageCounts(manifest);
  return required === requiredDrawn;
}
