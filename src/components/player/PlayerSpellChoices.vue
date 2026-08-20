<template>
  <div v-if="steps.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border">
      <p class="text-label-lg font-semibold text-muted-foreground">Spell Choices</p>
    </div>
    <div class="divide-y divide-border">
      <div v-for="step in steps" :key="step.key" class="px-4 py-3 space-y-2">
        <div class="flex items-baseline gap-3">
          <span class="text-label md:text-sm text-muted-foreground w-10 shrink-0">Lvl {{ step.level }}</span>
          <span class="text-body font-semibold text-foreground">{{ step.label }}</span>
        </div>
        <p v-if="step.description" class="text-caption text-muted-foreground pl-13">{{ step.description }}</p>
        <!-- Already picked -->
        <div v-if="choicesForStep(step.key).length" class="pl-13 flex flex-wrap gap-1.5">
          <span
            v-for="(name, i) in choicesForStep(step.key)"
            :key="i"
            class="inline-flex items-center rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-body text-foreground"
          >{{ name }}</span>
        </div>
        <!-- Still picking — keep the picker open until `count` choices are made -->
        <div v-if="choicesForStep(step.key).length < (step.count ?? 1)" class="pl-13 flex items-center gap-2">
          <AppSelect
            v-model="pendingPicks[step.key]"
            tone="muted"
            size="body"
            weight="normal"
            class="min-w-0 flex-1"
          >
            <option value="" disabled>Choose a spell…</option>
            <option v-for="opt in remainingOptions(step)" :key="opt" :value="opt">{{ opt }}</option>
          </AppSelect>
          <button
            :disabled="!pendingPicks[step.key]"
            class="px-2.5 py-1 bg-primary text-primary-foreground rounded text-label md:text-sm disabled:opacity-40 transition-opacity hover:opacity-90"
            @click="confirmPick(step.key, step.count ?? 1)"
          >Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useUpdatePartyMember } from "@/composables/useParty";
import type { CustomStep } from "@/levelup/customTypes";
import type { PartyMember } from "@/types/party.types";

const props = defineProps<{
  member: PartyMember;
  steps: CustomStep[];
}>();

const { mutate: updateMember } = useUpdatePartyMember();
const pendingPicks = ref<Record<string, string>>({});

function choicesForStep(stepKey: string): string[] {
  const v = (props.member.class_choices ?? {})[stepKey];
  if (!v) return [];
  return Array.isArray(v) ? (v as string[]) : [String(v)];
}

/** Options not already chosen for this step, so a duplicate can't be picked. */
function remainingOptions(step: CustomStep): string[] {
  const chosen = new Set(choicesForStep(step.key));
  return step.options.filter((o) => !chosen.has(o));
}

function confirmPick(stepKey: string, count: number) {
  const picked = pendingPicks.value[stepKey];
  if (!picked) return;
  const current = choicesForStep(stepKey);
  if (current.includes(picked) || current.length >= count) return;
  // Accumulate up to `count` picks. Store a single string for a 1-pick step
  // (unchanged shape) and an array once more than one is required.
  const next = [...current, picked];
  const value = count > 1 ? next : next[0];
  updateMember({ id: props.member.id, update: { class_choices: { ...props.member.class_choices, [stepKey]: value } } });
  pendingPicks.value[stepKey] = "";
}
</script>
