<template>
  <div v-if="activeTrackers.length" class="space-y-2">
    <p class="font-cinzel text-2xs font-semibold tracking-widest text-muted-foreground uppercase">Tracks</p>
    <div class="flex flex-col gap-2">
      <div v-for="t in activeTrackers" :key="t.key">
        <RuleTrackerPanel
          :tracker="t.def"
          :value="t.value"
          :ability-scores="abilityScores"
        />
        <!-- Player-visible buttons for this tracker -->
        <div v-if="visibleButtons(t).length" class="flex flex-wrap gap-1 mt-1">
          <button
            v-for="btn in visibleButtons(t)"
            :key="btn.label"
            type="button"
            :disabled="applying"
            class="inline-flex items-center px-2 py-0.5 rounded border border-border bg-card font-cinzel text-2xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
            @click="applyButton(t, btn)"
          >
            {{ btn.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import RuleTrackerPanel from "@/components/rules/RuleTrackerPanel.vue";
import { useTrackerStates, useApplyTrackerDelta } from "@/composables/useTrackerState";
import { useOptionalRules, isRuleEffectivelyEnabled } from "@/composables/useOptionalRules";
import { useParty } from "@/composables/useParty";
import { listOptionalRules } from "@/rules/optionalRules";
import type { TrackerDef, TrackerState, DmButton } from "@/types/rule.types";

const props = defineProps<{
  memberId: string;
  /** Custom rules with a tracker — already filtered by visibility at the call site. */
  customTrackers: { ruleId: string; def: TrackerDef }[];
}>();

const { data: campaignRules } = useOptionalRules();
const { data: trackerStates } = useTrackerStates();
const { data: party } = useParty();
const applyDelta = useApplyTrackerDelta();
const applying = ref(false);

const abilityScores = computed(() => {
  const m = party.value?.find((p) => p.id === props.memberId);
  if (!m) return undefined;
  return { str: m.str, dex: m.dex, con: m.con, int: m.int, wis: m.wis, cha: m.cha };
});

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

interface TrackerEntry {
  key: string;
  def: TrackerDef;
  value: number;
  ruleKey?: string;
  ruleId?: string;
}

const activeTrackers = computed<TrackerEntry[]>(() => {
  const rows = trackerStates.value ?? [];
  const items: TrackerEntry[] = [];

  for (const t of enabledBuiltInTrackers.value) {
    items.push({ key: `builtin:${t.ruleKey}`, def: t.def, value: stateValue(rows, t.ruleKey, null), ruleKey: t.ruleKey });
  }
  for (const t of props.customTrackers) {
    items.push({ key: `custom:${t.ruleId}`, def: t.def, value: stateValue(rows, null, t.ruleId), ruleId: t.ruleId });
  }
  return items;
});

function visibleButtons(t: TrackerEntry): DmButton[] {
  return (t.def.dmButtons ?? []).filter((b) => b.playerVisible);
}

async function applyButton(t: TrackerEntry, btn: DmButton) {
  applying.value = true;
  try {
    await applyDelta({
      partyMemberId: props.memberId,
      ruleKey:       t.ruleKey,
      ruleId:        t.ruleId,
      delta:         btn.delta,
      setValue:      btn.mode === "set" ? btn.setValue : undefined,
      min:           t.def.min,
      max:           t.def.max,
    });
  } finally {
    applying.value = false;
  }
}
</script>
