<template>
  <div class="space-y-4">
    <p class="text-body text-muted-foreground italic">
      Choose your class. Saving throws are fixed by class and applied automatically.
    </p>

    <!-- Class picker -->
    <div v-if="!mergedClasses.length" class="rounded-lg border border-border bg-card p-6 text-center">
      <p class="text-body text-muted-foreground italic">No classes available — skip for now.</p>
    </div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <button v-for="cls in mergedClasses" :key="cls.choice_key" type="button"
        class="rounded-lg border overflow-hidden text-left transition-all p-3"
        :class="selectedClassKey === cls.choice_key
          ? 'border-primary ring-1 ring-primary bg-primary/5'
          : 'border-border bg-card hover:border-primary/40'"
        @click="onClassSelect(cls.choice_key)">
        <div class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-bold text-foreground">{{ cls.class_name }}</p>
            <p class="text-eyebrow text-muted-foreground/70">
              {{ cls.definition_kind === 'system' ? 'Official' : (cls.source_document_key ? 'Imported' : 'Custom') }}
              <template v-if="cls.source_revision"> · {{ cls.source_revision }}</template>
            </p>
            <p v-if="cls.primary_ability" class="text-caption text-muted-foreground mt-0.5">{{ cls.primary_ability }}</p>
          </div>
          <span class="shrink-0 px-2 py-0.5 rounded bg-muted font-cinzel text-2xs text-muted-foreground">
            d{{ cls.hit_die }}
          </span>
        </div>
        <div v-if="cls.saving_throws?.length" class="mt-1.5 flex flex-wrap gap-1">
          <span v-for="st in cls.saving_throws" :key="st"
            class="px-1.5 py-0.5 rounded bg-muted/60 font-cinzel text-2xs text-muted-foreground uppercase">{{ st }}</span>
        </div>
        <!-- Skill pick count hint on each card -->
        <p v-if="classSkillDataFor(cls.class_name)" class="font-cinzel text-2xs text-muted-foreground/70 mt-1.5">
          {{ classSkillDataFor(cls.class_name)!.count }} skill pick{{ classSkillDataFor(cls.class_name)!.count !== 1 ? 's' : '' }}
          {{ classSkillDataFor(cls.class_name)!.skills.length ? `from ${classSkillDataFor(cls.class_name)!.skills.length} options` : 'from any skill' }}
        </p>
      </button>
    </div>

    <p v-if="f.class" class="text-label-lg text-primary/70 text-center">
      ✓ {{ f.class }} selected — subclass unlocked through levelling
    </p>

    <!-- Proficiencies (collapsible) -->
    <div class="rounded-lg border border-border bg-card">
      <AppButton
        variant="ghost"
        size="sm"
        block
        class="justify-between px-3 py-2 rounded-none"
        @click="showProfs = !showProfs">
        <span>PROFICIENCIES — SKILLS · SAVES · TOOLS · LANGUAGES</span>
        <span class="text-base transition-transform" :class="showProfs ? '' : '-rotate-90'">▾</span>
      </AppButton>
      <div v-if="showProfs" class="px-3 pb-3 space-y-4">

        <!-- ── Saving throws ─────────────────────────────────────────────── -->
        <div>
          <div class="flex items-baseline justify-between mb-2">
            <p class="text-label-lg font-semibold text-muted-foreground">SAVING THROWS</p>
            <p v-if="f.class" class="text-caption-sm text-muted-foreground/70 italic">fixed by class</p>
          </div>

          <!-- Class selected: read-only coloured chips -->
          <div v-if="f.class" class="flex flex-wrap gap-1.5">
            <span v-for="save in SAVE_STATS" :key="save.key"
              class="px-2 py-0.5 rounded font-cinzel text-2xs border transition-colors"
              :class="f.saving_throw_proficiencies.includes(save.key)
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'bg-muted border-border text-muted-foreground'">
              {{ save.label }}
              <span v-if="f.saving_throw_proficiencies.includes(save.key)" class="ml-0.5 opacity-60">
                {{ saveBonus(save.key) }}
              </span>
            </span>
          </div>

          <!-- No class: manual checkboxes -->
          <div v-else class="grid grid-cols-3 gap-2">
            <AppCheckbox
              v-for="save in SAVE_STATS" :key="save.key"
              :model-value="f.saving_throw_proficiencies.includes(save.key)"
              @update:model-value="toggleSave(save.key)"
            >
              <span>{{ save.label }}</span>
              <span class="ml-2 font-cinzel text-2xs text-muted-foreground">{{ saveBonus(save.key) }}</span>
            </AppCheckbox>
          </div>
        </div>

        <!-- ── Skills ────────────────────────────────────────────────────── -->
        <div>
          <div class="flex items-baseline justify-between mb-2">
            <p class="text-label-lg font-semibold text-muted-foreground">SKILLS</p>
            <!-- Budget indicator -->
            <p v-if="classSkillData" class="font-cinzel text-2xs"
              :class="picksRemaining === 0 ? 'text-primary' : picksRemaining < 0 ? 'text-destructive' : 'text-muted-foreground'">
              {{ classChosenCount }} / {{ classSkillData.count }} class picks used
              <span v-if="picksRemaining > 0"> · {{ picksRemaining }} left</span>
              <span v-else-if="picksRemaining < 0"> · {{ Math.abs(picksRemaining) }} over</span>
            </p>
          </div>

          <!-- Background skill choice ("choose one of …") -->
          <div v-for="(choice, ci) in bgSkillChoices" :key="`bgchoice-${ci}`"
            class="mb-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
            <p class="font-cinzel text-2xs text-amber-700 dark:text-amber-400 mb-1.5">
              BACKGROUND CHOICE — pick {{ choice.count }}
              <span class="text-amber-600/70">({{ bgChosenSkills.length }}/{{ bgChoiceLimit }} chosen)</span>
            </p>
            <div class="flex flex-wrap gap-1.5">
              <AppButton v-for="opt in (choice.options.length ? choice.options : SKILLS.map(s => s.key))"
                :key="opt"
                variant="subtle"
                size="xs"
                tone="caution"
                :active="bgChosenSkills.includes(opt)"
                :disabled="!bgChosenSkills.includes(opt) && bgChosenSkills.length >= bgChoiceLimit"
                :label="skillLabel(opt)"
                @click="toggleBgSkillChoice(opt)"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <div v-for="skill in SKILLS" :key="skill.key"
              class="flex items-center gap-2 rounded px-1 py-0.5 transition-colors"
              :class="f.class && !isInClassList(skill.key) && !isFromBackground(skill.key)
                ? 'opacity-50'
                : ''">
              <!-- Proficiency toggle -->
              <div class="flex gap-1 shrink-0">
                <AppButton v-for="level in PROF_LEVELS" :key="level.value"
                  variant="subtle"
                  size="xs"
                  :tone="isFromBackground(skill.key) ? 'caution' : undefined"
                  :active="(f.skill_proficiencies[skill.key] ?? 'none') === level.value"
                  :disabled="isFromBackground(skill.key)"
                  :tooltip="isFromBackground(skill.key) ? 'Granted by background' : undefined"
                  :label="level.label"
                  @click="setSkillProf(skill.key, level.value)"
                />
              </div>

              <!-- Skill name -->
              <span class="text-caption flex-1"
                :class="f.class && isInClassList(skill.key) ? 'text-foreground font-medium' : 'text-foreground'">
                {{ skill.label }}
              </span>

              <!-- Background badge OR bonus -->
              <span v-if="isFromBackground(skill.key)"
                class="font-cinzel text-2xs px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                BG
              </span>
              <span v-else class="font-cinzel text-2xs text-muted-foreground shrink-0">
                {{ skillBonus(skill.key, skill.ability) }}
              </span>
            </div>
          </div>

          <!-- Legend -->
          <p v-if="f.class" class="font-cinzel text-2xs text-muted-foreground/60 mt-2 leading-relaxed">
            <span v-if="classSkillData?.skills.length">In-class skills are full opacity · dimmed skills are outside your class list · </span>
            <span v-else>Your class may choose from any skill · </span>
            <span class="text-amber-600 dark:text-amber-400">BG</span> = granted by background, not counted against your picks.
          </p>
        </div>

        <!-- ── Tool proficiencies ─────────────────────────────────────────── -->
        <div>
          <p class="text-label-lg font-semibold text-muted-foreground mb-2">TOOL PROFICIENCIES</p>
          <TagPickerInput :model-value="f.tool_proficiencies" :groups="TOOL_PROFICIENCY_GROUPS"
            placeholder="Search tools…" variant="primary"
            @update:model-value="f.tool_proficiencies = $event" />
        </div>

        <!-- ── Languages ─────────────────────────────────────────────────── -->
        <div>
          <p class="text-label-lg font-semibold text-muted-foreground mb-2">LANGUAGES</p>
          <TagPickerInput :model-value="f.languages" :groups="LANGUAGE_GROUPS"
            placeholder="Search languages…"
            @update:model-value="f.languages = $event" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { SAVE_STATS, PROF_LEVELS } from "@/rules/characterCreation";
