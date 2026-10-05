import type {
  ChoiceCount,
  ChoicePick,
  DamageRider,
  FeatAbilityIncrease,
  FeatPrerequisites,
  FeatureChoice,
  FeatureMechanics,
  FeatureUses,
  Recharge,
  RiderDice,
  UsesAmount,
} from "@/rules/features/mechanics.types";
import { ABILITY_LABELS } from "@/types/card.types";
import { ACTIVATION_LABELS } from "@/types/feature.types";

/**
 * The read view of mechanics: short labelled lines, never prose. The rules text
 * is the row's description; this is only what the sheet, roller and level-up
 * act on, so a DM can see at a glance what a feature does in the app.
 */
export interface SummaryGroup {
  heading: string;
  lines: string[];
}

const RECHARGE_TEXT: Record<Recharge, string> = {
  short: "a short rest",
  long: "a long rest",
  turn: "the start of your turn",
  dawn: "dawn",
};

const ability = (key: string): string => ABILITY_LABELS[key] ?? key;

export function describeAmount(amount: UsesAmount): string {
  switch (amount.kind) {
    case "fixed": return String(amount.value);
    case "by_level": {
      const steps = Object.entries(amount.values).sort((a, b) => Number(a[0]) - Number(b[0]));
      return steps.map(([level, value]) => `${value} from level ${level}`).join(", ");
    }
    case "proficiency": return "Proficiency bonus";
    case "ability_mod": {
      const bonus = amount.bonus ? ` + ${amount.bonus}` : "";
      return `${ability(amount.ability)} modifier${bonus}, at least ${amount.min}`;
    }
    case "class_level": return amount.multiplier === 1 ? "Class level" : `${amount.multiplier} x class level`;
    case "unlimited_from": return `Unlimited from level ${amount.level}, otherwise ${describeAmount(amount.below)}`;
  }
}

function describeUses(uses: FeatureUses): string[] {
  const lines = [`${uses.label || uses.key}: ${describeAmount(uses.amount)}`];
  let recharge = `Comes back on ${RECHARGE_TEXT[uses.recharge]}`;
  if (uses.short_rest_regain) recharge += `; a short rest gives back ${uses.short_rest_regain}`;
  if (uses.recharge_from) recharge += `; from level ${uses.recharge_from.level} on ${RECHARGE_TEXT[uses.recharge_from.recharge]}`;
  lines.push(recharge);
  if (uses.pool) lines.push("A pool spent in chosen amounts");
  return lines;
}

function describeDice(dice: RiderDice): string {
  switch (dice.kind) {
    case "scaling": return "the level table value";
    case "fixed": return dice.expression;
    case "slot": return `${dice.base} at slot level ${dice.base_level}, +${dice.per_level} per level above, up to ${dice.max_dice} dice`;
  }
}

function describeRider(rider: DamageRider): string {
  const parts = [`${rider.label}: ${describeDice(rider.dice)}`];
  if (rider.damage_type) parts.push(rider.damage_type);
  if (rider.once_per_turn) parts.push("once per turn");
  if (rider.cost) parts.push(rider.cost.kind === "spell_slot" ? "spends a spell slot" : `spends ${rider.cost.amount} ${rider.cost.key}`);
  return parts.join(", ");
}

function describePick(pick: ChoicePick): string {
  switch (pick.kind) {
    case "feat": return pick.categories === null ? "a feat" : `a feat (${pick.categories.join(", ").replace(/_/g, " ")})`;
    case "asi_or_feat": return "Ability Score Improvement or a feat";
    case "expertise": return pick.thieves_tools ? "expertise (Thieves' Tools included)" : "expertise";
    case "skill": return pick.from.length === 0 ? "skill proficiencies" : `skill proficiencies (${pick.from.length} offered)`;
    case "option": return pick.set.replace(/_/g, " ");
    case "custom": return pick.options.length > 0 ? pick.options.join(", ") : "a custom list";
  }
}

function describeCount(count: ChoiceCount): string {
  if (count.kind === "per_grant") return `${count.amount} each time`;
  const steps = Object.entries(count.values).sort((a, b) => Number(a[0]) - Number(b[0]));
  return steps.map(([level, n]) => `${n} known at ${level}`).join(", ");
}

function describeChoice(choice: FeatureChoice): string {
  const swap = choice.replace_on_level_up ? ", one may be swapped" : "";
  return `${choice.label || choice.key}: ${describePick(choice.pick)}, ${describeCount(choice.count)}${swap}`;
}

/** Groups in a fixed reading order; a feature with no mechanics has none. */
export function summarizeMechanics(mechanics: FeatureMechanics): SummaryGroup[] {
  const groups: SummaryGroup[] = [];
  if (mechanics.activation) groups.push({ heading: "Takes", lines: [ACTIVATION_LABELS[mechanics.activation]] });
  if (mechanics.spends) groups.push({ heading: "Spends", lines: [`${mechanics.spends.amount} from ${mechanics.spends.key}`] });
  if (mechanics.uses) groups.push({ heading: "Uses", lines: describeUses(mechanics.uses) });
  if (mechanics.scaling) {
    const steps = Object.entries(mechanics.scaling.values).sort((a, b) => Number(a[0]) - Number(b[0]));
    groups.push({ heading: mechanics.scaling.label || "Level table", lines: steps.map(([level, value]) => `Level ${level}: ${value}`) });
  }
  if (mechanics.toggle) {
    const spends = mechanics.toggle.spends ? `; spends ${mechanics.toggle.spends.amount} ${mechanics.toggle.spends.key}` : "";
    groups.push({ heading: "Toggle", lines: [`${mechanics.toggle.label}, ends on a ${mechanics.toggle.ends_on === "short_rest" ? "short" : "long"} rest${spends}`] });
  }
  if (mechanics.riders) groups.push({ heading: "Extra damage", lines: mechanics.riders.map(describeRider) });
  if (mechanics.actions) {
    groups.push({
      heading: "Lets you",
      lines: mechanics.actions.map((a) => `${a.name} (${ACTIVATION_LABELS[a.activation]})${a.spends ? `, spends ${a.spends.amount} ${a.spends.key}` : ""}`),
    });
  }
  if (mechanics.choices) groups.push({ heading: "Choices", lines: mechanics.choices.map(describeChoice) });
  if (mechanics.replaces) groups.push({ heading: "Replaces", lines: [mechanics.replaces] });
  return groups;
}

/** The prerequisite conditions of a feat, one per line. */
export function describePrerequisites(pre: FeatPrerequisites | null): string[] {
  if (!pre) return [];
  const lines: string[] = [];
  if (pre.level) lines.push(`Character level ${pre.level} or higher`);
  if (pre.abilities) {
    const options = Object.entries(pre.abilities.any_of).map(([key, score]) => `${ability(key)} ${score}`);
    lines.push(`${options.join(" or ")} or higher`);
  }
  if (pre.spellcasting) lines.push("Can cast at least one spell");
  if (pre.armor) lines.push(pre.armor === "shield" ? "Trained with shields" : `Trained with ${pre.armor} armor`);
  if (pre.fighting_style_feature) lines.push("Has the Fighting Style feature");
  return lines;
}

export function describeAbilityIncrease(inc: FeatAbilityIncrease | null): string | null {
  if (!inc) return null;
  const names = inc.abilities.map(ability).join(", ");
  const how = inc.split ? `+${inc.amount} to one, or +1 to two of` : `+${inc.amount} to one of`;
  return `${how} ${names} (maximum ${inc.max})`;
}
