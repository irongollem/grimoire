import { computed, type ComputedRef, type Ref } from "vue";
import { useAllFeatures, useFeaturesByIds } from "@/composables/rules/useFeatures";
import { useMetamagicOptions } from "@/composables/party/useMetamagic";
import { useWildShapeCandidates } from "@/composables/monsters/useWildShapeCandidates";
import { wildShapeRulesFor } from "@/rules/wildshape";
import type { AbilityKey } from "@/rules/characterCreation";
import {
  classResourcesFor,
  featIdsOf,
  featureIdsNeeded,
  grantedFeatures,
  resourcePools,
  swapsOf,
  type GrantedFeature,
  type StoredClassResources,
} from "@/rules/features/characterFeatures";
import {
  applyAbilityScoreIncreases,
  choicesDue,
  storedPicks,
  swapsOffered,
  type DueChoice,
  type OptionContext,
  type SwapOffer,
} from "@/rules/features/levelUpChoices";
import { parseMechanics } from "@/rules/features/mechanics";
import type { PrerequisiteCharacter } from "@/rules/features/prerequisites";
import { dueKey, pickedFeatId, type ChoiceValue } from "@/components/features/choiceValue";
import type { ClassFeature } from "@/types/feature.types";
import type { PartyMember } from "@/types/party.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { MASTERY_CHOICE_KEY, resolveLevelPicks, type ResolvedPicks } from "./levelPicks";
import {
  gainedAtLevel,
  poolChanges,
  projectClasses,
  scalingChanges,
  type ClassRowInfo,
  type FeatureMap,
} from "./levelUpProjection";
import { useMasteryWeapons } from "./useMasteryWeapons";
import { useSpellIndex } from "@/composables/spells/useSpellIndex";
import type { FeatureSpellInput } from "./featureGrants";
import type { FeatureGrants } from "@/rules/features/mechanics.types";

export interface LevelUpFeaturesInput {
  member: () => PartyMember;
  ruleset: Ref<RulesetKey>;
  rows: ComputedRef<ClassRowInfo[]>;
  chosenRowId: ComputedRef<string | null>;
  newClass: ComputedRef<{ className: string; classFeatures: FeatureMap | null; startLevels: number } | null>;
  pickedSubclass: ComputedRef<{ name: string; features: FeatureMap | null } | null>;
  className: ComputedRef<string>;
  /** The level in the class being taken, after this level-up. */
  classLevel: ComputedRef<number>;
  nextLevel: ComputedRef<number>;
  newProfBonus: ComputedRef<number>;
  /** The chosen class's weapon proficiencies, for Weapon Mastery. */
  weaponProficiencies: ComputedRef<string[]>;
  canCastSpells: ComputedRef<boolean>;
  /** Whether the class being levelled has a spellcasting progression; decides how a feature's spell pick is stored. */
  classHasSpellcasting: ComputedRef<boolean>;
  armorProficiencies: ComputedRef<PrerequisiteCharacter["armorProficiencies"]>;
  tashasOn: ComputedRef<boolean>;
  values: Ref<Record<string, ChoiceValue>>;
  /** Replaced conceptual key -> replacement feature id, for the swaps taken. */
  swapPicks: Ref<Record<string, string>>;
}

function scoresOf(m: PartyMember): Record<AbilityKey, number> {
  return { str: m.str, dex: m.dex, con: m.con, int: m.int, wis: m.wis, cha: m.cha };
}

const emptyFeatures: ClassFeature[] = [];

/**
 * Everything the level-up wizard needs to know about features: what is gained,
 * what is owed, what the picks add up to, and the resource maxima once they land
 * (#976). The state after the level is the sheet's own `grantedFeatures` run on
 * the class rows with the chosen class one level higher.
 */
