<template>
  <section v-if="offered" class="flex flex-col gap-2 border-t border-border p-4" data-testid="ask-the-illuminator">
    <div class="flex items-baseline justify-between gap-2">
      <h2 class="flex items-center gap-1.5 text-eyebrow uppercase text-tone-arcane">
        <IconGenerate class="size-3.5" aria-hidden="true" />
        Ask the Illuminator
      </h2>
      <span class="text-caption text-muted-foreground">uses credits</span>
    </div>

    <div v-for="row in rows" :key="row.action" class="flex flex-col gap-1">
      <AppButton
        variant="outline"
        size="sm"
        block
        class="justify-start"
        :icon="IconGenerate"
        :label="row.label"
        :loading="illuminate.isGenerating.value && running === row.action"
        :disabled="illuminate.isGenerating.value || !!row.blocked || !documentId || !canPay(row.credits)"
        :tooltip="row.blocked"
        :data-testid="`ask-${row.action}`"
        @click="ask(row.action)"
      />
      <div class="flex items-center justify-between gap-2 px-1">
        <span class="text-caption text-muted-foreground">{{ row.note }}</span>
        <GenerationCostBadge :credits="row.credits" :show-balance="false" />
      </div>
      <!-- Space above, like the other rows: it sat tight under the caption. -->
      <PanelField v-if="row.action === 'extend'" label="Toward" class="mt-2">
        <SegmentedControl v-model="edge" :options="EDGE_OPTIONS" size="xs" block />
      </PanelField>
    </div>

    <AppButton
      v-if="hasAiResult"
      variant="ghost"
      size="sm"
      class="justify-start"
      :icon="IconUndo"
      label="Use the original picture"
      :disabled="illuminate.isGenerating.value"
      data-testid="ask-use-original"
      @click="useOriginal"
    />

    <p class="text-caption leading-snug text-muted-foreground">
      A result arrives as the picture you edit from. It is labelled AI-made wherever it is shown.
    </p>
  </section>
</template>

<script setup lang="ts">
/**
 * "Ask the Illuminator" (#1176 frame 12, story 10): the AI picture actions in the workbench's right column. Each
 * carries the app's sparkle, shows what it costs, and the whole section is absent when AI is off for the
 * campaign. The picture it works on is the recipe's current base, so a second action builds on the first; the
 * stored result goes up to the workbench, which makes it the base. Reset to the original asks first, because
 * the output cannot be made again for free.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import PanelField from "@/scriptorium/components/panel/PanelField.vue";
import { useIlluminatePicture, useIlluminatePictureCost, type IlluminateAction } from "@/ai/useIlluminatePicture";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { IconGenerate, IconUndo } from "@/lib/icons";
import type { ScriptoriumArtLook } from "@edge-shared/scriptoriumLookStyles.ts";
import { useCampaignStore } from "@/stores/campaign";
import { extendLayout, nearestAiSize, sendDimensions, type AiSize, type PageEdge } from "@/scriptorium/illuminator/lib/aiPicture";

const { baseUrl, natural, documentId, campaignId, userId, look, hasAiResult } = defineProps<{
  /** The picture the next action works from: the AI result if there is one, else the original. */
  baseUrl: string;
  /** That picture's pixel size, once it has loaded; the price follows the shape it will be sent in. */
  natural: { width: number; height: number } | null;
  documentId: string;
  /** The book's campaign, null for an account-wide book. AI is offered only when it is the active campaign. */
  campaignId: string | null;
  userId: string | undefined;
  /** The book's look: its name for the caption, and which of the server's art looks it is (null on a handout paper). */
  look: { label: string; id: ScriptoriumArtLook | null } | null;
  hasAiResult: boolean;
}>();

const emit = defineEmits<{
  /** A stored AI picture, and the action that made it. */
  result: [url: string, action: IlluminateAction];
  useOriginal: [];
}>();

const campaign = useCampaignStore();
const toast = useToast();
const { confirm } = useConfirm();
const { affordable } = useAiCredits();
const { costFor } = useIlluminatePictureCost();
const illuminate = useIlluminatePicture();

const EDGE_OPTIONS: SegmentedOption<PageEdge>[] = [
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
];
const edge = ref<PageEdge>("right");
/** AI is per campaign, so the actions exist only for a book of the active campaign with AI on there. */
const offered = computed(() => campaignId !== null && campaignId === campaign.activeCampaignId && campaign.isAiEnabled);
const running = ref<IlluminateAction | null>(null);

/** The oblong the picture is sent in; null until it has loaded, so no price is shown that would then jump. */
const plainSize = computed<AiSize | null>(() => {
  if (!natural) return null;
  const { width, height } = sendDimensions(natural);
  return nearestAiSize(width, height);
});
const extendSize = computed<AiSize | null>(() => (natural ? (extendLayout(natural, edge.value)?.size ?? null) : null));
/** A price not known yet never blocks; a known one must be affordable. */
const canPay = (credits: number | null) => credits === null || affordable(credits);
const priced = (size: AiSize | null) => (size ? costFor(size) : null);

interface Row {
  action: IlluminateAction;
  label: string;
  note: string;
  credits: number | null;
  /** Why the action cannot run now, shown as its tooltip. */
  blocked?: string;
}

const rows = computed<Row[]>(() => [
  { action: "cutout", label: "Cut out the figure", note: "for behind the text", credits: priced(plainSize.value) },
  { action: "ink", label: "Turn into an ink sketch", note: "keeps the composition", credits: priced(plainSize.value) },
  { action: "watercolour", label: "Paint as a watercolour", note: "keeps the composition", credits: priced(plainSize.value) },
  {
    action: "extend",
    label: "Extend to the page edge",
    note: "for a corner",
    credits: priced(extendSize.value),
    blocked: natural && !extendSize.value ? "This picture already fills that edge." : undefined,
  },
  {
    action: "match",
    label: "Match this book's look",
    note: look?.label ?? "",
    credits: priced(plainSize.value),
    blocked: !look ? "Opening the book." : look.id ? undefined : "A handout has no house look to match.",
  },
]);

async function ask(action: IlluminateAction) {
  if (!userId || campaignId === null) {
    toast.error("Sign in again to use this.");
    return;
  }
  running.value = action;
  try {
    const url = await illuminate.run({
      action,
      baseUrl,
      documentId,
      campaignId,
      userId,
      look: action === "match" ? (look?.id ?? undefined) : undefined,
      edge: action === "extend" ? edge.value : undefined,
    });
    if (url) emit("result", url, action);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "That did not work. Try again.");
  } finally {
    running.value = null;
  }
}

async function useOriginal() {
  const ok = await confirm("This drops the AI result you paid for.", {
    title: "Use the original picture?",
    confirmLabel: "Drop it",
    danger: true,
  });
  if (ok) emit("useOriginal");
}
</script>
