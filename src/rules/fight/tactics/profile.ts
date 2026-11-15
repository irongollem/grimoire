// A creature's tactical profile (#1203): how it chooses what to do with its turn, resolved from the stat block.
//
// APP CONVENTION throughout. The D&D books do not say how a monster thinks (the DMG only advises the DM to play
// creatures by their Intelligence and Wisdom), so every line below is this app's own rule, written as a small named
// block so a maintainer can find and change one. An authored `statBlock.tactics` field always wins over the derived one.
//
// Pure and edge-importable (relative `.ts` imports only).

import { walkingSpeed } from "../../../lib/movement.ts";
import type { MonsterStatBlock, MonsterTactics, MonsterType } from "../../../types/monster.types.ts";
import type { StatBlockEntry } from "../../../types/statBlock.types.ts";
import type { TurnOptionKind } from "../terrain/turnOptions.ts";

export type CleverTier = "instinct" | "simple" | "trained" | "tactical";
export type TacticalRole = NonNullable<MonsterTactics["role"]>;
export type TargetRule = NonNullable<MonsterTactics["targets"]>;
export type CoverRule = NonNullable<MonsterTactics["cover"]>;
export type MoraleRule = NonNullable<MonsterTactics["morale"]>;

export interface TacticalProfile {
  tier: CleverTier;
  role: TacticalRole;
  targets: TargetRule;
  morale: MoraleRule;
  cover: CoverRule;
  /** The kinds of turn this creature is offered; the gate drops every other kind. */
  offers: ReadonlySet<TurnOptionKind>;
  /** The DM's own line, carried through for the prompt; null when there is none. */
  note: string | null;
}

/**
 * RULE cleverness-tier: Intelligence decides how much of the turn menu a creature can see. 3 or less is instinct, 4 to
 * 7 simple, 8 to 11 trained, 12 or more tactical.
 */
export function cleverTier(int: number): CleverTier {
  if (int <= 3) return "instinct";
  if (int <= 7) return "simple";
  if (int <= 11) return "trained";
  return "tactical";
}

/** RULE cover: only a creature that thinks about it uses cover. Trained takes it when it is cheap, tactical fights from it. */
const COVER_BY_TIER: Record<CleverTier, CoverRule> = { instinct: "ignores", simple: "ignores", trained: "when_cheap", tactical: "fights_from" };

/** RULE targets: the dim go for what is closest, the trained for the weak, the tactical for whoever holds a spell up. */
const TARGETS_BY_TIER: Record<CleverTier, TargetRule> = { instinct: "nearest", simple: "nearest", trained: "most_wounded", tactical: "spellcasters_first" };

/** RULE offers: each tier adds one kind of turn to the one below. Flee is there from the start: even an animal bolts. */
const OFFERS_BY_TIER: Record<CleverTier, readonly TurnOptionKind[]> = {
  instinct: ["attack", "dash", "move", "flee"],
  simple: ["attack", "dash", "move", "flee", "dodge"],
  trained: ["attack", "dash", "move", "flee", "dodge", "disengage"],
  tactical: ["attack", "dash", "move", "flee", "dodge", "disengage", "hide"],
};

/** RULE fast: a walking speed of 40 ft or more makes a skirmisher. */
const SKIRMISHER_SPEED_FEET = 40;

/** RULE morale-fearless: these creature types never break. So does anything with Intelligence 2 or less. */
const FEARLESS_TYPES: readonly MonsterType[] = ["undead", "construct", "ooze", "plant"];
const FEARLESS_INTELLIGENCE = 2;
/** RULE morale-default: everyone else breaks at a quarter of its hit points and flees. */
// oxlint-disable-next-line unicorn/no-thenable -- `then` is the stat block's own morale field (#1203), not a promise
const DEFAULT_MORALE: MoraleRule = { breaksAt: 0.25, then: "flee" };
// oxlint-disable-next-line unicorn/no-thenable -- `then` is the stat block's own morale field (#1203), not a promise
const NEVER_BREAKS: MoraleRule = { breaksAt: 0, then: "fight_on" };

function entriesOf(statBlock: MonsterStatBlock): StatBlockEntry[] {
  return [...(statBlock.actions ?? []), ...(statBlock.bonus_actions ?? [])];
}

/** RULE artillery: it has at least one attack and every attack it has is ranged-only. Multiattack entries only name other entries, so they are not counted. */
function isArtillery(statBlock: MonsterStatBlock): boolean {
  const attacks = entriesOf(statBlock).filter((e) => e.structured.kind === "attack" && e.structured.attack);
  return attacks.length > 0 && attacks.every((e) => e.structured.attack?.delivery === "ranged");
}

/** RULE controller: it casts spells, or has an action that forces a saving throw (a lone save entry, or a breath-weapon option that is one). */
function isController(statBlock: MonsterStatBlock): boolean {
  if (statBlock.spellcasting) return true;
  return entriesOf(statBlock).some((e) => e.structured.kind === "save" || (e.structured.options ?? []).some((o) => o.kind === "save"));
}

/** RULE lurker: it has a Stealth skill. */
function isLurker(statBlock: MonsterStatBlock): boolean {
  return Object.keys(statBlock.skills ?? {}).some((k) => k.toLowerCase() === "stealth");
}

/**
 * RULE role, checked in this order: artillery, controller, lurker, skirmisher (walking speed 40 ft or more), else brute.
 * `leader` is never derived: only a DM calls a creature that.
 */
function deriveRole(statBlock: MonsterStatBlock): TacticalRole {
  if (isArtillery(statBlock)) return "artillery";
  if (isController(statBlock)) return "controller";
  if (isLurker(statBlock)) return "lurker";
  const speed = walkingSpeed(statBlock.speed);
  if (speed !== null && speed >= SKIRMISHER_SPEED_FEET) return "skirmisher";
  return "brute";
}

function deriveMorale(statBlock: MonsterStatBlock, creatureType: MonsterType | null): MoraleRule {
  const fearless = (creatureType !== null && FEARLESS_TYPES.includes(creatureType)) || statBlock.int <= FEARLESS_INTELLIGENCE;
  return fearless ? NEVER_BREAKS : DEFAULT_MORALE;
}

/**
 * The profile of one creature: every field resolved, the authored one if present, else derived by the rules above.
 * `creatureType` is a separate argument because the type lives on the monster row, not in the stat block; null when
 * the creature has none (an NPC), in which case only Intelligence can make it fearless.
 */
export function tacticalProfile(statBlock: MonsterStatBlock, creatureType: MonsterType | null): TacticalProfile {
  const authored = statBlock.tactics ?? {};
  const tier = cleverTier(statBlock.int);
  const role = authored.role ?? deriveRole(statBlock);
  const offers = new Set<TurnOptionKind>(OFFERS_BY_TIER[tier]);
  // RULE lurker-hides: a lurker that is at least simple is offered Hide even below the tier that earns it.
  if (role === "lurker" && tier !== "instinct") offers.add("hide");
  return {
    tier,
    role,
    targets: authored.targets ?? TARGETS_BY_TIER[tier],
    morale: authored.morale ?? deriveMorale(statBlock, creatureType),
    cover: authored.cover ?? COVER_BY_TIER[tier],
    offers,
    note: authored.note ?? null,
  };
}
