/**
 * What a spell does to a creature beyond damage, read off its own text (#1021, the caster's spells, step C).
 *
 * A fight can resolve Fireball because its dice are in data. It cannot resolve Hold Person: no spell record says in
 * data which condition it imposes, on what, for how long, or how it ends. This is the shape that says so, one entry
 * per library spell id, kept in `src/data/curatedSpellConditions/` as files a person or a model writes
 * (the `/spell-conditions-pass` skill is the procedure).
 *
 * Nothing here is trusted because one reader wrote it. An entry is used only when two independent readings of the
 * same spell agree (`agree`) and each survives the checks against the spell's own text (`findingsFor`): a false
 * entry paralyses the wrong creature in someone's game, a missing one costs a table one ruling by hand.
 *
 * Pure. Relative imports with the extension, so a script and an edge function can both read it.
 */

import { ABILITIES, CONDITION_NAMES, type Ability, type ConditionName, type CuratedSpellCondition } from "../../types/spell.types.ts";

// The shape and the two name lists live with the other spell types; they are re-exported so importers here keep working.
export { ABILITIES, CONDITION_NAMES };
export type { Ability, CuratedSpellCondition };

export type CuratedSpellConditionsFile = Record<string, CuratedSpellCondition>;

/** Collapses whitespace and the two kinds of quote, so a copied sentence is compared as text, not as bytes. */
function plain(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\*+/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Everything wrong with one entry, as sentences a reader can act on; empty when the entry may be used. `spell` is
 * the record the entry is about: its description is the only authority.
 */
export function findingsFor(entry: CuratedSpellCondition, spell: { description: string; higher_levels?: string | null; concentration: boolean }): string[] {
  const found: string[] = [];
  // The two columns a spell's rules are written in: what it does, and what a higher slot adds.
  const text = plain(`${spell.description} ${typeof spell.higher_levels === "string" ? spell.higher_levels : ""}`);
  if (entry.evidence.trim() === "") found.push("evidence is empty: copy the sentence that imposes the condition, or the one that shows there is none.");
  else if (!text.includes(plain(entry.evidence))) found.push("evidence is not a sentence of this spell's description, word for word.");

  if (entry.verdict !== "condition") {
    if (entry.conditions.length > 0) found.push(`a ${entry.verdict} entry names no conditions.`);
    if (entry.stops_casting !== null) found.push(`a ${entry.verdict} entry does not stop casting: that is a condition entry.`);
    if (entry.speed_zero) found.push(`a ${entry.verdict} entry does not set a speed to 0: that is a condition entry.`);
    if (entry.leaves_play === true) found.push(`a ${entry.verdict} entry takes nothing out of the fight: that is a condition entry.`);
    if (entry.ends_when_harmed !== undefined && entry.ends_when_harmed !== null) found.push(`a ${entry.verdict} entry has no condition to end when harmed: that is a condition entry.`);
    if (entry.break_free !== undefined && entry.break_free !== null) found.push(`a ${entry.verdict} entry has no condition to break free of: that is a condition entry.`);
    if (entry.must_flee === true) found.push(`a ${entry.verdict} entry has no condition to flee under: that is a condition entry.`);
    return found;
  }

  if (entry.conditions.length === 0 && entry.stops_casting === null) found.push("a condition entry names at least one condition, or says it stops casting.");
  for (const name of entry.conditions) {
    if (!(CONDITION_NAMES as readonly string[]).includes(name)) found.push(`"${name}" is not a condition of the rules.`);
    // The name, or its root ("paralyz" for paralyzed/paralysed), must be in the text: a condition the spell never names is invented.
    else if (!text.includes(name.toLowerCase().slice(0, Math.max(5, name.length - 2)))) found.push(`the description never says ${name}.`);
  }
  // A condition that ends on harm says so in the text; a spell with no word of harm or damage in it cannot end that way.
  if (entry.ends_when_harmed !== undefined && entry.ends_when_harmed !== null && !/damage|harm/.test(text)) {
    found.push("ends_when_harmed is set but the description never says damage or harm.");
  }
  if (entry.break_free !== undefined && entry.break_free !== null) {
    if (entry.break_free.abilities.length === 0) found.push("break_free names no ability to check with.");
    // A way out by a check says "check" in the text; a spell with no such word cannot end that way.
    if (!/\bchecks?\b/.test(text)) found.push("break_free is set but the description never says check.");
  }
  // A creature made to run says so in the text: moving away, fleeing, as far away as it can, away from the caster.
  if (entry.must_flee === true && !/move away|moving away|flee|as far away|away from you/.test(text)) {
    found.push("must_flee is set but the description never says the creature moves away from the caster.");
  }
  if (entry.applies === null) found.push("applies is missing: failed_save, hit or automatic.");
  if (entry.applies === "failed_save" && entry.save_ability === null) found.push("a condition on a failed save names the save's ability.");
  if (entry.applies !== "failed_save" && entry.save_ability !== null) found.push("save_ability is set but the condition does not come from a failed save.");
  if (entry.targets === null) found.push("targets is missing.");
  else {
    if ((entry.targets.kind === "one" || entry.targets.kind === "self") && entry.targets.count !== 1) found.push("one target is a count of 1.");
    if (entry.targets.kind === "several" && (entry.targets.count === null || entry.targets.count < 2)) found.push("several targets is a count of 2 or more.");
    if (entry.targets.kind === "area" && entry.targets.count !== null) found.push("an area has no count.");
    if (entry.targets.more_per_slot_above < 0) found.push("more_per_slot_above is never negative.");
    if (entry.targets.more_per_slot_above > 0 && (typeof spell.higher_levels !== "string" || spell.higher_levels.trim() === "") && !/higher|slot/i.test(spell.description)) {
      found.push("more_per_slot_above is above 0 but the spell's text says nothing of a higher slot.");
    }
  }
  if (entry.duration === null) found.push("duration is missing.");
  else {
    const counted = entry.duration.unit === "round" || entry.duration.unit === "minute" || entry.duration.unit === "hour";
    if (counted && (entry.duration.amount === null || entry.duration.amount <= 0)) found.push("a duration in rounds, minutes or hours has an amount above zero.");
    if (!counted && entry.duration.amount !== null) found.push("only a duration in rounds, minutes or hours has an amount.");
    if (entry.duration.concentration !== spell.concentration) found.push(`duration.concentration is ${entry.duration.concentration} but the spell's own record says ${spell.concentration}.`);
  }
  return found;
}

/** Whether two readings of one spell say the same thing. The evidence may be a different sentence; the facts may not differ. */
export function agree(a: CuratedSpellCondition, b: CuratedSpellCondition): boolean {
  const facts = (e: CuratedSpellCondition) =>
    JSON.stringify({
      verdict: e.verdict,
      conditions: [...e.conditions].sort(),
      stops_casting: e.stops_casting,
      speed_zero: e.speed_zero,
      leaves_play: e.leaves_play === true,
      applies: e.applies,
      save_ability: e.save_ability,
      targets: e.targets,
      only_kinds: [...e.only_kinds].map((k) => k.toLowerCase()).sort(),
      duration: e.duration,
      repeat_save: e.repeat_save,
      ends_when_harmed: e.ends_when_harmed ?? null,
      must_flee: e.must_flee === true,
      break_free: e.break_free ? { abilities: [...e.break_free.abilities].sort(), skill: e.break_free.skill } : null,
    });
  return facts(a) === facts(b);
}

/** A condition reading as a spell record stores it: the entry without the sentence that proved it. */
export type ParsedConditionEffect = Omit<CuratedSpellCondition, "evidence">;

const VERDICTS = ["condition", "no_condition", "not_simple"] as const;
const STOPS = ["verbal", "all"] as const;
const APPLIES = ["failed_save", "hit", "automatic"] as const;
const TARGET_KINDS = ["one", "several", "area", "self"] as const;
const DURATION_UNITS = ["instant", "round", "minute", "hour", "until_dispelled", "special"] as const;
const REPEAT_WHEN = ["end_of_its_turn", "start_of_its_turn", "when_damaged", "as_an_action"] as const;
const HARMED = ["by_casters_side", "by_anyone"] as const;
const SKILLS = ["athletics", "acrobatics"] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function oneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function abilityOrNull(v: unknown): Ability | null | undefined {
  if (v === null) return null;
  return oneOf(ABILITIES, v) ? v : undefined;
}

/**
 * A condition reading from an outside source (a model's answer, a stored column) as the entry it claims to be, or
 * null when it is not exactly that shape: an unknown verdict, an unknown condition name, a value outside an enum or
 * a field of the wrong type. It checks the shape only; whether the text of a spell supports the entry is
 * `findingsFor`'s question. The four optional fields are copied only when present, so a valid entry round-trips.
 */
export function parseConditionEffect(raw: unknown): ParsedConditionEffect | null {
  if (!isRecord(raw)) return null;
  if (!oneOf(VERDICTS, raw.verdict)) return null;
  if (!Array.isArray(raw.conditions) || !raw.conditions.every((c): c is ConditionName => oneOf(CONDITION_NAMES, c))) return null;
  if (raw.stops_casting !== null && !oneOf(STOPS, raw.stops_casting)) return null;
  if (typeof raw.speed_zero !== "boolean") return null;
  if (raw.applies !== null && !oneOf(APPLIES, raw.applies)) return null;
  const saveAbility = abilityOrNull(raw.save_ability);
  if (saveAbility === undefined) return null;

  let targets: ParsedConditionEffect["targets"] = null;
  if (raw.targets !== null) {
    const t = raw.targets;
    if (!isRecord(t) || !oneOf(TARGET_KINDS, t.kind)) return null;
    if (t.count !== null && !isNum(t.count)) return null;
    if (!isNum(t.more_per_slot_above)) return null;
    targets = { kind: t.kind, count: t.count, more_per_slot_above: t.more_per_slot_above };
  }
  if (!Array.isArray(raw.only_kinds) || !raw.only_kinds.every((k): k is string => typeof k === "string")) return null;

  let duration: ParsedConditionEffect["duration"] = null;
  if (raw.duration !== null) {
    const d = raw.duration;
    if (!isRecord(d) || !oneOf(DURATION_UNITS, d.unit)) return null;
    if (d.amount !== null && !isNum(d.amount)) return null;
    if (typeof d.concentration !== "boolean") return null;
    duration = { unit: d.unit, amount: d.amount, concentration: d.concentration };
  }

  let repeat: ParsedConditionEffect["repeat_save"] = null;
  if (raw.repeat_save !== null) {
    const r = raw.repeat_save;
    if (!isRecord(r) || !oneOf(REPEAT_WHEN, r.when)) return null;
    const ability = abilityOrNull(r.ability);
    if (ability === undefined || ability === null) return null;
    repeat = { when: r.when, ability };
  }

  const out: ParsedConditionEffect = {
    verdict: raw.verdict,
    conditions: [...raw.conditions],
    stops_casting: raw.stops_casting,
    speed_zero: raw.speed_zero,
    applies: raw.applies,
    save_ability: saveAbility,
    targets,
    only_kinds: [...raw.only_kinds],
    duration,
    repeat_save: repeat,
  };

  if (raw.leaves_play !== undefined) {
    if (typeof raw.leaves_play !== "boolean") return null;
    out.leaves_play = raw.leaves_play;
  }
  if (raw.must_flee !== undefined) {
    if (typeof raw.must_flee !== "boolean") return null;
    out.must_flee = raw.must_flee;
  }
  if (raw.ends_when_harmed !== undefined) {
    if (raw.ends_when_harmed !== null && !oneOf(HARMED, raw.ends_when_harmed)) return null;
    out.ends_when_harmed = raw.ends_when_harmed;
  }
  if (raw.break_free !== undefined) {
    if (raw.break_free === null) out.break_free = null;
    else {
      const b = raw.break_free;
      if (!isRecord(b) || !Array.isArray(b.abilities) || !b.abilities.every((a): a is Ability => oneOf(ABILITIES, a))) return null;
      if (b.skill !== null && !oneOf(SKILLS, b.skill)) return null;
      out.break_free = { abilities: [...b.abilities], skill: b.skill };
    }
  }
  return out;
}

/** The first sentence of a text, cut from the text itself so it is a literal part of it. */
function firstSentence(text: string): string {
  const trimmed = text.trim();
  const end = trimmed.search(/[.!?](\s|$)/);
  return end === -1 ? trimmed : trimmed.slice(0, end + 1);
}

/**
 * What is wrong with a condition reading against the spell it belongs to, leaving out the one thing a hand-made spell
 * has no field for: the evidence sentence. The first sentence of the description stands in for it, so only the
 * entry's own claims are checked. Advice for an editor, a verdict for the generator.
 */
export function conditionEffectFindings(
  effect: ParsedConditionEffect,
  spell: { description: string; higher_levels?: string | null; concentration: boolean },
): string[] {
  const entry: CuratedSpellCondition = { ...effect, evidence: firstSentence(spell.description) };
  return findingsFor(entry, spell).filter((f) => !f.startsWith("evidence"));
}

/**
 * A model's `condition_effect` as an entry to keep, or null: it must have the right shape and say nothing the
 * spell's own text does not. A wrong entry would paralyse the wrong creature in a game; null only costs a ruling.
 */
export function vetConditionEffect(
  raw: unknown,
  spell: { description: string; higher_levels?: string | null; concentration: boolean },
): ParsedConditionEffect | null {
  const parsed = parseConditionEffect(raw);
  if (parsed === null) return null;
  return conditionEffectFindings(parsed, spell).length === 0 ? parsed : null;
}
