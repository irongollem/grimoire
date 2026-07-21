<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { getDowntimeActivity } from "@/data/downtimeActivities";
import type { DowntimeOutcome, DowntimeEffect } from "@/types/downtime.types";
import { COIN_KEYS } from "@/types/downtime.types";

const {
  outcome,
  activityKey,
  rewardName = null,
  rewardHref = null,
  rewardPending = false,
  isNew = false,
} = defineProps<{
  outcome: DowntimeOutcome;
  activityKey: string;
  /** Null when the reward's name can't be resolved for this player. */
  rewardName?: string | null;
  rewardHref?: string | null;
  /**
   * True when the reward exists (the outcome carries a reward id) but isn't
   * yet visible to this player — e.g. a seed reward NPC the DM hasn't
   * revealed yet. Distinct from a genuinely absent reward, and must never be
   * reported as "no longer exists" — that's a lie the player can catch out.
   */
  rewardPending?: boolean;
  isNew?: boolean;
}>();

const activity = computed(() => getDowntimeActivity(activityKey));

/** An unresolved name reads as "pending reveal" when we know the reward
 * still exists; only a truly missing reference reads as absent. */
const rewardLabel = computed(() => {
  if (rewardName) return rewardName;
  if (rewardPending) return "a new acquaintance (your DM will introduce them)";
  return "??? (no longer exists)";
});

const appliedEffects = computed(() => outcome.proposed_effects.filter((e) => e.applied));

function effectSummary(effect: DowntimeEffect): string {
  switch (effect.kind) {
    case "gold": {
      const parts = COIN_KEYS.filter((k) => effect[k] !== 0).map((k) => `${effect[k]} ${k}`);
      return parts.length > 0 ? parts.join(", ") : "no coin changed hands";
    }
    case "item":
      return `${effect.qty}× item`;
    case "hp":
      return `${effect.delta} HP`;
    case "condition":
      return effect.condition;
  }
}
</script>

<template>
  <article class="rounded-lg border border-border bg-card p-4">
    <header class="flex items-start gap-2">
      <span v-if="activity" class="text-xl leading-none" aria-hidden="true">
        {{ activity.glyph }}
      </span>
      <div class="min-w-0 flex-1">
        <h3 class="flex items-center gap-2 text-heading-sm font-semibold">
          {{ outcome.title }}
          <span
            v-if="isNew"
            class="size-2 shrink-0 rounded-full bg-destructive"
            title="New"
          >
            <span class="sr-only">Unread</span>
          </span>
        </h3>
        <p class="text-2xs text-muted-foreground">
          {{ activity ? activity.title : "???" }}
        </p>
      </div>
    </header>

    <div v-if="outcome.vignette" class="mt-3 text-sm">
      <RichTextViewer :content="outcome.vignette" />
    </div>

    <!-- The reward, as a real linked entity -->
    <div v-if="outcome.reward_type" class="mt-3">
      <RouterLink
        v-if="rewardHref && rewardName"
        :to="rewardHref"
        class="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-2xs hover:bg-muted"
      >
        <span class="capitalize text-muted-foreground">{{ outcome.reward_type }}</span>
        <span class="font-medium">{{ rewardName }}</span>
      </RouterLink>
      <span
        v-else
        class="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-2xs text-muted-foreground"
      >
        <span class="capitalize">{{ outcome.reward_type }}</span>
        <span>{{ rewardLabel }}</span>
      </span>
    </div>

    <ul v-if="appliedEffects.length > 0" class="mt-3 space-y-1">
      <li
        v-for="(effect, i) in appliedEffects"
        :key="i"
        class="flex items-baseline gap-2 text-2xs text-muted-foreground"
      >
        <span class="capitalize">{{ effect.kind }}:</span>
        <span>{{ effectSummary(effect) }}</span>
        <span v-if="effect.note" class="italic">— {{ effect.note }}</span>
      </li>
    </ul>
  </article>
</template>