import { SKILLS } from "@/types/party.types";
import { TOOL_PROFICIENCY_GROUPS, LANGUAGE_GROUPS } from "@/lib/proficiency-lists";
import { CLASS_SKILL_CHOICES, FALLBACK_SKILL_DATA } from "@/data/classSkillChoices";
import type { SkillKey } from "@/data/classSkillChoices";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import TagPickerInput from "@/components/common/TagPickerInput.vue";
import type { CharacterCreationForm } from "@/composables/useCharacterCreationForm";

const { form } = defineProps<{ form: CharacterCreationForm }>();

const {
  f, mergedClasses, selectedClassKey, onClassSelect, setSkillProf, skillBonus, toggleSave, saveBonus,
  bgSkillChoices, bgChosenSkills, bgChoiceLimit, bgFreeSkills, toggleBgSkillChoice,
} = form;

const showProfs = ref(false);

// ── Skill budget ────────────────────────────────────────────────────────────

/** Skill keys the background grants for free (fixed + chosen) — these don't
 *  count against the class budget. Parsed from the background's prose so a
 *  "choose one of A/B/C" clause exposes only the picked skill, not all of them. */
const bgSkillKeys = computed((): Set<SkillKey> => new Set(bgFreeSkills.value));

/** Skill label for a key, for the choice picker. */
function skillLabel(key: SkillKey): string {
  return SKILLS.find((s) => s.key === key)?.label ?? key;
}

