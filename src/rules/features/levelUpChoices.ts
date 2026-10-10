import type { AbilityKey } from "@/rules/characterCreation";
import type { ClassFeature } from "@/types/feature.types";
import type { SkillProfLevel } from "@/types/party.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { SKILLS } from "@/types/party.types";
import type { SkillKey } from "@/types/party.types";
import { ARTIFICER_INFUSIONS } from "@/data/artificerInfusions";
import { BATTLE_MASTER_MANEUVER_NAMES } from "@/data/battleMasterManeuvers";
import { ELDRITCH_INVOCATIONS } from "@/data/eldritchInvocations";
import { FAVORED_ENEMIES_2014, FAVORED_TERRAINS_2014 } from "@/data/favoredEnemies";
import { FIGHTING_STYLES_2014 } from "@/data/fightingStyles";
import { PACT_BOONS_2014 } from "@/data/pactBoons";
import type { GrantedFeature } from "./characterFeatures";
import { swapsOf } from "./characterFeatures";
import { parseFeatAbilityIncrease, parseFeatPrerequisites } from "./mechanics";
import type { ChoicePick, FeatureChoice, OptionSet } from "./mechanics.types";
import { applyAbilityIncrease, featPrerequisitesMet, type PrerequisiteCharacter } from "./prerequisites";
import { valueAtLevel, choicePicksDue } from "./resolve";

/**
 * What level-up owes a character and how a level's picks are recorded and
 * undone (#976). Pure: the level-up wizard fetches, this decides.
 */

export interface DueChoice {
  featureId: string;
  featureName: string;
  choice: FeatureChoice;
  /** New picks owed; 0 on an entry that only offers a replacement. */
  picks: number;
  replaceAllowed: boolean;
  /** The picks already stored under `choice.key`. */
  existing: string[];
}

export interface ChoicesDueInput {
  granted: GrantedFeature[];
  className: string;
  fromLevel: number;
  toLevel: number;
  characterLevelAfter: number;
  classChoices: Record<string, unknown>;
}

