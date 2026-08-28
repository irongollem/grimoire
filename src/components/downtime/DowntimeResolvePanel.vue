<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import DowntimeActivityCard from "./DowntimeActivityCard.vue";
import { getDowntimeActivity } from "@/data/downtimeActivities";
import { markdownToTiptapJson } from "@/lib/tiptap/markdownToTiptap";
import { previewDraw, useResolveDraw, useCancelDraw, useApplyEffects } from "@/composables/downtime/useDowntime";
import { isAutoAppliedKind, describeEffect } from "@/lib/downtime/downtimeEffects";
import { useDowntimeGeneration } from "@/ai/useDowntimeGeneration";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useCampaignStore } from "@/stores/campaign";
import type { AiProvenance } from "@/ai/provenance";
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
// Set only when `result` came from an AI draft (onDraft below) — a prepped or
// system-deck seed never carries provenance, so this stays null for those.
const draftProvenance = ref<AiProvenance | null>(null);

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

/** Shared with the printed outcome card, so a consequence reads the same both places. */
const effectSummary = describeEffect;

/** Coin, HP, and conditions are enacted by the app; `item` is the DM's to hand out. */
function isAutoApplied(effect: DowntimeEffect): boolean {
  return isAutoAppliedKind(effect.kind);
}

const resolve = useResolveDraw();
const cancel = useCancelDraw();
const applyEffects = useApplyEffects();

// ── AI outcome drafting ──────────────────────────────────────────────────────
// A drafted outcome REPLACES what the deck dealt: it becomes the `result` this
// panel resolves, so it travels the ordinary seed path (mint the reward, call
// the RPC, apply ticked effects) with no parallel plumbing.
const campaign = useCampaignStore();
const { generate, isGenerating, error: draftError } = useDowntimeGeneration();
const { costOf, balance, isLoading: creditsLoading } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();

const steer = ref("");

const isAiEnabled = computed(() => campaign.isAiEnabled);
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);

/** Text-only generator — there is no illustration, so no entity_image charge. */
const effectiveCreditCost = computed(() =>
  textIsByok.value
    ? 0
    : Math.round(costOf("downtime_generation") * textMultiplierFor(textProvider.value) * 100) / 100,
);

const canAfford = computed(
  () => creditsLoading.value || (balance.value ?? 0) >= effectiveCreditCost.value,
);

const creditLine = computed(() => {
  const cost = parseFloat(effectiveCreditCost.value.toFixed(2));
  if (cost === 0) return "Your own API key — no credits spent";
  const bal = parseFloat(((balance.value ?? 0) as number).toFixed(2));
  return `${cost === 1 ? "1 credit" : `${cost} credits`} · Balance: ${bal}`;
});

