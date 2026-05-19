<template>
  <div v-if="steps.length > 0" class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-2.5 border-b border-border">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Spell Choices</p>
    </div>
    <div class="divide-y divide-border">
      <div v-for="step in steps" :key="step.key" class="px-4 py-3 space-y-2">
        <div class="flex items-baseline gap-3">
          <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider w-10 shrink-0">Lvl {{ step.level }}</span>
          <span class="font-fell text-sm font-semibold text-foreground">{{ step.label }}</span>
        </div>
        <p v-if="step.description" class="font-fell text-xs text-muted-foreground pl-13">{{ step.description }}</p>
        <!-- Already picked -->
        <div v-if="choicesForStep(step.key).length" class="pl-13 flex flex-wrap gap-1.5">
          <span
            v-for="(name, i) in choicesForStep(step.key)"
            :key="i"
            class="inline-flex items-center rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 font-fell text-sm text-foreground"
          >{{ name }}</span>
        </div>
        <!-- Not yet picked -->
        <div v-else class="pl-13 flex items-center gap-2">
          <select
            v-model="pendingPicks[step.key]"
            class="flex-1 bg-muted/40 border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="" disabled>Choose a spell…</option>
            <option v-for="opt in step.options" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <button
            :disabled="!pendingPicks[step.key]"
            class="px-2.5 py-1 bg-primary text-primary-foreground rounded font-cinzel text-2xs md:text-sm tracking-wider disabled:opacity-40 transition-opacity hover:opacity-90"
            @click="confirmPick(step.key)"
          >Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
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

function confirmPick(stepKey: string) {
  const picked = pendingPicks.value[stepKey];
  if (!picked) return;
  const newChoices = { ...props.member.class_choices, [stepKey]: picked };
  updateMember({ id: props.member.id, update: { class_choices: newChoices } });
}
</script>
