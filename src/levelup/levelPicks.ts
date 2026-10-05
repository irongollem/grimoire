import type { SkillKey } from "@/data/classSkillChoices";
import type { AbilityKey } from "@/rules/characterCreation";
import {
  abilityDeltaFor,
  type ChoiceDelta,
  type DueChoice,
  type LevelChoiceRecord,
} from "@/rules/features/levelUpChoices";
import { applyAbilityIncrease } from "@/rules/features/prerequisites";
import type { FeatAbilityIncrease } from "@/rules/features/mechanics.types";
import { dueKey, type AsiPick, type ChoiceValue } from "@/components/features/choiceValue";
import type { ClassFeature } from "@/types/feature.types";
import type { LevelSkillChange, SkillProfLevel, SkillProficiencies } from "@/types/party.types";

/**
 * Turns what the player picked in the level-up wizard into the one reversible
 * record a level keeps (#976). Pure: the wizard hands in the due list and the
 * picker values; nothing here reads a store.
 */

/** Where the Weapon Mastery choice lives: the `weapon_masteries` column, not `class_choices`. */
export const MASTERY_CHOICE_KEY = "weapon_masteries";

/** The cap an Ability Score Improvement stops at (the book: "a maximum of 20"). */
const ASI_MAX = 20;

export interface ResolveInput {
  due: DueChoice[];
  values: Record<string, ChoiceValue>;
  /** Replaced conceptual key -> replacement feature id, for the swaps the player took. */
  swaps: Record<string, string>;
  scores: Record<AbilityKey, number>;
  skills: SkillProficiencies;
  featsById: ReadonlyMap<string, ClassFeature>;
  /** Mastery weapon name -> library item id; `weapon_masteries` stores ids. */
  masteryIdByName: ReadonlyMap<string, string>;
}

export interface ResolvedPicks {
  record: LevelChoiceRecord;
  skills: Record<string, LevelSkillChange>;
  masteries: { added: string[]; removed: string[] };
}

const ALL_ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

function asiIncrease(asi: AsiPick): FeatAbilityIncrease {
  return { abilities: ALL_ABILITIES, amount: 2, split: asi.mode === "plus1plus1", max: ASI_MAX };
}

function addDelta(into: ChoiceDelta, key: string, added: string[], removed: string[]): void {
  if (added.length === 0 && removed.length === 0) return;
  const existing = Object.hasOwn(into, key) ? into[key] : { added: [], removed: [] };
  into[key] = { added: [...existing.added, ...added], removed: [...existing.removed, ...removed] };
}

function mergeIncrease(
  into: Partial<Record<AbilityKey, number>>,
  scores: Record<AbilityKey, number>,
  delta: Partial<Record<AbilityKey, number>>,
): void {
  for (const [ability, by] of Object.entries(delta) as [AbilityKey, number][]) {
    into[ability] = (into[ability] ?? 0) + by;
    scores[ability] += by;
  }
}

function skillLevel(skills: SkillProficiencies, key: SkillKey): SkillProfLevel | null {
  return Object.hasOwn(skills, key) ? (skills[key] ?? null) : null;
}

