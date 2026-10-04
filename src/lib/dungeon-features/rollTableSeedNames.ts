/**
 * Which example roll tables a DM does not have yet.
 *
 * Names are compared on their letters and digits only. The seed names are
 * copy, and copy gets edited: #968 turned "Dungeon Level 1–2 — Wandering" into
 * "Dungeon Level 1–2: Wandering", and an exact comparison then read every DM's
 * existing copy as missing and populated a duplicate beside it. Punctuation and
 * spacing never tell two example tables apart, so they are not part of the key.
 */
export function seedNameKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function missingSeeds<T extends { name: string }>(
  seeds: readonly T[],
  existingNames: readonly string[],
): T[] {
  const have = new Set(existingNames.map(seedNameKey));
  return seeds.filter((seed) => !have.has(seedNameKey(seed.name)));
}