/** Skill choices for the currently selected class, or null when no class chosen. */
const classSkillData = computed(() => {
  if (!f.class) return null;
  return CLASS_SKILL_CHOICES[f.class] ?? FALLBACK_SKILL_DATA;
});

/** Returns the ClassSkillData for any class name — used on picker cards. */
function classSkillDataFor(className: string) {
  return CLASS_SKILL_CHOICES[className] ?? FALLBACK_SKILL_DATA;
}

/** True when the skill key is in the class's allowed list (or class allows any). */
function isInClassList(key: string): boolean {
  const data = classSkillData.value;
  if (!data) return true;
  if (data.skills.length === 0) return true; // any skill
  return data.skills.includes(key as SkillKey);
}

/** True when the skill was granted by the selected background. */
function isFromBackground(key: string): boolean {
  return bgSkillKeys.value.has(key as SkillKey);
}

/** Number of proficient/expertise skills chosen from class (excluding background grants). */
const classChosenCount = computed(() =>
  SKILLS.filter(
    (s) => !isFromBackground(s.key) && (f.skill_proficiencies[s.key] ?? "none") !== "none",
  ).length,
);

/** Remaining class skill picks (negative = over budget).
 *  Returns 0 when no class is selected; the surrounding v-if="classSkillData"
 *  guard ensures this branch is never rendered, so 0 is a safe non-null default
 *  that keeps the return type as `number` and satisfies vue-tsc. */
const picksRemaining = computed((): number => {
  const data = classSkillData.value;
  return data ? data.count - classChosenCount.value : 0;
});
</script>
