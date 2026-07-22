import { ref, computed, type ComputedRef, type Ref } from "vue";
import { parseBackgroundSkills, type SkillKey } from "@/lib/backgroundSkills";
import {
  isValidAsiChoice, parseBackgroundAsiChoice,
  type BackgroundAsiChoice,
} from "@/lib/backgroundAsi";
import type { CharacterFormState } from "@/lib/characterCreation";
import type { Background } from "@/types/background.types";

interface BackgroundSelectionDeps {
  allBackgrounds: Ref<Background[] | undefined>;
  selectedBg: ComputedRef<Background | null>;
  is2024: ComputedRef<boolean>;
}

/**
 * Background-grant tracking, selection, and the 2024 PHB background ASI +
 * skill-choice logic for the character creation wizard. Depends on the shared
 * form state `f` and the host's `selectedBg`/`allBackgrounds`/`is2024` so it
 * stays a single source of truth with the rest of the wizard.
 */
export function useCharacterBackgroundSelection(
  f: CharacterFormState,
  { allBackgrounds, selectedBg, is2024 }: BackgroundSelectionDeps,
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
    // 2024 PHB: record background feat grant in class_choices so it surfaces
    // in the character's features tab. background_feat stays the raw display
    // name — the origin feat itself is resolved live at display time (see
    // PlayerFeaturesTab.vue's backgroundOriginFeat), so no id needs storing.
    if (bg.feat_grant_name) {
      f.class_choices = {
        ...f.class_choices,
        background_feat: bg.feat_grant_name,
      };
    } else {
      const { background_feat: _removed, ...rest } = f.class_choices as Record<string, unknown>;
      void _removed;
      f.class_choices = rest;
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
    onBackgroundSelect,
    backgroundAsiChoice, backgroundAsiIncomplete,
    bgSkillChoices, bgChoiceLimit, bgFreeSkills, toggleBgSkillChoice,
  };
}
