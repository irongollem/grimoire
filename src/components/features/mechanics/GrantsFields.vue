<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-2">
      <p class="text-caption text-muted-foreground">Skills the character becomes proficient in.</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <AppCheckbox
          v-for="s in SKILLS"
          :key="s.key"
          :model-value="grants.skills?.includes(s.key) === true"
          :label="s.label"
          label-role="caption"
          @update:model-value="toggleSkill(s.key, $event)"
        />
      </div>
    </div>
    <MechField label="Tools">
      <TagPickerInput :model-value="shown(grants.tools)" :groups="TOOL_PROFICIENCY_GROUPS" placeholder="Search tools…" @update:model-value="emit('update:grants', { ...grants, tools: $event })" />
    </MechField>
    <MechField label="Languages">
      <TagPickerInput :model-value="shown(grants.languages)" :groups="LANGUAGE_GROUPS" placeholder="Search languages…" @update:model-value="emit('update:grants', { ...grants, languages: $event })" />
    </MechField>
  </div>
</template>

<script setup lang="ts">
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import TagPickerInput from "@/components/common/controls/TagPickerInput.vue";
import type { SkillKey } from "@/types/party.types";
import { LANGUAGE_GROUPS, TOOL_PROFICIENCY_GROUPS } from "@/lib/proficiency-lists";
import type { FeatureGrants } from "@/rules/features/mechanics.types";
import { SKILLS } from "@/types/party.types";
import MechField from "./MechField.vue";

/** Proficiencies a feature gives outright (#994). Emptied lists are tidied away by `tidyMechanics`. */
const { grants } = defineProps<{ grants: FeatureGrants }>();
const emit = defineEmits<{ "update:grants": [value: FeatureGrants] }>();

// A part not yet set reads as nothing ticked; this is display, not a stored default.
function shown(list: string[] | undefined): string[] {
  return list ? list : [];
}

function toggleSkill(skill: SkillKey, on: boolean) {
  const rest = grants.skills ? grants.skills.filter((s) => s !== skill) : [];
  emit("update:grants", { ...grants, skills: on ? [...rest, skill] : rest });
}
</script>
