import type { DiceRules } from "@/lib/dice/diceRules";
import { plainDiceRules } from "@/lib/dice/plainDiceRules";
import type { CurrencyConfig } from "@/lib/currency/currency";
import type { RulesetKey } from "@/types/ruleset.types";
import { DND5E_CURRENCY } from "./dnd5e/currency/dnd5eCurrency";
import { dnd5eDiceRules } from "./dnd5e/dice/rules";
import { GENERIC_CURRENCY } from "./generic/genericCurrency";

/**
 * The one place a neutral surface learns what a game system offers (#934).
 * Neutral code may import from `@/systems/` only through this module
 * (`systemBoundary.test.ts`), so adding a system means adding a row here and
 * nowhere in the surfaces.
 *
 * Every system is its own (the maintainer, 6 Nov 2026): 5e 2014 and 5e 2024 are
 * two systems exactly as a later Pathfinder or Level Up A5E would be. What two
 * systems share is declared as compatibility, never assumed from a name.
 * `campaigns.game_system` holds the key; the database's
 * `private.game_systems_compatible` and `private.game_system_edition` hold the
 * same table, and `gameSystemsMirror.test.ts` holds the two equal.
 */
export const GAME_SYSTEM_KEYS = ["dnd5e-2014", "dnd5e-2024", "generic"] as const;
export type GameSystemKey = (typeof GAME_SYSTEM_KEYS)[number];

/**
 * What a system offers beyond the neutral tools (quests, the Atlas and maps,
 * NPCs, factions, notes, the calendar, sessions, the soundboard, chat), which
 * every system has. A surface that needs one is hidden in a system without it.
 */
export const GAME_FEATURES = [
  "party", // characters, their sheets, the party view
  "level-up",
  "encounters", // the encounter builder and runner (CR budgets, death saves)
  "bestiary",
  "spellbook",
  "item-vault",
  "character-codex", // species, backgrounds, classes, feats
  "reliquary", // rules reference and the DM screen
  "stat-blocks", // NPC and monster stat blocks
  "library", // the shared library content of this system's edition
  "rules-ai", // AI generators that write a rules system's mechanics: loot, traps, complications, recipes and inventions
] as const;
export type GameFeature = (typeof GAME_FEATURES)[number];

interface GameSystemDef {
  label: string;
  description: string;
  /** The 5e edition this system's content and characters carry; absent for a system that is not 5e. */
  edition?: RulesetKey;
  /** Systems built to work with this one; compatibility is symmetric, and a system is compatible with itself. */
  compatibleWith: readonly GameSystemKey[];
  features: readonly GameFeature[];
  dice: DiceRules;
  currency: CurrencyConfig;
}

const ALL_5E_FEATURES = GAME_FEATURES;

const SYSTEMS: Record<GameSystemKey, GameSystemDef> = {
  "dnd5e-2014": {
    label: "D&D 5e (2014)",
    description: "The original fifth-edition rules used by existing Grimoire campaigns.",
    edition: "2014",
    compatibleWith: ["dnd5e-2024"],
    features: ALL_5E_FEATURES,
    dice: dnd5eDiceRules,
    currency: DND5E_CURRENCY,
  },
  "dnd5e-2024": {
    label: "D&D 5e (2024)",
    description: "The revised fifth-edition rules, class progressions, and content versions.",
    edition: "2024",
    compatibleWith: ["dnd5e-2014"],
    features: ALL_5E_FEATURES,
    dice: dnd5eDiceRules,
    currency: DND5E_CURRENCY,
  },
  generic: {
    label: "Generic",
    description: "Any system: the world, quests, maps and story tools, with no rules system's sheets or stat blocks.",
    compatibleWith: [],
    features: [],
    dice: plainDiceRules,
    currency: GENERIC_CURRENCY,
  },
};

/** The systems a new campaign can be created with, in the order the form offers them. */
export function listGameSystems(): readonly { key: GameSystemKey; label: string; description: string }[] {
  return GAME_SYSTEM_KEYS.map((key) => ({ key, label: SYSTEMS[key].label, description: SYSTEMS[key].description }));
}

export function isGameSystemKey(value: unknown): value is GameSystemKey {
  return typeof value === "string" && (GAME_SYSTEM_KEYS as readonly string[]).includes(value);
}

export function gameSystemLabel(system: GameSystemKey): string {
  return SYSTEMS[system].label;
}

/** Whether `system` offers `feature`. */
export function systemOffers(system: GameSystemKey, feature: GameFeature): boolean {
  return SYSTEMS[system].features.includes(feature);
}

/** Whether two systems are compatible: the same one, or each declared compatible with the other. */
export function gameSystemsCompatible(a: GameSystemKey, b: GameSystemKey): boolean {
  return a === b || SYSTEMS[a].compatibleWith.includes(b);
}

/** The 5e edition a system's content carries, or undefined for a system that is not 5e. */
export function gameSystemEdition(system: GameSystemKey): RulesetKey | undefined {
  return SYSTEMS[system].edition;
}

/** The system a 5e character's edition belongs to. */
export function editionGameSystem(edition: RulesetKey): GameSystemKey {
  return edition === "2024" ? "dnd5e-2024" : "dnd5e-2014";
}

/** The systems a campaign of `system` may switch to (compatible ones, itself excluded). */
export function switchableGameSystems(system: GameSystemKey): readonly GameSystemKey[] {
  return GAME_SYSTEM_KEYS.filter((other) => other !== system && gameSystemsCompatible(system, other));
}

/** The currency a new campaign of this game system starts with. */
export function defaultCurrencyFor(system: GameSystemKey): CurrencyConfig {
  return SYSTEMS[system].currency;
}

// ── The active campaign's system ────────────────────────────────────────────
// Set by the campaign store whenever the active campaign changes, so the
// non-reactive readers below (the dice roller, the roll-mode directive) need
// no store of their own and this module stays free of Pinia.

let active: GameSystemKey = "dnd5e-2014";

/** Called by the campaign store with the active campaign's system. */
export function setActiveGameSystem(system: GameSystemKey): void {
  active = system;
}

/** The active campaign's game system. Reactive readers use `useGameSystem()` instead. */
export function activeGameSystem(): GameSystemKey {
  return active;
}

/** The dice rules of the active campaign's game system. */
export function activeDiceRules(): DiceRules {
  return SYSTEMS[active].dice;
}
