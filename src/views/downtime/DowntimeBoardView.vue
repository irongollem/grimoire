<script setup lang="ts">
import { computed } from "vue";
import PageHeader from "@/components/common/PageHeader.vue";
import DowntimeResolvePanel from "@/components/downtime/DowntimeResolvePanel.vue";
import DeckBacksPanel from "@/components/downtime/DeckBacksPanel.vue";
import DowntimeOutcomeVignette from "@/components/downtime/DowntimeOutcomeVignette.vue";
import GrantDowntimeButton from "@/components/downtime/GrantDowntimeButton.vue";
import { useParty } from "@/composables/useParty";
import { useNpcs } from "@/composables/useNpcs";
import { useDowntimeDraws, useDowntimeOutcomes, useDeckBacks } from "@/composables/useDowntime";
import { useUiStore } from "@/stores/ui";
import { DOWNTIME_DRAW_STATUSES } from "@/types/downtime.types";
import type { DowntimeDraw } from "@/types/downtime.types";

const ui = useUiStore();
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
  <div class="mx-auto max-w-5xl px-4 py-6">
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

    <!-- Filters -->
    <div class="mt-6 flex flex-wrap items-end gap-3">
      <label class="text-2xs font-medium">
        Status
        <select
          v-model="filterStatus"
          class="mt-1 block rounded border border-border bg-background px-2 py-1 text-sm"
        >
          <option value="all">All</option>
          <option v-for="s in DOWNTIME_DRAW_STATUSES" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>

      <label class="text-2xs font-medium">
        Character
        <select
          v-model="filterCharacter"
          class="mt-1 block rounded border border-border bg-background px-2 py-1 text-sm"
        >
          <option value="">Everyone</option>
          <option v-for="m in party ?? []" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </label>

      <button
        v-if="ui.downtimeHasActiveFilters"
        type="button"
        class="rounded border border-border px-2 py-1 text-2xs text-muted-foreground hover:bg-muted"
        @click="ui.resetDowntimeFilters()"
      >
        Clear
      </button>
    </div>

    <!-- Pending draws: the batch resolution board -->
    <section class="mt-4">
      <h2 class="font-cinzel text-base font-semibold">
        Awaiting you
        <span class="text-2xs font-normal text-muted-foreground">({{ pendingDraws.length }})</span>
      </h2>
      <p v-if="pendingDraws.length === 0" class="mt-2 text-2xs text-muted-foreground">
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
