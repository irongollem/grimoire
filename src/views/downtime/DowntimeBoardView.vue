<script setup lang="ts">
import { computed } from "vue";
import PageHeader from "@/components/common/PageHeader.vue";
import DowntimeResolvePanel from "@/components/downtime/DowntimeResolvePanel.vue";
import DeckBacksPanel from "@/components/downtime/DeckBacksPanel.vue";
import DowntimeOutcomeVignette from "@/components/downtime/DowntimeOutcomeVignette.vue";
import GrantDowntimeButton from "@/components/downtime/GrantDowntimeButton.vue";
import RuleDisabledNotice from "@/components/common/RuleDisabledNotice.vue";
import { useIsRuleEnabled } from "@/composables/useOptionalRules";
import { useParty } from "@/composables/useParty";
import { useNpcs } from "@/composables/useNpcs";
import { useDowntimeDraws, useDowntimeOutcomes, useDeckBacks } from "@/composables/useDowntime";
import { useUiStore } from "@/stores/ui";
import { DOWNTIME_DRAW_STATUSES, DOWNTIME_DRAW_STATUS_LABELS } from "@/types/downtime.types";
import type { DowntimeDraw } from "@/types/downtime.types";

const ui = useUiStore();
// Hidden from the sidebar when off, but a bookmarked URL still lands here.
const isEnabled = useIsRuleEnabled("downtime");
const { data: party } = useParty();
const { data: npcs } = useNpcs();
const { data: draws } = useDowntimeDraws();
const { data: outcomes } = useDowntimeOutcomes();
const { data: backs } = useDeckBacks();

const filterStatus = computed({
  get: () => ui.downtimeFilterStatus,
  set: (v) => (ui.downtimeFilterStatus = v),
});
const filterCharacter = computed({
  get: () => ui.downtimeFilterCharacter,
  set: (v) => (ui.downtimeFilterCharacter = v),
});

/** A character deleted out from under a draw must read as absent. */
function memberName(id: string): string {
  return party.value?.find((m) => m.id === id)?.name ?? "??? (removed)";
}

const visibleDraws = computed<DowntimeDraw[]>(() =>
  (draws.value ?? []).filter(
    (d) =>
      (filterStatus.value === "all" || d.status === filterStatus.value) &&
      (filterCharacter.value === "" || d.party_member_id === filterCharacter.value),
  ),
);

const pendingDraws = computed(() => visibleDraws.value.filter((d) => d.status === "pending"));

/** Resolved draws, newest first, paired with their outcome. */
const resolvedFeed = computed(() =>
  (outcomes.value ?? [])
    .map((outcome) => {
      const draw = (draws.value ?? []).find((d) => d.id === outcome.draw_id);
      return draw ? { outcome, draw } : null;
    })
    .filter((x): x is { outcome: NonNullable<typeof x>["outcome"]; draw: DowntimeDraw } => x !== null)
    .filter(
      ({ draw }) => filterCharacter.value === "" || draw.party_member_id === filterCharacter.value,
    ),
);

function rewardName(rewardType: string | null, rewardId: string | null): string | null {
  if (rewardType !== "npc" || !rewardId) return null;
  return npcs.value?.find((n) => n.id === rewardId)?.name ?? null;
}

function rewardHref(rewardType: string | null, rewardId: string | null): string | null {
  if (rewardType !== "npc" || !rewardId) return null;
  return `/npcs/${rewardId}`;
}
</script>

<template>
  <RuleDisabledNotice
    v-if="!isEnabled"
    module-name="The Interlude"
    hint="Enable it in Campaign Settings → Rules to grant downtime draws."
  />

  <div v-else class="mx-auto max-w-5xl px-4 py-6">
    <PageHeader
      title="The Interlude"
      description="What the party did between the dungeon and the next session."
    />

    <!-- Grant credits -->
    <section class="mt-6 rounded-lg border border-border bg-card p-4">
      <h2 class="font-cinzel text-base font-semibold">Grant downtime</h2>
      <p class="mt-1 text-2xs text-muted-foreground">
        A draw is a gift you give when the story says there is a lull. One credit, one turn of
        the deck.
      </p>
      <ul v-if="party && party.length > 0" class="mt-3 space-y-1">
        <li
          v-for="member in party"
          :key="member.id"
          class="flex items-center justify-between rounded border border-border px-2 py-1"
        >
          <span class="text-sm">{{ member.name }}</span>
          <GrantDowntimeButton :party-member-id="member.id" :party-member-name="member.name" />
        </li>
      </ul>
      <p v-else class="mt-3 text-2xs text-muted-foreground">No characters in this campaign yet.</p>
    </section>

    <!-- Pending draws: the batch resolution board.
         The filters live INSIDE this section, on the heading row — they filter
         this list and nothing else, so floating them above the heading (and
         outside any card) left them reading as page furniture. -->
    <section class="mt-6 rounded-lg border border-border bg-card p-4">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <h2 class="font-cinzel text-base font-semibold">
          Awaiting you
          <span class="text-2xs font-normal text-muted-foreground">
            ({{ pendingDraws.length }})
          </span>
        </h2>

        <div class="flex flex-wrap items-end gap-2">
          <div>
            <label for="downtime-filter-status" class="mb-1 block text-2xs font-medium">
              Status
            </label>
            <select
              id="downtime-filter-status"
              v-model="filterStatus"
              class="rounded-md border border-border bg-card px-3 py-1.5 font-fell text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All</option>
              <option v-for="s in DOWNTIME_DRAW_STATUSES" :key="s" :value="s">
                {{ DOWNTIME_DRAW_STATUS_LABELS[s] }}
              </option>
            </select>
          </div>

          <div>
            <label for="downtime-filter-character" class="mb-1 block text-2xs font-medium">
              Character
            </label>
            <select
              id="downtime-filter-character"
              v-model="filterCharacter"
              class="rounded-md border border-border bg-card px-3 py-1.5 font-fell text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Everyone</option>
              <option v-for="m in party ?? []" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
          </div>

          <button
            v-if="ui.downtimeHasActiveFilters"
            type="button"
            class="rounded-md border border-border px-3 py-1.5 text-2xs text-muted-foreground hover:bg-muted"
            @click="ui.resetDowntimeFilters()"
          >
            Clear
          </button>
        </div>
      </header>

      <p v-if="pendingDraws.length === 0" class="mt-3 text-2xs text-muted-foreground">
        Nothing pending. Grant a credit and your players can spend it between sessions.
      </p>
      <div v-else class="mt-3 space-y-4">
        <DowntimeResolvePanel
          v-for="draw in pendingDraws"
          :key="draw.id"
          :draw="draw"
          :member-name="memberName(draw.party_member_id)"
          :backs="backs ?? []"
        />
      </div>
    </section>

    <!-- Prep -->
    <div class="mt-8">
      <DeckBacksPanel />
    </div>

    <!-- What has already happened -->
    <section v-if="resolvedFeed.length > 0" class="mt-8">
      <h2 class="font-cinzel text-base font-semibold">Resolved</h2>
      <div class="mt-3 space-y-3">
        <DowntimeOutcomeVignette
          v-for="{ outcome, draw } in resolvedFeed"
          :key="outcome.id"
          :outcome="outcome"
          :activity-key="draw.activity_key"
          :reward-name="rewardName(outcome.reward_type, outcome.reward_id)"
          :reward-href="rewardHref(outcome.reward_type, outcome.reward_id)"
        />
      </div>
    </section>
  </div>
</template>
