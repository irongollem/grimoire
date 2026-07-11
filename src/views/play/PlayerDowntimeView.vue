<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import DowntimeActivityCard from "@/components/downtime/DowntimeActivityCard.vue";
import DowntimeOutcomeVignette from "@/components/downtime/DowntimeOutcomeVignette.vue";
import { useAuthStore } from "@/stores/auth";
import { useSharedNpcs } from "@/composables/useNpcs";
import { useReadItems, useMarkRead } from "@/composables/useReadItems";
import {
  useDowntimeBalance,
  useDowntimeDraws,
  useDowntimeOutcomes,
  useSpendDraw,
} from "@/composables/useDowntime";
import { DOWNTIME_ACTIVITIES } from "@/data/downtimeActivities";
import { DOWNTIME_DRAW_STATUS_LABELS } from "@/types/downtime.types";
import type { DowntimeActivity, DowntimeDraw, DowntimeOutcome } from "@/types/downtime.types";

const auth = useAuthStore();
const { linkedPartyMemberId } = storeToRefs(auth);

const balance = useDowntimeBalance(linkedPartyMemberId);
const { data: draws } = useDowntimeDraws();
const { data: outcomes } = useDowntimeOutcomes();
// Player-visible projection only (gated names) — never the raw npcs table.
const { data: npcs } = useSharedNpcs();
const { isNew } = useReadItems("downtime_outcome");
const markRead = useMarkRead();
const spend = useSpendDraw();

const errorMessage = ref<string | null>(null);

/** Null balance means "unknown" (loading, or no character) — never render 0. */
const hasCharacter = computed(() => linkedPartyMemberId.value !== null);
const canDraw = computed(
  () => balance.value !== null && balance.value > 0 && !spend.isPending.value,
);

const myDraws = computed(() =>
  (draws.value ?? []).filter((d) => d.party_member_id === linkedPartyMemberId.value),
);
const pending = computed(() => myDraws.value.filter((d) => d.status === "pending"));

interface OutcomeEntry {
  outcome: DowntimeOutcome;
  draw: DowntimeDraw;
}

const myOutcomes = computed<OutcomeEntry[]>(() =>
  (outcomes.value ?? []).flatMap((outcome) => {
    const draw = myDraws.value.find((d) => d.id === outcome.draw_id);
    return draw ? [{ outcome, draw }] : [];
  }),
);

function rewardName(rewardType: string | null, rewardId: string | null): string | null {
  if (rewardType !== "npc" || !rewardId) return null;
  return npcs.value?.find((n) => n.id === rewardId)?.name ?? null;
}

async function onSelect(activity: DowntimeActivity) {
  errorMessage.value = null;
  try {
    await spend.mutateAsync(activity.key);
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : "Could not spend that draw.";
  }
}

function onOpenOutcome(outcomeId: string) {
  markRead.mutate({ entityType: "downtime_outcome", entityId: outcomeId });
}
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-6">
    <header>
      <h1 class="font-cinzel text-2xl font-semibold">The Interlude</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        What your character does between the dungeon and the next session.
      </p>
    </header>

    <p v-if="!hasCharacter" class="mt-6 text-sm text-muted-foreground">
      You don't play a character in this campaign yet.
    </p>

    <template v-else>
      <!-- Draw balance -->
      <section class="mt-6 rounded-lg border border-border bg-card p-4">
        <p v-if="balance === null" class="text-sm text-muted-foreground">Counting your draws…</p>
        <template v-else>
          <p class="font-cinzel text-lg">
            {{ balance }} {{ balance === 1 ? "draw" : "draws" }}
          </p>
          <p class="mt-1 text-2xs text-muted-foreground">
            <template v-if="balance > 0">
              Spend one below. Your DM resolves it before the next session.
            </template>
            <template v-else>
              Nothing to spend yet — your DM grants downtime when the story allows a lull.
            </template>
          </p>
        </template>
      </section>

      <p v-if="errorMessage" class="mt-3 text-2xs text-destructive">{{ errorMessage }}</p>

      <!-- The Activity Board -->
      <section class="mt-6">
        <h2 class="font-cinzel text-base font-semibold">Activity board</h2>
        <div class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <DowntimeActivityCard
            v-for="activity in DOWNTIME_ACTIVITIES"
            :key="activity.key"
            :activity="activity"
            :disabled="!canDraw"
            @select="onSelect"
          />
        </div>
      </section>

      <!-- Pending -->
      <section v-if="pending.length > 0" class="mt-8">
        <h2 class="font-cinzel text-base font-semibold">In your DM's hands</h2>
        <ul class="mt-2 space-y-1">
          <li
            v-for="draw in pending"
            :key="draw.id"
            class="rounded border border-dashed border-border px-3 py-2 text-2xs text-muted-foreground"
          >
            {{ DOWNTIME_DRAW_STATUS_LABELS[draw.status] }} — you'll see the outcome here.
          </li>
        </ul>
      </section>

      <!-- History -->
      <section v-if="myOutcomes.length > 0" class="mt-8">
        <h2 class="font-cinzel text-base font-semibold">What happened</h2>
        <div class="mt-3 space-y-3">
          <div
            v-for="entry in myOutcomes"
            :key="entry.outcome.id"
            @click="onOpenOutcome(entry.outcome.id)"
          >
            <DowntimeOutcomeVignette
              :outcome="entry.outcome"
              :activity-key="entry.draw.activity_key"
              :reward-name="rewardName(entry.outcome.reward_type, entry.outcome.reward_id)"
              :is-new="isNew(entry.outcome.id, entry.outcome.updated_at)"
            />
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
