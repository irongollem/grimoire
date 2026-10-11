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
        v-if="entry.imageUrl"
        :src="entry.imageUrl"
        image-class="max-h-[70vh]"
        :clearable="false"
        :model-value="draft"
        @update:model-value="onPick"
      />
      <div
        v-else
        class="flex min-h-48 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 p-6 text-center text-body text-muted-foreground italic"
      >
        {{ entryLabel(entry) }} has no picture yet.
      </div>

      <div class="flex min-w-0 flex-col gap-5">
        <div>
          <h3 class="text-heading-sm font-bold text-foreground">
            {{ entryLabel(entry) }}
          </h3>
          <p v-if="entry.names.length > 1" class="mt-0.5 text-caption text-muted-foreground">
            Also shown as {{ entry.names.slice(1).join(", ") }}
          </p>
          <p class="mt-0.5 text-caption text-muted-foreground italic">
            {{ entry.keys.length }} {{ entry.keys.length === 1 ? "entry shares" : "entries share" }} this {{ named ? "name" : "picture" }}.
            {{ isChecked(entry) ? "Already checked." : "Not checked yet." }}
          </p>
        </div>

        <!-- The same crops the app draws, driven by the live draft point. -->
        <div v-if="entry.imageUrl" class="flex flex-wrap items-end gap-4">
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

        <LibraryFocalReplacePicture
          v-if="named"
          ref="replacer"
          :has-picture="entry.imageUrl !== null"
          :busy="replacing"
          :disabled="busy"
          @chosen="onReplace"
        />

        <p v-if="saveError" role="alert" class="text-body text-destructive">
          Could not save: {{ saveError }}
        </p>

        <div class="mt-auto space-y-2">
          <div class="flex flex-wrap gap-2">
            <AppButton variant="subtle" :disabled="!hasPrevious || busy" label="Back (Left)" @click="goBack" />
            <AppButton variant="subtle" :disabled="busy" label="Skip (Right or S)" @click="skip" />
            <AppButton variant="primary" :loading="accepting" :disabled="busy || !entry.imageUrl" label="Accept (Enter)" @click="accept" />
          </div>
          <p class="text-caption text-muted-foreground italic">
            Accept keeps the current point. Click the picture to choose a better one.
            <template v-if="named">Replacing the picture clears the point.</template>
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
 * It walks `order`, a snapshot of the entry ids taken when it opened. Saving
 * checks a picture, and under the "Unchecked" filter the live list would then
 * drop it and shift every index; walking a snapshot and resolving each id
 * against the live entries keeps "next" meaning what the admin saw.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import FocalPointPicker from "@/components/common/media/FocalPointPicker.vue";
import LibraryFocalReplacePicture from "@/components/admin/LibraryFocalReplacePicture.vue";
import { useHotkeys } from "@/composables/useHotkeys";
import { useLibraryFocalQueue } from "@/composables/library/useLibraryFocalQueue";
import {
  entryLabel,
  isChecked,
  isNamedKind,
  nextMatchingIndex,
  type FocalKind,
  type FocalPointValue,
  type FocalQueueEntry,
  type FocalStatus,
} from "@/lib/library/focalQueue";

const { open, kind, order, startId, status } = defineProps<{
  open: boolean;
  kind: FocalKind;
  /** Entry ids in walking order, frozen when the viewer was opened. */
  order: string[];
  startId: string | null;
  status: FocalStatus;
}>();
const emit = defineEmits<{ close: [] }>();

const { entries, setFocalPoint, acceptFocalPoint, replacePicture } = useLibraryFocalQueue(() => kind);
const named = computed(() => isNamedKind(kind));
const replacer = ref<InstanceType<typeof LibraryFocalReplacePicture> | null>(null);

const currentId = ref<string | null>(startId);
watch(
  () => [open, startId] as const,
  ([isOpen, url]) => {
    if (isOpen) currentId.value = url;
  },
  { immediate: true },
);

const ordered = computed<FocalQueueEntry[]>(() => {
  const byId = new Map(entries.value.map((row) => [row.id, row]));
  return order.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
});
const index = computed(() => ordered.value.findIndex((row) => row.id === currentId.value));
const entry = computed<FocalQueueEntry | null>(() => (index.value < 0 ? null : (ordered.value[index.value] ?? null)));
const hasPrevious = computed(() => index.value > 0);
const position = computed(() => `${index.value + 1} of ${ordered.value.length}`);

// The point as just clicked, so the previews move before the save returns.
const draft = ref<FocalPointValue | null>(null);
const saveError = ref<string | null>(null);
watch(
  // The id, not the picture: a replaced picture keeps its entry and its cleared draft.
  () => [entry.value?.id, entry.value?.imageUrl] as const,
  () => {
    draft.value = entry.value ? entry.value.focalPoint : null;
    saveError.value = null;
  },
  { immediate: true },
);

const saving = computed(() => setFocalPoint.isPending.value);
const accepting = computed(() => acceptFocalPoint.isPending.value);
const replacing = computed(() => replacePicture.isPending.value);
const busy = computed(() => saving.value || accepting.value || replacing.value);

function advance() {
  const next = nextMatchingIndex(ordered.value, index.value, status);
  if (next < 0) {
    // Nothing left in this pass: the queue is done, so leave rather than idle on the last picture.
    emit("close");
    return;
  }
  const target = ordered.value[next];
  if (target) currentId.value = target.id;
}

function skip() {
  if (busy.value) return;
  advance();
}

function goBack() {
  if (busy.value || !hasPrevious.value) return;
  const target = ordered.value[index.value - 1];
  if (target) currentId.value = target.id;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function onReplace(file: File) {
  const current = entry.value;
  if (!current || busy.value) return;
  try {
    await replacePicture.mutateAsync({ entry: current, file });
  } catch (error) {
    replacer.value?.setError(message(error));
  }
}

async function accept() {
  const current = entry.value;
  if (!current || busy.value || !current.imageUrl) return;
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
  if (!current || !current.imageUrl || !point || busy.value) return;
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
