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
               hover does not exist on a touch device, and this is the single
               control that puts art into a pack. It sits on its own scrim so
               it stays legible over a tile of any colour. -->
          <div class="absolute bottom-0.5 right-0.5 rounded bg-background/75">
            <AppButton
              variant="ghost"
              size="icon-2xs"
              :icon="IconUpload"
              :aria-label="`Upload art for ${entry.id}`"
              :disabled="uploadingSlotId !== null"
              @click="pickFileFor(entry)"
            />
          </div>

          <span
            v-if="uploadingSlotId === entry.id"
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
 * #900 S4 — every slot a library pack is answerable for, and the only way to
 * put a human-drawn tile into one.
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
import { IconLoading, IconUpload } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { getPublicUrl } from "@/lib/storage";
import {
  describeLibraryPackError,
  libraryPackObjectPath,
  useLibraryTilePacks,
} from "@/composables/cartographer/useLibraryTilePacks";
import { packCoverage, type SlotCoverage } from "@/cartographer/packCoverage";
import { categoryLabel } from "@/cartographer/packSchema";
import type { LibraryTilePack } from "@/cartographer/userPack.types";

const props = defineProps<{ pack: LibraryTilePack }>();

const { uploadTile } = useLibraryTilePacks();
const toast = useToast();

const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
const pendingSlot = ref<SlotCoverage | null>(null);
const uploadingSlotId = ref<string | null>(null);

/**
 * Cache-busting stamps for tiles replaced in this session.
 *
 * A replaced tile lands at the *same* CDN path as the one it replaced — the
 * path is derived from the slot's identity, not its contents — so both the
 * browser and the CDN Worker will happily keep serving the old bytes, and the
 * upload will look like it silently failed. `byteSize` is not a sufficient
 * discriminator either: two different 128×128 WebPs can encode to the same
 * length. A stamp taken at upload time always differs.
 */
const bustedAt = ref<Record<string, number>>({});

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
  const base = getPublicUrl("libraryTilePacks", libraryPackObjectPath(props.pack, entry.relativePath));
  const stamp = bustedAt.value[entry.id];
  return stamp ? `${base}?t=${stamp}` : `${base}?v=${props.pack.pack_version}`;
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
    bustedAt.value = { ...bustedAt.value, [entry.id]: Date.now() };
    toast.success(`Uploaded ${entry.id}.`);
  } catch (caught) {
    toast.error(describeLibraryPackError(caught));
  } finally {
    uploadingSlotId.value = null;
  }
}
</script>
