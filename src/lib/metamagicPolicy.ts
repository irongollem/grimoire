import type { MetamagicOption } from "@/lib/metamagic";
import type { Spell } from "@/types/spell.types";
import type { RulesetKey } from "@/types/ruleset.types";

export const TRANSMUTABLE_DAMAGE_TYPES = ["acid", "cold", "fire", "lightning", "poison", "thunder"] as const;

export function isMetamagicEligible(option: MetamagicOption, spell: Spell, ruleset: RulesetKey): boolean {
  switch (option.name) {
    case "Careful Spell":
    case "Heightened Spell": return spell.attack_type === "save";
    case "Distant Spell": return spell.range === "Touch" || /(?:\d+\s*(?:ft\.?|feet)|mile)/i.test(spell.range);
    case "Extended Spell": return /minute|hour|day|until dispelled/i.test(spell.duration) && !/^1 round$/i.test(spell.duration);
    case "Quickened Spell": return spell.casting_time === "Action";
    case "Transmuted Spell": return (spell.damage_rolls ?? []).some((roll) =>
      TRANSMUTABLE_DAMAGE_TYPES.includes(roll.type.toLowerCase() as typeof TRANSMUTABLE_DAMAGE_TYPES[number]),
    );
    case "Twinned Spell": return ruleset === "2024"
      ? /additional (?:creature|target)/i.test(spell.higher_levels ?? "")
      : !/^Self$/i.test(spell.range) && /^1\b/.test(spell.target_description ?? "");
    case "Empowered Spell": return !!spell.damage_rolls?.length;
    case "Seeking Spell": return spell.attack_type === "ranged_spell" || spell.attack_type === "melee_spell";
    default: return true;
  }
}

export function metamagicTargetBonus(names: readonly string[]): number {
  return names.includes("Twinned Spell") ? 1 : 0;
}

export function metamagicReminders(names: readonly string[], ruleset: RulesetKey): string[] {
  const reminders: string[] = [];
  if (names.includes("Careful Spell")) reminders.push(ruleset === "2024" ? "Chosen creatures automatically save and take no damage from save-for-half damage." : "Chosen creatures automatically succeed on their save.");
  if (names.includes("Heightened Spell")) reminders.push(ruleset === "2024" ? "One target has Disadvantage on all saves against this spell." : "One target has Disadvantage on its first save against this spell.");
  if (names.includes("Extended Spell") && ruleset === "2024") reminders.push("You have Advantage on saves to maintain Concentration on this spell.");
  if (names.includes("Quickened Spell")) reminders.push("This casting uses a Bonus Action.");
  if (names.includes("Subtle Spell")) reminders.push(ruleset === "2024" ? "No verbal, somatic, or non-costly/non-consumed material components." : "No verbal or somatic components.");
  return reminders;
}

