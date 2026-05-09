import type { Npc } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";
import type { Item } from "@/types/item.types";
import type { Spell } from "@/types/spell.types";

/**
 * Shared Card Forge tokens — the bits both Inked and Modern designs use.
 *
 * Edit `paper` to retune body-text scale; edit the per-key maps below
 * (NPC_ACCENT, MONSTER_ACCENT, ITEM_ACCENT, SPELL_ACCENT) to assign
 * colours to entity sub-keys (rarity, school, monster_type, etc.).
 *
 * Each accent has THREE roles:
 *   - tag:  dark pill background (kind label badges)
 *   - line: medium tint for borders, rails, headers, accent strips
 *   - text: bright readable label colour on dark surfaces
 *
 * Both designs read from the same accents, so a colour assignment here
 * (e.g. necromancy → violet) renders identically in Inked and Modern.
 */

export const paper = {
  /** Primary text */
  cream: "#ece2cc",
  /** Secondary / body text */
  dim: "#cfc4ad",
  /** Muted / footer */
  faint: "#9b9079",
  /** Ghost / placeholder */
  whisper: "#6e6552",
};

/** Ability-modifier colour scale (shared) */
export const statPos = "#9be09b";
export const statNeg = "#f0a0a0";

/**
 * Accent primitives. Each is a 3-role colour set tuned to be readable
 * on the dark card surfaces. Add a new primitive here if you need more
 * variation, then reference it in the per-key maps below.
 */
const accent = {
  red:    { tag: "#5a1414", line: "#a83a3a", text: "#e07a7a" },
  orange: { tag: "#4a2810", line: "#c2500c", text: "#f0a070" },
  amber:  { tag: "#5a4010", line: "#c8983a", text: "#e8c067" },
  green:  { tag: "#2a3a1f", line: "#7ba055", text: "#a5cf85" },
  teal:   { tag: "#1f3a35", line: "#3aac9a", text: "#7ad8c8" },
  blue:   { tag: "#244055", line: "#5d8db3", text: "#8cbadc" },
  violet: { tag: "#3a2552", line: "#8d65bf", text: "#bda0e0" },
  pink:   { tag: "#4a2030", line: "#a04060", text: "#d878a0" },
  brown:  { tag: "#3d2820", line: "#a07040", text: "#d4a578" },
  grey:   { tag: "#2a2a2a", line: "#7a7a7a", text: "#bdbdbd" },
} as const;

export type Accent = (typeof accent)[keyof typeof accent];

/** NPC accent by relationship */
export const NPC_ACCENT: Record<string, Accent> = {
  ally:    accent.blue,
  enemy:   accent.red,
  neutral: accent.grey,
  unknown: accent.violet,
};
const DEFAULT_NPC_ACCENT = accent.blue;

/** Monster accent by monster type */
export const MONSTER_ACCENT: Record<string, Accent> = {
  aberration:  accent.violet,
  beast:       accent.green,
  celestial:   accent.amber,
  construct:   accent.brown,
  dragon:      accent.red,
  elemental:   accent.orange,
  fey:         accent.teal,
  fiend:       accent.pink,
  giant:       accent.brown,
  humanoid:    accent.blue,
  monstrosity: accent.green,
  ooze:        accent.green,
  plant:       accent.green,
  undead:      accent.violet,
};
const DEFAULT_MONSTER_ACCENT = accent.red;

/** Item accent by rarity — follows D&D 5e convention (uncommon=green,
 *  rare=blue, very rare=purple, legendary=gold/amber, artifact=red). */
export const ITEM_ACCENT: Record<string, Accent> = {
  mundane:   accent.grey,
  common:    accent.grey,
  uncommon:  accent.green,
  rare:      accent.blue,
  very_rare: accent.violet,
  legendary: accent.amber,
  artifact:  accent.red,
};
const DEFAULT_ITEM_ACCENT = accent.grey;

/** Spell accent by school */
export const SPELL_ACCENT: Record<string, Accent> = {
  abjuration:    accent.amber,   // protection — gold
  conjuration:   accent.blue,    // summoning — portal blue
  divination:    accent.violet,  // mystical insight — purple
  enchantment:   accent.pink,    // charm — pink
  evocation:     accent.red,     // damage — red
  illusion:      accent.teal,    // ethereal trickery — teal
  necromancy:    accent.violet,  // occult death magic — purple
  transmutation: accent.green,   // change / nature — green
};
const DEFAULT_SPELL_ACCENT = accent.blue;

export function accentForNpc(d: Npc): Accent {
  return NPC_ACCENT[d.relationship] ?? DEFAULT_NPC_ACCENT;
}
export function accentForMonster(d: Monster): Accent {
  return MONSTER_ACCENT[d.monster_type] ?? DEFAULT_MONSTER_ACCENT;
}
export function accentForItem(d: Item): Accent {
  return ITEM_ACCENT[d.rarity] ?? DEFAULT_ITEM_ACCENT;
}
export function accentForSpell(d: Spell): Accent {
  return SPELL_ACCENT[d.school] ?? DEFAULT_SPELL_ACCENT;
}
