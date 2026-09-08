// Deterministic tile-variant picking for the cartographer map editor.
//
// Pulled out of CartographerEditorView.vue so the hash/seed logic can be
// exercised without Vue reactivity. `pickVariant` receives plain values
// only — never Vue refs — so this module must not import from "vue".
//
// ⚠️ The seed string baked into hash32() by pickVariant chooses which tile
// art every saved cell gets. Changing the seed's shape — the separator, the
// order of parts, a renamed label — silently re-randomises every existing
// saved map's tiles, with typecheck, lint, tests and the build all still
// green. See CartographerEditorView.vue's five pick*Variant wrappers for the
// exact seedLabel each caller passes; tileVariants.test.ts locks the
// resulting strings against hard-coded expected numbers.

export function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * `mapKey` is `mapId || "new"`, resolved by the caller. `seedLabel` is the
 * string baked into the hash — a pack category name for walls/doors/objects,
 * but the literal "floor" or "solid" for the floor and solid-block tools.
 *
 * `count` is the pack's variant count for the *rendering* category, which is
 * not always the same string as `seedLabel`: pickSolidVariant seeds with the
 * literal "solid" while reading its variant count from the "solidBlock"
 * category. That asymmetry is why `seedLabel` and `count` are two separate
 * parameters here rather than one derived from the other — do not "simplify"
 * this into a single category argument.
 */
export function pickVariant(mapKey: string, seedLabel: string, x: number, y: number, count: number): number {
  const safeCount = count || 1;
  return hash32(`${mapKey}|${seedLabel}|${x}|${y}`) % safeCount;
}