/** Stored picks as a list; a legacy single string counts as one pick, anything else as none. */
export function storedPicks(classChoices: Record<string, unknown>, key: string): string[] {
  if (!Object.hasOwn(classChoices, key)) return [];
  const value = classChoices[key];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

export function choicesDue(input: ChoicesDueInput): DueChoice[] {
  const out: DueChoice[] = [];
  const seen = new Set<string>();
  const levelChanged = input.toLevel > input.fromLevel;

  for (const g of input.granted) {
    const choices = g.mechanics.choices;
    if (!choices) continue;
    const grant = g.grant;
    let range: { levelsGranted: number[]; fromLevel: number; toLevel: number };
    if (grant.kind === "feat") {
      // A feat's own choice (2024 Skilled) is asked the level the feat is taken, or at creation for the origin feat.
      const now =
        grant.via === "origin" ? input.fromLevel === 0 : grant.atLevel === input.characterLevelAfter;
      if (!now) continue;
      range = { levelsGranted: [input.characterLevelAfter], fromLevel: 0, toLevel: input.characterLevelAfter };
      // Per-grant counts compare the feat's single grant level against the level before it.
      if (grant.via === "level") range.fromLevel = input.characterLevelAfter - 1;
    } else {
      if (grant.className !== input.className || !levelChanged) continue;
      range = { levelsGranted: grant.levelsGained, fromLevel: input.fromLevel, toLevel: input.toLevel };
    }

    for (const choice of choices) {
      const id = `${g.feature.id}:${choice.key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const picks = choicePicksDue(choice, range);
      const existing = storedPicks(input.classChoices, choice.key);
      // A replacement needs something to replace, and a level at which the choice is live.
      let live = false;
      if (choice.count.kind === "known") live = valueAtLevel(choice.count.values, range.toLevel) !== null;
      else live = range.levelsGranted.some((l) => l > range.fromLevel && l <= range.toLevel);
      const replaceAllowed = choice.replace_on_level_up && grant.kind !== "feat" && live && existing.length > 0;
      if (picks === 0 && !replaceAllowed) continue;
      out.push({ featureId: g.feature.id, featureName: g.feature.name, choice, picks, replaceAllowed, existing });
    }
  }
  return out;
}

// --- Tasha's swaps ---------------------------------------------------------

export interface SwapOffer {
  /** Conceptual key of the feature given up; the key under `feature_swaps`. */
  replacedKey: string;
  replacedFeatureId: string;
  replacedFeatureName: string;
  replacementId: string;
  replacementName: string;
}

export interface SwapsOfferedInput {
  /** Readable features whose `mechanics.replaces` is set, fetched by the UI. */
  candidates: ClassFeature[];
  granted: GrantedFeature[];
  className: string;
  fromLevel: number;
  toLevel: number;
  classChoices: Record<string, unknown>;
  optionalRuleOn: boolean;
}

/** Swaps for features this class gained in (fromLevel, toLevel] and that are not already swapped. */
export function swapsOffered(input: SwapsOfferedInput): SwapOffer[] {
  if (!input.optionalRuleOn) return [];
  const taken = swapsOf(input.classChoices);
  const offers: SwapOffer[] = [];
  for (const candidate of input.candidates) {
    const replaces = candidate.mechanics.replaces;
    if (replaces === undefined || Object.hasOwn(taken, replaces)) continue;
    const target = input.granted.find(
      (g) =>
        g.grant.kind !== "feat" &&
        g.grant.className === input.className &&
        g.feature.conceptual_key === replaces &&
        g.grant.levelsGained.some((l) => l > input.fromLevel && l <= input.toLevel),
    );
    if (!target) continue;
    offers.push({
      replacedKey: replaces,
      replacedFeatureId: target.feature.id,
      replacedFeatureName: target.feature.name,
      replacementId: candidate.id,
      replacementName: candidate.name,
    });
  }
  return offers;
}

// --- Recording and undoing a level's picks ---------------------------------

export type ChoiceDelta = Record<string, { added: string[]; removed: string[] }>;

export interface LevelChoiceRecord {
  choices: ChoiceDelta;
  /** Already capped by the feat's maximum, so reverting subtracts exactly this. */
  abilityIncreases: Partial<Record<AbilityKey, number>>;
  /** Feat ids taken this level, appended to `class_choices.feats`. */
  feats: string[];
  /** Replaced conceptual key -> replacement feature id. */
  swaps: Record<string, string>;
}

function removeOne(list: string[], value: string, fromEnd = false): void {
  const i = fromEnd ? list.lastIndexOf(value) : list.indexOf(value);
  if (i >= 0) list.splice(i, 1);
}

/**
 * Swaps `from[k]` for `to[k]` in place, so a replaced pick keeps its slot; any
 * surplus `from` is deleted and any surplus `to` appended. Reverting calls it
 * with the lists exchanged, which restores the original order for replacements.
 */
function transform(list: string[], from: string[], to: string[], surplusFromEnd: boolean): void {
  const pairs = Math.min(from.length, to.length);
  for (let k = 0; k < pairs; k++) {
    const i = list.indexOf(from[k]);
    if (i >= 0) list[i] = to[k];
    else list.push(to[k]);
  }
  for (const v of from.slice(pairs)) removeOne(list, v, surplusFromEnd);
  for (const v of to.slice(pairs)) list.push(v);
}

export function applyLevelChoices(
  classChoices: Record<string, unknown>,
  record: LevelChoiceRecord,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...classChoices };
  for (const [key, delta] of Object.entries(record.choices)) {
    const list = storedPicks(next, key);
    transform(list, delta.removed, delta.added, false);
    next[key] = list;
  }
  if (record.feats.length > 0) next.feats = [...storedPicks(next, "feats"), ...record.feats];
  if (Object.keys(record.swaps).length > 0) next.feature_swaps = { ...swapsOf(next), ...record.swaps };
  return next;
}

export function revertLevelChoices(
  classChoices: Record<string, unknown>,
  record: LevelChoiceRecord,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...classChoices };
  for (const [key, delta] of Object.entries(record.choices)) {
    const list = storedPicks(next, key);
    // Additions were appended, so surplus ones come off the end.
    transform(list, delta.added, delta.removed, true);
    if (list.length === 0) delete next[key];
    else next[key] = list;
  }
  if (record.feats.length > 0) {
    const feats = storedPicks(next, "feats");
    // Appended last, so the newest occurrences are this level's.
    for (const id of record.feats) removeOne(feats, id, true);
    if (feats.length === 0) delete next.feats;
    else next.feats = feats;
  }
  if (Object.keys(record.swaps).length > 0) {
    const swaps = swapsOf(next);
    for (const key of Object.keys(record.swaps)) delete swaps[key];
    if (Object.keys(swaps).length === 0) delete next.feature_swaps;
    else next.feature_swaps = swaps;
  }
  return next;
}

export function applyAbilityScoreIncreases(
  scores: Record<AbilityKey, number>,
  increases: Partial<Record<AbilityKey, number>>,
): Record<AbilityKey, number> {
  const next = { ...scores };
  for (const [ability, by] of Object.entries(increases) as [AbilityKey, number][]) next[ability] += by;
  return next;
}

/** Subtracts exactly what was added, with no cap logic: the record already holds the capped amounts. */
export function revertAbilityScoreIncreases(
  scores: Record<AbilityKey, number>,
  increases: Partial<Record<AbilityKey, number>>,
): Record<AbilityKey, number> {
  const next = { ...scores };
  for (const [ability, by] of Object.entries(increases) as [AbilityKey, number][]) next[ability] -= by;
  return next;
}

/**
 * The capped per-ability delta a feat's increase makes, to store in
 * `LevelChoiceRecord.abilityIncreases` (a score already at the cap gains 0).
 */
export function abilityDeltaFor(
  scores: Record<AbilityKey, number>,
  feat: ClassFeature,
  pick: { primary: AbilityKey; secondary?: AbilityKey },
): Partial<Record<AbilityKey, number>> {
  const increase = parseFeatAbilityIncrease(feat.ability_increase);
  if (!increase) return {};
  const after = applyAbilityIncrease(scores, increase, pick);
  const delta: Partial<Record<AbilityKey, number>> = {};
  for (const ability of Object.keys(scores) as AbilityKey[]) {
    if (after[ability] !== scores[ability]) delta[ability] = after[ability] - scores[ability];
  }
  return delta;
}

// --- Options ---------------------------------------------------------------

export interface ChoiceOption {
  value: string;
  label: string;
  /** Why it cannot be picked; null when it can. */
  unavailable: string | null;
}

export interface OptionContext {
  ruleset: RulesetKey;
  className: string;
  classLevel: number;
  characterLevel: number;
  abilityScores: Record<AbilityKey, number>;
  skills: Partial<Record<SkillKey, SkillProfLevel>>;
  canCastSpells: boolean;
  armorProficiencies: PrerequisiteCharacter["armorProficiencies"];
  hasFightingStyleFeature: boolean;
  /** Picks already stored for the choice being asked. */
  existing: string[];
  takenFeatIds: string[];
  /** Readable feats; filtered here by edition. */
  feats: ClassFeature[];
  metamagic: { name: string }[];
  wildShapeForms: { id: string; name: string }[];
  masteryWeapons: { name: string }[];
  /** The Warlock's Pact Boon, when known; absent means pact prerequisites are not checked. */
  pactBoon?: string | null;
  /** Readable spells a spell pick draws from; `classes` null means the spell names no class list. */
  spells: readonly { id: string; name: string; level: number; classes: readonly string[] | null }[];
  /** The variant of the feature whose choice is being asked ("Wizard" for Magic Initiate (Wizard)); null when it has none. */
  spellListVariant: string | null;
}

/**
 * The spell lists a spell pick draws from. One list is that list. With several,
 * the granting feat's variant names which one (case-insensitively, as variants
 * are typed by hand), and without a matching variant the pick is the union of
 * them all.
 */
export function resolveSpellLists(pick: Extract<ChoicePick, { kind: "spell" }>, variant: string | null): string[] {
  if (pick.lists.length === 1) return [...pick.lists];
  if (variant !== null) {
    const wanted = variant.trim().toLowerCase();
    const match = pick.lists.find((l) => l.toLowerCase() === wanted);
    if (match !== undefined) return [match];
  }
  return [...pick.lists];
}

function spellOptions(pick: Extract<ChoicePick, { kind: "spell" }>, ctx: OptionContext): ChoiceOption[] {
  const lists = resolveSpellLists(pick, ctx.spellListVariant).map((l) => l.toLowerCase());
  return ctx.spells
    .filter((sp) => sp.level === pick.level)
    .filter((sp) => sp.classes !== null && sp.classes.some((c) => lists.includes(c.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((sp) => opt(sp.id, sp.name));
}

const opt = (value: string, label: string = value, unavailable: string | null = null): ChoiceOption => ({
  value,
  label,
  unavailable,
});

const skillLabel = (key: SkillKey): string => SKILLS.find((s) => s.key === key)?.label ?? key;

/** The prerequisite text of an invocation, when it names a level or a pact the engine can check. */
function invocationBlock(prereq: string | undefined, ctx: OptionContext): string | null {
  if (!prereq) return null;
  const level = /(\d+)(?:st|nd|rd|th)[- ]level/.exec(prereq);
  if (level && ctx.classLevel < Number(level[1])) return prereq;
  const pact = /^Pact of the \w+/.exec(prereq);
  if (pact && ctx.pactBoon !== undefined && ctx.pactBoon !== pact[0]) return prereq;
  return null;
}

function setOptions(set: OptionSet, ctx: OptionContext): ChoiceOption[] {
  switch (set) {
    case "fighting_style": {
      // 2024 fighting styles are feats and are picked through a feat choice.
      if (ctx.ruleset !== "2014") return [];
      const names: readonly string[] = Object.hasOwn(FIGHTING_STYLES_2014, ctx.className)
        ? FIGHTING_STYLES_2014[ctx.className as keyof typeof FIGHTING_STYLES_2014]
        : FIGHTING_STYLES_2014.Fighter;
      return names.map((n) => opt(n));
    }
    case "eldritch_invocation":
      return ELDRITCH_INVOCATIONS.map((i) =>
        opt(i.name, i.name, ctx.classLevel < i.min_level ? `Level ${i.min_level}` : invocationBlock(i.prerequisites, ctx)),
      );
    case "maneuver":
      return BATTLE_MASTER_MANEUVER_NAMES.map((n) => opt(n));
    case "metamagic":
      return ctx.metamagic.map((m) => opt(m.name));
    case "pact_boon":
      return PACT_BOONS_2014.map((n) => opt(n));
    case "favored_enemy":
      return FAVORED_ENEMIES_2014.map((n) => opt(n));
    case "favored_terrain":
      return FAVORED_TERRAINS_2014.map((n) => opt(n));
    case "weapon_mastery":
      return ctx.masteryWeapons.map((w) => opt(w.name));
    case "wild_shape_form":
      return ctx.wildShapeForms.map((f) => opt(f.id, f.name));
    case "artificer_infusion":
      return ARTIFICER_INFUSIONS.map((i) => opt(i.name, i.name, ctx.classLevel < i.min_level ? `Level ${i.min_level}` : null));
  }
}

function featOptions(categories: readonly string[] | null, ctx: OptionContext): ChoiceOption[] {
  const character: PrerequisiteCharacter = {
    level: ctx.characterLevel,
    abilityScores: ctx.abilityScores,
    canCastSpells: ctx.canCastSpells,
    armorProficiencies: ctx.armorProficiencies,
    hasFightingStyleFeature: ctx.hasFightingStyleFeature,
  };
  return ctx.feats
    .filter((f) => f.kind === "feat")
    .filter((f) => f.ruleset === undefined || f.ruleset === null || f.ruleset === ctx.ruleset)
    // 2014 feats have no category; a null list means any of them.
    .filter((f) => categories === null || (f.feat_category !== null && categories.includes(f.feat_category)))
    .map((f) => {
      const { unmet } = featPrerequisitesMet(parseFeatPrerequisites(f.prerequisites), character);
      let unavailable: string | null = null;
      if (unmet.length > 0) unavailable = unmet.join(", ");
      else if (!f.repeatable && ctx.takenFeatIds.includes(f.id)) unavailable = "Already taken";
      return opt(f.id, f.name, unavailable);
    });
}

export function optionsFor(pick: ChoicePick, ctx: OptionContext): ChoiceOption[] {
  let options: ChoiceOption[];
  switch (pick.kind) {
    case "asi_or_feat":
      // The wizard renders the ASI form itself; its feat half is a separate feat pick.
      return [];
    case "feat":
      // Feats are stored in `feats`, not under the choice key, so `existing` does not apply.
      return featOptions(pick.categories, ctx);
    case "expertise": {
      options = SKILLS.filter((s) => ctx.skills[s.key] === "proficient").map((s) => opt(s.key, s.label));
      if (pick.thieves_tools) options.push(opt("thieves_tools", "Thieves' Tools"));
      break;
    }
    case "skill": {
      const pool: readonly SkillKey[] = pick.from.length > 0 ? pick.from : SKILLS.map((s) => s.key);
      options = pool
        .filter((k) => ctx.skills[k] !== "proficient" && ctx.skills[k] !== "expertise")
        .map((k) => opt(k, skillLabel(k)));
      break;
    }
    case "option":
      options = setOptions(pick.set, ctx);
      break;
    case "custom":
      options = pick.options.map((n) => opt(n));
      break;
    case "spell":
      options = spellOptions(pick, ctx);
      break;
  }
  return options.map((o) =>
    o.unavailable === null && ctx.existing.includes(o.value) ? { ...o, unavailable: "Already chosen" } : o,
  );
}
