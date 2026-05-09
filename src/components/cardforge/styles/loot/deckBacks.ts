/**
 * Built-in loot-deck back designs. Each entry ships in two sizes
 * (`tc` for 63×88mm trade cards, `tarot` for 70×120mm), so the right
 * aspect ratio is loaded for whichever card size the user picked.
 *
 * Files live in `public/assets/cardforge/loot-backs/` and are served
 * verbatim by the edge CDN.
 *
 * To add a new deck:
 *   1. Drop a `<slug>-tc.webp` and `<slug>-tarot.webp` in the folder
 *      (1061×1482 and 958×1642 respectively, q≈90).
 *   2. Add an entry to BUILTIN_DECK_BACKS below.
 */

import type { CardSizeId } from "@/stores/cardForge";

export interface DeckBack {
  /** Stable id used in localStorage / store state */
  id: string;
  /** Customer-facing name */
  name: string;
  /** One-line evocative blurb */
  blurb: string;
  /** Public URLs per card size */
  urls: Record<CardSizeId, string>;
}

const base = "/assets/cardforge/loot-backs";

export const BUILTIN_DECK_BACKS: DeckBack[] = [
  {
    id: "arcane-vortex",
    name: "Arcane Vortex",
    blurb: "A swirling cyan portal cradled in gilded scrollwork.",
    urls: {
      mtg: `${base}/arcane-vortex-tc.webp`,
      tarot: `${base}/arcane-vortex-tarot.webp`,
    },
  },
  {
    id: "twin-grimoires",
    name: "Twin Grimoires",
    blurb: "Mirrored spell tomes bound with violet and gold.",
    urls: {
      mtg: `${base}/twin-grimoires-tc.webp`,
      tarot: `${base}/twin-grimoires-tarot.webp`,
    },
  },
  {
    id: "cartographers-key",
    name: "Cartographer's Key",
    blurb: "A compass rose, crossed keys, and an old map.",
    urls: {
      mtg: `${base}/cartographers-key-tc.webp`,
      tarot: `${base}/cartographers-key-tarot.webp`,
    },
  },
  {
    id: "frostbound-portal",
    name: "Frostbound Portal",
    blurb: "Ice crystals and blue runic chains around a frozen gate.",
    urls: {
      mtg: `${base}/frostbound-portal-tc.webp`,
      tarot: `${base}/frostbound-portal-tarot.webp`,
    },
  },
  {
    id: "dragons-watch",
    name: "Dragon's Watch",
    blurb: "An emerald serpentine eye behind crossed brass keys.",
    urls: {
      mtg: `${base}/dragons-watch-tc.webp`,
      tarot: `${base}/dragons-watch-tarot.webp`,
    },
  },
  {
    id: "alchemists-wheel",
    name: "Alchemist's Wheel",
    blurb: "Potions, scrolls, and daggers wheeling around the DG mark.",
    urls: {
      mtg: `${base}/alchemists-wheel-tc.webp`,
      tarot: `${base}/alchemists-wheel-tarot.webp`,
    },
  },
];

/** Default deck back when loot mode is first enabled. */
export const DEFAULT_DECK_BACK_ID = "arcane-vortex";

export function deckBackById(id: string): DeckBack | undefined {
  return BUILTIN_DECK_BACKS.find((d) => d.id === id);
}
