/**
 * The lane abstraction for #889 S3: the generation engine in `index.ts` now
 * produces two different kinds of pack —
 *
 *  - "user": a private, Pro-gated pack owned by one DM inside one campaign,
 *    stored in the `tile-packs` bucket under `user_tile_packs`.
 *  - "library": a shared, admin-authored pack in no campaign, charging no
 *    credits, stored in the `library-tile-packs` bucket under
 *    `library_tile_packs`.
 *
 * Every place the engine used to hardcode "tile-packs" or hand-build a
 * `${userId}/${packId}/v${packVersion}` prefix now asks for a `PackTarget`
 * instead, resolved once per run right after the run's lane is determined.
 * Colocated here (rather than inline in index.ts) so the prefix math — the
 * one part of this that is pure — can be unit-tested without pulling in
 * Deno's `serve`/`createClient` runtime, the same reasoning as
 * `tileProvenance.ts`.
 */
import type { TilePackManifest } from "../../../src/cartographer/packSchema.ts";
import { tilePackSlug } from "../_shared/tilePackGeneration.ts";

export type PackLane = "user" | "library";

export interface PackTarget {
  readonly lane: PackLane;
  readonly bucket: "tile-packs" | "library-tile-packs";
  /** Prefix every object of this pack sits under. */
  readonly prefix: string;
  readonly table: "user_tile_packs" | "library_tile_packs";
  /** Primary key of the row in `table`. */
  readonly rowId: string;
  readonly packId: string;
  readonly packVersion: number;
  readonly manifest: TilePackManifest;
}

export type PackPrefixInput =
  | { readonly lane: "user"; readonly userId: string; readonly packId: string; readonly packVersion: number }
  | { readonly lane: "library"; readonly rowId: string; readonly packVersion: number };

/**
 * Pure prefix builder, unit-tested in `packTarget.test.ts`.
 *
 *  - user lane   → `${userId}/${packId}/v${packVersion}` — unchanged from
 *    before this story; every existing user-pack object keeps its path.
 *  - library lane → `${rowId}/v${packVersion}` — the pack row's **uuid**, and
 *    **no user id segment**.
 *
 * Both halves of that are load-bearing.
 *
 * No user id, because `collectUserObjects` in `_shared/storage-inventory.ts`
 * sweeps every bucket for the `<userId>/` prefix on GDPR export and account
 * erasure. A library pack filed under the authoring admin's uuid would be
 * swept up by that scan and deleted for every DM in the app the day that
 * admin's account is erased — the same trap CLAUDE.md records for canonical
 * `srd/` art.
 *
 * The uuid rather than the pack's slug, because a library pack is authored in
 * the open: tiles land in the bucket slot by slot, days or weeks before anyone
 * publishes it. Every registry bucket's bytes are read back through the CDN
 * Worker, which consults neither storage RLS nor the bucket's `public` flag —
 * so in this app bytes are world-readable by URL and confidentiality comes from
 * the path being unguessable, which is why every other bucket keys objects by
 * uuid too. A slug path would have made an unannounced pack's every tile
 * fetchable by anyone who guessed its name. The row's own id costs nothing and
 * survives a rename; the reader always has the row in hand before it needs the
 * path, so nothing has to reconstruct this from the pack's name.
 */
export function packPrefix(input: PackPrefixInput): string {
  return input.lane === "user"
    ? `${input.userId}/${input.packId}/v${input.packVersion}`
    : `${input.rowId}/v${input.packVersion}`;
}

export function userPackTarget(pack: {
  readonly id: string;
  readonly user_id: string;
  readonly pack_id: string;
  readonly pack_version: number;
  readonly manifest: TilePackManifest;
}): PackTarget {
  return {
    lane: "user",
    bucket: "tile-packs",
    prefix: packPrefix({ lane: "user", userId: pack.user_id, packId: pack.pack_id, packVersion: pack.pack_version }),
    table: "user_tile_packs",
    rowId: pack.id,
    packId: pack.pack_id,
    packVersion: pack.pack_version,
    manifest: pack.manifest,
  };
}

export function libraryPackTarget(pack: {
  readonly id: string;
  readonly pack_id: string;
  readonly pack_version: number;
  readonly manifest: TilePackManifest;
}): PackTarget {
  return {
    lane: "library",
    bucket: "library-tile-packs",
    prefix: packPrefix({ lane: "library", rowId: pack.id, packVersion: pack.pack_version }),
    table: "library_tile_packs",
    rowId: pack.id,
    packId: pack.pack_id,
    packVersion: pack.pack_version,
    manifest: pack.manifest,
  };
}

/**
 * Mints a `library_tile_packs.pack_id` from a requested slug or name, or
 * returns `null` when the result would be invalid: empty after slugging, or
 * starting with `custom-` (that prefix is reserved for `user_tile_packs` —
 * see the disjoint-id-space comment on the `library_tile_packs` table,
 * 20260917224309 — so a library pack can never collide with a user pack's
 * identity even though both are read by the same `(pack_id, pack_version)`
 * `PackRef`).
 */
export function mintLibraryPackId(requested: string): string | null {
  const slug = tilePackSlug(requested);
  if (!slug || slug.startsWith("custom-")) return null;
  return slug;
}