async function onDraft() {
  if (!activity.value) return;
  errorMessage.value = null;
  const draft = await generate({
    activity: activity.value,
    characterName: memberName,
    steer: steer.value.trim() || undefined,
  });
  if (!draft) return; // the composable surfaced the reason in `draftError`

  result.value = { source: "seed", seed: draft.seed };
  title.value = draft.seed.title;
  vignette.value = markdownToTiptapJson(draft.seed.vignette);
  effects.value = draft.seed.proposedEffects.map((e) => ({ ...e }));
  draftProvenance.value = draft.ai_provenance ?? null;
}

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
      ai_provenance: draftProvenance.value,
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
        <p v-else class="text-caption-sm text-muted-foreground">??? (unknown archetype)</p>
      </div>

      <div class="min-w-0 flex-1">
        <header>
          <h3 class="text-heading-sm font-semibold">{{ memberName }}</h3>
          <p class="text-caption-sm text-muted-foreground">{{ sourceLabel }}</p>
        </header>

        <!-- What the deck yielded -->
        <p
          v-if="result?.source === 'prepped'"
          class="mt-2 rounded border border-primary/40 bg-primary/5 p-2 text-caption-sm"
        >
          Your prepped <span class="capitalize">{{ result.back.reward_type }}</span> is waiting.
          Resolving links it to this outcome<span v-if="!result.back.is_recurring">
            and consumes it from the pile</span
          >.
        </p>
        <p
          v-else-if="result?.source === 'seed' && seedReward"
          class="mt-2 rounded border border-border bg-muted/40 p-2 text-caption-sm"
        >
          A new {{ seedReward.noun }} — <span class="font-medium">{{ seedReward.name }}</span> —
          will be created in your campaign and linked to this outcome.
        </p>
        <p v-else class="mt-2 text-caption-sm text-destructive">
          Nothing to draw. Prep a card back, or resolve with no reward attached.
        </p>

        <!-- AI drafting: replaces what the deck dealt with a ready-to-edit outcome -->
        <div v-if="isAiEnabled && activity" class="mt-3 rounded border border-dashed border-border p-2">
          <div class="flex items-end gap-2">
            <label class="min-w-0 flex-1 text-eyebrow font-medium">
              Draft with AI <span class="text-muted-foreground">(optional steer)</span>
              <AppInput
                v-model="steer"
                placeholder="Aim it at the Duke — he owes them a favour"
                size="body"
                class="mt-1"
                @keydown.enter.prevent="onDraft"
              />
            </label>
            <AppButton
              variant="tinted"
              tone="primary"
              emphasis="outline"
              size="xs"
              :disabled="isGenerating || !canAfford"
              :label="isGenerating ? 'Drafting…' : 'Draft'"
              class="shrink-0"
              @click="onDraft"
            />
          </div>
          <p class="mt-1 text-caption-sm text-muted-foreground">{{ creditLine }}</p>
          <p v-if="!canAfford" class="mt-1 text-caption-sm text-destructive">
            Not enough credits to draft this outcome.
          </p>
          <p v-if="draftError" class="mt-1 text-caption-sm text-destructive">{{ draftError }}</p>
        </div>

        <label class="mt-3 block text-eyebrow font-medium">
          Title
          <AppInput v-model="title" placeholder="A friend in low places" size="body" class="mt-1" />
        </label>

        <div class="mt-3">
          <p class="mb-1 text-eyebrow font-medium">Vignette</p>
          <RichTextEditor v-model="vignette" placeholder="What happened during the interlude…" />
        </div>

        <!-- Proposed effects: nothing is applied until the DM ticks it -->
        <fieldset v-if="effects.length > 0" class="mt-3">
          <legend class="text-eyebrow font-medium">Proposed consequences</legend>
          <p class="mb-1 text-caption-sm text-muted-foreground">
            Your world, your call. Coin, HP, and conditions are applied automatically;
            items are yours to hand out.
          </p>
          <AppCheckbox
            v-for="(effect, i) in effects"
            :key="i"
            v-model="effect.applied"
            align="start"
            class="items-baseline gap-2 py-0.5"
          >
            <span class="capitalize font-medium">{{ effect.kind }}</span>
            <span>{{ effectSummary(effect) }}</span>
            <span v-if="!isAutoApplied(effect)" class="text-muted-foreground">
              (apply at the table)
            </span>
            <span v-if="effect.note" class="italic text-muted-foreground">— {{ effect.note }}</span>
          </AppCheckbox>
        </fieldset>

        <p v-if="errorMessage" class="mt-2 text-caption-sm text-destructive">{{ errorMessage }}</p>

        <div class="mt-4 flex items-center gap-2">
          <AppButton
            variant="primary"
            size="xs"
            :disabled="!canResolve || resolve.isPending.value"
            :label="resolve.isPending.value ? 'Resolving…' : 'Resolve'"
            @click="onResolve"
          />
          <AppButton
            variant="subtle"
            fill="muted"
            size="caption"
            :disabled="cancel.isPending.value"
            label="Cancel draw (refunds the credit)"
            @click="onCancel"
          />
        </div>
      </div>
    </div>
  </section>
</template>
