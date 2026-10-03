<template>
  <AppModal :open="open" size="xl" panel-class="max-h-[92vh]" label="Review focal point" @close="emit('close')">
    <ModalHeader
      title="Check the crop"
      :subtitle="position"
      closeable
      @close="emit('close')"
    />
    <div
      v-if="entry"
      class="grid gap-6 overflow-y-auto p-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
    >
      <!-- Clicking the picture sets the point, saves it, stamps it checked and
           moves on: the fast path the whole queue is built around. -->
      <FocalPointPicker
        :src="entry.imageUrl"
        image-class="max-h-[70vh]"
        :clearable="false"
        :model-value="draft"
        @update:model-value="onPick"
      />

      <div class="flex min-w-0 flex-col gap-5">
        <div>
          <h3 class="text-heading-sm font-bold text-foreground">
            {{ entryLabel(entry) }}
          </h3>
          <p v-if="entry.names.length > 1" class="mt-0.5 text-caption text-muted-foreground">
            Also shown as {{ entry.names.slice(1).join(", ") }}
          </p>
          <p class="mt-0.5 text-caption text-muted-foreground italic">
            {{ entry.keys.length }} {{ entry.keys.length === 1 ? "entry shares" : "entries share" }} this picture.
            {{ isChecked(entry) ? "Already checked." : "Not checked yet." }}
          </p>
        </div>

        <!-- The same crops the app draws, driven by the live draft point. -->
        <div class="flex flex-wrap items-end gap-4">
          <figure class="w-full max-w-xs space-y-1">
            <div class="relative h-36 overflow-hidden rounded bg-muted">
              <FocalImage :src="entry.imageUrl" format="landscape" :focal-point="draft" />
            </div>
            <figcaption class="text-caption text-muted-foreground">Grid card</figcaption>
          </figure>
          <figure class="w-24 space-y-1">
            <div class="relative aspect-2/3 w-full overflow-hidden rounded bg-muted">
              <FocalImage :src="entry.imageUrl" format="portrait" :focal-point="draft" />
            </div>
            <figcaption class="text-caption text-muted-foreground">Sheet</figcaption>
          </figure>
          <figure class="w-28 space-y-1">
            <div class="relative aspect-4/5 w-full overflow-hidden rounded bg-muted">
              <FocalImage :src="entry.imageUrl" format="portrait" :focal-point="draft" />
            </div>
            <figcaption class="text-caption text-muted-foreground">Mobile card</figcaption>
          </figure>
        </div>

        <p v-if="saveError" role="alert" class="text-body text-destructive">
          Could not save: {{ saveError }}
        </p>

        <div class="mt-auto space-y-2">
          <div class="flex flex-wrap gap-2">
            <AppButton variant="subtle" :disabled="!hasPrevious || busy" label="Back (Left)" @click="goBack" />
            <AppButton variant="subtle" :disabled="busy" label="Skip (Right or S)" @click="skip" />
            <AppButton variant="primary" :loading="accepting" :disabled="busy" label="Accept (Enter)" @click="accept" />
          </div>
          <p class="text-caption text-muted-foreground italic">
            Accept keeps the current point. Click the picture to choose a better one.
          </p>
        </div>
      </div>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * The full-size review of one picture (#965): big click-to-set picker beside the
 * crops users actually see.
 *
 * It walks `order`, a snapshot of the picture urls taken when it opened. Saving
 * checks a picture, and under the "Unchecked" filter the live list would then
 * drop it and shift every index; walking a snapshot and resolving each url
 * against the live entries keeps "next" meaning what the admin saw.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import FocalPointPicker from "@/components/common/FocalPointPicker.vue";
import { useHotkeys } from "@/composables/useHotkeys";
import { useLibraryFocalQueue } from "@/composables/library/useLibraryFocalQueue";
import {
  entryLabel,
  isChecked,
  nextMatchingIndex,
  type FocalKind,
  type FocalPointValue,
  type FocalQueueEntry,
  type FocalStatus,
} from "@/lib/library/focalQueue";

const { open, kind, order, startUrl, status } = defineProps<{
  open: boolean;
  kind: FocalKind;
  /** Picture urls in walking order, frozen when the viewer was opened. */
  order: string[];
  startUrl: string | null;
  status: FocalStatus;
}>();
const emit = defineEmits<{ close: [] }>();

const { entries, setFocalPoint, acceptFocalPoint } = useLibraryFocalQueue(() => kind);

const currentUrl = ref<string | null>(startUrl);
watch(
  () => [open, startUrl] as const,
  ([isOpen, url]) => {
    if (isOpen) currentUrl.value = url;
  },
  { immediate: true },
);

const ordered = computed<FocalQueueEntry[]>(() => {
  const byUrl = new Map(entries.value.map((row) => [row.imageUrl, row]));
  return order.flatMap((url) => {
    const row = byUrl.get(url);
    return row ? [row] : [];
  });
});
const index = computed(() => ordered.value.findIndex((row) => row.imageUrl === currentUrl.value));
const entry = computed<FocalQueueEntry | null>(() => (index.value < 0 ? null : (ordered.value[index.value] ?? null)));
const hasPrevious = computed(() => index.value > 0);
const position = computed(() => `${index.value + 1} of ${ordered.value.length}`);

// The point as just clicked, so the previews move before the save returns.
const draft = ref<FocalPointValue | null>(null);
const saveError = ref<string | null>(null);
watch(
  () => entry.value?.imageUrl,
  () => {
    draft.value = entry.value ? entry.value.focalPoint : null;
    saveError.value = null;
  },
  { immediate: true },
);

const saving = computed(() => setFocalPoint.isPending.value);
const accepting = computed(() => acceptFocalPoint.isPending.value);
const busy = computed(() => saving.value || accepting.value);

function advance() {
  const next = nextMatchingIndex(ordered.value, index.value, status);
  if (next < 0) {
    // Nothing left in this pass: the queue is done, so leave rather than idle on the last picture.
    emit("close");
    return;
  }
  const target = ordered.value[next];
  if (target) currentUrl.value = target.imageUrl;
}

function skip() {
  if (busy.value) return;
  advance();
}

function goBack() {
  if (busy.value || !hasPrevious.value) return;
  const target = ordered.value[index.value - 1];
  if (target) currentUrl.value = target.imageUrl;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function accept() {
  const current = entry.value;
  if (!current || busy.value) return;
  saveError.value = null;
  try {
    await acceptFocalPoint.mutateAsync({ entry: current });
    advance();
  } catch (error) {
    saveError.value = message(error);
  }
}

async function onPick(point: FocalPointValue | null) {
  const current = entry.value;
  // The picker's own "clear" yields null; the queue only ever sets a point.
  if (!current || !point || busy.value) return;
  draft.value = point;
  saveError.value = null;
  try {
    await setFocalPoint.mutateAsync({ entry: current, point });
    advance();
  } catch (error) {
    saveError.value = message(error);
  }
}

// preventDefault on Enter: a focused button would otherwise also click itself.
// Escape is AppModal's own overlay binding.
useHotkeys(
  () => [
    { combo: "enter", description: "Accept this focal point", handler: (e) => { e.preventDefault(); void accept(); } },
    { combo: "arrowright", description: "Skip to the next picture", handler: skip },
    { combo: "s", description: "Skip to the next picture", handler: skip, hidden: true },
    { combo: "arrowleft", description: "Back to the previous picture", handler: goBack },
  ],
  { layer: "overlay", enabled: () => open },
);
</script>
