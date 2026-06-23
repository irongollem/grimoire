import type { OptionalRuleDef } from "@/types/rule.types";

// ── Built-in optional D&D 5e rule registry ────────────────────────────────────
// Add new rules here. They appear in Campaign Settings → Rules and the Reliquary
// once the DM enables them. Players see nothing if the rule is off.

const REGISTRY = new Map<string, OptionalRuleDef>();

export function registerOptionalRule(def: OptionalRuleDef): void {
  REGISTRY.set(def.key, def);
}

export function listOptionalRules(): OptionalRuleDef[] {
  return Array.from(REGISTRY.values());
}

export function getOptionalRule(key: string): OptionalRuleDef | undefined {
  return REGISTRY.get(key);
}

// ── Multiclass prerequisites ──────────────────────────────────────────────────
registerOptionalRule({
  key: "ignore_multiclass_prereqs",
  name: "Ignore Multiclass Prerequisites",
  summary:
    "Waive the PHB ability-score thresholds for multiclassing. Players don't need STR 13 to take a Fighter level, etc.",
  description:
    "By default, multiclassing requires meeting minimum ability scores for both the class you're leaving and the one you're entering (PHB p.163).\n\n" +
    "With this rule enabled, those thresholds are ignored — any character can take a level in any class regardless of their ability scores.",
  dmOnly: true,
  defaultEnabled: false,
});

// ── Experience Points (XP levelling) ──────────────────────────────────────────
registerOptionalRule({
  key: "xp_levelling",
  name: "Experience Points",
  summary:
    "Track earned XP per character. Level-up unlocks automatically when a character crosses the XP threshold for their level, instead of milestone levelling.",
  description:
    "By default Grimoire uses milestone levelling — the DM decides when characters level up. With this rule enabled, each character tracks **earned experience points** instead.\n\n" +
    "Your character sheet shows an XP bar with how far you are from the next level. When you reach the XP threshold for your current level, the **Level Up** button unlocks automatically (PHB p.15 advancement table).\n\n" +
    "Your DM awards XP after encounters and milestones from the Party screen.",
  dmOnly: false,
  defaultEnabled: false,
});

// ── Crafting (Workshop) ───────────────────────────────────────────────────────
registerOptionalRule({
  key: "crafting",
  name: "Crafting",
  summary:
    "Players can craft items, consumables, and equipment between sessions using recipes.",
  description: `The Workshop lets players gather recipes, manage crafting queues, and track material costs between sessions.\n\n
    Your DM controls which recipes are available and can set custom material requirements. Crafting time, tool requirements, and costs follow the Workshop recipes.\n\n
    Head to the **Workshop** tab in the sidebar to browse recipes and start crafting.`,
  dmOnly: false,
  defaultEnabled: true,
});

// ── Encumbrance ───────────────────────────────────────────────────────────────
registerOptionalRule({
  key: "encumbrance",
  name: "Encumbrance",
  summary: "Carrying too much gear slows you down and hampers your abilities.",
  description:
    "When using this variant rule, the amount of gear you carry affects your speed and capabilities.\n\n" +
    "**Encumbered** (STR × 5+ lbs): Speed −10 ft.\n" +
    "**Heavily Encumbered** (STR × 10+ lbs): Speed −20 ft, disadvantage on ability checks, attack rolls, and saving throws using STR, DEX, or CON.\n" +
    "**Over Encumbered** (STR × 15+ lbs): Speed 0.\n\n" +
    "Creatures with **Powerful Build** use twice the weight thresholds.",
  dmOnly: false,
});

// ── Flanking ──────────────────────────────────────────────────────────────────
registerOptionalRule({
  key: "flanking",
  name: "Flanking",
  summary:
    "Two allies threatening the same enemy from opposite sides grant advantage.",
  description:
    "When a creature and at least one of its allies are adjacent to an enemy and on opposite sides or corners of the enemy's space, they are **flanking** that enemy.\n\n" +
    "A creature can't flank an enemy that it can't see. A creature also can't flank while it is incapacitated. Large or larger creatures occupy multiple squares — use DM discretion for flanking angles.",
  dmOnly: false,
});

// ── Massive Damage ────────────────────────────────────────────────────────────
registerOptionalRule({
  key: "massive_damage",
  name: "Massive Damage",
  summary: "Taking half your max HP in one hit forces a CON save or drop to 0.",
  description:
    "When a creature takes damage from a single source equal to or greater than **half its hit point maximum**, it must succeed on a **DC 15 Constitution saving throw** or suffer a random effect on the System Shock table.\n\n" +
    "This rule emphasises the danger of powerful single hits and makes powerful creatures feel genuinely threatening.",
  dmOnly: false,
});

// ── Morale ────────────────────────────────────────────────────────────────────
registerOptionalRule({
  key: "morale",
  name: "Morale",
  summary:
    "NPCs and monsters may flee or surrender when things go badly for them.",
  description:
    "Whenever a significant threat occurs — a monster's ally is slain, the monster drops below half HP, or the situation clearly turns against it — the DM may call for a **DC 10 Wisdom saving throw**.\n\n" +
    "On a failure the creature attempts to flee, surrenders, or becomes frightened at DM discretion. Mindless creatures, undead, and creatures immune to the frightened condition are unaffected.",
  dmOnly: false,
});

// ── Lingering Injuries ────────────────────────────────────────────────────────
registerOptionalRule({
  key: "lingering_injuries",
  name: "Lingering Injuries",
  summary: "Critical hits and dropping to 0 HP can leave lasting wounds.",
  description:
    "When a character suffers a critical hit or is reduced to 0 hit points, the DM may roll on the **Lingering Injuries** table (DMG p.272) to determine a lasting consequence.\n\n" +
    "Injuries heal when a character regains all their hit points, unless the description specifies otherwise. They add grim realism and make combat consequences feel lasting.",
  dmOnly: false,
});

// ── Slow Natural Healing ──────────────────────────────────────────────────────
registerOptionalRule({
  key: "slow_natural_healing",
  name: "Slow Natural Healing",
  summary:
    "Characters don't regain HP at the end of a long rest without spending Hit Dice.",
  description:
    "With this rule, characters regain Hit Dice (not hit points) at the end of a long rest. To regain hit points, a character must spend Hit Dice during or after a long rest — the normal benefit of rolling them during a short rest.\n\n" +
    "This makes healing resources more precious and encourages players to seek out healers, potions, and safe resting places.",
  dmOnly: false,
});
