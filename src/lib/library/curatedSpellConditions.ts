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

/** The conditions of the rules, by their book names. Both editions use these names. */
export const CONDITION_NAMES = [
  "Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified",
  "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious",
] as const;
export type ConditionName = (typeof CONDITION_NAMES)[number];

export const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
export type Ability = (typeof ABILITIES)[number];

export interface CuratedSpellCondition {
  /**
   * `condition`: the spell imposes one or more named conditions in a way the fields below say completely.
   * `no_condition`: it imposes none of the named conditions.
   * `not_simple`: it imposes one, but not in a way these fields can say (it depends on a choice, on hit points, on
   * a table, on the creature's kind beyond what `only_kinds` holds, or it changes over the turns). Left to the table.
   */
  verdict: "condition" | "no_condition" | "not_simple";
  /** Every condition imposed together by the one cast. Empty unless the verdict is `condition`. */
  conditions: ConditionName[];
  /**
   * Whether it stops those it affects from casting, which no named condition says: `verbal` for a spell that
   * allows no sound or no speech (Silence), `all` for one that allows no spellcasting at all. Null for neither.
   * It is what makes a spell worth more against a wizard than a fighter, so a caster can be told whom to aim it at.
   */
  stops_casting: "verbal" | "all" | null;
  /**
   * Whether the text also sets the speed of those it affects to 0 for as long as the condition lasts, where the
   * condition itself does not (Hypnotic Pattern: Charmed, Incapacitated, "and has a speed of 0"). False when the
   * text does not say so, and for conditions that already stop movement by the rules.
   */
  speed_zero: boolean;
  /** What must happen for the condition to land. */
  applies: "failed_save" | "hit" | "automatic" | null;
  /** The saving throw that avoids it; null when `applies` is not `failed_save`. */
  save_ability: Ability | null;
  /** Whom one cast can affect at the spell's own level. `count` is null for an area. */
  targets: { kind: "one" | "several" | "area" | "self"; count: number | null; more_per_slot_above: number } | null;
  /** The creature kinds it is limited to, lower case, as the text names them ("humanoid"); empty for any creature. */
  only_kinds: string[];
  /** How long it lasts at most. `concentration` is the spell's own. Rounds and minutes are the common cases. */
  duration: { unit: "instant" | "round" | "minute" | "hour" | "until_dispelled" | "special"; amount: number | null; concentration: boolean } | null;
  /** A later save that can end it, and when it is made; null when nothing but the duration ends it. */
  repeat_save: { when: "end_of_its_turn" | "start_of_its_turn" | "when_damaged" | "as_an_action"; ability: Ability } | null;
  /** One sentence copied word for word from the spell's description: the one that says the condition is imposed. */
  evidence: string;
}

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
    return found;
  }

  if (entry.conditions.length === 0 && entry.stops_casting === null) found.push("a condition entry names at least one condition, or says it stops casting.");
  for (const name of entry.conditions) {
    if (!(CONDITION_NAMES as readonly string[]).includes(name)) found.push(`"${name}" is not a condition of the rules.`);
    // The name, or its root ("paralyz" for paralyzed/paralysed), must be in the text: a condition the spell never names is invented.
    else if (!text.includes(name.toLowerCase().slice(0, Math.max(5, name.length - 2)))) found.push(`the description never says ${name}.`);
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
      applies: e.applies,
      save_ability: e.save_ability,
      targets: e.targets,
      only_kinds: [...e.only_kinds].map((k) => k.toLowerCase()).sort(),
      duration: e.duration,
      repeat_save: e.repeat_save,
    });
  return facts(a) === facts(b);
}
