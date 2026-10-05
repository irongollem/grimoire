import { ref, computed, watch, type ComputedRef, type Ref } from "vue";
import { parseBackgroundSkills, type SkillKey } from "@/rules/backgroundSkills";
import {
  isValidAsiChoice, originFeatOf, parseBackgroundAsiChoice, resolveOriginFeat, withOriginFeat,
  type BackgroundAsiChoice,
} from "@/rules/backgroundAsi";
import type { ClassFeature } from "@/types/feature.types";
import type { RulesetKey } from "@/types/ruleset.types";
import type { CharacterFormState } from "@/rules/characterCreation";
import type { Background } from "@/types/background.types";

interface BackgroundSelectionDeps {
  allBackgrounds: Ref<Background[] | undefined>;
  selectedBg: ComputedRef<Background | null>;
  is2024: ComputedRef<boolean>;
  ruleset: Ref<RulesetKey>;
  /** Readable feats of the character's edition; undefined while they load. */
  features: Ref<ClassFeature[] | undefined>;
  /** A new character follows its background live; a saved one changes only when the player picks. */
  isEditMode: ComputedRef<boolean>;
}

/**
 * Background-grant tracking, selection, and the 2024 PHB background ASI +
 * skill-choice logic for the character creation wizard. Depends on the shared
 * form state `f` and the host's `selectedBg`/`allBackgrounds`/`is2024` so it
 * stays a single source of truth with the rest of the wizard.
 */
