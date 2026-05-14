<template>
  <WizardStepCard title="Leveling in">
    <select
      :value="modelValue"
      class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="entry in existingClassOptions" :key="entry.id" :value="entry.id">
        {{ entry.class_name }}{{ entry.subclass_name ? ` (${entry.subclass_name})` : '' }}
        — Level {{ entry.levels }} → {{ entry.levels + 1 }}
      </option>
      <option value="__new__">Take a level in a new class…</option>
    </select>

    <template v-if="isAddingNewClass">
      <div class="space-y-2">
        <label class="font-cinzel text-[10px] text-muted-foreground tracking-wider">New Class</label>
        <select
          :value="newClassName"
          class="w-full rounded border border-border bg-muted/40 px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="emit('update:newClassName', ($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled>Select…</option>
          <option v-for="name in newClassCandidates" :key="name" :value="name">{{ name }}</option>
        </select>
      </div>

      <!-- Prereq warning -->
      <div
        v-if="newClassName && !prereq.ok"
        class="rounded-md px-3 py-2 flex items-start gap-2"
        :class="ignorePrereqs
          ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
          : 'bg-destructive/10 border border-destructive/30 text-destructive'"
      >
        <span class="font-cinzel text-[10px] tracking-wider shrink-0">{{ ignorePrereqs ? 'PREREQ IGNORED' : 'PREREQ' }}</span>
        <span class="font-fell text-xs">
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
import WizardStepCard from "@/components/common/WizardStepCard.vue";
import CalloutChip from "@/components/common/CalloutChip.vue";
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
  newClassCandidates: string[];
  prereq: { ok: true } | { ok: false; reason: string };
  ignorePrereqs: boolean;
  proficiencyGrants: string[];
  isAddingNewClass: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:newClassName": [value: string];
}>();
</script>
