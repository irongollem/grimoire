<template>
  <AppModal :open="open" size="md" :backdrop-dismiss="false" @close="emit('close')">
    <ModalHeader title="New brush" :icon="IconBrush" tone="primary" closeable @close="emit('close')" />

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4" data-testid="new-brush">
      <!-- The ways. -->
      <div v-if="step === 'ways'" class="flex flex-col gap-2">
        <AppButton variant="outline" block class="h-auto justify-start py-2 text-left" label="From this brush" data-testid="way-armed" @click="emit('from-armed')" />
        <p class="px-1 text-caption text-muted-foreground">Keeps the brush you are holding, tuned as it is, in Yours.</p>

        <AppButton variant="outline" block class="h-auto justify-start py-2 text-left" label="From a photo of a mark" data-testid="way-photo" @click="picker?.click()" />
        <p class="px-1 text-caption text-muted-foreground">A dab of ink or paint on white paper becomes the tip.</p>

        <AppButton variant="outline" block class="h-auto justify-start py-2 text-left" label="From a box on the picture" data-testid="way-box" @click="emit('start-box')" />
        <p class="px-1 text-caption text-muted-foreground">Drag a box over the painting. What is inside it becomes the tip.</p>

        <template v-if="canDescribe">
          <AppButton variant="outline" block class="h-auto justify-start py-2 text-left" :icon="IconGenerate" label="Describe it" data-testid="way-describe" @click="step = 'describe'" />
          <p class="px-1 text-caption text-muted-foreground">Four tips from words. Uses credits, and the brushes are labelled AI-made.</p>
        </template>
        <input ref="picker" type="file" accept="image/*" class="hidden" data-testid="way-photo-file" @change="onPhoto" />
      </div>

      <!-- One tip, ready to name and keep. -->
      <div v-else-if="step === 'tip' && one" class="flex flex-col gap-3" data-testid="new-brush-one">
        <span class="self-start overflow-hidden rounded-sm border border-border" :style="paperStyle">
          <PaintPreviewCanvas :pixels="tipSwatch(one.tip)" :scale="2" label="The new tip" />
        </span>
        <PanelField label="Name">
          <AppInput v-model="one.name" size="sm" aria-label="Brush name" data-testid="new-brush-name" @keydown.enter.prevent="keepOne" />
        </PanelField>
      </div>

      <!-- Describe it. -->
      <div v-else-if="step === 'describe'" class="flex flex-col gap-3" data-testid="new-brush-describe">
        <PanelField :label="`Describe the brush (${DESCRIPTION_MIN} to ${DESCRIPTION_MAX} characters)`">
          <AppInput v-model="description" size="sm" aria-label="Describe the brush" placeholder="a wet sponge dab" data-testid="describe-input" @keydown.enter.prevent="make" />
        </PanelField>
        <div class="flex items-center justify-between gap-2">
          <GenerationCostBadge :credits="credits" :show-balance="false" />
          <span class="text-caption" :class="lengthOk ? 'text-muted-foreground' : 'text-destructive'" data-testid="describe-count">{{ trimmed.length }} / {{ DESCRIPTION_MAX }}</span>
        </div>
        <p v-if="described.error.value" role="alert" class="text-caption text-destructive" data-testid="describe-error">{{ described.error.value }}</p>
      </div>

      <!-- The four, to tick. -->
      <div v-else-if="step === 'pick'" class="flex flex-col gap-3" data-testid="new-brush-pick">
        <p class="text-caption text-muted-foreground">Keep the ones you like. Each is saved to Yours as "{{ trimmed }}" and a number.</p>
        <div class="grid grid-cols-2 gap-3">
          <div v-for="(t, i) in four" :key="i" class="flex flex-col gap-1.5 rounded-md border border-border p-2" :data-testid="`described-${i}`">
            <span class="self-start overflow-hidden rounded-sm border border-border" :style="paperStyle">
              <PaintPreviewCanvas v-if="t.ok" :pixels="tipSwatch(t.tip, 128)" :scale="2" />
              <span v-else class="flex size-16 items-center justify-center p-1 text-center text-caption text-muted-foreground">Unusable</span>
            </span>
            <AppCheckbox v-model="kept[i]" :disabled="!t.ok" :label="describedName(trimmed, i + 1)" />
          </div>
        </div>
      </div>

      <p v-if="message" role="alert" class="text-caption text-destructive" data-testid="new-brush-error">{{ message }}</p>
    </div>

    <div class="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
      <AppButton v-if="step !== 'ways' && !ready" variant="ghost" label="Back" @click="back" />
      <AppButton variant="outline" label="Cancel" @click="emit('close')" />
      <AppButton v-if="step === 'tip'" variant="primary" label="Save brush" :loading="saving" :disabled="!one || one.name.trim() === ''" data-testid="new-brush-save" @click="keepOne" />
      <AppButton
        v-else-if="step === 'describe'"
        variant="primary"
        :icon="IconGenerate"
        label="Make four tips"
        :loading="described.busy.value"
        :disabled="!lengthOk || !canPay"
        data-testid="describe-make"
        @click="make"
      />
      <AppButton v-else-if="step === 'pick'" variant="primary" :label="keepLabel" :loading="saving" :disabled="keptCount === 0" data-testid="described-save" @click="keepDescribed" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * New brush (#1181): four ways to make one. From the brush in hand (kept as it is), from a photo of a mark, from
 * a box dragged on the picture (the workbench closes this for the drag and reopens it on `ready`), and, when the
 * campaign has AI on, from words: one call, four tips, the painter ticks the ones to keep. The tips are cut from
 * pixels by `tipFromImage`; this dialog only gathers, shows and hands them up.
 */
import { aiOffered, canPayFor } from "@/scriptorium/illuminator/lib/aiOffer";
import { computed, reactive, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import PanelField from "@/scriptorium/components/panel/PanelField.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { IconBrush, IconGenerate } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { pixelsFromBlob } from "../brushes/decodeMark";
import { tipFromImage, type RgbaPixels } from "../brushes/tipFromImage";
import { checkDescription, DESCRIPTION_MAX, DESCRIPTION_MIN, useDescribedTips, useDescribedTipsCost, type DescribedTip, type DescribedTipsDeps } from "../useDescribedTips";
import { describedName, type NewTip } from "../brushes/newTip";
import PaintPreviewCanvas from "./PaintPreviewCanvas.vue";
import { PREVIEW_PAPER } from "./previewPaper";
import { tipSwatch } from "./tipSwatch";

const { open, campaignId, ready = null, saving = false, decode = pixelsFromBlob, tipDeps = undefined } = defineProps<{
  open: boolean;
  /** The book's campaign (null for an account-wide book); Describe is offered only for the active one, with AI on. */
  campaignId: string | null;
  /** A tip already cut (from a box on the picture): the dialog opens on it, ready to name. */
  ready?: NewTip | null;
  saving?: boolean;
  /** Reads a chosen photo's pixels; handed in so the dialog is tested without a browser decoder. */
  decode?: (file: Blob) => Promise<RgbaPixels>;
  tipDeps?: DescribedTipsDeps;
}>();
const emit = defineEmits<{
  close: [];
  "from-armed": [];
  "start-box": [];
  save: [items: NewTip[]];
}>();

const campaign = useCampaignStore();
const { affordable } = useAiCredits();
const { credits } = useDescribedTipsCost();
const described = useDescribedTips(tipDeps);

/** AI is per campaign: Describe exists only for a book of the active campaign with AI on there. */
const canDescribe = computed(() => aiOffered(campaignId, campaign));
const canPay = computed(() => canPayFor(credits.value, affordable));

const step = ref<"ways" | "tip" | "describe" | "pick">("ways");
const one = ref<NewTip | null>(null);
const message = ref("");
const description = ref("");
const four = ref<DescribedTip[]>([]);
const kept = reactive<boolean[]>([true, true, true, true]);
const picker = ref<HTMLInputElement | null>(null);
const paperStyle = { backgroundColor: PREVIEW_PAPER };

const trimmed = computed(() => description.value.trim());
const lengthOk = computed(() => checkDescription(description.value).ok);
const keptCount = computed(() => four.value.filter((t, i) => t.ok && kept[i]).length);
const keepLabel = computed(() => (keptCount.value === 1 ? "Save 1 brush" : `Save ${keptCount.value} brushes`));

watch(
  () => open,
  (now) => {
    if (!now) return;
    message.value = "";
    description.value = "";
    four.value = [];
    kept.fill(true);
    one.value = ready ? { ...ready } : null;
    step.value = ready ? "tip" : "ways";
  },
  { immediate: true },
);

function back() {
  message.value = "";
  step.value = step.value === "pick" ? "describe" : "ways";
}

async function onPhoto(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  message.value = "";
  try {
    const made = tipFromImage(await decode(file));
    if (!made.ok) {
      message.value = made.message;
      return;
    }
    one.value = { tip: made.tip, name: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 80) || "Photo brush", source: "photo" };
    step.value = "tip";
  } catch {
    message.value = "That picture could not be read.";
  }
}

function keepOne() {
  if (one.value && one.value.name.trim() !== "" && !saving) emit("save", [{ ...one.value, name: one.value.name.trim() }]);
}

async function make() {
  if (!lengthOk.value || !canPay.value || described.busy.value) return;
  message.value = "";
  const tips = await described.describe(description.value, campaignId);
  if (!tips) return;
  four.value = tips;
  tips.forEach((t, i) => (kept[i] = t.ok));
  step.value = "pick";
}

function keepDescribed() {
  const items: NewTip[] = [];
  four.value.forEach((t, i) => {
    if (t.ok && kept[i]) items.push({ tip: t.tip, name: describedName(trimmed.value, i + 1), source: "described" });
  });
  if (items.length > 0 && !saving) emit("save", items);
}
</script>
