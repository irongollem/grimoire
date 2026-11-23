// Open5e can put the crossbow's weight class after the weapon name.
const LIGHT_CROSSBOW_NAMES = ["light crossbow", "crossbow, light"] as const;

export function itemCatalogueNames(name: string): readonly [string, ...string[]] {
  const key = name.trim().toLowerCase();
  return LIGHT_CROSSBOW_NAMES.some((alias) => alias === key) ? LIGHT_CROSSBOW_NAMES : [key];
}

/** A free-text inventory row has no identity to disambiguate two catalogue items. */
export function uniqueCatalogueMatch<T extends { name: string }>(name: string, items: readonly T[]): T | null {
  const names = itemCatalogueNames(name);
  const hits = items.filter((item) => names.includes(item.name.trim().toLowerCase()));
  return hits.length === 1 ? hits[0] : null;
}
