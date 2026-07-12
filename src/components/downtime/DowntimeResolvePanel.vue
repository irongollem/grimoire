<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import DowntimeActivityCard from "./DowntimeActivityCard.vue";
import { getDowntimeActivity } from "@/data/downtimeActivities";
import { markdownToTiptapJson } from "@/lib/markdownToTiptap";
import { previewDraw, useResolveDraw, useCancelDraw, useApplyEffects } from "@/composables/useDowntime";
import { isAutoAppliedKind } from "@/lib/downtimeEffects";
import { COIN_KEYS } from "@/types/downtime.types";
import type { DowntimeDeckBack, DowntimeDraw, DowntimeEffect, DrawResult } from "@/types/downtime.types";

const { draw, memberName, backs } = defineProps<{
  draw: DowntimeDraw;
  memberName: string;
  backs: DowntimeDeckBack[];
}>();

const activity = computed(() => getDowntimeActivity(draw.activity_key));

/**
 * Rolled once, on mount. `previewDraw` consumes randomness, so recomputing it in
 * a `computed` would reshuffle the DM's outcome on every unrelated render.
 */
const result = ref<DrawResult | null>(null);
const title = ref("");
const vignette = ref<string | null>(null);
const effects = ref<DowntimeEffect[]>([]);
const errorMessage = ref<string | null>(null);

onMounted(() => {
  const drawn = previewDraw(draw.activity_key, backs);
  result.value = drawn;
  if (drawn?.source === "seed") {
    title.value = drawn.seed.title;
    vignette.value = markdownToTiptapJson(drawn.seed.vignette);
    // Clone so ticking a box never mutates the shared seed constant.
    effects.value = drawn.seed.proposedEffects.map((e) => ({ ...e }));
  } else if (drawn?.source === "prepped") {
    title.value = "";
    vignette.value = null;
    effects.value = [];
  }
});

const sourceLabel = computed(() => {
  if (!result.value) return "The deck has nothing prepared for this archetype.";
  return result.value.source === "prepped"
    ? "From your prepped pile"
    : "Drawn from the system deck";
});

/** What a seed draw will mint — kind + name, for the "will be created" line. */
const seedReward = computed<{ noun: string; name: string } | null>(() => {
  const r = result.value;
  if (r?.source !== "seed") return null;
  const reward = r.seed.reward;
  switch (reward.kind) {
    case "npc":
      return { noun: "NPC", name: reward.npc.name };
    case "item":
      return { noun: "item", name: reward.item.name };
    case "note":
      return { noun: "note", name: reward.note.title };
  }
  return null;
});

function effectSummary(effect: DowntimeEffect): string {
  switch (effect.kind) {
    case "gold": {
      const parts = COIN_KEYS.filter((k) => effect[k] !== 0).map((k) => `${effect[k]} ${k}`);
      return parts.length > 0 ? parts.join(", ") : "no coin";
    }
    case "item":
      return `${effect.qty}× item`;
    case "hp":
      return `${effect.delta} HP`;
    case "condition":
      return effect.condition;
  }
}

/** Coin, HP, and conditions are enacted by the app; `item` is the DM's to hand out. */
function isAutoApplied(effect: DowntimeEffect): boolean {
  return isAutoAppliedKind(effect.kind);
}

const resolve = useResolveDraw();
const cancel = useCancelDraw();
const applyEffects = useApplyEffects();

const canResolve = computed(() => title.value.trim() !== "");

async function onResolve() {
  errorMessage.value = null;
  try {
    await resolve.mutateAsync({
      draw,
      title: title.value.trim(),
      vignette: vignette.value,
      effects: effects.value,
      result: result.value,
    });
    await applyEffects.mutateAsync({
      partyMemberId: draw.party_member_id,
      effects: effects.value,
    });
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : "Could not resolve this draw.";
  }
}

async function onCancel() {
  errorMessage.value = null;
  try {
    await cancel.mutateAsync(draw.id);
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : "Could not cancel this draw.";
  }
}
</script>

<template>
  <section class="rounded-lg border border-border bg-card p-4">
    <div class="flex gap-4">
      <div class="w-28 shrink-0">
        <DowntimeActivityCard v-if="activity" :activity="activity" :interactive="false" />
        <p v-else class="text-2xs text-muted-foreground">??? (unknown archetype)</p>
      </div>

      <div class="min-w-0 flex-1">
        <header>
          <h3 class="font-cinzel text-base font-semibold">{{ memberName }}</h3>
          <p class="text-2xs text-muted-foreground">{{ sourceLabel }}</p>
        </header>

        <!-- What the deck yielded -->
        <p
          v-if="result?.source === 'prepped'"
          class="mt-2 rounded border border-primary/40 bg-primary/5 p-2 text-2xs"
        >
          Your prepped <span class="capitalize">{{ result.back.reward_type }}</span> is waiting.
          Resolving links it to this outcome<span v-if="!result.back.is_recurring">
            and consumes it from the pile</span
          >.
        </p>
        <p
          v-else-if="result?.source === 'seed' && seedReward"
          class="mt-2 rounded border border-border bg-muted/40 p-2 text-2xs"
        >
          A new {{ seedReward.noun }} — <span class="font-medium">{{ seedReward.name }}</span> —
          will be created in your campaign and linked to this outcome.
        </p>
        <p v-else class="mt-2 text-2xs text-destructive">
          Nothing to draw. Prep a card back, or resolve with no reward attached.
        </p>

        <label class="mt-3 block text-2xs font-medium">
          Title
          <input
            v-model="title"
            type="text"
            placeholder="A friend in low places"
            class="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
          />
        </label>

        <div class="mt-3">
          <p class="mb-1 text-2xs font-medium">Vignette</p>
          <RichTextEditor v-model="vignette" placeholder="What happened during the interlude…" />
        </div>

        <!-- Proposed effects: nothing is applied until the DM ticks it -->
        <fieldset v-if="effects.length > 0" class="mt-3">
          <legend class="text-2xs font-medium">Proposed consequences</legend>
          <p class="mb-1 text-2xs text-muted-foreground">
            Your world, your call. Coin, HP, and conditions are applied automatically;
            items are yours to hand out.
          </p>
          <label
            v-for="(effect, i) in effects"
            :key="i"
            class="flex items-baseline gap-2 py-0.5 text-2xs"
          >
            <input v-model="effect.applied" type="checkbox" class="mt-0.5" />
            <span class="capitalize font-medium">{{ effect.kind }}</span>
            <span>{{ effectSummary(effect) }}</span>
            <span v-if="!isAutoApplied(effect)" class="text-muted-foreground">
              (apply at the table)
            </span>
            <span v-if="effect.note" class="italic text-muted-foreground">— {{ effect.note }}</span>
          </label>
        </fieldset>

        <p v-if="errorMessage" class="mt-2 text-2xs text-destructive">{{ errorMessage }}</p>

        <div class="mt-4 flex items-center gap-2">
          <button
            type="button"
            :disabled="!canResolve || resolve.isPending.value"
            class="rounded bg-primary px-3 py-1 font-cinzel text-2xs text-primary-foreground disabled:opacity-50"
            @click="onResolve"
          >
            {{ resolve.isPending.value ? "Resolving…" : "Resolve" }}
          </button>
          <button
            type="button"
            :disabled="cancel.isPending.value"
            class="rounded border border-border px-3 py-1 text-2xs text-muted-foreground hover:bg-muted"
            @click="onCancel"
          >
            Cancel draw (refunds the credit)
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
