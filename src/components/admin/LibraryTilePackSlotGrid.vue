<template>
  <div class="space-y-4">
    <section v-for="group in groups" :key="group.category" class="space-y-1.5">
      <div class="flex items-baseline justify-between gap-2">
        <p class="text-eyebrow text-muted-foreground">{{ group.label }}</p>
        <p
          class="text-caption-sm"
          :class="group.drawn === group.slots.length ? 'text-tone-success' : 'text-muted-foreground'"
        >
          {{ group.drawn }}/{{ group.slots.length }}
        </p>
      </div>

      <div class="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        <div
          v-for="entry in group.slots"
          :key="entry.id"
          class="relative aspect-square overflow-hidden rounded border bg-background/60"
          :class="entry.drawn
            ? 'border-border'
            : entry.required
              ? 'border-dashed border-tone-caution/50'
              : 'border-dashed border-border'"
          :title="titleFor(entry)"
        >
          <img
            v-if="entry.drawn"
            :src="tileUrl(entry)"
            :alt="`${entry.id} tile`"
            loading="lazy"
            class="h-full w-full object-contain [image-rendering:pixelated]"
          />
          <span
            v-else
            class="flex h-full w-full items-center justify-center text-caption-sm text-muted-foreground/70"
          >{{ entry.slot.side ?? entry.slot.variant }}</span>

          <!-- Always present, never hover-only: an affordance that appears on
               hover does not exist on a touch device, and these are the only
               controls that put art into a pack. They sit on their own scrim so
               they stay legible over a tile of any colour. -->
          <div class="absolute bottom-0.5 right-0.5 flex rounded bg-background/75">
            <AppButton
              variant="ghost"
              size="icon-2xs"
              :icon="IconGenerate"
              :aria-label="`${entry.drawn ? 'Regenerate' : 'Generate'} ${entry.id}`"
              :tooltip="regenerateTooltip(entry)"
              :disabled="busy"
              @click="regenerate(entry)"
            />
            <AppButton
              variant="ghost"
              size="icon-2xs"
              :icon="IconUpload"
              :aria-label="`Upload art for ${entry.id}`"
              :disabled="busy"
              @click="pickFileFor(entry)"
            />
          </div>

          <span
            v-if="uploadingSlotId === entry.id || generatingSlotId === entry.id"
            class="absolute inset-0 flex items-center justify-center bg-background/80"
          >
            <IconLoading class="h-4 w-4 animate-spin text-primary" />
          </span>
        </div>
      </div>
    </section>

    <!-- One input for the whole grid: a picker per cell would mean ~60 inputs
         mounted to serve one click. `pendingSlot` remembers which cell opened
         it. -->
    <input ref="fileInput" type="file" accept="image/webp" class="hidden" @change="onFileChosen" />
  </div>
</template>

<script setup lang="ts">
/**
 * #900 S4 — every slot a library pack is answerable for, and the two ways to
 * put art into one: regenerate it, or upload a human-drawn tile.
 *
 * Per-slot regeneration is here rather than beside the editor's bulk
 * "Generate N tiles" button because the two answer different questions. The
 * bulk button fills *gaps*, so it disappears the moment a pack is complete —
 * and a complete pack is exactly when one tile turns out wrong. Reference
 * geometry and prompt wording both improved after `celestial-observatory` was
 * generated, and correcting its four doors meant either redrawing them by hand
 * or regenerating all 29 tiles.
 *
 * The cells are deliberately uniform whether or not they hold art: a pack is
 * authored by filling gaps, so "what is still blank" is the question this grid
 * exists to answer, and a grid showing only what already exists would answer
 * the opposite one. Required-but-undrawn cells carry the caution border —
 * those are the ones blocking publication.
 *
 * Upload goes through `uploadTile` → the `upload_library_tile` edge action.
 * It cannot go to storage directly: `library-tile-packs` is declared
 * `clientWrites: false` in `_shared/storage-policy.ts`, so no browser holds a
 * write path to this bucket at all.
 */
import { computed, ref, useTemplateRef } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconGenerate, IconLoading, IconUpload } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { useConfirm } from "@/composables/useConfirm";
import {
  describeLibraryPackError,
  libraryTileUrl,
  useLibraryTilePacks,
} from "@/composables/cartographer/useLibraryTilePacks";
import { useTilePacks } from "@/composables/cartographer/useTilePacks";
import { packCoverage, type SlotCoverage } from "@/cartographer/packCoverage";
import { categoryLabel } from "@/cartographer/packSchema";
import { rotationFor } from "@/cartographer/authoringPlan";
import type { LibraryTilePack } from "@/cartographer/userPack.types";

const props = defineProps<{ pack: LibraryTilePack }>();

const { uploadTile, generateMissing } = useLibraryTilePacks();
const { runUntilPause } = useTilePacks();
const toast = useToast();
const { confirm } = useConfirm();

const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
const pendingSlot = ref<SlotCoverage | null>(null);
const uploadingSlotId = ref<string | null>(null);
const generatingSlotId = ref<string | null>(null);

