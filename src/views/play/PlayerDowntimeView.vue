<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import DowntimeActivityCard from "@/components/downtime/DowntimeActivityCard.vue";
import DowntimeOutcomeVignette from "@/components/downtime/DowntimeOutcomeVignette.vue";
import RuleDisabledNotice from "@/components/common/RuleDisabledNotice.vue";
import { useIsRuleEnabled } from "@/composables/rules/useOptionalRules";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useAuthStore } from "@/stores/auth";
import { useSharedNpcs } from "@/composables/npcs/useNpcs";
import { usePlayerVisibleItems } from "@/composables/items/useItems";
import { useReadItems, useMarkRead } from "@/composables/play/useReadItems";
import {
  useDowntimeBalance,
  useDowntimeDraws,
  useDowntimeOutcomes,
  useSpendDraw,
} from "@/composables/downtime/useDowntime";
import { DOWNTIME_ACTIVITIES, getDowntimeActivity } from "@/data/downtimeActivities";
import { DOWNTIME_DRAW_STATUS_LABELS } from "@/types/downtime.types";
import type {
  DowntimeActivity,
  DowntimeDraw,
  DowntimeOutcome,
  DowntimeRewardType,
} from "@/types/downtime.types";

const auth = useAuthStore();
const { linkedPartyMemberId } = storeToRefs(auth);

// The nav entry hides when the DM switches the module off, but a bookmarked URL
// still lands here — refuse to render the board rather than let a draw be spent.
const isEnabled = useIsRuleEnabled("downtime");

const balance = useDowntimeBalance(linkedPartyMemberId);
const { data: draws } = useDowntimeDraws();
const { data: outcomes } = useDowntimeOutcomes();
// Player-visible projections only (gated names) — never the raw tables.
const { data: npcs } = useSharedNpcs();
const { data: items } = usePlayerVisibleItems();
const { isNew } = useReadItems("downtime_outcome");
const markRead = useMarkRead();
const spend = useSpendDraw();
const { confirm } = useConfirm();
const toast = useToast();

/** Null balance means "unknown" (loading, or no character) — never render 0. */
const hasCharacter = computed(() => linkedPartyMemberId.value !== null);
const canDraw = computed(
  () => balance.value !== null && balance.value > 0 && !spend.isPending.value,
);

const myDraws = computed(() =>
  (draws.value ?? []).filter((d) => d.party_member_id === linkedPartyMemberId.value),
);
const pending = computed(() => myDraws.value.filter((d) => d.status === "pending"));

/**
 * Turn the card the moment the player commits, rather than waiting for the
 * round trip and the refetch to put the draw in `pending` — a card that sits
 * still for half a second after a confirmed tap is the bug this whole view is
 * fixing. Cleared below once the real draw arrives, so a DM's cancellation
 * turns the card back rather than leaving a lie on the board.
 */
const optimisticTurn = ref<string | null>(null);

const pendingByActivity = computed(() => {
  const counts = new Map<string, number>();
  for (const draw of pending.value) {
    counts.set(draw.activity_key, (counts.get(draw.activity_key) ?? 0) + 1);
  }
  if (optimisticTurn.value && !counts.has(optimisticTurn.value)) {
    counts.set(optimisticTurn.value, 1);
  }
  return counts;
});

watch(pending, (list) => {
  const key = optimisticTurn.value;
  if (key && list.some((d) => d.activity_key === key)) optimisticTurn.value = null;
});

/**
 * An activity_key no longer in the catalog has no title — say so with the
 * absence marker rather than coercing it to an empty string.
 */
function activityLabel(key: string): { title: string; glyph: string | null } {
  const activity = getDowntimeActivity(key);
  return activity
    ? { title: activity.title, glyph: activity.glyph }
    : { title: "???", glyph: null };
}

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

function rewardName(rewardType: DowntimeRewardType | null, rewardId: string | null): string | null {
  if (!rewardType || !rewardId) return null;
  switch (rewardType) {
    case "npc":
      return npcs.value?.find((n) => n.id === rewardId)?.name ?? null;
    case "item":
      return items.value?.find((i) => i.id === rewardId)?.name ?? null;
    default:
      // Notes have no player-facing surface to resolve against, and nothing can
      // mint the other three. All of them fall to `rewardPending` below, which
      // is the honest answer from a player's seat either way.
      return null;
  }
}

/**
 * True whenever a reward exists but this player cannot see it yet.
 *
 * Every kind is minted private and hidden (`downtimeSeedReward.ts`) until the
 * DM reveals it, and a player has no way to tell "withheld" from "deleted" —
 * so from their seat an unresolved reward is always "not yet". Reporting it as
 * gone would be a lie they catch out the moment the DM shares it. The reward
 * pair is null-together by CHECK, so an id present means a row was created.
 */