export function resolveLevelPicks(input: ResolveInput): ResolvedPicks {
  const choices: ChoiceDelta = {};
  const feats: string[] = [];
  const abilityIncreases: Partial<Record<AbilityKey, number>> = {};
  const skillChanges: Record<string, LevelSkillChange> = {};
  const masteries = { added: [] as string[], removed: [] as string[] };
  // Scores advance as increases land, so two entries raising one ability still stop at the cap together.
  const running = { ...input.scores };

  const setSkill = (key: SkillKey, to: SkillProfLevel) => {
    const earlier = Object.hasOwn(skillChanges, key) ? skillChanges[key].from : skillLevel(input.skills, key);
    skillChanges[key] = { from: earlier, to };
  };

  for (const due of input.due) {
    const id = dueKey(due);
    if (!Object.hasOwn(input.values, id)) continue;
    const value = input.values[id];
    const pick = due.choice.pick;

    if (pick.kind === "asi_or_feat") {
      const asi = value.asi;
      if (asi === null) continue;
      if (asi.mode === "feat") {
        takeFeat(value, input.featsById, running, feats, abilityIncreases);
      } else if (asi.primary !== null) {
        const secondary = asi.mode === "plus1plus1" && asi.secondary !== null ? asi.secondary : undefined;
        const after = applyAbilityIncrease(running, asiIncrease(asi), { primary: asi.primary, secondary });
        const delta: Partial<Record<AbilityKey, number>> = {};
        for (const a of ALL_ABILITIES) if (after[a] !== running[a]) delta[a] = after[a] - running[a];
        mergeIncrease(abilityIncreases, running, delta);
      }
      continue;
    }
    if (pick.kind === "feat") {
      takeFeat(value, input.featsById, running, feats, abilityIncreases);
      continue;
    }

    // A replacement keeps its pick's slot, so `to` leads the added list.
    const replace = due.replaceAllowed ? value.replace : null;
    const added = [...(replace ? [replace.to] : []), ...value.picks];
    const removed = replace ? [replace.from] : [];

    if (due.choice.key === MASTERY_CHOICE_KEY) {
      const idOf = (name: string) => (input.masteryIdByName.has(name) ? (input.masteryIdByName.get(name) ?? name) : name);
      masteries.added.push(...added.map(idOf));
      masteries.removed.push(...removed.map(idOf));
      continue;
    }
    addDelta(choices, due.choice.key, added, removed);

    if (pick.kind === "expertise") {
      for (const v of added) if (v !== "thieves_tools") setSkill(v as SkillKey, "expertise");
      for (const v of removed) if (v !== "thieves_tools") setSkill(v as SkillKey, "proficient");
    } else if (pick.kind === "skill") {
      for (const v of added) setSkill(v as SkillKey, "proficient");
      for (const v of removed) setSkill(v as SkillKey, "none");
    }
  }

  // Skills that ended where they began record nothing.
  for (const key of Object.keys(skillChanges)) {
    const change = skillChanges[key];
    if (change.from === change.to) delete skillChanges[key];
  }

  return {
    record: { choices, abilityIncreases, feats, swaps: { ...input.swaps } },
    skills: skillChanges,
    masteries,
  };
}

function takeFeat(
  value: ChoiceValue,
  featsById: ReadonlyMap<string, ClassFeature>,
  running: Record<AbilityKey, number>,
  feats: string[],
  abilityIncreases: Partial<Record<AbilityKey, number>>,
): void {
  if (value.picks.length === 0) return;
  const id = value.picks[0];
  feats.push(...value.picks);
  const feat = featsById.get(id);
  if (feat === undefined || value.ability.primary === null) return;
  const delta = abilityDeltaFor(running, feat, {
    primary: value.ability.primary,
    ...(value.ability.secondary === null ? {} : { secondary: value.ability.secondary }),
  });
  mergeIncrease(abilityIncreases, running, delta);
}

/** The skill proficiencies after applying a level's changes (`to`) or undoing them (`from`). */
export function applySkillChanges(
  skills: SkillProficiencies,
  changes: Record<string, LevelSkillChange>,
  direction: "apply" | "revert",
): SkillProficiencies {
  const next: SkillProficiencies = { ...skills };
  for (const [key, change] of Object.entries(changes)) {
    const target = direction === "apply" ? change.to : change.from;
    if (target === null) delete next[key as SkillKey];
    else next[key as SkillKey] = target;
  }
  return next;
}

/** `weapon_masteries` after a level adds and removes item ids. */
export function applyMasteryChanges(
  current: readonly string[],
  changes: { added: readonly string[]; removed: readonly string[] },
  direction: "apply" | "revert",
): string[] {
  const add = direction === "apply" ? changes.added : changes.removed;
  const remove = direction === "apply" ? changes.removed : changes.added;
  const next = current.filter((id) => !remove.includes(id));
  for (const id of add) if (!next.includes(id)) next.push(id);
  return next;
}
