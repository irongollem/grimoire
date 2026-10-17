// The set objects the Place tool can stamp, and what the editor calls each thing.
//
// The pack schema owns the six object stamps (`OBJECT_CATEGORIES`); the
// editor adds the stairs and the two loose-litter categories on top, which no
// UI could place before schema 4. Direction for stairs comes from the stamp
// rotation, like every other stamp.

import {
  categoryLabel,
  OBJECT_CATEGORIES,
  type PackCategory,
  type TilePackManifest,
} from "@/cartographer/packSchema";

export const STAMP_CATEGORIES = [
  ...OBJECT_CATEGORIES,
  "stairsUp",
  "stairsDown",
  "rubble",
  "debris",
] as const satisfies readonly PackCategory[];

export type StampCategory = (typeof STAMP_CATEGORIES)[number];

type LabelledManifest = Pick<TilePackManifest, "labels">;

/** A category's name on screen: the pack's own first label ("Old tree"), else the schema's. */
export function stampLabel(manifest: LabelledManifest | null | undefined, category: PackCategory): string {
  const own = manifest?.labels?.[category]?.[0];
  if (own) return own;
  const plain = categoryLabel(category.replace(/^object/, ""));
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/** A `wallDecal` variant's name: the pack's label for it, else "Decal n". */
export function decalLabel(manifest: LabelledManifest | null | undefined, variant: number): string {
  const own = manifest?.labels?.wallDecal?.[variant];
  return own ? own : `Decal ${variant + 1}`;
}

/**
 * One variant of an object type, named for its thumbnail's tooltip: the pack's label for that
 * variant, else "<Type> n". (`stampLabel` reads variant 0's label as the type's own name, so
 * a pack that names only that one still gets numbered siblings.)
 */
export function variantLabel(
  manifest: LabelledManifest | null | undefined,
  category: PackCategory,
  variant: number,
): string {
  const own = manifest?.labels?.[category]?.[variant];
  return own ? own : `${stampLabel(manifest, category)} ${variant + 1}`;
}
