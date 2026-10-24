import {
  WORKBENCH_NEUTRAL_SPRITE,
  WORKBENCH_SPRITES,
  WORKBENCH_TAG_ORDER,
  WORKBENCH_TYPE_FALLBACK,
  type WorkbenchSpriteId,
} from "@/data/workbenchArt";

/** The sprite a material is drawn with, and the CSS filter that colours it (null = as painted). */
export interface ResolvedSprite {
  sprite: WorkbenchSpriteId;
  filter: string | null;
}

function normalise(tags: readonly string[]): string[] {
  return tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
}

function tintFilter(sprite: WorkbenchSpriteId, tint: string | undefined): string | null {
  const tints = WORKBENCH_SPRITES[sprite].tints;
  if (!tint || !tints || !Object.hasOwn(tints, tint)) return null;
  return tints[tint];
}

/**
 * Walks the tag order and takes the first entry whose tags the item all
 * carries. Describing tags ("material", "raw"...) are not in the order, so they
 * never pick a sprite alone. Null when no entry matches.
 */
export function spriteForTags(tags: readonly string[]): ResolvedSprite | null {
  const have = normalise(tags);
  const present = new Set(have);
  for (const entry of WORKBENCH_TAG_ORDER) {
    if (!entry.match.every((m) => present.has(m))) continue;
    const tint = entry.tint ?? have.find((t) => !entry.match.includes(t) && tintFilter(entry.sprite, t) !== null);
    return { sprite: entry.sprite, filter: tintFilter(entry.sprite, tint) };
  }
  return null;
}

/** Tags first, then the item type, then the neutral bundle; the fallbacks are never tinted. */
export function spriteForItem(
  item: { tags?: readonly string[] | null; item_type?: string | null } | null | undefined,
): ResolvedSprite {
  const fromTags = item?.tags ? spriteForTags(item.tags) : null;
  if (fromTags) return fromTags;
  const type = item?.item_type;
  const byType = type && Object.hasOwn(WORKBENCH_TYPE_FALLBACK, type) ? WORKBENCH_TYPE_FALLBACK[type] : null;
  return { sprite: byType ?? WORKBENCH_NEUTRAL_SPRITE, filter: null };
}
