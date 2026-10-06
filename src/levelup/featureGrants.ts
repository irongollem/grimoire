import { dueKey, type ChoiceValue } from "@/components/features/choiceValue";
import type { DueChoice } from "@/rules/features/levelUpChoices";
import type { FeatureGrants } from "@/rules/features/mechanics.types";
import type { LevelSkillChange, SkillProficiencies } from "@/types/party.types";
import type { SpellRow } from "./buildLevelUpPayload";

/**
 * What a feature gives outright (proficiencies) and what its spell picks become
 * (`character_spells` rows), as pure functions so level-up, de-level, character
 * creation and the sheet all read one answer (#994).
 */

export interface GrantHoldings {
  skills: SkillProficiencies;
  tools: readonly string[];
  languages: readonly string[];
}

export interface AppliedGrants {
  /** Skills that moved, in the same shape a skill pick records, so a de-level reverts them with `applySkillChanges`. */
  skills: Record<string, LevelSkillChange>;
  /** `tool_proficiencies` / `languages` after the grants. */
  tools: string[];
  languages: string[];
  /** Exactly what was added, as the history keeps it: a de-level removes this and nothing else. */
  granted: { tools: string[]; languages: string[] };
}

/** The part of a class definition that says whether it casts. */
export interface SpellcastingProgressionSource {
  caster_type?: string | null;
  spell_slots?: number[][] | null;
}

/**
 * Whether a class has a spellcasting progression: a caster type or a slot table
 * with any slot in it (a Paladin has one at level 1 with no slots yet, a
 * Fighter never does). Level-up and character creation both decide how a class
 * feature's spell pick is stored from this, so there is one answer.
 */
export function classHasSpellcastingProgression(def: SpellcastingProgressionSource | null | undefined): boolean {
  if (def === null || def === undefined) return false;
  const typed = def.caster_type !== undefined && def.caster_type !== null && def.caster_type !== "none";
  const slots = def.spell_slots?.some((row) => row.some((n) => n > 0)) === true;
  return typed || slots;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Applies the grants of every feature newly granted. Only what the character does
 * not already hold is added: a skill at "none" or absent becomes proficient (an
 * existing expertise is never downgraded), a tool or language is matched
 * case-insensitively but keeps the grant's own spelling when it lands.
 */
export function applyFeatureGrants(held: GrantHoldings, grants: readonly (FeatureGrants | undefined)[]): AppliedGrants {
  const skills: Record<string, LevelSkillChange> = {};
  const tools = [...held.tools];
  const languages = [...held.languages];
  const granted = { tools: [] as string[], languages: [] as string[] };

  for (const grant of grants) {
    if (grant === undefined) continue;
    if (grant.skills) {
      for (const key of grant.skills) {
        const current = Object.hasOwn(held.skills, key) ? held.skills[key] : undefined;
        const holds = current !== undefined && current !== null && current !== "none";
        if (!holds && !Object.hasOwn(skills, key)) skills[key] = { from: current === undefined ? null : current, to: "proficient" };
      }
    }
    if (grant.tools) {
      for (const tool of grant.tools) {
        if (tools.some((t) => sameName(t, tool))) continue;
        tools.push(tool);
        granted.tools.push(tool);
      }
    }
    if (grant.languages) {
      for (const language of grant.languages) {
        if (languages.some((l) => sameName(l, language))) continue;
        languages.push(language);
        granted.languages.push(language);
      }
    }
  }
  return { skills, tools, languages, granted };
}

/**
 * Skill changes of two sources in one level, as one record: the earliest `from`
 * and the latest `to` per skill, so a revert lands where the level began.
 */
export function mergeSkillChanges(
  first: Record<string, LevelSkillChange>,
  second: Record<string, LevelSkillChange>,
): Record<string, LevelSkillChange> {
  const out = { ...first };
  for (const [key, change] of Object.entries(second)) {
    out[key] = Object.hasOwn(out, key) ? { from: out[key].from, to: change.to } : change;
    if (out[key].from === out[key].to) delete out[key];
  }
  return out;
}

export interface FeatureSpellInput {
  due: readonly DueChoice[];
  values: Readonly<Record<string, ChoiceValue>>;
  /** Whether a feature is a feat; everything else is a class or subclass feature. */
  isFeat: (featureId: string) => boolean;
  /**
   * Whether the class being levelled has a spellcasting progression (its definition
   * has a caster type or a slot table). The server refuses a class-source row on
   * a class without one, so a pick there is stored as an "other" source instead.
   */
  classHasSpellcasting: boolean;
  /** Spells the character already holds; the server would skip these silently, so they stay out of the payload. */
  existingSpellIds: ReadonlySet<string>;
}

/**
 * The `character_spells` rows the level's spell picks become, with the ids they
 * add (what the history keeps so a de-level can remove them).
 *
 * - a feat's pick: source "feat", labelled with the feat;
 * - a class feature's pick on a spellcasting class: an always-prepared class row,
 *   so it casts with the class's DC and attack and counts toward no limit;
 * - a class feature's pick on a class that does not cast: source "other".
 *
 * A free cast (levelled spells only; cantrips need none) is one use per long rest.
 */
export function featureSpellRows(input: FeatureSpellInput): { rows: SpellRow[]; spellIds: string[] } {
  const rows: SpellRow[] = [];
  const seen = new Set(input.existingSpellIds);
  for (const entry of input.due) {
    const pick = entry.choice.pick;
    if (pick.kind !== "spell") continue;
    const key = dueKey(entry);
    if (!Object.hasOwn(input.values, key)) continue;
    const feat = input.isFeat(entry.featureId);
    const freeCast = pick.free_cast && pick.level > 0;
    for (const spell_id of input.values[key].picks) {
      if (seen.has(spell_id)) continue;
      seen.add(spell_id);
      const uses = freeCast ? { uses_per_day: 1, uses_remaining: 1, resets_on: "long_rest" } : {};
      if (feat) {
        rows.push({ spell_id, source_type: "feat", source_label: entry.featureName, is_prepared: false, ...uses });
      } else if (input.classHasSpellcasting) {
        rows.push({ spell_id, is_prepared: true, always_prepared: true, ...uses });
      } else {
        rows.push({ spell_id, source_type: "other", source_label: entry.featureName, is_prepared: false, ...uses });
      }
    }
  }
  return { rows, spellIds: rows.map((r) => r.spell_id) };
}
