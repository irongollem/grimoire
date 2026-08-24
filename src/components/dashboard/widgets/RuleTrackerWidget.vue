<template>
  <DashboardWidget
    :title="title"
    to="/rules?tab=custom"
    action-label="Rules →"
    :loading="loading"
    :empty="empty"
  >
    <template #empty>
      <p v-if="resolution?.state === 'missing'" class="text-body text-muted-foreground italic">
        That rule tracker is no longer in this campaign. Pick another one from this card's settings.
      </p>
      <p v-else class="text-body text-muted-foreground italic">
        No custom rules with a tracker yet — add one under Rules → Custom Rules and it appears here.
      </p>
    </template>

    <div v-if="resolution?.state === 'ready'" class="flex flex-col gap-3 p-3">
      <p v-if="memberEntries.length === 0" class="text-body text-muted-foreground italic">
        No party members to track yet.
      </p>

      <div
        v-for="entry in memberEntries"
        :key="entry.memberId"
        class="flex flex-col gap-1.5 rounded-md border border-border/60 p-2"
      >
        <p class="font-cinzel text-2xs font-semibold text-foreground">{{ entry.name }}</p>
        <RuleTrackerPanel
          :tracker="resolution.rule.tracker"
          :value="entry.value"
          :ability-scores="entry.abilityScores"
        />
        <div v-if="resolution.rule.tracker.dmButtons?.length" class="flex flex-wrap gap-1">
          <AppButton
            v-for="btn in resolution.rule.tracker.dmButtons"
            :key="btn.label"
            variant="subtle"
            surface="card"
            size="xs"
            :label="btn.label"
            :disabled="applying"
            @click="apply(entry.memberId, btn)"
          />
        </div>
      </div>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * One pinned custom rule's stateful tracker (Sanity, Exposure, Corruption…),
 * live on the dashboard with its DM buttons (#764).
 *
 * `RuleTrackerPanel` already draws a tracker bar and `useApplyTrackerDelta`
 * already owns the clamp-and-upsert mutation (`src/composables/useTrackerState.ts`)
 * — both are reused as-is here, not reimplemented. `DmTrackerButtons` could
 * not be dropped in whole: it is scoped to a *party member* and renders every
 * tracker-bearing rule that member has, with no way to filter to the one rule
 * this card is pinned to. A card configured for "Sanity" that rendered
 * `DmTrackerButtons` verbatim would also show "Corruption" and "Hunger"
 * buttons for the same member — data this card was never asked to surface.
 * So this component is the thinnest per-rule shell around the same reusable
 * parts: it loops the party itself and, for each member, renders one
 * `RuleTrackerPanel` plus buttons built straight from `resolution.rule.tracker
 * .dmButtons`, applied through the same composable `DmTrackerButtons` calls.
 *
 * Configurable and multi-instance for the same reason as the roll-table card:
 * a DM tracking Sanity is often also tracking Corruption, and two cards is the
 * honest shape of that. See `src/lib/dashboard/ruleTrackerCard.ts` for why
 * resolution has three states rather than two.
 */
import { computed, ref } from "vue";
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import AppButton from "@/components/common/AppButton.vue";
import RuleTrackerPanel from "@/components/rules/RuleTrackerPanel.vue";
import { useRules } from "@/composables/useRules";
import { useParty } from "@/composables/useParty";
import { useTrackerStates, useApplyTrackerDelta } from "@/composables/useTrackerState";
import { resolveRuleTracker, type RuleTrackerResolution } from "@/lib/dashboard/ruleTrackerCard";
import type { DmButton } from "@/types/rule.types";

const { settings } = defineProps<{
  settings?: Record<string, unknown>;
}>();

const { data: rules } = useRules();
const { data: party } = useParty();
const { data: trackerStates } = useTrackerStates();
const applyDelta = useApplyTrackerDelta();
const applying = ref(false);

/**
 * `null` while the rules query has not answered yet — which is a different
 * thing from a campaign that has no tracker-bearing rules, and the card says
 * something different for each. Collapsing the two (the tempting
 * `rules.value ?? []`) would flash "No custom rules with a tracker yet" at
 * every DM on every page load.
 */
const resolution = computed<RuleTrackerResolution | null>(() => {
  const loaded = rules.value;
  if (loaded === undefined) return null;
  return resolveRuleTracker(settings, loaded);
});

// Once a rule is resolved, the card still needs the party roster and every
// member's current value before it has anything honest to draw — rendering
// early with `party.value ?? []` would flash "No party members to track yet"
// at a table that has one, and rendering with `trackerStates.value ?? []`
// would flash everyone at the tracker's floor before their real value loads.
const loading = computed(() => {
  if (resolution.value === null) return true;
  if (resolution.value.state !== "ready") return false;
  return party.value === undefined || trackerStates.value === undefined;
});

const empty = computed(
  () => resolution.value !== null && resolution.value.state !== "ready",
);

const title = computed(() =>
  resolution.value?.state === "ready" ? resolution.value.rule.title : "Rule tracker",
);

interface MemberEntry {
  memberId: string;
  name: string;
  value: number;
  abilityScores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
}

const memberEntries = computed<MemberEntry[]>(() => {
  const current = resolution.value;
  if (current === null || current.state !== "ready") return [];
  const tracker = current.rule.tracker;
  const states = trackerStates.value ?? [];

  return (party.value ?? []).map((member) => {
    const row = states.find(
      (s) => s.party_member_id === member.id && s.rule_id === current.rule.id,
    );
    return {
      memberId: member.id,
      name: member.name,
      // Mirrors DmTrackerButtons: no state row yet means the member has never
      // touched this tracker, which reads as the tracker's floor, not zero.
      value: row?.value ?? tracker.min,
      abilityScores: {
        str: member.str,
        dex: member.dex,
        con: member.con,
        int: member.int,
        wis: member.wis,
        cha: member.cha,
      },
    };
  });
});

async function apply(memberId: string, btn: DmButton) {
  const current = resolution.value;
  if (current === null || current.state !== "ready") return;
  const tracker = current.rule.tracker;
  applying.value = true;
  try {
    await applyDelta({
      partyMemberId: memberId,
      ruleId: current.rule.id,
      delta: btn.delta,
      setValue: btn.mode === "set" ? btn.setValue : undefined,
      min: tracker.min,
      max: tracker.max,
    });
  } finally {
    applying.value = false;
  }
}
</script>