function rewardPending(rewardType: DowntimeRewardType | null, rewardId: string | null): boolean {
  return !!rewardType && !!rewardId && !rewardName(rewardType, rewardId);
}

/**
 * A draw is scarce, DM-granted, and only the DM can hand it back — and the card
 * is a big art tile, which reads as "tap to open" rather than "tap to spend".
 * So the tap asks first, and only then does the card turn.
 */
async function onSelect(activity: DowntimeActivity) {
  const left = balance.value ?? 0;
  // The activity leads the message rather than the title: ModalHeader keeps a
  // title to one line, and "Spend your draw on Craft & En…" is not a question
  // anyone can answer.
  const ok = await confirm(
    `${activity.title}. This spends one of your ${left} ${left === 1 ? "draw" : "draws"}, and your DM resolves it before the next session.`,
    {
      title: "Spend a draw?",
      confirmLabel: "Spend it",
      danger: false,
    },
  );
  if (!ok) return;

  optimisticTurn.value = activity.key;
  try {
    await spend.mutateAsync(activity.key);
    toast.success(`${activity.title} — your draw is with your DM.`);
  } catch (e) {
    optimisticTurn.value = null;
    toast.error(toast.fromError(e, "Could not spend that draw."));
  }
}

function onOpenOutcome(outcomeId: string) {
  markRead.mutate({ entityType: "downtime_outcome", entityId: outcomeId });
}

// The vignette is fully readable without any click affordance, so clear the
// unread dot when the outcomes come into view (on mount / as they load) rather
// than only on click — otherwise the dots stick forever.
watch(myOutcomes, (list) => {
  for (const entry of list) {
    if (isNew(entry.outcome.id)) {
      markRead.mutate({ entityType: "downtime_outcome", entityId: entry.outcome.id });
    }
  }
}, { immediate: true });
</script>

<template>
  <RuleDisabledNotice
    v-if="!isEnabled"
    module-name="The Interlude"
    hint="Ask your DM to enable it in Campaign Settings → Rules."
  />

  <div v-else class="mx-auto max-w-3xl px-4 py-6">
    <header>
      <h1 class="text-title font-semibold">The Interlude</h1>
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
          <p class="text-heading">
            {{ balance }} {{ balance === 1 ? "draw" : "draws" }}
          </p>
          <!-- Spending your last draw used to land on the same line as never
               having had one, which reads as "nothing happened" — the exact
               complaint. A pending draw takes precedence over the empty state. -->
          <p class="mt-1 text-2xs text-muted-foreground">
            <template v-if="balance > 0">
              Spend one below. Your DM resolves it before the next session.
            </template>
            <template v-else-if="pending.length > 0">
              {{ pending.length === 1 ? "Your draw is" : "Your draws are" }} with your DM — the
              outcome lands here.
            </template>
            <template v-else>
              Nothing to spend yet — your DM grants downtime when the story allows a lull.
            </template>
          </p>
        </template>
      </section>

      <!-- Pending. Above the board on purpose: it is the answer to "what did my
           tap do", and below eight cards nobody ever scrolled to it. -->
      <section v-if="pending.length > 0" class="mt-6">
        <h2 class="text-heading-sm font-semibold">In your DM's hands</h2>
        <ul class="mt-2 space-y-1">
          <li
            v-for="draw in pending"
            :key="draw.id"
            class="flex items-center gap-2 rounded border border-dashed border-border px-3 py-2 text-2xs text-muted-foreground"
          >
            <span v-if="activityLabel(draw.activity_key).glyph" aria-hidden="true">
              {{ activityLabel(draw.activity_key).glyph }}
            </span>
            <span>
              <span class="font-medium text-foreground">
                {{ activityLabel(draw.activity_key).title }}
              </span>
              — {{ DOWNTIME_DRAW_STATUS_LABELS[draw.status] }}. You'll see the outcome below.
            </span>
          </li>
        </ul>
      </section>

      <!-- The Activity Board -->
      <section class="mt-6">
        <h2 class="text-heading-sm font-semibold">Activity board</h2>
        <p v-if="balance === 0" class="mt-1 text-2xs text-muted-foreground">
          The board is closed until your DM grants another draw.
        </p>
        <div class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <DowntimeActivityCard
            v-for="activity in DOWNTIME_ACTIVITIES"
            :key="activity.key"
            :activity="activity"
            :disabled="!canDraw"
            :pending-count="pendingByActivity.get(activity.key) ?? 0"
            @select="onSelect"
          />
        </div>
      </section>

      <!-- History -->
      <section v-if="myOutcomes.length > 0" class="mt-8">
        <h2 class="text-heading-sm font-semibold">What happened</h2>
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
              :reward-pending="rewardPending(entry.outcome.reward_type, entry.outcome.reward_id)"
              :is-new="isNew(entry.outcome.id, entry.outcome.updated_at)"
            />
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
