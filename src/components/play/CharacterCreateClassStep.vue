<template>
  <div class="space-y-4">
    <p class="font-fell text-sm text-muted-foreground italic">
      Choose your class. Saving throw proficiencies are set automatically. Fine-tune skills in the collapsible below.
    </p>

    <!-- Class picker -->
    <div v-if="!mergedClasses.length" class="rounded-lg border border-border bg-card p-6 text-center">
      <p class="font-fell text-sm text-muted-foreground italic">No classes available — skip for now.</p>
    </div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <button v-for="cls in mergedClasses" :key="cls.class_name" type="button"
        class="rounded-lg border overflow-hidden text-left transition-all p-3"
        :class="f.class === cls.class_name
          ? 'border-primary ring-1 ring-primary bg-primary/5'
          : 'border-border bg-card hover:border-primary/40'"
        @click="onClassSelect(cls.class_name)">
        <div class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-bold text-foreground">{{ cls.class_name }}</p>
            <p v-if="cls.primary_ability" class="font-fell text-xs text-muted-foreground mt-0.5">{{ cls.primary_ability }}</p>
          </div>
          <span class="shrink-0 px-2 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground">
            d{{ cls.hit_die }}
          </span>
        </div>
        <div v-if="cls.saving_throws?.length" class="mt-1.5 flex flex-wrap gap-1">
          <span v-for="st in cls.saving_throws" :key="st"
            class="px-1.5 py-0.5 rounded bg-muted/60 font-cinzel text-[9px] text-muted-foreground uppercase">{{ st }}</span>
        </div>
      </button>
    </div>

    <p v-if="f.class" class="font-cinzel text-xs text-primary/70 tracking-wider text-center">
      ✓ {{ f.class }} selected — subclass unlocked through levelling
    </p>

    <!-- Proficiencies (collapsible) -->
    <div class="rounded-lg border border-border bg-card">
      <button type="button"
        class="w-full flex items-center justify-between px-3 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        @click="showProfs = !showProfs">
        <span>PROFICIENCIES — SKILLS · SAVES · TOOLS · LANGUAGES</span>
        <span class="text-base transition-transform" :class="showProfs ? '' : '-rotate-90'">▾</span>
      </button>
      <div v-if="showProfs" class="px-3 pb-3 space-y-4">

        <div>
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">SAVING THROWS</p>
          <div class="grid grid-cols-3 gap-2">
            <label v-for="save in SAVE_STATS" :key="save.key" class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" :checked="f.saving_throw_proficiencies.includes(save.key)"
                class="rounded" @change="toggleSave(save.key)" />
              <span class="font-cinzel text-xs text-foreground">{{ save.label }}</span>
              <span class="font-cinzel text-[10px] text-muted-foreground">{{ saveBonus(save.key) }}</span>
            </label>
          </div>
        </div>

        <div>
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">SKILLS</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <div v-for="skill in SKILLS" :key="skill.key" class="flex items-center gap-2">
              <div class="flex rounded overflow-hidden border border-border text-[10px] font-cinzel font-semibold shrink-0">
                <button v-for="level in PROF_LEVELS" :key="level.value" type="button"
                  class="px-1.5 py-0.5 transition-colors"
                  :class="(f.skill_proficiencies[skill.key] ?? 'none') === level.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground'"
                  @click="setSkillProf(skill.key, level.value)">{{ level.label }}</button>
              </div>
              <span class="font-fell text-xs text-foreground flex-1">{{ skill.label }}</span>
              <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">
                {{ skillBonus(skill.key, skill.ability) }}
              </span>
            </div>
          </div>
        </div>

        <div>
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">TOOL PROFICIENCIES</p>
          <TagPickerInput :model-value="f.tool_proficiencies" :groups="TOOL_PROFICIENCY_GROUPS"
            placeholder="Search tools…" variant="primary"
            @update:model-value="f.tool_proficiencies = $event" />
        </div>

        <div>
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">LANGUAGES</p>
          <TagPickerInput :model-value="f.languages" :groups="LANGUAGE_GROUPS"
            placeholder="Search languages…"
            @update:model-value="f.languages = $event" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { SAVE_STATS, PROF_LEVELS } from "@/composables/useCharacterCreationForm";
import { SKILLS } from "@/types/party.types";
import { TOOL_PROFICIENCY_GROUPS, LANGUAGE_GROUPS } from "@/lib/proficiency-lists";
import TagPickerInput from "@/components/common/TagPickerInput.vue";
import type { CharacterCreationForm } from "@/composables/useCharacterCreationForm";

const { form } = defineProps<{ form: CharacterCreationForm }>();

const { f, mergedClasses, onClassSelect, setSkillProf, skillBonus, toggleSave, saveBonus } = form;

const showProfs = ref(false);
</script>
