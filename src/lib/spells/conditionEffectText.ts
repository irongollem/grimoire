/**
 * A spell's `condition_effect` in a Dungeon Master's words: one sentence for the editor's summary line and the sheet.
 * Pure. The wording never shows a code word (`verdict`, `failed_save`): it is what a person would say at the table.
 */
import type { SpellConditionEffect } from "@/types/spell.types";

export const ABILITY_NAMES = {
  STR: "Strength",
  DEX: "Dexterity",
  CON: "Constitution",
  INT: "Intelligence",
  WIS: "Wisdom",
  CHA: "Charisma",
} as const;

const SKILL_NAMES = { athletics: "Athletics", acrobatics: "Acrobatics" } as const;

/** Creature kinds whose plural is not the kind with an s. */
const PLURALS: Record<string, string> = { undead: "undead", fey: "fey", monstrosity: "monstrosities" };

export const NOT_SIMPLE_LINE = "Rule this one at the table";
export const NO_CONDITION_LINE = "Does nothing a fight needs to know";

function plural(kind: string): string {
  return PLURALS[kind] ?? `${kind}s`;
}

function listWords(items: string[], joiner: "and" | "or" = "and"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${joiner} ${items[items.length - 1]}`;
}

function who(effect: SpellConditionEffect): string | null {
  const t = effect.targets;
  if (t === null) return null;
  const kinds = effect.only_kinds;
  const extra = t.more_per_slot_above > 0 ? ` (${t.more_per_slot_above} more per slot above its level)` : "";
  switch (t.kind) {
    case "one": return `one ${kinds.length ? listWords(kinds, "or") : "creature"}${extra}`;
    case "several": {
      const noun = kinds.length ? listWords(kinds.map(plural), "or") : "creatures";
      return `${t.count === null ? "several" : `up to ${t.count}`} ${noun}${extra}`;
    }
    case "area": return kinds.length ? `every ${listWords(kinds, "or")} in its area` : "everyone in its area";
    case "self": return "the caster";
  }
}

function lasts(effect: SpellConditionEffect): string | null {
  const d = effect.duration;
  if (d === null) return null;
  const n = d.amount;
  const counted = (word: string) => (n === null ? `up to some ${word}s` : `up to ${n} ${word}${n === 1 ? "" : "s"}`);
  const base = {
    instant: "for an instant",
    round: counted("round"),
    minute: counted("minute"),
    hour: counted("hour"),
    until_dispelled: "until dispelled",
    special: "for a time the spell's text sets",
  }[d.unit];
  return d.concentration ? `${base} (concentration)` : base;
}

function endsEarly(effect: SpellConditionEffect): string[] {
  const out: string[] = [];
  const r = effect.repeat_save;
  if (r !== null) {
    const when = {
      end_of_its_turn: "at the end of each of their turns",
      start_of_its_turn: "at the start of each of their turns",
      when_damaged: "whenever they take damage",
      as_an_action: "by spending their action",
    }[r.when];
    out.push(`they save again ${when}`);
  }
  if (effect.ends_when_harmed === "by_casters_side") out.push("it ends if the caster or its allies harm them");
  if (effect.ends_when_harmed === "by_anyone") out.push("it ends if they take any damage");
  const b = effect.break_free;
  if (b !== undefined && b !== null) {
    const abilities = listWords(b.abilities.map((a) => ABILITY_NAMES[a]), "or");
    const skill = b.skill === null ? "" : ` (${SKILL_NAMES[b.skill]})`;
    out.push(`they can break free with a ${abilities}${skill} check as their action`);
  }
  return out;
}

/** The whole entry as one sentence; "" when nothing has been said yet (null). */
export function conditionEffectText(effect: SpellConditionEffect | null | undefined): string {
  if (effect === null || effect === undefined) return "";
  if (effect.verdict === "no_condition") return `${NO_CONDITION_LINE}.`;
  if (effect.verdict === "not_simple") return `${NOT_SIMPLE_LINE}.`;

  const what = effect.conditions.map((c) => c.toLowerCase());
  if (effect.stops_casting === "verbal") what.push("cannot cast spells with a spoken part");
  if (effect.stops_casting === "all") what.push("cannot cast spells");
  if (effect.speed_zero) what.push("speed 0");
  const head = what.length === 0 ? "A condition" : listWords(what);

  const lands = {
    failed_save: effect.save_ability === null ? "on a failed save" : `on a failed ${ABILITY_NAMES[effect.save_ability]} save`,
    hit: "on a hit",
    automatic: "with no roll",
  };
  const landing = effect.applies === null ? head : `${head} ${lands[effect.applies]}`;
  const first = [landing, who(effect), lasts(effect)]
    .filter((part): part is string => part !== null)
    .join(", ");

  const rest = endsEarly(effect);
  if (effect.must_flee === true) rest.push("they must flee the caster");
  if (effect.leaves_play === true) rest.push("they are out of the fight until it ends");
  const sentence = [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join("; ");
  return `${sentence}.`;
}

/** What a sheet shows beside the spell's other mechanics: the sentence for a condition, the table ruling, or nothing. */
export function conditionEffectSheetLine(effect: SpellConditionEffect | null | undefined): string | null {
  if (effect === null || effect === undefined || effect.verdict === "no_condition") return null;
  return conditionEffectText(effect);
}

/**
 * A finding of the text check, as a Dungeon Master reads it in the spell editor. The check's own sentences are
 * written for whoever reads spells into data and name the fields (`applies`, `targets`); on screen they must say
 * what to do in the words of the form. Null for a finding the form cannot produce (a count that does not fit its
 * kind, a concentration that contradicts the spell), which would only puzzle. A finding nobody has worded yet
 * falls back to one honest sentence, never to the field names.
 */
const PLAIN_FINDINGS: readonly (readonly [RegExp, string | null])[] = [
  [/names at least one condition/, "Tick at least one condition, or say it stops spellcasting."],
  [/^the description never says (\w+)\.$/, "The description never says $1."],
  [/^ends_when_harmed is set/, "It ends when they are harmed, but the description never mentions damage or harm."],
  [/^break_free names no ability/, "Tick an ability for the check to break free."],
  [/^break_free is set/, "They can break free with a check, but the description never mentions a check."],
  [/^must_flee is set/, "They must flee, but the description never says they move away from the caster."],
  [/^applies is missing/, "Say how it lands: on a failed save, on a hit, or with no roll."],
  [/names the save's ability/, "Set the saving throw above."],
  [/^targets is missing/, "Say who it reaches."],
  [/^duration is missing/, "Say how long it lasts."],
  [/has an amount above zero/, "Say how many rounds, minutes or hours it lasts."],
  [/says nothing of a higher slot/, "It reaches more creatures with a higher slot, but the spell's text says nothing of higher slots."],
  // The form keeps these right by construction, so they are never a DM's to fix.
  [/is not a condition of the rules|save_ability is set|is a count of|has no count|is never negative|only a duration|duration\.concentration|that is a condition entry|names no conditions/, null],
];

export function plainFinding(finding: string): string | null {
  for (const [pattern, plain] of PLAIN_FINDINGS) {
    const match = pattern.exec(finding);
    // The whole finding is replaced, never its matching part: the rest of it is the field names again.
    if (match === null) continue;
    if (plain === null) return null;
    const named = match[1];
    return named === undefined ? plain : plain.replace("$1", named);
  }
  return "Something in this entry does not match the spell's text. Read it against the description.";
}

