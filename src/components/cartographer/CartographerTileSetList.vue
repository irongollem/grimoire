<template>
  <!-- The tile-set flyout: one square per set, each showing the set's own floor tile, the
       active one ringed, the name on hover and focus. A swatch grid rather than a list because
       the sets are chosen by how they look; the detail a list would repeat per row is said once
       at the foot. Arrow keys move between squares. -->
  <div class="space-y-2" role="group" aria-label="Tile sets" @keydown="onKeydown">
    <div class="grid grid-cols-4 gap-1.5" @pointerleave="hovered = null" @focusout="hovered = null">
      <AppButton
        v-for="p in packs"
        :key="p.pack_id"
        variant="ghost"
        size="icon-sm"
        class="rounded-md p-1"
        :class="currentPackId === p.pack_id ? 'ring-2 ring-primary' : ''"
        :aria-label="p.name"
        :aria-pressed="currentPackId === p.pack_id"
        @pointerenter="hovered = p.pack_id"
        @focus="hovered = p.pack_id"
        @click="emit('select', p.pack_id)"
      >
        <CartographerPackSwatch v-if="runtimes.get(p.pack_id)" :runtime="runtimes.get(p.pack_id) ?? null" size="lg" />
        <BannerLoader v-else class="h-3" />
      </AppButton>
    </div>
    <p class="min-h-4 truncate text-caption text-foreground" aria-live="polite">{{ hoveredName }}</p>
    <p v-if="validationMissing > 0" class="text-caption-sm text-ink-caution">
      {{ validationMissing }} slot(s) missing in the active set. Using placeholders.
    </p>
    <p class="text-caption-sm text-muted-foreground italic">Changes future strokes only. Existing cells keep their set.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CartographerPackSwatch from "@/components/cartographer/CartographerPackSwatch.vue";
import type { TilePackRuntime } from "@/cartographer/packLoader";

export interface TileSetChoice {
  pack_id: string;
  pack_version: number;
  name: string;
}

const { packs } = defineProps<{
  packs: readonly TileSetChoice[];
  currentPackId: string;
  /** The runtimes loaded so far, by pack id; a set not in it is still loading. */
  runtimes: ReadonlyMap<string, TilePackRuntime>;
  validationMissing: number;
}>();

const emit = defineEmits<{ select: [packId: string] }>();

// The name shows only here, with the sets open to choose from; the swatches themselves stay unlabelled.
const hovered = ref<string | null>(null);
const hoveredName = computed(() => packs.find((p) => p.pack_id === hovered.value)?.name ?? "");

const KEY_STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 4, ArrowLeft: -1, ArrowUp: -4 };
function onKeydown(e: KeyboardEvent): void {
  const step = KEY_STEP[e.key];
  if (step === undefined) return;
  const squares = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>("button")];
  const at = squares.indexOf(document.activeElement as HTMLButtonElement);
  const next = squares[at + step];
  if (!next) return;
  e.preventDefault();
  next.focus();
}
</script>
