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
  red:     { tag: "#5a1414", line: "#a83a3a", text: "#e07a7a" }, // fire / damage
  crimson: { tag: "#4a1010", line: "#7a2020", text: "#c45050" }, // hellish — darker red
  orange:  { tag: "#4a2810", line: "#c2500c", text: "#f0a070" }, // ember / elemental
  amber:   { tag: "#5a4010", line: "#c8983a", text: "#e8c067" }, // gold / divine
  yellow:  { tag: "#4a4010", line: "#c8b03a", text: "#e8d067" }, // acid / sulfur
  lime:    { tag: "#3a4a1a", line: "#9bba3a", text: "#caea7a" }, // sickly / poison
  green:   { tag: "#2a3a1f", line: "#7ba055", text: "#a5cf85" }, // natural / beast
  moss:    { tag: "#2a3a2a", line: "#5a8a5a", text: "#85b585" }, // forest / plant
  jade:    { tag: "#1a3a2a", line: "#3aac7a", text: "#7ad8a8" }, // mutant green
  teal:    { tag: "#1f3a35", line: "#3aac9a", text: "#7ad8c8" }, // ethereal / fey
  cyan:    { tag: "#1a3a4a", line: "#3a98c8", text: "#7ac8e0" }, // air / insight
  blue:    { tag: "#244055", line: "#5d8db3", text: "#8cbadc" }, // people / loyal
  violet:  { tag: "#3a2552", line: "#8d65bf", text: "#bda0e0" }, // arcane / occult
  magenta: { tag: "#4a204a", line: "#a040a0", text: "#d878d8" }, // alien
  pink:    { tag: "#4a2030", line: "#a04060", text: "#d878a0" }, // charm
  brown:   { tag: "#3d2820", line: "#a07040", text: "#d4a578" }, // earth / giant
  bronze:  { tag: "#3a2a1a", line: "#8a6a3a", text: "#d4b078" }, // forged / construct
  grey:    { tag: "#2a2a2a", line: "#7a7a7a", text: "#bdbdbd" }, // mundane
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

/** Monster accent by monster type — every type gets a unique primitive */
export const MONSTER_ACCENT: Record<string, Accent> = {
  aberration:  accent.magenta, // alien / wrong
  beast:       accent.green,   // natural animal
  celestial:   accent.amber,   // divine / radiant
  construct:   accent.bronze,  // forged metal
  dragon:      accent.red,     // fire / scales
  elemental:   accent.orange,  // ember / chaos
  fey:         accent.teal,    // ethereal
  fiend:       accent.crimson, // hellish — deeper red
  giant:       accent.brown,   // earth
  humanoid:    accent.blue,    // people
  monstrosity: accent.jade,    // mutant green — distinct from beast
  ooze:        accent.yellow,  // acid
  plant:       accent.moss,    // forest — distinct from beast
  undead:      accent.violet,  // necrotic
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

/** Spell accent by school — every school gets a unique primitive */
export const SPELL_ACCENT: Record<string, Accent> = {
  abjuration:    accent.amber,   // protection — gold
  conjuration:   accent.blue,    // summoning — portal blue
  divination:    accent.cyan,    // insight — clear cyan
  enchantment:   accent.pink,    // charm
  evocation:     accent.red,     // damage / fire
  illusion:      accent.teal,    // ethereal trickery
  necromancy:    accent.violet,  // occult death — purple
  transmutation: accent.green,   // change / nature
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
