<template>
  <div v-if="activeTrackers.length" class="space-y-2">
    <p class="font-cinzel text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Tracks</p>
    <div class="flex flex-col gap-2">
      <RuleTrackerPanel
        v-for="t in activeTrackers"
        :key="t.key"
        :tracker="t.def"
        :value="t.value"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import RuleTrackerPanel from "@/components/rules/RuleTrackerPanel.vue";
import { useTrackerStates } from "@/composables/useTrackerState";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";
import { listOptionalRules } from "@/rules/optionalRules";
import type { TrackerDef, TrackerState } from "@/types/rule.types";

const props = defineProps<{
  memberId: string;
  /** Custom rules with a tracker — already filtered by visibility at the call site. */
  customTrackers: { ruleId: string; def: TrackerDef }[];
}>();

const { data: campaignRules } = useOptionalRules();
const { data: trackerStates } = useTrackerStates();

// Built-in optional rules that are enabled for this campaign and carry a tracker.
const enabledBuiltInTrackers = computed(() =>
  listOptionalRules()
    .filter((def) => def.tracker && isRuleEffectivelyEnabled(campaignRules.value, def.key))
    .map((def) => ({ ruleKey: def.key, def: def.tracker! as TrackerDef })),
);

function stateValue(rows: TrackerState[], ruleKey: string | null, ruleId: string | null): number {
  const row = ruleKey
    ? rows.find((r) => r.party_member_id === props.memberId && r.rule_key === ruleKey)
    : rows.find((r) => r.party_member_id === props.memberId && r.rule_id === ruleId);
  return row?.value ?? 0;
}

const activeTrackers = computed(() => {
  const rows = trackerStates.value ?? [];
  const items: { key: string; def: TrackerDef; value: number }[] = [];

  for (const t of enabledBuiltInTrackers.value) {
    items.push({ key: `builtin:${t.ruleKey}`, def: t.def, value: stateValue(rows, t.ruleKey, null) });
  }
  for (const t of props.customTrackers) {
    items.push({ key: `custom:${t.ruleId}`, def: t.def, value: stateValue(rows, null, t.ruleId) });
  }
  return items;
});
</script>
