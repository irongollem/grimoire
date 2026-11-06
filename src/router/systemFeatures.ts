import type { GameFeature } from "@/systems/registry";

/**
 * Which game-system feature a route needs (#934): a Generic campaign has no
 * bestiary, spellbook or character sheets, so their routes are closed there as
 * well as hidden from the nav.
 *
 * Derived from the path, never opted into per route, for the reason `lens.ts`
 * gives for the lens: a `meta.feature` flag on every 5e route fails open for the
 * route someone adds next year without it. A table of path prefixes has the
 * opposite default: a new route under `/monsters` or `/codex` is covered the day
 * it exists, and an unlisted path is neutral, which `systemFeatures.test.ts` pins.
 *
 * The longest matching prefix wins, so `/play/character/levelup` needs
 * `level-up` while the rest of `/play/character` needs `party`. A prefix matches
 * on a segment boundary: `/spells` never claims `/spellsmith`.
 */
const ROUTE_FEATURES: readonly (readonly [prefix: string, feature: GameFeature])[] = [
  // The DM's side.
  ["/party", "party"],
  ["/character-sheet", "party"],
  ["/encounters", "encounters"],
  ["/monsters", "bestiary"],
  ["/spells", "spellbook"],
  ["/vault", "item-vault"],
  ["/rules", "reliquary"],
  ["/codex", "character-codex"],
  ["/species", "character-codex"],
  ["/features", "character-codex"],
  ["/feats", "character-codex"],
  ["/levelup", "character-codex"],
  ["/backgrounds", "character-codex"],
  // The player portal.
  ["/play/character", "party"],
  ["/play/character/levelup", "level-up"],
  ["/play/party", "party"],
  ["/play/inventory", "party"],
  ["/play/spells", "spellbook"],
  ["/play/bestiary", "bestiary"],
  ["/play/rules", "reliquary"],
  ["/play/species", "character-codex"],
  ["/play/background", "character-codex"],
  ["/play/encounter", "encounters"],
];

/** The feature a path needs, or `null` for a neutral path every system has. */
export function featureForPath(path: string): GameFeature | null {
  let best: { length: number; feature: GameFeature } | null = null;
  for (const [prefix, feature] of ROUTE_FEATURES) {
    const matches = path === prefix || path.startsWith(`${prefix}/`);
    if (matches && (best === null || prefix.length > best.length)) {
      best = { length: prefix.length, feature };
    }
  }
  return best?.feature ?? null;
}
