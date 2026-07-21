<template>
  <div v-if="activeRulesWithButtons.length" class="flex flex-col gap-2">
    <div
      v-for="entry in activeRulesWithButtons"
      :key="entry.ruleId ?? entry.ruleKey"
      class="flex flex-col gap-1"
    >
      <!-- Rule name + tracker value -->
      <div class="flex items-center justify-between">
        <span class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
          {{ entry.label }}
        </span>
        <span class="font-cinzel text-2xs text-muted-foreground">
          {{ entry.value }} / {{ entry.max }}
        </span>
      </div>
      <!-- DM buttons -->
      <div class="flex flex-wrap gap-1">
        <button
          v-for="btn in entry.dmButtons"
          :key="btn.label"
          type="button"
          :disabled="applying"
          class="inline-flex items-center px-2 py-0.5 rounded border border-border bg-card font-cinzel text-2xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
          @click="apply(entry, btn)"
        >
          {{ btn.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useTrackerStates, useApplyTrackerDelta } from "@/composables/useTrackerState";
import { useRules } from "@/composables/useRules";
import type { DmButton } from "@/types/rule.types";

const props = defineProps<{
  partyMemberId: string;
  campaignId: string;
}>();

const { data: trackerStates } = useTrackerStates();
const { data: customRules }   = useRules();
const applyDelta = useApplyTrackerDelta();
const applying   = ref(false);

interface ButtonEntry {
  ruleId?: string;
  ruleKey?: string;
  label: string;
  dmButtons: DmButton[];
  value: number;
  min: number;
  max: number;
}

const activeRulesWithButtons = computed<ButtonEntry[]>(() => {
  const states  = trackerStates.value ?? [];
  const rules   = customRules.value ?? [];
  const entries: ButtonEntry[] = [];

  for (const rule of rules) {
    if (!rule.tracker?.dmButtons?.length) continue;
    const state = states.find(
      (s) => s.party_member_id === props.partyMemberId && s.rule_id === rule.id,
    );
    entries.push({
      ruleId:    rule.id,
      label:     rule.tracker.label,
      dmButtons: rule.tracker.dmButtons,
      value:     state?.value ?? rule.tracker.min,
      min:       rule.tracker.min,
      max:       rule.tracker.max,
    });
  }

  return entries;
});

async function apply(entry: ButtonEntry, btn: DmButton) {
  applying.value = true;
  try {
    await applyDelta({
      partyMemberId: props.partyMemberId,
      ruleKey:       entry.ruleKey,
      ruleId:        entry.ruleId,
      delta:         btn.delta,
      setValue:      btn.mode === "set" ? btn.setValue : undefined,
      min:           entry.min,
      max:           entry.max,
    });
  } finally {
    applying.value = false;
  }
}
</script>