export function useCharacterBackgroundSelection(
  f: CharacterFormState,
  { allBackgrounds, selectedBg, is2024, ruleset, features, isEditMode }: BackgroundSelectionDeps,
) {
  // Exact record of the proficiencies the *currently selected* background
  // granted. Used to undo them when the player switches background — otherwise
  // each newly-picked background's skills/tools/languages accumulate on top of
  // the previous one's, and the orphaned skills wrongly count against the class
  // skill budget (they're no longer recognised as background-granted).
  const bgGrantedSkills = ref<SkillKey[]>([]);
  const bgGrantedTools = ref<string[]>([]);
  const bgGrantedLanguages = ref<string[]>([]);
  // Subset of bgGrantedSkills the player actively chose for a background "choose
  // one of …" clause (vs. the unconditional fixed grants). Drives the picker's
  // selected state and enforces the choice's pick count.
  const bgChosenSkills = ref<SkillKey[]>([]);

  /** The origin feat the selected background grants (2024 only), looked up in this edition's feats. */
  const originFeat = computed(() =>
    is2024.value ? resolveOriginFeat(originFeatOf(selectedBg.value), features.value ?? [], ruleset.value) : null);

  /**
   * A granted origin feat that is not among this table's books. It blocks the
   * step: saving only its name would give the sheet a feat it cannot show or
   * ask the choices of. False while the feats are still loading.
   */
  const originFeatUnresolved = computed(() =>
    features.value !== undefined && originFeat.value !== null && originFeat.value.feature === null);

  /**
   * Makes `class_choices` hold the origin feat of `bg` (id, variant, and the
   * entry in `feats`) and nothing of the previous background's. Waits for the
   * feats to load, since an id cannot be resolved before then.
   */
  function syncOriginFeat(bg: Background | null) {
    if (features.value === undefined) return;
    const resolved = is2024.value ? resolveOriginFeat(originFeatOf(bg), features.value, ruleset.value) : null;
    const next = resolved?.feature ? { featId: resolved.feature.id, variant: resolved.originFeat.variant } : null;
    const choices = f.class_choices as Record<string, unknown>;
    const storedId = typeof choices.origin_feat_id === "string" ? choices.origin_feat_id : null;
    const storedVariant = typeof choices.origin_feat_variant === "string" ? choices.origin_feat_variant : null;
    if ((next?.featId ?? null) === storedId && (next?.variant ?? null) === storedVariant) return;
    f.class_choices = withOriginFeat(choices, next);
  }
  // The feats and the edition arrive after the background may already be picked.
  watch([features, ruleset, selectedBg], () => {
    if (!isEditMode.value) syncOriginFeat(selectedBg.value);
  });

  function onBackgroundSelect(id: string) {
    const bg = (allBackgrounds.value ?? []).find(b => b.id === id);

    // Undo the previously-selected background's grants first, so switching
    // backgrounds replaces rather than accumulates. Only remove skills still at
    // exactly "proficient" (expertise would have come from the class, not here).
    for (const key of bgGrantedSkills.value) {
      if ((f.skill_proficiencies[key] ?? "none") === "proficient") {
        f.skill_proficiencies[key] = "none";
      }
    }
    for (const tool of bgGrantedTools.value) {
      const idx = f.tool_proficiencies.indexOf(tool);
      if (idx >= 0) f.tool_proficiencies.splice(idx, 1);
    }
    for (const lang of bgGrantedLanguages.value) {
      const idx = f.languages.indexOf(lang);
      if (idx >= 0) f.languages.splice(idx, 1);
    }
    bgGrantedSkills.value = [];
    bgGrantedTools.value = [];
    bgGrantedLanguages.value = [];
    bgChosenSkills.value = [];

    // Switching backgrounds invalidates any in-progress 2024 ASI choice — it was
    // scoped to the previous background's ability trio and may not even apply
    // to the new one's.
    {
      const { background_asi: _asi, ...rest } = f.class_choices as Record<string, unknown>;
      void _asi;
      f.class_choices = rest;
    }

    f.background_id = id || null;
    syncOriginFeat(bg ?? null);
    if (!bg) return;

    // Only auto-grant the background's FIXED skills. Choice skills ("either A
    // or B") are picked separately, so a choice background no longer toggles
    // every option on at once. Each grant is recorded so it can be undone above
    // when the background changes.
    const { fixed } = parseBackgroundSkills(bg.skill_proficiencies);
    for (const key of fixed) {
      if ((f.skill_proficiencies[key] ?? "none") === "none") {
        f.skill_proficiencies[key] = "proficient";
        bgGrantedSkills.value.push(key);
      }
    }
    for (const tool of bg.tool_proficiencies ?? []) {
      if (!f.tool_proficiencies.includes(tool)) {
        f.tool_proficiencies.push(tool);
        bgGrantedTools.value.push(tool);
      }
    }
    for (const lang of bg.languages ?? []) {
      if (!f.languages.includes(lang)) {
        f.languages.push(lang);
        bgGrantedLanguages.value.push(lang);
      }
    }
  }

  /**
   * The player's current 2024 background ASI choice, synced into
   * `class_choices.background_asi` so it persists with the rest of the form
   * and survives step navigation.
   */
  const backgroundAsiChoice = computed<BackgroundAsiChoice | null>({
    get: () => parseBackgroundAsiChoice(f.class_choices?.background_asi),
    set: (choice) => {
      if (choice) {
        f.class_choices = { ...f.class_choices, background_asi: choice };
        return;
      }
      const { background_asi: _asi, ...rest } = f.class_choices as Record<string, unknown>;
      void _asi;
      f.class_choices = rest;
    },
  });

  /**
   * True when the background step's 2024 ASI choice has been started but
   * isn't yet valid — a mode picked with the trio-specific abilities not
   * fully chosen. Untouched (null) is a deliberate skip, not incomplete.
   * Gates the wizard's Next/Create button so a half-made choice can't be
   * carried forward and silently dropped.
   */
  const backgroundAsiIncomplete = computed(() => {
    const trio = selectedBg.value?.asi_ability_trio;
    if (!is2024.value || !trio) return false;
    return backgroundAsiChoice.value !== null && !isValidAsiChoice(backgroundAsiChoice.value, trio);
  });

  /** Parsed "choose N of …" skill clauses for the selected background, if any. */
  const bgSkillChoices = computed(() =>
    selectedBg.value ? parseBackgroundSkills(selectedBg.value.skill_proficiencies).choices : [],
  );

  /** Total picks the background's choice clauses allow (used to cap selection). */
  const bgChoiceLimit = computed(() =>
    bgSkillChoices.value.reduce((sum, c) => sum + c.count, 0),
  );

  /** All skills the current background grants for free: fixed + actively chosen. */
  const bgFreeSkills = computed<SkillKey[]>(() => {
    const fixed = selectedBg.value
      ? parseBackgroundSkills(selectedBg.value.skill_proficiencies).fixed
      : [];
    return [...new Set([...fixed, ...bgChosenSkills.value])];
  });

  /** Toggle a background choice-skill. Honors the choice's pick limit and keeps
   *  the grant tracked so it's freed on background switch and excluded from the
   *  class skill budget. */
  function toggleBgSkillChoice(key: SkillKey) {
    const chosen = bgChosenSkills.value.includes(key);
    if (chosen) {
      bgChosenSkills.value = bgChosenSkills.value.filter(k => k !== key);
      bgGrantedSkills.value = bgGrantedSkills.value.filter(k => k !== key);
      if ((f.skill_proficiencies[key] ?? "none") === "proficient") {
        f.skill_proficiencies[key] = "none";
      }
      return;
    }
    if (bgChosenSkills.value.length >= bgChoiceLimit.value) return; // at limit
    bgChosenSkills.value.push(key);
    if ((f.skill_proficiencies[key] ?? "none") === "none") {
      f.skill_proficiencies[key] = "proficient";
      bgGrantedSkills.value.push(key);
    }
  }

  return {
    bgGrantedSkills, bgGrantedTools, bgGrantedLanguages, bgChosenSkills,
    onBackgroundSelect, originFeat, originFeatUnresolved,
    backgroundAsiChoice, backgroundAsiIncomplete,
    bgSkillChoices, bgChoiceLimit, bgFreeSkills, toggleBgSkillChoice,
  };
}
