<template>
  <WizardStepCard title="Leveling in">
    <AppSelect v-model="modelValueProxy" tone="muted" size="body" weight="normal" block>
      <option v-for="entry in existingClassOptions" :key="entry.id" :value="entry.id">
        {{ entry.class_name }}{{ entry.subclass_name ? ` (${entry.subclass_name})` : '' }}
        — Level {{ entry.levels }} → {{ entry.levels + 1 }}
      </option>
      <option value="__new__">Take a level in a new class…</option>
    </AppSelect>

    <template v-if="isAddingNewClass">
      <div class="space-y-2">
        <label class="text-label text-muted-foreground">New Class</label>
        <AppSelect v-model="newClassNameProxy" tone="muted" size="body" weight="normal" block>
          <option value="" disabled>Select…</option>
          <option v-for="candidate in newClassCandidates" :key="candidate.key" :value="candidate.key">
            {{ candidate.label }}
          </option>
        </AppSelect>
      </div>

      <!-- Prereq warning -->
      <div
        v-if="newClassName && !prereq.ok"
        class="rounded-md px-3 py-2 flex items-start gap-2"
        :class="ignorePrereqs
          ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
          : 'bg-destructive/10 border border-destructive/30 text-destructive'"
      >
        <span class="text-label shrink-0">{{ ignorePrereqs ? 'PREREQ IGNORED' : 'PREREQ' }}</span>
        <span class="text-caption">
          {{ prereq.reason }}.
          <template v-if="ignorePrereqs">
            Multiclass prereqs are disabled for this campaign.
          </template>
          <template v-else>
            The DM can enable "Ignore multiclass prereqs" in Campaign Settings.
          </template>
        </span>
      </div>

      <CalloutChip v-if="newClassName && proficiencyGrants.length > 0" label="Multiclass Proficiencies">
        You gain: {{ proficiencyGrants.join(', ') }}
      </CalloutChip>
    </template>
  </WizardStepCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import WizardStepCard from "@/components/common/WizardStepCard.vue";
import CalloutChip from "@/components/common/CalloutChip.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import type { CharacterClass } from "@/types/multiclass.types";

const {
  modelValue,
  newClassName,
  existingClassOptions,
  newClassCandidates,
  prereq,
  ignorePrereqs,
  proficiencyGrants,
  isAddingNewClass,
} = defineProps<{
  modelValue: string;
  newClassName: string;
  existingClassOptions: CharacterClass[];
  newClassCandidates: { key: string; label: string }[];
  prereq: { ok: true } | { ok: false; reason: string };
  ignorePrereqs: boolean;
  proficiencyGrants: string[];
  isAddingNewClass: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:newClassName": [value: string];
}>();

// AppSelect needs a two-way v-model; this component's selections are
// controlled entirely by the parent via props + emit, so a writable computed
// bridges the two without introducing local state.
const modelValueProxy = computed<string>({
  get: () => modelValue,
  set: (value) => emit("update:modelValue", value),
});

const newClassNameProxy = computed<string>({
  get: () => newClassName,
  set: (value) => emit("update:newClassName", value),
});
</script>