/**
 * One write at a time across the whole grid.
 *
 * Not per-cell: `generate_library_pack` refuses a second run while one is
 * active (`generation_already_running`), so a grid that let two cells be
 * clicked would spend the second click on an error toast. Disabling every
 * button says that up front.
 */
const busy = computed(() => uploadingSlotId.value !== null || generatingSlotId.value !== null);

const coverage = computed(() => packCoverage(props.pack.manifest));

const groups = computed(() => {
  const byCategory = new Map<string, SlotCoverage[]>();
  for (const entry of coverage.value) {
    const slots = byCategory.get(entry.slot.category) ?? [];
    slots.push(entry);
    byCategory.set(entry.slot.category, slots);
  }
  return [...byCategory].map(([category, slots]) => ({
    category,
    label: categoryLabel(category),
    slots,
    drawn: slots.filter((slot) => slot.drawn).length,
  }));
});

function tileUrl(entry: SlotCoverage): string {
  return libraryTileUrl(props.pack, { url: entry.relativePath, ...(entry.rev !== undefined ? { rev: entry.rev } : {}) });
}

function titleFor(entry: SlotCoverage): string {
  const state = entry.drawn ? "drawn — upload to replace" : "empty";
  return `${entry.id}${entry.required ? " (required)" : ""} — ${state}`;
}

function pickFileFor(entry: SlotCoverage): void {
  pendingSlot.value = entry;
  fileInput.value?.click();
}

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  const entry = pendingSlot.value;
  // Cleared immediately so choosing the same file twice in a row still fires a
  // change event — otherwise a failed upload cannot be retried with the file
  // that failed, which is the one the admin is most likely to pick again.
  input.value = "";
  pendingSlot.value = null;
  if (!file || !entry) return;

  uploadingSlotId.value = entry.id;
  try {
    await uploadTile.mutateAsync({ packRowId: props.pack.id, slot: entry.slot, file });
    toast.success(`Uploaded ${entry.id}.`);
  } catch (caught) {
    toast.error(describeLibraryPackError(caught));
  } finally {
    uploadingSlotId.value = null;
  }
}

/**
 * The slot a regeneration actually renders, which is not always the one clicked.
 *
 * A vertical wall or door is its horizontal twin turned a quarter — the plan
 * never makes a job for one (`createGenerationPlan` collapses it onto the
 * source) and `runJob` derives it from the result. So asking for
 * `doorClosedV:0` renders `doorClosedH:0` and writes both, and the tooltip has
 * to say so: an admin who regenerates the vertical door three times running,
 * wondering why the horizontal one keeps changing too, is the confusion this
 * one line prevents.
 */
function renderedSlotFor(entry: SlotCoverage): string {
  return rotationFor(entry.id)?.from ?? entry.id;
}

function regenerateTooltip(entry: SlotCoverage): string {
  const rendered = renderedSlotFor(entry);
  const verb = entry.drawn ? "Regenerate" : "Generate";
  return rendered === entry.id
    ? `${verb} this tile`
    : `${verb} ${rendered} — this tile is that one turned, so both are rewritten`;
}

/**
 * Regenerate one slot, and drive its run to completion here.
 *
 * A single-slot run carries no proof phase — `initialGenerationStatus` opens
 * it straight in `generating` whenever the plan holds none of the three proof
 * slots — so there is nothing for the run card to gate on and no reason to
 * make the admin find a second button. Where the plan *does* include a proof
 * slot (regenerating the floor, the horizontal wall or the solid block, which
 * is how you re-style a whole pack), the run opens in `proof_pending`,
 * `runUntilPause` renders the proof and stops at `awaiting_approval` — and the
 * pack's run card, which is already on screen above this grid, is where the
 * approval lives. Both paths therefore end somewhere the admin can see.
 */
async function regenerate(entry: SlotCoverage): Promise<void> {
  // Only for a published pack. A draft is work in progress and re-rolling a
  // tile is the work; a published pack's tiles are live content for every DM,
  // and the old bytes are not recoverable once overwritten.
  if (entry.drawn && props.pack.status === "published") {
    const accepted = await confirm(
      `Replace the art in ${entry.id}? "${props.pack.name}" is published, so this changes what every DM sees, and the current tile cannot be recovered.`,
      { title: "Regenerate a published tile?", confirmLabel: "Regenerate" },
    );
    if (!accepted) return;
  }

  generatingSlotId.value = entry.id;
  try {
    const run = await generateMissing.mutateAsync({ packRowId: props.pack.id, slotIds: [entry.id] });
    await runUntilPause(run.run_id);
    toast.success(
      run.status === "proof_pending"
        ? `${renderedSlotFor(entry)} regenerated — approve the style to keep it.`
        : `Regenerated ${renderedSlotFor(entry)}.`,
    );
  } catch (caught) {
    toast.error(describeLibraryPackError(caught));
  } finally {
    generatingSlotId.value = null;
  }
}
</script>