export function useLevelUpFeatures(input: LevelUpFeaturesInput) {
  const { data: allFeatures } = useAllFeatures();
  const { options: metamagic } = useMetamagicOptions();
  const { weapons: masteryWeapons, idByName, nameById } = useMasteryWeapons(input.weaponProficiencies);

  const projection = computed(() =>
    projectClasses({
      rows: input.rows.value,
      chosenRowId: input.chosenRowId.value,
      newClass: input.newClass.value,
      pickedSubclass: input.pickedSubclass.value,
    }),
  );

  // What the character already holds, with Weapon Mastery shown by weapon name so
  // `existing` and the options speak the same language.
  const baseChoices = computed<Record<string, unknown>>(() => input.member().class_choices);
  const choicesForDue = computed<Record<string, unknown>>(() => ({
    ...baseChoices.value,
    [MASTERY_CHOICE_KEY]: input.member().weapon_masteries.map((id) => nameById.value.get(id) ?? id),
  }));

  const idsNeeded = computed(() =>
    featureIdsNeeded(projection.value.after, {
      ...baseChoices.value,
      feature_swaps: { ...swapsOf(baseChoices.value), ...input.swapPicks.value },
    }),
  );
  const { data: fetched, isPending: featuresPending } = useFeaturesByIds(idsNeeded);
  const featuresById = computed(
    () => new Map([...(allFeatures.value ?? emptyFeatures), ...(fetched.value ?? emptyFeatures)].map((f) => [f.id, f])),
  );

  function grantedWith(classChoices: Record<string, unknown>, pickedFeats: string[]): GrantedFeature[] {
    const m = input.member();
    const level = input.nextLevel.value;
    return grantedFeatures({
      classes: projection.value.after,
      featuresById: featuresById.value,
      classChoices,
      // A feat's own choice is asked the level the feat is taken, which the sheet reads from this entry.
      levelChoices: { ...m.level_choices, [String(level)]: { record: { feats: pickedFeats } } },
      characterLevel: level,
    });
  }

  const dueInput = (granted: GrantedFeature[], classChoices: Record<string, unknown>) => ({
    granted,
    className: input.className.value,
    fromLevel: input.classLevel.value - 1,
    toLevel: input.classLevel.value,
    characterLevelAfter: input.nextLevel.value,
    classChoices,
  });

  // Before any pick or swap: what a swap could replace.
  const grantedPlain = computed(() => grantedWith(baseChoices.value, []));

  const withSwaps = computed<Record<string, unknown>>(() => ({
    ...choicesForDue.value,
    feature_swaps: { ...swapsOf(baseChoices.value), ...input.swapPicks.value },
  }));

  // Two passes: the first finds the feats the player has picked, the second asks
  // those feats' own choices (2024 Skilled) on top.
  const firstDue = computed(() => choicesDue(dueInput(grantedWith(withSwaps.value, []), withSwaps.value)));
  const pickedFeats = computed(() => {
    const ids: string[] = [];
    for (const due of firstDue.value) {
      const value = input.values.value[dueKey(due)];
      const id = value === undefined ? null : pickedFeatId(due, value);
      if (id !== null) ids.push(id);
    }
    return ids;
  });
  const stateChoices = computed<Record<string, unknown>>(() => ({
    ...withSwaps.value,
    feats: [...featIdsOf(baseChoices.value), ...pickedFeats.value],
  }));
  const grantedAfter = computed(() => grantedWith(stateChoices.value, pickedFeats.value));
  const due = computed<DueChoice[]>(() => choicesDue(dueInput(grantedAfter.value, withSwaps.value)));

  const swapOffers = computed<SwapOffer[]>(() => {
    const candidates = (allFeatures.value ?? emptyFeatures)
      .map((f) => ({ ...f, mechanics: parseMechanics(f.mechanics).mechanics }))
      .filter((f) => f.mechanics.replaces !== undefined);
    return swapsOffered({
      candidates,
      granted: grantedPlain.value,
      className: input.className.value,
      fromLevel: input.classLevel.value - 1,
      toLevel: input.classLevel.value,
      classChoices: baseChoices.value,
      optionalRuleOn: input.tashasOn.value,
    });
  });

  const needsForms = computed(() =>
    due.value.some((d) => d.choice.pick.kind === "option" && d.choice.pick.set === "wild_shape_form"),
  );
  const wildRules = computed(() =>
    wildShapeRulesFor(
      input.member(),
      projection.value.after.map((c) => ({ class_name: c.className, subclass_name: c.subclassName, levels: c.levels })),
      input.ruleset.value,
    ),
  );
  const { data: forms } = useWildShapeCandidates(
    () => wildRules.value,
    () => ({ enabled: needsForms.value }),
  );

  // The spell index is only worth fetching once a spell pick is owed.
  const needsSpells = computed(() => due.value.some((d) => d.choice.pick.kind === "spell"));
  const { data: spellIndex } = useSpellIndex(() => ({ enabled: needsSpells.value }));

  /**
   * The variant that narrows an entry's spell lists: only the character's origin feat
   * has one ("Wizard" for Magic Initiate (Wizard)), kept in `class_choices` beside its id.
   */
  function spellVariantFor(entry: Pick<DueChoice, "featureId">): string | null {
    const choices = baseChoices.value;
    const isOrigin = typeof choices.origin_feat_id === "string" && choices.origin_feat_id === entry.featureId;
    return isOrigin && typeof choices.origin_feat_variant === "string" ? choices.origin_feat_variant : null;
  }

  const optionContext = computed<Omit<OptionContext, "existing">>(() => {
    const m = input.member();
    return {
      ruleset: input.ruleset.value,
      className: input.className.value,
      classLevel: input.classLevel.value,
      characterLevel: input.nextLevel.value,
      abilityScores: scoresOf(m),
      skills: m.skill_proficiencies,
      canCastSpells: input.canCastSpells.value,
      armorProficiencies: input.armorProficiencies.value,
      hasFightingStyleFeature: grantedAfter.value.some(
        (g) => g.mechanics.choices?.some((c) => c.pick.kind === "option" && c.pick.set === "fighting_style") === true,
      ),
      takenFeatIds: featIdsOf(baseChoices.value),
      feats: allFeatures.value ?? emptyFeatures,
      metamagic: metamagic.value,
      wildShapeForms: forms.value.map((f) => ({ id: f.id, name: f.name })),
      masteryWeapons: masteryWeapons.value.map((w) => ({ name: w.name })),
      spells: spellIndex.value === undefined ? [] : spellIndex.value,
      // Per entry, so it is set where the entry is drawn (`spellVariantFor`).
      spellListVariant: null,
      // A Warlock takes the boon and the invocations that need it at the same level; the picker overrides this with that pick.
      pactBoon: storedPicks(baseChoices.value, "pact_boon")[0] ?? null,
    };
  });

  const resolved = computed<ResolvedPicks>(() =>
    resolveLevelPicks({
      due: due.value,
      values: input.values.value,
      swaps: input.swapPicks.value,
      scores: scoresOf(input.member()),
      skills: input.member().skill_proficiencies,
      featsById: featuresById.value,
      masteryIdByName: idByName.value,
    }),
  );

  const gained = computed(() => gainedAtLevel(grantedAfter.value, input.className.value, input.classLevel.value));
  // Features that come into force at this level: the class and subclass ones gained, and the feats taken.
  // A character taking its first level (creation) takes its origin feat with it; at any later level it is already held.
  const grantedNow = computed(() => {
    const firstLevel = input.member().level === 0;
    const feats = grantedAfter.value.filter(
      (g) =>
        g.grant.kind === "feat" &&
        (pickedFeats.value.includes(g.feature.id) || (firstLevel && g.grant.via === "origin")),
    );
    return [...gained.value, ...feats];
  });
  const featureGrants = computed<(FeatureGrants | undefined)[]>(() => grantedNow.value.map((g) => g.mechanics.grants));
  const featureSpells = computed<Omit<FeatureSpellInput, "existingSpellIds">>(() => ({
    due: due.value,
    values: input.values.value,
    isFeat: (id) => featuresById.value.get(id)?.kind === "feat",
    classHasSpellcasting: input.classHasSpellcasting.value,
  }));

  const scoresAfter = computed(() => applyAbilityScoreIncreases(scoresOf(input.member()), resolved.value.record.abilityIncreases));

  const grantedBefore = computed(() => {
    const m = input.member();
    return grantedFeatures({
      classes: projection.value.before,
      featuresById: featuresById.value,
      classChoices: m.class_choices,
      levelChoices: m.level_choices,
      characterLevel: m.level,
    });
  });
  const poolsBefore = computed(() => {
    const m = input.member();
    return resourcePools(grantedBefore.value, {
      proficiencyBonus: m.proficiency_bonus,
      abilityScores: scoresOf(m),
      characterLevel: m.level,
    });
  });
  const poolsAfter = computed(() =>
    resourcePools(grantedAfter.value, {
      proficiencyBonus: input.newProfBonus.value,
      abilityScores: scoresAfter.value,
      characterLevel: input.nextLevel.value,
    }),
  );

  const scaling = computed(() => scalingChanges(grantedBefore.value, grantedAfter.value));
  const pools = computed(() => poolChanges(poolsBefore.value, poolsAfter.value));
  const classResources = computed<StoredClassResources>(() => classResourcesFor(poolsAfter.value, input.member().class_resources));

  return {
    projection,
    featuresById,
    // A disabled query (no ids to fetch) stays pending forever in TanStack v5.
    isLoading: computed(() => idsNeeded.value.length > 0 && featuresPending.value),
    gained,
    scaling,
    pools,
    due,
    swapOffers,
    optionContext,
    spellVariantFor,
    featureGrants,
    featureSpells,
    resolved,
    classResources,
    masteryWeapons,
  };
}
